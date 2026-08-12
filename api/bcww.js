import { tavilyConfigured, tavilySearch, tavilySearchMany } from '../lib/web-search.js';
import { aiConfigured, chatJson } from '../lib/ai-provider.js';
import { listSentCompanyDomains, matchSentCompanies, normalizeCompanyKey } from '../lib/sent-companies.js';
import { listDeletedCompanyDomains } from '../lib/deleted-companies.js';

const EVENT = {
  name: 'BCWW 2026',
  dates: '2026-09-14–2026-09-16',
  venue: 'COEX Hall B, Seoul'
};

// publicWebSearchMany handles max 6 queries per call. Use multiple batches.
const SEARCH_BATCHES = [
  [
    'BCWW 2026 exhibitor',
    'BCWW 2026 participant company',
    'BCWW 2026 attending Seoul',
    'BCWW 2026 showcase pitch',
    'BCWW 2026 booth stand',
    'Broadcast World Wide 2026 Seoul company'
  ],
  [
    'BCWW 2026 Japan',
    'BCWW 2026 Taiwan',
    'BCWW 2026 Singapore Thailand',
    'BCWW 2026 Philippines Indonesia Malaysia',
    'BCWW 2026 France UK Europe',
    'BCWW 2026 USA Canada Australia'
  ],
  [
    'BCWW 2026 出展',
    'BCWW 2026 参加',
    'BCWW 2026 ピッチ',
    'BCWW 2026 참가',
    'BCWW 2026 參展',
    'BCWW 2026 参展'
  ],
  [
    'BCWW Seoul September 2026 meet us',
    'BCWW 2026 we will be there',
    'BCWW 2026 see you in Seoul',
    'BCWW 2026 selected company',
    'BCWW 2026 delegation',
    'BCWW 2026 pavilion'
  ],
  [
    'site:10times.com/broadcast-worldwide-seoul/visitors "Hong Kong"',
    'site:10times.com/broadcast-worldwide-seoul/visitors Thailand',
    'site:10times.com/broadcast-worldwide-seoul/visitors Vietnam',
    'site:10times.com/broadcast-worldwide-seoul/visitors India',
    'site:10times.com/broadcast-worldwide-seoul/visitors Mongolia',
    'site:10times.com/broadcast-worldwide-seoul/visitors Nepal'
  ]
];

const CURRENT_INTEREST_URL = 'https://10times.com/broadcast-worldwide-seoul/visitors';

// Public 2026 event-interest signals found before implementing this pipeline.
// These are NOT asserted as confirmed exhibitors. They are valid prospect seeds because the
// current BCWW 2026 event page lists their representatives as followers / interested attendees.
const PUBLIC_INTEREST_SEEDS = [
  { company:'Xiaowu Bros.', country:'Hong Kong' },
  { company:'Central Television', country:'Mongolia' },
  { company:'J J P Corporation', country:'Thailand' },
  { company:'GMM Studios International', country:'Thailand' },
  { company:'Chitrakala Productions Pvt. Ltd.', country:'Nepal' },
  { company:'Vietnam Television Cable Corporation', country:'Vietnam' },
  { company:'Triple Nine Global', country:'Bangladesh' },
  { company:'IN10 Media Network', country:'India' },
  { company:'The Seagull Films', country:'United States' },
  { company:'Ladybirdco', country:'Iran' }
];

const SOURCE_DOMAINS = new Set([
  'bcww.kr','coex.co.kr','coexcenter.com','linkedin.com','x.com','twitter.com',
  'facebook.com','instagram.com','youtube.com','bizinfo.go.kr','connectplt.kr',
  'globalexhibition.org','kocca.kr','mcst.go.kr','crunchbase.com','imdb.com',
  'variety.com','deadline.com','thetvdb.com','prtimes.jp','vipo.or.jp','10times.com'
]);

