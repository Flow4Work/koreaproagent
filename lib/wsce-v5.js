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
  stripHtml,
  suppressExactSent,
  textMatchesCompany
} from './international-event-campaign.js';

const EVENT = { name:'World Smart City Expo 2026', short:'WSCE 2026', dates:'2026-09-09–2026-09-11', venue:'BEXCO, Busan' };
const EVENT_DOMAIN = 'worldsmartcityexpo.com';
const LIST_URL = 'https://worldsmartcityexpo.com/board/bbs/board.php?bo_table=company_en';
const LIST_PAGES = Array.from({ length:14 }, (_, i) => `${LIST_URL}&page=${i + 1}`);
const DETAIL_BATCH_SIZE = 84;
const REQUEST_BUDGET_MS = 104000;
let REQUEST_STARTED = Date.now();

const BAD_NAME = /(?:World Smart City Expo|\bWSCE\b|List of Participating Companies|Participating Companies|Smart City Expo|BEXCO|Booth Number|Company Introduction|Main Products|Hosted by|Organized by|Exhibit Application|Exhibitor Benefits|Sponsorship|^Image$|^List$|^수정$|^Home$|^For Exhibitors$)/i;
const BLOCKED_SITE = /(?:worldsmartcityexpo\.com|facebook\.com|instagram\.com|youtube\.com|linkedin\.com|x\.com|twitter\.com|wikipedia\.org|10times\.|eventbrite\.|medium\.com)/i;
const SOURCE_LIKE = /(?:worldsmartcityexpo\.com|news|press|media|blog|event|expo|conference|directory|linkedin\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|youtube\.com|wikipedia\.org|10times\.)/i;
const FULL_EVENT = /World\s+Smart\s+City\s+Expo/i;
const SHORT_EVENT = /\bWSCE\s*2026\b/i;
const BUSAN = /\bBusan\b|\bBEXCO\b|부산|벡스코/i;
const YEAR_2026 = /\b2026\b|2026年|2026년/i;
const PARTICIPATION = /(exhibitor|exhibiting|participat(?:e|es|ed|ing|ion)|booth|stand\s*(?:no\.?|#)?|pavilion|delegation|attend(?:s|ed|ing)|join(?:s|ed|ing)|speaker|speaking|partner|sponsor|meet\s+us|see\s+you|showcas(?:e|ing)|buyer|business\s+meeting|출전|참가|전시|부스|연사|파트너|스폰서|바이어|出展|参加|參展|参展)/i;
const RECRUITMENT_ONLY = /(call\s+for|recruit|recruitment|apply\s+now|application\s+deadline|registration\s+open|모집|신청\s*안내|공모|募集|応募|招募|报名|報名)/i;
const KOREAN_NAME = /(?:\bKorea\b|코리아|한국(?:지사|법인|오피스|사무소)?)/i;
const KOREA_HQ = /(?:head(?:quarters?|\s*office)|principal\s+office|registered\s+office|based)\s*(?:is\s*)?(?:in|at|:)?\s*(?:Seoul|Busan|South\s+Korea|Republic\s+of\s+Korea|Korea)|(?:Seoul|Busan|South\s+Korea|Republic\s+of\s+Korea)\s*(?:head(?:quarters?|\s*office)|registered\s+office)/i;

const COUNTRY = [
  ['United Arab Emirates', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}(?:United Arab Emirates|\bUAE\b|Dubai|Abu Dhabi)|(?:UAE|Dubai|Abu Dhabi)[^.!?]{0,70}(?:based|headquarters)/i],
  ['Singapore', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Singapore|Singapore[^.!?]{0,70}(?:based|headquarters)/i],
  ['Japan', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Japan|Japan[^.!?]{0,70}(?:based|headquarters)|日本[^。]{0,50}(?:本社|拠点)/i],
  ['Taiwan', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Taiwan|Taiwan[^.!?]{0,70}(?:based|headquarters)/i],
  ['Vietnam', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Vietnam|Vietnam[^.!?]{0,70}(?:based|headquarters)/i],
  ['Thailand', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Thailand|Thailand[^.!?]{0,70}(?:based|headquarters)/i],
  ['Malaysia', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Malaysia|Malaysia[^.!?]{0,70}(?:based|headquarters)/i],
  ['Indonesia', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Indonesia|Indonesia[^.!?]{0,70}(?:based|headquarters)/i],
  ['Philippines', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Philippines|Philippines[^.!?]{0,70}(?:based|headquarters)/i],
  ['Hong Kong', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Hong\s*Kong|Hong\s*Kong[^.!?]{0,70}(?:based|headquarters)/i],
  ['China', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}China|China[^.!?]{0,70}(?:based|headquarters)/i],
  ['India', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}India|India[^.!?]{0,70}(?:based|headquarters)/i],
  ['Australia', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Australia|Australia[^.!?]{0,70}(?:based|headquarters)/i],
  ['United States', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}(?:United States|\bUSA\b|California|New York|Texas)|(?:United States|USA)[^.!?]{0,70}(?:based|headquarters)/i],
  ['Canada', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Canada|Canada[^.!?]{0,70}(?:based|headquarters)/i],
  ['United Kingdom', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}(?:United Kingdom|\bUK\b|London)|(?:United Kingdom|UK)[^.!?]{0,70}(?:based|headquarters)/i],
  ['Germany', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Germany|Germany[^.!?]{0,70}(?:based|headquarters)/i],
  ['France', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}France|France[^.!?]{0,70}(?:based|headquarters)/i],
  ['Netherlands', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Netherlands|Netherlands[^.!?]{0,70}(?:based|headquarters)/i],
  ['Switzerland', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Switzerland|Switzerland[^.!?]{0,70}(?:based|headquarters)/i],
  ['Sweden', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Sweden|Sweden[^.!?]{0,70}(?:based|headquarters)/i],
  ['Finland', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Finland|Finland[^.!?]{0,70}(?:based|headquarters)/i],
  ['Denmark', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Denmark|Denmark[^.!?]{0,70}(?:based|headquarters)/i],
  ['Norway', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Norway|Norway[^.!?]{0,70}(?:based|headquarters)/i],
  ['Spain', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Spain|Spain[^.!?]{0,70}(?:based|headquarters)/i],
  ['Italy', /(?:headquartered|headquarters|based|registered office|principal office)[^.!?]{0,90}Italy|Italy[^.!?]{0,70}(?:based|headquarters)/i]
];
const CCTLD = new Map([
  ['ae','United Arab Emirates'],['sg','Singapore'],['jp','Japan'],['tw','Taiwan'],['vn','Vietnam'],['th','Thailand'],['my','Malaysia'],['id','Indonesia'],['ph','Philippines'],['hk','Hong Kong'],['cn','China'],['in','India'],['au','Australia'],['nz','New Zealand'],['us','United States'],['ca','Canada'],['uk','United Kingdom'],['de','Germany'],['fr','France'],['nl','Netherlands'],['ch','Switzerland'],['se','Sweden'],['fi','Finland'],['dk','Denmark'],['no','Norway'],['es','Spain'],['it','Italy'],['br','Brazil'],['mx','Mexico']
]);

