(() => {
  const API_VERSION = '20260830-company-identity-v4-compat';
  const IDENTITY_VERSION = '20260830-company-identity-v4';
  const MULTI_LABEL_SUFFIXES = new Set([
    'ac.kr','co.kr','go.kr','ne.kr','or.kr','re.kr','pe.kr','ac.uk','co.uk','gov.uk','ltd.uk','me.uk','net.uk','nhs.uk','org.uk','plc.uk','sch.uk',
    'asn.au','com.au','edu.au','gov.au','id.au','net.au','org.au','ac.jp','co.jp','go.jp','ne.jp','or.jp','com.br','com.cn','com.hk','com.mx','com.sg',
    'com.tr','com.tw','com.vn','co.id','co.in','co.nz','co.th','co.za','net.cn','net.in','org.cn','org.in'
  ]);
  const FREE_EMAIL_DOMAINS = new Set([
    'gmail.com','googlemail.com','yahoo.com','yahoo.co.jp','outlook.com','hotmail.com','live.com','icloud.com','proton.me','protonmail.com'
  ]);
  const BAD_NAME_WORDS = /\b(?:activation|activations|event|events|event\s+list|official\s+site|homepage|home|conference|summit|speaker|speakers|sponsor|sponsors|attendee|attendees|list|directory)\b/i;
  const BAD_PERSON_WORDS = /\b(?:team|support|info|sales|contact|hello|office|media|press|marketing|events?|partnerships?|business|community|operations?|founder|ceo|director|manager|lead)\b/i;

  function clean(value = '', max = 240) {
    return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function hostname(value = '') {
    const raw = clean(value, 500).toLowerCase();
    if (!raw) return '';
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
      return url.hostname.replace(/^www\./, '').replace(/\.+$/, '');
    } catch {
      return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split(':')[0].replace(/\.+$/, '');
    }
  }

  function emailDomain(value = '') {
    const email = clean(value, 240).toLowerCase();
    const match = email.match(/^[^@\s]+@([^@\s]+)$/);
    return match ? hostname(match[1]) : '';
  }

  function registrableDomain(value = '') {
    const host = hostname(value);
    const parts = host.split('.').filter(Boolean);
    if (parts.length <= 2) return host;
    const suffix2 = parts.slice(-2).join('.');
    return parts.slice(-(MULTI_LABEL_SUFFIXES.has(suffix2) ? 3 : 2)).join('.');
  }

  function domainStem(value = '') {
    const domain = registrableDomain(value);
    if (!domain) return '';
    const parts = domain.split('.');
    const suffix2 = parts.slice(-2).join('.');
    return MULTI_LABEL_SUFFIXES.has(suffix2) ? parts.slice(0, -2).join('') : parts[0];
  }

  function titleWord(word = '') {
    const lower = clean(word, 80).toLowerCase();
    if (/^(ai|dao|vc|vr|ar|xr|ct|io|web3|nft|defi|gtm)$/.test(lower)) return lower.toUpperCase();
    return lower ? `${lower[0].toUpperCase()}${lower.slice(1)}` : '';
  }

  function brandFromDomain(value = '') {
    const stem = domainStem(value).replace(/[-_]+/g, ' ').trim();
    return stem ? stem.split(/\s+/).filter(Boolean).map(titleWord).join(' ') : '';
  }

  function validCompanyName(value = '') {
    const name = clean(value, 160);
    if (!name || name.length > 80) return false;
    if (/@|https?:\/\/|\[|\]|\{|\}|<|>|·|\||\b20\d{2}\b/i.test(name)) return false;
    if (BAD_NAME_WORDS.test(name) || /\bteam\b/i.test(name)) return false;
    return /[\p{L}\p{N}]/u.test(name);
  }

  function recoverMatchingCandidate(raw = '', domain = '') {
    const candidate = clean(raw, 160).replace(/\s+team$/i, '').trim();
    const stem = domainStem(domain).toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!candidate || !stem || !key || !validCompanyName(candidate)) return '';
    return (key === stem || (Math.min(key.length, stem.length) >= 5 && (key.includes(stem) || stem.includes(key)))) ? candidate : '';
  }

  function identityRecord(lead = {}) {
    const identity = lead?.company_identity;
    return identity && typeof identity === 'object' ? identity : null;
  }

  function identityCurrent(lead = {}) {
    const identity = identityRecord(lead);
    return identity?.identity_version === IDENTITY_VERSION ? identity : null;
  }

  function identityCurrentVerified(lead = {}) {
    const identity = identityCurrent(lead);
    return Boolean(identity
      && identity.status === 'verified'
      && Number(identity.confidence || 0) >= 0.85
      && validCompanyName(identity.greeting_name || identity.brand_name || ''));
  }

  function primaryEmail(lead = {}) {
    const rows = [lead.contact, ...(Array.isArray(lead.contacts) ? lead.contacts : [])].filter(Boolean);
    return clean(rows.find(row => emailDomain(row?.email))?.email || '', 240);
  }

  function trustedExplicitName(lead = {}) {
    const raw = clean(lead.company, 160).replace(/\s+team$/i, '').trim();
    const trusted = Boolean(
      lead?.contact?.verifiedOverride === true ||
      lead?.contact?.verified_override === true ||
      /^kbw-curated:/i.test(clean(lead.id, 220)) ||
      /(manual|curated|official-web|official_domain|official-domain)/i.test(clean(lead.verified_by, 180))
    );
    return trusted && validCompanyName(raw) ? raw : '';
  }

  function canonicalCompanyName(lead = {}) {
    const identity = identityRecord(lead);
    if (identity) {
      if (identityCurrentVerified(lead)) return clean(identity.greeting_name || identity.brand_name, 160);
      // Once an identity record exists, never reconstruct the brand from a URL/email while identity verification is pending.
      return clean(lead.company || lead.raw_company || identity.raw_name, 160).replace(/\s+team$/i, '').trim();
    }

    // Compatibility only for leads that have never entered the identity pipeline.
    const trusted = trustedExplicitName(lead);
    if (trusted) return trusted;
    const emailHost = emailDomain(primaryEmail(lead));
    const leadHost = hostname(lead.domain || lead.url || '');
    const preferredHost = emailHost && !FREE_EMAIL_DOMAINS.has(registrableDomain(emailHost)) ? emailHost : leadHost;
    const recovered = recoverMatchingCandidate(lead.company, preferredHost);
    return recovered || (validCompanyName(lead.company) ? clean(lead.company, 160) : '');
  }

  function validPersonName(value = '') {
    const name = clean(value, 80);
    if (!name || name.length > 40 || /\d|@|https?:\/\/|[\[\]{}<>]/i.test(name) || BAD_PERSON_WORDS.test(name)) return false;
    const words = name.split(/\s+/).filter(Boolean);
    return words.length >= 1 && words.length <= 3 && words.every(word => /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,28}$/.test(word));
  }

  function personFirstName(contact = {}) {
    const direct = clean(contact.first_name, 40);
    if (validPersonName(direct)) return direct.split(/\s+/)[0];
    const full = clean(contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`, 80);
    return validPersonName(full) ? full.split(/\s+/)[0] : '';
  }

  function greetingForLead(lead = {}, preferPerson = false) {
    const first = preferPerson ? personFirstName(lead.contact || {}) : '';
    if (first) return `Hi ${first},`;
    const company = canonicalCompanyName(lead);
    return company ? `Hi ${company} team,` : 'Hi there,';
  }

  function sanitizeContact(contact = {}) {
    if (!contact || typeof contact !== 'object') return contact;
    const full = clean(contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`, 80);
    if (!full || validPersonName(full)) return { ...contact };
    return { ...contact, name: '', first_name: '', last_name: '' };
  }

  function sanitizeLead(lead = {}) {
    if (!lead || typeof lead !== 'object') return lead;
    const identity = identityRecord(lead);
    const contact = sanitizeContact(lead.contact || null);
    const contacts = Array.isArray(lead.contacts) ? lead.contacts.map(sanitizeContact) : lead.contacts;

    if (identity) {
      const company = identityCurrentVerified(lead)
        ? clean(identity.greeting_name || identity.brand_name, 160)
        : clean(lead.company || lead.raw_company || identity.raw_name, 160);
      return {
        ...lead,
        company,
        company_name_source: identityCurrentVerified(lead) ? 'official-evidence-v4' : 'identity-pending-or-needs-review',
        contact,
        contacts
      };
    }

    const company = canonicalCompanyName(lead);
    return {
      ...lead,
      company: company || clean(lead.company, 160),
      company_name_source: company ? 'legacy-compatible' : lead.company_name_source,
      contact,
      contacts
    };
  }

  function rewriteEnglishGreeting(body = '', lead = {}, preferPerson = false) {
    const text = String(body || '');
    const greeting = greetingForLead(lead, preferPerson);
    if (/^Hi[^\n]*,\s*/i.test(text)) return text.replace(/^Hi[^\n]*,\s*/i, `${greeting}\n\n`);
    return `${greeting}\n\n${text.replace(/^\s+/, '')}`;
  }

  function rewriteKoreanGreeting(body = '', lead = {}) {
    const text = String(body || '');
    const company = canonicalCompanyName(lead);
    const greeting = company ? `안녕하세요, ${company} 팀.` : '안녕하세요.';
    if (/^안녕하세요[^\n]*[.!]?\s*/.test(text)) return text.replace(/^안녕하세요[^\n]*[.!]?\s*/, `${greeting}\n\n`);
    return `${greeting}\n\n${text.replace(/^\s+/, '')}`;
  }

  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  }

  function migrateStorage() {
    if (typeof localStorage === 'undefined') return;
    const leadKey = 'kpa.hunt.leads';
    const leads = loadJson(leadKey, []);
    if (!Array.isArray(leads)) return;
    const sanitized = leads.map(sanitizeLead);
    localStorage.setItem(leadKey, JSON.stringify(sanitized));
    const byId = new Map(sanitized.map(lead => [lead.id, lead]));

    for (const draftKey of ['kpa.mail.review.drafts.v5', 'kpa.mail.review.drafts.v4']) {
      const drafts = loadJson(draftKey, {});
      if (!drafts || typeof drafts !== 'object') continue;
      let changed = false;
      for (const [id, draft] of Object.entries(drafts)) {
        const lead = byId.get(id);
        if (!lead || !draft || typeof draft !== 'object') continue;
        // Any existing identity record is server-owned; only current verified identity can rewrite the greeting.
        if (identityRecord(lead) && !identityCurrentVerified(lead)) continue;
        if (typeof draft.body === 'string') {
          const next = rewriteEnglishGreeting(draft.body, lead, false);
          if (next !== draft.body) { draft.body = next; changed = true; }
        }
        if (typeof draft.translation === 'string') {
          const next = rewriteKoreanGreeting(draft.translation, lead);
          if (next !== draft.translation) { draft.translation = next; changed = true; }
        }
      }
      if (changed) localStorage.setItem(draftKey, JSON.stringify(drafts));
    }
    localStorage.setItem('kpa.company-greeting-schema', API_VERSION);
  }

  const api = {
    API_VERSION,
    IDENTITY_VERSION,
    hostname,
    emailDomain,
    registrableDomain,
    domainStem,
    brandFromDomain,
    validCompanyName,
    recoverMatchingCandidate,
    canonicalCompanyName,
    validPersonName,
    personFirstName,
    greetingForLead,
    sanitizeLead,
    rewriteEnglishGreeting,
    rewriteKoreanGreeting,
    migrateStorage
  };

  globalThis.KPA_COMPANY_NAMES = api;
  migrateStorage();

  if (typeof window !== 'undefined') {
    setTimeout(() => {
      try {
        if (globalThis.__kpaCompanyGuardPatchedV4) return;
        globalThis.__kpaCompanyGuardPatchedV4 = true;
        if (typeof mergeLeads === 'function') {
          const originalMergeLeads = mergeLeads;
          mergeLeads = incoming => originalMergeLeads((incoming || []).map(sanitizeLead));
        }
        if (typeof patchLead === 'function') {
          const originalPatchLead = patchLead;
          patchLead = (id, patch) => {
            const current = typeof state !== 'undefined' && Array.isArray(state.leads)
              ? state.leads.find(lead => lead.id === id) || {}
              : {};
            return originalPatchLead(id, sanitizeLead({ ...current, ...(patch || {}) }));
          };
        }
        if (typeof state !== 'undefined' && Array.isArray(state.leads)) {
          state.leads = state.leads.map(sanitizeLead);
          if (typeof saveState === 'function') saveState();
          if (typeof render === 'function') render();
        }
      } catch (error) {
        console.warn('company greeting guard v4 failed', error);
      }
    }, 0);
  }
})();
