import * as baseDiscovery from './contact-discovery-exhaustive.js';

const {
  contactProviderStatus: baseProviderStatus,
  findContacts: findBaseContacts,
  normalizeDomain
} = baseDiscovery;

const HUNTER_DOMAIN_URL = 'https://api.hunter.io/v2/domain-search';
const HUNTER_VERIFY_URL = 'https://api.hunter.io/v2/email-verifier';
const HIT_TTL_MS = 12 * 60 * 60 * 1000;
const MISS_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

const GENERIC = new Set([
  'admin','billing','careers','contact','hello','help','hr','info','jobs','legal','marketing','media','office',
  'partners','partnership','partnerships','press','privacy','sales','security','support','team','business','bizdev',
  'bd','events','event','community','operations','ops'
]);
const ROLE_MAILBOX = new Set([
  'partners','partnership','partnerships','business','bizdev','bd','sales','events','event','community','marketing',
  'operations','ops','team','alliances','sponsorship','sponsorships'
]);
const LOW_VALUE = new Set(['admin','contact','hello','info','office','media','press']);
const JUNK = new Set([
  'billing','careers','hr','jobs','legal','privacy','security','noreply','no-reply','donotreply','abuse','postmaster',
  'webmaster','support','help'
]);
const GTM_TITLE = /(founder|co-founder|ceo|chief executive|president|vp|vice president|head of|director|country manager|general manager|business development|partnership|alliance|growth|sales|revenue|commercial|go-to-market|gtm|operations|events|community|marketing|field marketing|experiential|brand activation|sponsorship)/i;
const EXECUTIVE_TITLE = /(founder|co-founder|ceo|chief executive|president|owner|c-suite|chief operating|coo)/i;

const clean = (value = '', max = 500) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const localPart = email => clean(email, 240).toLowerCase().split('@')[0] || '';
const personalEmail = email => {
  const local = localPart(email);
  return Boolean(local && local.length >= 3 && /[a-z]/.test(local) && !GENERIC.has(local));
};
const roleMailbox = email => ROLE_MAILBOX.has(localPart(email));
const sameDomain = (email, domain) => {
  const host = clean(email, 240).toLowerCase().split('@')[1] || '';
  return Boolean(host && domain && (host === domain || host.endsWith(`.${domain}`)));
};

function statusOf(value = '') {
  const status = clean(value, 80).toLowerCase().replace(/[\s-]+/g, '_');
  if (['verified','valid','deliverable','safe'].includes(status)) return 'valid';
  if (status.includes('accept')) return 'accept_all';
  if (['invalid','undeliverable','disposable','webmail','blocked'].includes(status)) return 'invalid';
  return 'unknown';
}

function contactStatus(contact = {}) {
  return statusOf(contact?.verification?.status || contact?.emailStatus || contact?.confidence || contact?.status || '');
}

function roleScore(title = '', recommendedRole = '', roleTargets = []) {
  const text = clean(title, 240).toLowerCase();
  const targets = [recommendedRole, ...(Array.isArray(roleTargets) ? roleTargets : [])]
    .map(value => clean(value, 120).toLowerCase()).filter(Boolean);
  if (!text) return 0;
  if (targets.some(target => text.includes(target) || target.includes(text))) return 30;
  if (EXECUTIVE_TITLE.test(text)) return 26;
  if (/vp|vice president|head of|country manager|general manager/.test(text)) return 25;
  if (/director/.test(text)) return 22;
  if (GTM_TITLE.test(text)) return 20;
  return 0;
}