const SEARCH_BATCHES = [
  ['"World Smart City Expo 2026" Busan exhibitor company','"WSCE 2026" Busan booth exhibitor','"WSCE 2026" BEXCO "meet us" company','"WSCE 2026" Busan participating company'],
  ['"WSCE 2026" Busan 出展 企業','"WSCE 2026" 부산 참가 해외 기업','"WSCE 2026" BEXCO 參展 公司','"World Smart City Expo 2026" Japan Singapore company'],
  ['"World Smart City Expo 2026" Busan pavilion delegation','"WSCE 2026" Busan speaker partner sponsor','"WSCE 2026" overseas buyer Busan','"World Smart City Expo 2026" international delegation'],
  ['"WSCE 2026" "see you" Busan','"WSCE 2026" "attending" Busan','"WSCE 2026" "exhibiting" Busan','"World Smart City Expo 2026" company announcement']
];

function timeLeft(reserve = 0) { return Date.now() - REQUEST_STARTED < REQUEST_BUDGET_MS - reserve; }
function toolKey(value = '', env = '') { return clean(value || (env ? process.env[env] : ''), 5000); }
function tools(body = {}) {
  return {
    tavily:toolKey('', 'TAVILY_API_KEY'),
    jina:toolKey(body?.tools?.jinaKey, 'JINA_API_KEY'),
    brave:toolKey(body?.tools?.braveKey, 'BRAVE_SEARCH_API_KEY') || toolKey('', 'BRAVE_API_KEY'),
    exa:toolKey(body?.tools?.exaKey, 'EXA_API_KEY')
  };
}

