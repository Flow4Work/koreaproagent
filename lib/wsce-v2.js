import { aiConfigured, chatJson } from '../lib/ai-provider.js';
import { parseRss } from '../lib/public-web-search.js';
import {
  buildGlobalExclusions,
  clean,
  fetchPage,
  inferCountry,
  isKoreanCountry,
  mapLimit,
  normalizeCompanyKey,
  publicWebSearchMany,
  resolveOfficialWebsite,
  rootHost,
  stripHtml,
  suppressExactSent,
  verifyForeignEntity
} from '../lib/international-event-campaign.js';

const EVENT = {
  name:'World Smart City Expo 2026',
  short:'WSCE 2026',
  dates:'2026-09-09–2026-09-11',
  venue:'BEXCO, Busan'
};
const OFFICIAL_DOMAIN = 'worldsmartcityexpo.com';
const OFFICIAL_LIST = 'https://worldsmartcityexpo.com/board/bbs/board.php?bo_table=company_en';
const LIST_PAGES = Array.from({ length:18 }, (_, index) => `${OFFICIAL_LIST}&page=${index + 1}`);
const OFFICIAL_RSS_URLS = [
  'https://worldsmartcityexpo.com/board/bbs/rss.php?bo_table=company_en',
  'https://www.worldsmartcityexpo.com/board/bbs/rss.php?bo_table=company_en'
];
const WSCE_CONTEXT = /(?:\bWSCE\b|World\s+Smart\s+City\s+Expo|월드\s*스마트시티\s*엑스포)/i;
const WSCE_BUSAN_IDENTITY = /(?:World\s+Smart\s+City\s+Expo|월드\s*스마트시티\s*엑스포|\bWSCE\b[^\n]{0,160}(?:Busan|BEXCO)|(?:Busan|BEXCO)[^\n]{0,160}\bWSCE\b)/i;
const WSCE_2026 = /(?:\bWSCE\s*2026\b|World\s+Smart\s+City\s+Expo[^\n]{0,120}\b2026\b|2026[^\n]{0,120}World\s+Smart\s+City\s+Expo)/i;
const PARTICIPATION = /(exhibitor|exhibiting|participat(?:e|es|ed|ing|ion)|booth|stand\s*(?:no\.?|#)?|pavilion|delegation|attend(?:s|ed|ing)|join(?:s|ed|ing)|speaker|speaking|partner|sponsor|meet\s+us\s+at|see\s+you\s+at|showcas(?:e|ing)|출전|참가|전시|부스|연사|파트너|스폰서|出展|参加|參展|参展)/i;
const BAD_NAME = /(?:World Smart City Expo|\bWSCE\b|List of Participating Companies|Participating Companies|Smart City Expo|BEXCO|Booth Number|Company Introduction|Main Products|Hosted by|Organized by|Exhibit Application|Exhibitor Benefits|Sponsorship|board|view|home|Image|List$|수정$)/i;
const SOCIAL_OR_DIRECTORY = /(?:linkedin\.com|facebook\.com|instagram\.com|youtube\.com|x\.com|twitter\.com|wikipedia\.org|eventbrite\.|10times\.|medium\.com)/i;

function safeToolKey(value = '', envName = '') {
  return clean(value || (envName ? process.env[envName] : ''), 5000);
}

function toolConfig(body = {}) {
  return {
    tavilyKey:safeToolKey('', 'TAVILY_API_KEY'),
    jinaKey:safeToolKey(body?.tools?.jinaKey, 'JINA_API_KEY'),
    braveKey:safeToolKey(body?.tools?.braveKey, 'BRAVE_SEARCH_API_KEY') || safeToolKey('', 'BRAVE_API_KEY'),
    exaKey:safeToolKey(body?.tools?.exaKey, 'EXA_API_KEY')
  };
}

async function fetchJson(url, options = {}, timeoutMs = 8500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal:controller.signal, cache:'no-store' });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`Search provider HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return text ? JSON.parse(text) : {};
  } finally { clearTimeout(timer); }
}

function normalizeSearchRow(row = {}, source = '') {
  const url = clean(row?.url || row?.link, 700);
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    title:clean(row?.title || row?.name, 280),
    url,
    content:clean(row?.content || row?.description || row?.snippet || row?.text, 7000),
    score:Number(row?.score) || 0,
    published_date:clean(row?.published_date || row?.publishedDate || row?.date, 80),
    source:source || clean(row?.source, 50)
  };
}

function dedupeSearchRows(rows = []) {
  const map = new Map();
  for (const raw of rows) {
    const row = raw?.url ? raw : null;
    if (!row) continue;
    const key = String(row.url).replace(/^https?:\/\/(?:www\.)?/i, '').replace(/#.*$/, '').replace(/\/$/, '').toLowerCase();
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || Number(row.score || 0) > Number(prev.score || 0) || row.content.length > prev.content.length) map.set(key, row);
  }
  return [...map.values()];
}

async function tavilySearch(query, key, { includeDomains = [] } = {}) {
  if (!key) return [];
  const data = await fetchJson('https://api.tavily.com/search', {
    method:'POST',
    headers:{ Authorization:`Bearer ${key}`, 'Content-Type':'application/json', Accept:'application/json' },
    body:JSON.stringify({
      query:clean(query, 450), topic:'general', search_depth:'basic', max_results:20,
      include_answer:false, include_raw_content:false,
      ...(includeDomains.length ? { include_domains:includeDomains } : {})
    })
  }, 9500);
  return (Array.isArray(data?.results) ? data.results : []).map(row => normalizeSearchRow(row, 'tavily')).filter(Boolean);
}

async function jinaSearch(query, key) {
  if (!key) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(`https://s.jina.ai/${encodeURIComponent(clean(query, 450))}`, {
      headers:{ Authorization:`Bearer ${key}`, Accept:'application/json' },
      signal:controller.signal,
      cache:'no-store'
    });
    if (!response.ok) return [];
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { return []; }
    const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
    return rows.map(row => normalizeSearchRow(row, 'jina-search')).filter(Boolean);
  } catch { return []; }
  finally { clearTimeout(timer); }
}

