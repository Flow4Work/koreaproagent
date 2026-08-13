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

// 26 real foreign media/content companies with public business emails.
// They are outreach prospects only; none is labeled as a confirmed BCWW 2026 exhibitor without fresh 2026 evidence.
const PROSPECT_SEEDS = [
  {
    company:"Nippon TV", domain:"ntv.co.jp", url:"https://www.ntv.co.jp/english/", country:"Japan", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://www.ntv.co.jp/english/pressrelease/20210311.html",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"Nippon TV Global Business", title:"International Program Sales", email:"intlprg@ntv.co.jp",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:99, provider:'official_website', sources:["https://www.ntv.co.jp/english/pressrelease/20210311.html"]
    }
  },
  {
    company:"TBS", domain:"tbs.co.jp", url:"https://www.tbs.co.jp/", country:"Japan", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://www.tbs.co.jp/shows/",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"Emi Kato", title:"Live Entertainment Business Division / Stage Business", email:"kato.emi@tbs.co.jp",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:98, provider:'official_website', sources:["https://www.tbs.co.jp/shows/"]
    }
  },
  {
    company:"TV Tokyo", domain:"tv-tokyo.co.jp", url:"https://www.tv-tokyo.co.jp/", country:"Japan", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://sales.tv-tokyo.co.jp/tvtokyo/sas",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"TV Tokyo Sales Bureau", title:"Smart Ad Sales / Sales", email:"tx-sas@tv-tokyo.co.jp",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:94, provider:'official_website', sources:["https://sales.tv-tokyo.co.jp/tvtokyo/sas"]
    }
  },
  {
    company:"Kansai Television", domain:"ktv.co.jp", url:"https://www.ktv.jp/", country:"Japan", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://www.ktv.jp/en/news/180411.html",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"Kansai Television", title:"International / Corporate Administration", email:"ktv_international@ktv.co.jp",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:97, provider:'official_website', sources:["https://www.ktv.jp/en/news/180411.html"]
    }
  },
  {
    company:"NHK Enterprises", domain:"nhk-ep.co.jp", url:"https://www.nhk-ep.co.jp/", country:"Japan", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://pf.nhk-ep.co.jp/about-us",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"Satomi Nagaoka", title:"Korea & Scripted Format Sales", email:"nagaoka-sa@nhk-ep.co.jp",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:99, provider:'official_website', sources:["https://pf.nhk-ep.co.jp/about-us"]
    }
  },
  {
    company:"Mediacorp", domain:"mediacorp.com.sg", url:"https://www.mediacorp.sg/", country:"Singapore", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://contentdistribution.mediacorp.sg/pages/contact-us",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"Wilfred Chen", title:"Senior Manager, Content Distribution — South Korea / Japan / SEA", email:"wilfred.chen@mediacorp.com.sg",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:99, provider:'official_website', sources:["https://contentdistribution.mediacorp.sg/pages/contact-us"]
    }
  },
  {
    company:"ZDF Studios", domain:"zdf-studios.com", url:"https://www.zdf-studios.com/", country:"Germany", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://www.zdf-studios.com/en/news-press/markets-and-events",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"Claudia Specht", title:"Marketing Assistant, Markets & Events", email:"claudia.specht@zdf-studios.com",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:98, provider:'official_website', sources:["https://www.zdf-studios.com/en/news-press/markets-and-events"]
    }
  },
  {
    company:"Beta Film", domain:"betafilm.com", url:"https://www.betafilm.com/", country:"Germany", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://www.betafilm.com/contact",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"Beta Film", title:"Market / Business Contact", email:"beta@betafilm.com",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      allowGeneric:true,
      qualified:true, score:91, provider:'official_website', sources:["https://www.betafilm.com/contact"]
    }
  },
  {
    company:"All3Media", domain:"all3media.com", url:"https://all3media.com/", country:"United Kingdom", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://all3media.com/contact/",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"All3Media", title:"General Business Enquiries", email:"info@all3media.com",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      allowGeneric:true,
      qualified:true, score:90, provider:'official_website', sources:["https://all3media.com/contact/"]
    }
  },
  {
    company:"WildBrain", domain:"wildbrain.com", url:"https://www.wildbrain.com/", country:"Canada", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://www.wildbrain.com/contact-us",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"WildBrain Content Sales", title:"Content Sales & Rights", email:"sales@wildbrain.com",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:99, provider:'official_website', sources:["https://www.wildbrain.com/contact-us"]
    }
  },
  {
    company:"Blue Ant Media", domain:"blueantmedia.com", url:"https://blueantmedia.com/", country:"Canada", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://screeningroom.blueantmedia.com/",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"Blue Ant International", title:"International Content / Screening", email:"international@blueantmedia.com",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:96, provider:'official_website', sources:["https://screeningroom.blueantmedia.com/"]
    }
  },
  {
    company:"Dori Media", domain:"dorimedia.com", url:"https://dorimedia.com/", country:"Switzerland", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://dorimedia.com/what-we-do/distribution/",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"Camila Premet", title:"Sales Manager — Asia / Middle East / Africa", email:"camila.p@dorimedia.com",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:99, provider:'official_website', sources:["https://dorimedia.com/what-we-do/distribution/"]
    }
  },
  {
    company:"Mediawan Rights", domain:"mediawan.eu", url:"https://rights.mediawan.com/", country:"France", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://rights.mediawan.com/articles/53",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"Alexandra Berenguer", title:"Communication Manager, Mediawan Rights", email:"aberenguer@mediawan.eu",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:94, provider:'official_website', sources:["https://rights.mediawan.com/articles/53"]
    }
  },
  {
    company:"Gaumont", domain:"gaumont.com", url:"https://www.gaumont.com/", country:"France", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://www.gaumont.com/en/node/2779",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"Gaumont Germany", title:"Office / Business Contact", email:"buero@gaumont.com",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:89, provider:'official_website', sources:["https://www.gaumont.com/en/node/2779"]
    }
  },
  {
    company:"Fremantle", domain:"fremantle.com", url:"https://fremantle.com/", country:"United Kingdom", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://fremantle.com/be",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"Fremantle Branded Entertainment", title:"Branded Entertainment", email:"gbe@fremantle.com",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:99, provider:'official_website', sources:["https://fremantle.com/be"]
    }
  },
  {
    company:"Imagen Television / Grupo Imagen", domain:"imagendigital.com", url:"https://www.imagentv.com/", country:"Mexico", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://www.imagentv.com/terminos-y-condiciones-de-uso",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"Grupo Imagen", title:"Official Business Contact", email:"contacto@imagendigital.com",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:91, provider:'official_website', sources:["https://www.imagentv.com/terminos-y-condiciones-de-uso"]
    }
  },
  {
    company:"Amagi", domain:"amagi.com", url:"https://www.amagi.com/", country:"India", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://www.amagi.com/newsroom/amagi-media-labs-limited-initial-public-offering-to-open-on-tuesday-january-13-2026",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"Aashish Washikar", title:"Director, Corporate Communications", email:"aashish.washikar@amagi.com",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:92, provider:'official_website', sources:["https://www.amagi.com/newsroom/amagi-media-labs-limited-initial-public-offering-to-open-on-tuesday-january-13-2026"]
    }
  },
  {
    company:"NBCUniversal", domain:"nbcuni.com", url:"https://www.nbcuniversal.com/", country:"United States", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://www.nbcuniversal.com/article/2026-27-premier-league-season-kicks-one-month-across-platforms-nbcuniversal-nbc-sports-studio-team",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"Carly Bonk", title:"NBC Sports Communications", email:"carly.bonk@nbcuni.com",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:88, provider:'official_website', sources:["https://www.nbcuniversal.com/article/2026-27-premier-league-season-kicks-one-month-across-platforms-nbcuniversal-nbc-sports-studio-team"]
    }
  },
  {
    company:"BBC Studios", domain:"bbc.com", url:"https://sales.bbcstudios.com/", country:"United Kingdom", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://sales.bbcstudios.com/contact",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"BBC Studios Korea Sales", title:"Korea Content Sales", email:"korea.sales@bbc.com",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:99, provider:'official_website', sources:["https://sales.bbcstudios.com/contact"]
    }
  },
  {
    company:"ITV Studios", domain:"itv.com", url:"https://www.itvstudios.com/", country:"United Kingdom", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://www.itvstudios.com/brand-licensing",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"ITV Studios Brand Licensing", title:"Brand Licensing & Partnerships", email:"brandlicensing@itv.com",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:99, provider:'official_website', sources:["https://www.itvstudios.com/brand-licensing"]
    }
  },
  {
    company:"ABS-CBN", domain:"abs-cbn.com", url:"https://internationalsales.abs-cbn.com/", country:"Philippines", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://internationalsales.abs-cbn.com/internationalsales/inquiry",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"ABS-CBN International Sales", title:"International Sales & Distribution", email:"internationalsales@abs-cbn.com",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:99, provider:'official_website', sources:["https://internationalsales.abs-cbn.com/internationalsales/inquiry"]
    }
  },
  {
    company:"Globo", domain:"g.globo", url:"https://screening.globo.com/", country:"Brazil", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://screening.globo.com/contact/",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"Globo International Distribution", title:"International Content Sales", email:"sales@g.globo",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:99, provider:'official_website', sources:["https://screening.globo.com/contact/"]
    }
  },
  {
    company:"STUDIOCANAL", domain:"studiocanal.com", url:"https://www.studiocanal.com/", country:"France", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://studiocloud.studiocanal.com/Home/ContactUs",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"Julia Lowy", title:"STUDIOCANAL Contact", email:"Julia.LOWY@studiocanal.com",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:90, provider:'official_website', sources:["https://studiocloud.studiocanal.com/Home/ContactUs"]
    }
  },
  {
    company:"Eccho Rights", domain:"ecchorights.com", url:"https://ecchorights.com/", country:"Sweden", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://ecchorights.com/about",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"Eccho Rights", title:"Business / Distribution Enquiries", email:"info@ecchorights.com",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      allowGeneric:true,
      qualified:true, score:94, provider:'official_website', sources:["https://ecchorights.com/about"]
    }
  },
  {
    company:"DCD Rights", domain:"dcdrights.com", url:"https://dcdrights.com/", country:"United Kingdom", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://dcdrights.com/contact",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"DCD Rights Sales & Acquisitions", title:"Sales & Acquisitions Team", email:"team@dcdrights.com",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      allowGeneric:true,
      qualified:true, score:96, provider:'official_website', sources:["https://dcdrights.com/contact"]
    }
  },
  {
    company:"Sony Pictures Television", domain:"sony.com", url:"https://www.sonypictures.com/", country:"United States", tier:'prospect',
    relation:'BCWW 2026 해외 콘텐츠 업계 접촉 후보 · 참가 여부 미확정',
    source_url:"https://edit.formats.sonypictures.com/contactus",
    evidence:'Official company site publishes this business contact. BCWW 2026 attendance is not yet confirmed.',
    contact:{
      name:"Laura St Clair", title:"SVP, International Formats", email:"Laura_StClair@spe.sony.com",
      emailStatus:'official_public', verificationMethod:'official_public', officialSource:true,
      qualified:true, score:99, provider:'official_website', sources:["https://edit.formats.sonypictures.com/contactus"]
    }
  }
];

