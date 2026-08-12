import { publicWebSearch, publicWebSearchMany } from './public-web-search.js';
import { aiConfigured, chatJson } from './ai-provider.js';
import { findContacts } from './contact-discovery-v2.js';
import { listSentCompanyDomains, matchSentCompanies, normalizeCompanyKey } from './sent-companies.js';
import { listDeletedCompanyDomains } from './deleted-companies.js';

const EVENT = {
  name: 'BCWW 2026',
  dates: '2026-09-14–2026-09-16',
  venue: 'COEX Hall B, Seoul'
};

const PUBLIC_QUERY_BATCHES = [
  [
    '"BCWW 2026" exhibitor company',
    '"BCWW 2026" participating company',
    '"BCWW 2026" "we will be" Seoul',
    '"BCWW 2026" showcase company',
    '"BCWW 2026" delegation pavilion company',
    '"BCWW 2026" seller buyer company'
  ],
  [
    '"BCWW 2026" 出展 企業',
    '"BCWW 2026" 参加 会社',
    '"BCWW 2026" 出展します',
    '"BCWW 2026" 参展 公司',
    '"BCWW 2026" 參展 公司',
    '"BCWW 2026" 참가 기업'
  ],
  [
    'site:bcww.kr "BCWW 2026" 참가사',
    'site:bcww.kr "BCWW 2026" exhibitor',
    'site:kocca.kr "BCWW 2026" 참가기업',
    'site:prtimes.jp "BCWW 2026" 出展',
    '"BCWW 2026" "meet us"',
    '"BCWW 2026" booth stand'
  ]
];

const TAVILY_QUERIES = [
  '"BCWW 2026" exhibitor OR exhibiting OR booth',
  '"BCWW 2026" participating OR attending OR "meet us"',
  '"BCWW 2026" showcase OR pitch OR screening company',
  '"BCWW 2026" delegation OR pavilion company',
  '"BCWW 2026" 出展 OR 参加',
  '"BCWW 2026" 参展 OR 參展',
  'site:bcww.kr "BCWW 2026" exhibitor OR 참가사',
  'site:kocca.kr "BCWW 2026" 참가기업'
];

const AUTHORITATIVE_EVENT_DOMAINS = new Set(['bcww.kr', 'kocca.kr', 'mcst.go.kr', 'coex.co.kr']);
const BLOCKED_EVENT_DOMAINS = new Set(['10times.com']);
const SOURCE_DOMAINS = new Set([
  ...AUTHORITATIVE_EVENT_DOMAINS,
  'coexcenter.com', 'bizinfo.go.kr', 'linkedin.com', 'x.com', 'twitter.com', 'facebook.com',
  'instagram.com', 'youtube.com', 'crunchbase.com', 'imdb.com', 'variety.com', 'deadline.com',
  'prtimes.jp', 'vipo.or.jp', '10times.com', 'eventbrite.com', 'meetup.com', 'wikipedia.org'
]);