const BAD_DOMAIN_PARTS = /(news|press|blog|medium|wikipedia|eventbrite|meetup|directory|exhibition|conference)/i;
const BCWW_ANY = /(?:\bBCWW\b|Broadcast\s*World\s*Wide)/i;
const BCWW_2026 = /(?:\bBCWW\s*2026\b|Broadcast\s*World\s*Wide[^\n]{0,80}\b2026\b)/i;
const BCWW_2025 = /\bBCWW\s*2025\b/i;
const STRONG_PARTICIPATION = /(stand\s*(?:no\.?|#)?\s*[a-z0-9-]+|booth\s*(?:no\.?|#)?\s*[a-z0-9-]+|exhibitor|exhibiting|participat(?:e|es|ed|ing|ion)\s+(?:in|at)|attend(?:s|ed|ing)?\s+(?:BCWW|the\s+BCWW)|join(?:s|ed|ing)?\s+(?:BCWW|us\s+at\s+BCWW)|we(?:'re| are| will be)\s+(?:at|joining|attending|exhibiting)|meet\s+us\s+(?:at|in)|see\s+you\s+(?:at|in)|showcase(?:\s+(?:participant|company|at\s+BCWW))?|pitch(?:es|ed|ing)?\s+(?:at|during|for)\s+BCWW|screen(?:s|ed|ing)?\s+(?:at|during)\s+BCWW|selected\s+(?:for|to\s+join|to\s+participate\s+in)\s+(?:the\s+)?BCWW|delegation\s+(?:to|at)\s+BCWW|pavilion\s+(?:at|for)\s+BCWW|出展(?:します|予定|企業)?|参加(?:します|予定|企業|会社)?|ピッチ(?:登壇|参加)?|採択|選出|ブース|참가(?:합니다|예정|기업)?|출전|부스|피칭|선정|參展|参展|參加|参加|展位|入選|入选)/i;
const INTEREST_SIGNAL = /(followers?|users?\s+who\s+have\s+shown\s+interest|shown\s+interest\s+for\s+this\s+event|people\s+attending|heading\s+to\s+the\s+event|interested\s+attendees?|event-interest|참가\s*관심)/i;
const RECRUITMENT_ONLY = /(registration\s+(?:is\s+)?(?:now\s+)?open|register\s+(?:now|here)|applications?\s+(?:are\s+)?open|apply\s+(?:now|here|by)|application\s+deadline|call\s+for\s+(?:exhibitors?|applications?|entries)|recruit(?:ing|ment)|募集|応募|申込|公募|모집(?:공고)?|공모|신청(?:기간|방법)?|접수(?:기간)?|招募|报名|報名)/i;
const CONFIRMED_LANGUAGE = /(we(?:'re| are| will be)|our\s+(?:team|company)|selected|confirmed|official\s+delegation|will\s+(?:attend|join|exhibit|showcase|pitch)|participating|exhibiting|attending|joining|出展します|出展予定|参加します|参加予定|採択|選出|참가합니다|참가예정|선정|參展|参展|入選|入选)/i;
const KOREA_ENTITY = /(?:\bKorea\b|코리아|한국(?:지사|법인|오피스|사무소)?)/i;

const COUNTRY_PATTERNS = [
  ['Japan', /\bJapan(?:ese)?\b|日本/i], ['Taiwan', /\bTaiwan(?:ese)?\b|臺灣|台湾/i],
  ['Thailand', /\bThailand|Thai\b/i], ['Singapore', /\bSingapore(?:an)?\b/i],
  ['Philippines', /\bPhilippines|Filipino\b/i], ['Indonesia', /\bIndonesia(?:n)?\b/i],
  ['Malaysia', /\bMalaysia(?:n)?\b/i], ['Vietnam', /\bVietnam(?:ese)?\b/i],
  ['Hong Kong', /\bHong\s*Kong\b/i], ['China', /\bChina|Chinese\b|中國|中国/i],
  ['India', /\bIndia(?:n)?\b/i], ['Australia', /\bAustralia(?:n)?\b/i],
  ['New Zealand', /\bNew\s+Zealand\b/i],
  ['United States', /\bUnited\s+States\b|\bU\.S\.A?\.?\b|\bUSA\b|\bAmerican\b/i],
  ['Canada', /\bCanada|Canadian\b/i], ['United Kingdom', /\bUnited\s+Kingdom\b|\bUK\b|\bBritish\b/i],
  ['France', /\bFrance|French\b|法国|法國/i], ['Germany', /\bGermany|German\b/i],
  ['Spain', /\bSpain|Spanish\b/i], ['Italy', /\bItaly|Italian\b/i],
  ['Netherlands', /\bNetherlands|Dutch\b/i], ['Sweden', /\bSweden|Swedish\b/i],
  ['Norway', /\bNorway|Norwegian\b/i], ['Denmark', /\bDenmark|Danish\b/i],
  ['Finland', /\bFinland|Finnish\b/i], ['Brazil', /\bBrazil|Brazilian\b/i],
  ['Mexico', /\bMexico|Mexican\b/i], ['United Arab Emirates', /\bUnited\s+Arab\s+Emirates\b|\bUAE\b/i],
  ['Mongolia', /\bMongolia(?:n)?\b|Ulaanbaatar/i], ['Nepal', /\bNepal(?:ese)?\b|Kathmandu/i],
  ['Bangladesh', /\bBangladesh(?:i)?\b|Dhaka/i], ['Iran', /\bIran(?:ian)?\b|Tehran/i],
  ['Sri Lanka', /\bSri\s+Lanka(?:n)?\b|Colombo|Kalutara/i]
];

const CCTLD_COUNTRY = new Map([
  ['jp','Japan'],['tw','Taiwan'],['th','Thailand'],['sg','Singapore'],['ph','Philippines'],
  ['id','Indonesia'],['my','Malaysia'],['vn','Vietnam'],['hk','Hong Kong'],['cn','China'],
  ['in','India'],['au','Australia'],['nz','New Zealand'],['us','United States'],['ca','Canada'],
  ['uk','United Kingdom'],['fr','France'],['de','Germany'],['es','Spain'],['it','Italy'],
  ['nl','Netherlands'],['se','Sweden'],['no','Norway'],['dk','Denmark'],['fi','Finland'],
  ['br','Brazil'],['mx','Mexico'],['ae','United Arab Emirates'],['mn','Mongolia'],['np','Nepal'],
  ['bd','Bangladesh'],['ir','Iran'],['lk','Sri Lanka']
]);

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

function currentBcwwContext(text = '', publishedDate = '') {
  const value = clean(text, 12000);
  if (!BCWW_ANY.test(value)) return false;
  if (BCWW_2026.test(value)) return true;
  if (BCWW_2025.test(value)) return false;
  const year = clean(publishedDate, 80);
  return /^2026(?:-|\/|\s)/.test(year) || /(?:Sep(?:tember)?\s*14\s*[-–]\s*16[^\n]{0,40}2026|2026[^\n]{0,40}Sep(?:tember)?\s*14)/i.test(value);
}

function directParticipation(text = '', publishedDate = '') {
  const value = clean(text, 12000);
  if (!currentBcwwContext(value, publishedDate) || !STRONG_PARTICIPATION.test(value)) return false;
  if (RECRUITMENT_ONLY.test(value) && !CONFIRMED_LANGUAGE.test(value)) return false;
  return true;
}

function currentInterest(text = '', publishedDate = '') {
  const value = clean(text, 12000);
  return currentBcwwContext(value, publishedDate) && INTEREST_SIGNAL.test(value);
}

function inferCountry(text = '', domain = '') {
  const value = clean(text, 12000);
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
  return /(?:Korea office|Korean office|Korea branch|한국지사|한국법인|서울지사)/i.test(clean(text, 6000));
}

function sourceLike(domain = '') {
  const host = rootHost(domain);
  return SOURCE_DOMAINS.has(host) || BAD_DOMAIN_PARTS.test(host);
}

function companyTokens(value = '') {
  return clean(value, 160).toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|company|co|gmbh|sa|srl|plc|group|studios?)\b/giu, ' ')
    .replace(/株式会社|有限会社|公司|集團|集团/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/u).filter(token => token.length >= 2);
}

function titleMatchesCompany(company = '', row = {}) {
  const tokens = companyTokens(company);
  if (!tokens.length) return false;
  const text = `${row?.title || ''} ${row?.content || ''} ${row?.url || ''}`.toLowerCase();
  const hits = tokens.filter(token => text.includes(token)).length;
  return hits >= Math.min(2, tokens.length);
}

function displayCompanyFromTitle(title = '', domain = '') {
  let value = clean(title, 140)
    .replace(/\s+[|–—-]\s+.*$/, '')
    .replace(/\s*\|\s*LinkedIn.*$/i, '')
    .replace(/\s*-\s*(?:Home|Official|Website).*$/i, '')
    .trim();
  if (!value || value.length < 2) value = rootHost(domain).split('.')[0] || '';
  return value;
}

function historySecret() { return clean(process.env.GMAIL_SESSION_SECRET, 5000); }

async function safeHistoryDomains() {
  const secret = historySecret();
  if (!secret) return { sent: [], deleted: [] };
  const [sent, deleted] = await Promise.all([
    listSentCompanyDomains(secret, 400).catch(() => []),
    listDeletedCompanyDomains(secret, 2000).catch(() => [])
  ]);
  return { sent, deleted };
}

function stripHtml(html = '') {
  return clean(String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'"), 12000);
}

async function fetchEvidencePage(url = '') {
  if (!/^https?:\/\//i.test(url)) return '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5500);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 KoreaAgent/1.0', Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' },
      signal: controller.signal
    });
    if (!res.ok) return '';
    const type = String(res.headers.get('content-type') || '');
    if (type && !/(html|text|xml|json)/i.test(type)) return '';
    return stripHtml((await res.text()).slice(0, 300000));
  } catch { return ''; }
  finally { clearTimeout(timer); }
}

async function mapLimit(items = [], limit = 5, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { out[index] = await worker(items[index], index); }
      catch { out[index] = null; }
    }
  });
  await Promise.all(runners);
  return out;
}

