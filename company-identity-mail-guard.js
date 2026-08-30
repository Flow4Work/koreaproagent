(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const IDS_KEY = 'kpa.mail.review.ids';
  const DRAFT_KEYS = ['kpa.mail.review.drafts.v5', 'kpa.mail.review.drafts.v4'];
  const VERSION = '20260830-company-identity-v3';
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

  function officialEmailSet(identity = {}) {
    return new Set((Array.isArray(identity?.official_emails) ? identity.official_emails : [])
      .map(item => clean(typeof item === 'string' ? item : item?.email, 240).toLowerCase())
      .filter(Boolean));
  }

  function strictlySendable(contact = {}, identity = {}) {
    const email = clean(contact?.email, 240).toLowerCase();
    if (!email || identity?.identity_version !== VERSION || identity?.status !== 'verified') return false;

    // Strongest evidence: the exact address appears on the verified official site,
    // even if the mail domain differs from the website domain.
    if (officialEmailSet(identity).has(email)) return true;

    const status = statusOf(contact);
    const officialDomain = rootDomain(identity.domain);
    const emailDomain = rootDomain(email);
    if (officialDomain && emailDomain === officialDomain && status === 'valid') return true;

    // Explicit cross-domain exceptions require both a deliberate trust flag and evidence.
    const explicitlyTrusted = contact?.trustedCrossDomain === true;
    const explicitlyVerified = contact?.verifiedOverride === true || contact?.verified_override === true;
    return explicitlyTrusted && explicitlyVerified && sourceUrls(contact).length > 0 && status !== 'invalid';
  }

  function allowedContacts(lead = {}) {
    const identity = lead.company_identity || {};
    const rows = [
      lead.contact,
      ...(Array.isArray(lead.contacts) ? lead.contacts : []),
      ...(Array.isArray(lead.contact_candidates) ? lead.contact_candidates : [])
    ].filter(Boolean);
    const map = new Map();
    for (const contact of rows) {
      const email = clean(contact?.email, 240).toLowerCase();
      if (!email || map.has(email) || !strictlySendable(contact, identity)) continue;
      map.set(email, { ...contact, send_allowed: true });
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
      const sendable = isVerified ? allowedContacts(lead) : [];

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
        if (JSON.stringify(lead.contacts || []) !== JSON.stringify(sendable)) {
          lead.contacts = sendable;
          lead.contact = sendable.find(contact => contact.qualified) || sendable[0] || null;
          leadsChanged = true;
        }

        for (const drafts of Object.values(draftsByKey)) {
          const draft = drafts?.[lead.id];
          if (!draft) continue;
          if (rewriteDraftGreeting(draft, greeting)) draftsChanged = true;

          const allowedEmails = new Set(sendable.map(contact => clean(contact.email, 240).toLowerCase()));
          const currentSelected = Array.isArray(draft.selectedEmails)
            ? draft.selectedEmails.map(email => clean(email, 240).toLowerCase()).filter(Boolean)
            : [];
          const retained = currentSelected.filter(email => allowedEmails.has(email));
          const nextSelected = retained.length ? retained : [...allowedEmails].slice(0, 4);
          if (JSON.stringify(currentSelected) !== JSON.stringify(nextSelected)) {
            draft.selectedEmails = nextSelected;
            draft.to = nextSelected.join(', ');
            draftsChanged = true;
          }

          if (draft.identityAutoExcluded === true && sendable.length) {
            draft.included = true;
            delete draft.identityAutoExcluded;
            draftsChanged = true;
          }
          if (!sendable.length && draft.identityAutoExcluded !== true) {
            draft.identityAutoExcluded = true;
            draft.included = false;
            draftsChanged = true;
          }
        }
      } else {
        if (!lead.identity_ui_blocked) {
          lead.identity_ui_blocked = true;
          leadsChanged = true;
        }
        for (const drafts of Object.values(draftsByKey)) {
          const draft = drafts?.[lead.id] || (drafts[lead.id] = {});
          if (draft.identityAutoExcluded !== true || draft.included !== false) {
            draft.identityAutoExcluded = true;
            draft.included = false;
            draftsChanged = true;
          }
        }
      }
    }

    if (leadsChanged) save(LEADS_KEY, leads);
    if (draftsChanged) {
      for (const [key, drafts] of Object.entries(draftsByKey)) save(key, drafts);
    }
  }

  // Second fail-closed layer: manual edits in the To field cannot bypass the strict evidence rule.
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
        alert(`발송 중지: ${clean(lead.raw_company || lead.company, 100)}의 공식 브랜드명이 검증되지 않았습니다.`);
        return;
      }
      const selected = Array.isArray(draft.selectedEmails)
        ? draft.selectedEmails
        : String(draft.to || '').split(/[\s,;]+/).filter(Boolean);
      const candidates = [lead.contact, ...(lead.contacts || []), ...(lead.contact_candidates || [])].filter(Boolean);
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
