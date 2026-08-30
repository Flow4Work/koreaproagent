(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const DRAFT_KEYS = ['kpa.mail.review.drafts.v5', 'kpa.mail.review.drafts.v4'];
  const IDS_KEY = 'kpa.mail.review.ids';
  const VERSION = '20260830-company-identity-v4';
  let running = false;
  let rerun = false;
  const refreshInFlight = new Set();

  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const clean = (value = '', max = 500) => String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

  const MULTI_SUFFIXES = new Set([
    'ac.kr','co.kr','go.kr','ne.kr','or.kr','re.kr','pe.kr','ac.uk','co.uk','gov.uk','ltd.uk','me.uk','net.uk','nhs.uk','org.uk','plc.uk','sch.uk',
    'asn.au','com.au','edu.au','gov.au','id.au','net.au','org.au','ac.jp','co.jp','go.jp','ne.jp','or.jp','com.br','com.cn','com.hk','com.mx','com.sg',
    'com.tr','com.tw','com.vn','co.id','co.in','co.nz','co.th','co.za','net.cn','net.in','org.cn','org.in'
  ]);

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

  function identityVerified(identity = {}) {
    return identity?.identity_version === VERSION
      && identity?.status === 'verified'
      && Number(identity?.confidence || 0) >= 0.85
      && Boolean(clean(identity?.greeting_name, 120))
      && Boolean(rootDomain(identity?.domain))
      && /^https?:\/\//i.test(clean(identity?.evidence_url, 600));
  }

  function officialEmailMap(identity = {}) {
    const map = new Map();
    for (const item of Array.isArray(identity?.official_emails) ? identity.official_emails : []) {
      const email = clean(typeof item === 'string' ? item : item?.email, 240).toLowerCase();
      if (!email) continue;
      map.set(email, { email, source_url: clean(typeof item === 'string' ? '' : item?.source_url, 600) });
    }
    return map;
  }

  function statusOf(contact = {}) {
    const raw = clean(contact?.emailStatus || contact?.confidence || contact?.verification?.status || contact?.status, 80)
      .toLowerCase().replace(/[\s-]+/g, '_');
    if (['verified','valid','deliverable','safe'].includes(raw)) return 'valid';
    if (raw.includes('accept')) return 'accept_all';
    if (['invalid','undeliverable','disposable','webmail'].includes(raw)) return 'invalid';
    return 'unknown';
  }

  function contactSources(contact = {}) {
    return [...new Set((Array.isArray(contact?.sources) ? contact.sources : [])
      .map(source => typeof source === 'string' ? source : source?.uri || source?.url || '')
      .map(value => clean(value, 600)).filter(Boolean))];
  }

  function contactAllowed(contact = {}, identity = {}) {
    const email = clean(contact?.email, 240).toLowerCase();
    if (!email || !identityVerified(identity)) return false;
    const officialEmails = officialEmailMap(identity);
    if (officialEmails.has(email)) return true;

    const officialDomain = rootDomain(identity.domain);
    const emailDomain = rootDomain(email);
    const status = statusOf(contact);
    const hasEvidence = contactSources(contact).length > 0;
    const providers = [
      ...(Array.isArray(contact?.providers) ? contact.providers : []),
      ...String(contact?.provider || '').split('+')
    ].map(value => clean(value, 80).toLowerCase()).filter(Boolean);

    if (emailDomain === officialDomain && status !== 'invalid') {
      return status === 'valid' || contact?.qualified === true || hasEvidence || providers.includes('hunter');
    }

    const explicitlyTrusted = contact?.trustedCrossDomain === true;
    const explicitlyVerified = contact?.verifiedOverride === true || contact?.verified_override === true;
    return explicitlyTrusted && explicitlyVerified && hasEvidence && status !== 'invalid';
  }

  function mergeContacts(rows = []) {
    const map = new Map();
    for (const row of rows) {
      if (!row) continue;
      const email = clean(row?.email, 240).toLowerCase();
      if (!email) continue;
      const current = map.get(email) || {};
      const sources = [...new Set([...contactSources(current), ...contactSources(row)])];
      const providers = [...new Set([
        ...(Array.isArray(current.providers) ? current.providers : []),
        ...String(current.provider || '').split('+'),
        ...(Array.isArray(row.providers) ? row.providers : []),
        ...String(row.provider || '').split('+')
      ].map(value => clean(value, 80)).filter(Boolean))];
      map.set(email, {
        ...current,
        ...row,
        email,
        name: current.name || row.name || '',
        title: current.title || row.title || '',
        sources,
        providers,
        provider: providers.join('+'),
        qualified: Boolean(current.qualified || row.qualified)
      });
    }
    return [...map.values()];
  }

  function officialContacts(identity = {}) {
    return [...officialEmailMap(identity).values()].map(item => ({
      email: item.email,
      name: '',
      title: '',
      emailStatus: 'unknown',
      confidence: 'unknown',
      sources: [item.source_url || identity.evidence_url].filter(Boolean),
      providers: ['official_site'],
      provider: 'official_site',
      identity_link: 'official_site_email',
      verifiedOverride: true,
      verified_override: true,
      qualified: true
    }));
  }

  function classifyContacts(candidates = [], identity = {}) {
    const officialEmails = officialEmailMap(identity);
    const officialDomain = rootDomain(identity.domain);
    return mergeContacts(candidates).map(contact => {
      const email = clean(contact.email, 240).toLowerCase();
      const domain = rootDomain(email);
      let identityLink = 'unverified_identity_link';
      if (officialEmails.has(email)) identityLink = 'official_site_email';
      else if (domain && domain === officialDomain) identityLink = 'official_domain';
      else if (contactAllowed(contact, identity)) identityLink = 'trusted_cross_domain';
      return { ...contact, identity_link: identityLink, send_allowed: contactAllowed(contact, identity) };
    });
  }

  function updateDraftGreetings(lead, drafts) {
    const greeting = clean(lead?.greeting_name || lead?.brand_name || lead?.company, 120);
    if (!greeting) return false;
    const draft = drafts?.[lead.id];
    if (!draft || typeof draft !== 'object') return false;
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

  function applyIdentity(lead, identity, draftsByKey) {
    if (!lead || !identity) return { changed: false, shouldRefresh: false };
    const before = JSON.stringify({
      company: lead.company, domain: lead.domain, contact: lead.contact, contacts: lead.contacts,
      candidates: lead.contact_candidates, identity: lead.company_identity, greeting_name: lead.greeting_name
    });

    const previousDomain = rootDomain(lead.domain || lead.url || '');
    const previousCandidates = mergeContacts([
      ...(Array.isArray(lead.contact_candidates) ? lead.contact_candidates : []),
      lead.contact,
      ...(Array.isArray(lead.contacts) ? lead.contacts : [])
    ]);

    lead.raw_company = clean(lead.raw_company || identity.raw_name || lead.company, 220);
    lead.company_identity = { ...identity };
    lead.company_identity_version = VERSION;
    lead.identity_status = identity.status || 'needs_review';
    lead.identity_confidence = Number(identity.confidence || 0);
    lead.identity_evidence_url = clean(identity.evidence_url, 600);
    lead.identity_verified_at = clean(identity.verified_at, 80);
    lead.contact_candidates = previousCandidates;

    let shouldRefresh = false;
    if (identityVerified(identity)) {
      const officialDomain = rootDomain(identity.domain);
      const greeting = clean(identity.greeting_name, 120);
      lead.legal_name = clean(identity.legal_name, 220);
      lead.brand_name = clean(identity.brand_name || greeting, 160);
      lead.greeting_name = greeting;
      lead.company = greeting;
      lead.domain = officialDomain;
      lead.url = `https://${officialDomain}/`;
      lead.company_name_source = 'official-evidence-v4';
      lead.verified_by = 'official-site-evidence-v4';

      const allCandidates = classifyContacts([...previousCandidates, ...officialContacts(identity)], identity);
      lead.contact_candidates = allCandidates;
      const sendable = allCandidates.filter(contact => contact.send_allowed);
      lead.contacts = sendable;
      lead.contact = sendable.find(contact => contact.qualified) || sendable[0] || null;

      const domainChanged = Boolean(previousDomain && officialDomain && previousDomain !== officialDomain);
      shouldRefresh = domainChanged || !sendable.length;
      if (shouldRefresh) {
        lead.contact_status = 'needs_contact_refresh';
        lead.contact_failure_reason = domainChanged
          ? '공식 회사 도메인이 변경되어 새 도메인으로 연락처를 추가 탐색합니다.'
          : '회사 Identity는 확인됐지만 발송 가능한 연락처가 없어 추가 탐색합니다.';
      } else {
        lead.contact_status = lead.contact ? 'qualified' : lead.contact_status;
        if (lead.contact) lead.contact_failure_reason = null;
      }

      for (const drafts of Object.values(draftsByKey)) updateDraftGreetings(lead, drafts);
    } else {
      lead.company_name_source = 'identity-needs-review-v4';
      lead.contact_candidates = previousCandidates;
    }

    const after = JSON.stringify({
      company: lead.company, domain: lead.domain, contact: lead.contact, contacts: lead.contacts,
      candidates: lead.contact_candidates, identity: lead.company_identity, greeting_name: lead.greeting_name
    });
    return { changed: before !== after, shouldRefresh };
  }

  async function refreshContactsForIdentity(leadId) {
    if (!leadId || refreshInFlight.has(leadId)) return;
    refreshInFlight.add(leadId);
    try {
      const leads = load(LEADS_KEY, []);
      const lead = leads.find(item => item?.id === leadId);
      const identity = lead?.company_identity;
      if (!lead || !identityVerified(identity)) return;
      const domain = rootDomain(identity.domain);
      if (!domain) return;

      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({
          url: `https://${domain}/`,
          recommendedRole: clean(lead.recommendedRole || lead.recommended_role || 'Operations Lead', 120),
          roleTargets: Array.isArray(lead.roleTargets) ? lead.roleTargets : []
        })
      }).catch(() => null);
      if (!response?.ok) return;
      const data = await response.json().catch(() => ({}));
      const discovered = [data?.contact, ...(Array.isArray(data?.contacts) ? data.contacts : [])].filter(Boolean);

      const latest = load(LEADS_KEY, []);
      const target = latest.find(item => item?.id === leadId);
      if (!target || !identityVerified(target.company_identity)) return;
      const candidates = classifyContacts([
        ...(Array.isArray(target.contact_candidates) ? target.contact_candidates : []),
        ...discovered,
        ...officialContacts(target.company_identity)
      ], target.company_identity);
      target.contact_candidates = candidates;
      target.contacts = candidates.filter(contact => contact.send_allowed);
      target.contact = target.contacts.find(contact => contact.qualified) || target.contacts[0] || null;
      if (target.contact) {
        target.contact_status = 'qualified';
        target.contact_failure_reason = null;
      }
      save(LEADS_KEY, latest);
      document.dispatchEvent(new CustomEvent('kpa:company-identity-updated', { detail: { id: leadId, contactsRefreshed: true } }));
      if (/mail-review/i.test(location.pathname)) location.reload();
      else if (typeof render === 'function') render();
    } finally {
      refreshInFlight.delete(leadId);
    }
  }

  async function resolvePending() {
    if (running) { rerun = true; return; }
    running = true;
    const refreshIds = [];
    try {
      const leads = load(LEADS_KEY, []);
      if (!Array.isArray(leads) || !leads.length) return;
      const allPending = leads.filter(lead => {
        if (!lead?.id || !clean(lead?.raw_company || lead?.company, 220)) return false;
        return lead.company_identity_version !== VERSION
          || lead?.company_identity?.identity_version !== VERSION
          || !lead.company_identity;
      });
      const targets = allPending.slice(0, 30);
      if (!targets.length) return;

      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({
          action: 'company_names',
          items: targets.map(lead => ({
            id: lead.id,
            company: clean(lead.raw_company || lead.company, 220),
            raw_name: clean(lead.raw_company || lead.company, 220),
            domain: clean(lead.domain, 240),
            url: clean(lead.url, 500),
            country: clean(lead.country, 100),
            source_title: clean(lead.source_title, 320),
            source_url: clean(lead.source_url, 500)
          }))
        })
      }).catch(() => null);
      if (!response?.ok) return;

      const data = await response.json().catch(() => ({}));
      const identities = new Map((Array.isArray(data?.identities) ? data.identities : [])
        .map(row => [clean(row?.id, 180), row]));
      const draftsByKey = Object.fromEntries(DRAFT_KEYS.map(key => [key, load(key, {})]));
      let changed = false;

      for (const lead of leads) {
        const identity = identities.get(clean(lead?.id, 180));
        if (!identity) continue;
        const result = applyIdentity(lead, identity, draftsByKey);
        if (result.changed) changed = true;
        if (result.shouldRefresh) refreshIds.push(lead.id);
      }

      save(LEADS_KEY, leads);
      for (const [key, drafts] of Object.entries(draftsByKey)) save(key, drafts);
      localStorage.setItem('kpa.company-identity-schema', VERSION);
      document.dispatchEvent(new CustomEvent('kpa:company-identity-updated', { detail: { version: VERSION } }));
      if (allPending.length > targets.length) rerun = true;

      if (typeof state !== 'undefined' && Array.isArray(state.leads)) {
        const byId = new Map(leads.map(lead => [lead.id, lead]));
        state.leads = state.leads.map(lead => byId.get(lead.id) || lead);
        if (typeof saveState === 'function') saveState();
        if (typeof render === 'function') render();
      } else if (changed && /mail-review/i.test(location.pathname)) {
        setTimeout(() => location.reload(), 60);
      }
    } finally {
      running = false;
      refreshIds.slice(0, 8).forEach((id, index) => setTimeout(() => refreshContactsForIdentity(id), 150 + index * 120));
      if (rerun) { rerun = false; setTimeout(resolvePending, 80); }
    }
  }

  function includedReviewLeads() {
    const leads = load(LEADS_KEY, []);
    const ids = load(IDS_KEY, []);
    const drafts = load(DRAFT_KEYS[0], {});
    const byId = new Map((Array.isArray(leads) ? leads : []).map(lead => [lead.id, lead]));
    return (Array.isArray(ids) ? ids : []).map(id => ({ lead: byId.get(id), draft: drafts?.[id] || {} }))
      .filter(row => row.lead && row.draft?.included !== false);
  }

  function sendBlockReason() {
    for (const { lead, draft } of includedReviewLeads()) {
      const identity = lead?.company_identity;
      if (!identityVerified(identity)) {
        return `${clean(lead?.raw_company || lead?.company, 100) || '회사'}: 공식 브랜드명이 충분한 근거로 검증되지 않았습니다.`;
      }
      const selected = Array.isArray(draft?.selectedEmails)
        ? draft.selectedEmails
        : String(draft?.to || '').split(/[\s,;]+/).filter(Boolean);
      for (const email of selected) {
        const contact = [
          lead.contact,
          ...(Array.isArray(lead.contacts) ? lead.contacts : []),
          ...(Array.isArray(lead.contact_candidates) ? lead.contact_candidates : [])
        ].find(row => clean(row?.email, 240).toLowerCase() === clean(email, 240).toLowerCase());
        if (contactAllowed(contact || { email }, identity)) continue;
        return `${clean(lead?.company, 100)}: ${clean(email, 120)} 주소가 해당 회사와 검증된 연결 근거가 없습니다.`;
      }
    }
    return '';
  }

  document.addEventListener('click', event => {
    if (/mail-review/i.test(location.pathname)) return;
    const button = event.target?.closest?.('#sendAllBtn');
    if (!button) return;
    const reason = sendBlockReason();
    if (!reason) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    alert(`발송 중지: ${reason}\n\n탐색 결과는 보존되며, 회사명/이메일 연결 근거가 확인되면 다시 발송할 수 있습니다.`);
  }, true);

  function wrapLeadMutations(attempt = 0) {
    let patched = false;
    if (typeof mergeLeads === 'function' && !mergeLeads.__companyIdentityWrappedV4) {
      const original = mergeLeads;
      const wrapped = function() {
        const result = original.apply(this, arguments);
        setTimeout(resolvePending, 0);
        return result;
      };
      wrapped.__companyIdentityWrappedV4 = true;
      mergeLeads = wrapped;
      patched = true;
    }
    if (typeof patchLead === 'function' && !patchLead.__companyIdentityWrappedV4) {
      const original = patchLead;
      const wrapped = function(id, patch) {
        const nextPatch = { ...(patch || {}) };
        if (Object.prototype.hasOwnProperty.call(nextPatch, 'company')
          || Object.prototype.hasOwnProperty.call(nextPatch, 'domain')
          || Object.prototype.hasOwnProperty.call(nextPatch, 'url')) {
          nextPatch.company_identity_version = '';
        }
        const result = original.call(this, id, nextPatch);
        setTimeout(resolvePending, 0);
        return result;
      };
      wrapped.__companyIdentityWrappedV4 = true;
      patchLead = wrapped;
      patched = true;
    }
    if ((!patched || typeof mergeLeads !== 'function') && attempt < 8) {
      setTimeout(() => wrapLeadMutations(attempt + 1), 250);
    }
  }

  globalThis.KPA_COMPANY_IDENTITY_REFRESH = resolvePending;
  globalThis.KPA_COMPANY_CONTACT_ALLOWED = contactAllowed;
  wrapLeadMutations();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(resolvePending, 0), { once: true });
  } else {
    setTimeout(resolvePending, 0);
  }
})();