function flattenSearchRows(searches = []) {
  const byUrl = new Map();
  for (const search of searches) {
    for (const row of Array.isArray(search?.results) ? search.results : []) {
      const url = clean(row?.url, 500);
      if (!/^https?:\/\//i.test(url)) continue;
      const key = url.replace(/\/$/, '');
      const next = {
        title: clean(row?.title, 260), url,
        content: clean(row?.content || row?.snippet || row?.description, 3500),
        published_date: clean(row?.published_date, 80),
        engine: clean(row?._engine || row?.source, 60) || 'web',
        score: Number(row?.score) || 0
      };
      const previous = byUrl.get(key);
      if (!previous) {
        byUrl.set(key, next);
        continue;
      }
      byUrl.set(key, {
        ...previous,
        title: previous.title || next.title,
        content: clean(`${previous.content} ${next.content}`, 10000),
        published_date: previous.published_date || next.published_date,
        score: Math.max(previous.score, next.score)
      });
    }
  }
  return [...byUrl.values()].sort((a, b) => b.score - a.score);
}

async function hydrateRows(searches = []) {
  const raw = flattenSearchRows(searches);
  const likely = raw.filter(row => BCWW_ANY.test(`${row.title} ${row.content} ${row.url}`)).slice(0, 56);
  const hydrated = await mapLimit(likely, 6, async row => {
    const page = await fetchEvidencePage(row.url);
    return { ...row, content: clean(`${row.content} ${page}`, 12000) };
  });
  const seen = new Set();
  const rows = hydrated.filter(Boolean).filter(row => currentBcwwContext(`${row.title} ${row.content}`, row.published_date)).filter(row => {
    const key = `${rootHost(row.url)}|${row.url.replace(/\/$/, '')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  rows.sort((a, b) =>
    Number(directParticipation(`${b.title} ${b.content}`, b.published_date)) - Number(directParticipation(`${a.title} ${a.content}`, a.published_date)) ||
    Number(currentInterest(`${b.title} ${b.content}`, b.published_date)) - Number(currentInterest(`${a.title} ${a.content}`, a.published_date)) ||
    b.score - a.score
  );
  return { rawCount: raw.length, likelyCount: likely.length, rows: rows.slice(0, 84).map((row, index) => ({ ...row, id: `r${index}` })) };
}

async function aiExtractChunk(rows = []) {
  if (!rows.length || !aiConfigured()) return [];
  const prompt = `Find NAMED non-Korean organizations with useful current BCWW 2026 sales evidence.

Two valid tiers:
1) CONFIRMED: exhibitor/booth/stand, explicit attendance/joining, showcase/screening/pitch, selected participant, overseas delegation/pavilion, or named registered seller/buyer.
2) INTEREST: a current 2026 event directory explicitly lists the organization's representative among BCWW 2026 followers, people attending, or users who have shown interest. This is a prospect signal, NOT a confirmed exhibitor claim.

The evidence may be English, Japanese, Korean or Chinese.
Reject generic recruitment/registration posts with no named organization, 2025-only evidence, organizers merely promoting the event, Korean companies/subsidiaries, irrelevant individuals, and speaker-only mentions unless the company itself is participating.
Never invent company, country, website or domain.
Return JSON only:
{"items":[{"row_id":"r0","company":"official organization name","country":"Japan or empty","participation":"booth|exhibitor|attendance|showcase|pitch|delegation|seller|buyer|interest","confidence":90}]}
Use confidence >=82 for confirmed, >=76 for interest.

ROWS:
${JSON.stringify(rows.map(row => ({ row_id: row.id, title: row.title, url: row.url, published_date: row.published_date, text: clean(row.content, 5500) })))}`;
  try {
    const result = await chatJson({ prompt, maxTokens: 3000, timeoutMs: 30000, temperature: 0, hardDeadlineMs: 42000 });
    const items = Array.isArray(result?.data?.items) ? result.data.items : [];
    return items.map(item => ({
      row_id: clean(item?.row_id, 20), company: clean(item?.company, 140), country: clean(item?.country, 80),
      participation: clean(item?.participation, 80), confidence: Number(item?.confidence) || 0
    })).filter(item => {
      if (!item.row_id || !item.company) return false;
      return item.participation === 'interest' ? item.confidence >= 76 : item.confidence >= 82;
    });
  } catch { return []; }
}

async function aiExtract(rows = []) {
  if (!rows.length || !aiConfigured()) return [];
  const chunks = [];
  for (let i = 0; i < Math.min(rows.length, 72); i += 15) chunks.push(rows.slice(i, i + 15));
  return (await Promise.all(chunks.map(aiExtractChunk))).flat();
}

async function resolveOfficialDomain(company = '', country = '', excludes = new Set(), source = null) {
  const sourceDomain = rootHost(source?.url || '');
  if (sourceDomain && !sourceLike(sourceDomain) && !excludes.has(normalizeCompanyKey(sourceDomain)) && titleMatchesCompany(company, source || {})) {
    return { domain: sourceDomain, url: `https://${sourceDomain}/`, country_hint: inferCountry(`${source?.title || ''} ${source?.content || ''}`, sourceDomain) };
  }
  const suffix = country ? ` ${clean(country, 80)}` : '';
  let result;
  try { result = await tavilySearch(`${clean(company, 140)} official website${suffix}`, { maxResults: 10, topic: 'general' }); }
  catch { return null; }
  for (const row of Array.isArray(result?.results) ? result.results : []) {
    const domain = rootHost(row?.url);
    if (!domain || sourceLike(domain) || excludes.has(normalizeCompanyKey(domain))) continue;
    if (obviouslyKorean(company, domain, `${row?.title || ''} ${row?.content || ''}`)) continue;
    if (!titleMatchesCompany(company, row)) continue;
    return { domain, url: `https://${domain}/`, country_hint: inferCountry(`${row?.title || ''} ${row?.content || ''}`, domain) };
  }
  return null;
}

