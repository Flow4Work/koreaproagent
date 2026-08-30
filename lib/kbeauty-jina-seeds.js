const JINA_READER_URL = 'https://r.jina.ai/';

const SOURCES = [
  {
    url:'https://www.intercharmkorea.com/en-us/Exhibitor_directory.html',
    event:'InterCHARM Korea 2026',
    score:94,
    marker:/(?:July\s+1\s*-\s*3,?\s*2026|1\s*-\s*3\s+July\s+2026)/i
  },
  {
    url:'https://www.in-cosmetics.com/korea/en-gb/exhibitor-directory/exhibitor-directory.html',
    event:'in-cosmetics Korea 2026',
    score:92,
    marker:/(?:Exhibitor\s+Directory\s+2026|2026\s+Exhibitor\s+Directory|2026\s+참가업체\s+디렉토리)/i
  }
];

const EVENT_HOSTS = new Set(['intercharmkorea.com','in-cosmetics.com','rxglobal.com','reedexpo.com','google.com','docs.google.com']);
const SOCIAL_HOSTS = new Set(['linkedin.com','facebook.com','instagram.com','x.com','twitter.com','youtube.com']);
const META_LINE = /^(?:website|email|products?|documents?|brands?|categories?|filters?|features?|show information(?:\s*&\s*contact)?|useful links|register now|exhibit inquiry|privacy options|built by rx|copyright|search exhibitors?|search|image(?::.*)?|sponsor(?: of .*)?|new exhibitor|exhibitors?|stand\b.*|booth(?: no\.)?\b.*|coex(?:,? seoul)?|seoul|july\b.*|1\s*-\s*3\s+july\b.*)$/i;
const SENTENCE_WORDS = /\b(?:we|our|is|are|was|were|has|have|offers?|provides?|specializes?|specialising|founded|established|manufacturer|manufacturing|develops?|supplies?|serves?|focused|based)\b/i;
const FOREIGN_COUNTRIES = [
  ['China',/\bChina\b|Chinese|Guangzhou|Shenzhen|Shanghai|Zhejiang|Ningbo|Dongguan|Suzhou|Foshan|Zhuhai|Jiangsu|Jiangxi|Hangzhou|中國|中国/i],
  ['Japan',/\bJapan\b|Japanese|日本/i],
  ['India',/\bIndia\b|Indian|Pvt\.?\s*Ltd/i],
  ['Taiwan',/\bTaiwan\b|Taiwanese|臺灣|台湾/i],
  ['Hong Kong',/\bHong\s*Kong\b/i],
  ['Malaysia',/\bMalaysia\b|Malaysian|Sdn\s*Bhd/i],
  ['Singapore',/\bSingapore\b|Singaporean|Pte\.?\s*Ltd/i],
  ['Thailand',/\bThailand\b|Thai\b/i],
  ['Vietnam',/\bVietnam\b|Vietnamese/i],
  ['Philippines',/\bPhilippines\b|Filipino/i],
  ['Indonesia',/\bIndonesia\b|Indonesian/i],
  ['Germany',/\bGermany\b|German\b|GmbH/i],
  ['France',/\bFrance\b|French\b/i],
  ['Italy',/\bItaly\b|Italian\b|\bsrl\b/i],
  ['Netherlands',/\bNetherlands\b|Dutch\b|B\.V\./i],
  ['Spain',/\bSpain\b|Spanish\b/i],
  ['United Kingdom',/\bUnited\s+Kingdom\b|\bUK\b|British/i],
  ['United States',/\bUnited\s+States\b|\bUSA\b|\bU\.S\.\b|American/i],
  ['Canada',/\bCanada\b|Canadian/i],
  ['Australia',/\bAustralia\b|Australian|Pty\s*Ltd/i],
  ['Brazil',/\bBrazil\b|Brazilian/i],
  ['Mexico',/\bMexico\b|Mexican/i],
  ['United Arab Emirates',/\bUnited\s+Arab\s+Emirates\b|\bUAE\b/i],
  ['Saudi Arabia',/\bSaudi\s+Arabia\b|Saudi\b/i],
  ['Türkiye',/\bT(?:u|ü)rkiye\b|\bTurkey\b|Turkish/i]
];

