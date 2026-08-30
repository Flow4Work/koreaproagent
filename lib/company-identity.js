const TAVILY_URL = 'https://api.tavily.com/search';
const IDENTITY_VERSION = '20260830-company-identity-v4';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const BLOCKED_DOMAINS = new Set([
  'linkedin.com','facebook.com','instagram.com','youtube.com','x.com','twitter.com','wikipedia.org',
  '10times.com','eventbrite.com','medium.com','made-in-china.com','globalsources.com','tradeindia.com',
  'exporthub.com','tradekey.com','1688.com','alibaba.com','amazon.com','scribd.com','glass.com.cn'
]);
const FREE_MAIL = new Set([
  'gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','yahoo.com','yahoo.co.jp','icloud.com',
  'me.com','qq.com','163.com','126.com','foxmail.com','proton.me','protonmail.com'
]);
const MULTI_SUFFIXES = new Set([
  'ac.kr','co.kr','go.kr','ne.kr','or.kr','re.kr','pe.kr','ac.uk','co.uk','gov.uk','ltd.uk','me.uk','net.uk','nhs.uk','org.uk','plc.uk','sch.uk',
  'asn.au','com.au','edu.au','gov.au','id.au','net.au','org.au','ac.jp','co.jp','go.jp','ne.jp','or.jp','com.br','com.cn','com.hk','com.mx','com.sg',
  'com.tr','com.tw','com.vn','co.id','co.in','co.nz','co.th','co.za','net.cn','net.in','org.cn','org.in'
]);
const GENERIC_COMPANY_TOKENS = new Set([
  'company','companies','corporation','corp','inc','incorporated','limited','ltd','llc','plc','gmbh','group','holding','holdings','international','global',
  'co','sa','sas','ag','bv','nv','pte','pty','llp','sp','zoo','technology','technologies','healthcare','cosmetic','cosmetics','beauty','pack','packing',
  'packaging','package','plastic','plastics','plasticware','bottle','bottles','glass','crystal','industry','industrial','manufacturing','manufacturer',
  'factory','trade','trading','guangzhou','shenzhen','shanghai','beijing','ningbo','yuyao','dongguan','china','korea','japan','usa','uk','germany','france','team'
]);
const GENERIC_BRAND_WORDS = /^(?:home|homepage|official|official site|welcome|contact|about us|about|products?|services?|company|corporate|website|shop|store)$/i;
const LEGAL_SUFFIX_RE = /(?:\s*[,.-]?\s*)(?:co\.?\s*,?\s*ltd\.?|co\.?\s*ltd\.?|company\s+limited|ltd\.?|limited|llc|l\.l\.c\.?|inc\.?|incorporated|corp\.?|corporation|plc|p\.l\.c\.?|gmbh|ag|s\.a\.?|s\.a\.s\.?|sas|b\.v\.?|bv|n\.v\.?|nv|pte\.?\s*ltd\.?|pty\.?\s*ltd\.?|llp|l\.p\.?|sp\.?\s*z\.?\s*o\.?\s*o\.?|srl|s\.r\.l\.?|oy|ab|as|aps|kk|k\.k\.?|jsc|cjsc|ooo|oü|uab)$/i;
const STRONG_SOURCES = new Set(['alternateName','websiteName','websiteAlternateName','og:site_name','application-name','logo_alt','brand_declaration']);
const MEDIUM_SOURCES = new Set(['organizationName','brandName']);
const JUNK_EMAIL_LOCAL = new Set(['noreply','no-reply','donotreply','abuse','postmaster','webmaster']);

const memoryCache = new Map();
const clean = (value = '', max = 1200) => String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function decodeHtml(value = '', max = 50000) {
  return clean(value, max)
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n) || 32));
}

