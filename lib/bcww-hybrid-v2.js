import { publicWebSearch, publicWebSearchMany } from './public-web-search.js';
import { aiConfigured, chatJson } from './ai-provider.js';
import { findContacts } from './contact-discovery-v2.js';
import { listSentCompanyDomains, matchSentCompanies, normalizeCompanyKey } from './sent-companies.js';
import { listDeletedCompanyDomains } from './deleted-companies.js';

const EVENT = { name:'BCWW 2026', dates:'2026-09-14–2026-09-16', venue:'COEX Hall B, Seoul' };
const SOURCE_HOSTS = new Set(['bcww.kr','kocca.kr','bizinfo.go.kr','coex.co.kr','linkedin.com','10times.com','actinter.co.jp','welcon.kocca.kr']);
const BLOCKED_SOURCE_HOSTS = new Set(['10times.com']);
const BLOCKED_LOCAL = new Set(['admin','contact','hello','info','office','team','support','help','security','press','media','careers','hr','jobs','legal','privacy','noreply','no-reply']);
const ROLE_LOCAL = /^(events?|eventmarketing|marketing|brand|partnerships?|partners?|business|bizdev|bd|sales|operations?|ops|commercial)$/i;
const ROLE_TEXT = /(event|field marketing|marketing|brand|partnership|business development|sales|commercial|operations|producer|distribution|international|asia|apac|chief operating|coo|founder|ceo)/i;
const BCWW = /(?:\bBCWW\b|Broadcast\s*World\s*Wide|국제방송영상마켓)/i;
const DATE_2026 = /(?:\b2026\b|2026年|2026년)/i;
const EXACT_DATES = /(?:Sep(?:tember)?\.?\s*14\s*[-–—~]\s*16|14\s*[-–—~]\s*16\s*Sep(?:tember)?|9\s*월\s*14\s*일\s*[-–—~]\s*16\s*일|9\/14\s*[-–—~]\s*9\/16)/i;
const PARTICIPATION_A = /(\bstand\s*(?:#|no\.?|number)?\s*[a-z0-9-]+|\bbooth\s*(?:#|no\.?|number)?\s*[a-z0-9-]+|\bexhibit(?:or|ing|s|ed)?\b|\bparticipat(?:e|es|ed|ing)\b|\battend(?:ing|s|ed)?\b|\bjoin(?:ing|s|ed)?\b|\bmeet\s+us\b|\bsee\s+you\b|\bshowcase(?:s|d|ing)?\b|\bpitch(?:es|ed|ing)?\b|\bdelegation\b|\bpavilion\b|出展|参展|參展|참가|부스|전시)/i;
const INTEREST_ONLY = /(followers?|shown\s+interest|interested\s+attendees?|users?\s+who\s+have\s+shown\s+interest|관심자|관심\s*등록)/i;
const RECRUITMENT_ONLY = /(applications?\s+(?:are\s+)?open|registration\s+(?:is\s+)?open|apply\s+(?:now|by)|application\s+deadline|call\s+for\s+exhibitors?|모집(?:공고)?|신청(?:기간|방법)?|募集|応募|招募|报名|報名)/i;

const ROLE_TARGETS = ['Event Marketing','Field Marketing','Head of Marketing','Marketing Director','Brand Marketing','Partnerships','Business Development','Operations','Commercial','Founder','CEO'];

// Hard-coded only where current 2026 participation and the contact are both supported by first-party pages.
const VERIFIED_SEEDS = [
  {
    company:'TransPerfect Media',
    domain:'transperfect.com',
    country:'United States',
    source_url:'https://media.transperfect.com/',
    source_title:'TransPerfect Media – Upcoming Events',
    evidence:'BCWW – Sep 14-16, Seoul, Korea',
    grade:'B',
    participation:'company event calendar',
    contact:{
      name:'Thiem Minh Truong',
      title:'COO-Asia',
      email:'thiemminh.truong@transperfect.com',
      emailStatus:'official_public',
      verificationMethod:'official_public',
      officialSource:true,
      qualified:true,
      score:94,
      sources:['https://media.transperfect.com/services/localization/translation-services/?lang=en'],
      provider:'official_website'
    }
  }
];

const SOURCE_URLS = [
  'https://bcww.kr/',
  'https://bcww.kr/page_registernow.php',
  'https://bcww.kr/page_program_showcase.php',
  'https://www.actinter.co.jp/exhibition/info/bcww/',
  'https://media.transperfect.com/'
];

const SEARCH_BATCHES = [
  [
    '"BCWW" "Sep 14-16" Seoul company',
    '"BCWW" "September 14-16" Seoul media',
    '"BCWW 2026" booth OR stand company',
    '"BCWW 2026" exhibiting OR attending company',
    '"BCWW 2026" "see you" Seoul',
    '"BCWW 2026" "meet us" Seoul'
  ],
  [
    '"BCWW 2026" 出展 企業',
    '"BCWW 2026" 参加 会社',
    '"BCWW 2026" 参展 公司',
    '"BCWW 2026" 參展 公司',
    '"BCWW 2026" 해외 참가 기업',
    '"BCWW" "14-16 September" Seoul'
  ],
  [
    '"BCWW 2026" delegation pavilion',
    '"BCWW 2026" showcase company',
    'site:linkedin.com "BCWW 2026" "Stand #"',
    'site:linkedin.com "BCWW 2026" "See you"',
    'site:*.com "BCWW" "Sep 14-16" Seoul',
    'site:*.jp "BCWW 2026" 出展'
  ]
];

function clean(value = '', max = 800) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max); }
function rootHost(value = '') {
  let host = clean(value, 500).toLowerCase();
  if (!host) return '';
  try { host = new URL(host.includes('://') ? host : `https://${host}`).hostname; } catch { host = host.split('/')[0]; }
  host = host.replace(/^www\./,'');
  const p = host.split('.').filter(Boolean);
  if (p.length <= 2) return host;
  const sld = new Set(['co','com','org','net','ac','go','gov']);
  return p.at(-1)?.length === 2 && sld.has(p.at(-2)) ? p.slice(-3).join('.') : p.slice(-2).join('.');
}
function sameDomain(email = '', domain = '') {
  const e = clean(email, 260).toLowerCase().split('@')[1] || '';
  const d = rootHost(domain);
  return Boolean(e && d && (e === d || e.endsWith(`.${d}`)));
}
function sourceHost(url = '') { return rootHost(url); }
function sourceLike(url = '') { const h = sourceHost(url); return SOURCE_HOSTS.has(h) || /(?:news|press|directory|event|expo|fair|conference)/i.test(h); }
function currentEvent(text = '') { const t = clean(text, 16000); return BCWW.test(t) && (DATE_2026.test(t) || EXACT_DATES.test(t)); }