const BAD_DOMAIN_PARTS = /(news|press|blog|medium|directory|exhibition|conference|event|expo|fair)/i;
const BCWW_ANY = /(?:\bBCWW\b|Broadcast\s*World\s*Wide|국제방송영상마켓)/i;
const YEAR_2026 = /(?:\b2026\b|2026年|2026년)/i;
const YEAR_2025 = /(?:\b2025\b|2025年|2025년)/i;
const DIRECT_PARTICIPATION = /(\bexhibitor\b|\bexhibiting\b|\bexhibit(?:s|ed|ing)?\s+(?:at|in)\b|\bbooth\s*(?:no\.?|#)?\s*[a-z0-9-]+|\bstand\s*(?:no\.?|#)?\s*[a-z0-9-]+|\bparticipat(?:e|es|ed|ing|ion)\s+(?:at|in)\b|\battend(?:s|ed|ing)?\s+(?:BCWW|the\s+BCWW)\b|\bjoin(?:s|ed|ing)?\s+(?:BCWW|us\s+at\s+BCWW)\b|\bwe(?:'re| are| will be)\s+(?:at|attending|joining|exhibiting)\b|\bmeet\s+us\s+(?:at|in)\b|\bsee\s+you\s+(?:at|in)\b|\bshowcase(?:s|d|ing)?\s+(?:at|during|for)\s+BCWW\b|\bpitch(?:es|ed|ing)?\s+(?:at|during|for)\s+BCWW\b|\bscreen(?:s|ed|ing)?\s+(?:at|during)\s+BCWW\b|\bselected\s+(?:for|to\s+join|to\s+participate\s+in)\s+(?:the\s+)?BCWW\b|\bdelegation\s+(?:to|at)\s+BCWW\b|\bpavilion\s+(?:at|for)\s+BCWW\b|\bregistered\s+(?:seller|buyer)\b|出展(?:します|予定|企業|社)?|参加(?:します|予定|企業|会社|社)|ブース(?:出展)?|採択|選出|참가(?:합니다|예정|기업|사)|출전|부스\s*참가|피칭|선정|參展|参展|將參加|将参加|展位|入選|入选)/i;
const RECRUITMENT_ONLY = /(registration\s+(?:is\s+)?(?:now\s+)?open|register\s+(?:now|here)|applications?\s+(?:are\s+)?open|apply\s+(?:now|here|by)|application\s+deadline|call\s+for\s+(?:exhibitors?|applications?|entries)|recruit(?:ing|ment)|募集|応募|申込|公募|모집(?:공고)?|신청(?:기간|방법)?|접수(?:기간)?|招募|报名|報名)/i;
const INTEREST_ONLY = /(followers?|users?\s+who\s+have\s+shown\s+interest|shown\s+interest\s+for\s+this\s+event|interested\s+attendees?|people\s+attending|heading\s+to\s+the\s+event|event-interest|관심\s*(?:등록|표시|참가)|관심자)/i;
const CONFIRMED_LANGUAGE = /(confirmed|selected|official\s+delegation|will\s+(?:attend|join|exhibit|showcase|pitch)|participating|exhibiting|attending|joining|出展します|出展予定|参加します|参加予定|採択|選出|참가합니다|참가예정|선정|參展|参展|入選|入选)/i;
const KOREA_ENTITY = /(?:\bKorea\b|코리아|한국(?:지사|법인|오피스|사무소)?)/i;

const COUNTRY_PATTERNS = [
  ['Japan', /\bJapan(?:ese)?\b|日本/i], ['Taiwan', /\bTaiwan(?:ese)?\b|臺灣|台湾/i],
  ['Thailand', /\bThailand|Thai\b/i], ['Singapore', /\bSingapore(?:an)?\b/i],
  ['Philippines', /\bPhilippines|Filipino\b/i], ['Indonesia', /\bIndonesia(?:n)?\b/i],
  ['Malaysia', /\bMalaysia(?:n)?\b/i], ['Vietnam', /\bVietnam(?:ese)?\b/i],
  ['Hong Kong', /\bHong\s*Kong\b|香港/i], ['China', /\bChina|Chinese\b|中國|中国/i],
  ['India', /\bIndia(?:n)?\b/i], ['Australia', /\bAustralia(?:n)?\b/i],
  ['New Zealand', /\bNew\s+Zealand\b/i], ['United States', /\bUnited\s+States\b|\bU\.S\.A?\.?\b|\bUSA\b|\bAmerican\b/i],
  ['Canada', /\bCanada|Canadian\b/i], ['United Kingdom', /\bUnited\s+Kingdom\b|\bUK\b|\bBritish\b/i],
  ['France', /\bFrance|French\b|法国|法國/i], ['Germany', /\bGermany|German\b/i],
  ['Spain', /\bSpain|Spanish\b/i], ['Italy', /\bItaly|Italian\b/i],
  ['Netherlands', /\bNetherlands|Dutch\b/i], ['Sweden', /\bSweden|Swedish\b/i],
  ['Norway', /\bNorway|Norwegian\b/i], ['Denmark', /\bDenmark|Danish\b/i],
  ['Finland', /\bFinland|Finnish\b/i], ['Brazil', /\bBrazil|Brazilian\b/i],
  ['Mexico', /\bMexico|Mexican\b/i], ['United Arab Emirates', /\bUnited\s+Arab\s+Emirates\b|\bUAE\b/i],
  ['Mongolia', /\bMongolia(?:n)?\b|Ulaanbaatar/i], ['Nepal', /\bNepal(?:ese)?\b|Kathmandu/i],
  ['Bangladesh', /\bBangladesh(?:i)?\b|Dhaka/i], ['Iran', /\bIran(?:ian)?\b|Tehran/i],
  ['Sri Lanka', /\bSri\s+Lanka(?:n)?\b|Colombo/i], ['Turkey', /\bT(?:ü|u)rkiye\b|\bTurkey\b/i]
];
const CCTLD_COUNTRY = new Map([
  ['jp','Japan'],['tw','Taiwan'],['th','Thailand'],['sg','Singapore'],['ph','Philippines'],['id','Indonesia'],['my','Malaysia'],
  ['vn','Vietnam'],['hk','Hong Kong'],['cn','China'],['in','India'],['au','Australia'],['nz','New Zealand'],['us','United States'],
  ['ca','Canada'],['uk','United Kingdom'],['fr','France'],['de','Germany'],['es','Spain'],['it','Italy'],['nl','Netherlands'],['se','Sweden'],
  ['no','Norway'],['dk','Denmark'],['fi','Finland'],['br','Brazil'],['mx','Mexico'],['ae','United Arab Emirates'],['mn','Mongolia'],
  ['np','Nepal'],['bd','Bangladesh'],['ir','Iran'],['lk','Sri Lanka'],['tr','Turkey']
]);

const ROLE_TARGETS = [
  'Events Lead','Event Marketing','Head of Events','Marketing Director','Head of Marketing','Partnerships Lead',
  'Business Development Director','Operations Lead','Commercial Director','Founder','CEO'
];
const BLOCKED_MAILBOXES = new Set(['admin','contact','hello','info','office','team','support','help','security','press','media','careers','hr','jobs','legal','privacy']);

const clean = (value = '', max = 500) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

function rootHost(value = '') {
  let raw = clean(value, 500).toLowerCase();
  if (!raw) return '';
  try { raw = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname; }
  catch { raw = raw.split('/')[0].split(':')[0]; }
  raw = raw.replace(/^www\./, '').replace(/\.+$/, '');
  const parts = raw.split('.').filter(Boolean);
  if (parts.length <= 2) return raw;
  const secondLevel = new Set(['ac','co','com','edu','go','gov','ne','net','or','org']);
  const depth = parts.at(-1)?.length === 2 && secondLevel.has(parts.at(-2)) ? 3 : 2;
  return parts.slice(-depth).join('.');
}

function sameDomain(email = '', domain = '') {
  const emailDomain = clean(email, 260).toLowerCase().split('@')[1] || '';
  const host = rootHost(domain);
  return Boolean(emailDomain && host && (emailDomain === host || emailDomain.endsWith(`.${host}`)));
}

function sourceLike(domain = '') {
  const host = rootHost(domain);
  return SOURCE_DOMAINS.has(host) || BAD_DOMAIN_PARTS.test(host);
}

function isBlockedSource(url = '') { return BLOCKED_EVENT_DOMAINS.has(rootHost(url)); }

function currentBcwwContext(text = '', publishedDate = '') {
  const value = clean(text, 16000);
  if (!BCWW_ANY.test(value)) return false;
  if (YEAR_2025.test(value) && !YEAR_2026.test(value)) return false;
  if (YEAR_2026.test(value)) return true;
  return /^2026(?:-|\/|\s)/.test(clean(publishedDate, 80));
}

function evidenceState(text = '', publishedDate = '') {
  const value = clean(text, 16000);
  if (!currentBcwwContext(value, publishedDate)) return { eligible:false, reason:'not_current_bcww' };
  if (INTEREST_ONLY.test(value)) return { eligible:false, reason:'interest_only' };
  if (!DIRECT_PARTICIPATION.test(value)) return { eligible:false, reason:'no_participation_statement' };
  if (RECRUITMENT_ONLY.test(value) && !CONFIRMED_LANGUAGE.test(value)) return { eligible:false, reason:'recruitment_only' };
  return { eligible:true, reason:'confirmed_participation_language' };
}

export function bcwwRowRelevant(row = {}) {
  if (isBlockedSource(row?.url)) return false;
  return currentBcwwContext(`${row?.title || ''} ${row?.content || ''}`, row?.published_date || '');
}

export function bcwwRowEligible(row = {}) {
  if (isBlockedSource(row?.url)) return false;
  return evidenceState(`${row?.title || ''} ${row?.content || ''}`, row?.published_date || '').eligible;
}

function inferCountry(text = '', domain = '') {
  const value = clean(text, 16000);
  for (const [country, pattern] of COUNTRY_PATTERNS) if (pattern.test(value)) return country;
  return CCTLD_COUNTRY.get(rootHost(domain).split('.').pop() || '') || '';
}

function isKoreanCountry(country = '') {
  return /^(?:south\s+)?korea$|republic\s+of\s+korea|대한민국|한국/i.test(clean(country, 100));
}

function obviouslyKorean(company = '', domain = '', text = '') {
  const host = rootHost(domain);
  if (host.endsWith('.kr')) return true;
  if (KOREA_ENTITY.test(company)) return true;
  return /(?:Korea office|Korean office|Korea branch|Korea subsidiary|한국지사|한국법인|서울지사)/i.test(clean(text, 8000));
}

function companyTokens(value = '') {
  return clean(value, 180).toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|company|co|gmbh|sa|srl|plc|group|studios?|media|entertainment)\b/giu, ' ')
    .replace(/株式会社|有限会社|公司|集團|集团/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/u).filter(token => token.length >= 2);
}

