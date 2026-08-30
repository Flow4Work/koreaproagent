(() => {
  const API_VERSION = '20260830-email-domain-identity-v5-compat';
  const IDENTITY_VERSION = '20260830-email-domain-identity-v5';
  const MULTI_SUFFIXES = new Set([
    'ac.kr','co.kr','go.kr','ne.kr','or.kr','re.kr','pe.kr','ac.uk','co.uk','gov.uk','ltd.uk','me.uk','net.uk','nhs.uk','org.uk','plc.uk','sch.uk',
    'asn.au','com.au','edu.au','gov.au','id.au','net.au','org.au','ac.jp','co.jp','go.jp','ne.jp','or.jp','com.br','com.cn','com.hk','com.mx','com.sg',
    'com.tr','com.tw','com.vn','co.id','co.in','co.nz','co.th','co.za','net.cn','net.in','org.cn','org.in'
  ]);
  const BAD_NAME = /\b(?:activation|activations|event|events|event\s+list|official\s+site|homepage|conference|summit|speaker|speakers|sponsor|sponsors|attendee|attendees|directory|logo)\b/i;
  const BAD_PERSON = /\b(?:team|support|info|sales|contact|hello|office|media|press|marketing|events?|partnerships?|business|community|operations?|founder|ceo|director|manager|lead)\b/i;

  const clean = (value = '', max = 240) => String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };

  function hostname(value = '') {
    let raw = clean(value, 500).toLowerCase();
    if (!raw) return '';
    if (raw.includes('@') && !raw.includes('://')) raw = raw.split('@').pop() || '';
    try { return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, '').replace(/\.+$/, ''); }
    catch { return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split(':')[0].replace(/\.+$/, ''); }
  }

  function registrableDomain(value = '') {
    const host = hostname(value);
    const parts = host.split('.').filter(Boolean);
    if (parts.length <= 2) return host;
    const suffix2 = parts.slice(-2).join('.');
    return parts.slice(-(MULTI_SUFFIXES.has(suffix2) ? 3 : 2)).join('.');
  }

  function domainStem(value = '') {
    const domain = registrableDomain(value);
    if (!domain) return '';
    const parts = domain.split('.');
    const suffix2 = parts.slice(-2).join('.');
    return MULTI_SUFFIXES.has(suffix2) ? parts.slice(0, -2).join('') : parts[0];
  }

  function brandFromDomain(value = '') {
    return domainStem(value).replace(/[-_]+/g, ' ').trim();
  }

  function validCompanyName(value = '') {
    const name = clean(value, 160);
    if (!name || name.length > 80) return false;
    if (/@|https?:\/\/|\[|\]|\{|\}|<|>|·|\||\b20\d{2}\b/i.test(name)) return false;
    if (BAD_NAME.test(name) || /\bteam\b/i.test(name)) return false;
    return /[\p{L}\p{N}]/u.test(name);
  }

  function identityRecord(lead = {}) {
    const identity = lead?.company_identity;
    return identity && typeof identity === 'object' ? identity : null;
  }

  function identityCurrentVerified(lead = {}) {
    const identity = identityRecord(lead);
    return Boolean(identity
      && identity.identity_version === IDENTITY_VERSION
      && identity.status === 'verified'
      && Number(identity.confidence || 0) >= 0.85
      && validCompanyName(identity.greeting_name || identity.brand_name || ''));
  }

  function canonicalCompanyName(lead = {}) {
    const identity = identityRecord(lead);
    if (identityCurrentVerified(lead)) return clean(identity.greeting_name || identity.brand_name, 160);
    if (identity) return validCompanyName(lead.company) ? clean(lead.company, 160) : '';
    return validCompanyName(lead.company) ? clean(lead.company, 160).replace(/\s+team$/i, '').trim() : '';
  }

  function recoverMatchingCandidate() {
    return '';
  }

  function validPersonName(value = '') {
    const name = clean(value, 80);
    if (!name || name.length > 40 || /\d|@|https?:\/\/|[\[\]{}<>]/i.test(name) || BAD_PERSON.test(name)) return false;
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
    const company = canonicalCompanyName(lead);
    return {
      ...lead,
      company: company || clean(lead.company, 160),
      company_name_source: identityCurrentVerified(lead) ? 'recipient-email-domain-v5' : lead.company_name_source,
      contact: sanitizeContact(lead.contact || null),
      contacts: Array.isArray(lead.contacts) ? lead.contacts.map(sanitizeContact) : lead.contacts
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

  function migrateStorage() {
    if (typeof localStorage === 'undefined') return;
    const leadKey = 'kpa.hunt.leads';
    const leads = load(leadKey, []);
    if (!Array.isArray(leads)) return;
    const sanitized = leads.map(sanitizeLead);
    localStorage.setItem(leadKey, JSON.stringify(sanitized));
    const byId = new Map(sanitized.map(lead => [lead.id, lead]));

    for (const draftKey of ['kpa.mail.review.drafts.v5', 'kpa.mail.review.drafts.v4']) {
      const drafts = load(draftKey, {});
      if (!drafts || typeof drafts !== 'object') continue;
      let changed = false;
      for (const [id, draft] of Object.entries(drafts)) {
        const lead = byId.get(id);
        if (!lead || !draft || typeof draft !== 'object' || !identityCurrentVerified(lead)) continue;
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
})();
