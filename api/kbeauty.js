import { aiConfigured, chatJson } from '../lib/ai-provider.js';
import {
  buildGlobalExclusions, clean, fetchPage, isKoreanCountry, mapLimit, normalizeCompanyKey,
  rootHost, textMatchesCompany, verifyForeignEntity
} from '../lib/international-event-campaign.js';

const EVENT = { name:'K-Beauty Expo Korea 2026', dates:'2026-10-15–2026-10-17', venue:'KINTEX, Goyang, Korea' };
const TAVILY_URL = 'https://api.tavily.com/search';
const SOURCE_2025_LIST = 'https://www.scribd.com/document/1032630294/K-Beauty-Expo-Korea-2025-Exhibitor-s-List';
const SOCIAL_SOURCE = /(?:linkedin\.com|facebook\.com|instagram\.com|x\.com|twitter\.com)/i;
const LOW_VALUE_SOURCE = /(?:wikipedia\.org|10times\.com|eventbrite\.|medium\.com|made-in-china\.com|globalsources\.com|tradeindia\.com|exporthub\.com|tradekey\.com|1688\.com)/i;
const PARTICIPATION = /(exhibitor|exhibiting|exhibited|participat|attend|booth|stand|buyer|procurement|delegation|sponsor|pavilion|speaker|meet us|see you|joining|visit us|참가|출전|바이어|구매단|초청|부스|出展|参加|參展|买家|買家)/i;
const COMPANY_NOISE = /^(?:kotra|korea trade-investment promotion agency|k-beauty expo|intercharm korea|cosmobeauty seoul|in-cosmetics korea|osong cosmetics|coex|kintex)$/i;
const MAX_RETURNED = 72;

const EXACT_QUERIES = [
  '"K-Beauty Expo Korea 2026" "attending" company',
  '"K-Beauty Expo Korea 2026" exhibitor OR booth OR "meet us"',
  '"K-Beauty Expo Korea 2026" buyer OR delegation OR invited',
  'site:linkedin.com "K-Beauty Expo Korea 2026" attending',
  'site:x.com "K-Beauty Expo Korea 2026" attending OR booth',
  '"K-뷰티엑스포 코리아 2026" 해외 참가 바이어',
  '"K-Beauty Expo Korea" 2026 出展 OR 参加',
  '"K-Beauty Expo Korea" 2026 參展 OR 買家'
];

const ROTATING_LANES = [
  {
    id:'kotra_buyer_2026', tier:'kotra_selected_2026', score:96,
    queries:[
      'KOTRA "K-Beauty Expo Korea 2026" selected buyer company',
      'KOTRA "K-Beauty Expo 2026" buyer delegation company Korea',
      'site:linkedin.com KOTRA "K-Beauty Expo Korea 2026" buyer',
      'site:facebook.com KOTRA "K-Beauty Expo Korea 2026" buyer',
      '"K-Beauty Expo Korea 2026" importer distributor KOTRA',
      '"K-Beauty Expo Korea 2026" retailer brand owner KOTRA'
    ]
  },
  {
    id:'intercharm_2026', tier:'korea_beauty_event_2026', score:88,
    queries:[
      '"InterCHARM Korea 2026" overseas exhibitor company',
      '"InterCHARM Korea 2026" India exhibitor',
      '"InterCHARM Korea 2026" Japan exhibitor',
      '"InterCHARM Korea 2026" China Taiwan exhibitor',
      'site:linkedin.com "InterCHARM Korea 2026" attending exhibitor',
      'site:ick.intercharmkorea.com/eng/exhibitor 2026 exhibitor'
    ]
  },
  {
    id:'cosmobeauty_2026', tier:'korea_beauty_event_2026', score:88,
    queries:[
      '"COSMOBEAUTY Seoul 2026" overseas buyer company',
      '"COSMOBEAUTY SEOUL 2026" overseas exhibitor company',
      '"COSMOBEAUTY Seoul 2026" importer distributor buyer',
      'site:linkedin.com "COSMOBEAUTY Seoul 2026" attending',
      'site:instagram.com "COSMOBEAUTY Seoul 2026" exhibitor'
    ]
  },
  {
    id:'incosmetics_2026', tier:'korea_beauty_event_2026', score:88,
    queries:[
      '"in-cosmetics Korea 2026" exhibitor company',
      '"in-cosmetics Korea 2026" overseas exhibitor',
      '"in-cosmetics Korea 2026" attending Seoul company',
      'site:linkedin.com "in-cosmetics Korea 2026" exhibitor',
      '"in-cosmetics Korea 2026" India China Japan company'
    ]
  },
  {
    id:'osong_2026', tier:'korea_beauty_upcoming_2026', score:92,
    queries:[
      '"Osong Cosmetics & Beauty Expo 2026" overseas buyer company',
      '"Osong Cosmetics Beauty Expo 2026" exhibitor buyer',
      'KOTRA "Osong Cosmetics" 2026 buyer company',
      'site:linkedin.com "Osong Cosmetics" 2026 buyer exhibitor',
      '"2026 Osong" cosmetics overseas buyer delegation'
    ]
  },
  {
    id:'kbeauty_global_2026', tier:'kbeauty_global_2026', score:80,
    queries:[
      '"K-Beauty Expo Taiwan 2026" exhibitor company',
      '"K-Beauty Expo Taiwan 2026" buyer distributor',
      '"K-Beauty Expo" 2026 overseas pavilion company',
      'site:linkedin.com "K-Beauty Expo" 2026 exhibitor distributor',
      '"K-Beauty Expo" 2026 importer retailer company'
    ]
  }
];