// Every static seed is eligible for fresh BCWW 2026 evidence checks.
// A fresh match upgrades the row to "confirmed" while keeping the hardcoded official email as fallback.
const WATCHLIST = [...RECURRENCE_SEEDS, ...PROSPECT_SEEDS];

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
    const fallback=seed.contact||null;
    found.push(makeLead({
      ...seed,tier:'confirmed',relation:'BCWW 2026 현재 참가 근거 자동 확인',source_url:clean(hit.url,700),
      evidence:clean(`${hit.title||''} ${hit.content||hit.snippet||''}`,1200),
      contact:contacts[0]||fallback,
      contacts:contacts.length?contacts.slice(0,4):[fallback].filter(Boolean)
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
  if(seed.tier==='prospect'){
    return `Hi ${seed.company} team,\n\nIs anyone from your international, content, sales or partnerships team planning to attend BCWW 2026 in Seoul this September?\n\nIf so, we produce branded T-shirts, polos and staff wear locally in Seoul and can deliver directly to COEX or your hotel, avoiding overseas shipping and customs.\n\nIf teamwear is still open, I can send simple local pricing and turnaround options.`;
  }
  return `Hi,\n\nI saw that ${seed.company} is coming to BCWW 2026 in Seoul. Have you already sorted team shirts or staff wear for the event?\n\nWe produce branded apparel locally in Seoul and can deliver directly to COEX or your hotel, with no overseas shipping or customs.\n\nIf it is still open, I can send a few local options with pricing and turnaround.`;
}

function makeLead(seed={}){
  const domain=rootHost(seed.domain), contact=seed.contact||null, tier=seed.tier||'confirmed';
  const relationConfirmed=tier==='channel';
  const participationConfirmed=tier==='confirmed';
  const sourceUrl=clean(seed.source_url,700);
  const score=tier==='confirmed'?95:tier==='channel'?94:tier==='recurrence'?84:90;
  const priority=tier==='confirmed'?98:tier==='channel'?96:tier==='recurrence'?86:90;
  return {
    id:`bcww:${tier}:${domain}`, campaign:'bcww', campaign_label:'BCWW 단체복', company:seed.company, domain,
    url:clean(seed.url,700)||`https://${domain}/`, source_url:sourceUrl, source_title:seed.relation||'', evidence_urls:[sourceUrl].filter(Boolean),
    evidence_grade:tier==='confirmed'?'A':tier==='channel'?'CHANNEL':tier==='recurrence'?'R2025':'PROSPECT',
    evidence_reason:seed.relation||'', signal:seed.evidence||seed.relation||'',
    score, sales_priority:priority,
    verified_company:true, bcww_confirmed:participationConfirmed, bcww_participation_confirmed:participationConfirmed,
    bcww_relation_confirmed:relationConfirmed, bcww_sales_candidate:true, bcww_outreach_tier:tier,
    bcww_interest:false, team_origin:'foreign', team_origin_country:seed.country||'', outreach_language:'en',
    recommended_role:contact?.title||'Events / Marketing', role_targets:['Event Marketing','Marketing','Brand','Partnerships','Business Development','Sales','Operations'],
    contact, contacts:seed.contacts||[contact].filter(Boolean), contact_provider:contact?.provider||null,
    contact_status:contact?'found':'failed', contact_failure_reason:contact?'':'이메일 탐색 미완료', contact_score_threshold:75,
    subject:tier==='recurrence'
      ?`Are you returning to BCWW 2026? — local teamwear in Seoul`
      :tier==='prospect'
        ?`BCWW 2026 Seoul — local teamwear for ${seed.company}`
        :`BCWW 2026 Seoul teamwear for ${seed.company}`,
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
  const excludes=await exclusionSet(body);

  if(body.seedsOnly){
    const supplemental=[...CURRENT_CHANNELS,...RECURRENCE_SEEDS,...PROSPECT_SEEDS].filter(s=>!excludes.has(normalizeCompanyKey(s.domain))).map(makeLead);
    return Response.json({leads:supplemental.slice(0,30),meta:{returned:Math.min(30,supplemental.length),seeds_only:true}},{headers:{'Cache-Control':'no-store'}});
  }
  const baseResponse=await basePost(request);
  const raw=await baseResponse.text();
  if(!baseResponse.ok)return new Response(raw,{status:baseResponse.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  let data={}; try{data=raw?JSON.parse(raw):{};}catch{return new Response(raw,{status:baseResponse.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}


  const supplemental=[...CURRENT_CHANNELS,...RECURRENCE_SEEDS,...PROSPECT_SEEDS]
    .filter(seed=>!excludes.has(normalizeCompanyKey(seed.domain)))
    .map(makeLead);
  const watch=await findCurrentWatchlist(body.cycle||0,excludes);

  const all=[...(Array.isArray(data.leads)?data.leads:[]),...watch.found,...supplemental];
  const byDomain=new Map();
  const rank=lead=>lead?.bcww_participation_confirmed===true?4:lead?.bcww_outreach_tier==='channel'?3:lead?.bcww_outreach_tier==='recurrence'?2:1;
  for(const lead of all){
    const d=rootHost(lead?.domain); if(!d||excludes.has(normalizeCompanyKey(d)))continue;
    const prev=byDomain.get(d);
    if(!prev||rank(lead)>rank(prev)||(rank(lead)===rank(prev)&&lead?.contact&&!prev?.contact))byDomain.set(d,lead);
  }
  const leads=[...byDomain.values()]
    .sort((a,b)=>rank(b)-rank(a)||Number(Boolean(b.contact))-Number(Boolean(a.contact))||Number(b.sales_priority||0)-Number(a.sales_priority||0))
    .slice(0,30);
  const direct=leads.filter(x=>x.bcww_participation_confirmed===true).length;
  const channel=leads.filter(x=>x.bcww_outreach_tier==='channel').length;
  const recurrence=leads.filter(x=>x.bcww_outreach_tier==='recurrence').length;
  const prospect=leads.filter(x=>x.bcww_outreach_tier==='prospect').length;
  const ready=leads.filter(x=>x.contact?.email).length;

  return Response.json({
    ...data, leads,
    meta:{
      ...(data.meta||{}), returned:leads.length, sales_candidates:leads.length,
      hardcoded_seed_total:CURRENT_CHANNELS.length+RECURRENCE_SEEDS.length+PROSPECT_SEEDS.length,
      current_direct_participants:direct, current_channel_leads:channel, recurrence_outreach:recurrence, prospect_outreach:prospect,
      contact_ready:ready, contact_unresolved:Math.max(0,leads.length-ready),
      watchlist_total:WATCHLIST.length, watchlist_checked_this_cycle:watch.checked, watchlist_upgraded:watch.found.length,
      pipeline_mode:'30 hardcoded BCWW sales candidates + rotating fresh 2026 participation verification',
      truth_policy:'prospect, channel and recurrence leads are labeled separately and are never presented as confirmed 2026 exhibitors'
    }
  },{headers:{'Cache-Control':'no-store'}});
}