async function fetchJson(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal:controller.signal, cache:'no-store' });
    if (!response.ok) return null;
    const text = await response.text();
    try { return text ? JSON.parse(text) : {}; } catch { return null; }
  } catch { return null; }
  finally { clearTimeout(timer); }
}

function normalizeRow(raw = {}, source = '') {
  const url = clean(raw?.url || raw?.link, 700);
  if (!/^https?:\/\//i.test(url)) return null;
  return { title:clean(raw?.title || raw?.name, 280), url, text:clean(raw?.content || raw?.description || raw?.snippet || raw?.text, 7000), date:clean(raw?.published_date || raw?.publishedDate || raw?.date, 80), score:Number(raw?.score) || 0, source };
}

async function tavilySearch(q, key) {
  if (!key) return [];
  const data = await fetchJson('https://api.tavily.com/search', { method:'POST', headers:{ Authorization:`Bearer ${key}`, 'Content-Type':'application/json' }, body:JSON.stringify({ query:q, topic:'general', search_depth:'basic', max_results:18, include_answer:false, include_raw_content:false }) }, 8500);
  return (Array.isArray(data?.results) ? data.results : []).map(x => normalizeRow(x,'tavily')).filter(Boolean);
}
async function jinaSearch(q, key) {
  if (!key) return [];
  const data = await fetchJson(`https://s.jina.ai/${encodeURIComponent(q)}`, { headers:{ Authorization:`Bearer ${key}`, Accept:'application/json' } }, 8000);
  const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
  return rows.map(x => normalizeRow(x,'jina')).filter(Boolean);
}
async function braveSearch(q, key) {
  if (!key) return [];
  const params = new URLSearchParams({ q:clean(q,390), count:'18', safesearch:'moderate', freshness:'py' });
  const data = await fetchJson(`https://api.search.brave.com/res/v1/web/search?${params}`, { headers:{ 'X-Subscription-Token':key, Accept:'application/json' } }, 7500);
  return (Array.isArray(data?.web?.results) ? data.web.results : []).map((x,i)=>normalizeRow({ ...x, content:x.description || '', score:1-i/22 },'brave')).filter(Boolean);
}
async function exaSearch(q, key) {
  if (!key) return [];
  const data = await fetchJson('https://api.exa.ai/search', { method:'POST', headers:{ 'x-api-key':key, 'Content-Type':'application/json' }, body:JSON.stringify({ query:q, type:'fast', numResults:14, startPublishedDate:new Date(Date.now()-420*86400000).toISOString(), contents:{ highlights:true } }) }, 8500);
  return (Array.isArray(data?.results) ? data.results : []).map((x,i)=>normalizeRow({ ...x, content:Array.isArray(x.highlights) ? x.highlights.join(' ') : x.text, score:1-i/18 },'exa')).filter(Boolean);
}

function dedupeRows(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (!row?.url) continue;
    const key = row.url.replace(/^https?:\/\/(?:www\.)?/i,'').replace(/#.*$/,'').replace(/\/$/,'').toLowerCase();
    const prev = map.get(key);
    if (!prev || row.text.length > prev.text.length || row.score > prev.score) map.set(key,row);
  }
  return [...map.values()];
}

async function multiSearch(queries = [], t = {}) {
  const qs = [...new Set(queries.map(x=>clean(x,430)).filter(Boolean))].slice(0,4);
  const jobs = [publicWebSearchMany(qs, { maxResults:20, timeRange:'year', topic:'general' }).then(r => (r?.results || []).map(x=>normalizeRow(x,x.source || 'public-web')).filter(Boolean)).catch(()=>[])];
  if (t.tavily) jobs.push(Promise.all(qs.slice(0,3).map(q=>tavilySearch(q,t.tavily))).then(x=>x.flat()).catch(()=>[]));
  if (t.jina) jobs.push(Promise.all(qs.slice(0,2).map(q=>jinaSearch(q,t.jina))).then(x=>x.flat()).catch(()=>[]));
  if (t.brave) jobs.push(Promise.all(qs.slice(0,2).map(q=>braveSearch(q,t.brave))).then(x=>x.flat()).catch(()=>[]));
  if (t.exa) jobs.push(Promise.all(qs.slice(0,2).map(q=>exaSearch(q,t.exa))).then(x=>x.flat()).catch(()=>[]));
  const groups = await Promise.all(jobs);
  const rows = dedupeRows(groups.flat()).sort((a,b)=>b.score-a.score).slice(0,110);
  const counts = rows.reduce((acc,row)=>{ acc[row.source || 'unknown']=(acc[row.source || 'unknown']||0)+1; return acc; },{});
  return { rows, counts };
}

function attrValues(html = '', attr = 'alt') {
  const out=[]; const re=new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`,'gi'); let m;
  while((m=re.exec(String(html)))) { const v=clean(stripHtml(m[1],220),180); if(v) out.push(v); }
  return out;
}
function safeName(value = '') {
  return clean(value,180).replace(/\s*[|–—-]\s*(?:WSCE|World Smart City Expo).*$/i,'').trim();
}
function detail(url = '', hint = '', source = 'official-list') {
  let u; try { u=new URL(String(url).replace(/&amp;/gi,'&'), LIST_URL); } catch { return null; }
  if (rootHost(u.href)!==EVENT_DOMAIN || u.searchParams.get('bo_table')!=='company_en') return null;
  const id=u.searchParams.get('wr_id') || ''; if(!/^\d+$/.test(id)) return null;
  return { id, url:`https://worldsmartcityexpo.com/board/bbs/board.php?bo_table=company_en&wr_id=${id}`, hint:safeName(hint), source };
}
function detailsFromPage(page = {}) {
  const out=[];
  for(const link of page?.links || []) { const d=detail(link.url,link.text); if(d) out.push(d); }
  const html=String(page?.html || ''); const re=/<a\b[^>]*href\s*=\s*["']([^"']*bo_table=company_en[^"']*wr_id=\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi; let m;
  while((m=re.exec(html))) {
    const body=m[2] || ''; const hint=stripHtml(body,180) || attrValues(body,'alt')[0] || attrValues(body,'title')[0] || '';
    const d=detail(m[1],hint); if(d) out.push(d);
  }
  const map=new Map(); for(const d of out){ const p=map.get(d.id); if(!p || (!p.hint&&d.hint)) map.set(d.id,d); }
  return [...map.values()];
}
function selectCycleBatch(items = [], cycle = 1, size = DETAIL_BATCH_SIZE) {
  if (items.length <= size) return { items, slot:1, slots:1 };
  const slots=Math.ceil(items.length/size); const slot=((Math.max(1,cycle)-1)%slots);
  return { items:items.filter((_,i)=>i%slots===slot), slot:slot+1, slots };
}

function externalLinks(page = {}) {
  const map=new Map();
  for(const link of page?.links || []) {
    const domain=rootHost(link.url); if(!domain || domain===EVENT_DOMAIN || BLOCKED_SITE.test(domain)) continue;
    if(!map.has(domain)) map.set(domain,{ domain, url:`https://${domain}/`, linkText:clean(link.text,220) });
  }
  return [...map.values()];
}
function namesFromPage(page = {}, hint = '') {
  const html=String(page?.html || ''), text=clean(page?.text,18000), values=[];
  if(hint) values.push(hint);
  const segment=html.match(/Booth\s*Number[\s\S]{0,18000}?Company\s*Introduction/i)?.[0] || '';
  values.push(...attrValues(segment,'alt'),...attrValues(segment,'title'));
  for(const m of segment.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)) values.push(stripHtml(m[1],180));
  for(const p of [/Image\s+(.{2,180}?)\s+(?:https?:\/\/|www\.|Company Introduction)/i,/Booth Number\s+(?:[^\s]{1,20}\s+)?Image\s+(.{2,180}?)\s+Company Introduction/i]) {
    const v=clean(text.match(p)?.[1],180); if(v) values.push(v);
  }
  const ext=externalLinks(page);
  for(const x of ext) if(x.linkText) values.push(x.linkText);
  return [...new Set(values.map(safeName).filter(v=>v.length>=2&&v.length<=150&&!BAD_NAME.test(v)))];
}
function chooseName(page, hint='') {
  const names=namesFromPage(page,hint); if(!names.length) return '';
  const ext=externalLinks(page);
  const matched=names.find(name=>ext.some(x=>textMatchesCompany(name,`${x.linkText} ${x.domain}`)));
  return matched || names[0];
}
function chooseDirectWebsite(company='', page={}) {
  const ext=externalLinks(page);
  const matched=ext.filter(x=>textMatchesCompany(company,`${x.linkText} ${x.domain}`));
  if(matched.length===1) return matched[0];
  const nonKr=ext.filter(x=>!x.domain.endsWith('.kr'));
  if(nonKr.length===1) return nonKr[0];
  if(ext.length===1) return ext[0];
  return null;
}