// Verified foreign exhibitors from the 2025 K-Beauty Expo Korea exhibitor list.
// They remain a fallback only and are never labelled as confirmed 2026 attendees.
const REPEAT_2025 = [
  ['AJMAL PERFUMES','United Arab Emirates'],['Alibaba.com','China'],['BRIGHT SMART PACKAGING AND MACHINERY SDN BHD','Malaysia'],
  ['DOUYIN EC GLOBAL','China'],['EGYCOTTON FOR COTTON PRODUCTS','Egypt'],['Laboratoire Gilbert','France'],['MORIRIN CO., LTD.','Japan'],
  ['PTN Healthcare GmbH','Germany'],['BULGARIAN ROSE PLC','Bulgaria'],['Volenta Cosmetics Ltd','Bulgaria'],
  ['GUANGZHOU KEHUA PLASTIC PRODUCTS CO., LTD.','China'],['ANHUI XIJINGKE OPTOELECTRONIC TECHNOLOGY.,LTD','China'],
  ['DONGGUAN PENGCHENG JES PACKAGING PRODUCT CO.,LTD','China'],['GuangDong Lianxin Glass Products Co., Ltd.','China'],
  ['GUANGDONG MINGDUN ENVIRONMENTAL TECHNOLOGY CO., LTD.','China'],['Guang Dong Qiao Lei Packing Technology CO.,LTD','China'],
  ['Guangzhou Huayu Plastic Products Co., Ltd.','China'],['Guangzhou Huimei Plastic Products Technology Co., Ltd','China'],
  ['GUANGZHOU JINGHUA CRYSTAL GLASS CO.,LTD','China'],['GUANGZHOU JXPACK TECHNOLOGY CO.,LTD.','China'],
  ['Guangzhou Kangyue Packaging Products Co,.Ltd','China'],['GUANGZHOU KEYUAN PLASTICWARE CO., LTD.','China'],
  ['GUANGZHOU LEJIA HONG PACKAGING CO.,LTD','China'],['Guangzhou Lianpu Nonwoven Product Co., Ltd.','China'],
  ['Guangzhou Liyanzhuang Biotechnology Co., Ltd','China'],['GUANGZHOU LVFANGZHOU INDUSTRIAL CO.,LTD','China'],
  ['GUANGZHOU MENOL PLASTIC CO.,LTD','China'],['Guangzhou Muze Packaging Solutions Technology Co,. Ltd','China'],
  ['Guangzhou Qiaoneng Plastic Prduct Co.,Ltd','China'],['GUANGZHOU YUANFENG PLASTIC INDUSTRY CO., LTD.','China'],
  ['HANGZHOU QUMAO TRADE CO.,LTD','China'],['IMS PACKAGING','China'],['JIANGSU HUANYA SPRAY PLASTIC INDUSTRY CO.,LTD','China'],
  ['JIANGXI XIRUI MANUFACTURING CO.,LTD','China'],['JINHUA ZHAOYI PLASTIC CO.,LTD','China'],['NINGBO JINBAOLU COMMODITY CO.,LTD.','China'],
  ['NINGBO LONGWAY PACKAGING S&T CO.,LTD.','China'],['SHANGHAI MEANLOVE BIO-TECH CO.,LTD','China'],['SHENZHEN BAICHANG TECHNOLOGY CO.,LTD','China'],
  ['SHENZHEN DW COSMETICS CO.,LTD','China'],['SHENZHEN MTIMES ELECTRONIC TECHNOLOGY CO., LTD.','China'],['Suzhou Valcon Industries CO.,LTD','China'],
  ['YUYAO DINGYU PLASTIC CO.,LTD','China'],['YUYAO WELLPACK SPRAYER CO ., LTD','China'],['ZHEJIANG MEGEE INDUSTRIAL CO., LTD.','China'],
  ['ZHUHAI BAOLI FOAM SPRAY PUMP CO., LTD.','China'],['BO HUI BIOTECH CO., LTD.','Taiwan'],['CHIME Beauty CO., LTD.','Taiwan'],
  ['STAR CLEANLY BIOCHEMICAL TECHNOLOGY CO.,LTD.','Taiwan'],['3B INTERNATIONAL COMPANY, LIMITED','Taiwan'],['ANRUTI CO., LTD.','Taiwan'],
  ['TOP WANG INTERNATIONAL TRADING CO., LTD.','Taiwan'],["SHAAN HONQ INT'L COSMETICS CORP.",'Taiwan'],['HSIN YUNG PLASTIC INDUSTRIAL CO., LTD.','Taiwan'],
  ['CPACK SUNLIGHT INTERNATIONAL INDUSTRIAL CO., LTD.','Taiwan'],['Japan Technology Co., Ltd (KOCHIGOLD)','Vietnam'],
  ['MEKONG HERBALS CORPORATION','Vietnam'],['MISS EDE','Vietnam']
];

