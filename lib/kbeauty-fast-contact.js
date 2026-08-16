const EXA_URL = 'https://api.exa.ai/search';
const TAVILY_URL = 'https://api.tavily.com/search';
const HUNTER_URL = 'https://api.hunter.io/v2/domain-search';
const HUNTER_DOMAIN_FINDER_URL = 'https://api.hunter.io/v2/domain-finder';
const BLOCKED = new Set(['linkedin.com','facebook.com','instagram.com','youtube.com','x.com','twitter.com','wikipedia.org','10times.com','eventbrite.com','medium.com','made-in-china.com','globalsources.com','tradeindia.com','exporthub.com','tradekey.com','1688.com']);
const ROLE = /(?:^|[._-])(sales|marketing|events?|partnerships?|partners?|business|bizdev|bd|community|operations|ops|export|international|wholesale|distributor|trade)(?:$|[._-])/i;
const CATCH_ALL = /^(info|hello|contact|office|team|admin|general|inquiry|enquiry|business)$/i;
const JUNK = /^(support|help|security|privacy|legal|billing|careers|jobs|hr|noreply|no-reply|abuse|postmaster|webmaster|mailer-daemon)$/i;
const CONTACT_PATH = /(contact|about|team|staff|people|export|international|sales|company|profile|corporate|inquir|dealer|distributor|partner|location|office|customer|led)/i;

const clean = (value='', max=500) => String(value || '').replace(/\s+/g,' ').trim().slice(0,max);
const rootHost = value => {
  let raw = clean(value,500).toLowerCase();
  if (!raw) return '';
  try { raw = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname; }
  catch { raw = raw.split('/')[0].split(':')[0]; }
  raw = raw.replace(/^www\./,'').replace(/\.+$/,'');
  const parts = raw.split('.').filter(Boolean);
  if (parts.length <= 2) return raw;
  const second = new Set(['ac','co','com','edu','go','gov','ne','net','or','org']);
  const depth = parts.at(-1)?.length === 2 && second.has(parts.at(-2)) ? 3 : 2;
  return parts.slice(-depth).join('.');
};
const companyTokens = value => clean(value,180).toLowerCase()
  .replace(/\b(inc|llc|ltd|limited|corp|corporation|company|co|gmbh|plc|group|international|technology|technologies|industrial|industries|products|product)\b/giu,' ')
  .replace(/[^\p{L}\p{N}]+/gu,' ').split(/\s+/u).filter(token => token.length >= 2);
const companyMatch = (company,text) => {
  const tokens = companyTokens(company); if (!tokens.length) return false;
  const hay = clean(text,5000).toLowerCase();
  const hits = tokens.filter(token => hay.includes(token)).length;
  return hits >= Math.min(2,tokens.length) || (tokens.length >= 3 && hits / tokens.length >= 0.5) || (tokens.length === 1 && hay.includes(tokens[0]));
};
const sameDomain = (email,domain) => {
  const host = clean(email,240).toLowerCase().split('@')[1] || '';
  return Boolean(host && domain && (host === domain || host.endsWith(`.${domain}`)));
};
const local = email => clean(email,240).toLowerCase().split('@')[0] || '';
const usableDomain = (domain,company='') => {
  if (!domain || domain.endsWith('.kr')) return false;
  if (!BLOCKED.has(domain)) return true;
  return domain === 'alibaba.com' && /alibaba/i.test(company);
};

async function fetchJson(url, options={}, timeoutMs=9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url,{...options,signal:controller.signal,cache:'no-store'});
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
  finally { clearTimeout(timer); }
}

async function resolveWithHunterFinder(company) {
  const key = clean(process.env.HUNTER_API_KEY,5000);
  if (!key || clean(company,180).length < 3) return '';
  const params = new URLSearchParams({company:clean(company,180),limit:'5',perfect_match:'false',api_key:key});
  const data = await fetchJson(`${HUNTER_DOMAIN_FINDER_URL}?${params}`,{},7000);
  const rows = Array.isArray(data?.data) ? data.data : [];
  for (const row of rows) {
    const domain = rootHost(row?.domain || '');
    const matchedName = clean(row?.company_name || '',240);
    if (!usableDomain(domain,company)) continue;
    if (matchedName && !companyMatch(company,matchedName) && !companyMatch(matchedName,company)) continue;
    return domain;
  }
  return '';
}

async function resolveWithExa(company,country,exaKey) {
  if (!exaKey) return '';
  const data = await fetchJson(EXA_URL,{
    method:'POST',
    headers:{'x-api-key':exaKey,'Content-Type':'application/json'},
    body:JSON.stringify({query:`${clean(company,160)} official company website ${clean(country,80)}`,type:'fast',numResults:8,excludeDomains:[...BLOCKED]})
  },8000);
  for (const row of Array.isArray(data?.results) ? data.results : []) {
    const domain = rootHost(row?.url);
    if (!usableDomain(domain,company)) continue;
    if (!companyMatch(company,`${row?.title || ''} ${row?.url || ''} ${row?.text || ''}`)) continue;
    return domain;
  }
  return '';
}