async function braveSearch(query, key) {
  if (!key) return [];
  const params = new URLSearchParams({ q:clean(query, 390), count:'20', safesearch:'moderate', freshness:'py' });
  const data = await fetchJson(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers:{ Accept:'application/json', 'X-Subscription-Token':key }
  }, 8500);
  return (Array.isArray(data?.web?.results) ? data.web.results : []).map((row, index) => normalizeSearchRow({
    ...row,
    content:row.description || '',
    score:Math.max(0, 1 - index / 24)
  }, 'brave')).filter(Boolean);
}

async function exaSearch(query, key) {
  if (!key) return [];
  const startPublishedDate = new Date(Date.now() - 420 * 86400000).toISOString();
  const data = await fetchJson('https://api.exa.ai/search', {
    method:'POST',
    headers:{ 'x-api-key':key, 'Content-Type':'application/json', Accept:'application/json' },
    body:JSON.stringify({
      query:clean(query, 600), type:'fast', numResults:16, startPublishedDate,
      excludeDomains:['facebook.com','instagram.com','youtube.com'],
      contents:{ highlights:true }
    })
  }, 9500);
  return (Array.isArray(data?.results) ? data.results : []).map((row, index) => normalizeSearchRow({
    ...row,
    content:Array.isArray(row?.highlights) && row.highlights.length ? row.highlights.join(' ') : (row?.text || ''),
    score:Math.max(0, 1 - index / 20)
  }, 'exa')).filter(Boolean);
}

async function bingWebRssSearch(query) {
  try {
    const page = await fetchPage(`https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss`, { timeoutMs:6500, maxBytes:500000 });
    if (!page?.html) return [];
    return parseRss(page.html, 'bing-web-rss').map(row => normalizeSearchRow(row, 'bing-web-rss')).filter(Boolean);
  } catch { return []; }
}

