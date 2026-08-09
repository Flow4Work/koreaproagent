const PROSPEO_SEARCH_URL = 'https://api.prospeo.io/search-person';
const PROSPEO_ENRICH_URL = 'https://api.prospeo.io/enrich-person';
const APOLLO_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_people/api_search';
const APOLLO_ENRICH_URL = 'https://api.apollo.io/api/v1/people/match';
const TOMBA_DOMAIN_URL = 'https://api.tomba.io/v1/domain-search';

const GENERIC = new Set([
  'admin','billing','careers','contact','hello','help','hr','info','jobs','legal','marketing','media',
  'office','partners','partnership','partnerships','press','privacy','sales','security','support','team',
  'business','bizdev','bd','events','event','community','operations','ops'
]);
const JUNK = new Set([
  'billing','careers','hr','jobs','legal','privacy','security','noreply','no-reply','donotreply','abuse',
  'postmaster','webmaster','support','help'
]);
const GTM_TITLE = /(founder|co-founder|ceo|chief executive|president|vp|vice president|head of|director|country manager|general manager|business development|partnership|growth|sales|revenue|commercial|go-to-market|gtm|operations|events|community|marketing|field marketing|experiential|brand activation)/i;
const PAGE_PATH = /(about|team|leadership|company|contact|people|management|press|media|partner|partnership|business|events|community|marketing|sponsor|exhibitor|speaker)/i;

function clean(value = '', max = 500) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
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

function localPart(email = '') {
  return clean(email, 240).toLowerCase().split('@')[0] || '';
}

function sameDomain(email = '', domain = '') {
  const host = clean(email, 240).toLowerCase().split('@')[1] || '';
  return Boolean(host && domain && (host === domain || host.endsWith(`.${domain}`)));
}

function personalEmail(email = '') {
  const local = localPart(email);
  return Boolean(local && local.length >= 3 && /[a-z]/.test(local) && !GENERIC.has(local));
}

function statusOf(value = '') {
  const status = clean(value, 80).toLowerCase().replace(/[\s-]+/g, '_');
  if (['verified','valid','deliverable','safe'].includes(status)) return 'valid';
  if (status.includes('accept')) return 'accept_all';
  if (['invalid','undeliverable','disposable','webmail'].includes(status)) return 'invalid';
  return 'unknown';
}

function roleScore(title = '', recommendedRole = '', roleTargets = []) {
  const text = clean(title, 240).toLowerCase();
  const targets = [recommendedRole, ...(Array.isArray(roleTargets) ? roleTargets : [])]
    .map(value => clean(value, 120).toLowerCase()).filter(Boolean);
  let score = 0;
  if (targets.some(target => text.includes(target) || target.includes(text))) score += 35;
  if (/founder|co-founder|ceo|chief executive|president/.test(text)) score += 32;
  else if (/vp|vice president|head of|country manager|general manager/.test(text)) score += 28;
  else if (/director/.test(text)) score += 22;
  if (GTM_TITLE.test(text)) score += 18;
  return score;
}

function splitName(name = '') {
  const parts = clean(name, 180).split(/\s+/).filter(Boolean);
  return { first_name: parts[0] || '', last_name: parts.slice(1).join(' ') };
}

function shapeContact({
  name = '', title = '', email = '', status = 'unknown', linkedin = '', seniority = '', department = '',
  decisionMaker = false, sources = [], provider = '', providerScore = 0
} = {}) {
  const names = splitName(name);
  return {
    ...names,
    title: clean(title, 220),
    email: clean(email, 240).toLowerCase(),
    confidence: statusOf(status),
    linkedin_url: clean(linkedin, 500),
    seniority: clean(seniority, 100),
    department: clean(department, 100),
    decision_maker: Boolean(decisionMaker),
    sources: [...new Set((Array.isArray(sources) ? sources : []).map(value => clean(value, 500)).filter(Boolean))].slice(0, 20),
    providers: provider ? [provider] : [],
    provider,
    provider_score: Number(providerScore) || 0,
    type: personalEmail(email) ? 'personal' : 'generic'
  };
}