function rowMentionsCompany(company = '', row = {}) {
  const tokens = companyTokens(company);
  if (!tokens.length) return false;
  const text = `${row?.title || ''} ${row?.content || ''} ${row?.url || ''}`.toLowerCase();
  const hits = tokens.filter(token => text.includes(token)).length;
  return hits >= Math.min(2, tokens.length);
}

function evidenceWindow(company = '', row = {}) {
  const tokens = companyTokens(company);
  if (!tokens.length) return '';
  const text = clean(`${row?.title || ''} ${row?.content || ''}`, 18000);
  const lower = text.toLowerCase();
  for (const token of tokens) {
    let index = lower.indexOf(token);
    while (index >= 0) {
      const start = Math.max(0, index - 700);
      const end = Math.min(text.length, index + token.length + 700);
      const window = text.slice(start, end);
      if (evidenceState(window, row?.published_date || '').eligible) return clean(window, 1500);
      index = lower.indexOf(token, index + token.length);
    }
  }
  return '';
}

function quoteSupported(item = {}, source = {}) {
  const quote = clean(item?.evidence_quote, 1400);
  if (!quote || quote.length < 24) return false;
  const normalize = value => clean(value, 20000).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const normalizedQuote = normalize(quote);
  const normalizedSource = normalize(`${source?.title || ''} ${source?.content || ''}`);
  if (!normalizedQuote || !normalizedSource.includes(normalizedQuote)) return false;
  const quoteRow = { title:'', content:quote, published_date:source?.published_date || '' };
  return evidenceState(quote, source?.published_date || '').eligible && rowMentionsCompany(item?.company || '', quoteRow);
}