async function multiSourceSearchMany(queries = [], tools = {}, { includeDomains = [], maxRows = 120 } = {}) {
  const safeQueries = [...new Set((Array.isArray(queries) ? queries : []).map(query => clean(query, 450)).filter(Boolean))].slice(0, 6);
  if (!safeQueries.length) return { rows:[], counts:{} };
  const tasks = [];
  tasks.push(['public-web', publicWebSearchMany(safeQueries, { maxResults:20, timeRange:'year', topic:'general', includeDomains }).then(result => Array.isArray(result?.results) ? result.results.map(row => normalizeSearchRow(row, row?.source || 'public-web')).filter(Boolean) : []).catch(() => [])]);
  tasks.push(['bing-web-rss', Promise.all(safeQueries.slice(0, 4).map(query => bingWebRssSearch(query))).then(rows => rows.flat()).catch(() => [])]);
  if (tools.tavilyKey) tasks.push(['tavily', Promise.all(safeQueries.slice(0, 4).map(query => tavilySearch(query, tools.tavilyKey, { includeDomains }))).then(rows => rows.flat()).catch(() => [])]);
  if (tools.jinaKey) tasks.push(['jina-search', Promise.all(safeQueries.slice(0, 3).map(query => jinaSearch(query, tools.jinaKey))).then(rows => rows.flat()).catch(() => [])]);
  if (tools.braveKey) tasks.push(['brave', Promise.all(safeQueries.slice(0, 3).map(query => braveSearch(query, tools.braveKey))).then(rows => rows.flat()).catch(() => [])]);
  if (tools.exaKey) tasks.push(['exa', Promise.all(safeQueries.slice(0, 3).map(query => exaSearch(query, tools.exaKey))).then(rows => rows.flat()).catch(() => [])]);
  const settled = await Promise.all(tasks.map(async ([name, promise]) => ({ name, rows:await promise })));
  const counts = {}, all = [];
  for (const item of settled) {
    counts[item.name] = item.rows.length;
    all.push(...item.rows);
  }
  const rows = dedupeSearchRows(all)
    .filter(row => !SOCIAL_OR_DIRECTORY.test(rootHost(row.url)) || WSCE_CONTEXT.test(`${row.title} ${row.content}`))
    .sort((a,b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, maxRows);
  return { rows, counts };
}

function htmlAttributeValues(html = '', attribute = 'alt') {
  const out = [];
  const regex = new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']+)["']`, 'gi');
  let match;
  while ((match = regex.exec(String(html)))) {
    const value = clean(stripHtml(match[1] || '', 220), 180);
    if (value) out.push(value);
  }
  return out;
}

function textNameCandidates(text = '') {
  const value = clean(text, 18000);
  const out = [];
  const patterns = [
    /Booth Number\s+(?:[^\s]{1,20}\s+)?Image\s+(.{2,180}?)\s+(?:https?:\/\/|www\.|Company Introduction)/i,
    /List of Participating Companies\s+Booth Number\s+(?:[^\s]{1,20}\s+)?Image\s+(.{2,180}?)\s+Company Introduction/i,
    /Image\s+(.{2,160}?)\s+(?:https?:\/\/|www\.)[a-z0-9.-]+/i
  ];
  for (const pattern of patterns) {
    const candidate = clean(value.match(pattern)?.[1], 180);
    if (candidate && !BAD_NAME.test(candidate)) out.push(candidate);
  }
  return out;
}

function titleCandidates(page = {}, nameHint = '') {
  const html = String(page?.html || '');
  const values = [clean(nameHint, 180), ...textNameCandidates(page?.text || '')];
  const patterns = [
    /<meta\b[^>]*(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:title["'][^>]*>/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern)?.[1];
    if (match) values.push(clean(stripHtml(match, 220), 180));
  }
  for (const match of html.matchAll(/<h[1-5][^>]*>([\s\S]*?)<\/h[1-5]>/gi)) values.push(clean(stripHtml(match[1], 220), 180));
  values.push(...htmlAttributeValues(html, 'alt'), ...htmlAttributeValues(html, 'title'));
  return [...new Set(values.map(value => clean(value, 180)
    .replace(/\s*[|–—-]\s*(?:WSCE|World Smart City Expo).*$/i, '')
    .replace(/^(?:WSCE|World Smart City Expo)[^|–—-]*[|–—-]\s*/i, '')
    .replace(/^Image\s+/i, '')
    .trim()).filter(value => value.length >= 2 && value.length <= 150 && !BAD_NAME.test(value)))];
}

function detailLink(url = '', nameHint = '', source = '') {
  const decoded = String(url || '').replace(/&amp;/gi, '&');
  let parsed;
  try { parsed = new URL(decoded, 'https://worldsmartcityexpo.com'); } catch { return null; }
  if (rootHost(parsed.href) !== OFFICIAL_DOMAIN) return null;
  if (parsed.searchParams.get('bo_table') !== 'company_en' || !parsed.searchParams.get('wr_id')) return null;
  const id = clean(parsed.searchParams.get('wr_id'), 30);
  if (!/^\d+$/.test(id)) return null;
  return { id, url:`https://worldsmartcityexpo.com/board/bbs/board.php?bo_table=company_en&wr_id=${id}`, nameHint:clean(nameHint, 180), source:clean(source, 50) };
}