const companyKey = value => clean(value,180).toLowerCase().replace(/\b(?:inc|llc|ltd|limited|corp|corporation|company|co|gmbh|plc)\b/giu,' ').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const cleanName = value => {
  const name=clean(value,180).replace(/^[\s•·|–—-]+|[\s•·|–—-]+$/g,'');
  if(!name||name.length<2||name.length>150||COMPANY_NOISE.test(name)) return '';
  if(/^(?:home|about|contact|search|more|detail|view|next|previous|english|korean|company|companies|exhibitors?|participants?|buyer|buyers?)$/i.test(name)) return '';
  return name;
};

async function tavilySearch(query,{maxResults=18,timeRange='year'}={}) {
  const key=String(process.env.TAVILY_API_KEY||'').trim();
  if(!key) return [];
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch(TAVILY_URL,{
      method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({query:clean(query,520),search_depth:'basic',max_results:maxResults,topic:'general',time_range:timeRange,
        include_answer:false,include_raw_content:false,exclude_domains:['wikipedia.org','10times.com','eventbrite.com','medium.com','made-in-china.com','globalsources.com','tradeindia.com','exporthub.com','tradekey.com']}),
      signal:controller.signal,cache:'no-store'
    });
    if(!response.ok) return [];
    const data=await response.json();
    return (Array.isArray(data?.results)?data.results:[]).map(row=>({
      title:clean(row?.title,300),url:clean(row?.url,600),content:clean(row?.content,1800),published_date:clean(row?.published_date,80),score:Number(row?.score)||0
    })).filter(row=>/^https?:\/\//i.test(row.url)&&!LOW_VALUE_SOURCE.test(rootHost(row.url)));
  }catch{return [];}
  finally{clearTimeout(timer);}
}

async function searchMany(queries, lane) {
  const settled=await mapLimit((queries||[]).slice(0,8),4,async query=>await tavilySearch(query,{maxResults:18,timeRange:'year'}));
  const out=[]; const seen=new Set();
  for(const row of settled.flat().filter(Boolean)) {
    const key=row.url.replace(/\/$/,'');
    if(!key||seen.has(key)) continue;
    seen.add(key); out.push({...row,lane_id:lane.id,tier:lane.tier,lane_score:lane.score});
  }
  return out;
}

