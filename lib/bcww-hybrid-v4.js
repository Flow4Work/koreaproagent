import { POST as basePost } from './bcww-hybrid-v3.js';
import { publicWebSearch } from './public-web-search.js';
import { findContacts } from './contact-discovery-v2.js';
import { listSentCompanyDomains, normalizeCompanyKey } from './sent-companies.js';
import { listDeletedCompanyDomains } from './deleted-companies.js';

const CURRENT_CHANNELS = [
  {
    company:'VIPO', domain:'vipo.or.jp', country:'Japan', tier:'channel',
    relation:'BCWW 2026 일본 드라마 피칭 프로그램 운영',
    source_url:'https://www.vipo.or.jp/project/japandramafirstlook_r8/',
    evidence:'Japan Drama First Look: Co-Pro Pitch sends selected Japanese drama teams to BCWW, Seoul, 14–16 Sep 2026.',
    contact:{
      name:'VIPO Overseas Pitching Support Office', title:'BCWW / Overseas Pitching Support',
      email:'pitching@vipo.or.jp', emailStatus:'official_public', verificationMethod:'official_public',
      officialSource:true, qualified:true, score:98, provider:'official_website',
      sources:['https://www.vipo.or.jp/project/japandramafirstlook_r8/']
    }
  },
  {
    company:'ACT International', domain:'actinter.co.jp', country:'Japan', tier:'channel',
    relation:'BCWW 2026 일본 사무국',
    source_url:'https://www.actinter.co.jp/exhibition/info/bcww/',
    evidence:'ACT International states that it serves as the Japan secretariat for BCWW 2026, 14–16 Sep 2026 at COEX.',
    contact:{
      name:'ACT International Exhibition Team', title:'Japan Secretariat / Exhibitions',
      email:'exhibition@actinter.co.jp', emailStatus:'official_public', verificationMethod:'official_public',
      officialSource:true, qualified:true, score:97, provider:'official_website',
      sources:['https://www.actinter.co.jp/en/exhibition/info/act-international-inc/']
    }
  }
];

const RECURRENCE_SEEDS = [
  {
    company:'TI ComNet', domain:'ti-comnet.com', country:'Japan', tier:'recurrence',
    relation:'BCWW 2025 실제 부스 출전 · 2026 재참가 확인 대상',
    source_url:'https://www.vipo.or.jp/jlox-plusr6-case/bcww-2025/',
    evidence:'TI ComNet exhibited at BCWW 2025 in Seoul and promoted content from its booth.',
    contact:{
      name:'TI ComNet', title:'Official Contact', email:'info@ti-comnet.com',
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      allowGeneric:true, qualified:true, score:86, provider:'official_website',
      sources:['https://ti-comnet.com/en_contact']
    }
  },
  {
    company:'Fuji Creative Corporation', domain:'fujicreative.co.jp', country:'Japan', tier:'recurrence',
    relation:'BCWW 2025 실제 부스 출전 · 2026 재참가 확인 대상',
    source_url:'https://www.vipo.or.jp/jlox-plusr6-case/bcww-2025%E3%81%B8%E3%81%AE%E5%87%BA%E5%B1%95/',
    evidence:'Fuji Creative Corporation exhibited at BCWW 2025 at COEX and conducted international sales meetings.',
    contact:{
      name:'FCC International Sales', title:'International Sales', email:'intlsales@fujicreative.co.jp',
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:97, provider:'official_website',
      sources:['https://fujicreative.co.jp/forBuyers/privacypolicy/']
    }
  }
];

