import { POST as seedPost } from './bcww-hybrid-v4.js';
import { publicWebSearch, publicWebSearchMany } from './public-web-search.js';
import { aiConfigured, chatJson } from './ai-provider.js';
import { findContacts } from './contact-discovery-v2.js';
import { listSentCompanyDomains, normalizeCompanyKey } from './sent-companies.js';
import { listDeletedCompanyDomains } from './deleted-companies.js';

const ROLE_TARGETS = ['International Sales','Content Distribution','Licensing','Business Development','Partnerships','Marketing','Events','Operations','Commercial','Founder','CEO'];
const SOURCE_HOSTS = new Set(['bcww.kr','kocca.kr','welcon.kocca.kr','vipo.or.jp','coex.co.kr','coexcenter.com','bizinfo.go.kr','linkedin.com','10times.com','prtimes.jp','facebook.com','instagram.com','x.com','twitter.com','youtube.com','wikipedia.org']);
const BLOCKED_HOSTS = new Set(['10times.com']);
const BLOCKED_LOCAL = new Set(['admin','support','help','security','careers','hr','jobs','legal','privacy','noreply','no-reply']);
const GENERIC_LOCAL = new Set(['info','contact','hello','team','office','press','media']);
const SALES_LOCAL = /(sales|international|global|distribution|licen[cs]|business|bizdev|bd|partner|marketing|event|commercial|content)/i;
const BCWW = /\bBCWW\b|Broadcast\s*World\s*Wide|국제방송영상마켓/i;
const BCWW_2026 = /\bBCWW\s*2026\b|BCWW2026|2026.{0,100}(?:BCWW|Broadcast\s*World\s*Wide)|(?:BCWW|Broadcast\s*World\s*Wide).{0,100}2026/i;
const BCWW_2025 = /\bBCWW\s*2025\b|BCWW2025|2025.{0,100}(?:BCWW|Broadcast\s*World\s*Wide)|(?:BCWW|Broadcast\s*World\s*Wide).{0,100}2025/i;
const PARTICIPATION = /\bexhibit(?:or|ing|ed)?\b|\bparticipat(?:e|ed|ing|ion)\b|\battend(?:ed|ing)?\b|\bbooth\b|\bstand\b|\bmeet\s+us\b|\bsee\s+you\b|\bshowcase\b|\bpitch\b|\bdelegation\b|\bpavilion\b|\bspeaker\b|出展|参加|参展|參展|부스|참가|출전|연사/i;
const RECRUITMENT = /registration\s+(?:is\s+)?open|applications?\s+(?:are\s+)?open|apply\s+(?:now|here|by)|call\s+for\s+exhibitors?|recruit(?:ing|ment)|募集|応募|申込|公募|모집(?:공고)?|신청(?:기간|방법)?|招募|报名|報名/i;
const INTEREST_ONLY = /followers?|shown\s+interest|interested\s+attendees?|people\s+attending|관심자|관심\s*등록/i;
const MAX_RETURNED = 30;
const MAX_RESOLVE = 42;
const MAX_CONTACTS = 14;
const SOFT_DEADLINE_MS = 76000;

const SEARCH_BATCHES = [
  [
    '"BCWW 2025" exhibited OR participated OR booth company Seoul',
    '"BCWW2025" 出展 OR 参加 株式会社',
    'site:vipo.or.jp/jlox-plusr6-case BCWW2025 出展 参加',
    '"BCWW 2026" exhibiting OR attending OR participating company Seoul'
  ],
  [
    '"BCWW 2025" "we exhibited" OR "we participated" media distribution',
    '"Broadcast Worldwide 2025" exhibitor distributor content company',
    '"BCWW2025" booth sales international content',
    '"BCWW 2026" "meet us" OR booth OR showcase media'
  ],
  [
    '"BCWW 2025" 参展 公司',
    '"BCWW 2025" 出展 セールス 海外番販',
    '"BCWW2025" international sales licensing distributor',
    '"BCWW 2026" 参展 OR 参加 公司'
  ],
  [
    'site:linkedin.com BCWW2025 exhibiting booth company',
    'site:prtimes.jp BCWW2025 出展',
    '"BCWW 2025" Seoul "international sales" television',
    '"BCWW 2026" Seoul content market company attending'
  ]
];

const DIRECT_PAGES = [
  'https://www.vipo.or.jp/jlox-plusr6-case/page/7/',
  'https://www.vipo.or.jp/jlox-plusr6-case/page/8/',
  'https://www.vipo.or.jp/jlox-plusr6-case/page/6/',
  'https://www.vipo.or.jp/jlox-plusr6-case/page/9/',
  'https://bcww.kr/page_registernow.php',
  'https://bcww.kr/page_conference_speekers.php'
];