function cctldCountry(domain='') { const tld=rootHost(domain).split('.').pop() || ''; return CCTLD.get(tld) || ''; }
function countryFromOwned(text='', domain='') {
  const cc=cctldCountry(domain); if(cc) return cc;
  const value=clean(text,30000); for(const [country,pattern] of COUNTRY) if(pattern.test(value)) return country;
  return '';
}
async function ownedPages(website={}) {
  const domain=rootHost(website.domain || website.url); if(!domain) return [];
  const home=website.page || await fetchPage(website.url || `https://${domain}/`,{timeoutMs:5000,maxBytes:260000}); if(!home) return [];
  const candidates=(home.links || []).filter(l=>rootHost(l.url)===domain && /(about|company|corporate|who-we-are|contact|location|imprint|legal|overview)/i.test(new URL(l.url).pathname)).map(l=>l.url);
  const common=[`https://${domain}/about`,`https://${domain}/company`,`https://${domain}/contact`];
  const urls=[...new Set([...candidates,...common])].filter(u=>u!==home.url).slice(0,3);
  const extra=(await mapLimit(urls,3,u=>fetchPage(u,{timeoutMs:4000,maxBytes:220000}))).filter(Boolean);
  return [home,...extra];
}
async function verifyForeign(company='', website=null, countryHint='') {
  const domain=rootHost(website?.domain || website?.url || '');
  if(!domain || domain.endsWith('.kr') || KOREAN_NAME.test(company)) return { ok:false, reason:'korean_or_kr_domain' };
  const cc=cctldCountry(domain);
  if(cc) {
    const home=website?.page || await fetchPage(website?.url || `https://${domain}/`,{timeoutMs:4800,maxBytes:260000});
    if(!home) return { ok:false, reason:'company_site_unreadable' };
    if(!textMatchesCompany(company,`${home.text} ${domain}`)) return { ok:false, reason:'company_site_name_mismatch' };
    return { ok:true, country:cc, domain, url:`https://${domain}/` };
  }
  const pages=await ownedPages(website); if(!pages.length) return { ok:false, reason:'company_site_unreadable' };
  const text=clean(pages.map(p=>p.text).join(' '),32000);
  if(!textMatchesCompany(company,`${text} ${domain}`)) return { ok:false, reason:'company_site_name_mismatch' };
  if(KOREA_HQ.test(text)) return { ok:false, reason:'korea_headquarters' };
  let country=countryFromOwned(text,domain) || clean(countryHint,80);
  if(!country && timeLeft(10000)) {
    const q=`site:${domain} "${clean(company,120)}" headquarters OR "based in" OR "registered office"`;
    const result=await publicWebSearch(q,{maxResults:8,timeRange:'year',topic:'general'}).catch(()=>({results:[]}));
    const owned=(result?.results || []).filter(r=>rootHost(r.url)===domain).map(r=>`${r.title || ''} ${r.content || ''}`).join(' ');
    if(KOREA_HQ.test(owned)) return { ok:false, reason:'korea_headquarters' };
    country=countryFromOwned(owned,domain);
  }
  if(!country || /Korea/i.test(country)) return { ok:false, reason:'origin_unresolved' };
  return { ok:true, country, domain, url:`https://${domain}/` };
}