async function resolveWithTavily(company,country) {
  const key = clean(process.env.TAVILY_API_KEY,5000);
  if (!key) return '';
  const data = await fetchJson(TAVILY_URL,{
    method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({query:`"${clean(company,160)}" official website ${clean(country,80)}`,search_depth:'basic',max_results:8,topic:'general',include_answer:false,include_raw_content:false,exclude_domains:[...BLOCKED]})
  },8500);
  for (const row of Array.isArray(data?.results) ? data.results : []) {
    const domain = rootHost(row?.url);
    if (!usableDomain(domain,company)) continue;
    if (!companyMatch(company,`${row?.title || ''} ${row?.url || ''} ${row?.content || ''}`)) continue;
    return domain;
  }
  return '';
}

function contactRank(email,{personal=false,status='unknown'}={}) {
  const lp=local(email);
  const validRank=status==='valid'?6:status==='accept_all'?4:2;
  const intentRank=ROLE.test(lp)?7:personal?6:CATCH_ALL.test(lp)?2:4;
  return validRank+intentRank;
}

function shapeHunter(row,domain) {
  const email = clean(row?.value,240).toLowerCase();
  const localPart = local(email);
  if (!email || !sameDomain(email,domain) || JUNK.test(localPart)) return null;
  const statusRaw = clean(row?.verification?.status || '',80).toLowerCase();
  const emailStatus = /^(valid|verified|deliverable|safe)$/.test(statusRaw) ? 'valid' : statusRaw.includes('accept') ? 'accept_all' : statusRaw === 'invalid' ? 'invalid' : 'unknown';
  if (emailStatus === 'invalid') return null;
  const personal = row?.type === 'personal';
  const rank = contactRank(email,{personal,status:emailStatus});
  return {
    name:clean(`${row?.first_name || ''} ${row?.last_name || ''}`,180),title:clean(row?.position || '',200),email,emailStatus,
    seniority:clean(row?.seniority || '',100),department:clean(row?.department || '',100),type:personal?'personal':'generic',linkedinUrl:clean(row?.linkedin || '',500),
    sources:['hunter.io',...(Array.isArray(row?.sources) ? row.sources.map(source => source?.uri).filter(Boolean) : [])],providers:['hunter'],provider:'hunter',qualified:true,score:80+rank,_rank:rank
  };
}

async function hunterContacts(domain) {
  const key = clean(process.env.HUNTER_API_KEY,5000);
  if (!key || !domain) return [];
  // Hunter Free plans reject limit + offset > 10. Keep this at 10 so the call works on free and paid keys.
  const params = new URLSearchParams({domain,limit:'10',api_key:key});
  const data = await fetchJson(`${HUNTER_URL}?${params}`,{},8000);
  return (Array.isArray(data?.data?.emails) ? data.data.emails : []).map(row=>shapeHunter(row,domain)).filter(Boolean);
}

async function fetchText(url, timeoutMs=6000, maxBytes=220000) {
  const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response = await fetch(url,{signal:controller.signal,cache:'no-store',redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 (compatible; KoreaProAgent/1.0)'}});
    if (!response.ok) return '';
    const type = response.headers.get('content-type') || '';
    if (!/text|html|xml|json/i.test(type)) return '';
    return (await response.text()).slice(0,maxBytes);
  } catch { return ''; }
  finally { clearTimeout(timer); }
}

function officialEmails(text,domain,source) {
  const normalized = String(text)
    .replace(/\s*(?:\[|\(|\{)?\s*(?:at|골뱅이)\s*(?:\]|\)|\})?\s*/gi,'@')
    .replace(/\s*(?:\[|\(|\{)?\s*(?:dot|점)\s*(?:\]|\)|\})?\s*/gi,'.');
  const matches = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(matches.map(v=>v.toLowerCase()))]
    .filter(email=>sameDomain(email,domain)&&!JUNK.test(local(email)))
    .map(email=>{
      const lp=local(email), role=ROLE.test(lp), generic=CATCH_ALL.test(lp), rank=role?10:generic?4:7;
      return {name:'',title:'',email,emailStatus:'unknown',type:role||generic?'generic':'personal',sources:[source],providers:['official_site'],provider:'official_site',qualified:true,score:78+rank,_rank:rank};
    });
}