async function enrichEvidenceRows(rows=[]) {
  const ranked=[...rows].sort((a,b)=>Number(b.score||0)-Number(a.score||0)).slice(0,44);
  return (await mapLimit(ranked,6,async(row,i)=>{
    const host=rootHost(row.url);
    let page=null;
    if(!SOCIAL_SOURCE.test(host)) page=await fetchPage(row.url,{timeoutMs:5000,maxBytes:360000});
    const text=clean(`${row.title||''} ${row.content||''} ${page?.text||''}`,10000);
    if(!text||!PARTICIPATION.test(text)) return null;
    return {...row,id:`e${i}`,text};
  })).filter(Boolean);
}

async function extractCandidates(rows=[]) {
  if(!rows.length||!aiConfigured()) return [];
  const chunks=[]; for(let i=0;i<rows.length;i+=6) chunks.push(rows.slice(i,i+6));
  const groups=await mapLimit(chunks,2,async(chunk,chunkIndex)=>{
    const input=chunk.map((row,i)=>({
      id:`${chunkIndex}-${i}`,lane:row.lane_id,tier:row.tier,url:row.url,title:row.title,text:clean(row.text,8500)
    }));
    const prompt=`You extract high-confidence FOREIGN beauty-industry companies likely to travel to Korea.\n
Rules:\n
1. Extract every explicitly NAMED company/brand/buyer/distributor/retailer/platform from each row, not event names or organizers.\n
2. If tier=current_kbeauty_2026, the text must explicitly connect that company to K-Beauty Expo Korea 2026 attendance, exhibiting, booth, buyer invitation/delegation, sponsorship or participation.\n
3. If tier=kotra_selected_2026, accept only a NAMED company explicitly selected, invited, confirmed or participating as a buyer/delegation. Generic recruitment eligibility is NOT a lead.\n
4. If tier=korea_beauty_event_2026 or korea_beauty_upcoming_2026, the company must explicitly be an exhibitor, buyer, speaker, sponsor or attendee of that named Korea-hosted 2026 beauty event.\n
5. If tier=kbeauty_global_2026, require explicit 2026 K-Beauty Expo participation outside Korea.\n
6. Never invent company names, countries, attendance, or URLs. Country may be empty if not stated. Reject Korean companies when the text identifies them as Korean.\n
7. Return confidence >=90 only when the company name itself appears in the provided text.\n
JSON only: {"items":[{"id":"0-0","company":"exact company name","country":"country or empty","confidence":94,"evidence_type":"attending|exhibitor|buyer|delegation|sponsor|speaker","evidence":"short factual evidence"}]}.\n
ROWS:\n${JSON.stringify(input)}`;
    try{
      const result=await chatJson({prompt,maxTokens:4200,timeoutMs:30000,temperature:0,hardDeadlineMs:44000});
      const byId=new Map(input.map((item,i)=>[item.id,chunk[i]]));
      return (Array.isArray(result?.data?.items)?result.data.items:[]).map(item=>{
        const row=byId.get(clean(item?.id,40));
        const company=cleanName(item?.company);
        const confidence=Number(item?.confidence)||0;
        if(!row||!company||confidence<90||!textMatchesCompany(company,row.text)) return null;
        const country=clean(item?.country,100);
        if(country&&isKoreanCountry(country)) return null;
        return {
          company,country,tier:row.tier,score:row.lane_score,source_url:row.url,source_title:row.title,
          source_date:row.published_date||'',evidence_type:clean(item?.evidence_type,60),
          evidence_text:clean(item?.evidence||row.text,1400),signal:clean(item?.evidence||'',320)
        };
      }).filter(Boolean);
    }catch{return [];}
  });
  return groups.flat();
}

function repeatCandidates(cycle=1,count=12) {
  const start=((Math.max(1,Number(cycle)||1)-1)*count)%REPEAT_2025.length;
  return Array.from({length:Math.min(count,REPEAT_2025.length)},(_,i)=>REPEAT_2025[(start+i)%REPEAT_2025.length]).map(([company,country])=>({
    company,country,tier:'repeat_2025',score:74,source_url:SOURCE_2025_LIST,source_title:'K-Beauty Expo Korea 2025 exhibitor list',source_date:'2025',
    evidence_type:'historical_exhibitor',evidence_text:`${company} is a verified foreign exhibitor in the K-Beauty Expo Korea 2025 exhibitor list.`,
    signal:'2025 K-Beauty Expo 실제 해외 참가사 · 2026 재참가 확인 대상'
  }));
}