const clean = (value='', max=500) => String(value || '').replace(/\s+/g,' ').trim().slice(0,max);

function decodeHtml(value='') {
  return String(value || '')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)||32));
}

function stripMarkdown(value='', max=180) {
  return clean(decodeHtml(String(value || ''))
    .replace(/!\[[^\]]*\]\([^)]*\)/g,' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
    .replace(/^\s*[-*+]\s+/,'')
    .replace(/[*_`>#~]+/g,' '),max);
}

function rootHost(value='') {
  let raw=clean(value,500).toLowerCase();
  if(!raw)return'';
  if(raw.includes('@')&&!raw.includes('://'))raw=raw.split('@').pop()||'';
  try{raw=new URL(raw.includes('://')?raw:`https://${raw}`).hostname;}catch{raw=raw.split('/')[0].split(':')[0];}
  raw=raw.replace(/^www\./,'').replace(/\.+$/,'');
  const parts=raw.split('.').filter(Boolean);
  if(parts.length<=2)return raw;
  const second=new Set(['ac','co','com','edu','go','gov','ne','net','or','org']);
  const depth=parts.at(-1)?.length===2&&second.has(parts.at(-2))?3:2;
  return parts.slice(-depth).join('.');
}

function companyKey(value='') {
  return clean(value,180).toLowerCase()
    .replace(/\b(?:inc|llc|ltd|limited|corp|corporation|company|co|gmbh|plc)\b/giu,' ')
    .replace(/[^\p{L}\p{N}]+/gu,' ')
    .replace(/\s+/g,' ').trim();
}

function validCompany(value='') {
  const name=clean(value,180);
  if(name.length<2||name.length>150)return false;
  if(META_LINE.test(name))return false;
  if(/^(?:home|about|contact|more|next|previous|exhibitor directory|exhibitor details|company information|skin care|body care|cosmetics|manufacturing|logo|canvas logo|logoimg|k-beauty expo|intercharm korea|in-cosmetics korea|coex|kintex)$/i.test(name))return false;
  if(/^\d+\s+exhibitors?$/i.test(name))return false;
  if(/^[\d\s:()+-]+$/.test(name))return false;
  return true;
}

function usableDomain(value='') {
  const host=rootHost(value);
  if(!host||host.endsWith('.kr')||host.endsWith('.co.kr'))return'';
  if([...EVENT_HOSTS].some(base=>host===base||host.endsWith(`.${base}`)))return'';
  if([...SOCIAL_HOSTS].some(base=>host===base||host.endsWith(`.${base}`)))return'';
  return host;
}

function countryFromBlock(block='') {
  for(const [country,pattern] of FOREIGN_COUNTRIES) if(pattern.test(block)) return country;
  return '';
}

function linkedLabel(rawLine='') {
  const standard=String(rawLine).match(/^\s*(?:[-*+]\s*)?\[([^\]]{2,160})\]\((?:https?:\/\/|mailto:)[^)]+\)/)?.[1];
  if(standard)return stripMarkdown(standard,180);
  const jina=String(rawLine).match(/^\s*【\d+†([^】]{2,160})】/)?.[1];
  return jina?stripMarkdown(jina,180):'';
}

function plausibleLine(rawLine='') {
  const linked=linkedLabel(rawLine);
  const value=linked||stripMarkdown(rawLine,180);
  if(!validCompany(value))return'';
  const words=value.split(/\s+/).filter(Boolean);
  if(words.length>16)return'';
  if(words.length>8&&SENTENCE_WORDS.test(value))return'';
  if(/[.!?]$/.test(value)&&words.length>6)return'';
  if(/^(?:sponsor|brands?|categories?)\b/i.test(value))return'';
  return value;
}