async function officialCandidates(cycle, t, excludes) {
  const pages=(await mapLimit(LIST_PAGES,7,u=>fetchPage(u,{timeoutMs:5200,maxBytes:680000}))).filter(Boolean);
  const allMap=new Map();
  for(const p of pages) for(const d of detailsFromPage(p)){ const prev=allMap.get(d.id); if(!prev || (!prev.hint&&d.hint)) allMap.set(d.id,d); }
  const all=[...allMap.values()]; const batch=selectCycleBatch(all,cycle);
  const details=(await mapLimit(batch.items,14,async d=>{ const p=await fetchPage(d.url,{timeoutMs:4600,maxBytes:620000}); if(!p)return null; const company=chooseName(p,d.hint); return company?{...d,page:p,company,direct:chooseDirectWebsite(company,p)}:null; })).filter(Boolean);
  details.sort((a,b)=>Number(Boolean(b.direct && !b.direct.domain.endsWith('.kr')))-Number(Boolean(a.direct && !a.direct.domain.endsWith('.kr'))));
  const stats={ website_unresolved:0,korean:0,origin_unresolved:0,foreign:0,direct_websites:details.filter(x=>x.direct).length,nonkr_direct:details.filter(x=>x.direct&&!x.direct.domain.endsWith('.kr')).length };
  const resolved=(await mapLimit(details.slice(0,44),7,async row=>{
    if(!timeLeft(12000)) return null;
    let website=row.direct;
    if(website?.domain?.endsWith('.kr')) { stats.korean+=1; return null; }
    if(!website) website=await resolveOfficialWebsite(row.company,'',row.page.links||[],excludes,[EVENT_DOMAIN]);
    if(!website){stats.website_unresolved+=1;return null;}
    const domain=normalizeCompanyKey(website.domain); if(!domain || excludes.has(domain)) return null;
    const foreign=await verifyForeign(row.company,website,'');
    if(!foreign.ok){ if(foreign.reason==='korean_or_kr_domain'||foreign.reason==='korea_headquarters')stats.korean+=1; else stats.origin_unresolved+=1; return null; }
    stats.foreign+=1;
    return { company:row.company,country:foreign.country,domain:foreign.domain,url:foreign.url,participation:'official exhibitor list',confidence:96,source:{title:'WSCE 2026 List of Participating Companies',url:row.url} };
  })).filter(Boolean);
  return { candidates:resolved, meta:{ list_pages:pages.length,detail_links_total:all.length,batch_rows:batch.items.length,batch_slot:batch.slot,batch_slots:batch.slots,detail_rows:details.length,named_rows:details.length,...stats } };
}