const VERIFIED_REPEAT_POOL = [
  {company:'WOWOW',country:'Japan',domainHint:'wowow.co.jp',source_url:'https://www.vipo.or.jp/jlox-plusr6-case/page/7/',reason:'VIPO/JLOX의 BCWW 2025 실제 참가 기록'},
  {company:'Kansai Television Broadcasting',country:'Japan',domainHint:'ktv.jp',source_url:'https://www.vipo.or.jp/jlox-plusr6-case/page/7/',reason:'VIPO/JLOX의 BCWW 2025 실제 참가 기록'},
  {company:'ABC Frontier',country:'Japan',domainHint:'abc-frontier.co.jp',source_url:'https://www.vipo.or.jp/jlox-plusr6-case/page/7/',reason:'VIPO/JLOX의 BCWW 2025 실제 부스 참가 기록'},
  {company:'Hakuhodo DY Music & Pictures',country:'Japan',domainHint:'hakuhodody-map.jp',source_url:'https://www.vipo.or.jp/jlox-plusr6-case/page/7/',reason:'VIPO/JLOX의 BCWW 2025 실제 출전 기록'},
  {company:'Fujii Creative Corporation',country:'Japan',domainHint:'fujicreative.co.jp',source_url:'https://www.vipo.or.jp/jlox-plusr6-case/bcww-2025%E3%81%B8%E3%81%AE%E5%87%BA%E5%B1%95/',reason:'VIPO/JLOX의 BCWW 2025 부스 출전 기록'},
  {company:'TI Comnet',country:'Japan',domainHint:'',source_url:'https://www.vipo.or.jp/jlox-plusr6-case/bcww-2025/',reason:'VIPO/JLOX의 BCWW 2025 실제 출전 기록'},
  {company:'Mono Streaming',country:'Thailand',domainHint:'mono.co.th',source_url:'https://www.mono.co.th/tag/bcww-2025/',reason:'회사 공식 보도자료의 BCWW 2025 부스 출전 기록'},
  {company:'Canela Media',country:'United States',domainHint:'canelamedia.com',source_url:'https://bcww.kr/page_conference_speekers.php',reason:'BCWW 2025 공식 프로그램 참가 기업'},
  {company:'Gaumont',country:'France',domainHint:'gaumont.com',source_url:'https://bcww.kr/page_conference_speekers.php',reason:'BCWW 2025 공식 프로그램 참가 기업'},
  {company:'Amagi',country:'United States',domainHint:'amagi.com',source_url:'https://bcww.kr/page_conference_speekers.php',reason:'BCWW 2025 공식 프로그램 참가 기업'},
  {company:'Federation Studios',country:'France',domainHint:'federationstudios.com',source_url:'https://bcww.kr/page_conference_speekers.php',reason:'BCWW 2025 공식 프로그램 참가 기업'},
  {company:'Ellipse Animation',country:'France',domainHint:'ellipseanimation.com',source_url:'https://bcww.kr/page_conference_speekers.php',reason:'BCWW 2025 공식 프로그램 참가 기업'},
  {company:'C21 Media',country:'United Kingdom',domainHint:'c21media.net',source_url:'https://bcww.kr/page_conference_speekers.php',reason:'BCWW 2025 공식 프로그램 참가 기업'},
  {company:'Rakuten TV',country:'Spain',domainHint:'rakuten.tv',source_url:'https://bcww.kr/page_conference_speekers.php',reason:'BCWW 2025 공식 프로그램 참가 기업'},
  {company:'Telefe',country:'Argentina',domainHint:'telefe.com',source_url:'https://bcww.kr/page_conference_speekers.php',reason:'BCWW 2025 공식 프로그램 참가 기업'},
  {company:'BBC Studios',country:'United Kingdom',domainHint:'bbcstudios.com',source_url:'https://bcww.kr/page_conference_speekers.php',reason:'BCWW 2025 공식 프로그램 참가 기업'},
  {company:'Fremantle',country:'United Kingdom',domainHint:'fremantle.com',source_url:'https://bcww.kr/page_conference_speekers.php',reason:'BCWW 2025 공식 프로그램 참가 기업'},
  {company:'NBCUniversal',country:'United States',domainHint:'nbcuniversal.com',source_url:'https://bcww.kr/page_conference_speekers.php',reason:'BCWW 2025 공식 프로그램 참가 기업'},
  {company:'Glowstar Media',country:'Argentina',domainHint:'glowstar-media.com',source_url:'https://bcww.kr/page_conference_speekers.php',reason:'BCWW 2025 공식 프로그램 참가 기업'},
  {company:'Imagen Television',country:'Mexico',domainHint:'',source_url:'https://bcww.kr/page_conference_speekers.php',reason:'BCWW 2025 공식 프로그램 참가 기업'}
];