function mergeContact(current, next) {
  if (!current) return { ...next };
  const rank = { invalid: 0, unknown: 1, accept_all: 2, valid: 3 };
  const currentStatus = statusOf(current.confidence || current.status || '');
  const nextStatus = statusOf(next.confidence || next.status || '');
  const confidence = rank[nextStatus] > rank[currentStatus] ? nextStatus : currentStatus;
  const providers = [...new Set([
    ...(Array.isArray(current.providers) ? current.providers : [current.provider]),
    ...(Array.isArray(next.providers) ? next.providers : [next.provider])
  ].filter(Boolean))];
  const currentTitle = clean(current.title, 220);
  const nextTitle = clean(next.title, 220);
  return {
    ...current,
    first_name: current.first_name || next.first_name || '',
    last_name: current.last_name || next.last_name || '',
    title: GTM_TITLE.test(nextTitle) && !GTM_TITLE.test(currentTitle) ? nextTitle : (currentTitle || nextTitle),
    email: current.email || next.email || '',
    confidence,
    linkedin_url: current.linkedin_url || next.linkedin_url || '',
    seniority: current.seniority || next.seniority || '',
    department: current.department || next.department || '',
    decision_maker: Boolean(current.decision_maker || next.decision_maker),
    sources: [...new Set([...(current.sources || []), ...(next.sources || [])])].slice(0, 20),
    providers,
    provider: providers.join('+'),
    provider_score: Math.max(Number(current.provider_score) || 0, Number(next.provider_score) || 0),
    type: current.type === 'personal' || next.type === 'personal' ? 'personal' : 'generic'
  };
}

function dedupe(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const email = clean(row?.email, 240).toLowerCase();
    const fallback = `${row?.linkedin_url || ''}|${row?.first_name || ''}|${row?.last_name || ''}`.toLowerCase();
    const key = email || fallback;
    if (!key.replace(/\|/g, '')) continue;
    map.set(key, mergeContact(map.get(key), row));
  }
  return [...map.values()].sort((a, b) => (Number(b.provider_score) || 0) - (Number(a.provider_score) || 0));
}

