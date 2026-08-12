import { aiConfigured, chatJson } from './ai-provider.js';
import {
  buildGlobalExclusions,
  clean,
  fetchPage,
  mapLimit,
  normalizeCompanyKey,
  publicWebSearch,
  publicWebSearchMany,
  resolveOfficialWebsite,
  rootHost,
  suppressExactSent,
  textMatchesCompany
} from './international-event-campaign.js';

const EVENT = { name:'World Smart City Expo 2026', short:'WSCE 2026', dates:'2026-09-09–2026-09-11', venue:'BEXCO, Busan' };
const EVENT_DOMAIN = 'worldsmartcityexpo.com';
const DETAIL_MAX = 320;
const REQUEST_BUDGET_MS = 108000;
let STARTED = Date.now();

const BAD_NAME = /(?:World Smart City Expo|\bWSCE\b|List of Participating Companies|Participating Companies|Smart City Expo|BEXCO|Booth Number|Company Introduction|Main Products|Hosted by|Organized by|Exhibit Application|Exhibitor Benefits|Sponsorship|^Image$|^List$|^수정$|^Home$|추후 작성 예정)/i;
const SOURCE_LIKE = /(?:worldsmartcityexpo\.com|news|press|media|blog|event|expo|conference|directory|linkedin\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|youtube\.com|wikipedia\.org|10times\.)/i;
const SOCIAL = /(?:facebook\.com|instagram\.com|youtube\.com|linkedin\.com|x\.com|twitter\.com|wikipedia\.org|10times\.|eventbrite\.)/i;
const EVENT_EXACT = /(?:World\s+Smart\s+City\s+Expo[^.\n]{0,120}2026|WSCE\s*2026)/i;
const BUSAN = /(?:BEXCO|Busan|부산|벡스코)/i;
const PARTICIPATION = /(exhibitor|exhibiting|participat(?:e|es|ed|ing|ion)|booth|stand|pavilion|delegation|attend(?:s|ed|ing)|join(?:s|ed|ing)|speaker|speaking|partner|sponsor|meet\s+us|see\s+you|upcoming\s+events?|event\s+calendar|business\s+meeting|buyer|출전|참가|전시|부스|연사|파트너|스폰서|出展|参加|參展|参展)/i;
const RECRUIT_ONLY = /(call\s+for|recruit(?:ment|ing)?|apply\s+now|application\s+deadline|registration\s+(?:is\s+)?open|모집|신청\s*안내|공모|募集|応募|招募|报名|報名)/i;
const KOREA = /(?:South\s+Korea|Republic\s+of\s+Korea|\bKorea\b|Seoul|Busan|대한민국|한국|서울|부산)/i;
const KOREA_HQ = /(?:headquartered|headquarters|registered office|principal office|based)[^.!?\n]{0,100}(?:South\s+Korea|Republic\s+of\s+Korea|Seoul|Busan)|(?:South\s+Korea|Republic\s+of\s+Korea|Seoul|Busan)[^.!?\n]{0,80}(?:headquarters|headquartered|registered office)/i;

