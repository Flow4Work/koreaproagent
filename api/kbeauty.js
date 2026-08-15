import { aiConfigured, chatJson } from '../lib/ai-provider.js';
import {
  buildGlobalExclusions, clean, fetchPage, isKoreanCountry, mapLimit, normalizeCompanyKey,
  publicWebSearchMany, resolveOfficialWebsite, rootHost, suppressExactSent,
  textMatchesCompany, verifyForeignEntity
} from '../lib/international-event-campaign.js';

const EVENT = { name:'K-Beauty Expo Korea 2026', dates:'2026-10-15–2026-10-17', venue:'KINTEX, Goyang, Korea' };
const OFFICIAL_DOMAINS = new Set(['kbeautyexpo.com','k-beautyexpo.co.kr']);
const OFFICIAL_HOME = 'https://kbeautyexpo.com/fairDash.do?hl=ENG';
const SOURCE_2025_LIST = 'https://www.scribd.com/document/1032630294/K-Beauty-Expo-Korea-2025-Exhibitor-s-List';
const SEEDS = [
  OFFICIAL_HOME,
  'https://kbeautyexpo.com/fairDash.do?hl=KOR',
  'https://www.k-beautyexpo.co.kr/fairDash.do?hl=ENG',
  'https://www.k-beautyexpo.co.kr/fairDash.do?hl=KOR'
];
const CURRENT = /(?:K-?Beauty\s+Expo(?:\s+Korea)?[^\n]{0,120}2026|2026[^\n]{0,120}K-?Beauty\s+Expo|2026[.\-/\s]*(?:10|Oct(?:ober)?)[.\-/\s]*(?:15|16|17))/i;
const PARTICIPATION = /(exhibitor|exhibiting|participat|booth|stand|buyer|procurement|delegation|sponsor|pavilion|참가|출전|바이어|구매단|초청|出展|参加|參展|买家|買家)/i;
const DIRECTORY = /(fairCorp|corpList|exhibitor|participant|company|참가업체|참가사)/i;
const BAD_SOURCE = /(?:linkedin\.com|facebook\.com|instagram\.com|youtube\.com|x\.com|twitter\.com|wikipedia\.org|10times\.com|eventbrite\.|medium\.com)/i;

// Exact foreign exhibitors from the 2025 K-Beauty Expo Korea exhibitor list.
// These are NOT treated as confirmed 2026 attendees. They are used only as honest repeat-attendance prospects.
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
  ['Guangzhou Liyanzhuang Biotechnology Co., Ltd.','China'],
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
  ['SHANGHAI MEANLOVE BIO-TECH CO.,LTD.','China'],
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

const official = value => OFFICIAL_DOMAINS.has(rootHost(value));
const canonical = value => { try { const u = new URL(value); u.hash=''; return u.toString(); } catch { return ''; } };

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
  const searched=await publicWebSearchMany(queries,{ maxResults:16,timeRange:'year',topic:'general' }).catch(()=>({results:[]}));
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
    const key=cleanName(row.company).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
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

async function resolveCandidate(row, excludes=new Set()) {
  const links=row.sourcePage?.links||[];
  const website=await resolveOfficialWebsite(row.company,row.country||'',links,excludes,[...OFFICIAL_DOMAINS]);
  if(!website) return null;
  const domain=normalizeCompanyKey(website.domain);
  if(!domain||excludes.has(domain)) return null;
  const foreign=await verifyForeignEntity({ company:row.company,website,sourceText:row.sourcePage?.text||'',countryHint:row.country||'' });
  if(!foreign||isKoreanCountry(foreign.country)) return null;
  return { ...row,country:foreign.country,domain:foreign.domain,url:foreign.url };
}

async function resolvePool(rows=[],excludes=new Set()) {
  const resolved=(await mapLimit(uniqueByName(rows).slice(0,90),8,row=>resolveCandidate(row,excludes))).filter(Boolean);
  return [...new Map(resolved.map(row=>[normalizeCompanyKey(row.domain),row])).values()];
}

