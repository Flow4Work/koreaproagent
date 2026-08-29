const TAVILY_URL = 'https://api.tavily.com/search';
const IDENTITY_VERSION = '20260829-company-identity-v1';
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
  'packaging','package','plastic','plastics','bottle','bottles','glass','crystal','industry','industrial','manufacturing','manufacturer','factory','trade','trading',
  'guangzhou','shenzhen','shanghai','beijing','ningbo','yuyao','dongguan','china','korea','japan','usa','uk','germany','france','team'
]);
const GENERIC_BRAND_WORDS = /^(?:home|homepage|official|official site|welcome|contact|about us|products?|services?|company|corporate|website|shop|store)$/i;
const LEGAL_SUFFIX_RE = /(?:\s*[,.-]?\s*)(?:co\.?\s*,?\s*ltd\.?|co\.?\s*ltd\.?|company\s+limited|ltd\.?|limited|llc|l\.l\.c\.?|inc\.?|incorporated|corp\.?|corporation|plc|p\.l\.c\.?|gmbh|ag|s\.a\.?|s\.a\.s\.?|sas|b\.v\.?|bv|n\.v\.?|nv|pte\.?\s*ltd\.?|pty\.?\s*ltd\.?|llp|l\.p\.?|sp\.?\s*z\.?\s*o\.?\s*o\.?|srl|s\.r\.l\.?|oy|ab|as|aps|kk|k\.k\.?|jsc|cjsc|ooo|oü|uab)$/i;

const memoryCache = new Map();
const clean = (value = '', max = 800) => String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function decodeHtml(value = '') {
  return clean(value, 500)
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
  let name = decodeHtml(value).replace(/[|·]+$/g, '').trim();
  let previous = '';
  while (name && name !== previous) {
    previous = name;
    name = name.replace(LEGAL_SUFFIX_RE, '').replace(/[\s,.-]+$/g, '').trim();
  }
  return name;
}

function tokens(value = '', { significant = false } = {}) {
  const rows = clean(value, 260).toLowerCase().replace(/&/g, ' and ').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return [...new Set(rows.filter(token => token.length >= 2 && (!significant || (token.length >= 3 && !GENERIC_COMPANY_TOKENS.has(token)))) )];
}

function rawCompanyMatch(company = '', text = '') {
  const raw = clean(company, 220);
  const hay = clean(text, 30000).toLowerCase();
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

function domainLooksRelated(company = '', domain = '') {
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
  return decodeHtml(match?.[1] || match?.[2] || match?.[3] || '');
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

function walkJsonLd(node, collector) {
  if (Array.isArray(node)) return node.forEach(item => walkJsonLd(item, collector));
  if (!node || typeof node !== 'object') return;
  const type = Array.isArray(node['@type']) ? node['@type'].join(' ') : clean(node['@type'], 120);
  if (/organization|corporation|localbusiness|brand|professionalservice/i.test(type)) {
    if (node.alternateName) collector('alternateName', node.alternateName, 118);
    if (node.name) collector('jsonName', node.name, 105);
    if (node.legalName) collector('legalName', node.legalName, 72);
  }
  for (const value of Object.values(node)) walkJsonLd(value, collector);
}

function candidateClean(value = '') {
  let name = decodeHtml(value)
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

export function extractIdentityCandidates(html = '') {
  const candidates = [];
  const seen = new Set();
  const add = (source, value, score) => {
    const raw = candidateClean(value);
    if (!validBrandCandidate(raw)) return;
    const key = comparable(raw);
    if (!key || seen.has(`${source}:${key}`)) return;
    seen.add(`${source}:${key}`);
    candidates.push({ source, value: raw, score });
    const stripped = stripLegalSuffix(raw);
    if (stripped && comparable(stripped) !== key && validBrandCandidate(stripped)) {
      candidates.push({ source: `${source}:legal-stripped`, value: stripped, score: score + 8 });
    }
  };

  for (const json of extractJsonLd(html)) walkJsonLd(json, add);
  metaValues(html, 'og:site_name').forEach(value => add('og:site_name', value, 115));
  metaValues(html, 'application-name').forEach(value => add('application-name', value, 112));
  metaValues(html, 'twitter:title').forEach(value => add('twitter:title', value, 82));

  const title = String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  if (title) add('title', title, 84);

  for (const match of String(html).matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const marker = `${attrValue(tag, 'class')} ${attrValue(tag, 'id')} ${attrValue(tag, 'src')}`.toLowerCase();
    if (!/logo|brand|header/.test(marker)) continue;
    add('logo_alt', attrValue(tag, 'alt') || attrValue(tag, 'title'), 108);
  }
  return candidates;
}

function chooseBrand(candidates = [], company = '', domain = '') {
  const rawCompact = comparable(stripLegalSuffix(company));
  const stem = comparable(domainStem(domain));
  let best = null;
  for (const row of candidates) {
    const value = candidateClean(row?.value);
    if (!validBrandCandidate(value)) continue;
    const key = comparable(value);
    let score = Number(row?.score || 0);
    if (rawCompact && key === rawCompact) score += 24;
    else if (rawCompact && (rawCompact.includes(key) || key.includes(rawCompact)) && Math.min(rawCompact.length, key.length) >= 4) score += 16;
    if (stem && (key.includes(stem) || stem.includes(key)) && Math.min(stem.length, key.length) >= 3) score += 16;
    score -= Math.min(10, Math.max(0, value.length - 28) / 4);
    if (!best || score > best.score || (score === best.score && value.length < best.value.length)) best = { ...row, value, score };
  }
  if (!best) {
    const fallback = stripLegalSuffix(company);
    return validBrandCandidate(fallback) ? { source: 'input:legal-stripped', value: fallback, score: 55 } : null;
  }
  return best;
}

function pageText(html = '') {
  return decodeHtml(String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')).slice(0, 30000);
}

async function fetchText(url, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KoreaAgentCompanyIdentity/1.0)' }
    });
    const contentType = clean(response.headers.get('content-type'), 120).toLowerCase();
    if (!response.ok || (!contentType.includes('text/html') && !contentType.includes('application/xhtml'))) return null;
    const html = (await response.text()).slice(0, 450000);
    return { html, finalUrl: response.url || url, status: response.status };
  } catch { return null; }
  finally { clearTimeout(timer); }
}