async function resolveForeignCountry(company = '', domain = '', sourceText = '', initialCountry = '') {
  const direct = clean(initialCountry, 80) || inferCountry(sourceText, domain);
  if (direct) return isKoreanCountry(direct) ? '' : direct;
  let result;
  try { result = await tavilySearch(`${clean(company, 140)} headquarters country`, { maxResults: 8, topic: 'general' }); }
  catch { return ''; }
  for (const row of Array.isArray(result?.results) ? result.results : []) {
    const country = inferCountry(`${row?.title || ''} ${row?.content || ''}`, row?.url || domain);
    if (country && !isKoreanCountry(country)) return country;
    if (isKoreanCountry(country)) return '';
  }
  return '';
}

async function directCandidates(rows = [], excludes = new Set()) {
  const eligible = rows.filter(row => directParticipation(`${row.title} ${row.content}`, row.published_date));
  const out = [];
  for (const row of eligible) {
    const domain = rootHost(row.url);
    if (!domain || sourceLike(domain) || excludes.has(normalizeCompanyKey(domain))) continue;
    const company = displayCompanyFromTitle(row.title, domain);
    const text = `${row.title} ${row.content}`;
    if (obviouslyKorean(company, domain, text)) continue;
    out.push({ company, country: inferCountry(text, domain), participation: 'explicit attendance', confidence: 94, domain, url: `https://${domain}/`, source: row });
  }
  return out;
}

