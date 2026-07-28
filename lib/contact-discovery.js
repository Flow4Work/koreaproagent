const PROSPEO_SEARCH_URL = 'https://api.prospeo.io/search-person';
const PROSPEO_ENRICH_URL = 'https://api.prospeo.io/enrich-person';
const APOLLO_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_people/api_search';
const APOLLO_ENRICH_URL = 'https://api.apollo.io/api/v1/people/match';
const TOMBA_DOMAIN_URL = 'https://api.tomba.io/v1/domain-search';

const HIT_TTL_MS = 12 * 60 * 60 * 1000;
const MISS_TTL_MS = 20 * 60 * 1000;
const cache = new Map();

const GENERIC_LOCAL_PARTS = new Set([
  'admin','billing','careers','contact','hello','help','hr','info','jobs','legal','marketing','media',
  'office','partners','partnerships','press','privacy','sales','security','support','team'
]);
const GTM_TITLE = /(founder|co-founder|ceo|chief executive|president|vp|vice president|head of|director|country manager|general manager|business development|partnership|growth|sales|revenue|commercial|go-to-market|gtm)/i;

function clean(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function normalizeDomain(value = '') {
  const raw = clean(value, 500);
  if (!raw) return '';
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return raw.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  }
}

function sameDomain(email, domain) {
  const host = clean(email).toLowerCase().split('@')[1] || '';
  return Boolean(host && domain && (host === domain || host.endsWith(`.${domain}`)));
}

function personalEmail(email) {
  const local = clean(email).toLowerCase().split('@')[0] || '';
  return Boolean(local && local.length >= 3 && /[a-z]/.test(local) && !GENERIC_LOCAL_PARTS.has(local));
}

function normalizedStatus(value = '') {
  const status = clean(value, 80).toLowerCase();
  if (['verified','valid','deliverable'].includes(status)) return 'valid';
  if (status.includes('accept')) return 'accept_all';
  return 'unknown';
}

function roleScore(title = '', recommendedRole = '') {
  const text = clean(title, 240).toLowerCase();
  const target = clean(recommendedRole, 120).toLowerCase();
  let score = 0;
  if (target && text.includes(target)) score += 40;
  if (/founder|co-founder|ceo|chief executive|president/.test(text)) score += 36;
  if (/vp|vice president|head of|country manager|general manager/.test(text)) score += 32;
  if (/director/.test(text)) score += 22;
  if (/business development|partnership|growth|sales|revenue|commercial|go-to-market|gtm/.test(text)) score += 26;
  return score;
}

function splitName(fullName = '') {
  const parts = clean(fullName, 180).split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: '', last_name: '' };
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

function toRawContact({
  name = '', title = '', email = '', status = 'unknown', linkedin = '', seniority = '', department = '',
  decisionMaker = false, sources = [], provider = '', score = 0
} = {}) {
  const names = splitName(name);
  return {
    ...names,
    title: clean(title, 220),
    email: clean(email, 240).toLowerCase(),
    confidence: normalizedStatus(status),
    seniority: clean(seniority, 100),
    department: clean(department, 100),
    type: personalEmail(email) ? 'personal' : 'generic',
    decision_maker: Boolean(decisionMaker),
    linkedin_url: clean(linkedin, 500),
    sources: Array.isArray(sources) ? [...new Set(sources.filter(Boolean).map(v => clean(v, 500)))].slice(0, 5) : [],
    provider: clean(provider, 40),
    provider_score: Number(score) || 0
  };
}

