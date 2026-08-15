import { POST as seedPost } from './bcww-hybrid-v4.js';
import { publicWebSearch, publicWebSearchMany } from './public-web-search.js';
import { aiConfigured, chatJson } from './ai-provider.js';
import { findContacts } from './contact-discovery-v2.js';
import { listSentCompanyDomains, normalizeCompanyKey } from './sent-companies.js';
import { listDeletedCompanyDomains } from './deleted-companies.js';

const ROLE_TARGETS = ['International Sales','Content Distribution','Licensing','Business Development','Partnerships','Marketing','Events','Operations','Commercial','Founder','CEO'];
const SOURCE_HOSTS = new Set(['bcww.kr','kocca.kr','welcon.kocca.kr','vipo.or.jp','actinter.co.jp','coex.co.kr','coexcenter.com','bizinfo.go.kr','linkedin.com','10times.com','prtimes.jp','facebook.com','instagram.com','x.com','twitter.com','youtube.com','wikipedia.org']);
const BLOCKED_HOSTS = new Set(['10times.com']);
const BLOCKED_LOCAL = new Set(['admin','support','help','security','careers','hr','jobs','legal','privacy','noreply','no-reply']);
const GENERIC_LOCAL = new Set(['info','contact','hello','team','office','press','media']);
const SALES_LOCAL = /(sales|international|global|distribution|licen[cs]|business|bizdev|bd|partner|marketing|event|commercial|content)/i;
const BCWW = /\bBCWW\b|Broadcast\s*World\s*Wide|국제방송영상마켓/i;
const BCWW_2026 = /\bBCWW\s*2026\b|BCWW2026|2026.{0,80}(?:BCWW|Broadcast\s*World\s*Wide)|(?:BCWW|Broadcast\s*World\s*Wide).{0,80}2026/i;
const BCWW_2025 = /\bBCWW\s*2025\b|BCWW2025|2025.{0,80}(?:BCWW|Broadcast\s*World\s*Wide)|(?:BCWW|Broadcast\s*World\s*Wide).{0,80}2025/i;
const PARTICIPATION = /\bexhibit(?:or|ing|ed)?\b|\bparticipat(?:e|ed|ing|ion)\b|\battend(?:ed|ing)?\b|\bbooth\b|\bstand\b|\bmeet\s+us\b|\bsee\s+you\b|\bshowcase\b|\bpitch\b|\bdelegation\b|\bpavilion\b|出展|参加|参展|參展|부스|참가|출전/i;
const RECRUITMENT = /registration\s+(?:is\s+)?open|applications?\s+(?:are\s+)?open|apply\s+(?:now|here|by)|call\s+for\s+exhibitors?|recruit(?:ing|ment)|募集|応募|申込|公募|모집(?:공고)?|신청(?:기간|방법)?|招募|报名|報名/i;
const INTEREST_ONLY = /followers?|shown\s+interest|interested\s+attendees?|people\s+attending|관심자|관심\s*등록/i;

const QUERY_BATCHES = [
  [
    'site:vipo.or.jp/jlox-plusr6-case "BCWW2025" "出展"',
    'site:vipo.or.jp/jlox-plusr6-case "BCWW 2025" "参加"',
    '"Broadcast Worldwide (BCWW) 2025" "markets we participate"',
    '"BCWW 2025" "exhibited" Seoul "sales"',
    '"BCWW 2026" exhibiting OR attending company',
    '"BCWW 2026" 出展 OR 参加 会社'
  ],
  [
    'site:vipo.or.jp/jlox-plusr6-case "BCWW2025への出展"',
    'site:vipo.or.jp/jlox-plusr6-case "BCWW 2025への出展"',
    '"BCWW2025" "株式会社" 出展',
    '"BCWW 2025" "content market" distributor Seoul',
    '"BCWW 2026" "meet us" Seoul media',
    '"BCWW 2026" 参展 OR 參展 公司'
  ],
  [
    '"BCWW 2025" "we participated" media',
    '"BCWW 2025" "we exhibited" content',
    '"BCWW 2025" 出展 セールス',
    '"BCWW2025" 参加 海外番販',
    '"BCWW 2026" "see you" Seoul content',
    '"BCWW 2026" showcase company Seoul'
  ]
];

