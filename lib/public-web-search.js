const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 120;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_USER_AGENT = 'KoreaAgent/1.0 (+https://github.com/Flow4Work/koreaproagent)';
const CACHE = globalThis.__KOREA_AGENT_PUBLIC_WEB_CACHE__ ||= new Map();

const STOP_WORDS = new Set([
  'the','and','for','with','from','into','this','that','site','official','website','company','companies',
  'product','features','customers','platform','software','saas','b2b','korea','korean','south','asia','apac',
  '2025','2026','www','com','http','https'
]);

function clean(value, max = 1200) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function decodeEntities(value = '') {
  const named = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ' };
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (all, name) => named[name.toLowerCase()] ?? all);
}

function stripHtml(value = '', max = 1200) {
  return clean(decodeEntities(String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')), max);
}

function normalizeUrl(value = '') {
  try {
    const url = new URL(decodeEntities(value).trim(), 'https://example.invalid');
    if (!/^https?:$/.test(url.protocol) || url.hostname === 'example.invalid') return '';
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'].forEach(key => url.searchParams.delete(key));
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function hostname(value = '') {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}

function rootHost(value = '') {
  const host = hostname(value), parts = host.split('.');
  if (parts.length <= 2) return host;
  const suffix = parts.slice(-2).join('.');
  if (/^(co|com|org|net)\.(uk|jp|kr|au|sg)$/.test(suffix)) return parts.slice(-3).join('.');
  return suffix;
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function queryTerms(query = '') {
  return [...new Set(String(query)
    .replace(/site:[^\s]+/gi, ' ')
    .replace(/https?:\/\/[^\s]+/gi, ' ')
    .toLowerCase()
    .match(/[a-z0-9가-힣][a-z0-9가-힣+._-]{1,}/g) || [])]
    .filter(term => term.length > 1 && !STOP_WORDS.has(term))
    .slice(0, 18);
}

function extractSiteDomain(query = '') {
  const site = String(query).match(/(?:^|\s)site:([a-z0-9.-]+)(?=\s|$)/i)?.[1];
  if (site) return site.toLowerCase().replace(/^www\./, '');
  const explicit = String(query).match(/https?:\/\/([^/\s]+)/i)?.[1];
  return explicit ? explicit.toLowerCase().replace(/^www\./, '') : '';
}

function dateCutoff(timeRange) {
  const days = { day:1, week:7, month:31, year:366 }[timeRange];
  return days ? Date.now() - days * 86400000 : 0;
}

function parseDate(value = '') {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function domainAllowed(url, includeDomains = [], excludeDomains = []) {
  const host = hostname(url);
  if (!host) return false;
  const matches = domain => host === domain || host.endsWith(`.${domain}`);
  if (excludeDomains.some(domain => matches(String(domain).toLowerCase().replace(/^www\./, '')))) return false;
  return !includeDomains.length || includeDomains.some(domain => matches(String(domain).toLowerCase().replace(/^www\./, '')));
}

function scoreResult(result, terms = []) {
  const text = `${result.title || ''} ${result.content || ''} ${result.url || ''}`.toLowerCase();
  let score = Number(result.score) || 0;
  for (const term of terms) {
    const pattern = new RegExp(`(?:^|[^a-z0-9가-힣])${escapeRegExp(term)}(?:$|[^a-z0-9가-힣])`, 'i');
    if (pattern.test(text)) score += result.title?.toLowerCase().includes(term) ? 0.11 : 0.05;
  }
  if (/(apac|asia|japan|singapore|australia|hong kong|taiwan|seoul|korea)/i.test(text)) score += 0.12;
  if (/(expan|launch|hiring|partnership|sales|series [abc]|seed|funding|raised|investment|go-to-market|gtm)/i.test(text)) score += 0.12;
  if (result.published_date && parseDate(result.published_date) > Date.now() - 45 * 86400000) score += 0.08;
  return Math.min(1, score);
}

function dedupeAndRank(rows, query, options = {}) {
  const terms = queryTerms(query);
  const cutoff = dateCutoff(options.timeRange);
  const seen = new Set();
  return rows
    .map(row => ({
      title:clean(row?.title, 260),
      url:normalizeUrl(row?.url),
      content:clean(row?.content, 900),
      score:Number(row?.score) || 0,
      published_date:clean(row?.published_date, 60),
      source:clean(row?.source, 40)
    }))
    .filter(row => row.url && row.title)
    .filter(row => domainAllowed(row.url, options.includeDomains || [], options.excludeDomains || []))
    .filter(row => !cutoff || !row.published_date || parseDate(row.published_date) >= cutoff)
    .filter(row => {
      const key = `${rootHost(row.url)}|${row.url.replace(/\/$/, '')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(row => ({ ...row, score:scoreResult(row, terms) }))
    .sort((a, b) => b.score - a.score);
}

function xmlTag(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decodeEntities(match[1]).trim() : '';
}

export function parseRss(xml = '', source = 'rss') {
  const rows = [];
  const blocks = String(xml).match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const block of blocks) {
    const atomLink = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] || '';
    const title = stripHtml(xmlTag(block, 'title'), 260);
    const url = normalizeUrl(xmlTag(block, 'link') || atomLink || xmlTag(block, 'guid'));
    const content = stripHtml(xmlTag(block, 'description') || xmlTag(block, 'summary') || xmlTag(block, 'content'), 900);
    const published = xmlTag(block, 'pubDate') || xmlTag(block, 'published') || xmlTag(block, 'updated') || xmlTag(block, 'dc:date');
    if (title && url) rows.push({ title, url, content, published_date:published, score:0.56, source });
  }
  return rows;
}

export function parseSitemap(xml = '') {
  const rows = [];
  const blocks = String(xml).match(/<url\b[\s\S]*?<\/url>/gi) || [];
  for (const block of blocks) {
    const url = normalizeUrl(xmlTag(block, 'loc'));
    if (url) rows.push({ url, lastmod:xmlTag(block, 'lastmod') });
  }
  const indexes = String(xml).match(/<sitemap\b[\s\S]*?<\/sitemap>/gi) || [];
  for (const block of indexes) {
    const url = normalizeUrl(xmlTag(block, 'loc'));
    if (url) rows.push({ url, lastmod:xmlTag(block, 'lastmod'), sitemap:true });
  }
  return rows;
}

function unwrapDuckDuckGo(value = '') {
  try {
    const absolute = new URL(decodeEntities(value), 'https://html.duckduckgo.com');
    const wrapped = absolute.searchParams.get('uddg');
    return normalizeUrl(wrapped ? decodeURIComponent(wrapped) : absolute.toString());
  } catch {
    return '';
  }
}

export function parseDuckDuckGo(html = '') {
  const rows = [];
  const regex = /<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(String(html)))) {
    const next = String(html).slice(regex.lastIndex, regex.lastIndex + 1800);
    const snippet = next.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1] || '';
    const url = unwrapDuckDuckGo(match[1]);
    if (url && !/duckduckgo\.com$/i.test(hostname(url))) rows.push({
      title:stripHtml(match[2], 260),
      url,
      content:stripHtml(snippet, 900),
      score:0.72,
      published_date:'',
      source:'duckduckgo-html'
    });
  }
  return rows;
}

export function parseHackerNews(html = '') {
  const rows = [];
  const regex = /<span\b[^>]*class=["']titleline["'][^>]*>\s*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(String(html)))) {
    const url = normalizeUrl(match[1]);
    if (url) rows.push({ title:stripHtml(match[2], 260), url, content:'Hacker News startup or hiring signal', score:0.43, published_date:'', source:'hacker-news-html' });
  }
  return rows;
}

export function extractHtmlDocument(html = '', url = '') {
  const raw = String(html);
  const title = stripHtml(raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '', 260);
  const description = stripHtml(
    raw.match(/<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']*)["'][^>]*>/i)?.[1] ||
    raw.match(/<meta\b[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*>/i)?.[1] || '',
    900
  );
  const date = raw.match(/<meta\b[^>]*(?:property|name)=["'](?:article:published_time|date|datePublished)["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1] || '';
  const feedLinks = [...raw.matchAll(/<link\b[^>]*type=["']application\/(?:rss|atom)\+xml["'][^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .map(match => normalizeUrl(new URL(decodeEntities(match[1]), url).toString()))
    .filter(Boolean);
  return { title:title || hostname(url), url:normalizeUrl(url), content:description || stripHtml(raw, 900), published_date:date, feedLinks };
}

async function fetchText(url, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS, accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      redirect:'follow',
      headers:{ 'User-Agent':DEFAULT_USER_AGENT, Accept:accept, 'Accept-Language':'en-US,en;q=0.8,ko;q=0.5' },
      signal:controller.signal
    });
    if (!response?.ok) throw new Error(`HTTP ${response?.status || 0}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function searchDuckDuckGo(query, options, dependencies) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try { return parseDuckDuckGo(await fetchText(url, dependencies)).slice(0, Math.max(options.maxResults * 2, 12)); }
  catch { return []; }
}

async function searchNewsRss(query, options, dependencies) {
  const feeds = [
    { source:'google-news-rss', url:`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en` },
    { source:'bing-news-rss', url:`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss` }
  ];
  const settled = await Promise.allSettled(feeds.map(async feed => parseRss(await fetchText(feed.url, { ...dependencies, accept:'application/rss+xml,application/xml,text/xml,*/*' }), feed.source)));
  return settled.flatMap(item => item.status === 'fulfilled' ? item.value : []);
}

async function searchHackerNews(query, options, dependencies) {
  const pages = ['https://news.ycombinator.com/shownew', 'https://news.ycombinator.com/jobs'];
  const settled = await Promise.allSettled(pages.map(async url => parseHackerNews(await fetchText(url, dependencies))));
  const terms = queryTerms(query);
  return settled.flatMap(item => item.status === 'fulfilled' ? item.value : [])
    .filter(row => !terms.length || terms.some(term => `${row.title} ${row.content}`.toLowerCase().includes(term)))
    .slice(0, Math.max(options.maxResults, 8));
}

function pathScore(url, terms) {
  const path = String(url).toLowerCase();
  let score = terms.reduce((sum, term) => sum + (path.includes(term) ? 3 : 0), 0);
  if (/(news|blog|press|career|jobs|partner|customer|case-study|resources|company)/i.test(path)) score += 2;
  if (/(privacy|terms|cookie|login|signup|tag|author|category|page\/\d+)/i.test(path)) score -= 5;
  return score;
}

async function crawlDomain(domain, query, options, dependencies) {
  const base = `https://${domain}`;
  const terms = queryTerms(query);
  const results = [];
  const sitemapUrls = new Set([`${base}/sitemap.xml`, `${base}/sitemap_index.xml`]);

  try {
    const robots = await fetchText(`${base}/robots.txt`, dependencies);
    for (const match of robots.matchAll(/^sitemap:\s*(\S+)/gim)) {
      const url = normalizeUrl(match[1]);
      if (url) sitemapUrls.add(url);
    }
  } catch {}

  try {
    const homepage = await fetchText(base, dependencies);
    const parsed = extractHtmlDocument(homepage, base);
    if (parsed.title) results.push({ ...parsed, score:0.9, source:'direct-site' });
    for (const feedUrl of parsed.feedLinks.slice(0, 2)) {
      try { results.push(...parseRss(await fetchText(feedUrl, { ...dependencies, accept:'application/rss+xml,application/xml,text/xml,*/*' }), 'official-feed')); }
      catch {}
    }
  } catch {}

  const discovered = [];
  for (const sitemapUrl of [...sitemapUrls].slice(0, 4)) {
    try {
      const entries = parseSitemap(await fetchText(sitemapUrl, { ...dependencies, accept:'application/xml,text/xml,*/*' }));
      for (const entry of entries) {
        if (entry.sitemap && sitemapUrls.size < 8) sitemapUrls.add(entry.url);
        else if (rootHost(entry.url) === rootHost(base)) discovered.push(entry);
      }
    } catch {}
  }

  const pageUrls = [...new Map(discovered.map(entry => [entry.url, entry])).values()]
    .sort((a, b) => pathScore(b.url, terms) - pathScore(a.url, terms))
    .slice(0, Math.min(Math.max(options.maxResults, 4), 8));

  const settled = await Promise.allSettled(pageUrls.map(async entry => {
    const parsed = extractHtmlDocument(await fetchText(entry.url, dependencies), entry.url);
    return { ...parsed, published_date:parsed.published_date || entry.lastmod || '', score:0.84, source:'direct-sitemap' };
  }));
  results.push(...settled.flatMap(item => item.status === 'fulfilled' ? [item.value] : []));
  return results;
}

function cacheGet(key) {
  const hit = CACHE.get(key);
  if (!hit || Date.now() - hit.createdAt > CACHE_TTL_MS) { CACHE.delete(key); return null; }
  return hit.value;
}

function cacheSet(key, value) {
  CACHE.set(key, { createdAt:Date.now(), value });
  while (CACHE.size > MAX_CACHE_ENTRIES) CACHE.delete(CACHE.keys().next().value);
}

export function publicWebConfigured() { return true; }

export async function publicWebSearch(query, { maxResults = 8, timeRange = 'year', includeDomains = [], excludeDomains = [], topic = 'general' } = {}, dependencies = {}) {
  const safeQuery = clean(query, 500);
  if (!safeQuery) return { results:[], usage:{ credits:0, billable:false }, duration_ms:0, request_id:'' };
  const options = { maxResults:Math.max(1, Math.min(20, Number(maxResults) || 8)), timeRange, includeDomains, excludeDomains, topic };
  const key = JSON.stringify([safeQuery, options]);
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached:true };

  const started = Date.now();
  const domain = extractSiteDomain(safeQuery);
  const tasks = domain
    ? [crawlDomain(domain, safeQuery, options, dependencies), searchDuckDuckGo(safeQuery, options, dependencies)]
    : [searchDuckDuckGo(safeQuery, options, dependencies), searchNewsRss(safeQuery, options, dependencies), searchHackerNews(safeQuery, options, dependencies)];
  const settled = await Promise.allSettled(tasks);
  const all = settled.flatMap(item => item.status === 'fulfilled' ? item.value : []);
  const results = dedupeAndRank(all, safeQuery, options).slice(0, options.maxResults);
  const value = {
    results,
    usage:{ credits:0, billable:false, requests:settled.length },
    duration_ms:Date.now() - started,
    request_id:'',
    meta:{ provider:'public-web', cost_usd:0, api_key_required:false, sources:[...new Set(results.map(row => row.source).filter(Boolean))] }
  };
  cacheSet(key, value);
  return value;
}

export async function publicWebSearchMany(queries, options = {}, dependencies = {}) {
  const started = Date.now();
  const settled = await Promise.allSettled((Array.isArray(queries) ? queries : []).slice(0, 6).map(query => publicWebSearch(query, options, dependencies)));
  const all = [];
  let failed = 0;
  for (const item of settled) {
    if (item.status === 'fulfilled') all.push(...item.value.results);
    else failed += 1;
  }
  if (!all.length && failed) throw settled.find(item => item.status === 'rejected')?.reason || new Error('Public web searches failed');
  const results = dedupeAndRank(all, (Array.isArray(queries) ? queries : []).join(' '), options);
  return {
    results,
    meta:{ provider:'public-web', queries:settled.length, credits:0, cost_usd:0, api_key_required:false, failed_queries:failed, duration_ms:Date.now() - started }
  };
}

export function formatEvidence(sources, limit = 14, maxChars = 7000) {
  return (Array.isArray(sources) ? sources : []).slice(0, limit).map((source, index) =>
    `SOURCE ${index + 1}\nTITLE: ${clean(source?.title, 260)}\nURL: ${clean(source?.url, 500)}\nSNIPPET: ${clean(source?.content, 900)}${source?.published_date ? `\nDATE: ${clean(source.published_date, 60)}` : ''}`
  ).join('\n\n').slice(0, maxChars);
}
