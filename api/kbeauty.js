import { aiConfigured, chatJson } from '../lib/ai-provider.js';
import {
  buildGlobalExclusions, clean, fetchPage, isKoreanCountry, mapLimit, normalizeCompanyKey,
  resolveOfficialWebsite, rootHost, suppressExactSent, textMatchesCompany, verifyForeignEntity
} from '../lib/international-event-campaign.js';

const EVENT = { name:'K-Beauty Expo Korea 2026', dates:'2026-10-15–2026-10-17', venue:'KINTEX, Goyang, Korea' };
const OFFICIAL_DOMAINS = new Set(['kbeautyexpo.com','k-beautyexpo.co.kr']);
const OFFICIAL_HOME = 'https://kbeautyexpo.com/fairDash.do?hl=ENG';
const SOURCE_2025_LIST = 'https://www.scribd.com/document/1032630294/K-Beauty-Expo-Korea-2025-Exhibitor-s-List';
const TAVILY_URL = 'https://api.tavily.com/search';
const SEEDS = [
  OFFICIAL_HOME,
  'https://kbeautyexpo.com/fairDash.do?hl=KOR',
  'https://www.k-beautyexpo.co.kr/fairDash.do?hl=ENG',
  'https://www.k-beautyexpo.co.kr/fairDash.do?hl=KOR'
];
const CURRENT = /(?:K-?Beauty\s+Expo(?:\s+Korea)?[^\n]{0,120}2026|2026[^\n]{0,120}K-?Beauty\s+Expo|2026[.\-/\s]*(?:10|Oct(?:ober)?)[.\-/\s]*(?:15|16|17))/i;
const PARTICIPATION = /(exhibitor|exhibiting|participat|booth|stand|buyer|procurement|delegation|sponsor|pavilion|참가|출전|바이어|구매단|초청|出展|参加|參展|买家|買家)/i;
const DIRECTORY = /(fairCorp|corpList|exhibitor|participant|company|참가업체|참가사)/i;
const BAD_SOURCE = /(?:linkedin\.com|facebook\.com|instagram\.com|youtube\.com|x\.com|twitter\.com|wikipedia\.org|10times\.com|eventbrite\.|medium\.com|made-in-china\.com|globalsources\.com|tradeindia\.com|exporthub\.com|tradekey\.com)/i;

