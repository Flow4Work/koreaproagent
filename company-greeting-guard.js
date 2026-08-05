(() => {
  const API_VERSION = '20260805-domain-greeting-v1';
  const MULTI_LABEL_SUFFIXES = new Set([
    'ac.kr','co.kr','go.kr','ne.kr','or.kr','re.kr','pe.kr',
    'ac.uk','co.uk','gov.uk','ltd.uk','me.uk','net.uk','nhs.uk','org.uk','plc.uk','sch.uk',
    'asn.au','com.au','edu.au','gov.au','id.au','net.au','org.au',
    'ac.jp','co.jp','go.jp','ne.jp','or.jp',
    'com.br','com.cn','com.hk','com.mx','com.sg','com.tr','com.tw','com.vn',
    'co.id','co.in','co.nz','co.th','co.za','net.cn','net.in','org.cn','org.in'
  ]);
  const FREE_EMAIL_DOMAINS = new Set([
    'gmail.com','googlemail.com','yahoo.com','yahoo.co.jp','outlook.com','hotmail.com','live.com','icloud.com','proton.me','protonmail.com'
  ]);
  const BAD_NAME_WORDS = /\b(?:activation|activations|event|events|event\s+list|official\s+site|homepage|home|conference|summit|speaker|speakers|sponsor|sponsors|attendee|attendees|list|directory)\b/i;
  const BAD_PERSON_WORDS = /\b(?:team|support|info|sales|contact|hello|office|media|press|marketing|events?|partnerships?|business|community|operations?|founder|ceo|director|manager|lead)\b/i;
  const COMPOUND_WORDS = [
    'foundation','technology','ventures','protocol','network','capital','digital','systems','system','global','studio','finance','group','media','labs','lab','chain','crypto','vietnam','korea','seoul','web3','tech','dao','ai'
  ];

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
    const suffix = [...MULTI_LABEL_SUFFIXES].find(item => domain.endsWith(`.${item}`));
    return suffix ? domain.slice(0, -(suffix.length + 1)) : domain.split('.')[0];
  }

  function comparable(value = '') {
    return clean(value, 160).toLowerCase().replace(/[^a-z0-9가-힣]+/g, '');
  }

  function stripCandidate(value = '') {
    return clean(value, 160)
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ')
      .replace(/[\[({<][^\])}>]*[\])}>]/g, ' ')
      .replace(/\b20\d{2}\b/g, ' ')
      .replace(BAD_NAME_WORDS, ' ')
      .replace(/\bteam\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s:;,.\-–—·|/]+|[\s:;,.\-–—·|/]+$/g, '')
      .trim();
  }

  function titleWord(word = '') {
    const lower = word.toLowerCase();
    if (/^(ai|dao|vc|vr|ar|xr|ct|io|web3|nft|defi|gtm)$/.test(lower)) return lower.toUpperCase();
    if (/^\d+[a-z]*$/i.test(word)) return word.toUpperCase();
    return lower ? `${lower[0].toUpperCase()}${lower.slice(1)}` : '';
  }

  function formatRecoveredName(value = '') {
    const candidate = stripCandidate(value);
    if (!candidate) return '';
    const words = candidate.split(/\s+/).filter(Boolean);
    if (words.length === 1 && /^[A-Z0-9]{3,12}$/.test(words[0])) return words[0];
    if (words.every(word => /^[A-Z0-9&.-]+$/.test(word))) {
      return words.map(word => word.length <= 4 ? word : titleWord(word)).join(' ');
    }
    return candidate;
  }

  function validCompanyName(value = '') {
    const name = clean(value, 160);
    if (!name || name.length > 50) return false;
    if ((name.match(/\s+/g) || []).length >= 5) return false;
    if (/@|https?:\/\/|\[|\]|\{|\}|<|>|·|\||\b20\d{2}\b/i.test(name)) return false;
    if (BAD_NAME_WORDS.test(name) || /\bteam\b/i.test(name)) return false;
    return /[a-z0-9가-힣]/i.test(name);
  }

  function splitCompoundStem(stem = '') {
    let rest = stem.toLowerCase().replace(/[-_]+/g, ' ').trim();
    if (rest.includes(' ')) return rest.split(/\s+/).filter(Boolean);
    const found = [];
    while (rest) {
      const word = COMPOUND_WORDS.find(item => rest.endsWith(item) && rest.length > item.length);
      if (!word) break;
      found.unshift(word);
      rest = rest.slice(0, -word.length);
    }
    if (rest) found.unshift(rest);
    return found.length ? found : [stem];
  }

  function brandFromDomain(value = '') {
    const stem = domainStem(value);
    if (!stem) return '';
    return splitCompoundStem(stem).map(titleWord).join(' ');
  }

  function recoverMatchingCandidate(raw = '', domain = '') {
    const stem = comparable(domainStem(domain));
    if (!stem) return '';
    const prepared = clean(raw, 200)
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ')
      .replace(/[\[({<][^\])}>]*[\])}>]/g, ' ');
    const segments = prepared.split(/\s*(?:·|\||—|–|\s+-\s+|:)\s*/).map(stripCandidate).filter(Boolean);
    let best = '';
    let bestScore = 0;
    for (const segment of segments) {
      const key = comparable(segment);
      if (!key || key.length < 2) continue;
      let score = 0;
      if (key === stem) score = 100;
      else if (stem.startsWith(key) && key.length >= 3) score = 85;
      else if (key.startsWith(stem) && stem.length >= 3) score = 80;
      else if ((stem.includes(key) || key.includes(stem)) && Math.min(stem.length, key.length) >= 4) score = 65;
      if (score > bestScore || (score === bestScore && segment.length < best.length)) {
        best = segment;
        bestScore = score;
      }
    }
    const formatted = formatRecoveredName(best);
    return bestScore >= 65 && validCompanyName(formatted) ? formatted : '';
  }

  function primaryEmail(lead = {}) {
    const rows = [lead.contact, ...(Array.isArray(lead.contacts) ? lead.contacts : [])].filter(Boolean);
    return clean(rows.find(row => emailDomain(row?.email))?.email || '', 240);
  }

  function trustedExplicitName(lead = {}) {
    const raw = clean(lead.company, 160);
    const trusted = Boolean(
      lead?.contact?.verifiedOverride === true ||
      lead?.contact?.verified_override === true ||
      /^kbw-curated:/i.test(clean(lead.id, 220)) ||
      /(manual|curated|official-web|official_domain|official-domain)/i.test(clean(lead.verified_by, 180))
    );
    return trusted && validCompanyName(raw) ? raw.replace(/\s+team$/i, '').trim() : '';
  }

  function canonicalCompanyName(lead = {}) {
    const trusted = trustedExplicitName(lead);
    if (trusted) return trusted;

    const emailHost = emailDomain(primaryEmail(lead));
    const leadHost = hostname(lead.domain || lead.url || '');
    const preferredHost = emailHost && !FREE_EMAIL_DOMAINS.has(registrableDomain(emailHost)) ? emailHost : leadHost;
    const recovered = recoverMatchingCandidate(lead.company, preferredHost);
    if (recovered) return recovered;
    return brandFromDomain(preferredHost) || '';
  }

  function validPersonName(value = '') {
    const name = clean(value, 80);
    if (!name || name.length > 30 || /\d|@|https?:\/\/|[\[\]{}<>]/i.test(name) || BAD_PERSON_WORDS.test(name)) return false;
    const words = name.split(/\s+/).filter(Boolean);
    return words.length >= 1 && words.length <= 2 && words.every(word => /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,24}$/.test(word));
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
    if (validPersonName(full)) return { ...contact };
    return { ...contact, name: '', first_name: '', last_name: '' };
  }

  function sanitizeLead(lead = {}) {
    if (!lead || typeof lead !== 'object') return lead;
    const company = canonicalCompanyName(lead);
    const contact = sanitizeContact(lead.contact || null);
    const contacts = Array.isArray(lead.contacts) ? lead.contacts.map(sanitizeContact) : lead.contacts;
    return {
      ...lead,
      company: company || '',
      company_name_source: company ? 'verified-or-domain' : 'fallback-there',
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
        if (globalThis.__kpaCompanyGuardPatched) return;
        globalThis.__kpaCompanyGuardPatched = true;
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
        console.warn('company greeting guard patch failed', String(error?.message || error).slice(0, 160));
      }
    }, 0);
  }
})();