export function rootDomain(value = '') {
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

function domainStem(value = '') {
  const domain = rootDomain(value);
  if (!domain) return '';
  const parts = domain.split('.');
  const suffix2 = parts.slice(-2).join('.');
  return MULTI_SUFFIXES.has(suffix2) ? parts.slice(0, -2).join('') : parts[0];
}

function comparable(value = '') {
  return clean(value, 260).toLowerCase().replace(/&/g, 'and').replace(/[^\p{L}\p{N}]+/gu, '');
}

export function stripLegalSuffix(value = '') {
  let name = decodeHtml(value, 1000).replace(/[|·]+$/g, '').trim();
  let previous = '';
  while (name && name !== previous) {
    previous = name;
    name = name.replace(LEGAL_SUFFIX_RE, '').replace(/[\s,.-]+$/g, '').trim();
  }
  return name;
}

function tokens(value = '', { significant = false } = {}) {
  const rows = clean(value, 260).toLowerCase().replace(/&/g, ' and ').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return [...new Set(rows.filter(token => token.length >= 2 && (!significant || (token.length >= 3 && !GENERIC_COMPANY_TOKENS.has(token)))))];
}

export function rawCompanyMatch(company = '', text = '') {
  const raw = clean(company, 220);
  const hay = clean(text, 50000).toLowerCase();
  if (!raw || !hay) return false;
  const compactRaw = comparable(stripLegalSuffix(raw));
  const compactHay = comparable(hay);
  if (compactRaw.length >= 6 && compactHay.includes(compactRaw)) return true;

  const sig = tokens(raw, { significant: true });
  if (sig.length) {
    const hits = sig.filter(token => hay.includes(token)).length;
    if (sig.length === 1) return hits === 1;
    if (hits >= 2 && hits / sig.length >= 0.5) return true;
  }

  const all = tokens(stripLegalSuffix(raw));
  const hits = all.filter(token => hay.includes(token)).length;
  return all.length >= 2 && hits >= Math.min(3, all.length) && hits / all.length >= 0.65;
}

export function domainLooksRelated(company = '', domain = '') {
  const stem = comparable(domainStem(domain));
  if (!stem || stem.length < 3) return false;
  const sig = tokens(company, { significant: true }).map(comparable).filter(Boolean);
  if (sig.some(token => token.length >= 3 && (stem.includes(token) || token.includes(stem)))) return true;
  const raw = comparable(stripLegalSuffix(company));
  return raw.length >= 4 && (raw.includes(stem) || stem.includes(raw));
}

function isBlockedDomain(value = '') {
  const domain = rootDomain(value);
  return !domain || BLOCKED_DOMAINS.has(domain) || FREE_MAIL.has(domain);
}

function attrValue(tag = '', attr = '') {
  const match = tag.match(new RegExp(`${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return decodeHtml(match?.[1] || match?.[2] || match?.[3] || '', 2000);
}

function metaValues(html = '', key = '') {
  const out = [];
  for (const match of String(html).matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const property = clean(attrValue(tag, 'property') || attrValue(tag, 'name'), 120).toLowerCase();
    if (property !== key.toLowerCase()) continue;
    const content = attrValue(tag, 'content');
    if (content) out.push(content);
  }
  return out;
}

function extractJsonLd(html = '') {
  const out = [];
  for (const match of String(html).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try { out.push(JSON.parse(raw)); } catch {}
  }
  return out;
}

function walkJsonLd(node, collector, legalCollector) {
  if (Array.isArray(node)) return node.forEach(item => walkJsonLd(item, collector, legalCollector));
  if (!node || typeof node !== 'object') return;
  const type = Array.isArray(node['@type']) ? node['@type'].join(' ') : clean(node['@type'], 120);
  if (/organization|corporation|localbusiness|professionalservice/i.test(type)) {
    if (node.alternateName) collector('alternateName', node.alternateName, 120, 'strong');
    if (node.name) collector('organizationName', node.name, 100, 'medium');
    if (node.legalName) legalCollector(node.legalName);
  }
  if (/\bbrand\b/i.test(type)) {
    if (node.name) collector('brandName', node.name, 105, 'medium');
    if (node.alternateName) collector('alternateName', node.alternateName, 120, 'strong');
  }
  if (/\bwebsite\b/i.test(type)) {
    if (node.name) collector('websiteName', node.name, 118, 'strong');
    if (node.alternateName) collector('websiteAlternateName', node.alternateName, 119, 'strong');
  }
  for (const value of Object.values(node)) walkJsonLd(value, collector, legalCollector);
}

function candidateClean(value = '') {
  let name = decodeHtml(value, 4000)
    .replace(/^\s*(?:welcome\s+to|official\s+website\s+of)\s+/i, '')
    .replace(/\s*[|–—]\s*(?:home|official.*|about.*|products?.*|manufacturer.*|supplier.*)$/i, '')
    .replace(/\s*[-:]\s*(?:home|official.*|about.*|products?.*|manufacturer.*|supplier.*)$/i, '')
    .replace(/[™®©]/g, '')
    .replace(/\s+/g, ' ').trim();
  if (name.length > 100) name = name.split(/\s*[|–—]\s*/)[0].trim();
  return name;
}

function validBrandCandidate(value = '') {
  const name = candidateClean(value);
  if (!name || name.length < 2 || name.length > 80 || GENERIC_BRAND_WORDS.test(name)) return false;
  if (/https?:\/\/|@|\b(?:privacy|terms|cookie|copyright|all rights reserved)\b/i.test(name)) return false;
  if ((name.match(/\s+/g) || []).length > 8) return false;
  return /[\p{L}\p{N}]/u.test(name);
}

function pageText(html = '') {
  return decodeHtml(String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '), 50000).slice(0, 50000);
}

function brandDeclarations(text = '') {
  const out = [];
  const patterns = [
    /\b([A-Za-z0-9][A-Za-z0-9&.'’+\- ]{1,48}?)\s+(?:is|are)\s+(?:our|the|a)\s+brand\b/gi,
    /\bbrand(?:\s+name)?\s*(?:is|:|：)\s*([A-Za-z0-9][A-Za-z0-9&.'’+\- ]{1,48})/gi,
    /\bunder\s+the\s+brand\s+([A-Za-z0-9][A-Za-z0-9&.'’+\- ]{1,48})/gi,
    /\b([A-Z][A-Z0-9&.'’+\- ]{1,48}?)\s+is\s+(?:a|an|the)\s+(?:designer|developer|producer|seller|manufacturer|supplier|social\s+impact\s+business)\b/g,
    /\b(?:[Ww]hy\s+[Cc]hoose|[Cc]ome\s+to|[Ww]elcome\s+to)\s+([A-Z][A-Z0-9&.'’+\- ]{1,48}?)(?=[?!,.;]|\s{2,}|$)/g,
    /(?:THƯƠNG\s+HIỆU|NHÃN\s+HIỆU)\s+([A-Z0-9][A-Z0-9&.'’+\- ]{1,48})/giu,
    /\b([A-Z][A-Z0-9&.'’+\- ]{1,48}?)\s+là\s+(?:nhãn\s+hiệu|thương\s+hiệu)\b/giu
  ];
  for (const pattern of patterns) {
    for (const match of String(text).matchAll(pattern)) {
      const value = candidateClean(match[1]);
      if (validBrandCandidate(value)) out.push(value);
    }
  }
  return [...new Set(out)].slice(0, 14);
}

function internalIdentityLinks(html = '', baseUrl = '') {
  const root = rootDomain(baseUrl);
  const out = [];
  for (const match of String(html).matchAll(/<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) {
    const href = decodeHtml(match[1] || match[2] || match[3] || '', 3000);
    if (!href || /^(?:mailto:|tel:|javascript:|#)/i.test(href)) continue;
    let url;
    try { url = new URL(href, baseUrl); } catch { continue; }
    if (rootDomain(url.hostname) !== root) continue;
    const marker = `${url.pathname} ${match[0]}`.toLowerCase();
    if (!/(about|company|corporate|profile|contact|brand|story|who-we-are|our-story)/.test(marker)) continue;
    url.hash = '';
    url.search = '';
    out.push(url.toString());
  }
  return [...new Set(out)].slice(0, 4);
}

function extractEmails(html = '', pageUrl = '') {
  const raw = String(html || '').slice(0, 500000);
  const mailto = [...raw.matchAll(/href\s*=\s*["']mailto:([^"'?\s>]+)/gi)].map(match => decodeHtml(match[1], 500));
  const visible = pageText(raw)
    .replace(/\s*(?:\[|\(|\{)?\s*(?:at)\s*(?:\]|\)|\})?\s*/gi, '@')
    .replace(/\s*(?:\[|\(|\{)?\s*(?:dot)\s*(?:\]|\)|\})?\s*/gi, '.');
  const visibleMatches = visible.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const matches = [...mailto, ...visibleMatches];
  return [...new Set(matches.map(email => clean(email, 240).toLowerCase()))]
    .filter(email => {
      const [local, host] = email.split('@');
      if (!local || !host || JUNK_EMAIL_LOCAL.has(local)) return false;
      const root = rootDomain(host);
      if (!root || FREE_MAIL.has(root)) return false;
      return true;
    })
    .slice(0, 30)
    .map(email => ({ email, source_url: pageUrl }));
}

function extractIdentityPage(html = '', pageUrl = '') {
  const candidates = [];
  const legalNames = [];
  const seen = new Set();
  const add = (source, value, score, strength = 'weak') => {
    const raw = candidateClean(value);
    if (!validBrandCandidate(raw)) return;
    const key = comparable(raw);
    if (!key || seen.has(`${source}:${key}:${pageUrl}`)) return;
    seen.add(`${source}:${key}:${pageUrl}`);
    candidates.push({ source, value: raw, score, strength, page_url: pageUrl });
    const stripped = stripLegalSuffix(raw);
    if (stripped && comparable(stripped) !== key && validBrandCandidate(stripped)) {
      candidates.push({
        source: `${source}:legal-stripped`,
        value: stripped,
        score: Math.max(1, score - 12),
        strength: strength === 'strong' ? 'medium' : strength,
        page_url: pageUrl
      });
    }
  };
  const addLegal = value => {
    const cleaned = candidateClean(value);
    if (cleaned) legalNames.push(cleaned);
  };

  for (const json of extractJsonLd(html)) walkJsonLd(json, add, addLegal);
  metaValues(html, 'og:site_name').forEach(value => add('og:site_name', value, 118, 'strong'));
  metaValues(html, 'application-name').forEach(value => add('application-name', value, 115, 'strong'));

  const title = String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  if (title) add('title', title, 72, 'weak');

  for (const match of String(html).matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)) {
    add('h1', pageText(match[1]), 78, 'weak');
  }

  for (const match of String(html).matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const marker = `${attrValue(tag, 'class')} ${attrValue(tag, 'id')} ${attrValue(tag, 'src')}`.toLowerCase();
    if (!/logo|brand|header/.test(marker)) continue;
    add('logo_alt', attrValue(tag, 'alt') || attrValue(tag, 'title'), 110, 'strong');
  }

  brandDeclarations(pageText(html)).forEach(value => add('brand_declaration', value, 124, 'strong'));
  return { candidates, legalNames: [...new Set(legalNames)] };
}

function chooseBrandEvidence(candidates = []) {
  const groups = new Map();
  for (const row of candidates) {
    const value = candidateClean(row?.value);
    if (!validBrandCandidate(value)) continue;
    const key = comparable(value);
    if (!key) continue;
    const current = groups.get(key) || {
      key, values: [], sources: new Set(), pages: new Set(), strongSources: new Set(), mediumSources: new Set(), bestScore: 0
    };
    current.values.push(value);
    current.sources.add(String(row.source || ''));
    if (row.page_url) current.pages.add(row.page_url);
    if (row.strength === 'strong' || STRONG_SOURCES.has(row.source)) current.strongSources.add(String(row.source || ''));
    if (row.strength === 'medium' || MEDIUM_SOURCES.has(row.source)) current.mediumSources.add(String(row.source || ''));
    current.bestScore = Math.max(current.bestScore, Number(row.score || 0));
    groups.set(key, current);
  }

  const viable = [];
  for (const group of groups.values()) {
    const independentSignals = group.sources.size + Math.max(0, group.pages.size - 1);
    const strong = group.strongSources.size > 0;
    const mediumConsensus = group.mediumSources.size > 0 && independentSignals >= 2;
    const weakConsensus = independentSignals >= 2 && group.pages.size >= 2;
    if (!strong && !mediumConsensus && !weakConsensus) continue;

    const value = group.values.slice().sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
    const confidence = strong
      ? Math.min(0.99, 0.95 + Math.min(0.03, (independentSignals - 1) * 0.01))
      : mediumConsensus ? 0.92 : 0.89;
    viable.push({
      value,
      confidence,
      signal_count: independentSignals,
      sources: [...group.sources],
      pages: [...group.pages],
      score: group.bestScore + (strong ? 30 : 0) + independentSignals * 4 - Math.min(10, value.length / 10)
    });
  }

  return viable.sort((a, b) => b.score - a.score || b.confidence - a.confidence || a.value.length - b.value.length)[0] || null;
}

async function fetchText(url, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KoreaAgentCompanyIdentity/4.0)' }
    });
    const contentType = clean(response.headers.get('content-type'), 120).toLowerCase();
    if (!response.ok || (!contentType.includes('text/html') && !contentType.includes('application/xhtml'))) return null;
    const html = (await response.text()).slice(0, 500000);
    return { html, finalUrl: response.url || url, status: response.status };
  } catch { return null; }
  finally { clearTimeout(timer); }
}

async function inspectDomain(company, domain, source = 'existing_domain') {
  const root = rootDomain(domain);
  if (!root || isBlockedDomain(root)) return null;

  let home = null;
  for (const url of [`https://${root}/`, `https://www.${root}/`]) {
    home = await fetchText(url);
    if (home?.html) break;
  }
  if (!home?.html) return null;

  const finalDomain = rootDomain(home.finalUrl || root);
  if (!finalDomain || isBlockedDomain(finalDomain)) return null;

  const pages = [{ url: home.finalUrl || `https://${finalDomain}/`, html: home.html }];
  const discoveredLinks = internalIdentityLinks(home.html, pages[0].url);
  const fallbackPaths = ['/about', '/about-us', '/company', '/contact'];
  const pageTargets = [...discoveredLinks, ...fallbackPaths.map(path => `https://${finalDomain}${path}`)]
    .filter((url, index, list) => list.indexOf(url) === index)
    .slice(0, 5);

  for (const url of pageTargets) {
    if (pages.length >= 4) break;
    const page = await fetchText(url, 5000);
    if (!page?.html || rootDomain(page.finalUrl || url) !== finalDomain) continue;
    pages.push({ url: page.finalUrl || url, html: page.html });
  }

  const combinedText = pages.map(page => pageText(page.html)).join(' ');
  const companyMatched = rawCompanyMatch(company, combinedText) || domainLooksRelated(company, finalDomain);
  if (!companyMatched) return null;

  const candidates = [];
  const legalNames = [];
  const emails = [];
  for (const page of pages) {
    const extracted = extractIdentityPage(page.html, page.url);
    candidates.push(...extracted.candidates);
    legalNames.push(...extracted.legalNames);
    emails.push(...extractEmails(page.html, page.url));
  }

  const brand = chooseBrandEvidence(candidates);
  if (!brand?.value) return null;

  const legal = legalNames[0] || (LEGAL_SUFFIX_RE.test(clean(company, 220)) ? clean(company, 220) : '');
  const emailMap = new Map();
  for (const item of emails) {
    if (!emailMap.has(item.email)) emailMap.set(item.email, item);
  }
  const officialEmails = [...emailMap.values()].slice(0, 30);
  const officialEmailDomains = [...new Set(officialEmails.map(item => rootDomain(item.email)).filter(Boolean))];

  return {
    raw_name: clean(company, 220),
    legal_name: clean(legal, 220),
    brand_name: brand.value,
    greeting_name: brand.value,
    domain: finalDomain,
    confidence: brand.confidence,
    evidence_url: brand.pages[0] || pages[0].url,
    evidence_urls: [...new Set([pages[0].url, ...brand.pages])].slice(0, 6),
    brand_evidence: { sources: brand.sources, signal_count: brand.signal_count },
    official_emails: officialEmails,
    official_email_domains: officialEmailDomains,
    evidence_source: source === 'existing_domain' ? 'official_site_multi_page' : 'web_search+official_site_multi_page',
    matched_by: brand.sources.join('+'),
    status: 'verified',
    verified_at: new Date().toISOString(),
    identity_version: IDENTITY_VERSION
  };
}

async function tavilyCandidates(company = '', country = '') {
  const key = clean(process.env.TAVILY_API_KEY, 5000);
  if (!key) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(TAVILY_URL, {
      method: 'POST', signal: controller.signal, cache: 'no-store',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `"${clean(company, 180)}" official website ${clean(country, 80)}`,
        search_depth: 'basic', max_results: 8, topic: 'general', include_answer: false, include_raw_content: false,
        exclude_domains: [...BLOCKED_DOMAINS]
      })
    });
    if (!response.ok) return [];
    const data = await response.json().catch(() => ({}));
    const rows = Array.isArray(data?.results) ? data.results : [];
    return rows.map(row => ({
      domain: rootDomain(row?.url),
      text: `${clean(row?.title, 300)} ${clean(row?.content, 1200)} ${clean(row?.url, 500)}`,
      score: Number(row?.score || 0)
    })).filter(row => row.domain && !isBlockedDomain(row.domain) && (rawCompanyMatch(company, row.text) || domainLooksRelated(company, row.domain)))
      .sort((a, b) => b.score - a.score);
  } catch { return []; }
  finally { clearTimeout(timer); }
}

