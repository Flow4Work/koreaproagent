import { aiConfigured, chatJson } from './ai-provider.js';

const TAVILY_URL = 'https://api.tavily.com/search';
const IDENTITY_VERSION = '20260830-email-domain-identity-v5';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const BLOCKED_DOMAINS = new Set([
  'linkedin.com','facebook.com','instagram.com','youtube.com','x.com','twitter.com','wikipedia.org',
  '10times.com','eventbrite.com','medium.com','made-in-china.com','globalsources.com','tradeindia.com',
  'exporthub.com','tradekey.com','1688.com','alibaba.com','amazon.com','scribd.com'
]);
const FREE_MAIL = new Set([
  'gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','yahoo.com','yahoo.co.jp','icloud.com',
  'me.com','qq.com','163.com','126.com','foxmail.com','proton.me','protonmail.com','naver.com','daum.net','hanmail.net'
]);
const MULTI_SUFFIXES = new Set([
  'ac.kr','co.kr','go.kr','ne.kr','or.kr','re.kr','pe.kr','ac.uk','co.uk','gov.uk','ltd.uk','me.uk','net.uk','nhs.uk','org.uk','plc.uk','sch.uk',
  'asn.au','com.au','edu.au','gov.au','id.au','net.au','org.au','ac.jp','co.jp','go.jp','ne.jp','or.jp','com.br','com.cn','com.hk','com.mx','com.sg',
  'com.tr','com.tw','com.vn','co.id','co.in','co.nz','co.th','co.za','net.cn','net.in','org.cn','org.in'
]);
const LEGAL_SUFFIX_RE = /(?:\s*[,.-]?\s*)(?:co\.?\s*,?\s*ltd\.?|co\.?\s*ltd\.?|company\s+limited|ltd\.?|limited|llc|l\.l\.c\.?|inc\.?|incorporated|corp\.?|corporation|plc|p\.l\.c\.?|gmbh|ag|s\.a\.?|s\.a\.s\.?|sas|b\.v\.?|bv|n\.v\.?|nv|pte\.?\s*ltd\.?|pty\.?\s*ltd\.?|llp|l\.p\.?|sp\.?\s*z\.?\s*o\.?\s*o\.?|srl|s\.r\.l\.?|oy|ab|as|aps|kk|k\.k\.?|jsc|cjsc|ooo|oü|uab)$/i;
const GENERIC_BRAND = /^(?:home|homepage|official|official site|official website|welcome|contact|about us|about|products?|services?|company|corporate|website|shop|store|logo|brand logo|company logo|site logo)$/i;
const JUNK_EMAIL_LOCAL = new Set(['noreply','no-reply','donotreply','abuse','postmaster','webmaster']);
const STRONG_SOURCES = new Set(['alternateName','websiteName','websiteAlternateName','og:site_name','application-name','brand_declaration','tavily_exact_domain']);
const MEDIUM_SOURCES = new Set(['organizationName','brandName']);

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

function candidateClean(value = '') {
  let name = decodeHtml(value, 4000)
    .replace(/^\s*(?:welcome\s+to|official\s+website\s+of)\s+/i, '')
    .replace(/^[\s_-]*logo[\s:_-]+/i, '')
    .replace(/[\s:_-]+logo\s*$/i, '')
    .replace(/\s*(?:공식\s*홈페이지|공식\s*사이트)\s*$/i, '')
    .replace(/[™®©]/g, '')
    .replace(/\s+/g, ' ').trim();

  const parts = name.split(/\s*[|–—]\s*/).map(part => part.trim()).filter(Boolean);
  if (parts.length > 1 && parts[0].length >= 2 && parts[0].length <= 70) name = parts[0];
  name = name.replace(/^\s*(?:home|official site|official website)\s*[-:|]\s*/i, '').trim();
  if (GENERIC_BRAND.test(name)) return '';
  return name;
}