function clean(value='', max=800){ return String(value||'').replace(/\s+/g,' ').trim().slice(0,max); }
function rootHost(value=''){
  let host=clean(value,500).toLowerCase(); if(!host)return '';
  try{host=new URL(host.includes('://')?host:`https://${host}`).hostname;}catch{host=host.split('/')[0].split(':')[0];}
  host=host.replace(/^www\./,'').replace(/\.+$/,'');
  const p=host.split('.').filter(Boolean); if(p.length<=2)return host;
  const sld=new Set(['ac','co','com','edu','go','gov','ne','net','or','org']);
  return p.at(-1)?.length===2&&sld.has(p.at(-2))?p.slice(-3).join('.'):p.slice(-2).join('.');
}
function sameDomain(email='',domain=''){
  const e=clean(email,260).toLowerCase().split('@')[1]||'', d=rootHost(domain);
  return Boolean(e&&d&&(e===d||e.endsWith(`.${d}`)));
}
function sourceLike(value=''){
  const host=rootHost(value);
  return SOURCE_HOSTS.has(host)||/(?:news|press|directory|event|expo|conference|fair)\./i.test(host);
}
function countryFrom(domain='', text=''){
  const host=rootHost(domain), t=clean(text,7000);
  if(host.endsWith('.jp')||/Japan|Japanese|日本/i.test(t))return 'Japan';
  if(host.endsWith('.hk')||/Hong\s*Kong|香港/i.test(t))return 'Hong Kong';
  if(host.endsWith('.sg')||/Singapore/i.test(t))return 'Singapore';
  if(host.endsWith('.tw')||/Taiwan|台湾|臺灣/i.test(t))return 'Taiwan';
  if(host.endsWith('.fr')||/France|French/i.test(t))return 'France';
  if(host.endsWith('.de')||/Germany|German/i.test(t))return 'Germany';
  if(host.endsWith('.uk')||/United\s+Kingdom|\bUK\b|British/i.test(t))return 'United Kingdom';
  if(host.endsWith('.ca')||/Canada|Canadian/i.test(t))return 'Canada';
  if(host.endsWith('.au')||/Australia/i.test(t))return 'Australia';
  if(host.endsWith('.in')||/India|Indian/i.test(t))return 'India';
  if(host.endsWith('.ph')||/Philippines/i.test(t))return 'Philippines';
  if(host.endsWith('.br')||/Brazil|Brazilian/i.test(t))return 'Brazil';
  if(host.endsWith('.mx')||/Mexico|Mexican/i.test(t))return 'Mexico';
  if(host.endsWith('.th')||/Thailand|Thai/i.test(t))return 'Thailand';
  if(host.endsWith('.es')||/Spain|Spanish/i.test(t))return 'Spain';
  if(/Argentina|Argentinian/i.test(t))return 'Argentina';
  if(/United\s+States|\bUSA\b|U\.S\.|American/i.test(t))return 'United States';
  return '';
}
function isKorean(domain='', text=''){
  return rootHost(domain).endsWith('.kr')||/(?:South\s+Korea|Republic\s+of\s+Korea|한국\s*(?:회사|기업|법인|지사)|Korea\s+(?:office|branch|subsidiary))/i.test(clean(text,7000));
}
function stripHtml(value=''){
  return clean(String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'"),24000);
}
function timeLeft(started){ return SOFT_DEADLINE_MS-(Date.now()-started); }
async function fetchHtml(url='', timeoutMs=5500){
  if(!/^https?:\/\//i.test(url)||BLOCKED_HOSTS.has(rootHost(url)))return '';
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{redirect:'follow',cache:'no-store',signal:controller.signal,headers:{'User-Agent':'Mozilla/5.0 KoreaAgent/BCWW-Hunt-v6','Accept':'text/html,text/plain,application/xml;q=0.8,*/*;q=0.5'}});
    if(!response.ok)return '';
    return (await response.text()).slice(0,800000);
  }catch{return '';}finally{clearTimeout(timer);}
}
async function fetchText(url='', timeoutMs=5500){ return stripHtml(await fetchHtml(url,timeoutMs)); }
function normalizeRows(groups=[]){
  const by=new Map();
  for(const row of groups.flat()){
    const url=clean(row?.url,700); if(!/^https?:\/\//i.test(url)||BLOCKED_HOSTS.has(rootHost(url)))continue;
    const key=`${url.replace(/\/$/,'')}|${clean(row?.title,200)}`;
    const next={title:clean(row?.title,300),url,content:clean(row?.content||row?.raw_content||row?.snippet||row?.description,16000),published_date:clean(row?.published_date,80),source:clean(row?.source,60)||'web',score:Number(row?.score)||0};
    const prev=by.get(key); by.set(key,prev?{...prev,content:clean(`${prev.content} ${next.content}`,20000),score:Math.max(prev.score,next.score)}:next);
  }
  return [...by.values()].sort((a,b)=>b.score-a.score);
}

async function tavilySearch(query,{maxResults=20,timeRange='year'}={}){
  const key=clean(process.env.TAVILY_API_KEY,5000); if(!key)return {results:[],meta:{configured:false}};
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch('https://api.tavily.com/search',{method:'POST',signal:controller.signal,headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({query,search_depth:'basic',topic:'general',max_results:Math.min(20,Math.max(1,maxResults)),time_range:timeRange,include_answer:false,include_raw_content:'text'})});
    if(!response.ok)throw new Error(`Tavily HTTP ${response.status}`);
    const data=await response.json();
    const results=(Array.isArray(data?.results)?data.results:[]).map(row=>({title:row.title,url:row.url,content:row.raw_content||row.content,score:row.score,published_date:row.published_date||'',source:'tavily'}));
    return {results,meta:{configured:true,credits:Number(data?.usage?.credits)||0,request_id:clean(data?.request_id,120)}};
  }catch(error){return {results:[],meta:{configured:true,error:clean(error?.message||error,160)}};}finally{clearTimeout(timer);}
}
async function tavilySearchMany(queries=[]){
  const settled=await Promise.all((queries||[]).slice(0,4).map(q=>tavilySearch(q,{maxResults:20,timeRange:'year'})));
  return {results:normalizeRows(settled.map(x=>x.results||[])),meta:{queries:settled.length,credits:settled.reduce((n,x)=>n+(Number(x?.meta?.credits)||0),0),errors:settled.filter(x=>x?.meta?.error).length}};
}