function unresolved(item = {}, reason = 'official_brand_not_proven') {
  return {
    id: clean(item?.id, 180), raw_name: clean(item?.raw_name || item?.company, 220),
    legal_name: '', brand_name: '', greeting_name: '', domain: rootDomain(item?.domain || item?.url || ''),
    confidence: 0, evidence_url: '', evidence_urls: [], brand_evidence: { sources: [], signal_count: 0 },
    official_emails: [], official_email_domains: [], evidence_source: '', matched_by: '', status: 'needs_review', reason,
    verified_at: new Date().toISOString(), identity_version: IDENTITY_VERSION
  };
}

function cacheKey(item = {}) {
  return `${comparable(item?.raw_name || item?.company)}|${rootDomain(item?.domain || item?.url || '')}|${IDENTITY_VERSION}`;
}

export async function resolveCompanyIdentity(item = {}) {
  const id = clean(item?.id, 180);
  const company = clean(item?.raw_name || item?.company, 220);
  if (!id || !company) return unresolved(item, 'missing_company');

  const key = cacheKey({ ...item, company });
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, id };

  const existingDomain = rootDomain(item?.domain || item?.url || '');
  let identity = existingDomain && !isBlockedDomain(existingDomain)
    ? await inspectDomain(company, existingDomain, 'existing_domain')
    : null;

  if (!identity) {
    const searchRows = await tavilyCandidates(company, clean(item?.country, 80));
    const tried = new Set(existingDomain ? [existingDomain] : []);
    for (const row of searchRows.slice(0, 4)) {
      if (!row.domain || tried.has(row.domain)) continue;
      tried.add(row.domain);
      identity = await inspectDomain(company, row.domain, 'web_search');
      if (identity) break;
    }
  }

  const value = identity ? { id, ...identity } : unresolved({ ...item, company });
  memoryCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

async function mapLimit(items, limit, worker) {
  const list = Array.isArray(items) ? items : [];
  const out = new Array(list.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (cursor < list.length) {
      const index = cursor++;
      try { out[index] = await worker(list[index], index); }
      catch { out[index] = unresolved(list[index], 'resolver_error'); }
    }
  });
  await Promise.all(runners);
  return out;
}

export async function resolveCompanyIdentities(items = []) {
  const rows = (Array.isArray(items) ? items : []).slice(0, 30);
  return mapLimit(rows, 3, resolveCompanyIdentity);
}

export function extractIdentityCandidates(html = '', pageUrl = '') {
  return extractIdentityPage(html, pageUrl).candidates;
}

export function chooseBrand(candidates = [], company = '', domain = '') {
  const selected = chooseBrandEvidence(Array.isArray(candidates) ? candidates : []);
  return selected ? { source: selected.sources.join('+'), value: selected.value, score: selected.score } : null;
}

export { IDENTITY_VERSION, chooseBrandEvidence };
