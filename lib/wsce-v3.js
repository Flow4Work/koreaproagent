import { aiConfigured, chatJson } from '../lib/ai-provider.js';
import { parseRss } from '../lib/public-web-search.js';
import {
  buildGlobalExclusions,
  clean,
  fetchPage,
  isKoreanCountry,
  mapLimit,
  normalizeCompanyKey,
  publicWebSearchMany,
  resolveOfficialWebsite,
  rootHost,
  suppressExactSent,
  verifyForeignEntity
} from '../lib/international-event-campaign.js';

const EVENT = { name:'World Smart City Expo 2026', short:'WSCE 2026', dates:'2026-09-09–2026-09-11', venue:'BEXCO, Busan' };
const EVENT_DOMAIN = 'worldsmartcityexpo.com';
const LIST_URL = 'https://worldsmartcityexpo.com/board/bbs/board.php?bo_table=company_en';
const LIST_PAGES = Array.from({ length:14 }, (_, i) => `${LIST_URL}&page=${i + 1}`);
const RSS_URLS = [
  'https://worldsmartcityexpo.com/board/bbs/rss.php?bo_table=company_en',
  'https://www.worldsmartcityexpo.com/board/bbs/rss.php?bo_table=company_en'
];
const EVENT_ID = /(?:World\s+Smart\s+City\s+Expo|월드\s*스마트시티\s*엑스포|\bWSCE\b[^\n]{0,160}(?:Busan|BEXCO)|(?:Busan|BEXCO)[^\n]{0,160}\bWSCE\b)/i;
const YEAR_2026 = /(?:\bWSCE\s*2026\b|World\s+Smart\s+City\s+Expo[^\n]{0,120}\b2026\b|2026[^\n]{0,120}World\s+Smart\s+City\s+Expo)/i;
const PARTICIPATION = /(exhibitor|exhibiting|participat(?:e|es|ed|ing|ion)|booth|stand\s*(?:no\.?|#)?|pavilion|delegation|attend(?:s|ed|ing)|join(?:s|ed|ing)|speaker|speaking|partner|sponsor|showcas(?:e|ing)|출전|참가|전시|부스|연사|파트너|스폰서|出展|参加|參展|参展)/i;
const BAD_NAME = /(?:World Smart City Expo|\bWSCE\b|List of Participating Companies|Smart City Expo|BEXCO|Booth Number|Company Introduction|Main Products|Hosted by|Organized by|Exhibit Application|Exhibitor Benefits|Sponsorship|^Image$|^List$|^수정$)/i;
const BLOCKED_SEARCH = /(?:wikipedia\.org|10times\.|eventbrite\.|facebook\.com|instagram\.com|youtube\.com)/i;
let REQUEST_START = Date.now();
const enoughTime = (reserveMs = 0) => Date.now() - REQUEST_START < Math.max(0, 98000 - reserveMs);

function key(value = '', env = '') { return clean(value || (env ? process.env[env] : ''), 5000); }
function tools(body = {}) {
  return {
    tavily:key('', 'TAVILY_API_KEY'),
    jina:key(body?.tools?.jinaKey, 'JINA_API_KEY'),
    brave:key(body?.tools?.braveKey, 'BRAVE_SEARCH_API_KEY') || key('', 'BRAVE_API_KEY'),
    exa:key(body?.tools?.exaKey, 'EXA_API_KEY')
  };
}

async function jsonFetch(url, options = {}, timeoutMs = 7500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, cache:'no-store', signal:controller.signal });
    const text = await response.text();
    if (!response.ok) return null;
    try { return text ? JSON.parse(text) : {}; } catch { return null; }
  } catch { return null; }
  finally { clearTimeout(timer); }
}

function row(raw = {}, source = '') {
  const url = clean(raw?.url || raw?.link, 700);
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    title:clean(raw?.title || raw?.name, 280), url,
    text:clean(raw?.content || raw?.description || raw?.snippet || raw?.text, 6500),
    score:Number(raw?.score) || 0, date:clean(raw?.published_date || raw?.publishedDate || raw?.date, 80), source
  };
}