function extractOfficialExhibitorLabels(html='',url=''){
  const s=String(html); const start=s.search(/Exhibitors\s*@\s*BCWW2025/i); if(start<0)return [];
  const tail=s.slice(start); const end=tail.search(/Buyers\s*@\s*BCWW2025/i); const segment=end>0?tail.slice(0,end):tail.slice(0,120000);
  const labels=[];
  for(const match of segment.matchAll(/<img\b[^>]*(?:alt|title)=["']([^"']{2,120})["'][^>]*>/gi)){
    const label=clean(match[1],120).replace(/\s+(?:logo|로고)$/i,'').trim();
    if(!label||/^(?:image|logo|bcww|banner|icon|arrow|next|prev)$/i.test(label)||BCWW.test(label))continue;
    labels.push({title:label,url,content:`${label} — Exhibitors @ BCWW2025 official page`,source:'bcww_official_exhibitor_logo',score:1});
  }
  return labels;
}
async function directRows(cycle=0){
  const idx=Math.abs(Number(cycle)||0)%4;
  const urls=[DIRECT_PAGES[idx],DIRECT_PAGES[(idx+1)%4],DIRECT_PAGES[4],DIRECT_PAGES[5]];
  const settled=await Promise.all(urls.map(async url=>{
    const html=await fetchHtml(url,5200); if(!html)return [];
    const rows=[{title:rootHost(url)==='bcww.kr'?'BCWW official participant page':'VIPO JLOX BCWW participation archive',url,content:stripHtml(html),source:rootHost(url)==='bcww.kr'?'bcww_official':'vipo_archive',score:0.99}];
    if(url.includes('page_registernow'))rows.push(...extractOfficialExhibitorLabels(html,url));
    return rows;
  }));
  return settled.flat();
}
async function discoveryRows(cycle=0){
  const batch=SEARCH_BATCHES[Math.abs(Number(cycle)||0)%SEARCH_BATCHES.length];
  const [tavily,free,direct]=await Promise.all([
    tavilySearchMany(batch),
    publicWebSearchMany(batch,{maxResults:20,timeRange:'year',topic:'general'}).catch(()=>({results:[],meta:{}})),
    directRows(cycle)
  ]);
  const rows=normalizeRows([tavily.results||[],free.results||[],direct])
    .filter(row=>BCWW.test(`${row.title} ${row.content}`)||row.source==='bcww_official_exhibitor_logo')
    .slice(0,110)
    .map((row,index)=>({...row,id:`r${index}`}));
  return {rows,meta:{tavily_credits:Number(tavily?.meta?.credits)||0,tavily_errors:Number(tavily?.meta?.errors)||0,free_results:(free?.results||[]).length,direct_results:direct.length}};
}