const DIRECT_ARCHIVE_PAGES = [
  'https://www.vipo.or.jp/jlox-plusr6-case/page/7/',
  'https://www.vipo.or.jp/jlox-plusr6-case/page/8/',
  'https://www.vipo.or.jp/jlox-plusr6-case/page/6/',
  'https://www.vipo.or.jp/jlox-plusr6-case/page/9/'
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
  const host=rootHost(domain), t=clean(text,5000);
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
  if(host.endsWith('.br')||/Brazil/i.test(t))return 'Brazil';
  if(host.endsWith('.mx')||/Mexico/i.test(t))return 'Mexico';
  if(/United\s+States|\bUSA\b|U\.S\./i.test(t))return 'United States';
  return '';
}
function isKorean(domain='', text=''){
  return rootHost(domain).endsWith('.kr')||/(?:South\s+Korea|Republic\s+of\s+Korea|한국\s*(?:회사|기업|법인|지사)|Korea\s+(?:office|branch|subsidiary))/i.test(clean(text,5000));
}
function stripHtml(value=''){
  return clean(String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'"),18000);
}
async function fetchText(url='', timeoutMs=5000){
  if(!/^https?:\/\//i.test(url)||BLOCKED_HOSTS.has(rootHost(url)))return '';
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{redirect:'follow',cache:'no-store',signal:controller.signal,headers:{'User-Agent':'Mozilla/5.0 KoreaAgent/BCWW-SmartHunt','Accept':'text/html,text/plain,application/xml;q=0.8,*/*;q=0.5'}});
    if(!response.ok)return '';
    return stripHtml((await response.text()).slice(0,500000));
  }catch{return '';}finally{clearTimeout(timer);}
}
function normalizeRows(groups=[]){
  const by=new Map();
  for(const row of groups.flat()){
    const url=clean(row?.url,700); if(!/^https?:\/\//i.test(url)||BLOCKED_HOSTS.has(rootHost(url)))continue;
    const key=url.replace(/\/$/,'');
    const next={title:clean(row?.title,300),url,content:clean(row?.content||row?.snippet||row?.description,12000),published_date:clean(row?.published_date,80),source:clean(row?.source,60)||'web',score:Number(row?.score)||0};
    const prev=by.get(key); by.set(key,prev?{...prev,content:clean(`${prev.content} ${next.content}`,16000),score:Math.max(prev.score,next.score)}:next);
  }
  return [...by.values()].sort((a,b)=>b.score-a.score);
}
async function discoveryRows(cycle=0){
  const batch=QUERY_BATCHES[Math.abs(Number(cycle)||0)%QUERY_BATCHES.length];
  const publicTask=publicWebSearchMany(batch,{maxResults:14,timeRange:'year',topic:'general'}).catch(()=>({results:[]}));
  const pageStart=Math.abs(Number(cycle)||0)%DIRECT_ARCHIVE_PAGES.length;
  const pageUrls=[DIRECT_ARCHIVE_PAGES[pageStart],DIRECT_ARCHIVE_PAGES[(pageStart+1)%DIRECT_ARCHIVE_PAGES.length]];
  const archiveTask=Promise.all(pageUrls.map(async url=>({title:'VIPO JLOX+ BCWW participation archive',url,content:await fetchText(url),source:'vipo_archive',score:0.99})));
  const [pub,archives]=await Promise.all([publicTask,archiveTask]);
  return normalizeRows([pub?.results||[],archives.filter(x=>x.content)])
    .filter(row=>BCWW.test(`${row.title} ${row.content}`))
    .slice(0,40)
    .map((row,index)=>({...row,id:`r${index}`}));
}
function exactQuoteSupported(quote='',row={}){
  const q=clean(quote,1200).toLowerCase(), text=clean(`${row.title} ${row.content}`,18000).toLowerCase();
  return q.length>=12&&text.includes(q);
}
async function aiExtract(rows=[]){
  if(!rows.length||!aiConfigured())return [];
  const prompt=`Find real foreign companies that are useful BCWW 2026 teamwear sales leads from these web rows.\n\nWe need TWO evidence tiers:\n1) confirmed2026: the company itself is explicitly exhibiting/attending/participating/showcasing/pitching at BCWW 2026.\n2) recurrence2025: the company itself actually exhibited/attended/participated at BCWW 2025. This is NOT a 2026 confirmation; it is a repeat-attendance prospect.\n\nEspecially accept factual 2025 participation records from VIPO/JLOX case pages and company-owned pages such as a company's 'markets we participate' page.\n\nREJECT:\n- application/recruitment/registration-open notices\n- followers, shown-interest, 10times visitor lists\n- organizers that only advertise BCWW\n- Korean companies or Korean subsidiaries\n- generic industry companies with no BCWW participation evidence\n- guesses.\n\nFor evidence_quote COPY an exact short excerpt from the row tying that company to BCWW 2025/2026 participation.\nReturn JSON only: {"items":[{"row_id":"r0","company":"company name","country":"Japan or empty","tier":"confirmed2026|recurrence2025","evidence_quote":"exact quote","confidence":92}]}.\nOnly confidence >= 86.\n\nROWS:\n${JSON.stringify(rows.map(r=>({row_id:r.id,title:r.title,url:r.url,text:clean(r.content,7000)})))}`;
  try{
    const out=await chatJson({prompt,maxTokens:3200,timeoutMs:32000,hardDeadlineMs:42000,temperature:0});
    return (out?.data?.items||[]).map(x=>({row_id:clean(x.row_id,20),company:clean(x.company,180),country:clean(x.country,80),tier:clean(x.tier,30),evidence_quote:clean(x.evidence_quote,1200),confidence:Number(x.confidence)||0}))
      .filter(x=>x.company&&x.evidence_quote&&x.confidence>=86&&['confirmed2026','recurrence2025'].includes(x.tier));
  }catch{return [];}
}
function displayCompanyFromTitle(title='',domain=''){
  let value=clean(title,160).replace(/\s+[|–—-]\s+.*$/,'').replace(/\s*\|\s*LinkedIn.*$/i,'').trim();
  if(!value||value.length<2)value=rootHost(domain).split('.')[0]||'';
  return value;
}
function deterministicOwned(rows=[]){
  return rows.flatMap(row=>{
    const domain=rootHost(row.url), text=clean(`${row.title} ${row.content}`,16000);
    if(!domain||sourceLike(domain)||isKorean(domain,text)||RECRUITMENT.test(text)||INTEREST_ONLY.test(text))return [];
    const tier=BCWW_2026.test(text)&&PARTICIPATION.test(text)?'confirmed2026':BCWW_2025.test(text)&&PARTICIPATION.test(text)?'recurrence2025':'';
    if(!tier)return [];
    const company=displayCompanyFromTitle(row.title,domain); if(!company||BCWW.test(company))return [];
    const pos=text.toLowerCase().indexOf('bcww'); const quote=pos>=0?clean(text.slice(Math.max(0,pos-260),pos+520),900):'';
    return quote?[{row_id:row.id,company,country:countryFrom(domain,text),tier,evidence_quote:quote,confidence:90}]:[];
  });
}
function companyTokens(value=''){
  return clean(value,180).toLowerCase().replace(/株式会社|有限会社|合同会社|一般社団法人|inc\.?|ltd\.?|limited|corp\.?|corporation|company|co\.?/giu,' ').replace(/[^\p{L}\p{N}]+/gu,' ').split(/\s+/u).filter(x=>x.length>=2);
}
function rowMentionsCompany(company='',row={}){
  const text=clean(`${row.title} ${row.content}`,12000).toLowerCase(), tokens=companyTokens(company);
  return tokens.length?tokens.some(t=>text.includes(t)):false;
}
async function resolveDomain(item={},source={},excludes=new Set()){
  const sourceDomain=rootHost(source.url);
  if(sourceDomain&&!sourceLike(sourceDomain)&&!isKorean(sourceDomain,`${source.title} ${source.content}`)&&rowMentionsCompany(item.company,source)&&!excludes.has(normalizeCompanyKey(sourceDomain)))return {domain:sourceDomain,url:`https://${sourceDomain}/`};
  const query=`"${clean(item.company,160)}" official website${item.country?` ${item.country}`:''}`;
  const result=await publicWebSearch(query,{maxResults:8,timeRange:'year',topic:'general'}).catch(()=>({results:[]}));
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
    fetchText(base,4200),fetchText(`${base}contact`,4200),
    publicWebSearch(`site:${rootHost(domain)} "@${rootHost(domain)}" sales international distribution licensing business`,{maxResults:8,timeRange:'year',topic:'general'}).catch(()=>({results:[]}))
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
  const relation=current?'BCWW 2026 현재 참가 근거 자동 확인':'BCWW 2025 실제 참가 · 2026 재참가 확인 대상';
  return {
    id:`bcww:${current?'confirmed':'recurrence'}:${domain}`,campaign:'bcww',campaign_label:'BCWW 단체복',company,domain,url:candidate.url||`https://${domain}/`,
    source_url:clean(candidate.source?.url,700),source_title:clean(candidate.source?.title,300),evidence_urls:[clean(candidate.source?.url,700)].filter(Boolean),
    evidence_grade:current?'A':'R2025_WEB',evidence_reason:relation,signal:clean(candidate.evidence_quote,1200),score:current?96:88,sales_priority:current?98:90,
    verified_company:true,bcww_confirmed:current,bcww_participation_confirmed:current,bcww_relation_confirmed:false,bcww_sales_candidate:true,bcww_outreach_tier:current?'confirmed':'recurrence',bcww_interest:false,
    team_origin:'foreign',team_origin_country:candidate.country||countryFrom(domain,`${candidate.source?.title||''} ${candidate.source?.content||''}`),outreach_language:'en',
    recommended_role:contact?.title||'International Sales / Marketing',role_targets:ROLE_TARGETS,contact,contacts:contactResult.contacts||[contact].filter(Boolean),contact_provider:contactResult.provider||null,
    contact_status:contact?'found':'failed',contact_failure_reason:contact?'':'이메일 탐색 미완료',contact_score_threshold:75,
    subject:current?`BCWW 2026 Seoul teamwear for ${company}`:'Are you returning to BCWW 2026? — local teamwear in Seoul',
    message_en:current
      ?`Hi ${company} team,\n\nI saw that your team is participating in BCWW 2026 in Seoul this September. We produce branded T-shirts, polos and staff wear locally in Seoul and can deliver directly to COEX or your hotel.\n\nIf teamwear is still open, I can send simple local pricing and turnaround options.`
      :`Hi ${company} team,\n\nI saw that your team participated in BCWW in Seoul last year. Are you returning for BCWW 2026 this September?\n\nIf so, we produce branded T-shirts, polos and staff wear locally in Seoul and can deliver directly to COEX or your hotel, avoiding overseas shipping and customs.\n\nIf your 2026 plans are confirmed, I can send simple pricing and turnaround options.`,
    message_ko:''
  };
}
async function smartDiscover(body={}){
  const excludes=await historyExcludes(body), rows=await discoveryRows(body.cycle||0), rowById=new Map(rows.map(r=>[r.id,r]));
  const [ai,owned]=await Promise.all([aiExtract(rows),Promise.resolve(deterministicOwned(rows))]);
  const raw=[...owned,...ai],deduped=[];const seen=new Set();
  for(const item of raw){
    const source=rowById.get(item.row_id);if(!source||!exactQuoteSupported(item.evidence_quote,source)||RECRUITMENT.test(item.evidence_quote)||INTEREST_ONLY.test(item.evidence_quote))continue;
    const key=`${item.tier}:${clean(item.company,180).toLowerCase()}`;if(seen.has(key))continue;seen.add(key);deduped.push({...item,source});
  }
  const resolved=(await mapLimit(deduped.slice(0,14),4,async item=>{
    const official=await resolveDomain(item,item.source,excludes);if(!official)return null;
    const domain=rootHost(official.domain);if(!domain||excludes.has(normalizeCompanyKey(domain))||isKorean(domain,`${item.source.title} ${item.source.content}`))return null;
    const country=item.country||countryFrom(domain,`${item.source.title} ${item.source.content}`)||(rootHost(item.source.url)==='vipo.or.jp'?'Japan':'');
    if(!country)return null;
    return {...item,...official,domain,country};
  }))).filter(Boolean);
  const unique=[];const domains=new Set();for(const item of resolved){if(domains.has(item.domain))continue;domains.add(item.domain);unique.push(item);}
  const contactRows=(await mapLimit(unique.slice(0,8),3,async candidate=>({candidate,contactResult:await attachContact(candidate)}))).filter(Boolean);
  const leads=contactRows.map(x=>makeLead(x.candidate,x.contactResult)).sort((a,b)=>Number(Boolean(b.contact))-Number(Boolean(a.contact))||Number(b.bcww_participation_confirmed)-Number(a.bcww_participation_confirmed)||Number(b.sales_priority)-Number(a.sales_priority)).slice(0,8);
  return {leads,meta:{raw_search_results:rows.length,smart_extracted:deduped.length,smart_resolved:unique.length,smart_contact_ready:leads.filter(x=>x.contact?.email).length,smart_recurrence:leads.filter(x=>x.bcww_outreach_tier==='recurrence').length,smart_confirmed:leads.filter(x=>x.bcww_participation_confirmed===true).length,smart_sources:[...new Set(rows.map(x=>x.source).filter(Boolean))]}};
}

export async function POST(request){
  let body={};try{body=await request.clone().json();}catch{}
  if(body.seedsOnly)return seedPost(request);
  try{
    const result=await smartDiscover(body);
    return Response.json({campaign:'bcww',campaign_label:'BCWW 단체복',leads:result.leads,meta:{...result.meta,returned:result.leads.length,evidence_verified_companies:result.leads.length,contact_ready:result.leads.filter(x=>x.contact?.email).length,contact_unresolved:result.leads.filter(x=>!x.contact?.email).length,pipeline_mode:'live 2026 confirmation + verified 2025 repeat-exhibitor discovery',truth_policy:'2025 participants are recurrence prospects only and never labeled as confirmed BCWW 2026 participants'}},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    console.error('bcww smart hunt failed',clean(error?.message||error,500));
    return Response.json({error:'BCWW 자동사냥 중 오류가 발생했습니다.',detail:clean(error?.message||error,300)},{status:502,headers:{'Cache-Control':'no-store'}});
  }
}