function validWebEvidence(row={}) {
  const text=clean(`${row.title} ${row.text} ${row.url}`,12000);
  const event=((FULL_EVENT.test(text)&&YEAR_2026.test(text)) || (SHORT_EVENT.test(text)&&BUSAN.test(text)));
  if(!event || !PARTICIPATION.test(text)) return false;
  if(RECRUITMENT_ONLY.test(text) && !/(confirmed|participating|exhibiting|attending|speaker|sponsor|partner|booth|pavilion|delegation)/i.test(text)) return false;
  return true;
}
async function aiFallback(rows=[]) {
  if(!rows.length || !aiConfigured() || !timeLeft(22000)) return [];
  const top=rows.slice(0,34);
  const prompt=`Extract NAMED non-Korean companies or organizations with direct CURRENT participation evidence for World Smart City Expo 2026 at BEXCO in Busan. Accept exhibitor, booth, attendance, speaker, sponsor/partner, pavilion, overseas delegation or buyer/business-meeting participation. Reject application/recruitment notices, 2025 material, generic event pages, Korean entities, and the unrelated IEEE conference also abbreviated WSCE. Never invent. JSON only: {"items":[{"row_id":"w0","company":"exact name","country":"country or empty","participation":"exhibitor|booth|attendance|speaker|sponsor|partner|pavilion|delegation|buyer","confidence":90}]}. Use confidence >=86.\nROWS:\n${JSON.stringify(top.map((r,i)=>({row_id:`w${i}`,title:r.title,url:r.url,text:clean(r.text,3800),date:r.date,source:r.source})))}`;
  try{ const res=await chatJson({prompt,maxTokens:2600,timeoutMs:18000,hardDeadlineMs:20500,temperature:0}); return (res?.data?.items||[]).map(x=>({row_id:clean(x.row_id,30),company:clean(x.company,170),country:clean(x.country,80),participation:clean(x.participation,80),confidence:Number(x.confidence)||0})).filter(x=>x.company&&x.confidence>=86&&!BAD_NAME.test(x.company)); }catch{return[];}
}
async function fallbackCandidates(cycle,t,excludes) {
  const batch=SEARCH_BATCHES[(Math.max(1,cycle)-1)%SEARCH_BATCHES.length];
  const search=await multiSearch(batch,t); const rows=search.rows.filter(validWebEvidence).slice(0,50);
  const ai=await aiFallback(rows); const byId=new Map(rows.map((r,i)=>[`w${i}`,r]));
  const resolved=(await mapLimit(ai.slice(0,18),6,async item=>{
    if(!timeLeft(9000))return null; const source=byId.get(item.row_id); if(!source)return null;
    let website=null; const sourceDomain=rootHost(source.url);
    if(sourceDomain && !SOURCE_LIKE.test(sourceDomain) && textMatchesCompany(item.company,`${source.title} ${source.text} ${sourceDomain}`)) website={domain:sourceDomain,url:`https://${sourceDomain}/`,page:await fetchPage(source.url,{timeoutMs:4200,maxBytes:240000})};
    if(!website) website=await resolveOfficialWebsite(item.company,item.country,[],excludes,[EVENT_DOMAIN]);
    if(!website)return null; const domain=normalizeCompanyKey(website.domain); if(!domain||excludes.has(domain))return null;
    const foreign=await verifyForeign(item.company,website,item.country); if(!foreign.ok)return null;
    return { company:item.company,country:foreign.country,domain:foreign.domain,url:foreign.url,participation:item.participation||'participation',confidence:item.confidence,source:{title:source.title,url:source.url} };
  })).filter(Boolean);
  return { candidates:resolved, meta:{ raw_rows:search.rows.length,current_evidence_rows:rows.length,search_sources:search.counts,foreign:resolved.length,query_lane:(Math.max(1,cycle)-1)%SEARCH_BATCHES.length+1,query_lanes:SEARCH_BATCHES.length } };
}

