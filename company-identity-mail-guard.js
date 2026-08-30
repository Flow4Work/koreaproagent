(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const IDS_KEY = 'kpa.mail.review.ids';
  const DRAFT_KEYS = ['kpa.mail.review.drafts.v5', 'kpa.mail.review.drafts.v4'];
  const VERSION = '20260830-company-identity-v4';
  const MULTI_SUFFIXES = new Set([
    'ac.kr','co.kr','go.kr','ne.kr','or.kr','re.kr','pe.kr','ac.uk','co.uk','gov.uk','ltd.uk','me.uk','net.uk','nhs.uk','org.uk','plc.uk','sch.uk',
    'asn.au','com.au','edu.au','gov.au','id.au','net.au','org.au','ac.jp','co.jp','go.jp','ne.jp','or.jp','com.br','com.cn','com.hk','com.mx','com.sg',
    'com.tr','com.tw','com.vn','co.id','co.in','co.nz','co.th','co.za','net.cn','net.in','org.cn','org.in'
  ]);

  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const clean = (value = '', max = 500) => String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

  function rootDomain(value = '') {
    let raw = clean(value, 500).toLowerCase();
    if (!raw) return '';
    if (raw.includes('@') && !raw.includes('://')) raw = raw.split('@').pop() || '';
    try { raw = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname; }
    catch { raw = raw.replace(/^https?:\/\//, '').split('/')[0].split(':')[0]; }
    raw = raw.replace(/^www\./, '').replace(/\.+$/, '');
    const parts = raw.split('.').filter(Boolean);
    if (parts.length <= 2) return raw;
    const suffix2 = parts.slice(-2).join('.');
    return parts.slice(-(MULTI_SUFFIXES.has(suffix2) ? 3 : 2)).join('.');
  }

  function verified(lead = {}) {
    const identity = lead.company_identity || {};
    return identity.identity_version === VERSION
      && identity.status === 'verified'
      && Number(identity.confidence || 0) >= 0.85
      && Boolean(clean(identity.greeting_name, 120))
      && /^https?:\/\//i.test(clean(identity.evidence_url, 600));
  }

  function statusOf(contact = {}) {
    const raw = clean(contact?.emailStatus || contact?.confidence || contact?.verification?.status || contact?.status, 80)
      .toLowerCase().replace(/[\s-]+/g, '_');
    if (['verified','valid','deliverable','safe'].includes(raw)) return 'valid';
    if (raw.includes('accept')) return 'accept_all';
    if (['invalid','undeliverable','disposable','webmail'].includes(raw)) return 'invalid';
    return 'unknown';
  }

  function sourceUrls(contact = {}) {
    return [...new Set((Array.isArray(contact?.sources) ? contact.sources : [])
      .map(source => typeof source === 'string' ? source : source?.uri || source?.url || '')
      .map(value => clean(value, 600)).filter(Boolean))];
  }

  function providers(contact = {}) {
    return [...new Set([
      ...(Array.isArray(contact?.providers) ? contact.providers : []),
      ...String(contact?.provider || '').split('+')
    ].map(value => clean(value, 80).toLowerCase()).filter(Boolean))];
  }

  function officialEmailSet(identity = {}) {
    return new Set((Array.isArray(identity?.official_emails) ? identity.official_emails : [])
      .map(item => clean(typeof item === 'string' ? item : item?.email, 240).toLowerCase())
      .filter(Boolean));
  }

  function strictlySendable(contact = {}, identity = {}) {
    const email = clean(contact?.email, 240).toLowerCase();
    if (!email || identity?.identity_version !== VERSION || identity?.status !== 'verified') return false;

    if (officialEmailSet(identity).has(email)) return true;

    const status = statusOf(contact);
    const officialDomain = rootDomain(identity.domain);
    const emailDomain = rootDomain(email);
    const hasEvidence = sourceUrls(contact).length > 0;
    const providerList = providers(contact);

    // Same-company-domain contacts remain sendable when a provider/evidence already qualified them.
    // This keeps broad email discovery intact while still rejecting known-invalid addresses.
    if (officialDomain && emailDomain === officialDomain && status !== 'invalid') {
      return status === 'valid' || contact?.qualified === true || hasEvidence || providerList.includes('hunter');
    }

    // Different mail domains require explicit company linkage from a verified source.
    const explicitlyTrusted = contact?.trustedCrossDomain === true;
    const explicitlyVerified = contact?.verifiedOverride === true || contact?.verified_override === true;
    return explicitlyTrusted && explicitlyVerified && hasEvidence && status !== 'invalid';
  }

  function allContacts(lead = {}) {
    const rows = [
      lead.contact,
      ...(Array.isArray(lead.contacts) ? lead.contacts : []),
      ...(Array.isArray(lead.contact_candidates) ? lead.contact_candidates : [])
    ].filter(Boolean);
    const map = new Map();
    for (const contact of rows) {
      const email = clean(contact?.email, 240).toLowerCase();
      if (!email) continue;
      const current = map.get(email) || {};
      map.set(email, {
        ...current,
        ...contact,
        email,
        sources: [...new Set([...sourceUrls(current), ...sourceUrls(contact)])],
        providers: [...new Set([...providers(current), ...providers(contact)])]
      });
    }
    return [...map.values()];
  }

  function rewriteDraftGreeting(draft, greeting) {
    if (!draft || !greeting) return false;
    let changed = false;
    if (typeof draft.body === 'string') {
      const next = draft.body.replace(/^Hi[^\n]*,\s*/i, `Hi ${greeting} team,\n\n`);
      if (next !== draft.body) { draft.body = next; changed = true; }
    }
    if (typeof draft.translation === 'string') {
      const next = draft.translation.replace(/^안녕하세요[^\n]*[.!]?\s*/, `안녕하세요, ${greeting} 팀.\n\n`);
      if (next !== draft.translation) { draft.translation = next; changed = true; }
    }
    return changed;
  }

  function restoreLegacyAutoExclusion(draft) {
    if (!draft || draft.identityAutoExcluded !== true) return false;
    // v3 mistakenly converted validation state into a user selection state.
    // Restore only those automatic exclusions; manual unchecked choices remain untouched.
    draft.included = true;
    delete draft.identityAutoExcluded;
    return true;
  }

  function applyGuard() {
    const leads = load(LEADS_KEY, []);
    const ids = new Set(load(IDS_KEY, []));
    if (!Array.isArray(leads) || !ids.size) return;
    const draftsByKey = Object.fromEntries(DRAFT_KEYS.map(key => [key, load(key, {})]));
    let leadsChanged = false;
    let draftsChanged = false;

    for (const lead of leads) {
      if (!lead?.id || !ids.has(lead.id)) continue;
      const isVerified = verified(lead);
      const greeting = isVerified ? clean(lead.company_identity?.greeting_name, 120) : '';

      if (isVerified) {
        if (greeting && lead.company !== greeting) {
          lead.company = greeting;
          lead.greeting_name = greeting;
          lead.brand_name = clean(lead.company_identity?.brand_name || greeting, 160);
          leadsChanged = true;
        }
        if (lead.identity_ui_blocked) {
          delete lead.identity_ui_blocked;
          leadsChanged = true;
        }
        const candidates = allContacts(lead).map(contact => ({
          ...contact,
          send_allowed: strictlySendable(contact, lead.company_identity)
        }));
        if (JSON.stringify(lead.contact_candidates || []) !== JSON.stringify(candidates)) {
          lead.contact_candidates = candidates;
          leadsChanged = true;
        }
      } else if (!lead.identity_ui_blocked) {
        lead.identity_ui_blocked = true;
        leadsChanged = true;
      }

      for (const drafts of Object.values(draftsByKey)) {
        const draft = drafts?.[lead.id];
        if (!draft) continue;
        if (restoreLegacyAutoExclusion(draft)) draftsChanged = true;
        if (isVerified && rewriteDraftGreeting(draft, greeting)) draftsChanged = true;
      }
    }

    if (leadsChanged) save(LEADS_KEY, leads);
    if (draftsChanged) {
      for (const [key, drafts] of Object.entries(draftsByKey)) save(key, drafts);
    }
  }

  // Sending remains fail-closed, but validation must never silently change the user's include checkboxes.
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('#sendAllBtn');
    if (!button) return;
    const leads = load(LEADS_KEY, []);
    const byId = new Map((Array.isArray(leads) ? leads : []).map(lead => [lead.id, lead]));
    const ids = load(IDS_KEY, []);
    const drafts = load(DRAFT_KEYS[0], {});
    for (const id of Array.isArray(ids) ? ids : []) {
      const lead = byId.get(id);
      const draft = drafts?.[id] || {};
      if (!lead || draft.included === false) continue;
      if (!verified(lead)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        alert(`발송 중지: ${clean(lead.raw_company || lead.company, 100)}의 공식 브랜드명이 아직 검증되지 않았습니다.`);
        return;
      }
      const selected = Array.isArray(draft.selectedEmails)
        ? draft.selectedEmails
        : String(draft.to || '').split(/[\s,;]+/).filter(Boolean);
      const candidates = allContacts(lead);
      for (const email of selected) {
        const normalized = clean(email, 240).toLowerCase();
        const contact = candidates.find(row => clean(row?.email, 240).toLowerCase() === normalized) || { email: normalized };
        if (strictlySendable(contact, lead.company_identity)) continue;
        event.preventDefault();
        event.stopImmediatePropagation();
        alert(`발송 중지: ${normalized} 주소는 ${clean(lead.company, 100)}와의 검증된 연결 근거가 없습니다.`);
        return;
      }
    }
  }, true);

  globalThis.KPA_STRICT_SENDABLE_CONTACT = strictlySendable;
  applyGuard();
  document.addEventListener('kpa:company-identity-updated', () => setTimeout(applyGuard, 0));
  window.addEventListener('storage', event => {
    if (event.key === LEADS_KEY) applyGuard();
  });
  setTimeout(applyGuard, 900);
  setTimeout(applyGuard, 2500);
})();