async function inspectDomain(company, domain, source = 'existing_domain') {
  const root = rootDomain(domain);
  if (!root || isBlockedDomain(root)) return null;
  const attempts = [`https://${root}/`, `https://www.${root}/`];
  for (const url of attempts) {
    const page = await fetchText(url);
    if (!page?.html) continue;
    const finalDomain = rootDomain(page.finalUrl || root);
    if (!finalDomain || isBlockedDomain(finalDomain)) continue;
    const text = `${pageText(page.html)} ${extractIdentityCandidates(page.html).map(row => row.value).join(' ')}`;
    const companyMatched = rawCompanyMatch(company, text) || domainLooksRelated(company, finalDomain);
    if (!companyMatched) continue;
    const candidates = extractIdentityCandidates(page.html);
    const best = chooseBrand(candidates, company, finalDomain);
    if (!best?.value) continue;
    const legal = candidates.find(row => row.source === 'legalName')?.value || (LEGAL_SUFFIX_RE.test(clean(company, 220)) ? clean(company, 220) : '');
    const confidenceBase = /alternateName|og:site_name|application-name/.test(best.source) ? 0.98
      : /jsonName|logo_alt/.test(best.source) ? 0.95
      : /title/.test(best.source) ? 0.90 : 0.87;
    return {
      raw_name: clean(company, 220),
      legal_name: clean(legal, 220),
      brand_name: best.value,
      greeting_name: stripLegalSuffix(best.value) || best.value,
      domain: finalDomain,
      confidence: Math.max(0.85, Math.min(0.99, confidenceBase - (source === 'existing_domain' ? 0 : 0.01))),
      evidence_url: page.finalUrl || `https://${finalDomain}/`,
      evidence_source: source === 'existing_domain' ? 'official_homepage' : 'web_search+official_homepage',
      matched_by: best.source,
      status: 'verified',
      verified_at: new Date().toISOString(),
      identity_version: IDENTITY_VERSION
    };
  }
  return null;
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

function unresolved(item = {}, reason = 'official_identity_not_verified') {
  return {
    id: clean(item?.id, 180), raw_name: clean(item?.company || item?.raw_name, 220),
    legal_name: '', brand_name: '', greeting_name: '', domain: rootDomain(item?.domain || item?.url || ''),
    confidence: 0, evidence_url: '', evidence_source: '', matched_by: '', status: 'needs_review', reason,
    verified_at: new Date().toISOString(), identity_version: IDENTITY_VERSION
  };
}

function cacheKey(item = {}) {
  return `${comparable(item?.company || item?.raw_name)}|${rootDomain(item?.domain || item?.url || '')}`;
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

export { IDENTITY_VERSION, rawCompanyMatch, domainLooksRelated, chooseBrand };
