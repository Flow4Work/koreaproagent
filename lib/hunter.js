const HUNTER_URL = 'https://api.hunter.io/v2/domain-search';

const hunterDomainCache = new Set();

export function hunterConfigured() {
  return Boolean(process.env.HUNTER_API_KEY);
}

export function clearDomainCache() {
  hunterDomainCache.clear();
}

export async function findContacts(domain, options = {}) {
  if (!process.env.HUNTER_API_KEY) throw new Error('HUNTER_API_KEY missing');
  const cleanDomain = String(domain).replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  if (!cleanDomain) return { emails: [], company: null };
  if (hunterDomainCache.has(cleanDomain)) return { emails: [], company: null, cached: true };
  hunterDomainCache.add(cleanDomain);
  const c = new AbortController(), t = setTimeout(() => c.abort(), 12000), started = Date.now();
  try {
    const params = new URLSearchParams({ domain: cleanDomain, api_key: process.env.HUNTER_API_KEY });
    if (options.offset) params.set('offset', options.offset);
    if (options.limit) params.set('limit', options.limit);

    const apiOptions = { decision_maker: true, seniority: 'executive,senior', department: 'executive,sales,management,marketing,operations' };
    if (options.includeFilters !== false) {
      const fm = { ...apiOptions, ...(options.filterOverrides || {}) };
      for (const [k, v] of Object.entries(fm)) {
        if (v !== undefined && v !== null) params.set(k, v);
      }
    }
    const response = await fetch(`${HUNTER_URL}?${params}`, { signal: c.signal });
    const raw = await response.text();
    if (!response.ok) {
      if (response.status === 451) return { emails: [], company: null, blocked: true };
      const e = new Error(`Hunter HTTP ${response.status}: ${raw.slice(0, 200)}`);
      e.status = response.status;
      throw e;
    }
    const data = JSON.parse(raw);
    const emails = Array.isArray(data?.data?.emails) ? data.data.emails : [];
    const scored = emails.map(e => ({ ...e, _score: scoreContact(e) }));
    scored.sort((a, b) => b._score - a._score);
    const maxContacts = Math.min(options.maxContacts || 10, 10);
    return {
      emails: scored.slice(0, maxContacts).map(e => { const { _score, ...rest } = e; return rest; }),
      company: data?.data?.company || null
    };
  } catch (e) {
    if (e?.name === 'AbortError') { const x = new Error('Hunter search timed out'); x.status = 504; throw x; }
    throw e;
  } finally { clearTimeout(t); }
}

export function scoreContact(email) {
  let score = 0;
  if (email.confidence === 'valid') score += 30;
  else if (email.confidence === 'accept_all') score += 15;
  else score += 5;
  if (email.seniority === 'executive') score += 25;
  else if (email.seniority === 'senior') score += 15;
  const deptMap = { executive: 20, sales: 15, marketing: 10, management: 10, operations: 5 };
  score += deptMap[email.department] || 0;
  if (email.type === 'personal') score += 20;
  else if (email.type === 'generic') score += 5;
  else score += 10;
  if (email.decision_maker || email.decisionMaker) score += 15;
  if (email.linkedin_url) score += 5;
  return score;
}

export function normalizeContacts(rawEmails = [], recommendedRole = '') {
  if (!Array.isArray(rawEmails)) return [];
  const role = String(recommendedRole).toLowerCase().trim();
  const scored = rawEmails.map(c => {
    const title = String(c.title || c.position || '').toLowerCase();
    let matchBonus = 0;
    if (role && title.includes(role)) matchBonus += 30;
    else if (/(founder|ceo|chief executive|vp|vice president|head of|country manager|business development|partnership|growth|sales)/i.test(title)) matchBonus += 15;
    const baseScore = scoreContact(c);
    return {
      name: String(c.first_name || '').trim() ? `${String(c.first_name || '').trim()} ${String(c.last_name || '').trim()}`.trim() : '',
      title: String(c.title || c.position || '').slice(0, 200),
      email: String(c.email || '').slice(0, 200),
      emailStatus: c.confidence === 'valid' ? 'valid' : c.confidence === 'accept_all' ? 'accept_all' : 'unknown',
      seniority: c.seniority || '',
      department: c.department || '',
      linkedinUrl: c.linkedin_url || '',
      decisionMaker: Boolean(c.decision_maker || c.decisionMaker),
      sources: ['hunter.io'],
      score: baseScore + matchBonus
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}