export function gradeParticipationEvidence(text = '', { companyOwned = false } = {}) {
  const t = clean(text, 16000);
  if (!currentEvent(t) || INTEREST_ONLY.test(t)) return '';
  if (RECRUITMENT_ONLY.test(t) && !PARTICIPATION_A.test(t.replace(RECRUITMENT_ONLY, ''))) return '';
  if (PARTICIPATION_A.test(t)) return 'A';
  if (companyOwned && EXACT_DATES.test(t) && /(?:Seoul|서울|Korea|한국)/i.test(t)) return 'B';
  return '';
}

async function fetchText(url = '', timeoutMs = 5500) {
  if (!/^https?:\/\//i.test(url) || BLOCKED_SOURCE_HOSTS.has(sourceHost(url))) return '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect:'follow', cache:'no-store', signal:controller.signal, headers:{ 'User-Agent':'Mozilla/5.0 KoreaAgent/BCWW-Hybrid', Accept:'text/html,text/plain,application/xml;q=0.8,*/*;q=0.5' } });
    if (!res.ok) return '';
    const type = String(res.headers.get('content-type') || '');
    if (type && !/(html|text|xml|json)/i.test(type)) return '';
    return (await res.text()).slice(0, 500000);
  } catch { return ''; } finally { clearTimeout(timer); }
}