function evidenceSnippet(row={}){
  const text=clean(`${row.title} ${row.content}`,18000); const lower=text.toLowerCase(); const pos=lower.indexOf('bcww');
  return pos>=0?clean(text.slice(Math.max(0,pos-240),pos+620),900):clean(text,900);
}
function displayCompanyFromTitle(title='',domain=''){
  let value=clean(title,160).replace(/^\[[^\]]+\]\s*/,'').replace(/\s+[|–—-]\s+.*$/,'').replace(/\s*\|\s*LinkedIn.*$/i,'').trim();
  if(!value||value.length<2||BCWW.test(value))value=rootHost(domain).split('.')[0]||'';
  return value;
}
function deterministicOwned(rows=[]){
  return rows.flatMap(row=>{
    if(row.source==='bcww_official_exhibitor_logo')return [{row_id:row.id,company:clean(row.title,160),country:'',tier:'recurrence2025',evidence_quote:evidenceSnippet(row),confidence:96}];
    const domain=rootHost(row.url), text=clean(`${row.title} ${row.content}`,18000);
    if(!domain||sourceLike(domain)||isKorean(domain,text)||RECRUITMENT.test(text)||INTEREST_ONLY.test(text))return [];
    const tier=BCWW_2026.test(text)&&PARTICIPATION.test(text)?'confirmed2026':BCWW_2025.test(text)&&PARTICIPATION.test(text)?'recurrence2025':'';
    if(!tier)return [];
    const company=displayCompanyFromTitle(row.title,domain); if(!company||BCWW.test(company))return [];
    return [{row_id:row.id,company,country:countryFrom(domain,text),tier,evidence_quote:evidenceSnippet(row),confidence:92,domainHint:domain}];
  });
}
function extractJapaneseCompanies(rows=[]){
  const out=[];
  const legal=/(?:株式会社|有限会社|合同会社|一般社団法人)\s*[A-Za-z0-9Ａ-Ｚａ-ｚ一-龯ぁ-んァ-ヶー＆&・.＋+\- ]{1,70}|[A-Za-z0-9Ａ-Ｚａ-ｚ一-龯ぁ-んァ-ヶー＆&・.＋+\- ]{2,60}(?:株式会社|有限会社|合同会社)/gu;
  for(const row of rows){
    if(rootHost(row.url)!=='vipo.or.jp')continue;
    const text=clean(row.content,22000);
    for(const match of text.matchAll(legal)){
      const company=clean(match[0],100).replace(/\s{2,}/g,' ').trim();
      if(company.length<3||BCWW.test(company))continue;
      const at=match.index||0, window=text.slice(Math.max(0,at-350),Math.min(text.length,at+1200));
      if(!BCWW_2025.test(window)||!PARTICIPATION.test(window))continue;
      out.push({row_id:row.id,company,country:'Japan',tier:'recurrence2025',evidence_quote:evidenceSnippet({...row,content:window}),confidence:94});
    }
  }
  return out;
}
async function aiExtract(rows=[]){
  const eligible=rows.filter(row=>sourceLike(row.url)&&!RECRUITMENT.test(`${row.title} ${row.content}`)&&BCWW.test(`${row.title} ${row.content}`)).slice(0,42);
  if(!eligible.length||!aiConfigured())return [];
  const prompt=`Extract real non-Korean companies that have direct BCWW participation evidence from these web rows. Return every useful company, not just one per row.\n\nTiers:\n- confirmed2026: explicit company participation/exhibition/attendance/showcase/speaking at BCWW 2026.\n- recurrence2025: explicit company participation/exhibition/attendance/booth/speaking at BCWW 2025.\n\nReject recruitment notices, interest/follower lists, Korean companies/subsidiaries, generic industry companies with no company-specific BCWW evidence, and guesses.\nReturn JSON only: {"items":[{"row_id":"r0","company":"name","country":"country or empty","tier":"confirmed2026|recurrence2025","confidence":90}]}. Confidence >=82 only.\nROWS:\n${JSON.stringify(eligible.map(r=>({row_id:r.id,title:r.title,url:r.url,text:clean(r.content,4500)})))}`;
  try{
    const out=await chatJson({prompt,maxTokens:3600,timeoutMs:18000,hardDeadlineMs:22000,temperature:0});
    return (out?.data?.items||[]).map(x=>({row_id:clean(x.row_id,20),company:clean(x.company,180),country:clean(x.country,80),tier:clean(x.tier,30),confidence:Number(x.confidence)||0}))
      .filter(x=>x.company&&x.confidence>=82&&['confirmed2026','recurrence2025'].includes(x.tier));
  }catch{return [];}
}
function poolCandidates(){
  return VERIFIED_REPEAT_POOL.map((item,index)=>({row_id:`pool${index}`,company:item.company,country:item.country,tier:'recurrence2025',evidence_quote:item.reason,confidence:98,domainHint:item.domainHint||'',source:{title:item.reason,url:item.source_url,content:item.reason,source:'verified_pool',score:1}}));
}
function companyTokens(value=''){
  return clean(value,180).toLowerCase().replace(/株式会社|有限会社|合同会社|一般社団法人|inc\.?|ltd\.?|limited|corp\.?|corporation|company|co\.?/giu,' ').replace(/[^\p{L}\p{N}]+/gu,' ').split(/\s+/u).filter(x=>x.length>=2);
}
function rowMentionsCompany(company='',row={}){
  const text=clean(`${row.title} ${row.content}`,16000).toLowerCase(), tokens=companyTokens(company);
  return tokens.length?tokens.some(t=>text.includes(t)):false;
}
async function resolveDomain(item={},source={},excludes=new Set()){
  const hinted=rootHost(item.domainHint||'');
  if(hinted&&!sourceLike(hinted)&&!isKorean(hinted,'')&&!excludes.has(normalizeCompanyKey(hinted)))return {domain:hinted,url:`https://${hinted}/`};
  const sourceDomain=rootHost(source?.url||'');
  if(sourceDomain&&!sourceLike(sourceDomain)&&!isKorean(sourceDomain,`${source?.title||''} ${source?.content||''}`)&&rowMentionsCompany(item.company,source)&&!excludes.has(normalizeCompanyKey(sourceDomain)))return {domain:sourceDomain,url:`https://${sourceDomain}/`};
  const query=`"${clean(item.company,160)}" official website${item.country?` ${item.country}`:''}`;
  const result=await publicWebSearch(query,{maxResults:7,timeRange:'year',topic:'general'}).catch(()=>({results:[]}));
  for(const row of result?.results||[]){
    const domain=rootHost(row.url); if(!domain||sourceLike(domain)||isKorean(domain,`${row.title} ${row.content}`)||excludes.has(normalizeCompanyKey(domain)))continue;
    if(!rowMentionsCompany(item.company,row))continue;
    return {domain,url:`https://${domain}/`};
  }
  return null;
}
function validContact(c={},domain=''){
  const email=clean(c?.email,260).toLowerCase(),local=email.split('@')[0]||'';
  if(!email||!sameDomain(email,domain)||BLOCKED_LOCAL.has(local)||c?.qualified!==true||Number(c?.score||0)<75)return false;
  if(c?.emailStatus==='valid')return true;
  if(c?.emailStatus==='official_public'&&c?.officialSource===true){
    if(GENERIC_LOCAL.has(local)&&c?.allowGeneric!==true&&!SALES_LOCAL.test(`${local} ${c?.title||''}`))return false;
    return true;
  }
  return false;
}
function emailRegex(){return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;}
function officialEmails(text='',domain='',source=''){
  const flat=stripHtml(text),hits=[...new Set(flat.match(emailRegex())||[])].map(x=>x.toLowerCase()).filter(x=>sameDomain(x,domain));
  return hits.flatMap(email=>{
    const local=email.split('@')[0]||''; if(BLOCKED_LOCAL.has(local))return [];
    const at=flat.toLowerCase().indexOf(email),context=at>=0?flat.slice(Math.max(0,at-180),at+email.length+180):'';
    const generic=GENERIC_LOCAL.has(local), sales=SALES_LOCAL.test(`${local} ${context}`);
    if(generic&&!sales&&local!=='info')return [];
    return [{name:'',title:sales?'International / Sales contact':'Official company contact',email,emailStatus:'official_public',verificationMethod:'official_public',officialSource:true,allowGeneric:generic,qualified:true,score:sales?94:84,provider:'official_website',sources:[source]}];
  });
}
async function discoverOfficialEmails(domain=''){
  const base=`https://${rootHost(domain)}/`;
  const [home,contact,search]=await Promise.all([
    fetchText(base,3600),fetchText(`${base}contact`,3600),
    publicWebSearch(`site:${rootHost(domain)} "@${rootHost(domain)}" sales international distribution licensing business`,{maxResults:6,timeRange:'year',topic:'general'}).catch(()=>({results:[]}))
  ]);
  const contacts=[...officialEmails(home,domain,base),...officialEmails(contact,domain,`${base}contact`)];
  for(const row of search?.results||[])contacts.push(...officialEmails(`${row.title} ${row.content}`,domain,row.url));
  const by=new Map(); for(const c of contacts){const prev=by.get(c.email);if(!prev||c.score>prev.score)by.set(c.email,c);}
  return [...by.values()].sort((a,b)=>b.score-a.score).slice(0,5);
}
async function attachContact(candidate={}){
  const result=await findContacts(candidate.domain,{maxContacts:8,minQualified:1,recommendedRole:'International Sales',roleTargets:ROLE_TARGETS}).catch(()=>null);
  const provider=(result?.emails||[]).filter(c=>validContact(c,candidate.domain));
  const official=provider.length?[]:await discoverOfficialEmails(candidate.domain).catch(()=>[]);
  const all=[...provider,...official].filter(c=>validContact(c,candidate.domain));
  const by=new Map();for(const c of all){const prev=by.get(c.email);if(!prev||Number(c.score||0)>Number(prev.score||0))by.set(c.email,c);}
  const contacts=[...by.values()].sort((a,b)=>Number(b.emailStatus==='valid')-Number(a.emailStatus==='valid')||Number(b.score||0)-Number(a.score||0));
  return {contact:contacts[0]||null,contacts:contacts.slice(0,4),provider:[result?.provider,official.length?'official_website':''].filter(Boolean).join('+')||null};
}
async function mapLimit(items=[],limit=4,worker){
  if(!items.length)return [];
  const out=new Array(items.length);let cursor=0;
  const runners=Array.from({length:Math.min(Math.max(1,limit),items.length)},async()=>{while(cursor<items.length){const i=cursor++;try{out[i]=await worker(items[i],i);}catch{out[i]=null;}}});
  await Promise.all(runners);return out;
}
async function historyExcludes(body={}){
  const set=new Set((body.excludeDomains||[]).map(normalizeCompanyKey).filter(Boolean));
  const secret=clean(process.env.GMAIL_SESSION_SECRET,5000); if(!secret)return set;
  const [sent,deleted]=await Promise.all([listSentCompanyDomains(secret,500).catch(()=>[]),listDeletedCompanyDomains(secret,2500).catch(()=>[])]);
  for(const x of [...sent,...deleted])set.add(normalizeCompanyKey(x));
  return set;
}
function makeLead(candidate={},contactResult={}){
  const current=candidate.tier==='confirmed2026',company=clean(candidate.company,180),domain=rootHost(candidate.domain),contact=contactResult.contact||null;
  const relation=current?'BCWW 2026 현재 참가 근거 자동 확인':clean(candidate.evidence_reason||candidate.evidence_quote||'BCWW 2025 실제 참가 · 2026 재참가 확인 대상',220);
  return {
    id:`bcww:${current?'confirmed':'recurrence'}:${domain}`,campaign:'bcww',campaign_label:'BCWW 단체복',company,domain,url:candidate.url||`https://${domain}/`,
    source_url:clean(candidate.source?.url,700),source_title:clean(candidate.source?.title,300),evidence_urls:[clean(candidate.source?.url,700)].filter(Boolean),
    evidence_grade:current?'A':'R2025_WEB',evidence_reason:relation,signal:clean(candidate.evidence_quote||relation,1200),score:current?96:88,sales_priority:current?98:89,
    verified_company:true,bcww_confirmed:current,bcww_participation_confirmed:current,bcww_relation_confirmed:false,bcww_sales_candidate:true,bcww_outreach_tier:current?'confirmed':'recurrence',bcww_interest:false,
    team_origin:'foreign',team_origin_country:candidate.country||countryFrom(domain,`${candidate.source?.title||''} ${candidate.source?.content||''}`)||'International',outreach_language:'en',
    recommended_role:contact?.title||'International Sales / Marketing',role_targets:ROLE_TARGETS,contact,contacts:contactResult.contacts||[contact].filter(Boolean),contact_provider:contactResult.provider||null,
    contact_status:contact?'found':'pending',contact_failure_reason:contact?'':'이메일 추가 탐색 대상',contact_score_threshold:75,
    subject:current?`BCWW 2026 Seoul teamwear for ${company}`:'Are you returning to BCWW 2026? — local teamwear in Seoul',
    message_en:current
      ?`Hi ${company} team,\n\nI saw that your team is participating in BCWW 2026 in Seoul this September. We produce branded T-shirts, polos and staff wear locally in Seoul and can deliver directly to COEX or your hotel.\n\nIf teamwear is still open, I can send simple local pricing and turnaround options.`
      :`Hi ${company} team,\n\nI saw that your team participated in BCWW in Seoul last year. Are you returning for BCWW 2026 this September?\n\nIf so, we produce branded T-shirts, polos and staff wear locally in Seoul and can deliver directly to COEX or your hotel, avoiding overseas shipping and customs.\n\nIf your 2026 plans are confirmed, I can send simple pricing and turnaround options.`,
    message_ko:''
  };
}