async function resolveExtractedCandidates(items = [], rows = [], excludes = new Set()) {
  const rowById = new Map(rows.map(row => [row.id, row]));
  const unique = [];
  const seen = new Set();
  for (const item of items.sort((a, b) => b.confidence - a.confidence)) {
    const source = rowById.get(item.row_id);
    if (!source) continue;
    const key = `${item.company.toLowerCase()}|${rootHost(source.url)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ item, source });
    if (unique.length >= 30) break;
  }
  return (await mapLimit(unique, 5, async ({ item, source }) => {
    const sourceText = `${source.title} ${source.content}`;
    if (obviouslyKorean(item.company, '', sourceText) || isKoreanCountry(item.country)) return null;
    const official = await resolveOfficialDomain(item.company, item.country, excludes, source);
    if (!official) return null;
    const country = await resolveForeignCountry(item.company, official.domain, sourceText, item.country || official.country_hint);
    if (!country) return null;
    return { ...item, ...official, country, source };
  })).filter(Boolean);
}

async function verifyDirectCandidates(items = []) {
  return (await mapLimit(items.slice(0, 20), 5, async item => {
    const text = `${item.source?.title || ''} ${item.source?.content || ''}`;
    const country = await resolveForeignCountry(item.company, item.domain, text, item.country);
    return country ? { ...item, country } : null;
  })).filter(Boolean);
}

async function resolveSeedCandidates(excludes = new Set()) {
  const source = {
    title: 'BCWW 2026 current attendee-interest directory',
    url: CURRENT_INTEREST_URL,
    content: 'Broadcast Worldwide BCWW 2026 followers and users who have shown interest for this event',
    published_date: '2026'
  };
  return (await mapLimit(PUBLIC_INTEREST_SEEDS, 5, async seed => {
    if (isKoreanCountry(seed.country)) return null;
    const official = await resolveOfficialDomain(seed.company, seed.country, excludes, source);
    if (!official) return null;
    const domain = normalizeCompanyKey(official.domain);
    if (!domain || excludes.has(domain)) return null;
    return {
      company: seed.company,
      country: seed.country,
      participation: 'interest',
      confidence: 80,
      ...official,
      source
    };
  })).filter(Boolean);
}

function leadFrom(candidate) {
  const company = clean(candidate.company, 140);
  const domain = rootHost(candidate.domain);
  const source = candidate.source || {};
  const participation = clean(candidate.participation, 80) || 'participation';
  const interestOnly = participation === 'interest';
  const confidence = Number(candidate.confidence) || (interestOnly ? 80 : 88);
  return {
    id: `bcww:${domain}`, campaign: 'bcww', campaign_label: 'BCWW 단체복', company, domain,
    url: candidate.url || `https://${domain}/`, source_url: clean(source.url, 500), source_title: clean(source.title, 260),
    published_date: clean(source.published_date, 80),
    signal: interestOnly
      ? `${company} appears in a current BCWW 2026 attendee-interest listing`
      : `${company} is confirmed for BCWW 2026 (${participation})`,
    score: Math.max(76, Math.min(99, confidence)),
    sales_priority: Math.max(76, Math.min(99, confidence)),
    verified_company: true,
    bcww_confirmed: true,
    bcww_participation_confirmed: !interestOnly,
    bcww_interest: interestOnly,
    bcww_signal_tier: interestOnly ? 'interest' : 'confirmed',
    team_origin: 'foreign', team_origin_country: clean(candidate.country, 80),
    outreach_language: 'en', recommended_role: 'Events Lead',
    role_targets: ['Events Lead','Event Marketing','Marketing Director','Partnerships Lead','Operations Lead','Business Development Director','Founder','CEO'],
    subject: `Quick question about BCWW 2026 in Seoul`,
    message_en: interestOnly
      ? `Hi,\n\nI came across ${company} in the current BCWW 2026 attendee-interest listings for Seoul. If your team is planning to attend, have you already sorted team shirts or staff wear for the trip?\n\nWe produce branded apparel locally in Seoul and can deliver directly to your hotel, office or COEX, so your team does not have to manufacture overseas, ship boxes into Korea, or coordinate with Korean vendors after arrival.\n\nIf it is still open, I can send a few local options with pricing and turnaround.`
      : `Hi,\n\nI saw that ${company} is participating in BCWW 2026 in Seoul. Quick question — have you already sorted team shirts or staff wear for the trip?\n\nWe produce branded apparel locally in Seoul and can deliver directly to your hotel, office or COEX, so your team does not have to manufacture overseas, ship boxes into Korea, or coordinate with Korean vendors after arrival.\n\nIf it is still open, I can send a few local options with pricing and turnaround.`,
    message_ko: '', contact: null, contact_status: 'pending'
  };
}