async function fetchJson(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
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

async function fetchText(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KoreaProAgent/1.2; public-contact-discovery)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    if (!response.ok) return '';
    return (await response.text()).slice(0, 500000);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function decodeCfEmail(encoded = '') {
  try {
    const key = Number.parseInt(encoded.slice(0, 2), 16);
    let value = '';
    for (let index = 2; index < encoded.length; index += 2) {
      value += String.fromCharCode(Number.parseInt(encoded.slice(index, index + 2), 16) ^ key);
    }
    return value;
  } catch {
    return '';
  }
}

function deobfuscate(text = '') {
  return String(text)
    .replace(/\s*(?:\[|\(|\{)?\s*(?:at|골뱅이)\s*(?:\]|\)|\})?\s*/gi, '@')
    .replace(/\s*(?:\[|\(|\{)?\s*(?:dot|점)\s*(?:\]|\)|\})?\s*/gi, '.');
}

function extractEmails(html = '', domain = '') {
  const raw = String(html);
  const values = [];
  values.push(...(deobfuscate(raw).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []));
  for (const match of raw.matchAll(/mailto:([^?"'\s>]+)/gi)) values.push(decodeURIComponent(match[1] || ''));
  for (const match of raw.matchAll(/data-email=["']([^"']+)["']/gi)) values.push(match[1] || '');
  for (const match of raw.matchAll(/data-cfemail=["']([0-9a-f]+)["']/gi)) values.push(decodeCfEmail(match[1] || ''));
  return [...new Set(values.map(value => clean(value, 240).toLowerCase()))]
    .filter(email => sameDomain(email, domain) && !JUNK.has(localPart(email)));
}

function pageLinks(html = '', baseUrl = '', domain = '') {
  const links = [];
  for (const match of String(html).matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(match[1], baseUrl);
      if (normalizeDomain(url.href) !== domain || !PAGE_PATH.test(url.pathname)) continue;
      links.push(url.href);
    } catch { }
  }
  return [...new Set(links)].slice(0, 12);
}

function sitemapLinks(xml = '', domain = '') {
  const links = [];
  for (const match of String(xml).matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)) {
    const url = clean(match[1], 500);
    if (normalizeDomain(url) === domain && PAGE_PATH.test(url)) links.push(url);
  }
  return [...new Set(links)].slice(0, 10);
}

function publicContacts(html = '', domain = '', pageUrl = '') {
  return extractEmails(html, domain).map(email => shapeContact({
    email,
    sources: [pageUrl],
    provider: 'public_web',
    providerScore: personalEmail(email) ? 84 : /^(partners?|partnerships?|business|bizdev|bd|sales|events?|community|marketing|operations|ops)$/.test(localPart(email)) ? 82 : 68
  }));
}

async function publicWebsiteSearch(domain) {
  const base = `https://${domain}/`;
  const homepage = await fetchText(base);
  if (!homepage) return [];
  const common = ['/contact','/about','/team','/leadership','/company','/people','/partnerships','/events','/community','/press','/media','/sponsors'];
  const urls = new Set([base, ...common.map(path => new URL(path, base).href), ...pageLinks(homepage, base, domain)]);
  const sitemap = await fetchText(`${base}sitemap.xml`, 4000);
  for (const url of sitemapLinks(sitemap, domain)) urls.add(url);
  const selected = [...urls].slice(0, 14);
  const pages = await Promise.all(selected.map(async url => ({ url, html: url === base ? homepage : await fetchText(url) })));
  return dedupe(pages.flatMap(page => page.html ? publicContacts(page.html, domain, page.url) : [])).slice(0, 20);
}

function pickPeople(rows = [], recommendedRole = '', roleTargets = []) {
  return rows.map(row => {
    const person = row?.person || row || {};
    const title = person.current_job_title || person.title || person.headline || '';
    return { person, title, score: roleScore(title, recommendedRole, roleTargets) };
  }).filter(item => GTM_TITLE.test(item.title))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

async function prospeoSearch(domain, recommendedRole, roleTargets) {
  const key = process.env.PROSPEO_API_KEY;
  if (!key) return [];
  const search = await fetchJson(PROSPEO_SEARCH_URL, {
    method: 'POST',
    headers: { 'X-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: 1, filters: { company: { websites: { include: [domain] } } } })
  });
  const people = pickPeople(Array.isArray(search?.results) ? search.results : [], recommendedRole, roleTargets);
  const enriched = await Promise.all(people.map(async item => {
    const personId = clean(item?.person?.person_id || item?.person?.id, 100);
    if (!personId) return null;
    const result = await fetchJson(PROSPEO_ENRICH_URL, {
      method: 'POST',
      headers: { 'X-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ only_verified_email: false, data: { person_id: personId } })
    });
    const person = result?.person || {};
    const email = clean(person?.email?.email || person?.email, 240);
    if (!email || !sameDomain(email, domain)) return null;
    const title = person.current_job_title || item.title || '';
    const currentJob = Array.isArray(person.job_history) ? person.job_history.find(job => job?.current) : null;
    return shapeContact({
      name: person.full_name || `${person.first_name || ''} ${person.last_name || ''}`,
      title,
      email,
      status: person?.email?.status || 'unknown',
      linkedin: person.linkedin_url,
      seniority: currentJob?.seniority || '',
      department: Array.isArray(currentJob?.departments) ? currentJob.departments.join(', ') : '',
      decisionMaker: GTM_TITLE.test(title),
      sources: ['prospeo.io'],
      provider: 'prospeo',
      providerScore: 90 + roleScore(title, recommendedRole, roleTargets)
    });
  }));
  return enriched.filter(Boolean);
}

function appendParams(params, key, values = []) {
  for (const value of values.filter(Boolean)) params.append(key, value);
}

async function apolloSearch(domain, recommendedRole, roleTargets) {
  const key = process.env.APOLLO_API_KEY;
  if (!key) return [];
  const params = new URLSearchParams({ page: '1', per_page: '20', include_similar_titles: 'true' });
  appendParams(params, 'q_organization_domains_list[]', [domain]);
  appendParams(params, 'person_titles[]', [recommendedRole, ...roleTargets, 'Events', 'Operations', 'Partnerships', 'Community', 'Marketing', 'Field Marketing', 'Founder', 'CEO']);
  appendParams(params, 'person_seniorities[]', ['owner','founder','c_suite','vp','head','director']);
  const search = await fetchJson(`${APOLLO_SEARCH_URL}?${params}`, {
    method: 'POST',
    headers: { 'X-Api-Key': key, Accept: 'application/json', 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
  });
  const people = pickPeople(Array.isArray(search?.people) ? search.people : [], recommendedRole, roleTargets);
  const enriched = await Promise.all(people.map(async item => {
    const person = item.person || {};
    const enrich = new URLSearchParams({ domain, reveal_personal_emails: 'false', reveal_phone_number: 'false' });
    if (person.first_name && person.last_name) {
      enrich.set('first_name', clean(person.first_name, 100));
      enrich.set('last_name', clean(person.last_name, 100));
    } else if (person.name) enrich.set('name', clean(person.name, 180));
    else return null;
    const result = await fetchJson(`${APOLLO_ENRICH_URL}?${enrich}`, {
      method: 'POST',
      headers: { 'X-Api-Key': key, Accept: 'application/json', 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
    });
    const value = result?.person || {};
    const email = clean(value.email, 240);
    if (!email || !sameDomain(email, domain)) return null;
    const title = value.title || item.title || '';
    return shapeContact({
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
      providerScore: 88 + roleScore(title, recommendedRole, roleTargets)
    });
  }));
  return enriched.filter(Boolean);
}

async function tombaSearch(domain, recommendedRole, roleTargets) {
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
    return shapeContact({
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
      providerScore: (Number(row.score) || 0) + roleScore(title, recommendedRole, roleTargets)
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

export async function findContacts(domainOrUrl, options = {}) {
  const domain = normalizeDomain(domainOrUrl);
  if (!domain) return { emails: [], company: null, provider: null, attempts: [], providerStatus: contactProviderStatus() };
  const recommendedRole = clean(options.recommendedRole, 120);
  const roleTargets = Array.isArray(options.roleTargets) ? options.roleTargets.map(value => clean(value, 120)).filter(Boolean).slice(0, 16) : [];
  const maxContacts = Math.min(Math.max(Number(options.maxContacts) || 24, 1), 30);
  const status = contactProviderStatus();
  const steps = [
    ['public_web', true, () => publicWebsiteSearch(domain)],
    ['prospeo', status.prospeo, () => prospeoSearch(domain, recommendedRole, roleTargets)],
    ['apollo', status.apollo, () => apolloSearch(domain, recommendedRole, roleTargets)],
    ['tomba', status.tomba, () => tombaSearch(domain, recommendedRole, roleTargets)]
  ];
  const settled = await Promise.all(steps.map(async ([provider, enabled, run]) => {
    if (!enabled) return { provider, status: 'skipped', rows: [] };
    try {
      const rows = dedupe(await run());
      return { provider, status: rows.length ? 'found' : 'empty', count: rows.length, rows };
    } catch (error) {
      return { provider, status: 'error', code: Number(error?.status) || null, rows: [] };
    }
  }));
  const emails = dedupe(settled.flatMap(item => item.rows || [])).slice(0, maxContacts);
  const providers = [...new Set(emails.flatMap(contact => contact.providers || [contact.provider]).filter(Boolean))];
  return {
    emails,
    company: null,
    provider: providers.join('+') || null,
    attempts: settled.map(({ rows, ...attempt }) => attempt),
    providerStatus: status
  };
}