function expandRoleTargets(recommendedRole = '', roleTargets = []) {
  const initial = [recommendedRole, ...(Array.isArray(roleTargets) ? roleTargets : [])].map(value => clean(value, 120)).filter(Boolean);
  const text = initial.join(' ').toLowerCase();
  const extra = ['Founder','CEO','Head of Marketing','Partnerships Lead','Operations Lead'];
  if (/(event|sponsor|activation|booth|conference)/.test(text)) {
    extra.push('Events Lead','Event Marketing','Field Marketing','Experiential Marketing','Brand Activation','Sponsorships');
  }
  if (/(partner|alliance|business development|bd)/.test(text)) {
    extra.push('Strategic Partnerships','Alliances','Business Development','Commercial Director');
  }
  if (/(community|developer|ecosystem)/.test(text)) {
    extra.push('Community Lead','Ecosystem Lead','Developer Relations','Growth Lead');
  }
  if (/(operation|country|apac|asia)/.test(text)) {
    extra.push('Country Manager','APAC Lead','Regional Operations','General Manager');
  }
  return [...new Set([...initial, ...extra])].slice(0, 18);
}

function contactProviders(contact = {}) {
  return [...new Set([
    ...(Array.isArray(contact.providers) ? contact.providers : []),
    ...String(contact.provider || '').split('+')
  ].map(value => clean(value, 60)).filter(Boolean))];
}

function contactSources(contact = {}) {
  return [...new Set((Array.isArray(contact.sources) ? contact.sources : [])
    .map(source => typeof source === 'string' ? source : source?.uri || source?.url || '')
    .map(value => clean(value, 500)).filter(Boolean))].slice(0, 20);
}

function splitName(name = '') {
  const parts = clean(name, 180).split(/\s+/).filter(Boolean);
  return { first_name: parts[0] || '', last_name: parts.slice(1).join(' ') };
}

function shapeRaw({
  name = '', title = '', email = '', status = 'unknown', linkedin = '', seniority = '', department = '',
  decisionMaker = false, sources = [], provider = '', type = '', verification = {}
} = {}) {
  const names = splitName(name);
  return {
    ...names,
    title: clean(title, 220),
    email: clean(email, 240).toLowerCase(),
    confidence: statusOf(status),
    verification: { ...verification, status: statusOf(verification?.status || status) },
    linkedin_url: clean(linkedin, 500),
    seniority: clean(seniority, 100),
    department: clean(department, 100),
    decision_maker: Boolean(decisionMaker),
    sources: [...new Set((Array.isArray(sources) ? sources : []).map(value => clean(value, 500)).filter(Boolean))].slice(0, 20),
    providers: provider ? [provider] : [],
    provider,
    type: type || (personalEmail(email) ? 'personal' : 'generic')
  };
}

function bestVerification(current = {}, next = {}) {
  const rank = { invalid: 0, unknown: 1, accept_all: 2, valid: 3 };
  const a = statusOf(current?.status || '');
  const b = statusOf(next?.status || '');
  if (rank[b] > rank[a]) return { ...current, ...next, status: b };
  if (rank[b] < rank[a]) return { ...next, ...current, status: a };
  return Number(next?.score) > Number(current?.score) ? { ...current, ...next, status: b } : { ...next, ...current, status: a };
}

function mergeContact(current, next) {
  if (!current) return { ...next };
  const verification = bestVerification(current.verification || { status: contactStatus(current) }, next.verification || { status: contactStatus(next) });
  const currentTitle = clean(current.title, 220);
  const nextTitle = clean(next.title, 220);
  const title = GTM_TITLE.test(nextTitle) && !GTM_TITLE.test(currentTitle) ? nextTitle : (currentTitle || nextTitle);
  const providers = [...new Set([...contactProviders(current), ...contactProviders(next)])];
  return {
    ...current,
    first_name: current.first_name || next.first_name || '',
    last_name: current.last_name || next.last_name || '',
    title,
    email: current.email || next.email || '',
    confidence: verification.status,
    verification,
    linkedin_url: current.linkedin_url || next.linkedin_url || '',
    seniority: current.seniority || next.seniority || '',
    department: current.department || next.department || '',
    decision_maker: Boolean(current.decision_maker || next.decision_maker),
    sources: [...new Set([...contactSources(current), ...contactSources(next)])].slice(0, 20),
    providers,
    provider: providers.join('+'),
    type: current.type === 'personal' || next.type === 'personal' ? 'personal' : 'generic'
  };
}