// These are search seeds only. They are never shown as 2026 participants unless a fresh 2026 signal is found.
const WATCHLIST = [
  { company:'TI ComNet', domain:'ti-comnet.com', country:'Japan' },
  { company:'Fuji Creative Corporation', domain:'fujicreative.co.jp', country:'Japan' },
  { company:'Gaumont', domain:'gaumont.com', country:'France' },
  { company:'Amagi', domain:'amagi.com', country:'United States' },
  { company:'Federation Studios', domain:'federationstudios.com', country:'France' },
  { company:'C21Media', domain:'c21media.net', country:'United Kingdom' },
  { company:'Rakuten TV', domain:'rakuten.tv', country:'Spain' },
  { company:'Fremantle', domain:'fremantle.com', country:'United Kingdom' },
  { company:'BBC Studios', domain:'bbcstudios.com', country:'United Kingdom' },
  { company:'NBCUniversal', domain:'nbcuniversal.com', country:'United States' },
  { company:'Canela Media', domain:'canelamedia.com', country:'United States' },
  { company:'Imagen Television', domain:'imagentv.com', country:'Mexico' }
];

const BCWW = /\bBCWW\b|Broadcast\s*World\s*Wide|국제방송영상마켓/i;
const CURRENT = /\b2026\b|2026年|2026년|Sep(?:tember)?\.?\s*14\s*[-–—~]\s*16|14\s*[-–—~]\s*16\s*Sep(?:tember)?/i;
const STRONG = /\bstand\s*(?:#|no\.?|number)?\s*[a-z0-9-]+|\bbooth\b|\bexhibit(?:or|ing|s|ed)?\b|\battend(?:ing|s|ed)?\b|\bparticipat(?:e|es|ed|ing)\b|\bsee\s+you\b|\bmeet\s+us\b|\bshowcase\b|\bdelegation\b|\bpavilion\b|出展|参加|参展|參展/i;
const BAD = /10times|shown\s+interest|followers?|applications?\s+(?:are\s+)?open|registration\s+(?:is\s+)?open|apply\s+(?:now|by)|call\s+for\s+exhibitors?|참가기업\s*모집|모집\s*공고|出展.*募集|募集.*出展|応募|招募|报名|報名/i;
const BLOCKED_LOCAL = new Set(['admin','support','help','security','careers','hr','jobs','legal','privacy','noreply','no-reply']);

function clean(v='', max=800){ return String(v||'').replace(/\s+/g,' ').trim().slice(0,max); }
function rootHost(v=''){
  let h=clean(v,500).toLowerCase(); if(!h)return '';
  try{h=new URL(h.includes('://')?h:`https://${h}`).hostname;}catch{h=h.split('/')[0];}
  h=h.replace(/^www\./,''); const p=h.split('.').filter(Boolean); if(p.length<=2)return h;
  const sld=new Set(['co','com','org','net','ac','go','gov']);
  return p.at(-1)?.length===2&&sld.has(p.at(-2))?p.slice(-3).join('.'):p.slice(-2).join('.');
}
function sameDomain(email='', domain=''){
  const e=clean(email,260).toLowerCase().split('@')[1]||'', d=rootHost(domain);
  return Boolean(e&&d&&(e===d||e.endsWith(`.${d}`)));
}
function validProviderContact(c={}, domain=''){
  const email=clean(c?.email,260).toLowerCase(), local=email.split('@')[0]||'';
  return Boolean(email&&sameDomain(email,domain)&&!BLOCKED_LOCAL.has(local)&&c?.qualified===true&&c?.emailStatus==='valid'&&Number(c?.score||0)>=75);
}
function companyMentioned(text='', company=''){
  const t=clean(text,18000).toLowerCase(), parts=clean(company,160).toLowerCase().split(/\s+/).filter(x=>x.length>=3);
  return parts.length ? parts.some(p=>t.includes(p)) : false;
}
function currentParticipationRow(row={}, seed={}){
  const text=clean(`${row.title||''} ${row.content||row.snippet||''} ${row.url||''}`,18000);
  if(!BCWW.test(text)||!CURRENT.test(text)||BAD.test(text)||!companyMentioned(text,seed.company))return false;
  const owned=rootHost(row.url)===rootHost(seed.domain);
  if(owned&&/Sep(?:tember)?\.?\s*14\s*[-–—~]\s*16|14\s*[-–—~]\s*16\s*Sep(?:tember)?/i.test(text))return true;
  return STRONG.test(text);
}

async function findCurrentWatchlist(cycle=0, excludes=new Set()){
  const start=(Math.max(0,Number(cycle)||0)*4)%WATCHLIST.length;
  const batch=Array.from({length:4},(_,i)=>WATCHLIST[(start+i)%WATCHLIST.length])
    .filter(seed=>!excludes.has(normalizeCompanyKey(seed.domain)));
  const found=[];
  for(const seed of batch){
    const queries=[`"${seed.company}" "BCWW 2026"`,`"${seed.company}" BCWW Seoul September 2026`];
    let hit=null;
    for(const q of queries){
      const result=await publicWebSearch(q,{maxResults:8,timeRange:'year',topic:'general'}).catch(()=>({results:[]}));
      hit=(result?.results||[]).find(row=>currentParticipationRow(row,seed))||null;
      if(hit)break;
    }
    if(!hit)continue;
    const contactResult=await findContacts(seed.domain,{maxContacts:8,minQualified:1,recommendedRole:'Event Marketing',roleTargets:['Event Marketing','Marketing','Brand','Partnerships','Business Development','Sales','Operations']}).catch(()=>null);
    const contacts=(contactResult?.emails||[]).filter(c=>validProviderContact(c,seed.domain)).sort((a,b)=>Number(b.score||0)-Number(a.score||0));
    found.push(makeLead({
      ...seed,tier:'confirmed',relation:'BCWW 2026 현재 참가 근거 자동 확인',source_url:clean(hit.url,700),
      evidence:clean(`${hit.title||''} ${hit.content||hit.snippet||''}`,1200),contact:contacts[0]||null,contacts:contacts.slice(0,4)
    }));
  }
  return { checked:batch.length, found };
}

function messageFor(seed={}){
  if(seed.tier==='channel'){
    return `Hi ${seed.company} team,\n\nI saw that your organization is directly supporting Japanese participation at BCWW 2026 in Seoul. We produce branded T-shirts, polos and staff wear locally in Seoul for overseas exhibition teams, with delivery to COEX or their hotel.\n\nIf any of the teams you are coordinating still need apparel, I can send a simple local price sheet and turnaround options. We can also handle several small team orders together.\n\nWould it be useful if I send the options?`;
  }
  if(seed.tier==='recurrence'){
    return `Hi ${seed.company} team,\n\nI saw that your team exhibited at BCWW in Seoul last year. Are you coming back for BCWW 2026 this September?\n\nIf so, we produce branded T-shirts, polos and staff wear locally in Seoul and can deliver directly to COEX or your hotel, so there is no overseas shipping or box-carrying into Korea.\n\nIf your 2026 plans are confirmed, I can send simple pricing and turnaround options.`;
  }
  return `Hi,\n\nI saw that ${seed.company} is coming to BCWW 2026 in Seoul. Have you already sorted team shirts or staff wear for the event?\n\nWe produce branded apparel locally in Seoul and can deliver directly to COEX or your hotel, with no overseas shipping or customs.\n\nIf it is still open, I can send a few local options with pricing and turnaround.`;
}

function makeLead(seed={}){
  const domain=rootHost(seed.domain), contact=seed.contact||null, tier=seed.tier||'confirmed';
  const relationConfirmed=tier==='channel';
  const participationConfirmed=tier==='confirmed';
  return {
    id:`bcww:${tier}:${domain}`, campaign:'bcww', campaign_label:'BCWW 단체복', company:seed.company, domain,
    url:`https://${domain}/`, source_url:seed.source_url, source_title:seed.relation||'', evidence_urls:[seed.source_url].filter(Boolean),
    evidence_grade:tier==='confirmed'?'A':tier==='channel'?'CHANNEL':'R2025', evidence_reason:seed.relation||'', signal:seed.evidence||seed.relation||'',
    score:tier==='confirmed'?95:tier==='channel'?94:84, sales_priority:tier==='confirmed'?98:tier==='channel'?96:86,
    verified_company:true, bcww_confirmed:participationConfirmed, bcww_participation_confirmed:participationConfirmed,
    bcww_relation_confirmed:relationConfirmed, bcww_sales_candidate:true, bcww_outreach_tier:tier,
    bcww_interest:false, team_origin:'foreign', team_origin_country:seed.country||'', outreach_language:'en',
    recommended_role:contact?.title||'Events / Marketing', role_targets:['Event Marketing','Marketing','Brand','Partnerships','Business Development','Sales','Operations'],
    contact, contacts:seed.contacts||[contact].filter(Boolean), contact_provider:contact?.provider||null,
    contact_status:contact?'found':'failed', contact_failure_reason:contact?'':'이메일 탐색 미완료', contact_score_threshold:75,
    subject:tier==='recurrence'?`Are you returning to BCWW 2026? — local teamwear in Seoul`:`BCWW 2026 Seoul teamwear for ${seed.company}`,
    message_en:messageFor(seed), message_ko:''
  };
}

async function exclusionSet(body={}){
  const set=new Set((body.excludeDomains||[]).map(normalizeCompanyKey).filter(Boolean));
  const secret=clean(process.env.GMAIL_SESSION_SECRET,5000);
  if(!secret)return set;
  const [sent,deleted]=await Promise.all([
    listSentCompanyDomains(secret,500).catch(()=>[]), listDeletedCompanyDomains(secret,2500).catch(()=>[])
  ]);
  for(const x of [...sent,...deleted])set.add(normalizeCompanyKey(x));
  return set;
}

export async function POST(request){
  let body={}; try{body=await request.clone().json();}catch{}
  const baseResponse=await basePost(request);
  const raw=await baseResponse.text();
  if(!baseResponse.ok)return new Response(raw,{status:baseResponse.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  let data={}; try{data=raw?JSON.parse(raw):{};}catch{return new Response(raw,{status:baseResponse.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}

  const excludes=await exclusionSet(body);
  const supplemental=[...CURRENT_CHANNELS,...RECURRENCE_SEEDS]
    .filter(seed=>!excludes.has(normalizeCompanyKey(seed.domain)))
    .map(makeLead);
  const watch=await findCurrentWatchlist(body.cycle||0,excludes);

  const all=[...(Array.isArray(data.leads)?data.leads:[]),...watch.found,...supplemental];
  const byDomain=new Map();
  const rank=lead=>lead?.bcww_participation_confirmed===true?3:lead?.bcww_outreach_tier==='channel'?2:1;
  for(const lead of all){
    const d=rootHost(lead?.domain); if(!d||excludes.has(normalizeCompanyKey(d)))continue;
    const prev=byDomain.get(d); if(!prev||rank(lead)>rank(prev)||(rank(lead)===rank(prev)&&lead?.contact&&!prev?.contact))byDomain.set(d,lead);
  }
  const leads=[...byDomain.values()].sort((a,b)=>rank(b)-rank(a)||Number(Boolean(b.contact))-Number(Boolean(a.contact))||Number(b.sales_priority||0)-Number(a.sales_priority||0)).slice(0,20);
  const direct=leads.filter(x=>x.bcww_participation_confirmed===true).length;
  const channel=leads.filter(x=>x.bcww_outreach_tier==='channel').length;
  const recurrence=leads.filter(x=>x.bcww_outreach_tier==='recurrence').length;
  const ready=leads.filter(x=>x.contact?.email).length;

  return Response.json({
    ...data, leads,
    meta:{
      ...(data.meta||{}), returned:leads.length, sales_candidates:leads.length,
      current_direct_participants:direct, current_channel_leads:channel, recurrence_outreach:recurrence,
      contact_ready:ready, contact_unresolved:Math.max(0,leads.length-ready),
      watchlist_total:WATCHLIST.length, watchlist_checked_this_cycle:watch.checked, watchlist_upgraded:watch.found.length,
      pipeline_mode:'direct confirmed + current 2026 channel + verified 2025 recurrence outreach + rotating current watchlist',
      truth_policy:'channel and recurrence leads are labeled separately and are never presented as confirmed 2026 exhibitors'
    }
  },{headers:{'Cache-Control':'no-store'}});
}