function lead(c={}) {
  const company=clean(c.company,170),domain=rootHost(c.domain),country=clean(c.country,80);
  return { id:`wsce:${domain}`,campaign:'wsce',campaign_label:'WSCE 단체복',company,domain,url:c.url||`https://${domain}/`,source_url:clean(c.source?.url,700),source_title:clean(c.source?.title,280),signal:`WSCE 2026 ${c.participation||'participation'} · ${country}`,score:Math.max(86,Math.min(99,Number(c.confidence)||92)),sales_priority:Math.max(86,Math.min(99,Number(c.confidence)||92)),verified_company:true,wsce_confirmed:true,team_origin:'foreign',team_origin_country:country,outreach_language:'en',recommended_role:'Events Lead',role_targets:['Events Lead','Event Marketing','Marketing Director','Partnerships Lead','Business Development Director','Operations Lead','Country Manager','Founder','CEO'],contact_score_threshold:75,subject:'Quick question about WSCE 2026 in Busan',message_en:`Hi,\n\nI saw that ${company} is participating in WSCE 2026 in Busan. Quick question — have you already sorted team shirts or staff wear for your Korea trip?\n\nWe produce branded apparel locally in Korea and can deliver directly to your hotel, office or BEXCO, so your team does not need to ship boxes internationally or coordinate production after arrival.\n\nIf it is still open, I can send a few options with pricing and turnaround.`,message_ko:'',contact:null,contacts:[],contact_status:'pending' };
}