function detailLinksFromHtml(html = '', source = '') {
  const out = [];
  const raw = String(html || '').replace(/&amp;/gi, '&');
  const absolute = /https?:\/\/(?:www\.)?worldsmartcityexpo\.com\/board\/bbs\/board\.php\?[^"'<\s]*bo_table=company_en[^"'<\s]*wr_id=\d+[^"'<\s]*/gi;
  for (const match of raw.matchAll(absolute)) {
    const item = detailLink(match[0], '', source);
    if (item) out.push(item);
  }
  const relative = /\/board\/bbs\/board\.php\?[^"'<\s]*bo_table=company_en[^"'<\s]*wr_id=\d+[^"'<\s]*/gi;
  for (const match of raw.matchAll(relative)) {
    const item = detailLink(match[0], '', source);
    if (item) out.push(item);
  }
  return out;
}

function listDetailLinks(page = {}, source = 'official-list') {
  const out = [];
  for (const link of page?.links || []) {
    const item = detailLink(link?.url, link?.text, source);
    if (item) out.push(item);
  }
  out.push(...detailLinksFromHtml(page?.html || '', source));
  return out;
}

async function officialRssDetailLinks() {
  const settled = await Promise.allSettled(OFFICIAL_RSS_URLS.map(async url => {
    const page = await fetchPage(url, { timeoutMs:6000, maxBytes:700000 });
    if (!page?.html) return [];
    const fromHtml = detailLinksFromHtml(page.html, 'official-rss');
    const fromFeed = parseRss(page.html, 'official-rss').map(row => detailLink(row.url, row.title, 'official-rss')).filter(Boolean);
    return [...fromHtml, ...fromFeed];
  }));
  return settled.flatMap(item => item.status === 'fulfilled' ? item.value : []);
}

function detailLinksFromSearchRows(rows = []) {
  const out = [];
  for (const row of rows) {
    const direct = detailLink(row?.url, row?.title, row?.source || 'search');
    if (direct) out.push(direct);
    out.push(...detailLinksFromHtml(`${row?.url || ''} ${row?.content || ''}`, row?.source || 'search'));
  }
  return out;
}

function mergeDetailLinks(groups = []) {
  const map = new Map();
  for (const group of groups) for (const item of group || []) {
    if (!item?.id) continue;
    const prev = map.get(item.id);
    if (!prev || (!prev.nameHint && item.nameHint) || (prev.source === 'official-list' && item.source !== 'official-list')) map.set(item.id, { ...prev, ...item });
  }
  return [...map.values()];
}