// Exact foreign exhibitors from the 2025 K-Beauty Expo Korea exhibitor list.
// Country-pavilion membership is preserved as the foreign-origin proof for pavilion rows.
// These are NEVER represented as confirmed 2026 attendees.
const REPEAT_2025 = [
  ['AJMAL PERFUMES','United Arab Emirates'],
  ['Alibaba.com','China'],
  ['BRIGHT SMART PACKAGING AND MACHINERY SDN BHD','Malaysia'],
  ['DOUYIN EC GLOBAL','China'],
  ['EGYCOTTON FOR COTTON PRODUCTS','Egypt'],
  ['Laboratoire Gilbert','France'],
  ['MORIRIN CO., LTD.','Japan'],
  ['PTN Healthcare GmbH','Germany'],
  ['BULGARIAN ROSE PLC','Bulgaria'],
  ['Volenta Cosmetics Ltd','Bulgaria'],
  ['GUANGZHOU KEHUA PLASTIC PRODUCTS CO., LTD.','China'],
  ['ANHUI XIJINGKE OPTOELECTRONIC TECHNOLOGY.,LTD','China'],
  ['DONGGUAN PENGCHENG JES PACKAGING PRODUCT CO.,LTD','China'],
  ['GuangDong Lianxin Glass Products Co., Ltd.','China'],
  ['GUANGDONG MINGDUN ENVIRONMENTAL TECHNOLOGY CO., LTD.','China'],
  ['Guang Dong Qiao Lei Packing Technology CO.,LTD','China'],
  ['Guangzhou Huayu Plastic Products Co., Ltd.','China'],
  ['Guangzhou Huimei Plastic Products Technology Co., Ltd','China'],
  ['GUANGZHOU JINGHUA CRYSTAL GLASS CO.,LTD','China'],
  ['GUANGZHOU JXPACK TECHNOLOGY CO.,LTD.','China'],
  ['Guangzhou Kangyue Packaging Products Co,.Ltd','China'],
  ['GUANGZHOU KEYUAN PLASTICWARE CO., LTD.','China'],
  ['GUANGZHOU LEJIA HONG PACKAGING CO.,LTD','China'],
  ['Guangzhou Lianpu Nonwoven Product Co., Ltd.','China'],
  ['Guangzhou Liyanzhuang Biotechnology Co., Ltd','China'],
  ['GUANGZHOU LVFANGZHOU INDUSTRIAL CO.,LTD','China'],
  ['GUANGZHOU MENOL PLASTIC CO.,LTD','China'],
  ['Guangzhou Muze Packaging Solutions Technology Co,. Ltd','China'],
  ['Guangzhou Qiaoneng Plastic Prduct Co.,Ltd','China'],
  ['GUANGZHOU YUANFENG PLASTIC INDUSTRY CO., LTD.','China'],
  ['HANGZHOU QUMAO TRADE CO.,LTD','China'],
  ['IMS PACKAGING','China'],
  ['JIANGSU HUANYA SPRAY PLASTIC INDUSTRY CO.,LTD','China'],
  ['JIANGXI XIRUI MANUFACTURING CO.,LTD','China'],
  ['JINHUA ZHAOYI PLASTIC CO.,LTD','China'],
  ['NINGBO JINBAOLU COMMODITY CO.,LTD.','China'],
  ['NINGBO LONGWAY PACKAGING S&T CO.,LTD.','China'],
  ['SHANGHAI MEANLOVE BIO-TECH CO.,LTD','China'],
  ['SHENZHEN BAICHANG TECHNOLOGY CO.,LTD','China'],
  ['SHENZHEN DW COSMETICS CO.,LTD','China'],
  ['SHENZHEN MTIMES ELECTRONIC TECHNOLOGY CO., LTD.','China'],
  ['Suzhou Valcon Industries CO.,LTD','China'],
  ['YUYAO DINGYU PLASTIC CO.,LTD','China'],
  ['YUYAO WELLPACK SPRAYER CO ., LTD','China'],
  ['ZHEJIANG MEGEE INDUSTRIAL CO., LTD.','China'],
  ['ZHUHAI BAOLI FOAM SPRAY PUMP CO., LTD.','China'],
  ['BO HUI BIOTECH CO., LTD.','Taiwan'],
  ['CHIME Beauty CO., LTD.','Taiwan'],
  ['STAR CLEANLY BIOCHEMICAL TECHNOLOGY CO.,LTD.','Taiwan'],
  ['3B INTERNATIONAL COMPANY, LIMITED','Taiwan'],
  ['ANRUTI CO., LTD.','Taiwan'],
  ['TOP WANG INTERNATIONAL TRADING CO., LTD.','Taiwan'],
  ["SHAAN HONQ INT'L COSMETICS CORP.",'Taiwan'],
  ['HSIN YUNG PLASTIC INDUSTRIAL CO., LTD.','Taiwan'],
  ['CPACK SUNLIGHT INTERNATIONAL INDUSTRIAL CO., LTD.','Taiwan'],
  ['Japan Technology Co., Ltd (KOCHIGOLD)','Vietnam'],
  ['MEKONG HERBALS CORPORATION','Vietnam'],
  ['MISS EDE','Vietnam']
];

// A few high-confidence company-owned domains remove needless search calls and give the
// first cycle immediately usable company URLs. They are historical 2025 exhibitors only.
const DOMAIN_HINTS = new Map([
  ['ajmal perfumes','ajmal.com'],
  ['alibaba.com','alibaba.com'],
  ['laboratoire gilbert','groupe-gilbert.fr'],
  ['moririn co., ltd.','moririn.co.jp'],
  ['ptn healthcare gmbh','ptn-healthcare.de'],
  ['bulgarian rose plc','bulgarianrose.bg'],
  ['ims packaging','imspackaging.com']
]);

const official = value => OFFICIAL_DOMAINS.has(rootHost(value));
const canonical = value => { try { const u = new URL(value); u.hash=''; return u.toString(); } catch { return ''; } };
const companyKey = value => clean(value,180).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();