function stripHtml(value = '') {
  return clean(String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/gi,"'").replace(/&quot;/gi,'"'), 18000);
}

async function tavilySearch(query = '', maxResults = 10) {
  const key = clean(process.env.TAVILY_API_KEY, 5000);
  if (!key) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method:'POST', signal:controller.signal, cache:'no-store',
      headers:{ Authorization:`Bearer ${key}`, 'Content-Type':'application/json' },
      body:JSON.stringify({ query, search_depth:'basic', topic:'general', time_range:'year', max_results:maxResults, include_raw_content:true, include_answer:false })
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.results || []).map(r => ({ title:clean(r.title,300), url:clean(r.url,700), content:clean(r.raw_content || r.content,9000), published_date:clean(r.published_date,80), source:'tavily', score:Number(r.score)||0.7 }));
  } catch { return []; } finally { clearTimeout(timer); }
}

function dedupeRows(rows = []) {
  const by = new Map();
  for (const row of rows.flat()) {
    const url = clean(row?.url,700);
    if (!/^https?:\/\//i.test(url) || BLOCKED_SOURCE_HOSTS.has(sourceHost(url))) continue;
    const key = url.replace(/\/$/,'');
    const next = { title:clean(row?.title,300), url, content:clean(row?.content || row?.snippet || row?.description,10000), published_date:clean(row?.published_date,80), source:clean(row?.source,60)||'web', score:Number(row?.score)||0 };
    const prev = by.get(key);
    by.set(key, prev ? { ...prev, content:clean(`${prev.content} ${next.content}`,15000), source:[...new Set(`${prev.source}+${next.source}`.split('+'))].join('+'), score:Math.max(prev.score,next.score) } : next);
  }
  return [...by.values()].sort((a,b)=>b.score-a.score);
}

async function sourceRows() {
  const rows = await Promise.all(SOURCE_URLS.map(async url => ({ url, title:url, content:stripHtml(await fetchText(url)), source:'seed_source', score:0.98 })));
  return rows.filter(row => row.content);
}

async function discoverRows(cycle = 0) {
  const first = SEARCH_BATCHES[Math.abs(Number(cycle)||0) % SEARCH_BATCHES.length];
  const second = SEARCH_BATCHES[(Math.abs(Number(cycle)||0) + 1) % SEARCH_BATCHES.length];
  const queries = [...first, ...second];
  const [publicA, publicB, tv, direct] = await Promise.all([
    publicWebSearchMany(first, { maxResults:16, timeRange:'year', topic:'general' }).catch(()=>({results:[]})),
    publicWebSearchMany(second, { maxResults:16, timeRange:'year', topic:'general' }).catch(()=>({results:[]})),
    process.env.TAVILY_API_KEY ? Promise.all(queries.slice(0,8).map(q => tavilySearch(q, 8))) : Promise.resolve([]),
    sourceRows()
  ]);
  return dedupeRows([publicA.results || [], publicB.results || [], tv, direct])
    .filter(row => BCWW.test(`${row.title} ${row.content} ${row.url}`))
    .slice(0,56);
}

function quoteSupported(quote = '', row = {}) {
  const q = clean(quote,1000).toLowerCase();
  const text = clean(`${row.title} ${row.content}`,18000).toLowerCase();
  return q.length >= 15 && text.includes(q);
}

async function aiCandidates(rows = []) {
  if (!rows.length || !aiConfigured()) return [];
  const prompt = `Find organizations that are genuinely useful BCWW 2026 branded-apparel sales leads.\n\nThe product is locally produced branded T-shirts/polos/staff wear in Seoul for overseas teams coming to BCWW.\n\nACCEPT:\n- explicit booth/stand/exhibiting/attending/showcase/delegation evidence for BCWW 2026; OR\n- a COMPANY-OWNED official event/calendar page listing BCWW with Sep 14-16 in Seoul even if the page omits the year beside BCWW.\n- foreign organizations only.\n\nREJECT:\n- follower / shown-interest / 10times visitor lists\n- application or exhibitor recruitment notices\n- 2025-only evidence\n- Korean companies/subsidiaries\n- organizers that merely advertise the event\n- guesses.\n\nReturn only JSON: {"items":[{"row_id":"r0","company":"name","country":"country or empty","evidence_quote":"EXACT excerpt copied from row","participation":"booth|exhibiting|attending|showcase|delegation|company_calendar","confidence":90}]}\nOnly confidence >= 86.\nROWS:\n${JSON.stringify(rows.slice(0,40).map((r,i)=>({row_id:`r${i}`,title:r.title,url:r.url,text:clean(r.content,6500)})))}`;
  try {
    const out = await chatJson({ prompt, maxTokens:2600, timeoutMs:30000, hardDeadlineMs:38000, temperature:0 });
    return (out?.data?.items || []).map(x => ({ row_id:clean(x.row_id,10), company:clean(x.company,160), country:clean(x.country,80), evidence_quote:clean(x.evidence_quote,1000), participation:clean(x.participation,60), confidence:Number(x.confidence)||0 })).filter(x => x.company && x.evidence_quote && x.confidence >= 86);
  } catch { return []; }
}

async function resolveDomain(company = '', source = {}) {
  const sh = sourceHost(source.url);
  if (sh && !sourceLike(source.url) && !/\.kr$/.test(sh)) return { domain:sh, url:`https://${sh}/` };
  const q = `"${clean(company,160)}" official website`;
  const [pub, tv] = await Promise.all([
    publicWebSearch(q,{maxResults:8,timeRange:'year',topic:'general'}).catch(()=>({results:[]})),
    process.env.TAVILY_API_KEY ? tavilySearch(q,8) : Promise.resolve([])
  ]);
  for (const row of dedupeRows([pub.results || [], tv])) {
    const h = sourceHost(row.url);
    if (!h || sourceLike(row.url) || h.endsWith('.kr')) continue;
    const text = `${row.title} ${row.content}`.toLowerCase();
    const tokens = clean(company,160).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').split(/\s+/).filter(x=>x.length>2);
    if (!tokens.length || tokens.some(t => text.includes(t))) return { domain:h, url:`https://${h}/` };
  }
  return null;
}

const COUNTRY_TLD = new Map([['jp','Japan'],['tw','Taiwan'],['th','Thailand'],['sg','Singapore'],['ph','Philippines'],['id','Indonesia'],['my','Malaysia'],['vn','Vietnam'],['hk','Hong Kong'],['cn','China'],['in','India'],['au','Australia'],['nz','New Zealand'],['us','United States'],['ca','Canada'],['uk','United Kingdom'],['fr','France'],['de','Germany'],['es','Spain'],['it','Italy'],['nl','Netherlands'],['br','Brazil'],['mx','Mexico'],['ae','United Arab Emirates']]);
function tldCountry(domain='') { return COUNTRY_TLD.get(rootHost(domain).split('.').pop()||'') || ''; }
function korean(value='') { return /(?:^|\b)(?:South\s+Korea|Republic\s+of\s+Korea|Korea)(?:$|\b)|대한민국|한국/i.test(clean(value,300)); }

async function resolveCountry(company='', domain='', hinted='') {
  if (hinted && !korean(hinted)) return hinted;
  const byTld = tldCountry(domain); if (byTld) return byTld;
  const q = `"${clean(company,160)}" headquarters country`;
  const rows = (await publicWebSearch(q,{maxResults:6,timeRange:'year',topic:'general'}).catch(()=>({results:[]}))).results || [];
  const text = rows.map(r=>`${r.title} ${r.content}`).join(' ');
  const countries = ['United States','United Kingdom','Japan','Taiwan','Thailand','Singapore','Philippines','Indonesia','Malaysia','Vietnam','Hong Kong','China','India','Australia','New Zealand','Canada','France','Germany','Spain','Italy','Netherlands','Brazil','Mexico','United Arab Emirates'];
  return countries.find(c => new RegExp(c.replace(' ','\\s*'),'i').test(text)) || '';
}

function emailRegex() { return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi; }
function roleFromContext(context='', email='') {
  const local = email.split('@')[0] || '';
  if (/event/i.test(local)) return 'Events';
  if (/marketing|brand/i.test(local)) return 'Marketing';
  if (/partner/i.test(local)) return 'Partnerships';
  if (/business|bizdev|bd/i.test(local)) return 'Business Development';
  if (/sales|commercial/i.test(local)) return 'Sales / Commercial';
  if (/operations?|ops/i.test(local)) return 'Operations';
  const m = clean(context,260).match(/(?:Head of Sales|Sales Manager|Sales Director|Marketing Director|Head of Marketing|COO(?:-Asia)?|Chief Operating Officer|Business Development(?: Director| Manager)?|Partnerships?(?: Director| Manager)?|Operations?(?: Director| Manager)?|Founder|CEO)/i);
  return m?.[0] || 'Official website contact';
}
function extractOfficialEmails(text='', domain='', source='') {
  const flat = stripHtml(text);
  const hits = [...new Set(flat.match(emailRegex()) || [])].map(e=>e.toLowerCase()).filter(e=>sameDomain(e,domain));
  return hits.flatMap(email => {
    const local = email.split('@')[0] || '';
    if (BLOCKED_LOCAL.has(local)) return [];
    const at = flat.toLowerCase().indexOf(email.toLowerCase());
    const context = at >= 0 ? flat.slice(Math.max(0,at-180),at+email.length+180) : '';
    const personLike = !ROLE_LOCAL.test(local) && /[a-z].*[._-].*[a-z]|^[a-z]{6,}$/i.test(local);
    const role = roleFromContext(context,email);
    const score = Math.min(96, 80 + (personLike?8:0) + (ROLE_TEXT.test(context)?6:0) + (ROLE_LOCAL.test(local)?4:0));
    return [{ name:'', title:role, email, emailStatus:'official_public', verificationMethod:'official_public', officialSource:true, qualified:true, score, sources:[source], provider:'official_website' }];
  });
}

function linksFromHtml(html='', base='', domain='') {
  const out=[]; const re=/href=["']([^"'#]+)["']/gi; let m;
  while ((m=re.exec(String(html))) && out.length<20) {
    try { const u=new URL(m[1],base); if(rootHost(u.href)!==rootHost(domain)) continue; if(!/(contact|about|team|people|leadership|management|company|locations?|sales|marketing|business|partner|events?|media|services)/i.test(u.pathname)) continue; out.push(u.href); } catch {}
  }
  return [...new Set(out)].slice(0,10);
}

async function officialEmailDiscovery(company='', domain='') {
  const base=`https://${rootHost(domain)}/`;
  const home=await fetchText(base,5000);
  const urls=[base,...linksFromHtml(home,base,domain),`${base}contact`,`${base}about`,`${base}team`,`${base}locations`];
  const search = await publicWebSearch(`site:${rootHost(domain)} "@${rootHost(domain)}" sales marketing events business operations`,{maxResults:10,timeRange:'year',topic:'general'}).catch(()=>({results:[]}));
  urls.push(...(search.results||[]).map(r=>r.url));
  const unique=[...new Set(urls.filter(Boolean))].slice(0,14);
  const pages=await Promise.all(unique.map(async url=>({url,text:url===base?home:await fetchText(url,4500)})));
  let contacts=pages.flatMap(p=>extractOfficialEmails(p.text,domain,p.url));
  for (const row of search.results || []) contacts.push(...extractOfficialEmails(`${row.title} ${row.content}`,domain,row.url));
  const by=new Map();
  for(const c of contacts){ const prev=by.get(c.email); if(!prev||c.score>prev.score) by.set(c.email,c); }
  return [...by.values()].sort((a,b)=>b.score-a.score).slice(0,8);
}

function providerContactEligible(c={}, domain='') {
  const local=clean(c.email,260).toLowerCase().split('@')[0]||'';
  return Boolean(c.email && sameDomain(c.email,domain) && !BLOCKED_LOCAL.has(local) && c.qualified===true && c.emailStatus==='valid' && Number(c.score||0)>=75);
}

async function contactFor(candidate={}) {
  if (candidate.contact && sameDomain(candidate.contact.email,candidate.domain)) return { contact:candidate.contact, contacts:[candidate.contact], provider:'official_website', providerStatus:{officialWebsite:true} };
  const result = await findContacts(candidate.domain,{maxContacts:10,minQualified:1,recommendedRole:'Event Marketing',roleTargets:ROLE_TARGETS}).catch(()=>null);
  const providerRows=(result?.emails||[]).filter(c=>providerContactEligible(c,candidate.domain));
  const official=await officialEmailDiscovery(candidate.company,candidate.domain).catch(()=>[]);
  const all=[...providerRows,...official];
  const by=new Map(); for(const c of all){const prev=by.get(c.email); if(!prev||Number(c.score)>Number(prev.score)) by.set(c.email,c);}
  const contacts=[...by.values()].sort((a,b)=>Number(b.emailStatus==='valid')-Number(a.emailStatus==='valid')||Number(b.score)-Number(a.score));
  return { contact:contacts[0]||null, contacts:contacts.slice(0,4), provider:[result?.provider,official.length?'official_website':''].filter(Boolean).join('+')||null, providerStatus:{...(result?.providerStatus||{}),officialWebsite:true}, attempts:result?.attempts||[] };
}

function leadFrom(c={}, contactResult={}) {
  const contact=contactResult.contact||null;
  const score=c.grade==='A'?96:90;
  return {
    id:`bcww:${rootHost(c.domain)}`, campaign:'bcww', campaign_label:'BCWW 단체복', company:c.company, domain:rootHost(c.domain), url:c.url||`https://${rootHost(c.domain)}/`,
    source_url:c.source_url, source_title:c.source_title||'', evidence_urls:[...new Set((c.evidence_urls||[c.source_url]).filter(Boolean))], evidence_grade:c.grade, evidence_reason:c.participation,
    signal:`${c.company} has ${c.grade === 'A' ? 'strong' : 'company-owned'} BCWW 2026 participation evidence`, score, sales_priority:score,
    verified_company:true, bcww_confirmed:true, bcww_participation_confirmed:true, bcww_interest:false, bcww_signal_tier:c.grade==='A'?'confirmed':'company_calendar',
    team_origin:'foreign', team_origin_country:c.country, outreach_language:'en', recommended_role:contact?.title||'Events / Marketing', role_targets:ROLE_TARGETS,
    contact, contacts:contactResult.contacts||[], contact_provider:contactResult.provider||null, contact_status:contact?'found':'failed', contact_failure_reason:contact?'':'이메일 탐색 미완료', contact_score_threshold:75,
    subject:`Quick question about ${c.company} at BCWW 2026`,
    message_en:`Hi,\n\nI saw that ${c.company} is coming to BCWW in Seoul this September. Have you already sorted team shirts or staff wear for the event?\n\nWe produce branded apparel locally in Seoul and can deliver directly to your hotel, office, or COEX. That means no overseas shipping, customs, or carrying boxes into Korea.\n\nIf it is still open, I can send a few local options with pricing and turnaround.`, message_ko:''
  };
}

async function historyDomains() {
  const secret=clean(process.env.GMAIL_SESSION_SECRET,5000); if(!secret) return {sent:[],deleted:[]};
  const [sent,deleted]=await Promise.all([listSentCompanyDomains(secret,500).catch(()=>[]),listDeletedCompanyDomains(secret,2500).catch(()=>[])]); return {sent,deleted};
}

async function buildCandidates(rows=[], excludes=new Set()) {
  const extracted=await aiCandidates(rows);
  const candidates=[];
  for (const seed of VERIFIED_SEEDS) candidates.push({ ...seed, url:`https://${seed.domain}/`, source_url:seed.source_url, source_title:seed.source_title, evidence_urls:[seed.source_url] });
  for(const item of extracted.slice(0,20)) {
    const index=Number(String(item.row_id).replace(/^r/,'')); const row=rows[index]; if(!row||!quoteSupported(item.evidence_quote,row)) continue;
    const sourceCompanyOwned=!sourceLike(row.url);
    const grade=gradeParticipationEvidence(`${row.title} ${row.content}`,{companyOwned:sourceCompanyOwned}); if(!grade) continue;
    const official=await resolveDomain(item.company,row); if(!official) continue;
    const domain=rootHost(official.domain); if(!domain||domain.endsWith('.kr')||excludes.has(normalizeCompanyKey(domain))) continue;
    const country=await resolveCountry(item.company,domain,item.country); if(!country||korean(country)) continue;
    candidates.push({ company:item.company,domain,country,url:official.url,source_url:row.url,source_title:row.title,evidence_urls:[row.url],grade,participation:item.participation||'verified event evidence',confidence:item.confidence });
  }
  const by=new Map(); for(const c of candidates){const d=rootHost(c.domain);if(!d||excludes.has(normalizeCompanyKey(d)))continue;const prev=by.get(d);if(!prev||c.grade==='A'&&prev.grade!=='A')by.set(d,c);} return [...by.values()].slice(0,14);
}

export async function POST(request) {
  let body={}; try{body=await request.json();}catch{return Response.json({error:'요청 형식이 잘못됐습니다.'},{status:400});}
  try {
    const hist=await historyDomains();
    const excludes=new Set([...(body.excludeDomains||[]),...hist.sent,...hist.deleted].map(normalizeCompanyKey).filter(Boolean));
    const rows=await discoverRows(body.cycle||0);
    const candidates=await buildCandidates(rows,excludes);
    const enriched=[];
    for(let i=0;i<candidates.length;i+=4){const chunk=candidates.slice(i,i+4);const group=await Promise.all(chunk.map(async c=>({candidate:c,contact:await contactFor(c)})));enriched.push(...group);if(enriched.length>=12)break;}
    let leads=enriched.map(x=>leadFrom(x.candidate,x.contact));
    const secret=clean(process.env.GMAIL_SESSION_SECRET,5000);
    if(secret&&leads.length){const sent=new Set(await matchSentCompanies(leads.map(l=>({id:l.id,key:l.domain})),secret).catch(()=>[]));leads=leads.filter(l=>!sent.has(l.id));}
    leads=leads.sort((a,b)=>Number(Boolean(b.contact))-Number(Boolean(a.contact))||Number(b.evidence_grade==='A')-Number(a.evidence_grade==='A')||b.score-a.score).slice(0,12);
    const ready=leads.filter(l=>l.contact).length;
    return Response.json({campaign:'bcww',campaign_label:'BCWW 단체복',leads,meta:{event:EVENT,returned:leads.length,raw_search_results:rows.length,evidence_verified_companies:candidates.length,contact_attempted:candidates.length,contact_ready:ready,contact_unresolved:Math.max(0,candidates.length-ready),sent_preexcluded:hist.sent.length,deleted_preexcluded:hist.deleted.length,hardcoded_verified_seeds:VERIFIED_SEEDS.length,hybrid_mode:'B: verified seeds + autonomous discovery',search_sources:[...new Set(rows.flatMap(r=>String(r.source||'').split('+')).filter(Boolean))],tavily_connected:Boolean(process.env.TAVILY_API_KEY),contact_gate:'SMTP/API valid OR same-domain email visibly published on an official company page; guessed emails forbidden',company_gate:'A explicit participation; B company-owned BCWW Sep 14-16 Seoul event listing; follower/recruitment pages rejected'}},{headers:{'Cache-Control':'no-store'}});
  } catch(error){console.error('bcww hybrid failed',clean(error?.message||error,500));return Response.json({error:'BCWW 하이브리드 탐색 중 오류가 발생했습니다.',detail:clean(error?.message||error,300)},{status:502,headers:{'Cache-Control':'no-store'}});}
}