function dedupe(contacts = []) {
  const seen = new Set();
  return contacts.filter(contact => {
    const key = `${contact.email || ''}|${contact.linkedin_url || ''}|${contact.first_name || ''}|${contact.last_name || ''}`;
    if (!key.replace(/\|/g, '') || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => (b.provider_score || 0) - (a.provider_score || 0));
}

async function fetchJson(url, options = {}, timeoutMs = 7500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`Provider HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHtml(url, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KoreaProAgent/1.0; public-contact-discovery)' }
    });
    if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) return '';
    return (await response.text()).slice(0, 400000);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function extractEmails(text = '', domain = '') {
  const matches = String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(matches.map(v => v.toLowerCase()))].filter(email => sameDomain(email, domain));
}

function contactLinks(html = '', baseUrl = '', domain = '') {
  const out = [];
  const re = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = re.exec(String(html))) && out.length < 3) {
    try {
      const url = new URL(match[1], baseUrl);
      if (normalizeDomain(url.href) !== domain) continue;
      if (!/(about|team|leadership|company|contact|people|management)/i.test(url.pathname)) continue;
      out.push(url.href);
    } catch { }
  }
  return [...new Set(out)].slice(0, 2);
}

async function publicWebsiteSearch(domain) {
  const homepage = `https://${domain}/`;
  const html = await fetchHtml(homepage);
  if (!html) return [];

  const homeEmails = extractEmails(html, domain).filter(personalEmail);
  if (homeEmails.length) {
    return homeEmails.map(email => toRawContact({ email, sources: [homepage], provider: 'public_web', score: 72 }));
  }

  for (const link of contactLinks(html, homepage, domain)) {
    const page = await fetchHtml(link);
    const emails = extractEmails(page, domain).filter(personalEmail);
    if (emails.length) return emails.map(email => toRawContact({ email, sources: [link], provider: 'public_web', score: 74 }));
  }
  return [];
}

function pickBusinessPerson(rows = [], recommendedRole = '') {
  const ranked = rows.map(row => {
    const person = row?.person || row || {};
    const title = person.current_job_title || person.title || person.headline || '';
    return { person, title, score: roleScore(title, recommendedRole) };
  }).filter(item => GTM_TITLE.test(item.title));
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0] || null;
}

async function prospeoSearch(domain, recommendedRole) {
  const key = process.env.PROSPEO_API_KEY;
  if (!key) return [];
  const search = await fetchJson(PROSPEO_SEARCH_URL, {
    method: 'POST',
    headers: { 'X-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: 1, filters: { company: { websites: { include: [domain] } } } })
  });
  const best = pickBusinessPerson(Array.isArray(search?.results) ? search.results : [], recommendedRole);
  const personId = clean(best?.person?.person_id || best?.person?.id, 100);
  if (!personId) return [];

  const enriched = await fetchJson(PROSPEO_ENRICH_URL, {
    method: 'POST',
    headers: { 'X-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ only_verified_email: true, data: { person_id: personId } })
  });
  const person = enriched?.person || {};
  const email = clean(person?.email?.email || person?.email, 240);
  if (!email || !sameDomain(email, domain)) return [];
  const title = person.current_job_title || best?.title || '';
  const currentJob = Array.isArray(person.job_history) ? person.job_history.find(job => job?.current) : null;
  return [toRawContact({
    name: person.full_name || `${person.first_name || ''} ${person.last_name || ''}`,
    title,
    email,
    status: person?.email?.status || 'verified',
    linkedin: person.linkedin_url,
    seniority: currentJob?.seniority || '',
    department: Array.isArray(currentJob?.departments) ? currentJob.departments.join(', ') : '',
    decisionMaker: GTM_TITLE.test(title),
    sources: ['prospeo.io'],
    provider: 'prospeo',
    score: 90 + roleScore(title, recommendedRole)
  })];
}

function appendParams(params, key, values) {
  for (const value of values.filter(Boolean)) params.append(key, value);
}

async function apolloSearch(domain, recommendedRole) {
  const key = process.env.APOLLO_API_KEY;
  if (!key) return [];
  const params = new URLSearchParams({ page: '1', per_page: '10', include_similar_titles: 'true' });
  appendParams(params, 'q_organization_domains_list[]', [domain]);
  appendParams(params, 'person_titles[]', [recommendedRole, 'Head of Sales', 'Head of Partnerships', 'Business Development', 'Head of Growth', 'Founder', 'CEO']);
  appendParams(params, 'person_seniorities[]', ['owner','founder','c_suite','vp','head','director']);
  appendParams(params, 'contact_email_status[]', ['verified']);

  const search = await fetchJson(`${APOLLO_SEARCH_URL}?${params}`, {
    method: 'POST',
    headers: { 'X-Api-Key': key, Accept: 'application/json', 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
  });
  const best = pickBusinessPerson(Array.isArray(search?.people) ? search.people : [], recommendedRole);
  const person = best?.person || {};
  if (!person.first_name && !person.last_name && !person.name) return [];

  const enrich = new URLSearchParams({ domain, reveal_personal_emails: 'false', reveal_phone_number: 'false' });
  if (person.first_name && person.last_name) {
    enrich.set('first_name', clean(person.first_name, 100));
    enrich.set('last_name', clean(person.last_name, 100));
  } else {
    enrich.set('name', clean(person.name, 180));
  }

  const enriched = await fetchJson(`${APOLLO_ENRICH_URL}?${enrich}`, {
    method: 'POST',
    headers: { 'X-Api-Key': key, Accept: 'application/json', 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
  });
  const value = enriched?.person || {};
  const email = clean(value.email, 240);
  if (!email || !sameDomain(email, domain)) return [];
  const title = value.title || best?.title || '';
  return [toRawContact({
    name: value.name || `${value.first_name || ''} ${value.last_name || ''}`,
    title,
    email,
    status: value.email_status,
    linkedin: value.linkedin_url,
    seniority: value.seniority,
    department: Array.isArray(value.departments) ? value.departments.join(', ') : value.department || '',
    decisionMaker: GTM_TITLE.test(title),
    sources: ['apollo.io'],
    provider: 'apollo',
    score: 88 + roleScore(title, recommendedRole)
  })];
}

async function tombaSearch(domain, recommendedRole) {
  const key = process.env.TOMBA_API_KEY;
  const secret = process.env.TOMBA_API_SECRET;
  if (!key || !secret) return [];
  const params = new URLSearchParams({ domain, company: domain.split('.')[0] || domain });
  const data = await fetchJson(`${TOMBA_DOMAIN_URL}?${params}`, {
    headers: { 'X-Tomba-Key': key, 'X-Tomba-Secret': secret, Accept: 'application/json' }
  });
  const rows = Array.isArray(data?.data?.emails) ? data.data.emails : [];
  return rows.map(row => {
    const title = row.position || '';
    return toRawContact({
      name: row.full_name || `${row.first_name || ''} ${row.last_name || ''}`,
      title,
      email: row.email,
      status: row?.verification?.status,
      linkedin: row.linkedin,
      seniority: row.seniority,
      department: row.department,
      decisionMaker: GTM_TITLE.test(title),
      sources: ['tomba.io', ...(Array.isArray(row.sources) ? row.sources.map(source => source?.uri).filter(Boolean) : [])],
      provider: 'tomba',
      score: (Number(row.score) || 0) + roleScore(title, recommendedRole)
    });
  }).filter(contact => contact.email && sameDomain(contact.email, domain));
}

export function contactProviderStatus() {
  return {
    publicWeb: true,
    prospeo: Boolean(process.env.PROSPEO_API_KEY),
    apollo: Boolean(process.env.APOLLO_API_KEY),
    tomba: Boolean(process.env.TOMBA_API_KEY && process.env.TOMBA_API_SECRET)
  };
}

export function contactDiscoveryConfigured() {
  return true;
}

export function clearContactCache() {
  cache.clear();
}

export async function findContacts(domainOrUrl, options = {}) {
  const domain = normalizeDomain(domainOrUrl);
  if (!domain) return { emails: [], company: null, provider: null, attempts: [] };
  const recommendedRole = clean(options.recommendedRole || '', 120);
  const cacheKey = `${domain}|${recommendedRole.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cacheHit: true };
  if (cached) cache.delete(cacheKey);

  const configured = contactProviderStatus();
  const attempts = [];
  const steps = [
    ['public_web', () => publicWebsiteSearch(domain), true],
    ['prospeo', () => prospeoSearch(domain, recommendedRole), configured.prospeo],
    ['apollo', () => apolloSearch(domain, recommendedRole), configured.apollo],
    ['tomba', () => tombaSearch(domain, recommendedRole), configured.tomba]
  ];

  for (const [provider, run, enabled] of steps) {
    if (!enabled) {
      attempts.push({ provider, status: 'skipped' });
      continue;
    }
    try {
      const emails = dedupe(await run());
      if (emails.length) {
        const maxContacts = Math.min(Number(options.maxContacts) || 10, 10);
        const value = { emails: emails.slice(0, maxContacts), company: null, provider, attempts: [...attempts, { provider, status: 'found' }] };
        cache.set(cacheKey, { expiresAt: Date.now() + HIT_TTL_MS, value });
        return value;
      }
      attempts.push({ provider, status: 'empty' });
    } catch (error) {
      attempts.push({ provider, status: 'error', code: Number(error?.status) || null });
    }
  }

  const value = { emails: [], company: null, provider: null, attempts };
  cache.set(cacheKey, { expiresAt: Date.now() + MISS_TTL_MS, value });
  return value;
}

function contactStatus(contact = {}) {
  return normalizedStatus(contact?.verification?.status || contact?.emailStatus || contact?.confidence || '');
}

export function scoreContact(contact = {}) {
  let score = Number(contact.provider_score) || 0;
  const status = contactStatus(contact);
  if (status === 'valid') score += 30;
  else if (status === 'accept_all') score += 15;
  else score += 5;
  if (contact.seniority === 'executive') score += 25;
  else if (contact.seniority === 'senior') score += 15;
  if (contact.type === 'personal') score += 20;
  else if (contact.type === 'generic') score += 5;
  if (contact.decision_maker || contact.decisionMaker) score += 15;
  if (contact.linkedin_url || contact.linkedinUrl) score += 5;
  return score;
}

function normalizeSources(contact = {}) {
  const rows = Array.isArray(contact.sources) ? contact.sources : [];
  const sources = rows.map(source => typeof source === 'string' ? source : source?.uri || source?.url || '').filter(Boolean);
  if (sources.length) return [...new Set(sources)].slice(0, 5);
  return contact.provider ? [String(contact.provider)] : [];
}

export function normalizeContacts(rawEmails = [], recommendedRole = '') {
  if (!Array.isArray(rawEmails)) return [];
  const role = clean(recommendedRole, 120).toLowerCase();
  const contacts = rawEmails.map(contact => {
    const title = clean(contact.title || contact.position || '', 200);
    let matchBonus = 0;
    if (role && title.toLowerCase().includes(role)) matchBonus += 30;
    else if (GTM_TITLE.test(title)) matchBonus += 15;
    const name = clean(contact.first_name, 100)
      ? `${clean(contact.first_name, 100)} ${clean(contact.last_name, 100)}`.trim()
      : clean(contact.full_name || contact.name || '', 180);
    return {
      name,
      title,
      email: clean(contact.email || '', 200),
      emailStatus: contactStatus(contact),
      seniority: contact.seniority || '',
      department: contact.department || '',
      linkedinUrl: contact.linkedin_url || contact.linkedinUrl || contact.linkedin || '',
      decisionMaker: Boolean(contact.decision_maker || contact.decisionMaker),
      sources: normalizeSources(contact),
      provider: contact.provider || '',
      score: scoreContact(contact) + matchBonus
    };
  }).filter(contact => contact.email || contact.linkedinUrl || contact.name);
  contacts.sort((a, b) => b.score - a.score);
  return contacts;
}