function mergeContacts(rows = []) {
  const map = new Map();
  for (const contact of rows) {
    const email = clean(contact?.email, 240).toLowerCase();
    const fallback = `${contact?.linkedin_url || contact?.linkedinUrl || ''}|${contact?.first_name || ''}|${contact?.last_name || ''}`.toLowerCase();
    const key = email || fallback;
    if (!key.replace(/\|/g, '')) continue;
    map.set(key, mergeContact(map.get(key), contact));
  }
  return [...map.values()];
}

async function fetchJson(url, options = {}, timeoutMs = 10000) {
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

async function jinaRead(url) {
  const key = process.env.JINA_API_KEY;
  if (!key) return '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'text/plain' },
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!response.ok) return '';
    return (await response.text()).slice(0, 140000);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function extractEmails(text = '', domain = '') {
  const deobfuscated = String(text)
    .replace(/\s*(?:\[|\(|\{)?\s*(?:at|골뱅이)\s*(?:\]|\)|\})?\s*/gi, '@')
    .replace(/\s*(?:\[|\(|\{)?\s*(?:dot|점)\s*(?:\]|\)|\})?\s*/gi, '.');
  const matches = deobfuscated.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(matches.map(value => value.toLowerCase()))]
    .filter(email => sameDomain(email, domain) && !JUNK.has(localPart(email)));
}

async function jinaContacts(domain) {
  if (!process.env.JINA_API_KEY) return [];
  const base = `https://${domain}`;
  const urls = ['', '/contact', '/about', '/team', '/leadership', '/company', '/people', '/partnerships', '/events', '/community', '/press', '/sponsors']
    .map(path => `${base}${path}`);
  const pages = await Promise.all(urls.map(async url => ({ url, text: await jinaRead(url) })));
  return mergeContacts(pages.flatMap(page => extractEmails(page.text, domain).map(email => shapeRaw({
    email,
    sources: [page.url],
    provider: 'jina'
  }))));
}

async function hunterDomainContacts(domain) {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return [];
  const params = new URLSearchParams({ domain, limit: '30', api_key: key });
  const data = await fetchJson(`${HUNTER_DOMAIN_URL}?${params}`);
  const rows = Array.isArray(data?.data?.emails) ? data.data.emails : [];
  return rows.map(row => {
    const status = row?.verification?.status || (row?.accept_all ? 'accept_all' : 'unknown');
    return shapeRaw({
      name: `${row.first_name || ''} ${row.last_name || ''}`,
      title: row.position || '',
      email: row.value,
      status,
      linkedin: row.linkedin,
      seniority: row.seniority,
      department: row.department,
      decisionMaker: row.decision_maker === true,
      sources: ['hunter.io', ...(Array.isArray(row.sources) ? row.sources.map(source => source?.uri).filter(Boolean) : [])],
      provider: 'hunter',
      type: row.type || '',
      verification: {
        status,
        score: Number(row.confidence) || 0,
        accept_all: Boolean(row.accept_all),
        last_seen_on: clean(row.last_seen_on, 80)
      }
    });
  }).filter(contact => contact.email && sameDomain(contact.email, domain));
}

async function hunterVerify(email) {
  const key = process.env.HUNTER_API_KEY;
  if (!key || !email) return null;
  const params = new URLSearchParams({ email, api_key: key });
  const data = await fetchJson(`${HUNTER_VERIFY_URL}?${params}`, {}, 11000);
  const row = data?.data || {};
  return shapeRaw({
    email,
    status: row.status,
    sources: ['hunter.io/verifier', ...(Array.isArray(row.sources) ? row.sources.map(source => source?.uri).filter(Boolean) : [])],
    provider: 'hunter_verify',
    verification: {
      status: row.status,
      score: Number(row.score) || 0,
      regexp: row.regexp,
      gibberish: row.gibberish,
      disposable: row.disposable,
      webmail: row.webmail,
      mx_records: row.mx_records,
      smtp_server: row.smtp_server,
      smtp_check: row.smtp_check,
      accept_all: row.accept_all,
      block: row.block,
      last_seen_on: clean(row.last_seen_on, 80),
      still_on_page: row.still_on_page
    }
  });
}