async function tavilySearch(query,{maxResults=8,timeRange=null,includeDomains=[],excludeDomains=[]}={}) {
  const key=String(process.env.TAVILY_API_KEY||'').trim();
  if(!key) return {results:[]};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),11000);
  try{
    const response=await fetch(TAVILY_URL,{
      method:'POST',
      headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        query:clean(query,500),search_depth:'basic',max_results:maxResults,topic:'general',
        time_range:timeRange||undefined,include_answer:false,include_raw_content:false,
        include_domains:includeDomains,exclude_domains:excludeDomains
      }),
      signal:controller.signal,cache:'no-store'
    });
    if(!response.ok) return {results:[]};
    const data=await response.json();
    return {results:(Array.isArray(data?.results)?data.results:[]).map(row=>({
      title:clean(row?.title,260),url:clean(row?.url,500),content:clean(row?.content,1200),score:Number(row?.score)||0,published_date:clean(row?.published_date,60)
    })).filter(row=>/^https?:\/\//i.test(row.url))};
  }catch{return {results:[]};}
  finally{clearTimeout(timer);}
}

async function tavilySearchMany(queries,options={}) {
  const settled=await Promise.allSettled((Array.isArray(queries)?queries:[]).slice(0,6).map(query=>tavilySearch(query,options)));
  const all=settled.flatMap(item=>item.status==='fulfilled'?item.value.results:[]);
  const seen=new Set();
  return {results:all.filter(row=>{const key=row.url.replace(/\/$/,'');if(!key||seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>b.score-a.score)};
}

function pageVariants(url='') {
  try {
    const base = new URL(url);
    if (!/fairCorpList\.do/i.test(base.pathname)) return [];
    return Array.from({ length:25 }, (_,i) => {
      const u = new URL(base);
      u.searchParams.set('selPageNo', String(i + 1));
      return u.toString();
    });
  } catch { return []; }
}

async function crawlCurrentDirectory() {
  const seeds = (await mapLimit(SEEDS,4,url => fetchPage(url,{ timeoutMs:6500,maxBytes:800000 }))).filter(Boolean);
  const currentPages = seeds.filter(page => official(page.url) && CURRENT.test(page.text || ''));
  const urls = new Map();
  for (const page of currentPages) for (const link of page.links || []) {
    if (official(link.url) && DIRECTORY.test(`${link.url} ${link.text || ''}`)) urls.set(canonical(link.url),link.url);
  }
  for (const url of [...urls.values()]) for (const variant of pageVariants(url)) urls.set(canonical(variant),variant);
  const pages = (await mapLimit([...urls.values()].slice(0,90),6,url => fetchPage(url,{ timeoutMs:6500,maxBytes:800000 }))).filter(Boolean);
  return { seedLoaded:seeds.length,currentPages:currentPages.length,pages:[...new Map(pages.map(p=>[canonical(p.url),p])).values()] };
}

function cleanName(value='') {
  const name = clean(value,160).replace(/^[\s•·|–—-]+|[\s•·|–—-]+$/g,'');
  if (!name || name.length < 2 || name.length > 140) return '';
  if (/^(?:home|about|contact|search|more|detail|view|next|previous|english|korean|한국어|목록|상세|검색|전체|company|companies|exhibitors?|participants?|참가업체|참가사|업체)$/i.test(name)) return '';
  return name;
}

async function extractCurrentDirectory(pages=[]) {
  const direct=[];
  for (const page of pages) for (const link of page.links || []) {
    if (!official(link.url) || !DIRECTORY.test(link.url)) continue;
    const company=cleanName(link.text);
    if (company) direct.push({ company,country:'',source:{ url:page.url,title:'K-Beauty Expo Korea 2026 official directory' },sourcePage:page,tier:'current_2026' });
  }
  if (!pages.length || !aiConfigured()) return direct;
  const chunks=[]; for(let i=0;i<pages.length;i+=10) chunks.push(pages.slice(i,i+10));
  const aiRows=(await mapLimit(chunks,3,async(chunk,ci)=>{
    const rows=chunk.map((page,i)=>({ id:`d${ci}-${i}`,url:page.url,text:clean(page.text,8500) }));
    const prompt=`Extract only named CURRENT 2026 K-Beauty Expo Korea exhibitors from these official exhibitor-directory pages. Never infer attendance. Reject past exhibitors, buyers, menus, organizers and application text. JSON only: {"items":[{"id":"d0-0","company":"exact name","country":"","confidence":95}]}. confidence >=90 only. ROWS:\n${JSON.stringify(rows)}`;
    try{
      const result=await chatJson({ prompt,maxTokens:2800,timeoutMs:30000,temperature:0,hardDeadlineMs:42000 });
      const byId=new Map(rows.map((r,i)=>[r.id,chunk[i]]));
      return (Array.isArray(result?.data?.items)?result.data.items:[]).map(item=>{
        const company=cleanName(item?.company), page=byId.get(clean(item?.id,50));
        if(!company||!page||Number(item?.confidence)<90||!textMatchesCompany(company,page.text)) return null;
        return { company,country:clean(item?.country,80),source:{ url:page.url,title:'K-Beauty Expo Korea 2026 official directory' },sourcePage:page,tier:'current_2026' };
      }).filter(Boolean);
    }catch{return [];}
  })).flat();
  return [...direct,...aiRows];
}

async function discoverCurrentWeb() {
  if (!aiConfigured()) return [];
  const queries=[
    '"K-Beauty Expo Korea 2026" exhibitor OR exhibiting OR booth',
    '"K-Beauty Expo Korea 2026" buyer OR delegation OR sponsor',
    '"K-뷰티엑스포 코리아 2026" 참가 업체 해외',
    '"K-Beauty Expo Korea" 2026 出展',
    '"K-Beauty Expo Korea" 2026 參展'
  ];
  const searched=await tavilySearchMany(queries,{ maxResults:16,timeRange:'year',excludeDomains:['linkedin.com','facebook.com','instagram.com','youtube.com','x.com','twitter.com','wikipedia.org','10times.com','eventbrite.com','medium.com'] });
  const rows=(Array.isArray(searched?.results)?searched.results:[]).map((row,i)=>({
    id:`w${i}`,url:clean(row?.url,500),title:clean(row?.title,260),text:clean(`${row?.title||''} ${row?.content||''}`,6500)
  })).filter(row=>row.url&&!BAD_SOURCE.test(rootHost(row.url))&&CURRENT.test(row.text)&&PARTICIPATION.test(row.text));
  if(!rows.length) return [];
  const prompt=`Extract only a named FOREIGN company, brand, buyer, platform or sponsor that the row explicitly connects to CURRENT K-Beauty Expo Korea 2026 participation/invitation. Do not use generic industry names or past attendance. Do not invent country. JSON only: {"items":[{"id":"w0","company":"exact company","country":"","confidence":92}]}. confidence >=90. ROWS:\n${JSON.stringify(rows)}`;
  try{
    const result=await chatJson({ prompt,maxTokens:2600,timeoutMs:30000,temperature:0,hardDeadlineMs:42000 });
    const byId=new Map(rows.map(r=>[r.id,r]));
    return (Array.isArray(result?.data?.items)?result.data.items:[]).map(item=>{
      const row=byId.get(clean(item?.id,50)), company=cleanName(item?.company);
      if(!row||!company||Number(item?.confidence)<90||!textMatchesCompany(company,row.text)) return null;
      return { company,country:clean(item?.country,80),source:{ url:row.url,title:row.title||'2026 participation evidence' },sourcePage:null,tier:'current_2026' };
    }).filter(Boolean);
  }catch{return [];}
}

function uniqueByName(rows=[]) {
  const seen=new Set();
  return rows.filter(row=>{
    const key=companyKey(row.company);
    if(!key||seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function repeatSlice(cycle=1,size=36) {
  const start=((Math.max(1,Number(cycle)||1)-1)*size)%REPEAT_2025.length;
  return Array.from({length:Math.min(size,REPEAT_2025.length)},(_,i)=>REPEAT_2025[(start+i)%REPEAT_2025.length]).map(([company,country])=>({
    company,country,tier:'repeat_2025',source:{ url:SOURCE_2025_LIST,title:'K-Beauty Expo Korea 2025 exhibitor list' },sourcePage:null
  }));
}

function hintFor(company='') {
  return DOMAIN_HINTS.get(companyKey(company)) || '';
}

async function tavilyOfficialWebsite(company='',country='',excludes=new Set()) {
  const hinted=hintFor(company);
  if(hinted && !excludes.has(normalizeCompanyKey(hinted))) {
    const page=await fetchPage(`https://${hinted}/`,{timeoutMs:4500,maxBytes:180000});
    return {domain:hinted,url:`https://${hinted}/`,page,source:'verified-domain-hint'};
  }

  const result=await tavilySearch(`"${clean(company,160)}" official website ${clean(country,80)}`,{
    maxResults:7,timeRange:null,excludeDomains:['linkedin.com','facebook.com','instagram.com','youtube.com','x.com','twitter.com','wikipedia.org','10times.com','eventbrite.com','medium.com','made-in-china.com','globalsources.com','tradeindia.com','exporthub.com','tradekey.com']
  });
  for(const row of result.results||[]) {
    const domain=rootHost(row.url);
    if(!domain||OFFICIAL_DOMAINS.has(domain)||domain.endsWith('.kr')||excludes.has(normalizeCompanyKey(domain))||BAD_SOURCE.test(domain)) continue;
    const evidence=`${row.title||''} ${row.content||''} ${row.url||''}`;
    if(!textMatchesCompany(company,evidence)) continue;
    const page=await fetchPage(row.url,{timeoutMs:5000,maxBytes:220000});
    if(page && textMatchesCompany(company,`${page.text} ${evidence}`)) return {domain,url:`https://${domain}/`,page,source:'tavily-official-resolution'};
    // Tavily title/snippet is enough only when the company name is directly supported and the result is the domain root/near-root.
    try{
      const u=new URL(row.url);
      const shallow=u.pathname==='/'||u.pathname.split('/').filter(Boolean).length<=1;
      if(shallow && Number(row.score||0)>=0.65) return {domain,url:`https://${domain}/`,page:null,source:'tavily-official-resolution'};
    }catch{}
  }
  return null;
}

async function resolveCandidate(row,excludes=new Set(),{preserveUnresolved=false}={}) {
  let website=null;
  if(row.sourcePage) website=await resolveOfficialWebsite(row.company,row.country||'',row.sourcePage.links||[],excludes,[...OFFICIAL_DOMAINS]);
  if(!website) website=await tavilyOfficialWebsite(row.company,row.country||'',excludes);

  if(!website) {
    if(preserveUnresolved && row.tier==='repeat_2025' && row.country && !isKoreanCountry(row.country)) {
      return {...row,country:row.country,domain:'',url:'',website_unresolved:true};
    }
    return null;
  }

  const domain=normalizeCompanyKey(website.domain);
  if(!domain||excludes.has(domain)||domain.endsWith('.kr')) return null;

  if(row.tier==='repeat_2025' && row.country && !isKoreanCountry(row.country)) {
    return { ...row,country:row.country,domain:website.domain,url:website.url,website_unresolved:false };
  }

  const foreign=await verifyForeignEntity({ company:row.company,website,sourceText:row.sourcePage?.text||'',countryHint:row.country||'' });
  if(!foreign||isKoreanCountry(foreign.country)) return null;
  return { ...row,country:foreign.country,domain:foreign.domain,url:foreign.url,website_unresolved:false };
}

async function resolvePool(rows=[],excludes=new Set(),options={}) {
  const resolved=(await mapLimit(uniqueByName(rows).slice(0,90),6,row=>resolveCandidate(row,excludes,options))).filter(Boolean);
  const seen=new Set();
  return resolved.filter(row=>{
    const key=normalizeCompanyKey(row.domain)||`company:${companyKey(row.company)}`;
    if(!key||seen.has(key)) return false;
    seen.add(key);return true;
  });
}

function makeLead(candidate) {
  const company=clean(candidate.company,180),domain=rootHost(candidate.domain),confirmed=candidate.tier==='current_2026';
  const idKey=domain||companyKey(company).replace(/\s+/g,'-').slice(0,100);
  const message=confirmed
    ? `Hi,\n\nI saw that ${company} is connected to K-Beauty Expo Korea 2026 this October.\n\nHave you already sorted branded staff shirts or team wear for your Korea team?\n\nWe produce custom apparel locally in Korea and can deliver directly to KINTEX or your hotel, so your team does not need to ship boxes internationally.\n\nIf it is still open, I can send a few simple options with pricing and turnaround.`
    : `Hi,\n\nI saw that ${company} exhibited at K-Beauty Expo Korea last year. Are you coming back for the 2026 show this October?\n\nIf yes, have you already sorted branded staff shirts or team wear for your Korea team? We produce custom apparel locally in Korea and can deliver directly to KINTEX or your hotel.\n\nIf useful, I can send a few simple options with pricing and turnaround.`;
  return {
    id:`kbeauty:${idKey}`,campaign:'kbeauty',campaign_label:'K-Beauty Expo Korea 2026 단체복',
    company,domain,url:candidate.url||'',source_url:clean(candidate.source?.url,500),source_title:clean(candidate.source?.title,260),
    score:0,sales_priority:0,verified_company:true,kbeauty_eligible:true,kbeauty_confirmed:confirmed,kbeauty_repeat_prospect:!confirmed,
    website_unresolved:Boolean(candidate.website_unresolved),attendance_tier:confirmed?'2026_confirmed':'2025_repeat_prospect',team_origin:'foreign',team_origin_country:clean(candidate.country,80),outreach_language:'en',
    signal:confirmed?'2026 K-Beauty Expo 직접 참가/초청 신호':'2025 K-Beauty Expo 실제 해외 참가사 · 2026 재참가 확인 대상',
    recommended_role:'Marketing / Events',role_targets:['Marketing Director','Brand Manager','Events Manager','International Sales','Export Manager','Partnerships','Founder','CEO'],
    subject:confirmed?'Quick question about your K-Beauty Expo Korea team':'Are you returning to K-Beauty Expo Korea in 2026?',
    message_en:message,message_ko:'',contact:null,contacts:[],contact_status:domain?'pending':'website_pending'
  };
}

export async function POST(request) {
  let body={}; try{body=await request.json();}catch{return Response.json({error:'요청 형식이 잘못됐습니다.'},{status:400});}
  const cycle=Math.max(1,Number(body.cycle)||1),targetFloor=Math.max(20,Number(body.targetFloor)||20),currentCount=Math.max(0,Number(body.currentCount)||0);
  const history=await buildGlobalExclusions(Array.isArray(body.excludeDomains)?body.excludeDomains:[]);
  try{
    const currentDir=await crawlCurrentDirectory();
    const [directoryRows,webRows]=await Promise.all([extractCurrentDirectory(currentDir.pages),discoverCurrentWeb()]);
    const currentResolved=await resolvePool([...directoryRows,...webRows],history.set,{preserveUnresolved:false});
    const need=Math.max(0,targetFloor-currentCount-currentResolved.length);
    const repeatRows=repeatSlice(cycle,Math.min(52,Math.max(32,need+18)));
    // Historical participation is already verified by the event list. Website resolution improves email recovery,
    // but failure to resolve a website must never erase a valid candidate company.
    const repeatResolved=await resolvePool(repeatRows,history.set,{preserveUnresolved:true});
    const all=[...currentResolved,...repeatResolved];
    const seen=new Set(),provisional=[];
    for(const candidate of all){
      const domain=normalizeCompanyKey(candidate.domain);
      const key=domain||`company:${companyKey(candidate.company)}`;
      if(!key||seen.has(key)||(domain&&history.set.has(domain))) continue;
      seen.add(key); provisional.push(makeLead(candidate));
      if(provisional.length>=40) break;
    }
    const exact=await suppressExactSent(provisional,history.secret);
    return Response.json({
      campaign:'kbeauty',campaign_label:'K-Beauty Expo Korea 2026 단체복',leads:exact.leads,
      meta:{ event:EVENT,cycle,target_floor:targetFloor,current_count:currentCount,
        official_seed_pages_loaded:currentDir.seedLoaded,official_current_event_pages:currentDir.currentPages,official_directory_pages:currentDir.pages.length,
        current_2026_candidates:currentResolved.length,repeat_2025_checked:repeatRows.length,repeat_2025_candidates:repeatResolved.length,
        website_resolved:exact.leads.filter(lead=>lead.domain).length,website_unresolved:exact.leads.filter(lead=>!lead.domain).length,
        returned:exact.leads.length,sent_preexcluded:history.sent.length,deleted_preexcluded:history.deleted.length,sent_exact_suppressed:exact.suppressed,
        search_provider:process.env.TAVILY_API_KEY?'tavily':'none',
        candidate_policy:'2026 current evidence first; then verified 2025 foreign exhibitors as explicitly-labelled 2026 repeat prospects; website failure does not delete verified historical candidates',
        email_policy:'email discovery runs after company/domain resolution; guessed emails forbidden'
      }
    },{headers:{'Cache-Control':'no-store'}});
  }catch(error){return Response.json({error:clean(error?.message||error,400)||'K-Beauty 후보 검색에 실패했습니다.'},{status:Number(error?.status)||502});}
}