async function smartDiscover(body={}){
  const started=Date.now(); const excludes=await historyExcludes(body);
  const discovery=await discoveryRows(body.cycle||0); const rows=discovery.rows; const rowById=new Map(rows.map(r=>[r.id,r]));
  const deterministic=[...deterministicOwned(rows),...extractJapaneseCompanies(rows)];
  let ai=[];
  if(deterministic.length<24&&timeLeft(started)>26000)ai=await aiExtract(rows);
  const raw=[...poolCandidates(),...deterministic,...ai],deduped=[]; const seen=new Set();
  for(const item of raw){
    const source=item.source||rowById.get(item.row_id); if(!source)continue;
    if(RECRUITMENT.test(item.evidence_quote||'')||INTEREST_ONLY.test(item.evidence_quote||''))continue;
    const key=`${item.tier}:${clean(item.company,180).toLowerCase()}`; if(seen.has(key))continue; seen.add(key);
    deduped.push({...item,source,evidence_reason:item.source?.title||item.evidence_quote||''});
  }
  const toResolve=deduped.slice(0,MAX_RESOLVE);
  const resolved=(await mapLimit(toResolve,8,async item=>{
    if(timeLeft(started)<9000)return null;
    const official=await resolveDomain(item,item.source,excludes); if(!official)return null;
    const domain=rootHost(official.domain); if(!domain||excludes.has(normalizeCompanyKey(domain))||isKorean(domain,`${item.source?.title||''} ${item.source?.content||''}`))return null;
    return {...item,...official,domain,country:item.country||countryFrom(domain,`${item.source?.title||''} ${item.source?.content||''}`)||'International'};
  }))).filter(Boolean);
  const unique=[]; const domains=new Set(); for(const item of resolved){if(domains.has(item.domain))continue;domains.add(item.domain);unique.push(item);}
  const selected=unique.slice(0,MAX_RETURNED);
  const contactBudget=timeLeft(started)>18000?Math.min(MAX_CONTACTS,selected.length):0;
  const contactMap=new Map();
  if(contactBudget){
    const rowsWithContacts=(await mapLimit(selected.slice(0,contactBudget),4,async candidate=>({domain:candidate.domain,result:await attachContact(candidate)}))).filter(Boolean);
    for(const row of rowsWithContacts)contactMap.set(row.domain,row.result);
  }
  const leads=selected.map(candidate=>makeLead(candidate,contactMap.get(candidate.domain)||{}))
    .sort((a,b)=>Number(Boolean(b.contact))-Number(Boolean(a.contact))||Number(b.bcww_participation_confirmed)-Number(a.bcww_participation_confirmed)||Number(b.sales_priority)-Number(a.sales_priority));
  return {leads,meta:{
    raw_search_results:rows.length,
    deterministic_candidates:deterministic.length,
    ai_candidates:ai.length,
    verified_pool_candidates:VERIFIED_REPEAT_POOL.length,
    smart_extracted:deduped.length,
    smart_resolved:unique.length,
    contact_attempted:contactBudget,
    contact_ready:leads.filter(x=>x.contact?.email).length,
    contact_unresolved:leads.filter(x=>!x.contact?.email).length,
    smart_recurrence:leads.filter(x=>x.bcww_outreach_tier==='recurrence').length,
    smart_confirmed:leads.filter(x=>x.bcww_participation_confirmed===true).length,
    tavily_credits:discovery.meta.tavily_credits,
    tavily_errors:discovery.meta.tavily_errors,
    free_search_results:discovery.meta.free_results,
    direct_source_results:discovery.meta.direct_results,
    duration_ms:Date.now()-started,
    partial:timeLeft(started)<5000,
    smart_sources:[...new Set(rows.map(x=>x.source).filter(Boolean))]
  }};
}

export async function POST(request){
  let body={}; try{body=await request.clone().json();}catch{}
  if(body.seedsOnly)return seedPost(request);
  try{
    const result=await smartDiscover(body);
    return Response.json({campaign:'bcww',campaign_label:'BCWW 단체복',leads:result.leads,meta:{...result.meta,returned:result.leads.length,evidence_verified_companies:result.leads.length,pipeline_mode:'Tavily + free web + official BCWW/VIPO + verified repeat-participant baseline',truth_policy:'2025 participants are recurrence prospects only and never labeled as confirmed BCWW 2026 participants'}},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    console.error('bcww hunt v6 degraded',clean(error?.message||error,500));
    return Response.json({campaign:'bcww',campaign_label:'BCWW 단체복',leads:[],meta:{returned:0,evidence_verified_companies:0,contact_ready:0,contact_unresolved:0,degraded:true,error:clean(error?.message||error,300),pipeline_mode:'degraded-safe-response'}},{status:200,headers:{'Cache-Control':'no-store'}});
  }
}