async function officialParticipantRows(tools = {}) {
  const officialQueries = [
    'site:worldsmartcityexpo.com/board/bbs/board.php?bo_table=company_en "WSCE 2026" participating company',
    'site:worldsmartcityexpo.com/board/bbs/board.php?bo_table=company_en "World Smart City Expo" company introduction',
    'site:worldsmartcityexpo.com/board/bbs/board.php?bo_table=company_en exhibitor Busan 2026',
    'site:worldsmartcityexpo.com/board/bbs/board.php?bo_table=company_en Japan Singapore Taiwan international',
    'site:worldsmartcityexpo.com/board/bbs/board.php?bo_table=company_en pavilion delegation'
  ];
  const [pagesRaw, rssLinks, discovery] = await Promise.all([
    mapLimit(LIST_PAGES, 6, url => fetchPage(url, { timeoutMs:6500, maxBytes:700000 })),
    officialRssDetailLinks(),
    multiSourceSearchMany(officialQueries, tools, { includeDomains:[OFFICIAL_DOMAIN], maxRows:140 })
  ]);
  const pages = pagesRaw.filter(Boolean);
  const searchLinks = detailLinksFromSearchRows(discovery.rows);
  const listLinks = pages.flatMap(page => listDetailLinks(page, 'official-list'));
  const details = mergeDetailLinks([searchLinks, rssLinks, listLinks]);
  const rows = (await mapLimit(details.slice(0, 150), 10, async item => {
    const page = await fetchPage(item.url, { timeoutMs:6200, maxBytes:700000 });
    if (!page) return null;
    return {
      id:`official-${item.id}`,
      official:true,
      detail_id:item.id,
      url:item.url,
      text:clean(page.text, 18000),
      links:page.links || [],
      name_candidates:titleCandidates(page, item.nameHint),
      country_hint:'',
      discovered_by:item.source || 'official-list'
    };
  })).filter(row => row && (row.name_candidates.length || /Company Introduction/i.test(row.text)));
  return {
    list_pages:pages.length,
    detail_links:details.length,
    list_detail_links:listLinks.length,
    rss_detail_links:rssLinks.length,
    search_detail_links:searchLinks.length,
    discovery_counts:discovery.counts,
    rows
  };
}

async function aiExtractOfficial(rows = []) {
  if (!rows.length || !aiConfigured()) return [];
  const chunks = [];
  for (let index = 0; index < rows.length; index += 16) chunks.push(rows.slice(index, index + 16));
  const results = await Promise.all(chunks.map(async chunk => {
    const prompt = `Extract the actual participant company/organization represented by each CURRENT WSCE 2026 official participant-detail page.
Every row is already from the official 2026 "List of Participating Companies", so participation is established by the source itself.
At this stage, DO NOT reject a row because of nationality. Nationality is verified later from the participant's own official website.
IMPORTANT: Ignore WSCE/BEXCO venue/footer text such as "Busan, Korea", organizer addresses, event contact details, navigation labels, and hosted/organized-by logos when deciding the participant name or country.
Use the visible participant name, its external official website, and Company Introduction. Reject only blank/unfinished rows or rows where no participant name is identifiable.
Never invent a company, website, country, booth, or participation fact. Country may be empty unless it is explicitly tied to the participant itself.
Return JSON only: {"items":[{"row_id":"official-123","company":"exact participant name","country":"country or empty","confidence":90}]}
Confidence must be >=82 only when the participant name is directly supported.
ROWS:\n${JSON.stringify(chunk.map(row => ({ row_id:row.id, name_candidates:row.name_candidates, text:clean(row.text, 7200), url:row.url })))}`;
    try {
      const result = await chatJson({ prompt, maxTokens:2800, timeoutMs:30000, temperature:0, hardDeadlineMs:42000 });
      return (Array.isArray(result?.data?.items) ? result.data.items : []).map(item => ({
        row_id:clean(item?.row_id, 40), company:clean(item?.company, 180), country:clean(item?.country, 80), confidence:Number(item?.confidence) || 0
      })).filter(item => item.row_id && item.company && item.confidence >= 82 && !BAD_NAME.test(item.company));
    } catch { return []; }
  }));
  return results.flat();
}

