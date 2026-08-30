(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const DRAFT_KEYS = ['kpa.mail.review.drafts.v5', 'kpa.mail.review.drafts.v4'];
  const VERSION = '20260830-email-domain-identity-v5';
  const FREE_MAIL = new Set([
    'gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','yahoo.com','yahoo.co.jp','icloud.com',
    'me.com','qq.com','163.com','126.com','foxmail.com','proton.me','protonmail.com','naver.com','daum.net','hanmail.net'
  ]);
  const MULTI_SUFFIXES = new Set([
    'ac.kr','co.kr','go.kr','ne.kr','or.kr','re.kr','pe.kr','ac.uk','co.uk','gov.uk','ltd.uk','me.uk','net.uk','nhs.uk','org.uk','plc.uk','sch.uk',
    'asn.au','com.au','edu.au','gov.au','id.au','net.au','org.au','ac.jp','co.jp','go.jp','ne.jp','or.jp','com.br','com.cn','com.hk','com.mx','com.sg',
    'com.tr','com.tw','com.vn','co.id','co.in','co.nz','co.th','co.za','net.cn','net.in','org.cn','org.in'
  ]);

  const clean = (value = '', max = 500) => String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

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

  function validEmail(value = '') {
    return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean(value, 240));
  }

  function mergeContacts(rows = []) {
    const map = new Map();
    for (const row of rows) {
      if (!row) continue;
      const email = clean(row?.email, 240).toLowerCase();
      if (!validEmail(email)) continue;
      const current = map.get(email) || {};
      map.set(email, {
        ...current,
        ...row,
        email,
        name: current.name || row.name || '',
        title: current.title || row.title || '',
        qualified: Boolean(current.qualified || row.qualified)
      });
    }
    return [...map.values()];
  }

  function allContacts(lead = {}) {
    return mergeContacts([
      lead.contact,
      ...(Array.isArray(lead.contacts) ? lead.contacts : []),
      ...(Array.isArray(lead.contact_candidates) ? lead.contact_candidates : [])
    ]);
  }

  function primaryEmail(lead = {}) {
    const rows = allContacts(lead);
    const preferred = rows.find(row => row.qualified === true && !FREE_MAIL.has(rootDomain(row.email)))
      || rows.find(row => !FREE_MAIL.has(rootDomain(row.email)))
      || rows[0];
    return clean(preferred?.email, 240).toLowerCase();
  }

  function identityVerified(identity = {}) {
    const recipientDomain = rootDomain(identity?.recipient_domain || '');
    return identity?.identity_version === VERSION
      && identity?.status === 'verified'
      && Number(identity?.confidence || 0) >= 0.85
      && Boolean(clean(identity?.greeting_name, 120))
      && Boolean(recipientDomain)
      && !FREE_MAIL.has(recipientDomain);
  }

  function officialEmailSet(identity = {}) {
    return new Set((Array.isArray(identity?.official_emails) ? identity.official_emails : [])
      .map(item => clean(typeof item === 'string' ? item : item?.email, 240).toLowerCase())
      .filter(validEmail));
  }

  function contactAllowed(contact = {}, identity = {}) {
    const email = clean(contact?.email, 240).toLowerCase();
    if (!validEmail(email) || !identityVerified(identity)) return false;
    if (officialEmailSet(identity).has(email)) return true;
    const anchor = rootDomain(identity.recipient_domain);
    const emailDomain = rootDomain(email);
    return Boolean(anchor && emailDomain && anchor === emailDomain);
  }

  function updateDraft(lead, drafts, allowedContacts) {
    const draft = drafts?.[lead.id];
    if (!draft || typeof draft !== 'object') return false;
    const allowed = new Set(allowedContacts.map(contact => clean(contact.email, 240).toLowerCase()));
    const existing = Array.isArray(draft.selectedEmails)
      ? draft.selectedEmails.map(email => clean(email, 240).toLowerCase()).filter(Boolean)
      : String(draft.to || '').split(/[\s,;]+/).map(email => clean(email, 240).toLowerCase()).filter(Boolean);
    let selected = existing.filter(email => allowed.has(email));
    if (!selected.length) selected = [...allowed].slice(0, 4);

    let changed = false;
    if (JSON.stringify(draft.selectedEmails || []) !== JSON.stringify(selected)) {
      draft.selectedEmails = selected;
      changed = true;
    }
    const to = selected.join(', ');
    if (draft.to !== to) { draft.to = to; changed = true; }

    const greeting = clean(lead.greeting_name || lead.company, 120);
    if (greeting && typeof draft.body === 'string') {
      const next = draft.body.replace(/^Hi[^\n]*,\s*/i, `Hi ${greeting} team,\n\n`);
      if (next !== draft.body) { draft.body = next; changed = true; }
    }
    if (greeting && typeof draft.translation === 'string') {
      const next = draft.translation.replace(/^안녕하세요[^\n]*[.!]?\s*/, `안녕하세요, ${greeting} 팀.\n\n`);
      if (next !== draft.translation) { draft.translation = next; changed = true; }
    }
    return changed;
  }

  function applyIdentity(lead, identity, recipientEmail, draftsByKey) {
    if (!lead || !identity) return false;
    const before = JSON.stringify({
      company: lead.company, domain: lead.domain, url: lead.url, contact: lead.contact, contacts: lead.contacts,
      candidates: lead.contact_candidates, identity: lead.company_identity
    });

    lead.raw_company = clean(lead.raw_company || lead.company, 220);
    lead.company_identity = { ...identity, recipient_email: recipientEmail };
    lead.company_identity_version = VERSION;
    lead.identity_status = identity.status || 'needs_review';
    lead.identity_confidence = Number(identity.confidence || 0);
    lead.identity_evidence_url = clean(identity.evidence_url, 600);
    lead.identity_verified_at = clean(identity.verified_at, 80);

    if (identityVerified(identity)) {
      const recipientDomain = rootDomain(identity.recipient_domain);
      const greeting = clean(identity.greeting_name, 120);
      const allowedContacts = allContacts(lead).filter(contact => contactAllowed(contact, identity));

      lead.legal_name = clean(identity.legal_name, 220);
      lead.brand_name = clean(identity.brand_name || greeting, 160);
      lead.greeting_name = greeting;
      lead.company = greeting;
      lead.domain = recipientDomain;
      lead.website_domain = rootDomain(identity.domain || recipientDomain);
      lead.url = clean(identity.evidence_url, 600) || `https://${recipientDomain}/`;
      lead.company_name_source = 'recipient-email-domain-v5';
      lead.verified_by = 'recipient-email-domain-v5';
      lead.contact_candidates = allowedContacts;
      lead.contacts = allowedContacts;
      lead.contact = allowedContacts.find(contact => contact.qualified === true) || allowedContacts[0] || null;
      lead.contact_status = lead.contact ? 'qualified' : 'identity_verified_no_contact';
      lead.contact_failure_reason = lead.contact ? null : '수신 이메일 도메인과 회사 Identity가 일치하는 연락처가 없습니다.';

      for (const drafts of Object.values(draftsByKey)) updateDraft(lead, drafts, allowedContacts);
    } else {
      lead.company_name_source = 'recipient-email-domain-needs-review-v5';
    }

    const after = JSON.stringify({
      company: lead.company, domain: lead.domain, url: lead.url, contact: lead.contact, contacts: lead.contacts,
      candidates: lead.contact_candidates, identity: lead.company_identity
    });
    return before !== after;
  }

  let chain = Promise.resolve();
  async function runResolve(requestedIds = [], options = {}) {
    const force = options?.force === true;
    const requested = new Set((Array.isArray(requestedIds) ? requestedIds : []).filter(Boolean));
    const leads = load(LEADS_KEY, []);
    if (!Array.isArray(leads) || !leads.length) return { verified: 0, unresolved: 0, ids: [] };

    const targets = leads.filter(lead => {
      if (!lead?.id || (requested.size && !requested.has(lead.id))) return false;
      const email = primaryEmail(lead);
      const domain = rootDomain(email);
      if (!email || !domain || FREE_MAIL.has(domain)) return false;
      const storedEmail = clean(lead?.company_identity?.recipient_email, 240).toLowerCase();
      return force || lead.company_identity_version !== VERSION || !identityVerified(lead.company_identity) || storedEmail !== email;
    }).slice(0, 30);

    if (!targets.length) {
      const selected = requested.size ? leads.filter(lead => requested.has(lead.id)) : leads;
      return {
        verified: selected.filter(lead => identityVerified(lead.company_identity)).length,
        unresolved: selected.filter(lead => primaryEmail(lead) && !identityVerified(lead.company_identity)).length,
        ids: selected.map(lead => lead.id)
      };
    }

    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({
        action: 'company_names',
        items: targets.map(lead => {
          const email = primaryEmail(lead);
          const domain = rootDomain(email);
          return {
            id: lead.id,
            company: clean(lead.raw_company || lead.company, 220),
            raw_name: clean(lead.raw_company || lead.company, 220),
            domain,
            url: `https://${domain}/`,
            country: clean(lead.country, 100),
            source_title: `Recipient email: ${email}`,
            source_url: clean(lead.source_url, 500)
          };
        })
      })
    });

    if (!response.ok) throw new Error(`회사명 확인 실패 (HTTP ${response.status})`);
    const data = await response.json().catch(() => ({}));
    const identities = new Map((Array.isArray(data?.identities) ? data.identities : []).map(row => [clean(row?.id, 180), row]));
    const draftsByKey = Object.fromEntries(DRAFT_KEYS.map(key => [key, load(key, {})]));
    let changed = false;

    for (const lead of leads) {
      const identity = identities.get(clean(lead?.id, 180));
      if (!identity) continue;
      if (applyIdentity(lead, identity, primaryEmail(lead), draftsByKey)) changed = true;
    }

    save(LEADS_KEY, leads);
    for (const [key, drafts] of Object.entries(draftsByKey)) save(key, drafts);
    localStorage.setItem('kpa.company-identity-schema', VERSION);

    if (typeof state !== 'undefined' && Array.isArray(state.leads)) {
      const byId = new Map(leads.map(lead => [lead.id, lead]));
      state.leads = state.leads.map(lead => byId.get(lead.id) || lead);
      if (typeof saveState === 'function') saveState();
      if (changed && typeof render === 'function') render();
    }

    document.dispatchEvent(new CustomEvent('kpa:company-identity-updated', { detail: { version: VERSION, ids: targets.map(lead => lead.id) } }));
    const selected = requested.size ? leads.filter(lead => requested.has(lead.id)) : targets;
    return {
      verified: selected.filter(lead => identityVerified(lead.company_identity)).length,
      unresolved: selected.filter(lead => primaryEmail(lead) && !identityVerified(lead.company_identity)).length,
      ids: selected.map(lead => lead.id)
    };
  }

  function resolvePending(requestedIds = [], options = {}) {
    const job = () => runResolve(requestedIds, options);
    chain = chain.then(job, job);
    return chain;
  }

  let timer = 0;
  function schedule(ids = []) {
    clearTimeout(timer);
    timer = setTimeout(() => resolvePending(ids).catch(() => {}), 120);
  }

  function wrapLeadMutations(attempt = 0) {
    let found = false;
    if (typeof mergeLeads === 'function' && !mergeLeads.__emailIdentityV5) {
      const original = mergeLeads;
      const wrapped = function(incoming) {
        const result = original.apply(this, arguments);
        schedule((Array.isArray(incoming) ? incoming : []).map(lead => lead?.id).filter(Boolean));
        return result;
      };
      wrapped.__emailIdentityV5 = true;
      mergeLeads = wrapped;
      found = true;
    }
    if (typeof patchLead === 'function' && !patchLead.__emailIdentityV5) {
      const original = patchLead;
      const wrapped = function(id) {
        const result = original.apply(this, arguments);
        schedule(id ? [id] : []);
        return result;
      };
      wrapped.__emailIdentityV5 = true;
      patchLead = wrapped;
      found = true;
    }
    if (!found && attempt < 8) setTimeout(() => wrapLeadMutations(attempt + 1), 250);
  }

  globalThis.KPA_COMPANY_IDENTITY_REFRESH = resolvePending;
  globalThis.KPA_COMPANY_CONTACT_ALLOWED = contactAllowed;
  globalThis.KPA_COMPANY_IDENTITY_VERSION = VERSION;
  wrapLeadMutations();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(), { once: true });
  else schedule();
})();