function validBrandCandidate(value = '') {
  const name = candidateClean(value);
  if (!name || name.length < 2 || name.length > 80 || GENERIC_BRAND.test(name)) return false;
  if (/https?:\/\/|@|\b(?:privacy|terms|cookie|copyright|all rights reserved)\b/i.test(name)) return false;
  if ((name.match(/\s+/g) || []).length > 8) return false;
  return /[\p{L}\p{N}]/u.test(name);
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

function pageText(html = '') {
  return decodeHtml(String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '), 50000).slice(0, 50000);
}

function walkJsonLd(node, add, addLegal) {
  if (Array.isArray(node)) return node.forEach(item => walkJsonLd(item, add, addLegal));
  if (!node || typeof node !== 'object') return;
  const type = Array.isArray(node['@type']) ? node['@type'].join(' ') : clean(node['@type'], 120);
  if (/organization|corporation|localbusiness|professionalservice/i.test(type)) {
    if (node.alternateName) add('alternateName', node.alternateName, 120, 'strong');
    if (node.name) add('organizationName', node.name, 100, 'medium');
    if (node.legalName) addLegal(node.legalName);
  }
  if (/\bbrand\b/i.test(type)) {
    if (node.name) add('brandName', node.name, 105, 'medium');
    if (node.alternateName) add('alternateName', node.alternateName, 120, 'strong');
  }
  if (/\bwebsite\b/i.test(type)) {
    if (node.name) add('websiteName', node.name, 118, 'strong');
    if (node.alternateName) add('websiteAlternateName', node.alternateName, 119, 'strong');
  }
  for (const value of Object.values(node)) walkJsonLd(value, add, addLegal);
}

function brandDeclarations(text = '') {
  const out = [];
  const patterns = [
    /\b([A-Za-z0-9][A-Za-z0-9&.'’+\- ]{1,48}?)\s+(?:is|are)\s+(?:our|the|a)\s+brand\b/gi,
    /\bbrand(?:\s+name)?\s*(?:is|:|：)\s*([A-Za-z0-9][A-Za-z0-9&.'’+\- ]{1,48})/gi,
    /\bunder\s+the\s+brand\s+([A-Za-z0-9][A-Za-z0-9&.'’+\- ]{1,48})/gi,
    /\b((?!OUR\b|THE\b|THIS\b)[A-Z][A-Z0-9&.'’+\-]{2,30}(?:\s+[A-Za-z][A-Za-z0-9&.'’+\-]{1,30}){0,2})\s+is\s+(?:a|an|the)\s+(?:(?:professional|leading|trusted)\s+)?(?:designer|developer|producer|seller|manufacturer|supplier|social\s+impact\s+business)\b/g,
    /\b(?:[Ww]hy\s+[Cc]hoose|[Cc]ome\s+to)\s+((?!OUR\b|THE\b|THIS\b)[A-Z][A-Z0-9&.'’+\-]{2,30}(?:\s+[A-Za-z][A-Za-z0-9&.'’+\-]{1,30}){0,2}?)(?=[?!,.;]|\s{2,}|$)/g,
    /(?:THƯƠNG\s+HIỆU|NHÃN\s+HIỆU)\s+([A-Z0-9][A-Z0-9&.'’+\- ]{1,48})/giu,
    /\b([A-Z][A-Z0-9&.'’+\- ]{1,48}?)\s+là\s+(?:nhãn\s+hiệu|thương\s+hiệu)\b/giu
  ];
  for (const pattern of patterns) {
    for (const match of String(text).matchAll(pattern)) {
      const value = candidateClean(match[1]);
      if (validBrandCandidate(value)) out.push(value);
    }
  }
  return [...new Set(out)].slice(0, 12);
}

function extractIdentityPage(html = '', pageUrl = '') {
  const candidates = [];
  const legalNames = [];
  const add = (source, value, score, strength = 'weak') => {
    const normalized = candidateClean(value);
    if (!validBrandCandidate(normalized)) return;
    candidates.push({ source, value: normalized, score, strength, page_url: pageUrl });
  };
  const addLegal = value => {
    const normalized = candidateClean(value);
    if (normalized) legalNames.push(normalized);
  };

  for (const json of extractJsonLd(html)) walkJsonLd(json, add, addLegal);
  metaValues(html, 'og:site_name').forEach(value => add('og:site_name', value, 118, 'strong'));
  metaValues(html, 'application-name').forEach(value => add('application-name', value, 115, 'strong'));

  const title = String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  if (title) add('title', title, 72, 'weak');

  for (const match of String(html).matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)) add('h1', pageText(match[1]), 78, 'weak');
  for (const match of String(html).matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const marker = `${attrValue(tag, 'class')} ${attrValue(tag, 'id')} ${attrValue(tag, 'src')}`.toLowerCase();
    if (!/logo|brand|header/.test(marker)) continue;
    add('logo_alt', attrValue(tag, 'alt') || attrValue(tag, 'title'), 108, 'medium');
  }
  brandDeclarations(pageText(html)).forEach(value => add('brand_declaration', value, 124, 'strong'));
  return { candidates, legalNames: [...new Set(legalNames)] };
}

export function chooseBrandEvidence(candidates = []) {
  const groups = new Map();
  for (const row of candidates) {
    const value = candidateClean(row?.value);
    if (!validBrandCandidate(value)) continue;
    const key = comparable(value);
    if (!key) continue;
    const current = groups.get(key) || { values: [], sources: new Set(), pages: new Set(), strong: new Set(), medium: new Set(), bestScore: 0 };
    current.values.push(value);
    current.sources.add(String(row.source || ''));
    if (row.page_url) current.pages.add(row.page_url);
    if (row.strength === 'strong' || STRONG_SOURCES.has(row.source)) current.strong.add(String(row.source || ''));
    if (row.strength === 'medium' || MEDIUM_SOURCES.has(row.source)) current.medium.add(String(row.source || ''));
    current.bestScore = Math.max(current.bestScore, Number(row.score || 0));
    groups.set(key, current);
  }

  const viable = [];
  for (const group of groups.values()) {
    const signals = group.sources.size + Math.max(0, group.pages.size - 1);
    const strong = group.strong.size > 0;
    const consensus = group.medium.size > 0 && signals >= 2;
    const weakConsensus = signals >= 2 && group.pages.size >= 2;
    if (!strong && !consensus && !weakConsensus) continue;
    const value = group.values.slice().sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
    viable.push({
      value,
      confidence: strong ? Math.min(0.99, 0.95 + Math.min(0.03, Math.max(0, signals - 1) * 0.01)) : consensus ? 0.92 : 0.89,
      signal_count: signals,
      sources: [...group.sources],
      pages: [...group.pages],
      score: group.bestScore + (strong ? 30 : 0) + signals * 4 - Math.min(10, value.length / 10)
    });
  }
  return viable.sort((a, b) => b.score - a.score || b.confidence - a.confidence || a.value.length - b.value.length)[0] || null;
}

async function fetchText(url, timeoutMs = 5500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KoreaAgentEmailIdentity/5.0)' }
    });
    const contentType = clean(response.headers.get('content-type'), 120).toLowerCase();
    if (!response.ok || (!contentType.includes('text/html') && !contentType.includes('application/xhtml'))) return null;
    return { html: (await response.text()).slice(0, 500000), finalUrl: response.url || url };
  } catch { return null; }
  finally { clearTimeout(timer); }
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
    if (!/(about|company|corporate|profile|contact|brand|story|who-we-are|our-story)/i.test(url.pathname)) continue;
    url.hash = ''; url.search = '';
    out.push(url.toString());
  }
  return [...new Set(out)].slice(0, 3);
}

function extractEmails(html = '', pageUrl = '') {
  const text = pageText(html)
    .replace(/\s*(?:\[|\(|\{)?\s*(?:at)\s*(?:\]|\)|\})?\s*/gi, '@')
    .replace(/\s*(?:\[|\(|\{)?\s*(?:dot)\s*(?:\]|\)|\})?\s*/gi, '.');
  const visible = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const mailto = [...String(html).matchAll(/href\s*=\s*["']mailto:([^"'?\s>]+)/gi)].map(match => decodeHtml(match[1], 500));
  return [...new Set([...visible, ...mailto].map(email => clean(email, 240).toLowerCase()))]
    .filter(email => {
      const [local, host] = email.split('@');
      return local && host && !JUNK_EMAIL_LOCAL.has(local) && !FREE_MAIL.has(rootDomain(host));
    })
    .slice(0, 30)
    .map(email => ({ email, source_url: pageUrl }));
}

async function tavilyExactDomain(domain = '') {
  const key = clean(process.env.TAVILY_API_KEY, 5000);
  if (!key || !domain) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7500);
  try {
    const response = await fetch(TAVILY_URL, {
      method: 'POST', signal: controller.signal, cache: 'no-store',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `site:${domain} "${domain}" company brand`,
        search_depth: 'basic', max_results: 6, topic: 'general', include_answer: false, include_raw_content: false,
        include_domains: [domain]
      })
    });
    if (!response.ok) return [];
    const data = await response.json().catch(() => ({}));
    return (Array.isArray(data?.results) ? data.results : [])
      .filter(row => rootDomain(row?.url) === domain)
      .map(row => ({ url: clean(row?.url, 600), title: candidateClean(row?.title), content: clean(row?.content, 1400), score: Number(row?.score || 0) }))
      .filter(row => row.url && row.title && validBrandCandidate(row.title));
  } catch { return []; }
  finally { clearTimeout(timer); }
}

async function adjudicate(domain, candidates = []) {
  if (!aiConfigured()) return null;
  const allowed = [...new Set(candidates.map(row => candidateClean(row?.value)).filter(validBrandCandidate))].slice(0, 10);
  if (allowed.length < 2) return null;
  try {
    const result = await chatJson({
      prompt: `Identify the public-facing company or brand name that owns the email domain ${domain}.\nYou may ONLY choose one exact string from this allowed list, or return an empty string if evidence is insufficient.\nAllowed names: ${JSON.stringify(allowed)}\nReturn JSON exactly: {"greeting_name":"","confidence":0}.\nDo not choose words such as logo, homepage, official website, product category, or page title descriptors.`,
      maxTokens: 180,
      timeoutMs: 12000,
      hardDeadlineMs: 18000,
      temperature: 0
    });
    const requested = candidateClean(result?.data?.greeting_name || '');
    const selected = allowed.find(value => comparable(value) === comparable(requested));
    if (!selected || Number(result?.data?.confidence || 0) < 0.75) return null;
    return { value: selected, confidence: Math.min(0.96, Math.max(0.88, Number(result.data.confidence) || 0.88)), sources: ['llm_evidence_choice'], pages: [], signal_count: 1, score: 150 };
  } catch { return null; }
}

async function inspectDomain(domain, source = 'recipient_email_domain') {
  const recipientDomain = rootDomain(domain);
  if (!recipientDomain || BLOCKED_DOMAINS.has(recipientDomain) || FREE_MAIL.has(recipientDomain)) return null;

  let home = null;
  for (const url of [`https://${recipientDomain}/`, `https://www.${recipientDomain}/`]) {
    home = await fetchText(url);
    if (home?.html) break;
  }

  const pages = [];
  let websiteDomain = recipientDomain;
  if (home?.html) {
    websiteDomain = rootDomain(home.finalUrl || recipientDomain) || recipientDomain;
    pages.push({ url: home.finalUrl || `https://${websiteDomain}/`, html: home.html });
    const links = internalIdentityLinks(home.html, pages[0].url).slice(0, 2);
    const extra = await Promise.all(links.map(async url => ({ url, page: await fetchText(url, 4500) })));
    for (const row of extra) {
      if (row.page?.html && rootDomain(row.page.finalUrl || row.url) === websiteDomain) pages.push({ url: row.page.finalUrl || row.url, html: row.page.html });
    }
  }

  const candidates = [];
  const legalNames = [];
  const officialEmails = [];
  for (const page of pages) {
    const extracted = extractIdentityPage(page.html, page.url);
    candidates.push(...extracted.candidates);
    legalNames.push(...extracted.legalNames);
    officialEmails.push(...extractEmails(page.html, page.url));
  }

  let brand = chooseBrandEvidence(candidates);
  if (!brand) {
    const searchRows = await tavilyExactDomain(recipientDomain);
    for (const row of searchRows) {
      candidates.push({ source: 'tavily_exact_domain', value: row.title, score: 112 + Math.round(row.score * 10), strength: 'strong', page_url: row.url });
    }
    brand = chooseBrandEvidence(candidates) || await adjudicate(recipientDomain, candidates);
  }

  if (!brand?.value) return null;

  const emailMap = new Map();
  for (const item of officialEmails) if (!emailMap.has(item.email)) emailMap.set(item.email, item);
  const evidenceUrl = brand.pages?.[0] || pages[0]?.url || `https://${recipientDomain}/`;
  return {
    raw_name: '',
    legal_name: clean(legalNames[0] || '', 220),
    brand_name: brand.value,
    greeting_name: brand.value,
    recipient_domain: recipientDomain,
    domain: websiteDomain,
    confidence: Number(brand.confidence || 0.9),
    evidence_url: evidenceUrl,
    evidence_urls: [...new Set([evidenceUrl, ...(brand.pages || []), ...pages.map(page => page.url)])].filter(Boolean).slice(0, 6),
    brand_evidence: { sources: brand.sources || [], signal_count: Number(brand.signal_count || 1) },
    official_emails: [...emailMap.values()].slice(0, 30),
    official_email_domains: [...new Set([...emailMap.keys()].map(rootDomain).filter(Boolean))],
    evidence_source: source,
    matched_by: (brand.sources || []).join('+'),
    status: 'verified',
    verified_at: new Date().toISOString(),
    identity_version: IDENTITY_VERSION
  };
}

function unresolved(item = {}, reason = 'recipient_domain_unresolved') {
  const domain = rootDomain(item?.domain || item?.url || '');
  return {
    id: clean(item?.id, 180), raw_name: clean(item?.raw_name || item?.company, 220),
    legal_name: '', brand_name: '', greeting_name: '', recipient_domain: domain, domain,
    confidence: 0, evidence_url: '', evidence_urls: [], brand_evidence: { sources: [], signal_count: 0 },
    official_emails: [], official_email_domains: [], evidence_source: '', matched_by: '', status: 'needs_review', reason,
    verified_at: new Date().toISOString(), identity_version: IDENTITY_VERSION
  };
}

function cacheKey(item = {}) {
  return `${rootDomain(item?.domain || item?.url || '')}|${IDENTITY_VERSION}`;
}

export async function resolveCompanyIdentity(item = {}) {
  const id = clean(item?.id, 180);
  const recipientDomain = rootDomain(item?.domain || item?.url || '');
  if (!id || !recipientDomain) return unresolved(item, 'missing_recipient_domain');
  if (FREE_MAIL.has(recipientDomain)) return unresolved(item, 'free_mail_domain');

  const key = cacheKey(item);
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, id, raw_name: clean(item?.raw_name || item?.company, 220) };

  const identity = await inspectDomain(recipientDomain, 'recipient_email_domain');
  const value = identity
    ? { id, ...identity, raw_name: clean(item?.raw_name || item?.company, 220) }
    : unresolved(item);
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
  return mapLimit((Array.isArray(items) ? items : []).slice(0, 30), 5, resolveCompanyIdentity);
}

export function extractIdentityCandidates(html = '', pageUrl = '') {
  return extractIdentityPage(html, pageUrl).candidates;
}

export function chooseBrand(candidates = []) {
  const selected = chooseBrandEvidence(Array.isArray(candidates) ? candidates : []);
  return selected ? { source: selected.sources.join('+'), value: selected.value, score: selected.score } : null;
}

export { IDENTITY_VERSION };