function sameDomainLinks(text,baseUrl,domain) {
  const out=[];
  const raw=String(text||'');
  const hrefRe=/href\s*=\s*["']([^"'#]+)["']/gi;
  const locRe=/<loc>\s*([^<]+)\s*<\/loc>/gi;
  const push = value => {
    try {
      const decoded=String(value||'').replace(/&amp;/g,'&').trim();
      if(!decoded || /^(?:mailto:|tel:|javascript:|data:)/i.test(decoded)) return;
      const url=new URL(decoded,baseUrl);
      if(!/^https?:$/.test(url.protocol) || rootHost(url.hostname)!==domain) return;
      url.hash=''; out.push(url.toString());
    } catch {}
  };
  let match; while((match=hrefRe.exec(raw))) push(match[1]);
  while((match=locRe.exec(raw))) push(match[1]);
  return [...new Set(out)];
}

async function siteContacts(domain) {
  const base=`https://${domain}/`;
  const fixed=[base,`${base}contact`,`${base}contact-us`,`${base}about`,`${base}about-us`,`${base}team`,`${base}company`,`${base}export`,`${base}international`,`${base}sales`];
  const [home,sitemap]=await Promise.all([fetchText(base,6500,260000),fetchText(`${base}sitemap.xml`,5000,220000)]);
  const discovered=[...sameDomainLinks(home,base,domain),...sameDomainLinks(sitemap,`${base}sitemap.xml`,domain)]
    .filter(url=>CONTACT_PATH.test(new URL(url).pathname))
    .slice(0,14);
  const urls=[...new Set([...fixed,...discovered])].slice(0,10);
  const pages=await mapLimit(urls,4,async url=>({url,text:url===base?home:await fetchText(url)}));
  return pages.flatMap(page=>officialEmails(page.text,domain,page.url));
}

async function tavilySiteEmailSearch(company,domain,country) {
  const key=clean(process.env.TAVILY_API_KEY,5000);
  if(!key||!domain) return [];
  const data=await fetchJson(TAVILY_URL,{
    method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      query:`"${clean(company,160)}" email sales export marketing contact ${clean(country,80)}`,
      search_depth:'basic',max_results:6,topic:'general',include_answer:false,include_raw_content:false,include_domains:[domain]
    })
  },8500);
  return (Array.isArray(data?.results)?data.results:[]).flatMap(row=>officialEmails(`${row?.title||''} ${row?.content||''}`,domain,row?.url||`https://${domain}/`));
}

function chooseContacts(rows=[]) {
  const map=new Map();
  for(const row of rows){
    const email=clean(row?.email,240).toLowerCase(); if(!email) continue;
    const old=map.get(email);
    if(!old||Number(row._rank||0)>Number(old._rank||0)) map.set(email,row);
    else { old.sources=[...new Set([...(old.sources||[]),...(row.sources||[])])]; old.providers=[...new Set([...(old.providers||[]),...(row.providers||[])])]; old.provider=old.providers.join('+'); }
  }
  return [...map.values()].sort((a,b)=>Number(b._rank||0)-Number(a._rank||0)).slice(0,4).map(({_rank,...row})=>row);
}

async function mapLimit(items,limit,worker) {
  const out=new Array(items.length); let cursor=0;
  const runners=Array.from({length:Math.min(limit,items.length)},async()=>{while(cursor<items.length){const i=cursor++;try{out[i]=await worker(items[i],i);}catch{out[i]=null;}}});
  await Promise.all(runners); return out;
}

export async function findKBeautyContactsFast(items=[],exaKey='') {
  const rows=(Array.isArray(items)?items:[]).slice(0,30);
  const results=await mapLimit(rows,10,async item=>{
    const id=clean(item?.id,180),company=clean(item?.company,180),country=clean(item?.country,80);
    if(!id||!company) return null;
    let domain=rootHost(item?.domain||item?.url||''),resolvedBy=domain?'existing':'';
    if(domain&&!usableDomain(domain,company)){domain='';resolvedBy='';}
    if(!domain){domain=await resolveWithHunterFinder(company);if(domain)resolvedBy='hunter_domain_finder';}
    if(!domain){domain=await resolveWithExa(company,country,clean(exaKey,5000));if(domain)resolvedBy='exa';}
    if(!domain){domain=await resolveWithTavily(company,country);if(domain)resolvedBy='tavily';}
    if(!domain)return{id,company,domain:'',url:'',contacts:[],resolvedBy:'',status:'website_pending'};

    const [hunter,site]=await Promise.all([hunterContacts(domain),siteContacts(domain)]);
    let contacts=chooseContacts([...hunter,...site]);
    if(!contacts.length){
      const searched=await tavilySiteEmailSearch(company,domain,country);
      contacts=chooseContacts([...hunter,...site,...searched]);
    }
    return{id,company,domain,url:`https://${domain}/`,contacts,resolvedBy,status:contacts.length?'found':'email_missing'};
  });
  return results.filter(Boolean);
}