function deterministicOfficialNames(rows = []) {
  const out = [];
  for (const row of rows) {
    const candidate = (row.name_candidates || []).find(name => name.length >= 2 && !BAD_NAME.test(name));
    if (candidate) out.push({ row_id:row.id, company:candidate, country:'', confidence:90 });
  }
  return out;
}

async function resolveForeignCandidate({ item, row, excludes }) {
  const countryHint = isKoreanCountry(item.country) ? '' : clean(item.country, 80);
  const website = await resolveOfficialWebsite(item.company, countryHint, row?.links || [], excludes, [OFFICIAL_DOMAIN]);
  if (!website) return null;
  const domain = normalizeCompanyKey(website.domain);
  if (!domain || excludes.has(domain)) return null;
  const ownCountry = countryHint || inferCountry(website?.page?.text || '', domain);
  const foreign = await verifyForeignEntity({ company:item.company, website, sourceText:'', countryHint:ownCountry });
  if (!foreign) return null;
  return {
    company:item.company,
    country:foreign.country,
    domain:foreign.domain,
    url:foreign.url,
    participation:'official exhibitor list',
    confidence:Math.max(92, item.confidence),
    source:{ title:'WSCE 2026 List of Participating Companies', url:row.url, text:row.text }
  };
}

async function resolveOfficialCandidates(rows = [], extracted = [], excludes = new Set()) {
  const rowById = new Map(rows.map(row => [row.id, row]));
  const merged = new Map();
  for (const item of [...extracted.sort((a,b) => b.confidence - a.confidence), ...deterministicOfficialNames(rows)]) {
    if (!item.company || merged.has(item.row_id)) continue;
    merged.set(item.row_id, item);
  }
  return (await mapLimit([...merged.values()].slice(0, 90), 7, async item => {
    const row = rowById.get(item.row_id);
    if (!row) return null;
    return resolveForeignCandidate({ item, row, excludes });
  })).filter(Boolean);
}

async function fallbackRows(tools = {}) {
  const queries = [
    '"WSCE 2026" exhibitor company Busan',
    '"World Smart City Expo 2026" participating company Busan',
    '"WSCE 2026" booth pavilion delegation Busan',
    '"WSCE 2026" speaker sponsor partner company',
    '"WSCE 2026" Japan Singapore Taiwan UAE Europe company',
    '"World Smart City Expo 2026" international delegation company'
  ];
  const result = await multiSourceSearchMany(queries, tools, { maxRows:140 });
  const rows = result.rows.map((row, index) => ({
    id:`web-${index}`,
    title:clean(row?.title, 280),
    url:clean(row?.url, 700),
    text:clean(row?.content, 7000),
    published_date:clean(row?.published_date, 80),
    source:clean(row?.source, 50)
  })).filter(row => WSCE_CONTEXT.test(`${row.title} ${row.text}`)
    && WSCE_BUSAN_IDENTITY.test(`${row.title} ${row.text} ${row.url}`)
    && (WSCE_2026.test(`${row.title} ${row.text}`) || /^2026/.test(row.published_date) || /2026/.test(`${row.title} ${row.url}`))
    && PARTICIPATION.test(`${row.title} ${row.text}`));
  return { rows, counts:result.counts };
}