export async function POST(request) {
  REQUEST_STARTED=Date.now(); let body={}; try{body=await request.json();}catch{return Response.json({error:'요청 형식이 잘못됐습니다.'},{status:400});}
  const cycle=Math.max(1,Number.parseInt(body.cycle,10)||1), t=tools(body), history=await buildGlobalExclusions(Array.isArray(body.excludeDomains)?body.excludeDomains:[]);
  try{
    const fallbackPromise=fallbackCandidates(cycle,t,history.set).catch(()=>({candidates:[],meta:{}}));
    const official=await officialCandidates(cycle,t,history.set);
    const fallback=await fallbackPromise;
    const byDomain=new Map();
    for(const c of [...official.candidates,...fallback.candidates].sort((a,b)=>(b.confidence||0)-(a.confidence||0))){ const d=normalizeCompanyKey(c.domain); if(!d||history.set.has(d)||byDomain.has(d))continue; byDomain.set(d,lead(c)); if(byDomain.size>=40)break; }
    const exact=await suppressExactSent([...byDomain.values()],history.secret);
    return Response.json({campaign:'wsce',campaign_label:'WSCE 단체복',leads:exact.leads,meta:{event:EVENT,cycle,official_source:LIST_URL,official_list_pages_loaded:official.meta.list_pages||0,official_detail_links_total:official.meta.detail_links_total||0,official_detail_batch_rows:official.meta.batch_rows||0,official_detail_batch_slot:official.meta.batch_slot||1,official_detail_batch_slots:official.meta.batch_slots||1,official_detail_rows:official.meta.detail_rows||0,official_named_rows:official.meta.named_rows||0,official_direct_websites:official.meta.direct_websites||0,official_nonkr_direct_websites:official.meta.nonkr_direct||0,official_website_unresolved:official.meta.website_unresolved||0,official_rejected_korean:official.meta.korean||0,official_origin_unresolved:official.meta.origin_unresolved||0,official_foreign_candidates:official.candidates.length,fallback_rows:fallback.meta.current_evidence_rows||0,fallback_foreign_candidates:fallback.candidates.length,fallback_search_sources:fallback.meta.search_sources||{},fallback_query_lane:fallback.meta.query_lane||1,fallback_query_lanes:fallback.meta.query_lanes||SEARCH_BATCHES.length,returned:exact.leads.length,sent_preexcluded:history.sent.length,deleted_preexcluded:history.deleted.length,sent_exact_suppressed:exact.suppressed,search_stack:{official_html:true,cycle_rotated_official_batch:true,public_web_no_key:true,tavily:Boolean(t.tavily),jina:Boolean(t.jina),brave:Boolean(t.brave),exa:Boolean(t.exa)},participant_gate:'current WSCE 2026 official exhibitor list OR direct 2026 Busan/BEXCO participation evidence only',team_origin_gate:'foreign headquarters verified from participant-owned domain/site; generic Korea-office mentions do not classify a foreign HQ as Korean',stale_program_fallback:false,email_gate:'frontend contact-discovery-v2: qualified + valid + same-domain only',elapsed_ms:Date.now()-REQUEST_STARTED}},{headers:{'Cache-Control':'no-store'}});
  }catch(error){ return Response.json({error:clean(error?.message||error,500)||'WSCE 후보 검색에 실패했습니다.',cycle},{status:Number(error?.status)||502,headers:{'Cache-Control':'no-store'}}); }
}
