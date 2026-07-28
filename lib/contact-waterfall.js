import { findContacts as findHunterContacts, hunterConfigured, normalizeContacts } from './hunter.js';

const PROSPEO_SEARCH_URL = 'https://api.prospeo.io/search-person';
const PROSPEO_ENRICH_URL = 'https://api.prospeo.io/enrich-person';
const APOLLO_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_people/api_search';
const APOLLO_ENRICH_URL = 'https://api.apollo.io/api/v1/people/match';
const TOMBA_DOMAIN_URL = 'https://api.tomba.io/v1/domain-search';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MISS_TTL_MS = 20 * 60 * 1000;
const contactCache = new Map();

const GENERIC_LOCAL_PARTS = new Set([
  'admin', 'billing', 'careers', 'contact', 'hello', 'help', 'hr', 'info', 'jobs', 'legal',
  'marketing', 'media', 'office', 'partners', 'partnerships', 'press', 'privacy', 'sales',
  'security', 'support', 'team'
]);

const BUSINESS_TITLE_RE = /(founder|co-founder|ceo|chief executive|president|vp|vice president|head of|director|country manager|general manager|business development|partnership|growth|sales|revenue|commercial|go-to-market|gtm)/i;

function clean(v, max = 500) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function domainFrom(value = '') {
  const raw = clean(value, 500);
  if (!raw) return '';
  try {
    const withProtocol = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return raw.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  }
}

function isSameDomain(email, domain) {
  const host = clean(email).toLowerCase().split('@')[1] || '';
  return Boolean(host && domain && (host === domain || host.endsWith(`.${domain}`)));
}

function isPersonalEmail(email) {
  const local = clean(email).toLowerCase().split('@')[0] || '';
  if (!local || GENERIC_LOCAL_PARTS.has(local)) return false;
  return /[a-z]/.test(local) && local.length >= 3;
}

function roleScore(title = '', recommendedRole = '') {
  const t = clean(title, 240).toLowerCase();
  const role = clean(recommendedRole, 120).toLowerCase();
  let score = 0;
  if (role && t.includes(role)) score += 45;
  if (/founder|co-founder|ceo|chief executive|president/.test(t)) score += 35;
  if (/vp|vice president|head of|country manager|general manager/.test(t)) score += 30;
  if (/director/.test(t)) score += 22;
  if (/business development|partnership|growth|sales|revenue|commercial|go-to-market|gtm/.test(t)) score += 24;
  if (/marketing|operations/.test(t)) score += 10;
  return score;
}

function normalizeEmailStatus(status = '') {
  const s = clean(status, 80).toLowerCase();
  if (['verified', 'valid', 'deliverable'].includes(s)) return 'valid';
  if (s.includes('accept')) return 'accept_all';
  return 'unknown';
}

function standardContact({ name = '', title = '', email = '', emailStatus = 'unknown', linkedinUrl = '', seniority = '', department = '', decisionMaker = false, sources = [], score = 0, provider = '' } = {}) {
  return {
    name: clean(name, 180),
    title: clean(title, 220),
    email: clean(email, 240).toLowerCase(),
    emailStatus: normalizeEmailStatus(emailStatus),
    seniority: clean(seniority, 100),
    department: clean(department, 100),
    linkedinUrl: clean(linkedinUrl, 500),
    decisionMaker: Boolean(decisionMaker),
    sources: Array.isArray(sources) ? [...new Set(sources.filter(Boolean).map(s => clean(s, 500)))].slice(0, 5) : [],
    score: Number(score) || 0,
    provider: clean(provider, 40)
  };
}

async function fetchJson(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${raw.slice(0, 180)}`);
      error.status = response.status;
      throw error;
    }
    return raw ? JSON.parse(raw) : {};
  } finally {
    clearTimeout(timer);
  }
}

function extractEmails(text = '', domain = '') {
  const matches = String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(matches.map(x => x.toLowerCase()))]
    .filter(email => isSameDomain(email, domain));
}

function extractInternalLinks(html = '', baseUrl = '', domain = '') {
  const out = [];
  const re = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = re.exec(String(html))) && out.length < 30) {
    try {
      const url = new URL(match[1], baseUrl);
      if (domainFrom(url.href) !== domain) continue;
      if (!/(about|team|leadership|company|contact|people|management)/i.test(url.pathname)) continue;
      out.push(url.href);
    } catch { }
  }
  return [...new Set(out)].slice(0, 2);
}

async function fetchHtml(url, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KoreaProAgent/1.0; contact-discovery)' }
    });
    if (!response.ok) return '';
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return '';
    return (await response.text()).slice(0, 500000);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function findPublicContacts(officialUrl, evidenceRows = []) {
  const domain = domainFrom(officialUrl);
  if (!domain) return [];
  const found = [];

  for (const row of Array.isArray(evidenceRows) ? evidenceRows : []) {
    const text = `${row?.title || ''}\n${row?.content || ''}`;
    for (const email of extractEmails(text, domain)) {
      if (!isPersonalEmail(email)) continue;
      found.push(standardContact({
        email,
        emailStatus: 'unknown',
        sources: [row?.url].filter(Boolean),
        score: 62,
        provider: 'public_web'
      }));
    }
  }

  if (found.length) return dedupeContacts(found);

  const homepage = /^https?:\/\//i.test(officialUrl) ? officialUrl : `https://${domain}/`;
  const html = await fetchHtml(homepage);
  if (!html) return [];
  for (const email of extractEmails(html, domain)) {
    if (!isPersonalEmail(email)) continue;
    found.push(standardContact({ email, emailStatus: 'unknown', sources: [homepage], score: 68, provider: 'public_web' }));
  }

  if (found.length) return dedupeContacts(found);

  const links = extractInternalLinks(html, homepage, domain);
  for (const link of links) {
    const page = await fetchHtml(link);
    for (const email of extractEmails(page, domain)) {
      if (!isPersonalEmail(email)) continue;
      found.push(standardContact({ email, emailStatus: 'unknown', sources: [link], score: 70, provider: 'public_web' }));
    }
    if (found.length) break;
  }
  return dedupeContacts(found);
}