function dedupeCandidates(rows=[],excludeCompanies=[]) {
  const blocked=new Set((excludeCompanies||[]).map(companyKey).filter(Boolean));
  const best=new Map();
  for(const row of rows){
    const company=cleanName(row.company),key=companyKey(company);
    if(!company||!key||blocked.has(key)) continue;
    const old=best.get(key);
    if(!old||Number(row.score||0)>Number(old.score||0)) best.set(key,{...row,company});
  }
  return [...best.values()].sort((a,b)=>Number(b.score||0)-Number(a.score||0)).slice(0,MAX_RETURNED).map(row=>({
    id:`kbeauty:${companyKey(row.company).replace(/\s+/g,'-').slice(0,110)}`,...row
  }));
}

async function discover(body={}) {
  const cycle=Math.max(1,Number(body.cycle)||1);
  const lane=ROTATING_LANES[(cycle-1)%ROTATING_LANES.length];
  const exactLane={id:'kbeauty_exact_2026',tier:'current_kbeauty_2026',score:100};
  const exactQueries=[EXACT_QUERIES[(cycle-1)%EXACT_QUERIES.length],EXACT_QUERIES[cycle%EXACT_QUERIES.length],EXACT_QUERIES[(cycle+2)%EXACT_QUERIES.length]];
  const [exactRows,laneRows]=await Promise.all([searchMany(exactQueries,exactLane),searchMany(lane.queries,lane)]);
  const evidence=await enrichEvidenceRows([...exactRows,...laneRows]);
  const extracted=await extractCandidates(evidence);
  const fallback=repeatCandidates(cycle,extracted.length<36?16:8);
  const candidates=dedupeCandidates([...extracted,...fallback],Array.isArray(body.excludeCompanies)?body.excludeCompanies:[]);
  return {
    candidates,
    meta:{event:EVENT,cycle,lane:lane.id,search_results:exactRows.length+laneRows.length,evidence_rows:evidence.length,
      extracted:extracted.length,historical_fallback:fallback.length,returned:candidates.length,
      candidate_policy:'named company evidence first; social posts allowed as attendance evidence; generic recruitment is rejected; foreign entity is verified after official-domain resolution'}
  };
}

async function verifyCandidates(body={}) {
  const items=(Array.isArray(body.items)?body.items:[]).slice(0,18);
  const history=await buildGlobalExclusions(Array.isArray(body.excludeDomains)?body.excludeDomains:[]);
  const results=await mapLimit(items,5,async item=>{
    const id=clean(item?.id,180),company=cleanName(item?.company),domain=rootHost(item?.domain||item?.url||''),countryHint=clean(item?.country,100);
    if(!id||!company||!domain||domain.endsWith('.kr')||history.set.has(normalizeCompanyKey(domain))) return null;
    const url=`https://${domain}/`;
    const page=await fetchPage(url,{timeoutMs:6000,maxBytes:300000});
    if(!page||!textMatchesCompany(company,`${page.text} ${page.url}`)) return null;
    const foreign=await verifyForeignEntity({
      company,website:{domain,url,page},sourceText:clean(item?.evidence_text,6000),countryHint
    });
    if(!foreign||isKoreanCountry(foreign.country)) return null;
    return {id,company,domain:foreign.domain,url:foreign.url,country:foreign.country,verified_foreign:true};
  });
  return {results:results.filter(Boolean),meta:{checked:items.length,verified:results.filter(Boolean).length}};
}

export async function POST(request) {
  let body={};
  try{body=await request.json();}catch{return Response.json({error:'요청 형식이 잘못됐습니다.'},{status:400});}
  try{
    if(body.action==='verify_candidates') {
      const verified=await verifyCandidates(body);
      return Response.json(verified,{headers:{'Cache-Control':'no-store'}});
    }
    const result=await discover(body);
    return Response.json({campaign:'kbeauty',campaign_label:'K-Beauty Expo Korea 2026 단체복',...result},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    return Response.json({error:clean(error?.message||error,400)||'K-Beauty 후보 검색에 실패했습니다.'},{status:Number(error?.status)||502});
  }
}