function scoreBreakdown(contact = {}, recommendedRole = '', roleTargets = [], domain = '') {
  const email = clean(contact.email, 240).toLowerCase();
  const status = contactStatus(contact);
  const verification = contact.verification || {};
  const role = Math.max(roleScore(contact.title || '', recommendedRole, roleTargets), roleMailbox(email) ? 22 : 0);
  const identity = personalEmail(email) ? 20 : roleMailbox(email) ? 14 : 2;
  const validation = status === 'valid' ? 32 : status === 'accept_all' ? 8 : status === 'unknown' ? 4 : 0;
  const domainPoints = sameDomain(email, domain) ? 10 : 0;
  const sources = contactSources(contact).length;
  const providers = contactProviders(contact).length;
  const evidence = Math.min(10, (sources >= 2 ? 5 : 0) + (providers >= 2 ? 5 : 0));
  const verificationBonus = Math.min(5,
    (Number(verification.score) >= 90 ? 2 : 0)
    + (verification.smtp_check === true ? 1 : 0)
    + (verification.mx_records === true ? 1 : 0)
    + (verification.still_on_page === true ? 1 : 0)
  );
  const local = localPart(email);
  let penalty = 0;
  if (JUNK.has(local)) penalty -= 100;
  else if (LOW_VALUE.has(local)) penalty -= 18;
  if (status === 'accept_all') penalty -= 12;
  if (status === 'invalid') penalty -= 100;
  if (!role && personalEmail(email)) penalty -= 10;
  if (verification.disposable === true || verification.webmail === true || verification.block === true) penalty -= 100;
  if (verification.gibberish === true) penalty -= 25;
  const total = Math.max(0, Math.min(100, validation + role + identity + domainPoints + evidence + verificationBonus + penalty));
  return { validation, role, identity, domain: domainPoints, evidence, verification: verificationBonus, penalty, total };
}

function normalizeContact(contact, recommendedRole, roleTargets, domain) {
  const email = clean(contact.email, 240).toLowerCase();
  const status = contactStatus(contact);
  const providers = contactProviders(contact);
  const sources = contactSources(contact);
  const verification = contact.verification || { status };
  const breakdown = scoreBreakdown({ ...contact, providers, sources, verification }, recommendedRole, roleTargets, domain);
  const qualified = Boolean(
    email
    && status === 'valid'
    && sameDomain(email, domain)
    && breakdown.total >= 75
    && (personalEmail(email) || roleMailbox(email))
  );
  const name = clean(contact.first_name, 100)
    ? `${clean(contact.first_name, 100)} ${clean(contact.last_name, 100)}`.trim()
    : clean(contact.full_name || contact.name || '', 180);
  return {
    name,
    first_name: clean(contact.first_name, 100),
    last_name: clean(contact.last_name, 100),
    title: clean(contact.title || contact.position || '', 200),
    email,
    emailStatus: status,
    verification,
    seniority: contact.seniority || '',
    department: contact.department || '',
    type: personalEmail(email) ? 'personal' : 'generic',
    linkedinUrl: contact.linkedin_url || contact.linkedinUrl || contact.linkedin || '',
    decisionMaker: Boolean(contact.decision_maker || contact.decisionMaker),
    sources,
    providers,
    provider: providers.join('+'),
    score: breakdown.total,
    scoreBreakdown: breakdown,
    qualified
  };
}

export function normalizeContacts(rawEmails = [], recommendedRole = '', roleTargets = [], domain = '') {
  const normalizedDomain = normalizeDomain(domain);
  return mergeContacts(rawEmails)
    .map(contact => normalizeContact(contact, recommendedRole, roleTargets, normalizedDomain))
    .filter(contact => contact.email && contact.emailStatus !== 'invalid')
    .sort((a, b) => Number(b.qualified) - Number(a.qualified) || b.score - a.score || b.sources.length - a.sources.length);
}