function makeLead(candidate) {
  const company=clean(candidate.company,180),domain=rootHost(candidate.domain),confirmed=candidate.tier==='current_2026';
  const message=confirmed
    ? `Hi,\n\nI saw that ${company} is connected to K-Beauty Expo Korea 2026 this October.\n\nHave you already sorted branded staff shirts or team wear for your Korea team?\n\nWe produce custom apparel locally in Korea and can deliver directly to KINTEX or your hotel, so your team does not need to ship boxes internationally.\n\nIf it is still open, I can send a few simple options with pricing and turnaround.`
    : `Hi,\n\nI saw that ${company} exhibited at K-Beauty Expo Korea last year. Are you coming back for the 2026 show this October?\n\nIf yes, have you already sorted branded staff shirts or team wear for your Korea team? We produce custom apparel locally in Korea and can deliver directly to KINTEX or your hotel.\n\nIf useful, I can send a few simple options with pricing and turnaround.`;
  return {
    id:`kbeauty:${domain}`,campaign:'kbeauty',campaign_label:'K-Beauty Expo Korea 2026 단체복',
    company,domain,url:candidate.url||`https://${domain}/`,source_url:clean(candidate.source?.url,500),source_title:clean(candidate.source?.title,260),
    score:0,sales_priority:0,verified_company:true,kbeauty_eligible:true,kbeauty_confirmed:confirmed,kbeauty_repeat_prospect:!confirmed,
    attendance_tier:confirmed?'2026_confirmed':'2025_repeat_prospect',team_origin:'foreign',team_origin_country:clean(candidate.country,80),outreach_language:'en',
    signal:confirmed?'2026 K-Beauty Expo 직접 참가/초청 신호':'2025 K-Beauty Expo 실제 해외 참가사 · 2026 재참가 확인 대상',
    recommended_role:'Marketing / Events',role_targets:['Marketing Director','Brand Manager','Events Manager','International Sales','Export Manager','Partnerships','Founder','CEO'],
    subject:confirmed?'Quick question about your K-Beauty Expo Korea team':'Are you returning to K-Beauty Expo Korea in 2026?',
    message_en:message,message_ko:'',contact:null,contacts:[],contact_status:'pending'
  };
}

export async function POST(request) {
  let body={}; try{body=await request.json();}catch{return Response.json({error:'요청 형식이 잘못됐습니다.'},{status:400});}
  const cycle=Math.max(1,Number(body.cycle)||1),targetFloor=Math.max(20,Number(body.targetFloor)||20),currentCount=Math.max(0,Number(body.currentCount)||0);
  const history=await buildGlobalExclusions(Array.isArray(body.excludeDomains)?body.excludeDomains:[]);
  try{
    const currentDir=await crawlCurrentDirectory();
    const [directoryRows,webRows]=await Promise.all([extractCurrentDirectory(currentDir.pages),discoverCurrentWeb()]);
    const currentResolved=await resolvePool([...directoryRows,...webRows],history.set);
    const need=Math.max(0,targetFloor-currentCount-currentResolved.length);
    const repeatRows=repeatSlice(cycle,Math.min(52,Math.max(32,need+18)));
    const repeatResolved=await resolvePool(repeatRows,history.set);
    const all=[...currentResolved,...repeatResolved];
    const seen=new Set(),provisional=[];
    for(const candidate of all){
      const domain=normalizeCompanyKey(candidate.domain);
      if(!domain||seen.has(domain)||history.set.has(domain)) continue;
      seen.add(domain); provisional.push(makeLead(candidate));
      if(provisional.length>=32) break;
    }
    const exact=await suppressExactSent(provisional,history.secret);
    return Response.json({
      campaign:'kbeauty',campaign_label:'K-Beauty Expo Korea 2026 단체복',leads:exact.leads,
      meta:{ event:EVENT,cycle,target_floor:targetFloor,current_count:currentCount,
        official_seed_pages_loaded:currentDir.seedLoaded,official_current_event_pages:currentDir.currentPages,official_directory_pages:currentDir.pages.length,
        current_2026_candidates:currentResolved.length,repeat_2025_checked:repeatRows.length,repeat_2025_candidates:repeatResolved.length,
        returned:exact.leads.length,sent_preexcluded:history.sent.length,deleted_preexcluded:history.deleted.length,sent_exact_suppressed:exact.suppressed,
        candidate_policy:'2026 current evidence first; then verified 2025 foreign exhibitors as explicitly-labelled 2026 repeat prospects',
        email_policy:'email discovery runs only after company/domain verification; guessed emails forbidden'
      }
    },{headers:{'Cache-Control':'no-store'}});
  }catch(error){return Response.json({error:clean(error?.message||error,400)||'K-Beauty 후보 검색에 실패했습니다.'},{status:Number(error?.status)||502});}
}
