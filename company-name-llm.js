(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const DRAFT_KEYS = ['kpa.mail.review.drafts.v5', 'kpa.mail.review.drafts.v4'];
  const IDS_KEY = 'kpa.mail.review.ids';
  const VERSION = '20260829-company-identity-v1';
  let running = false;
  let rerun = false;

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
    return identity?.status === 'verified'
      && Number(identity?.confidence || 0) >= 0.85
      && Boolean(clean(identity?.greeting_name, 120))
      && Boolean(rootDomain(identity?.domain))
      && /^https?:\/\//i.test(clean(identity?.evidence_url, 600));
  }

  function contactAllowed(contact = {}, officialDomain = '') {
    const email = clean(contact?.email, 240).toLowerCase();
    if (!email || !officialDomain) return false;
    if (rootDomain(email) === rootDomain(officialDomain)) return true;
    return contact?.trustedCrossDomain === true && (contact?.verifiedOverride === true || contact?.verified_override === true);
  }

  function updateDraftGreetings(lead, drafts) {
    const names = globalThis.KPA_COMPANY_NAMES;
    const greeting = clean(lead?.greeting_name || lead?.brand_name || lead?.company, 120);
    if (!greeting) return false;
    const draft = drafts?.[lead.id];
    if (!draft || typeof draft !== 'object') return false;
    let changed = false;
    if (typeof draft.body === 'string') {
      const next = names?.rewriteEnglishGreeting
        ? names.rewriteEnglishGreeting(draft.body, lead, false)
        : draft.body.replace(/^Hi[^\n]*,\s*/i, `Hi ${greeting} team,\n\n`);
      if (next !== draft.body) { draft.body = next; changed = true; }
    }
    if (typeof draft.translation === 'string') {
      const next = names?.rewriteKoreanGreeting
        ? names.rewriteKoreanGreeting(draft.translation, lead)
        : draft.translation.replace(/^안녕하세요[^\n]*[.!]?\s*/, `안녕하세요, ${greeting} 팀.\n\n`);
      if (next !== draft.translation) { draft.translation = next; changed = true; }
    }
    return changed;
  }

  function applyIdentity(lead, identity, draftsByKey) {
    if (!lead || !identity) return false;
    const before = JSON.stringify({
      company: lead.company, domain: lead.domain, url: lead.url, contact: lead.contact, contacts: lead.contacts,
      identity: lead.company_identity, greeting_name: lead.greeting_name
    });

    lead.raw_company = clean(lead.raw_company || identity.raw_name || lead.company, 220);
    lead.company_identity = { ...identity };
    lead.company_identity_version = VERSION;
    lead.identity_status = identity.status || 'needs_review';
    lead.identity_confidence = Number(identity.confidence || 0);
    lead.identity_evidence_url = clean(identity.evidence_url, 600);
    lead.identity_verified_at = clean(identity.verified_at, 80);

    if (identityVerified(identity)) {
      const officialDomain = rootDomain(identity.domain);
      const greeting = clean(identity.greeting_name || identity.brand_name, 120);
      lead.legal_name = clean(identity.legal_name, 220);
      lead.brand_name = clean(identity.brand_name || greeting, 160);
      lead.greeting_name = greeting;
      lead.company = greeting;
      lead.domain = officialDomain;
      lead.url = `https://${officialDomain}/`;
      lead.company_name_source = 'official-identity';
      lead.verified_by = 'official-domain-identity';

      const previous = [lead.contact, ...(Array.isArray(lead.contacts) ? lead.contacts : [])].filter(Boolean);
      const kept = [];
      const seen = new Set();
      for (const contact of previous) {
        const email = clean(contact?.email, 240).toLowerCase();
        if (!email || seen.has(email) || !contactAllowed(contact, officialDomain)) continue;
        seen.add(email);
        kept.push(contact);
      }
      lead.contacts = kept;
      lead.contact = kept.find(contact => contact?.qualified) || kept[0] || null;
      if (!kept.length && previous.length) {
        lead.contact_status = 'needs_contact_refresh';
        lead.contact_failure_reason = '공식 회사 도메인이 변경되어 기존 연락처를 재검증해야 합니다.';
      }

      for (const drafts of Object.values(draftsByKey)) updateDraftGreetings(lead, drafts);
    } else {
      lead.company_name_source = 'identity-needs-review';
    }

    const after = JSON.stringify({
      company: lead.company, domain: lead.domain, url: lead.url, contact: lead.contact, contacts: lead.contacts,
      identity: lead.company_identity, greeting_name: lead.greeting_name
    });
    return before !== after;
  }

  async function resolvePending() {
    if (running) { rerun = true; return; }
    running = true;
    try {
      const leads = load(LEADS_KEY, []);
      if (!Array.isArray(leads) || !leads.length) return;
      const allPending = leads.filter(lead => {
        if (!lead?.id || !clean(lead?.raw_company || lead?.company, 220)) return false;
        return lead.company_identity_version !== VERSION || !lead.company_identity;
      });
      const targets = allPending.slice(0, 30);
      if (!targets.length) return;

      let response;
      try {
        response = await fetch('/api/contact', {
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
        });
      } catch { return; }
      if (!response?.ok) return;

      const data = await response.json().catch(() => ({}));
      const identities = new Map((Array.isArray(data?.identities) ? data.identities : []).map(row => [clean(row?.id, 180), row]));
      const draftsByKey = Object.fromEntries(DRAFT_KEYS.map(key => [key, load(key, {})]));
      let changed = false;
      for (const lead of leads) {
        const identity = identities.get(clean(lead?.id, 180));
        if (!identity) continue;
        if (applyIdentity(lead, identity, draftsByKey)) changed = true;
      }

      save(LEADS_KEY, leads);
      for (const [key, drafts] of Object.entries(draftsByKey)) save(key, drafts);
      localStorage.setItem('kpa.company-identity-schema', VERSION);
      if (allPending.length > targets.length) rerun = true;

      if (typeof state !== 'undefined' && Array.isArray(state.leads)) {
        const byId = new Map(leads.map(lead => [lead.id, lead]));
        state.leads = state.leads.map(lead => byId.get(lead.id) || lead);
        if (typeof saveState === 'function') saveState();
        if (typeof render === 'function') render();
      } else if (changed && /mail-review/i.test(location.pathname)) {
        location.reload();
      }
    } finally {
      running = false;
      if (rerun) { rerun = false; setTimeout(resolvePending, 50); }
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
      if (!identityVerified(identity)) return `${clean(lead?.raw_company || lead?.company, 100) || '회사'}: 공식 회사명이 검증되지 않았습니다.`;
      const officialDomain = rootDomain(identity.domain);
      const selected = Array.isArray(draft?.selectedEmails) ? draft.selectedEmails : String(draft?.to || '').split(/[\s,;]+/).filter(Boolean);
      for (const email of selected) {
        if (rootDomain(email) === officialDomain) continue;
        const contact = [lead.contact, ...(Array.isArray(lead.contacts) ? lead.contacts : [])].find(row => clean(row?.email, 240).toLowerCase() === clean(email, 240).toLowerCase());
        if (contactAllowed(contact || {}, officialDomain)) continue;
        return `${clean(lead?.company, 100)}: ${clean(email, 120)} 주소가 공식 도메인과 일치하지 않습니다.`;
      }
    }
    return '';
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('#sendAllBtn');
    if (!button) return;
    const reason = sendBlockReason();
    if (!reason) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    alert(`발송 중지: ${reason}\n\n회사 Identity 또는 연락처를 다시 확인해주세요.`);
  }, true);

  function wrapLeadMutations(attempt = 0) {
    let patched = false;
    if (typeof mergeLeads === 'function' && !mergeLeads.__companyIdentityWrapped) {
      const original = mergeLeads;
      const wrapped = function(incoming) {
        const result = original.apply(this, arguments);
        setTimeout(resolvePending, 0);
        return result;
      };
      wrapped.__companyIdentityWrapped = true;
      mergeLeads = wrapped;
      patched = true;
    }
    if (typeof patchLead === 'function' && !patchLead.__companyIdentityWrapped) {
      const original = patchLead;
      const wrapped = function(id, patch) {
        const nextPatch = { ...(patch || {}) };
        if (Object.prototype.hasOwnProperty.call(nextPatch, 'company') || Object.prototype.hasOwnProperty.call(nextPatch, 'domain') || Object.prototype.hasOwnProperty.call(nextPatch, 'url')) {
          nextPatch.company_identity_version = '';
        }
        const result = original.call(this, id, nextPatch);
        setTimeout(resolvePending, 0);
        return result;
      };
      wrapped.__companyIdentityWrapped = true;
      patchLead = wrapped;
      patched = true;
    }
    if ((!patched || typeof mergeLeads !== 'function') && attempt < 8) setTimeout(() => wrapLeadMutations(attempt + 1), 250);
  }

  globalThis.KPA_COMPANY_IDENTITY_REFRESH = resolvePending;
  wrapLeadMutations();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(resolvePending, 0), { once: true });
  else setTimeout(resolvePending, 0);
})();