async function aiExtractFallback(rows = []) {
  if (!rows.length || !aiConfigured()) return [];
  const chunks = [];
  for (let index = 0; index < rows.length; index += 28) chunks.push(rows.slice(index, index + 28));
  const results = await Promise.all(chunks.map(async chunk => {
    const prompt = `Find NAMED non-Korean companies or organizations with direct, current World Smart City Expo 2026 in Busan participation evidence in the supplied web rows.
Accept official exhibitor/booth/stand, explicit attending/exhibiting/participating, speaker, sponsor/partner, pavilion, or overseas delegation evidence. Reject generic event promotion, historical attendance, Korean companies/subsidiaries, unrelated conferences also abbreviated WSCE, and organizations merely active in smart-city topics without direct World Smart City Expo 2026 Busan evidence.
Never invent company, country, website, or participation. Return only items directly supported by a row.
JSON only: {"items":[{"row_id":"web-0","company":"exact name","country":"country or empty","participation":"exhibitor|booth|attendance|speaker|sponsor|partner|pavilion|delegation","confidence":90}]}
Use confidence >=86.
ROWS:\n${JSON.stringify(chunk.map(row => ({ row_id:row.id, title:row.title, url:row.url, text:clean(row.text, 4200), published_date:row.published_date, source:row.source })))}`;
    try {
      const result = await chatJson({ prompt, maxTokens:3000, timeoutMs:30000, temperature:0, hardDeadlineMs:42000 });
      return (Array.isArray(result?.data?.items) ? result.data.items : []).map(item => ({
        row_id:clean(item?.row_id, 40), company:clean(item?.company, 180), country:clean(item?.country, 80), participation:clean(item?.participation, 80), confidence:Number(item?.confidence) || 0
      })).filter(item => item.row_id && item.company && item.confidence >= 86 && !BAD_NAME.test(item.company));
    } catch { return []; }
  }));
  return results.flat();
}

async function resolveFallbackCandidates(rows = [], items = [], excludes = new Set()) {
  const byId = new Map(rows.map(row => [row.id, row]));
  return (await mapLimit(items.slice(0, 55), 6, async item => {
    const row = byId.get(item.row_id);
    if (!row) return null;
    const sourcePage = await fetchPage(row.url, { timeoutMs:6000, maxBytes:350000 });
    const sourceText = clean(`${row.title} ${row.text} ${sourcePage?.text || ''}`, 18000);
    if (!WSCE_CONTEXT.test(sourceText) || !WSCE_BUSAN_IDENTITY.test(sourceText) || !PARTICIPATION.test(sourceText)) return null;
    const countryHint = isKoreanCountry(item.country) ? '' : item.country;
    const website = await resolveOfficialWebsite(item.company, countryHint, sourcePage?.links || [], excludes, [OFFICIAL_DOMAIN]);
    if (!website) return null;
    const domain = normalizeCompanyKey(website.domain);
    if (!domain || excludes.has(domain)) return null;
    const ownCountry = countryHint || inferCountry(website?.page?.text || '', domain);
    const foreign = await verifyForeignEntity({ company:item.company, website, sourceText:'', countryHint:ownCountry });
    if (!foreign) return null;
    return {
      company:item.company,
      country:foreign.country,
      domain:foreign.domain,
      url:foreign.url,
      participation:item.participation || 'participation',
      confidence:item.confidence,
      source:{ title:row.title, url:row.url, text:sourceText }
    };
  })).filter(Boolean);
}