function stripHtml(html = '') {
  return clean(String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'"), 18000);
}

async function fetchText(url = '', timeoutMs = 4500) {
  if (!/^https?:\/\//i.test(url) || isBlockedSource(url)) return '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect:'follow',
      headers:{ 'User-Agent':'Mozilla/5.0 KoreaAgent/2.0', Accept:'text/html,application/xhtml+xml,text/plain,application/xml;q=0.8,*/*;q=0.4' },
      signal:controller.signal,
      cache:'no-store'
    });
    if (!response.ok) return '';
    const type = String(response.headers.get('content-type') || '');
    if (type && !/(html|text|xml|json)/i.test(type)) return '';
    return stripHtml((await response.text()).slice(0, 450000));
  } catch { return ''; }
  finally { clearTimeout(timer); }
}

async function jinaRead(url = '') {
  const key = clean(process.env.JINA_API_KEY, 5000);
  if (!key || !/^https?:\/\//i.test(url) || isBlockedSource(url)) return '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers:{ Authorization:`Bearer ${key}`, Accept:'text/plain' },
      signal:controller.signal,
      cache:'no-store'
    });
    if (!response.ok) return '';
    return clean(await response.text(), 18000);
  } catch { return ''; }
  finally { clearTimeout(timer); }
}

async function hydrateRow(row = {}) {
  const base = clean(row?.content || row?.snippet || row?.description, 5000);
  let page = await fetchText(row.url);
  if (page.length < 300 && process.env.JINA_API_KEY) page = await jinaRead(row.url);
  return { ...row, content:clean(`${base} ${page}`, 18000) };
}

async function mapLimit(items = [], limit = 5, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length:Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { out[index] = await worker(items[index], index); }
      catch { out[index] = null; }
    }
  });
  await Promise.all(runners);
  return out;
}

async function tavilySearch(query = '', { maxResults = 12, includeDomains = [] } = {}) {
  const key = clean(process.env.TAVILY_API_KEY, 5000);
  if (!key) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method:'POST',
      headers:{ Authorization:`Bearer ${key}`, 'Content-Type':'application/json' },
      body:JSON.stringify({
        query:clean(query, 500),
        search_depth:'basic',
        topic:'general',
        time_range:'year',
        max_results:Math.min(20, Math.max(1, Number(maxResults) || 12)),
        include_raw_content:true,
        include_answer:false,
        ...(includeDomains.length ? { include_domains:includeDomains } : {})
      }),
      signal:controller.signal,
      cache:'no-store'
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (Array.isArray(data?.results) ? data.results : []).map(row => ({
      title:clean(row?.title, 300), url:clean(row?.url, 700),
      content:clean(row?.raw_content || row?.content, 9000),
      published_date:clean(row?.published_date, 100), score:Number(row?.score) || 0.7, source:'tavily'
    }));
  } catch { return []; }
  finally { clearTimeout(timer); }
}