function verificationSummary(rows = []) {
  return rows.reduce((summary, contact) => {
    const status = contact.emailStatus || contactStatus(contact);
    summary[status] = (summary[status] || 0) + 1;
    if (contact.qualified) summary.qualified += 1;
    if (roleMailbox(contact.email)) summary.role_mailbox += 1;
    else if (personalEmail(contact.email)) summary.personal += 1;
    else summary.generic += 1;
    return summary;
  }, { valid: 0, accept_all: 0, unknown: 0, invalid: 0, qualified: 0, personal: 0, role_mailbox: 0, generic: 0 });
}

async function verifyUnknown(rows, recommendedRole, roleTargets, domain, options = {}) {
  if (!process.env.HUNTER_API_KEY) return { rows, attempts: [], exhausted: false };
  const limit = Math.min(Math.max(Number(options.verifyLimit) || 10, 1), 20);
  const minQualified = Math.min(Math.max(Number(options.minQualified) || 1, 1), 4);
  const stopAfterQualified = options.stopAfterQualified !== false;
  let merged = mergeContacts(rows);
  const ranked = normalizeContacts(merged, recommendedRole, roleTargets, domain)
    .filter(contact => contact.emailStatus === 'unknown' || contact.emailStatus === 'accept_all')
    .sort((a, b) => Number(personalEmail(b.email)) - Number(personalEmail(a.email)) || b.score - a.score)
    .slice(0, limit);
  const attempts = [];
  for (let index = 0; index < ranked.length; index += 2) {
    const batch = ranked.slice(index, index + 2);
    const verified = await Promise.all(batch.map(async contact => {
      try {
        const result = await hunterVerify(contact.email);
        attempts.push({ email: contact.email, status: result ? contactStatus(result) : 'unknown' });
        return result;
      } catch (error) {
        attempts.push({ email: contact.email, status: 'error', code: Number(error?.status) || null });
        return null;
      }
    }));
    merged = mergeContacts([...merged, ...verified.filter(Boolean)]);
    const qualified = normalizeContacts(merged, recommendedRole, roleTargets, domain).filter(contact => contact.qualified).length;
    if (stopAfterQualified && qualified >= minQualified) break;
  }
  return { rows: merged, attempts, exhausted: attempts.length >= ranked.length };
}

export function contactProviderStatus() {
  return {
    ...baseProviderStatus(),
    jina: Boolean(process.env.JINA_API_KEY),
    hunter: Boolean(process.env.HUNTER_API_KEY)
  };
}

function providerFingerprint() {
  return Object.entries(contactProviderStatus()).map(([name, enabled]) => `${name}:${enabled ? 1 : 0}`).join(',');
}

export function clearContactCache() {
  cache.clear();
}

export function scoreContact(contact = {}, recommendedRole = '', roleTargets = [], domain = '') {
  return scoreBreakdown(contact, recommendedRole, roleTargets, normalizeDomain(domain)).total;
}

function attemptReason(rows = [], qualifiedCount = 0) {
  if (!rows.length) return 'no_results';
  if (qualifiedCount) return 'qualified_contact_found';
  if (rows.some(contact => contact.emailStatus === 'accept_all')) return 'accept_all_needs_review';
  if (rows.some(contact => contact.emailStatus === 'unknown')) return 'verification_inconclusive';
  if (rows.every(contact => !personalEmail(contact.email) && !roleMailbox(contact.email))) return 'generic_only';
  return 'below_quality_threshold';
}

function seedFingerprint(rows = []) {
  return (Array.isArray(rows) ? rows : []).slice(0, 20)
    .map(row => `${clean(row?.email, 240).toLowerCase()}:${contactStatus(row)}`)
    .sort().join(',');
}