function leadFrom(candidate) {
  const company = clean(candidate.company, 180);
  const domain = rootHost(candidate.domain);
  const country = clean(candidate.country, 80);
  return {
    id:`wsce:${domain}`,
    campaign:'wsce',
    campaign_label:'WSCE 단체복',
    company,
    domain,
    url:candidate.url || `https://${domain}/`,
    source_url:clean(candidate.source?.url, 700),
    source_title:clean(candidate.source?.title, 280),
    signal:clean(`${EVENT.short} ${candidate.participation || 'participation'} · ${country}`, 260),
    score:Math.max(86, Math.min(99, Number(candidate.confidence) || 90)),
    sales_priority:Math.max(86, Math.min(99, Number(candidate.confidence) || 90)),
    verified_company:true,
    wsce_confirmed:true,
    team_origin:'foreign',
    team_origin_country:country,
    outreach_language:'en',
    recommended_role:'Events Lead',
    role_targets:['Events Lead','Event Marketing','Marketing Director','Partnerships Lead','Business Development Director','Operations Lead','Country Manager','Founder','CEO'],
    subject:'Quick question about WSCE 2026 in Busan',
    message_en:`Hi,\n\nI saw that ${company} is participating in WSCE 2026 in Busan. Quick question — have you already sorted team shirts or staff wear for your Korea trip?\n\nWe produce branded apparel locally in Korea and can deliver directly to your hotel, office or BEXCO, so your team does not need to ship boxes internationally or coordinate production after arrival.\n\nIf it is still open, I can send a few options with pricing and turnaround.`,
    message_ko:'',
    contact:null,
    contacts:[],
    contact_status:'pending'
  };
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); }
  catch { return Response.json({ error:'요청 형식이 잘못됐습니다.' }, { status:400 }); }
  const history = await buildGlobalExclusions(Array.isArray(body.excludeDomains) ? body.excludeDomains : []);
  const tools = toolConfig(body);
  try {
    const official = await officialParticipantRows(tools);
    const officialExtracted = await aiExtractOfficial(official.rows);
    const officialCandidates = await resolveOfficialCandidates(official.rows, officialExtracted, history.set);
    let fallback = [];
    let fallbackSearched = 0;
    let fallbackCounts = {};
    if (officialCandidates.length < 12) {
      const fallbackSearch = await fallbackRows(tools);
      fallbackSearched = fallbackSearch.rows.length;
      fallbackCounts = fallbackSearch.counts;
      const extracted = await aiExtractFallback(fallbackSearch.rows);
      fallback = await resolveFallbackCandidates(fallbackSearch.rows, extracted, history.set);
    }
    const seen = new Set(), provisional = [];
    for (const candidate of [...officialCandidates, ...fallback].sort((a,b) => Number(b.confidence || 0) - Number(a.confidence || 0))) {
      const domain = normalizeCompanyKey(candidate.domain);
      if (!domain || seen.has(domain) || history.set.has(domain) || isKoreanCountry(candidate.country)) continue;
      seen.add(domain);
      provisional.push(leadFrom(candidate));
      if (provisional.length >= 48) break;
    }
    const exact = await suppressExactSent(provisional, history.secret);
    return Response.json({
      campaign:'wsce',
      campaign_label:'WSCE 단체복',
      leads:exact.leads,
      meta:{
        event:EVENT,
        official_source:OFFICIAL_LIST,
        official_list_pages_loaded:official.list_pages,
        official_detail_links:official.detail_links,
        official_list_detail_links:official.list_detail_links,
        official_rss_detail_links:official.rss_detail_links,
        official_search_detail_links:official.search_detail_links,
        official_detail_rows:official.rows.length,
        official_foreign_candidates:officialCandidates.length,
        official_search_sources:official.discovery_counts,
        public_web_fallback_used:officialCandidates.length < 12,
        fallback_rows:fallbackSearched,
        fallback_foreign_candidates:fallback.length,
        fallback_search_sources:fallbackCounts,
        returned:exact.leads.length,
        sent_preexcluded:history.sent.length,
        deleted_preexcluded:history.deleted.length,
        sent_exact_suppressed:exact.suppressed,
        search_stack:{
          official_html:true,
          official_rss_probe:true,
          public_web_no_key:true,
          bing_web_rss:true,
          tavily:Boolean(tools.tavilyKey),
          jina_search:Boolean(tools.jinaKey),
          brave:Boolean(tools.braveKey),
          exa:Boolean(tools.exaKey)
        },
        participant_gate:'official WSCE 2026 participant pages first; fallback requires direct current WSCE 2026 Busan participation evidence',
        team_origin_gate:'foreign participant verified from participant-owned website only; WSCE/BEXCO Busan, Korea footer is excluded from origin checks',
        email_gate:'contact-discovery-v2; public website + Jina + Hunter + Prospeo + Apollo + Tomba; frontend exposes qualified + valid + same-domain only'
      }
    }, { headers:{ 'Cache-Control':'no-store' } });
  } catch (error) {
    return Response.json({ error:clean(error?.message || error, 500) || 'WSCE 후보 검색에 실패했습니다.' }, { status:Number(error?.status) || 502 });
  }
}