function normalizeRows(groups = []) {
  const byUrl = new Map();
  for (const row of groups.flat()) {
    const url = clean(row?.url, 700);
    if (!/^https?:\/\//i.test(url) || isBlockedSource(url)) continue;
    const key = url.replace(/\/$/, '');
    const next = {
      title:clean(row?.title, 300), url,
      content:clean(row?.content || row?.snippet || row?.description, 9000),
      published_date:clean(row?.published_date, 100),
      score:Number(row?.score) || 0,
      source:clean(row?.source || row?._engine, 60) || 'web'
    };
    const prev = byUrl.get(key);
    if (!prev) byUrl.set(key, next);
    else byUrl.set(key, {
      ...prev,
      title:prev.title || next.title,
      content:clean(`${prev.content} ${next.content}`, 14000),
      published_date:prev.published_date || next.published_date,
      score:Math.max(prev.score, next.score),
      source:[...new Set(`${prev.source}+${next.source}`.split('+').filter(Boolean))].join('+')
    });
  }
  return [...byUrl.values()].sort((a, b) => b.score - a.score);
}

async function discoverRows() {
  const publicTasks = PUBLIC_QUERY_BATCHES.map(batch => publicWebSearchMany(batch, { maxResults:16, timeRange:'year', topic:'general' }).catch(() => ({ results:[] })));
  const tavilyTask = process.env.TAVILY_API_KEY
    ? mapLimit(TAVILY_QUERIES, 4, query => tavilySearch(query, { maxResults:12 }))
    : Promise.resolve([]);
  const [publicResults, tavilyResults] = await Promise.all([Promise.all(publicTasks), tavilyTask]);
  const rows = normalizeRows([
    ...publicResults.map(result => result?.results || []),
    ...(Array.isArray(tavilyResults) ? tavilyResults : [])
  ]);
  const likely = rows.filter(row => BCWW_ANY.test(`${row.title} ${row.content} ${row.url}`)).slice(0, 54);
  const hydrated = (await mapLimit(likely, 8, hydrateRow)).filter(Boolean);
  const rejectedInterest = hydrated.filter(row => evidenceState(`${row.title} ${row.content}`, row.published_date).reason === 'interest_only').length;
  const rejectedRecruitment = hydrated.filter(row => evidenceState(`${row.title} ${row.content}`, row.published_date).reason === 'recruitment_only').length;
  const eligible = hydrated.filter(bcwwRowEligible).slice(0, 40).map((row, index) => ({ ...row, id:`r${index}` }));
  return {
    rows, hydrated, eligible,
    publicCount:normalizeRows(publicResults.map(result => result?.results || [])).length,
    tavilyCount:normalizeRows(Array.isArray(tavilyResults) ? tavilyResults : []).length,
    rejectedInterest, rejectedRecruitment
  };
}

async function aiExtractChunk(rows = []) {
  if (!rows.length || !aiConfigured()) return [];
  const prompt = `Extract only NAMED non-Korean organizations with explicit evidence that the organization itself is participating in BCWW 2026 in Seoul.

STRICT ACCEPTANCE:
- The supplied row must explicitly tie the named organization to BCWW 2026 as an exhibitor, booth/stand holder, attendee/participant, showcase/pitch/screening company, selected participant, official overseas delegation/pavilion member, or registered seller/buyer.
- Evidence can be English, Japanese, Korean or Chinese.
- A company-owned announcement or an official BCWW/KOCCA participant listing is strongest.

STRICT REJECTION:
- recruitment/application/registration notices that merely invite companies to apply
- followers, "shown interest", likes, event-interest directories, 10times visitor/follower lists
- BCWW 2025-only material
- organizers, sponsors, speakers or media that only mention the event without saying the organization itself participates
- Korean companies, Korean subsidiaries/offices
- any organization not directly supported by the supplied row

Never invent company, country, domain, participation or evidence.
For evidence_quote, COPY an exact short excerpt from the supplied row that contains the organization name and the BCWW 2026 participation statement. Do not paraphrase.
Return JSON only:
{"items":[{"row_id":"r0","company":"official organization name","country":"Japan or empty if unsupported","participation":"exhibitor|booth|attendance|showcase|pitch|delegation|seller|buyer","evidence_quote":"exact excerpt copied from row","confidence":92}]}
Only include confidence >= 88.

ROWS:
${JSON.stringify(rows.map(row => ({ row_id:row.id, title:row.title, url:row.url, published_date:row.published_date, text:clean(row.content, 6500) })))}`;
  try {
    const result = await chatJson({ prompt, maxTokens:2800, timeoutMs:30000, temperature:0, hardDeadlineMs:40000 });
    const items = Array.isArray(result?.data?.items) ? result.data.items : [];
    return items.map(item => ({
      row_id:clean(item?.row_id, 20), company:clean(item?.company, 160), country:clean(item?.country, 80),
      participation:clean(item?.participation, 80), evidence_quote:clean(item?.evidence_quote, 1400), confidence:Number(item?.confidence) || 0
    })).filter(item => item.row_id && item.company && item.evidence_quote && item.confidence >= 88);
  } catch { return []; }
}

async function extractCandidates(rows = []) {
  if (!rows.length) return [];
  const chunks = [];
  for (let i = 0; i < Math.min(rows.length, 40); i += 14) chunks.push(rows.slice(i, i + 14));
  return (await Promise.all(chunks.map(aiExtractChunk))).flat();
}

function displayCompanyFromTitle(title = '', domain = '') {
  let value = clean(title, 160)
    .replace(/\s+[|–—-]\s+.*$/, '')
    .replace(/\s*\|\s*LinkedIn.*$/i, '')
    .replace(/\s*-\s*(?:Home|Official|Website).*$/i, '')
    .trim();
  if (!value || value.length < 2) value = rootHost(domain).split('.')[0] || '';
  return value;
}

function deterministicCandidates(rows = []) {
  return rows.flatMap(row => {
    const domain = rootHost(row.url);
    if (!domain || sourceLike(domain)) return [];
    const company = displayCompanyFromTitle(row.title, domain);
    if (!company || BCWW_ANY.test(company) || !rowMentionsCompany(company, row)) return [];
    const evidence_quote = evidenceWindow(company, row);
    if (!evidence_quote) return [];
    return [{ row_id:row.id, company, country:inferCountry(`${row.title} ${row.content}`, domain), participation:'explicit attendance', evidence_quote, confidence:94 }];
  });
}

async function resolveOfficialDomain(item = {}, source = {}, excludes = new Set()) {
  const sourceDomain = rootHost(source.url);
  if (sourceDomain && !sourceLike(sourceDomain) && !excludes.has(normalizeCompanyKey(sourceDomain)) && rowMentionsCompany(item.company, source)) {
    return { domain:sourceDomain, url:`https://${sourceDomain}/` };
  }
  const suffix = item.country ? ` ${item.country}` : '';
  const query = `"${clean(item.company, 160)}" official website${suffix}`;
  const [publicResult, tavilyResult] = await Promise.all([
    publicWebSearch(query, { maxResults:10, timeRange:'year', topic:'general' }).catch(() => ({ results:[] })),
    process.env.TAVILY_API_KEY ? tavilySearch(query, { maxResults:8 }) : Promise.resolve([])
  ]);
  const rows = normalizeRows([publicResult?.results || [], tavilyResult || []]);
  for (const row of rows) {
    const domain = rootHost(row.url);
    if (!domain || sourceLike(domain) || excludes.has(normalizeCompanyKey(domain))) continue;
    if (!rowMentionsCompany(item.company, row)) continue;
    if (obviouslyKorean(item.company, domain, `${row.title} ${row.content}`)) continue;
    return { domain, url:`https://${domain}/` };
  }
  return null;
}

async function resolveForeignCountry(item = {}, domain = '', source = {}) {
  const direct = clean(item.country, 80) || inferCountry(`${source.title || ''} ${source.content || ''}`, domain);
  if (direct) return isKoreanCountry(direct) ? '' : direct;
  const query = `"${clean(item.company, 160)}" headquarters country`;
  const [publicResult, tavilyResult] = await Promise.all([
    publicWebSearch(query, { maxResults:8, timeRange:'year', topic:'general' }).catch(() => ({ results:[] })),
    process.env.TAVILY_API_KEY ? tavilySearch(query, { maxResults:6 }) : Promise.resolve([])
  ]);
  for (const row of normalizeRows([publicResult?.results || [], tavilyResult || []])) {
    const country = inferCountry(`${row.title} ${row.content}`, row.url || domain);
    if (country) return isKoreanCountry(country) ? '' : country;
  }
  return '';
}

async function corroborateCandidate(item = {}, source = {}, official = {}) {
  if (!bcwwRowEligible(source) || !rowMentionsCompany(item.company, source) || !quoteSupported(item, source)) return null;
  const sourceDomain = rootHost(source.url);
  const officialDomain = rootHost(official.domain);

  if (AUTHORITATIVE_EVENT_DOMAINS.has(sourceDomain)) {
    return { grade:'A', evidence:[source], evidence_reason:'official_event_source' };
  }
  if (sourceDomain && sourceDomain === officialDomain) {
    return { grade:'A', evidence:[source], evidence_reason:'company_owned_announcement' };
  }

  const siteQuery = `site:${officialDomain} "BCWW 2026" ${clean(item.company, 120)}`;
  const exactQuery = `"${clean(item.company, 160)}" "BCWW 2026"`;
  const [sitePublic, siteTavily, exactPublic] = await Promise.all([
    publicWebSearch(siteQuery, { maxResults:8, timeRange:'year', topic:'general' }).catch(() => ({ results:[] })),
    process.env.TAVILY_API_KEY ? tavilySearch(exactQuery, { maxResults:8, includeDomains:[officialDomain] }) : Promise.resolve([]),
    publicWebSearch(exactQuery, { maxResults:8, timeRange:'year', topic:'general' }).catch(() => ({ results:[] }))
  ]);
  const corroboration = normalizeRows([sitePublic?.results || [], siteTavily || [], exactPublic?.results || []])
    .filter(row => !isBlockedSource(row.url))
    .filter(row => bcwwRowEligible(row) && rowMentionsCompany(item.company, row));
  const owned = corroboration.find(row => rootHost(row.url) === officialDomain);
  if (owned) return { grade:'B', evidence:[source, owned], evidence_reason:'company_owned_corroboration' };
  const independent = corroboration.find(row => rootHost(row.url) && rootHost(row.url) !== sourceDomain && !BLOCKED_EVENT_DOMAINS.has(rootHost(row.url)));
  if (independent) return { grade:'B', evidence:[source, independent], evidence_reason:'two_independent_sources' };
  return null;
}

async function resolveCandidates(items = [], rows = [], excludes = new Set()) {
  const rowById = new Map(rows.map(row => [row.id, row]));
  const unique = [];
  const seen = new Set();
  for (const item of items.sort((a, b) => b.confidence - a.confidence)) {
    const source = rowById.get(item.row_id);
    if (!source || !bcwwRowEligible(source) || !rowMentionsCompany(item.company, source) || !quoteSupported(item, source)) continue;
    const key = `${item.company.toLowerCase()}|${rootHost(source.url)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ item, source });
    if (unique.length >= 16) break;
  }

  const resolved = await mapLimit(unique, 5, async ({ item, source }) => {
    if (isKoreanCountry(item.country) || obviouslyKorean(item.company, '', `${source.title} ${source.content}`)) return null;
    const official = await resolveOfficialDomain(item, source, excludes);
    if (!official) return null;
    const domain = rootHost(official.domain);
    if (!domain || excludes.has(normalizeCompanyKey(domain)) || obviouslyKorean(item.company, domain, `${source.title} ${source.content}`)) return null;
    const country = await resolveForeignCountry(item, domain, source);
    if (!country || isKoreanCountry(country)) return null;
    const verification = await corroborateCandidate(item, source, official);
    if (!verification) return null;
    return { ...item, ...official, domain, country, source, ...verification };
  });

  const byDomain = new Map();
  for (const candidate of resolved.filter(Boolean)) {
    const previous = byDomain.get(candidate.domain);
    if (!previous || candidate.confidence > previous.confidence || (candidate.grade === 'A' && previous.grade !== 'A')) byDomain.set(candidate.domain, candidate);
  }
  return [...byDomain.values()].sort((a, b) => Number(b.grade === 'A') - Number(a.grade === 'A') || b.confidence - a.confidence);
}

function validBcwwContact(contact = {}, domain = '') {
  const email = clean(contact?.email, 260).toLowerCase();
  if (!email || contact?.qualified !== true || contact?.emailStatus !== 'valid' || Number(contact?.score || 0) < 75 || !sameDomain(email, domain)) return false;
  const local = email.split('@')[0] || '';
  return !BLOCKED_MAILBOXES.has(local);
}

async function attachContact(candidate = {}) {
  const result = await findContacts(candidate.domain, {
    maxContacts:10,
    minQualified:1,
    recommendedRole:'Events Lead',
    roleTargets:ROLE_TARGETS
  }).catch(() => null);
  if (!result) return { candidate, contact:null, attempts:[] };
  const contacts = Array.isArray(result.emails) ? result.emails : [];
  const contact = contacts.find(row => validBcwwContact(row, candidate.domain)) || null;
  return { candidate, contact, contacts, attempts:result.attempts || [], provider:result.provider || null, providerStatus:result.providerStatus || {} };
}

function historySecret() { return clean(process.env.GMAIL_SESSION_SECRET, 5000); }

async function safeHistoryDomains() {
  const secret = historySecret();
  if (!secret) return { sent:[], deleted:[] };
  const [sent, deleted] = await Promise.all([
    listSentCompanyDomains(secret, 500).catch(() => []),
    listDeletedCompanyDomains(secret, 2500).catch(() => [])
  ]);
  return { sent, deleted };
}

function leadFrom(candidate = {}, contact = {}, provider = null) {
  const company = clean(candidate.company, 160);
  const domain = rootHost(candidate.domain);
  const source = candidate.evidence?.[0] || candidate.source || {};
  const evidenceUrls = [...new Set((candidate.evidence || []).map(row => clean(row?.url, 700)).filter(Boolean))];
  return {
    id:`bcww:${domain}`,
    campaign:'bcww',
    campaign_label:'BCWW 단체복',
    company,
    domain,
    url:candidate.url || `https://${domain}/`,
    source_url:clean(source.url, 700),
    source_title:clean(source.title, 300),
    published_date:clean(source.published_date, 100),
    evidence_urls:evidenceUrls,
    evidence_grade:candidate.grade,
    evidence_reason:candidate.evidence_reason,
    signal:`${company} has verified BCWW 2026 participation evidence (${clean(candidate.participation, 80) || 'participation'})`,
    score:Math.max(88, Math.min(99, Number(candidate.confidence) || 92)),
    sales_priority:Math.max(88, Math.min(99, Number(candidate.confidence) || 92)),
    verified_company:true,
    bcww_confirmed:true,
    bcww_participation_confirmed:true,
    bcww_interest:false,
    bcww_signal_tier:'confirmed',
    team_origin:'foreign',
    team_origin_country:clean(candidate.country, 80),
    outreach_language:'en',
    recommended_role:clean(contact.title, 160) || 'Events / Marketing',
    role_targets:ROLE_TARGETS,
    contact,
    contacts:[contact],
    contact_provider:provider,
    contact_status:'found',
    contact_score_threshold:75,
    subject:`Quick question about ${company} at BCWW 2026`,
    message_en:`Hi,\n\nI saw that ${company} is participating in BCWW 2026 in Seoul. Have you already sorted team shirts or staff wear for the trip?\n\nWe produce branded apparel locally in Seoul and can deliver directly to your hotel, office or COEX, so your team does not have to manufacture overseas, ship boxes into Korea, or coordinate with Korean vendors after arrival.\n\nIf it is still open, I can send a few local options with pricing and turnaround.`,
    message_ko:''
  };
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); }
  catch { return Response.json({ error:'요청 형식이 잘못됐습니다.' }, { status:400 }); }

  const history = await safeHistoryDomains();
  const existing = Array.isArray(body.excludeDomains) ? body.excludeDomains : [];
  const excludes = new Set([...existing, ...history.sent, ...history.deleted].map(normalizeCompanyKey).filter(Boolean));

  try {
    const discovery = await discoverRows();
    const aiCandidates = await extractCandidates(discovery.eligible);
    const direct = deterministicCandidates(discovery.eligible);
    const candidates = await resolveCandidates([...direct, ...aiCandidates], discovery.eligible, excludes);

    const contactTargets = candidates.slice(0, 10);
    const contactResults = (await mapLimit(contactTargets, 4, attachContact)).filter(Boolean);
    const ready = contactResults.filter(row => row.contact).map(row => leadFrom(row.candidate, row.contact, row.provider));

    const secret = historySecret();
    let sentIds = new Set();
    if (secret && ready.length) {
      const matched = await matchSentCompanies(ready.map(lead => ({ id:lead.id, key:lead.domain })), secret).catch(() => []);
      sentIds = new Set(matched);
    }
    const leads = ready.filter(lead => !sentIds.has(lead.id)).slice(0, 12);

    const providers = [...new Set(contactResults.flatMap(row => Object.entries(row.providerStatus || {}).filter(([,enabled]) => enabled).map(([name]) => name)))];
    const searchSources = [...new Set(discovery.hydrated.flatMap(row => String(row.source || '').split('+')).filter(Boolean))];

    return Response.json({
      campaign:'bcww',
      campaign_label:'BCWW 단체복',
      leads,
      meta:{
        event:EVENT,
        returned:leads.length,
        raw_search_results:discovery.rows.length,
        api_free_results:discovery.publicCount,
        tavily_results:discovery.tavilyCount,
        bcww_current_rows:discovery.hydrated.length,
        confirmed_evidence_rows:discovery.eligible.length,
        ai_extracted:aiCandidates.length,
        deterministic_candidates:direct.length,
        evidence_verified_companies:candidates.length,
        contact_attempted:contactTargets.length,
        contact_ready:ready.length,
        contact_unresolved:Math.max(0, contactTargets.length - ready.length),
        sent_preexcluded:history.sent.length,
        sent_exact_suppressed:ready.length - leads.length,
        deleted_preexcluded:history.deleted.length,
        rejected_interest_only:discovery.rejectedInterest,
        rejected_recruitment_only:discovery.rejectedRecruitment,
        search_sources:searchSources,
        tavily_connected:Boolean(process.env.TAVILY_API_KEY),
        jina_connected:Boolean(process.env.JINA_API_KEY),
        contact_providers:providers,
        participation_gate:'explicit BCWW 2026 participation only; interest/follower and recruitment-only evidence rejected',
        contact_gate:'same-domain, qualified, emailStatus=valid, score>=75; low-value generic mailboxes rejected',
        team_origin_gate:'foreign only; Korea and unresolved origin rejected',
        historical_participants_allowed:false,
        interest_directory_allowed:false
      }
    }, { headers:{ 'Cache-Control':'no-store' } });
  } catch (error) {
    console.error('bcww discovery failed', clean(error?.message || error, 500));
    return Response.json({ error:'BCWW 참가사·이메일 검증 중 오류가 발생했습니다.', detail:clean(error?.message || error, 300) }, { status:502, headers:{ 'Cache-Control':'no-store' } });
  }
}