export async function findContacts(domainOrUrl, options = {}) {
  const domain = normalizeDomain(domainOrUrl);
  if (!domain) {
    return {
      emails: [], provider: null, attempts: [], qualifiedCount: 0, stopReason: 'invalid_domain',
      providerStatus: contactProviderStatus(), scoreThreshold: 75, verificationSummary: verificationSummary([])
    };
  }
  const recommendedRole = clean(options.recommendedRole, 120);
  const roleTargets = expandRoleTargets(recommendedRole, options.roleTargets || []);
  const maxContacts = Math.min(Math.max(Number(options.maxContacts) || 12, 1), 20);
  const minQualified = Math.min(Math.max(Number(options.minQualified) || 1, 1), 4);
  const seedContacts = Array.isArray(options.seedContacts) ? options.seedContacts.slice(0, 30) : [];
  const key = `${domain}|${recommendedRole.toLowerCase()}|${roleTargets.join(',').toLowerCase()}|${maxContacts}|${minQualified}|${Number(options.verifyLimit) || 10}|${seedFingerprint(seedContacts)}|${providerFingerprint()}`;
  const cached = options.forceRefresh ? null : cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cacheHit: true };
  if (cached) cache.delete(key);

  const status = contactProviderStatus();
  const [baseResult, jinaResult, hunterResult] = await Promise.all([
    findBaseContacts(domain, { maxContacts: 30, recommendedRole, roleTargets }).catch(error => ({
      emails: [], attempts: [{ provider: 'base', status: 'error', code: Number(error?.status) || null }]
    })),
    status.jina ? jinaContacts(domain).catch(() => []) : Promise.resolve([]),
    status.hunter ? hunterDomainContacts(domain).catch(() => []) : Promise.resolve([])
  ]);

  const attempts = [...(baseResult.attempts || [])];
  attempts.push(status.jina
    ? { provider: 'jina', status: jinaResult.length ? 'found' : 'empty', count: jinaResult.length }
    : { provider: 'jina', status: 'skipped', reason: 'not_configured' });
  attempts.push(status.hunter
    ? { provider: 'hunter', status: hunterResult.length ? 'found' : 'empty', count: hunterResult.length }
    : { provider: 'hunter', status: 'skipped', reason: 'not_configured' });

  let merged = mergeContacts([...seedContacts, ...(baseResult.emails || []), ...jinaResult, ...hunterResult]);
  const verification = await verifyUnknown(merged, recommendedRole, roleTargets, domain, {
    verifyLimit: options.verifyLimit,
    minQualified,
    stopAfterQualified: options.stopAfterQualified
  });
  merged = verification.rows;
  const normalized = normalizeContacts(merged, recommendedRole, roleTargets, domain);
  const qualifiedCount = normalized.filter(contact => contact.qualified).length;
  const providers = [...new Set(normalized.flatMap(contact => contact.providers))];
  const summary = verificationSummary(normalized);
  attempts.push({
    provider: 'hunter_verify',
    status: verification.attempts.length ? 'completed' : (status.hunter ? 'not_needed' : 'skipped'),
    count: verification.attempts.length,
    results: verification.attempts
  });
  attempts.push({
    provider: 'quality_gate',
    status: qualifiedCount ? 'found' : 'empty',
    count: normalized.length,
    qualified: qualifiedCount,
    reason: attemptReason(normalized, qualifiedCount)
  });
  const value = {
    emails: normalized.slice(0, maxContacts),
    company: null,
    provider: providers.join('+') || null,
    attempts,
    qualifiedCount,
    stopReason: qualifiedCount >= minQualified
      ? 'qualified_contact_found'
      : (normalized.length ? 'all_providers_exhausted_below_threshold' : 'all_providers_exhausted_no_results'),
    providerStatus: status,
    scoreThreshold: 75,
    verificationSummary: summary,
    roleTargets
  };
  cache.set(key, { expiresAt: Date.now() + (qualifiedCount ? HIT_TTL_MS : MISS_TTL_MS), value });
  return value;
}