export function bcwwRowRelevant(row = {}) { return currentBcwwContext(`${row?.title || ''} ${row?.content || ''}`, row?.published_date || ''); }
export function bcwwRowEligible(row = {}) { return directParticipation(`${row?.title || ''} ${row?.content || ''}`, row?.published_date || ''); }

export async function POST(request) {
  if (!tavilyConfigured()) return Response.json({ error: '검색 엔진 연결이 필요합니다.' }, { status: 503 });
  let body = {};
  try { body = await request.json(); }
  catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }

  const existing = Array.isArray(body.excludeDomains) ? body.excludeDomains : [];
  const history = await safeHistoryDomains();
  const excludes = new Set([...existing, ...history.sent, ...history.deleted].map(normalizeCompanyKey).filter(Boolean));

  try {
    const [searches, anchorText, seedCandidates] = await Promise.all([
      Promise.all(SEARCH_BATCHES.map(batch => tavilySearchMany(batch, { maxResults: 16, timeRange: 'year', topic: 'general' }))),
      fetchEvidencePage(CURRENT_INTEREST_URL),
      resolveSeedCandidates(excludes)
    ]);

    if (anchorText) {
      searches.push({
        results: [{
          title: 'BCWW 2026 - current followers / people attending / interested companies',
          url: CURRENT_INTEREST_URL,
          content: anchorText,
          published_date: '2026',
          source: 'bcww-interest-anchor',
          score: 1
        }]
      });
    }

    const hydrated = await hydrateRows(searches);
    const rows = hydrated.rows;
    const strongRows = rows.filter(row => directParticipation(`${row.title} ${row.content}`, row.published_date));
    const interestRows = rows.filter(row => currentInterest(`${row.title} ${row.content}`, row.published_date));

    const [directRaw, extracted] = await Promise.all([directCandidates(rows, excludes), aiExtract(rows)]);
    const [direct, resolved] = await Promise.all([verifyDirectCandidates(directRaw), resolveExtractedCandidates(extracted, rows, excludes)]);

    const combined = [...direct, ...resolved, ...seedCandidates];
    const seen = new Set();
    const provisional = [];
    for (const candidate of combined.sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))) {
      const domain = normalizeCompanyKey(candidate.domain);
      if (!domain || seen.has(domain) || excludes.has(domain)) continue;
      if (!candidate.country || isKoreanCountry(candidate.country)) continue;
      if (obviouslyKorean(candidate.company, domain, `${candidate.source?.title || ''} ${candidate.source?.content || ''}`)) continue;
      seen.add(domain);
      provisional.push(leadFrom(candidate));
      if (provisional.length >= 35) break;
    }

    const secret = historySecret();
    let sentIds = new Set();
    if (secret && provisional.length) {
      const matched = await matchSentCompanies(provisional.map(lead => ({ id: lead.id, key: lead.domain })), secret).catch(() => []);
      sentIds = new Set(matched);
    }
    const leads = provisional.filter(lead => !sentIds.has(lead.id));

    return Response.json({
      campaign: 'bcww', campaign_label: 'BCWW 단체복', leads,
      meta: {
        event: EVENT, returned: leads.length,
        raw_search_results: hydrated.rawCount,
        bcww_search_hits: hydrated.likelyCount,
        searched_rows: rows.length,
        strong_evidence_rows: strongRows.length,
        interest_evidence_rows: interestRows.length,
        direct_candidates: direct.length,
        ai_extracted: extracted.length,
        resolved_foreign_candidates: resolved.length,
        seeded_interest_candidates: seedCandidates.length,
        confirmed_returned: leads.filter(lead => lead.bcww_participation_confirmed).length,
        interest_returned: leads.filter(lead => lead.bcww_interest).length,
        sent_preexcluded: history.sent.length,
        sent_exact_suppressed: provisional.length - leads.length,
        deleted_preexcluded: history.deleted.length,
        search_batches: SEARCH_BATCHES.length,
        search_queries: SEARCH_BATCHES.reduce((sum, batch) => sum + batch.length, 0),
        participation_gate: 'BCWW 2026 confirmed participation plus current public attendee-interest signals; foreign companies only',
        recruitment_only_rejected: true,
        team_origin_gate: 'foreign only; Korea and unresolved origin rejected',
        historical_participants_allowed: false,
        email_gate: 'frontend exposes only same-domain qualified + valid contacts'
      }
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: clean(error?.message || error, 400) || 'BCWW 후보 검색에 실패했습니다.' }, { status: Number(error?.status) || 502 });
  }
}