function domainAndEmailFromText(block='') {
  const raw=decodeHtml(String(block||''));
  const links=[...raw.matchAll(/https?:\/\/[^\s)\]"'<>]+/gi)].map(match=>match[0]);
  let domain='';
  for(const link of links){const host=usableDomain(link);if(host){domain=host;break;}}
  if(!domain)return{domain:'',public_email:''};
  const emails=raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[];
  const public_email=emails.map(v=>clean(v,240).toLowerCase()).find(email=>rootHost(email)===domain)||'';
  return{domain,public_email};
}

function makeRow(company, block, source) {
  const {domain,public_email}=domainAndEmailFromText(block);
  return {
    company:clean(company,180),
    country:countryFromBlock(block),
    domain,
    public_email,
    tier:'korea_beauty_event_2026',
    score:source.score,
    source_event:source.event,
    source_url:source.url,
    source_title:`${source.event} official directory via Jina Reader`,
    evidence_type:'official_exhibitor_directory',
    evidence_text:`Listed in the official ${source.event} exhibitor directory.`,
    curated_2026:true,
    foreign_status:'pending_official_domain_verification',
    seed_provider:'jina_reader'
  };
}

export function parseJinaDirectory(markdown='', source=SOURCES[0]) {
  const raw=decodeHtml(String(markdown||''));
  if(!source?.marker?.test(raw))return[];
  const rows=[];
  const seen=new Set();

  // First use semantic markdown headings when the rendered page preserves them.
  const heading=/^(#{2,4})\s+(.+?)\s*$/gm;
  const headings=[...raw.matchAll(heading)];
  for(let i=0;i<headings.length;i+=1){
    const match=headings[i],level=String(match[1]).length;
    const company=stripMarkdown(match[2],180),key=companyKey(company);
    if(!validCompany(company)||!key||seen.has(key))continue;
    let end=raw.length;
    for(let j=i+1;j<headings.length;j+=1){if(String(headings[j][1]).length<=level){end=Number(headings[j].index)||raw.length;break;}}
    const block=raw.slice(Number(match.index)||0,end);
    if(!/(?:\bStand\b|\bBooth\b|부스번호|부스)/i.test(block))continue;
    seen.add(key);rows.push(makeRow(company,block,source));
  }

  // RX directory cards are often rendered as plain lines. A stand marker closes each exhibitor card.
  const lines=raw.split(/\r?\n/);
  const standIndexes=[];
  for(let i=0;i<lines.length;i+=1){
    const line=stripMarkdown(lines[i],220);
    if(/^(?:Stand|Booth(?:\s+No\.)?|부스번호|부스)\s+[A-Z0-9][A-Z0-9-]*/i.test(line))standIndexes.push(i);
  }
  let previous=-1;
  for(const standIndex of standIndexes){
    const segment=lines.slice(previous+1,standIndex);
    let candidate='',candidateIndex=-1;
    for(let i=0;i<segment.length;i+=1){
      const value=plausibleLine(segment[i]);
      if(!value)continue;
      candidate=value;candidateIndex=i;break;
    }
    previous=standIndex;
    const key=companyKey(candidate);
    if(!candidate||!key||seen.has(key))continue;
    const block=segment.slice(Math.max(0,candidateIndex)).join('\n');
    seen.add(key);rows.push(makeRow(candidate,block,source));
  }
  return rows;
}

async function jinaRead(source) {
  const key=clean(process.env.JINA_API_KEY,5000);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),28000);
  try{
    const headers={Accept:'text/markdown'};
    if(key)headers.Authorization=`Bearer ${key}`;
    const response=await fetch(`${JINA_READER_URL}${source.url}`,{method:'GET',headers,cache:'no-store',signal:controller.signal});
    if(!response.ok)return'';
    return await response.text();
  }catch{return'';}
  finally{clearTimeout(timer);}
}

export async function collectJinaOfficial2026Seeds(target=500) {
  const wanted=Math.max(1,Math.min(500,Number(target)||500));
  const rendered=await Promise.all(SOURCES.map(async source=>({source,markdown:await jinaRead(source)})));
  const rows=[],seen=new Set();
  for(const {source,markdown} of rendered){
    for(const row of parseJinaDirectory(markdown,source)){
      const company=clean(row?.company,180),key=companyKey(company);
      if(!company||!key||seen.has(key))continue;
      // Known-Korean/localized cards are not useful for this overseas campaign; unknown origin still goes through downstream foreign verification.
      if(!row.country&&/[가-힣]/.test(company))continue;
      seen.add(key);rows.push({...row,company});
      if(rows.length>=wanted)return rows;
    }
  }
  return rows.slice(0,wanted);
}