async function tavily(q, apiKey, includeDomains = []) {
  if (!apiKey) return [];
  const data = await jsonFetch('https://api.tavily.com/search', {
    method:'POST', headers:{ Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' },
    body:JSON.stringify({ query:q, topic:'general', search_depth:'basic', max_results:20, include_answer:false, include_raw_content:false, ...(includeDomains.length ? { include_domains:includeDomains } : {}) })
  }, 8500);
  return (Array.isArray(data?.results) ? data.results : []).map(x => row(x, 'tavily')).filter(Boolean);
}

async function jina(q, apiKey) {
  if (!apiKey) return [];
  const data = await jsonFetch(`https://s.jina.ai/${encodeURIComponent(q)}`, { headers:{ Authorization:`Bearer ${apiKey}`, Accept:'application/json' } }, 8000);
  const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
  return rows.map(x => row(x, 'jina')).filter(Boolean);
}

async function brave(q, apiKey) {
  if (!apiKey) return [];
  const params = new URLSearchParams({ q:clean(q,390), count:'20', safesearch:'moderate', freshness:'py' });
  const data = await jsonFetch(`https://api.search.brave.com/res/v1/web/search?${params}`, { headers:{ 'X-Subscription-Token':apiKey, Accept:'application/json' } }, 7500);
  return (Array.isArray(data?.web?.results) ? data.web.results : []).map((x,i) => row({ ...x, content:x.description || '', score:1-i/24 }, 'brave')).filter(Boolean);
}

async function exa(q, apiKey) {
  if (!apiKey) return [];
  const data = await jsonFetch('https://api.exa.ai/search', {
    method:'POST', headers:{ 'x-api-key':apiKey, 'Content-Type':'application/json' },
    body:JSON.stringify({ query:q, type:'fast', numResults:14, startPublishedDate:new Date(Date.now()-420*86400000).toISOString(), contents:{ highlights:true } })
  }, 8500);
  return (Array.isArray(data?.results) ? data.results : []).map((x,i) => row({ ...x, content:Array.isArray(x.highlights) ? x.highlights.join(' ') : x.text, score:1-i/18 }, 'exa')).filter(Boolean);
}

async function bingRss(q) {
  const page = await fetchPage(`https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss`, { timeoutMs:5500, maxBytes:450000 });
  return page?.html ? parseRss(page.html, 'bing-web-rss').map(x => row(x, 'bing-web-rss')).filter(Boolean) : [];
}

function dedupe(rows = []) {
  const map = new Map();
  for (const x of rows) {
    if (!x?.url) continue;
    const k = x.url.replace(/^https?:\/\/(?:www\.)?/i,'').replace(/#.*$/,'').replace(/\/$/,'').toLowerCase();
    const prev = map.get(k);
    if (!prev || x.text.length > prev.text.length || x.score > prev.score) map.set(k,x);
  }
  return [...map.values()];
}

async function multiSearch(queries, t, { officialOnly = false, max = 120 } = {}) {
  const qs = [...new Set(queries.map(q => clean(q,430)).filter(Boolean))].slice(0,5);
  const jobs = [];
  jobs.push(['public', publicWebSearchMany(qs, { maxResults:20, timeRange:'year', topic:'general', ...(officialOnly ? { includeDomains:[EVENT_DOMAIN] } : {}) }).then(r => (r?.results || []).map(x => row(x, x.source || 'public')).filter(Boolean)).catch(() => [])]);
  jobs.push(['bing-rss', Promise.all(qs.slice(0,3).map(bingRss)).then(x => x.flat()).catch(() => [])]);
  if (t.tavily) jobs.push(['tavily', Promise.all(qs.slice(0,3).map(q => tavily(q,t.tavily,officialOnly?[EVENT_DOMAIN]:[]))).then(x => x.flat()).catch(() => [])]);
  if (t.jina) jobs.push(['jina', Promise.all(qs.slice(0,2).map(q => jina(q,t.jina))).then(x => x.flat()).catch(() => [])]);
  if (t.brave) jobs.push(['brave', Promise.all(qs.slice(0,2).map(q => brave(q,t.brave))).then(x => x.flat()).catch(() => [])]);
  if (t.exa) jobs.push(['exa', Promise.all(qs.slice(0,2).map(q => exa(q,t.exa))).then(x => x.flat()).catch(() => [])]);
  const results = await Promise.all(jobs.map(async ([name,p]) => ({ name, rows:await p })));
  const counts = {}, all=[];
  for (const r of results) { counts[r.name]=r.rows.length; all.push(...r.rows); }
  const rows = dedupe(all).filter(x => !BLOCKED_SEARCH.test(rootHost(x.url)) || EVENT_ID.test(`${x.title} ${x.text}`)).sort((a,b)=>b.score-a.score).slice(0,max);
  return { rows, counts };
}

function detail(url = '', hint = '', source = '') {
  let u;
  try { u = new URL(String(url).replace(/&amp;/gi,'&'), 'https://worldsmartcityexpo.com'); } catch { return null; }
  if (rootHost(u.href) !== EVENT_DOMAIN || u.searchParams.get('bo_table') !== 'company_en') return null;
  const id = u.searchParams.get('wr_id') || '';
  if (!/^\d+$/.test(id)) return null;
  return { id, url:`https://worldsmartcityexpo.com/board/bbs/board.php?bo_table=company_en&wr_id=${id}`, hint:clean(hint,180), source };
}

function detailsFromRaw(raw = '', source = '') {
  const text = String(raw).replace(/&amp;/gi,'&');
  const out=[];
  const re=/(?:https?:\/\/(?:www\.)?worldsmartcityexpo\.com)?\/board\/bbs\/board\.php\?[^"'<\s]*bo_table=company_en[^"'<\s]*wr_id=\d+[^"'<\s]*/gi;
  for (const m of text.matchAll(re)) { const x=detail(m[0], '', source); if(x) out.push(x); }
  return out;
}

function detailsFromPage(page, source='official-list') {
  const out=[];
  for (const l of page?.links || []) { const x=detail(l.url,l.text,source); if(x) out.push(x); }
  out.push(...detailsFromRaw(page?.html || '', source));
  return out;
}

function mergeDetails(...groups) {
  const map=new Map();
  for(const g of groups) for(const x of g||[]) {
    const p=map.get(x.id);
    if(!p || (!p.hint && x.hint) || (p.source==='official-list' && x.source!=='official-list')) map.set(x.id,{...p,...x});
  }
  return [...map.values()];
}

function companyNames(text='', hint='') {
  const v=clean(text,18000), out=[];
  if(hint && !BAD_NAME.test(hint)) out.push(hint);
  const patterns=[
    /Booth Number\s+(?:[^\s]{1,20}\s+)?Image\s+(.{2,180}?)\s+(?:https?:\/\/|www\.|Company Introduction)/i,
    /Image\s+(.{2,160}?)\s+(?:https?:\/\/|www\.)[a-z0-9.-]+/i
  ];
  for(const p of patterns){ const x=clean(v.match(p)?.[1],180); if(x&&!BAD_NAME.test(x)) out.push(x); }
  return [...new Set(out)].filter(x=>x.length>=2&&x.length<=150);
}

async function rssDetails() {
  const pages=await Promise.all(RSS_URLS.map(u=>fetchPage(u,{timeoutMs:5000,maxBytes:500000}).catch(()=>null)));
  const out=[];
  for(const p of pages.filter(Boolean)){
    out.push(...detailsFromRaw(p.html,'official-rss'));
    for(const r of parseRss(p.html,'official-rss')){ const x=detail(r.url,r.title,'official-rss'); if(x)out.push(x); }
  }
  return out;
}

async function officialRows(t) {
  const qs=[
    'site:worldsmartcityexpo.com/board/bbs/board.php?bo_table=company_en "World Smart City Expo" company',
    'site:worldsmartcityexpo.com/board/bbs/board.php?bo_table=company_en "WSCE 2026" exhibitor',
    'site:worldsmartcityexpo.com/board/bbs/board.php?bo_table=company_en pavilion delegation international'
  ];
  const [pages,feed,search]=await Promise.all([
    mapLimit(LIST_PAGES,7,u=>fetchPage(u,{timeoutMs:5500,maxBytes:650000})),
    rssDetails(), multiSearch(qs,t,{officialOnly:true,max:100})
  ]);
  const live=pages.filter(Boolean);
  const list=live.flatMap(p=>detailsFromPage(p));
  const found=search.rows.flatMap(r=>[...(detail(r.url,r.title,r.source)?[detail(r.url,r.title,r.source)]:[]),...detailsFromRaw(`${r.url} ${r.text}`,r.source)]);
  const all=mergeDetails(found,feed,list).slice(0,90);
  const rows=(await mapLimit(all,12,async x=>{
    const p=await fetchPage(x.url,{timeoutMs:5200,maxBytes:600000}); if(!p)return null;
    return { id:`official-${x.id}`, url:x.url, text:clean(p.text,18000), links:p.links||[], names:companyNames(p.text,x.hint), source:x.source };
  })).filter(Boolean);
  return { rows, meta:{ list_pages:live.length, detail_links:all.length, rss_links:feed.length, search_links:found.length, search_counts:search.counts } };
}

async function aiNames(rows) {
  const unresolved=rows.filter(r=>!r.names.length).slice(0,28);
  if(!unresolved.length || !aiConfigured() || !enoughTime(22000)) return [];
  const prompt=`Extract the exact participant company/organization from these CURRENT official World Smart City Expo 2026 Busan participant pages. Ignore the BEXCO/Busan/Korea venue footer, organizer addresses, navigation, and logos. Do not infer nationality here. Reject blank/unfinished pages. Never invent. JSON only: {"items":[{"row_id":"official-1","company":"exact name","country":"country or empty","confidence":90}]}. Use confidence >=82.\nROWS:\n${JSON.stringify(unresolved.map(r=>({row_id:r.id,url:r.url,text:clean(r.text,6500)})))}`;
  try{
    const res=await chatJson({prompt,maxTokens:2400,timeoutMs:18000,hardDeadlineMs:20000,temperature:0});
    return (res?.data?.items||[]).map(x=>({row_id:clean(x.row_id,40),company:clean(x.company,180),country:clean(x.country,80),confidence:Number(x.confidence)||0})).filter(x=>x.row_id&&x.company&&x.confidence>=82&&!BAD_NAME.test(x.company));
  }catch{return[];}
}

function directWebsite(links=[]) {
  const external=(links||[]).filter(l=>{
    const d=rootHost(l.url); return d && d!==EVENT_DOMAIN && !BLOCKED_SEARCH.test(d);
  });
  const domains=[...new Set(external.map(l=>rootHost(l.url)).filter(Boolean))];
  if(domains.length!==1)return null;
  return { domain:domains[0], url:`https://${domains[0]}/`, page:null };
}

async function foreignFromOfficial(rows, ai, excludes) {
  const byId=new Map(rows.map(r=>[r.id,r])), items=[];
  for(const x of ai) if(!items.some(i=>i.row_id===x.row_id)) items.push(x);
  for(const r of rows) if(r.names[0]&&!items.some(i=>i.row_id===r.id)) items.push({row_id:r.id,company:r.names[0],country:'',confidence:90});
  return (await mapLimit(items.slice(0,55),8,async x=>{
    if(!enoughTime(12000))return null;
    const r=byId.get(x.row_id); if(!r)return null;
    let website=directWebsite(r.links);
    if(!website) website=await resolveOfficialWebsite(x.company,x.country,r.links,excludes,[EVENT_DOMAIN]);
    if(!website)return null;
    const d=normalizeCompanyKey(website.domain); if(!d||excludes.has(d))return null;
    const foreign=await verifyForeignEntity({company:x.company,website,sourceText:'',countryHint:isKoreanCountry(x.country)?'':x.country});
    if(!foreign)return null;
    return {company:x.company,country:foreign.country,domain:foreign.domain,url:foreign.url,participation:'official exhibitor list',confidence:Math.max(92,x.confidence),source:{title:'WSCE 2026 List of Participating Companies',url:r.url}};
  })).filter(Boolean);
}

async function fallbackRows(t) {
  const qs=[
    '"World Smart City Expo 2026" Busan exhibitor company',
    '"WSCE 2026" Busan booth pavilion delegation company',
    '"World Smart City Expo 2026" Busan speaker sponsor partner',
    '"WSCE 2026" Busan Japan Singapore Taiwan international delegation'
  ];
  const s=await multiSearch(qs,t,{max:100});
  const rows=s.rows.map((r,i)=>({id:`web-${i}`,...r})).filter(r=>EVENT_ID.test(`${r.title} ${r.text} ${r.url}`)&&YEAR_2026.test(`${r.title} ${r.text} ${r.url}`)&&PARTICIPATION.test(`${r.title} ${r.text}`));
  return {rows,counts:s.counts};
}

async function fallbackCandidates(rows,t,excludes) {
  if(!rows.length||!aiConfigured()||!enoughTime(26000))return[];
  const top=rows.slice(0,36);
  const prompt=`Find named NON-KOREAN companies/organizations with direct participation evidence for World Smart City Expo 2026 at BEXCO in Busan. Accept exhibitor, booth, attendance, speaker, sponsor/partner, pavilion or overseas delegation. Reject generic promotion, historical evidence, Korean entities, and the unrelated IEEE conference also abbreviated WSCE. Never invent. JSON only: {"items":[{"row_id":"web-0","company":"exact name","country":"country or empty","participation":"exhibitor|booth|attendance|speaker|sponsor|partner|pavilion|delegation","confidence":90}]}. Use confidence >=86.\nROWS:\n${JSON.stringify(top.map(r=>({row_id:r.id,title:r.title,url:r.url,text:clean(r.text,3600),source:r.source})))}`;
  let items=[];
  try{ const res=await chatJson({prompt,maxTokens:2600,timeoutMs:20000,hardDeadlineMs:22000,temperature:0}); items=(res?.data?.items||[]).filter(x=>Number(x.confidence)>=86); }catch{return[];}
  const byId=new Map(top.map(r=>[r.id,r]));
  return (await mapLimit(items.slice(0,24),6,async x=>{
    if(!enoughTime(8000))return null;
    const r=byId.get(clean(x.row_id,40)); if(!r)return null;
    const sourcePage=await fetchPage(r.url,{timeoutMs:4500,maxBytes:280000});
    const evidence=clean(`${r.title} ${r.text} ${sourcePage?.text||''}`,14000);
    if(!EVENT_ID.test(evidence)||!PARTICIPATION.test(evidence))return null;
    const country=isKoreanCountry(x.country)?'':clean(x.country,80);
    let website=null;
    const sourceDomain=rootHost(r.url);
    if(sourceDomain && sourceDomain!==EVENT_DOMAIN && !BLOCKED_SEARCH.test(sourceDomain)) website={domain:sourceDomain,url:`https://${sourceDomain}/`,page:sourcePage};
    if(!website) website=await resolveOfficialWebsite(clean(x.company,180),country,sourcePage?.links||[],excludes,[EVENT_DOMAIN]);
    if(!website)return null;
    const d=normalizeCompanyKey(website.domain); if(!d||excludes.has(d))return null;
    const foreign=await verifyForeignEntity({company:clean(x.company,180),website,sourceText:'',countryHint:country}); if(!foreign)return null;
    return {company:clean(x.company,180),country:foreign.country,domain:foreign.domain,url:foreign.url,participation:clean(x.participation,80)||'participation',confidence:Number(x.confidence)||86,source:{title:r.title,url:r.url}};
  })).filter(Boolean);
}

function lead(c) {
  const company=clean(c.company,180), domain=rootHost(c.domain), country=clean(c.country,80);
  return {
    id:`wsce:${domain}`,campaign:'wsce',campaign_label:'WSCE 단체복',company,domain,url:c.url||`https://${domain}/`,source_url:clean(c.source?.url,700),source_title:clean(c.source?.title,280),signal:`WSCE 2026 ${c.participation||'participation'} · ${country}`,
    score:Math.max(86,Math.min(99,Number(c.confidence)||90)),sales_priority:Math.max(86,Math.min(99,Number(c.confidence)||90)),verified_company:true,wsce_confirmed:true,team_origin:'foreign',team_origin_country:country,outreach_language:'en',recommended_role:'Events Lead',role_targets:['Events Lead','Event Marketing','Marketing Director','Partnerships Lead','Business Development Director','Operations Lead','Country Manager','Founder','CEO'],subject:'Quick question about WSCE 2026 in Busan',
    message_en:`Hi,\n\nI saw that ${company} is participating in WSCE 2026 in Busan. Quick question — have you already sorted team shirts or staff wear for your Korea trip?\n\nWe produce branded apparel locally in Korea and can deliver directly to your hotel, office or BEXCO, so your team does not need to ship boxes internationally or coordinate production after arrival.\n\nIf it is still open, I can send a few options with pricing and turnaround.`,message_ko:'',contact:null,contacts:[],contact_status:'pending'
  };
}

export async function POST(request) {
  REQUEST_START=Date.now();
  let body={}; try{body=await request.json();}catch{return Response.json({error:'요청 형식이 잘못됐습니다.'},{status:400});}
  const history=await buildGlobalExclusions(Array.isArray(body.excludeDomains)?body.excludeDomains:[]), t=tools(body);
  try{
    const fallbackPromise=fallbackRows(t).catch(()=>({rows:[],counts:{}}));
    const official=await officialRows(t);
    const names=await aiNames(official.rows);
    const officialForeign=await foreignFromOfficial(official.rows,names,history.set);
    const fallbackSearch=await fallbackPromise;
    const fallback=officialForeign.length>=10?[]:await fallbackCandidates(fallbackSearch.rows,t,history.set);
    const seen=new Set(), provisional=[];
    for(const c of [...officialForeign,...fallback].sort((a,b)=>(b.confidence||0)-(a.confidence||0))){
      const d=normalizeCompanyKey(c.domain); if(!d||seen.has(d)||history.set.has(d)||isKoreanCountry(c.country))continue; seen.add(d); provisional.push(lead(c)); if(provisional.length>=40)break;
    }
    const exact=await suppressExactSent(provisional,history.secret);
    return Response.json({campaign:'wsce',campaign_label:'WSCE 단체복',leads:exact.leads,meta:{
      event:EVENT,official_source:LIST_URL,official_list_pages_loaded:official.meta.list_pages,official_detail_links:official.meta.detail_links,official_rss_detail_links:official.meta.rss_links,official_search_detail_links:official.meta.search_links,official_detail_rows:official.rows.length,official_foreign_candidates:officialForeign.length,official_search_sources:official.meta.search_counts,
      fallback_rows:fallbackSearch.rows.length,fallback_foreign_candidates:fallback.length,fallback_search_sources:fallbackSearch.counts,returned:exact.leads.length,sent_preexcluded:history.sent.length,deleted_preexcluded:history.deleted.length,sent_exact_suppressed:exact.suppressed,
      search_stack:{official_html:true,official_rss_probe:true,public_web_no_key:true,bing_web_rss:true,tavily:Boolean(t.tavily),jina_search:Boolean(t.jina),brave:Boolean(t.brave),exa:Boolean(t.exa)},
      participant_gate:'exact World Smart City Expo 2026 Busan evidence only; unrelated WSCE conferences rejected',team_origin_gate:'foreign origin verified only from participant-owned website; BEXCO/Busan/Korea event footer excluded',email_gate:'contact-discovery-v2: public website + Jina + Hunter + Prospeo + Apollo + Tomba; UI exposes qualified + valid + same-domain only',elapsed_ms:Date.now()-REQUEST_START
    }},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return Response.json({error:clean(e?.message||e,500)||'WSCE 후보 검색에 실패했습니다.'},{status:Number(e?.status)||502});}
}