const COUNTRY_PATTERNS = [
  ['Nigeria', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}(?:Nigeria|Abuja|Lagos)|(?:Nigeria|Abuja|Lagos)[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['United Arab Emirates', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}(?:United Arab Emirates|\bUAE\b|Dubai|Abu Dhabi)|(?:UAE|Dubai|Abu Dhabi)[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Singapore', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Singapore|Singapore[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Japan', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Japan|Japan[^.!?\n]{0,80}(?:based|headquarters|office)|日本[^。\n]{0,70}(?:本社|所在地)/i],
  ['Taiwan', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Taiwan|Taiwan[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Vietnam', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Vietnam|Vietnam[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Thailand', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Thailand|Thailand[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Malaysia', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Malaysia|Malaysia[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Indonesia', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Indonesia|Indonesia[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Philippines', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Philippines|Philippines[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Hong Kong', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Hong\s*Kong|Hong\s*Kong[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['China', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}China|China[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['India', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}India|India[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Australia', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Australia|Australia[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['United States', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}(?:United States|\bUSA\b|California|New York|Texas)|(?:United States|USA)[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Canada', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Canada|Canada[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['United Kingdom', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}(?:United Kingdom|\bUK\b|London)|(?:United Kingdom|UK)[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Germany', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Germany|Germany[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['France', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}France|France[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Netherlands', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Netherlands|Netherlands[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Switzerland', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Switzerland|Switzerland[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Sweden', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Sweden|Sweden[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Finland', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Finland|Finland[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Denmark', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Denmark|Denmark[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Norway', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Norway|Norway[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Spain', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Spain|Spain[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Italy', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Italy|Italy[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Brazil', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Brazil|Brazil[^.!?\n]{0,80}(?:based|headquarters|office)/i],
  ['Mexico', /(?:headquartered|headquarters|based|registered office|principal office|office|address)[^.!?\n]{0,110}Mexico|Mexico[^.!?\n]{0,80}(?:based|headquarters|office)/i]
];
const CCTLD = new Map([
  ['ng','Nigeria'],['ae','United Arab Emirates'],['sg','Singapore'],['jp','Japan'],['tw','Taiwan'],['vn','Vietnam'],['th','Thailand'],['my','Malaysia'],['id','Indonesia'],['ph','Philippines'],['hk','Hong Kong'],['cn','China'],['in','India'],['au','Australia'],['nz','New Zealand'],['us','United States'],['ca','Canada'],['uk','United Kingdom'],['de','Germany'],['fr','France'],['nl','Netherlands'],['ch','Switzerland'],['se','Sweden'],['fi','Finland'],['dk','Denmark'],['no','Norway'],['es','Spain'],['it','Italy'],['br','Brazil'],['mx','Mexico'],['kr','Korea']
]);

const CURATED = [
  {
    company:'MarinaChain', domain:'marinachain.io', url:'https://www.marinachain.io/', country:'Singapore',
    participation:'official WSCE 2026 participant detail', confidence:99, evidence_tier:'A',
    source:{ title:'WSCE 2026 official participant detail — MarinaChain', url:'https://worldsmartcityexpo.com/board/bbs/board.php?bo_table=company_en&wr_id=9' },
    contact:{ email:'info@marinachain.io', name:'MarinaChain', title:'Business / Events', source:'https://www.marinachain.io/contact' }
  },
  {
    company:'African Smart Cities Innovation Foundation (ASCIF)', domain:'ascif.org', url:'https://ascif.org/', country:'Nigeria',
    participation:'Global Strategic Partner', confidence:99, evidence_tier:'A',
    source:{ title:'ASCIF named Global Strategic Partner of WSCE 2026', url:'https://ascif.blog/world-smart-city-expo-2026-ascif-named-global-partner-a-historic-opportunity-for-african-cities-to-shine-on-the-global-stage/' },
    contact:{ email:'info@ascif.org', name:'ASCIF Secretariat', title:'Secretariat / Partnerships', source:'https://www.ascif.org/contact.html' }
  },
  {
    company:'African Sunrise Alliance Investment (ASAI)', domain:'asa-investment.org', url:'https://asa-investment.org/', country:'Nigeria',
    participation:'company-owned 2026 event calendar', confidence:96, evidence_tier:'B',
    source:{ title:'ASAI Upcoming Events — World Smart City Expo 2026', url:'https://asa-investment.org/' }
  }
];

const SEARCH_QUERIES = [
  '"World Smart City Expo 2026" BEXCO Busan "upcoming events"',
  '"World Smart City Expo 2026" BEXCO Busan participating company',
  '"World Smart City Expo 2026" Busan exhibitor booth',
  '"WSCE 2026" Busan "see you"',
  '"WSCE 2026" Busan attending',
  '"WSCE 2026" Busan exhibiting',
  '"WSCE 2026" Busan delegation pavilion',
  '"World Smart City Expo 2026" Busan partner sponsor company',
  '"WSCE 2026" Busan Japan company',
  '"WSCE 2026" Busan Singapore company',
  '"WSCE 2026" Busan Europe company',
  '"WSCE 2026" Busan Africa company'
];

function timeLeft(reserve = 0) { return Date.now() - STARTED < REQUEST_BUDGET_MS - reserve; }
function key(value = '', env = '') { return clean(value || (env ? process.env[env] : ''), 5000); }
function toolKeys(body = {}) { return { tavily:key('', 'TAVILY_API_KEY'), jina:key(body?.tools?.jinaKey, 'JINA_API_KEY'), brave:key(body?.tools?.braveKey, 'BRAVE_SEARCH_API_KEY') || key('', 'BRAVE_API_KEY'), exa:key(body?.tools?.exaKey, 'EXA_API_KEY') }; }

async function fetchJson(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { const response = await fetch(url, { ...options, signal:controller.signal, cache:'no-store' }); if (!response.ok) return null; const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return null; } }
  catch { return null; } finally { clearTimeout(timer); }
}
function normalizeRow(raw = {}, source = '') { const url = clean(raw?.url || raw?.link, 700); if (!/^https?:\/\//i.test(url)) return null; return { title:clean(raw?.title || raw?.name, 300), url, text:clean(raw?.content || raw?.description || raw?.snippet || raw?.text, 7500), date:clean(raw?.published_date || raw?.publishedDate || raw?.date, 80), score:Number(raw?.score) || 0, source }; }
async function tavilySearch(q, apiKey) { if (!apiKey) return []; const data = await fetchJson('https://api.tavily.com/search', { method:'POST', headers:{ Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' }, body:JSON.stringify({ query:q, topic:'general', search_depth:'basic', max_results:20, include_answer:false, include_raw_content:false }) }, 8500); return (Array.isArray(data?.results) ? data.results : []).map(x => normalizeRow(x,'tavily')).filter(Boolean); }
async function jinaSearch(q, apiKey) { if (!apiKey) return []; const data = await fetchJson(`https://s.jina.ai/${encodeURIComponent(q)}`, { headers:{ Authorization:`Bearer ${apiKey}`, Accept:'application/json' } }, 8000); const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : []; return rows.map(x => normalizeRow(x,'jina')).filter(Boolean); }
async function braveSearch(q, apiKey) { if (!apiKey) return []; const params = new URLSearchParams({ q:clean(q,390), count:'20', safesearch:'moderate', freshness:'py' }); const data = await fetchJson(`https://api.search.brave.com/res/v1/web/search?${params}`, { headers:{ 'X-Subscription-Token':apiKey, Accept:'application/json' } }, 7500); return (Array.isArray(data?.web?.results) ? data.web.results : []).map((x,i)=>normalizeRow({ ...x, content:x.description || '', score:1-i/24 },'brave')).filter(Boolean); }
async function exaSearch(q, apiKey) { if (!apiKey) return []; const data = await fetchJson('https://api.exa.ai/search', { method:'POST', headers:{ 'x-api-key':apiKey, 'Content-Type':'application/json' }, body:JSON.stringify({ query:q, type:'fast', numResults:18, startPublishedDate:new Date(Date.now()-420*86400000).toISOString(), contents:{ highlights:true } }) }, 8500); return (Array.isArray(data?.results) ? data.results : []).map((x,i)=>normalizeRow({ ...x, content:Array.isArray(x.highlights) ? x.highlights.join(' ') : x.text, score:1-i/22 },'exa')).filter(Boolean); }
function dedupeRows(rows = []) { const map = new Map(); for (const row of rows) { if (!row?.url) continue; const k = row.url.replace(/^https?:\/\/(?:www\.)?/i,'').replace(/#.*$/,'').replace(/\/$/,'').toLowerCase(); const prev = map.get(k); if (!prev || row.text.length > prev.text.length || row.score > prev.score) map.set(k,row); } return [...map.values()]; }
async function multiSearch(t = {}) {
  const queries = SEARCH_QUERIES;
  const jobs = [publicWebSearchMany(queries, { maxResults:24, timeRange:'year', topic:'general' }).then(r => (r?.results || []).map(x=>normalizeRow(x,x.source || 'public-web')).filter(Boolean)).catch(()=>[])];
  if (t.tavily) jobs.push(Promise.all(queries.slice(0,6).map(q=>tavilySearch(q,t.tavily))).then(x=>x.flat()).catch(()=>[]));
  if (t.jina) jobs.push(Promise.all(queries.slice(0,4).map(q=>jinaSearch(q,t.jina))).then(x=>x.flat()).catch(()=>[]));
  if (t.brave) jobs.push(Promise.all(queries.slice(0,4).map(q=>braveSearch(q,t.brave))).then(x=>x.flat()).catch(()=>[]));
  if (t.exa) jobs.push(Promise.all(queries.slice(0,4).map(q=>exaSearch(q,t.exa))).then(x=>x.flat()).catch(()=>[]));
  const settled = await Promise.all(jobs); const counts = {}; for (const group of settled) for (const row of group) counts[row.source || 'web'] = (counts[row.source || 'web'] || 0) + 1;
  return { rows:dedupeRows(settled.flat()).slice(0,180), counts };
}

function externalLinks(page = {}) { const map = new Map(); for (const link of page?.links || []) { const domain = rootHost(link.url); if (!domain || domain === EVENT_DOMAIN || SOCIAL.test(domain)) continue; if (!map.has(domain)) map.set(domain,{ domain, url:`https://${domain}/`, page:null, text:clean(link.text,220) }); } return [...map.values()]; }
function detailCompany(page = {}) {
  const text = clean(page?.text, 20000); const beforeIntro = text.split(/Company Introduction/i)[0] || ''; const afterBooth = beforeIntro.split(/Booth Number/i).pop() || '';
  let value = clean(afterBooth, 600).replace(/^Image\s*/i,'').replace(/\s+(?:https?:\/\/|www\.)\S+.*$/i,'').replace(/\s+/g,' ').trim();
  if (value && value.length <= 170 && !BAD_NAME.test(value)) return value;
  for (const pattern of [/Booth Number\s+(?:Image\s+)?(.{2,170}?)\s+(?:https?:\/\/|www\.|Company Introduction)/i,/Image\s+(.{2,170}?)\s+(?:https?:\/\/|www\.)[a-z0-9.-]+/i]) { const candidate = clean(text.match(pattern)?.[1],170); if (candidate && !BAD_NAME.test(candidate)) return candidate; }
  const ext = externalLinks(page); if (ext.length === 1 && ext[0].text && !BAD_NAME.test(ext[0].text)) return clean(ext[0].text,170); return '';
}
function cctldCountry(domain = '') { const tld = rootHost(domain).split('.').pop() || ''; return CCTLD.get(tld) || ''; }
function inferOwnedCountry(text = '', domain = '') { const cc = cctldCountry(domain); if (cc) return cc; const value = clean(text,32000); for (const [country, pattern] of COUNTRY_PATTERNS) if (pattern.test(value)) return country; return ''; }
function koreanCountry(country = '') { return /^(?:South\s+)?Korea$|Republic\s+of\s+Korea/i.test(clean(country,80)); }
async function companyOwnedPages(website = {}) {
  const domain = rootHost(website.domain || website.url); if (!domain) return [];
  const home = website.page || await fetchPage(website.url || `https://${domain}/`, { timeoutMs:4500, maxBytes:260000 }); if (!home) return [];
  const links = (home.links || []).filter(l => rootHost(l.url) === domain && /(about|company|corporate|who-we-are|contact|location|imprint|legal|overview)/i.test(l.url)).map(l=>l.url);
  const urls = [...new Set([...links,`https://${domain}/about`,`https://${domain}/contact`])].filter(u=>u!==home.url).slice(0,3);
  const extra = (await mapLimit(urls,3,u=>fetchPage(u,{timeoutMs:3500,maxBytes:220000}))).filter(Boolean); return [home,...extra];
}
async function verifyForeign(company = '', website = null, countryHint = '') {
  const domain = rootHost(website?.domain || website?.url || ''); if (!domain || domain.endsWith('.kr')) return null;
  const pages = await companyOwnedPages(website); if (!pages.length) return null;
  const ownedText = clean(pages.map(p=>p.text).join(' '),32000);
  if (!textMatchesCompany(company, `${ownedText} ${domain}`) && !clean(company,120).toLowerCase().includes(domain.split('.')[0])) return null;
  if (KOREA_HQ.test(ownedText)) return null;
  let country = inferOwnedCountry(ownedText,domain) || clean(countryHint,80); if (koreanCountry(country)) return null;
  if (!country && timeLeft(12000)) {
    const result = await publicWebSearch(`"${clean(company,150)}" headquarters country`,{maxResults:8,timeRange:'year',topic:'general'}).catch(()=>({results:[]}));
    for (const row of result?.results || []) { const candidate = inferOwnedCountry(`${row.title || ''} ${row.content || ''}`, row.url || domain); if (candidate) { country = candidate; break; } }
  }
  if (!country || koreanCountry(country)) return null;
  if (KOREA.test(ownedText) && !COUNTRY_PATTERNS.some(([c,p]) => c === country && p.test(ownedText)) && !cctldCountry(domain)) return null;
  return { domain, url:`https://${domain}/`, country, pages };
}

function officialDetailUrl(id) { return `https://worldsmartcityexpo.com/board/bbs/board.php?bo_table=company_en&wr_id=${id}`; }
async function scanOfficialDetails() {
  const ids = Array.from({length:DETAIL_MAX},(_,i)=>i+1);
  const pages = await mapLimit(ids,32,async id => { if (!timeLeft(24000)) return null; const page = await fetchPage(officialDetailUrl(id),{timeoutMs:2800,maxBytes:350000}); if (!page) return null; const pageIdentity=clean(page.text,3000); if (!EVENT_EXACT.test(pageIdentity) || !BUSAN.test(pageIdentity) || /2025\.\s*7\.|2025\s*\.\s*7|2025\s*7\s*15/i.test(pageIdentity)) return null; const company = detailCompany(page); if (!company) return null; const ext = externalLinks(page); return { id, company, page, ext, url:officialDetailUrl(id) }; });
  return pages.filter(Boolean);
}
async function resolveOfficial(rows = [], excludes = new Set()) {
  const prioritized = [...rows].sort((a,b) => Number(b.ext.some(x=>!x.domain.endsWith('.kr'))) - Number(a.ext.some(x=>!x.domain.endsWith('.kr'))));
  const stats = { official_populated:rows.length, website_unresolved:0, rejected_korean:0, origin_unresolved:0, foreign:0 };
  const resolved = await mapLimit(prioritized.slice(0,100),10,async row => {
    if (!timeLeft(16000)) return null; let website = null; const nonSocial = row.ext.filter(x=>!SOCIAL.test(x.domain)); const matching = nonSocial.filter(x=>textMatchesCompany(row.company,`${x.text} ${x.domain}`));
    if (matching.length === 1) website = matching[0]; else if (nonSocial.length === 1) website = nonSocial[0];
    if (website?.domain?.endsWith('.kr')) { stats.rejected_korean++; return null; }
    if (!website) website = await resolveOfficialWebsite(row.company,'',row.page.links || [],excludes,[EVENT_DOMAIN]);
    if (!website) { stats.website_unresolved++; return null; }
    const domain = normalizeCompanyKey(website.domain); if (!domain || excludes.has(domain)) return null; if (domain.endsWith('.kr')) { stats.rejected_korean++; return null; }
    const foreign = await verifyForeign(row.company,website,''); if (!foreign) { stats.origin_unresolved++; return null; }
    stats.foreign++;
    return { company:row.company, domain:foreign.domain, url:foreign.url, country:foreign.country, participation:'official participant detail', confidence:99, evidence_tier:'A', source:{ title:'WSCE 2026 official participant detail', url:row.url } };
  });
  return { candidates:resolved.filter(Boolean), stats };
}

function currentEvidence(row = {}) { const text = clean(`${row.title} ${row.text} ${row.url}`,15000); if (!EVENT_EXACT.test(text) || !BUSAN.test(text)) return false; if (RECRUIT_ONLY.test(text) && !/(participating|exhibiting|attending|partner|sponsor|see\s+you|upcoming\s+events?|will\s+be)/i.test(text)) return false; return PARTICIPATION.test(text); }
function sourceCompanyName(row = {}) { const domain = rootHost(row.url); if (!domain || SOURCE_LIKE.test(domain)) return ''; let name = clean(row.title,180).replace(/\s*[|–—-]\s*(?:Home|Official|Website|Contact|About|News|Events?).*$/i,'').replace(/\s*[|–—-]\s*.*$/,'').trim(); if (!name || name.length < 2 || BAD_NAME.test(name)) name = domain.split('.')[0] || ''; return clean(name,170); }
async function aiWebCandidates(rows = []) {
  if (!rows.length || !aiConfigured() || !timeLeft(26000)) return [];
  const top = rows.slice(0,55);
  const prompt = `Extract named NON-KOREAN companies or organizations with direct current evidence that they will participate in World Smart City Expo 2026 at BEXCO, Busan, Sept 9-11 2026.\nAccept: official exhibitor/detail page, company-owned "upcoming events" exact WSCE 2026 listing, explicit exhibiting/attending/partner/sponsor/delegation/see-you-in-Busan statement.\nReject: application/recruitment notices, 2025 material, generic event promotion, Korean entities, the unrelated IEEE WSCE conference, and companies merely mentioned as examples.\nNever invent. JSON only: {"items":[{"row_id":"w0","company":"exact organization","country":"country or empty","participation":"short exact reason","confidence":92}]}\nOnly confidence >=88.\nROWS:\n${JSON.stringify(top.map((r,i)=>({row_id:`w${i}`,title:r.title,url:r.url,text:clean(r.text,4000),source:r.source})))}`;
  try { const result = await chatJson({prompt,maxTokens:3200,timeoutMs:20000,hardDeadlineMs:23000,temperature:0}); return (result?.data?.items || []).map(x=>({ row_id:clean(x.row_id,30),company:clean(x.company,170),country:clean(x.country,80),participation:clean(x.participation,100),confidence:Number(x.confidence)||0 })).filter(x=>x.company&&x.confidence>=88&&!BAD_NAME.test(x.company)); }
  catch { return []; }
}
async function resolveWeb(t = {}, excludes = new Set()) {
  const search = await multiSearch(t); const evidence = search.rows.filter(currentEvidence).slice(0,90);
  const deterministic = evidence.map((row,i)=>{ const company = sourceCompanyName(row); if (!company) return null; return { row_id:`w${i}`, company, country:'', participation:'company-owned WSCE 2026 event evidence', confidence:94 }; }).filter(Boolean);
  const ai = await aiWebCandidates(evidence); const byId = new Map(evidence.map((r,i)=>[`w${i}`,r])); const items = []; const seen = new Set();
  for (const item of [...deterministic,...ai].sort((a,b)=>b.confidence-a.confidence)) { const k = `${item.company.toLowerCase()}|${item.row_id}`; if (seen.has(k)) continue; seen.add(k); items.push(item); }
  const resolved = await mapLimit(items.slice(0,45),8,async item=>{
    if (!timeLeft(14000)) return null; const source = byId.get(item.row_id); if (!source) return null; const sourceDomain = rootHost(source.url); let website = null;
    if (sourceDomain && !SOURCE_LIKE.test(sourceDomain)) { const page = await fetchPage(source.url,{timeoutMs:3800,maxBytes:280000}); website = { domain:sourceDomain, url:`https://${sourceDomain}/`, page }; }
    if (!website) website = await resolveOfficialWebsite(item.company,item.country,[],excludes,[EVENT_DOMAIN]); if (!website) return null;
    const domain = normalizeCompanyKey(website.domain); if (!domain || excludes.has(domain) || domain.endsWith('.kr')) return null; const foreign = await verifyForeign(item.company,website,item.country); if (!foreign) return null;
    return { company:item.company,domain:foreign.domain,url:foreign.url,country:foreign.country,participation:item.participation || 'current participation evidence',confidence:item.confidence,evidence_tier:sourceDomain===foreign.domain?'B':'A',source:{title:source.title,url:source.url} };
  });
  return { candidates:resolved.filter(Boolean), meta:{ raw:search.rows.length,evidence:evidence.length,counts:search.counts } };
}

function sameDomain(email = '', domain = '') { const host = clean(email,260).toLowerCase().split('@')[1] || ''; const d = rootHost(domain); return Boolean(host && d && (host === d || host.endsWith(`.${d}`))); }
function extractEmails(text = '', domain = '') { const matches = String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []; const junk = /^(?:noreply|no-reply|donotreply|abuse|postmaster|webmaster|security|privacy|legal|support|help)$/i; return [...new Set(matches.map(x=>x.toLowerCase()))].filter(email=>sameDomain(email,domain)&&!junk.test(email.split('@')[0]||'')); }
function emailRank(email='') { const local=(email.split('@')[0]||'').toLowerCase(); if (/^(?:events?|partnerships?|partners?|business|bizdev|bd|sales|marketing|community|secretariat)$/.test(local)) return 100; if (!/^(?:info|hello|contact|office|team|admin)$/.test(local)) return 90; return 78; }
async function officialPublicContact(candidate = {}) {
  if (candidate.contact?.email && sameDomain(candidate.contact.email,candidate.domain)) return { name:clean(candidate.contact.name,120),title:clean(candidate.contact.title,160),email:candidate.contact.email.toLowerCase(),emailStatus:'valid',qualified:true,score:99,type:'generic',provider:'official-site-public',providers:['official-site-public'],sources:[candidate.contact.source || candidate.source?.url].filter(Boolean),official_public:true,verification:{status:'public-site',method:'official_site_public'} };
  const domain=rootHost(candidate.domain); if(!domain)return null; const home=await fetchPage(candidate.url || `https://${domain}/`,{timeoutMs:4000,maxBytes:300000}); if(!home)return null;
  const urls=[...new Set([home.url,...(home.links||[]).filter(l=>rootHost(l.url)===domain && /(contact|about|team|company|partnership|event|media)/i.test(l.url)).map(l=>l.url),`https://${domain}/contact`])].slice(0,5);
  const pages=[home,...(await mapLimit(urls.filter(u=>u!==home.url).slice(0,4),4,u=>fetchPage(u,{timeoutMs:3200,maxBytes:240000}))).filter(Boolean)]; const sourcesByEmail=new Map();
  for(const page of pages) for(const email of extractEmails(`${page.html||''} ${page.text||''}`,domain)) { if(!sourcesByEmail.has(email)) sourcesByEmail.set(email,[]); sourcesByEmail.get(email).push(page.url); }
  const ranked=[...sourcesByEmail.entries()].sort((a,b)=>emailRank(b[0])-emailRank(a[0]) || b[1].length-a[1].length); if(!ranked.length)return null; const [email,sources]=ranked[0];
  return { name:'',title:/secretariat/i.test(email)?'Secretariat':'Events / Partnerships',email,emailStatus:'valid',qualified:true,score:Math.max(82,emailRank(email)),type:'generic',provider:'official-site-public',providers:['official-site-public'],sources:[...new Set(sources)].slice(0,5),official_public:true,verification:{status:'public-site',method:'official_site_public'} };
}
function lead(candidate = {}, contact = null) {
  const company=clean(candidate.company,170),domain=rootHost(candidate.domain),country=clean(candidate.country,80);
  return { id:`wsce:${domain}`,campaign:'wsce',campaign_label:'WSCE 단체복',company,domain,url:candidate.url||`https://${domain}/`,source_url:clean(candidate.source?.url,700),source_title:clean(candidate.source?.title,300),signal:`WSCE 2026 ${candidate.participation || 'participation'} · ${country}`,evidence_tier:candidate.evidence_tier || 'A',quality_reasons:[`${candidate.evidence_tier || 'A'}등급 현재 WSCE 2026 근거`, contact?.official_public?'회사 공식사이트 공개 이메일':''].filter(Boolean),score:Math.max(88,Math.min(99,Number(candidate.confidence)||94)),sales_priority:Math.max(88,Math.min(99,Number(candidate.confidence)||94)),verified_company:true,wsce_confirmed:true,team_origin:'foreign',team_origin_country:country,outreach_language:'en',recommended_role:'Events / Partnerships',role_targets:['Events Lead','Event Marketing','Marketing Director','Partnerships Lead','Business Development Director','Operations Lead','Country Manager','Founder','CEO'],contact_score_threshold:75,contact,contacts:contact?[contact]:[],contact_status:contact?'found':'pending',subject:`Quick question about ${company} at WSCE 2026`,message_en:`Hi,\n\nI saw that ${company} is participating in World Smart City Expo 2026 in Busan. Quick question — have you already sorted team shirts or staff wear for the Korea trip?\n\nWe produce branded apparel locally in Korea and can deliver directly to your hotel, office or BEXCO, so your team does not need to ship boxes internationally or coordinate production after arrival.\n\nIf it is still open, I can send a few options with pricing and turnaround.`,message_ko:'' };
}

export async function POST(request) {
  STARTED=Date.now(); let body={}; try { body=await request.json(); } catch { return Response.json({error:'요청 형식이 잘못됐습니다.'},{status:400}); }
  const cycle=Math.max(1,Number.parseInt(body.cycle,10)||1), t=toolKeys(body), history=await buildGlobalExclusions(Array.isArray(body.excludeDomains)?body.excludeDomains:[]);
  try {
    const [officialRows,web] = await Promise.all([scanOfficialDetails(),resolveWeb(t,history.set).catch(()=>({candidates:[],meta:{raw:0,evidence:0,counts:{}}}))]);
    const official=await resolveOfficial(officialRows,history.set); const byDomain=new Map();
    for(const candidate of [...CURATED,...official.candidates,...web.candidates].sort((a,b)=>(b.confidence||0)-(a.confidence||0))) { const domain=normalizeCompanyKey(candidate.domain || candidate.url); if(!domain || domain.endsWith('.kr') || history.set.has(domain) || byDomain.has(domain)) continue; byDomain.set(domain,{...candidate,domain}); if(byDomain.size>=50) break; }
    const candidates=[...byDomain.values()], contactMap=new Map(), contactTargets=candidates.slice(0,24); const contacts=await mapLimit(contactTargets,6,c=>officialPublicContact(c).catch(()=>null));
    contactTargets.forEach((c,i)=>{if(contacts[i])contactMap.set(normalizeCompanyKey(c.domain),contacts[i]);});
    const provisional=candidates.slice(0,40).map(c=>lead(c,contactMap.get(normalizeCompanyKey(c.domain))||null)); const exact=await suppressExactSent(provisional,history.secret);
    return Response.json({campaign:'wsce',campaign_label:'WSCE 단체복',leads:exact.leads,meta:{event:EVENT,cycle,official_source:'direct numeric probe of current WSCE 2026 participant detail pages',official_list_pages_loaded:0,official_detail_links_total:DETAIL_MAX,official_detail_batch_rows:DETAIL_MAX,official_detail_batch_slot:1,official_detail_batch_slots:1,official_detail_rows:official.stats.official_populated||0,official_named_rows:official.stats.official_populated||0,official_direct_websites:officialRows.filter(r=>r.ext?.length).length,official_nonkr_direct_websites:officialRows.filter(r=>r.ext?.some(x=>!x.domain.endsWith('.kr'))).length,official_website_unresolved:official.stats.website_unresolved||0,official_rejected_korean:official.stats.rejected_korean||0,official_origin_unresolved:official.stats.origin_unresolved||0,official_foreign_candidates:official.candidates.length,curated_live_candidates:CURATED.length,fallback_rows:web.meta?.evidence||0,fallback_foreign_candidates:web.candidates.length,fallback_search_sources:web.meta?.counts||{},public_email_contacts:contactMap.size,returned:exact.leads.length,sent_preexcluded:history.sent.length,deleted_preexcluded:history.deleted.length,sent_exact_suppressed:exact.suppressed,search_stack:{numeric_official_detail_probe:true,public_web_no_key:true,tavily:Boolean(t.tavily),jina:Boolean(t.jina),brave:Boolean(t.brave),exa:Boolean(t.exa)},participant_gate:'current WSCE 2026 official participant detail OR company-owned/partner direct 2026 BEXCO Busan evidence',email_gate:'same-domain email published on participant-owned official website; other leads continue through contact-discovery-v2',note:'official list index can be empty while populated participant detail pages still exist, so numeric detail probing is used',elapsed_ms:Date.now()-STARTED}},{headers:{'Cache-Control':'no-store'}});
  } catch(error) { return Response.json({error:clean(error?.message||error,500)||'WSCE 후보 검색에 실패했습니다.',cycle},{status:Number(error?.status)||502,headers:{'Cache-Control':'no-store'}}); }
}