function dedupeContacts(contacts = []) {
  const seen = new Set();
  return contacts.filter(contact => {
    const key = `${contact.email || ''}|${contact.linkedinUrl || ''}|${contact.name || ''}`;
    if (!key.replace(/\|/g, '')) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => (b.score || 0) - (a.score || 0));
}

function pickBestPerson(rows = [], recommendedRole = '') {
  const candidates = rows.map(row => {
    const person = row?.person || row || {};
    const title = person.current_job_title || person.title || person.headline || '';
    return { row, person, title, score: roleScore(title, recommendedRole) };
  }).filter(x => BUSINESS_TITLE_RE.test(x.title));
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

async function findWithProspeo(company, officialUrl, recommendedRole) {
  const key = process.env.PROSPEO_API_KEY;
  if (!key) return [];
  const domain = domainFrom(officialUrl);
  if (!domain) return [];

  const search = await fetchJson(PROSPEO_SEARCH_URL, {
    method: 'POST',
    headers: { 'X-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: 1, filters: { company: { websites: { include: [domain] } } } })
  });
  const best = pickBestPerson(Array.isArray(search?.results) ? search.results : [], recommendedRole);
  const personId = clean(best?.person?.person_id || best?.person?.id, 100);
  if (!personId) return [];

  const enriched = await fetchJson(PROSPEO_ENRICH_URL, {
    method: 'POST',
    headers: { 'X-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ only_verified_email: true, data: { person_id: personId } })
  });
  const person = enriched?.person || {};
  const email = clean(person?.email?.email || person?.email, 240);
  if (!email || !isSameDomain(email, domain)) return [];
  const title = person.current_job_title || best?.title || '';
  const currentJob = Array.isArray(person.job_history) ? person.job_history.find(j => j?.current) : null;
  return [standardContact({
    name: person.full_name || `${person.first_name || ''} ${person.last_name || ''}`,
    title,
    email,
    emailStatus: person?.email?.status || 'verified',
    linkedinUrl: person.linkedin_url,
    seniority: currentJob?.seniority || '',
    department: Array.isArray(currentJob?.departments) ? currentJob.departments.join(', ') : '',
    decisionMaker: BUSINESS_TITLE_RE.test(title),
    sources: ['prospeo.io'],
    score: 80 + roleScore(title, recommendedRole),
    provider: 'prospeo'
  })];
}

function appendParam(params, key, values) {
  for (const value of values.filter(Boolean)) params.append(key, value);
}

async function findWithApollo(company, officialUrl, recommendedRole) {
  const key = process.env.APOLLO_API_KEY;
  if (!key) return [];
  const domain = domainFrom(officialUrl);
  if (!domain) return [];

  const params = new URLSearchParams({ page: '1', per_page: '10', include_similar_titles: 'true' });
  appendParam(params, 'q_organization_domains_list[]', [domain]);
  appendParam(params, 'person_titles[]', [recommendedRole, 'Head of Sales', 'Head of Partnerships', 'Business Development', 'Founder', 'CEO']);
  appendParam(params, 'person_seniorities[]', ['owner', 'founder', 'c_suite', 'vp', 'head', 'director']);
  appendParam(params, 'contact_email_status[]', ['verified']);

  const search = await fetchJson(`${APOLLO_SEARCH_URL}?${params}`, {
    method: 'POST',
    headers: { 'X-Api-Key': key, Accept: 'application/json', 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
  });
  const people = Array.isArray(search?.people) ? search.people : [];
  const best = pickBestPerson(people, recommendedRole);
  const person = best?.person || {};
  const first = clean(person.first_name, 100);
  const last = clean(person.last_name, 100);
  const fullName = clean(person.name, 180);
  if ((!first || !last) && !fullName) return [];

  const enrichParams = new URLSearchParams({ domain, reveal_personal_emails: 'false', reveal_phone_number: 'false' });
  if (first && last) {
    enrichParams.set('first_name', first);
    enrichParams.set('last_name', last);
  } else {
    enrichParams.set('name', fullName);
  }
  const enriched = await fetchJson(`${APOLLO_ENRICH_URL}?${enrichParams}`, {
    method: 'POST',
    headers: { 'X-Api-Key': key, Accept: 'application/json', 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
  });
  const p = enriched?.person || {};
  const email = clean(p.email, 240);
  if (!email || !isSameDomain(email, domain)) return [];
  const title = p.title || best?.title || '';
  return [standardContact({
    name: p.name || `${p.first_name || ''} ${p.last_name || ''}`,
    title,
    email,
    emailStatus: p.email_status || 'unknown',
    linkedinUrl: p.linkedin_url,
    seniority: p.seniority || '',
    department: Array.isArray(p.departments) ? p.departments.join(', ') : p.department || '',
    decisionMaker: BUSINESS_TITLE_RE.test(title),
    sources: ['apollo.io'],
    score: 78 + roleScore(title, recommendedRole),
    provider: 'apollo'
  })];
}

async function findWithHunter(officialUrl, recommendedRole) {
  if (!hunterConfigured()) return [];
  const result = await findHunterContacts(officialUrl, { maxContacts: 10, includeFilters: true });
  if (result?.blocked || result?.cached) return [];
  return normalizeContacts(result?.emails || [], recommendedRole).map(c => ({ ...c, provider: 'hunter' }));
}

async function findWithTomba(company, officialUrl, recommendedRole) {
  const key = process.env.TOMBA_API_KEY;
  const secret = process.env.TOMBA_API_SECRET;
  if (!key || !secret) return [];
  const domain = domainFrom(officialUrl);
  if (!domain) return [];
  const params = new URLSearchParams({ domain, company: clean(company, 120) });
  const data = await fetchJson(`${TOMBA_DOMAIN_URL}?${params}`, {
    method: 'GET',
    headers: { 'X-Tomba-Key': key, 'X-Tomba-Secret': secret, Accept: 'application/json' }
  });
  const rows = Array.isArray(data?.data?.emails) ? data.data.emails : [];
  return dedupeContacts(rows.map(row => {
    const title = row.position || '';
    const verified = row?.verification?.status || '';
    return standardContact({
      name: row.full_name || `${row.first_name || ''} ${row.last_name || ''}`,
      title,
      email: row.email,
      emailStatus: verified,
      linkedinUrl: row.linkedin,
      seniority: row.seniority,
      department: row.department,
      decisionMaker: BUSINESS_TITLE_RE.test(title),
      sources: ['tomba.io', ...(Array.isArray(row.sources) ? row.sources.map(s => s?.uri).filter(Boolean) : [])],
      score: (Number(row.score) || 0) + roleScore(title, recommendedRole),
      provider: 'tomba'
    });
  }).filter(c => c.email && isSameDomain(c.email, domain) && (BUSINESS_TITLE_RE.test(c.title) || c.score >= 65)));
}

export function contactProvidersConfigured() {
  return {
    publicWeb: true,
    prospeo: Boolean(process.env.PROSPEO_API_KEY),
    apollo: Boolean(process.env.APOLLO_API_KEY),
    hunter: hunterConfigured(),
    tomba: Boolean(process.env.TOMBA_API_KEY && process.env.TOMBA_API_SECRET)
  };
}

export function clearContactCache() {
  contactCache.clear();
}

export async function findBestContact({ company, officialUrl, recommendedRole = 'Head of Sales', evidenceRows = [] } = {}) {
  const domain = domainFrom(officialUrl);
  if (!domain) return { contacts: [], reason: 'invalid_domain', provider: null, attempts: [] };
  const cacheKey = `${domain}|${clean(recommendedRole, 120).toLowerCase()}`;
  const cached = contactCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cached: true };
  if (cached) contactCache.delete(cacheKey);

  const attempts = [];
  const configuredProviders = contactProvidersConfigured();
  const steps = [
    ['public_web', () => findPublicContacts(officialUrl, evidenceRows)],
    ['prospeo', () => findWithProspeo(company, officialUrl, recommendedRole)],
    ['apollo', () => findWithApollo(company, officialUrl, recommendedRole)],
    ['hunter', () => findWithHunter(officialUrl, recommendedRole)],
    ['tomba', () => findWithTomba(company, officialUrl, recommendedRole)]
  ];

  for (const [provider, run] of steps) {
    const configured = provider === 'public_web' || configuredProviders[provider];
    if (!configured) {
      attempts.push({ provider, status: 'skipped' });
      continue;
    }
    try {
      const contacts = dedupeContacts(await run());
      if (contacts.length) {
        const value = { contacts, reason: 'found', provider, attempts: [...attempts, { provider, status: 'found' }] };
        contactCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
        return value;
      }
      attempts.push({ provider, status: 'empty' });
    } catch (error) {
      attempts.push({ provider, status: 'error', code: Number(error?.status) || null });
    }
  }

  const value = { contacts: [], reason: 'no_contacts', provider: null, attempts };
  contactCache.set(cacheKey, { expiresAt: Date.now() + MISS_TTL_MS, value });
  return value;
}
