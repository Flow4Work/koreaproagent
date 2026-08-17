const EXA_URL = 'https://api.exa.ai/search';
const TAVILY_URL = 'https://api.tavily.com/search';
const TAVILY_EXTRACT_URL = 'https://api.tavily.com/extract';
const HUNTER_URL = 'https://api.hunter.io/v2/domain-search';
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

function diagnostic(provider,{ok=false,status=0,error='',stage='',detail=''}={}) {
  return {provider,ok:Boolean(ok),status:Number(status)||0,error:clean(error,120),stage:clean(stage,80),detail:clean(detail,180)};
}

async function fetchJsonResult(url, options={}, timeoutMs=9000, provider='provider', stage='request') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url,{...options,signal:controller.signal,cache:'no-store'});
    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      const apiError = clean(data?.errors?.[0]?.id || data?.errors?.[0]?.details || data?.error || data?.message || `http_${response.status}`,120);
      return {ok:false,status:response.status,data:null,error:apiError,diagnostic:diagnostic(provider,{status:response.status,error:apiError,stage})};
    }
    return {ok:true,status:response.status,data,error:'',diagnostic:diagnostic(provider,{ok:true,status:response.status,stage})};
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timeout' : 'network_error';
    return {ok:false,status:0,data:null,error:reason,diagnostic:diagnostic(provider,{error:reason,stage,detail:error?.message || ''})};
  } finally { clearTimeout(timer); }
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

async function hunterCompanySearch(company) {
  const key = clean(process.env.HUNTER_API_KEY,5000);
  if (!key) return {domain:'',contacts:[],diagnostic:diagnostic('hunter',{error:'not_configured',stage:'company_search'})};
  if (clean(company,180).length < 3) return {domain:'',contacts:[],diagnostic:diagnostic('hunter',{error:'invalid_company',stage:'company_search'})};
  const params = new URLSearchParams({company:clean(company,180),limit:'10',api_key:key});
  const result = await fetchJsonResult(`${HUNTER_URL}?${params}`,{},8000,'hunter','company_search');
  if (!result.ok) return {domain:'',contacts:[],diagnostic:result.diagnostic};
  const data = result.data?.data || {};
  const domain = rootHost(data?.domain || '');
  const organization = clean(data?.organization || '',240);
  if (!usableDomain(domain,company)) return {domain:'',contacts:[],diagnostic:diagnostic('hunter',{ok:true,status:result.status,error:'no_domain_match',stage:'company_search'})};
  if (organization && !companyMatch(company,organization) && !companyMatch(organization,company)) {
    return {domain:'',contacts:[],diagnostic:diagnostic('hunter',{ok:true,status:result.status,error:'company_mismatch',stage:'company_search',detail:organization})};
  }
  const contacts = (Array.isArray(data?.emails) ? data.emails : []).map(row=>shapeHunter(row,domain)).filter(Boolean);
  return {domain,contacts,diagnostic:diagnostic('hunter',{ok:true,status:result.status,stage:'company_search',detail:`emails:${contacts.length}`})};
}

async function hunterContacts(domain) {
  const key = clean(process.env.HUNTER_API_KEY,5000);
  if (!key || !domain) return {contacts:[],diagnostic:diagnostic('hunter',{error:!key?'not_configured':'missing_domain',stage:'domain_search'})};
  const params = new URLSearchParams({domain,limit:'10',api_key:key});
  const result = await fetchJsonResult(`${HUNTER_URL}?${params}`,{},8000,'hunter','domain_search');
  if (!result.ok) return {contacts:[],diagnostic:result.diagnostic};
  const contacts = (Array.isArray(result.data?.data?.emails) ? result.data.data.emails : []).map(row=>shapeHunter(row,domain)).filter(Boolean);
  return {contacts,diagnostic:diagnostic('hunter',{ok:true,status:result.status,stage:'domain_search',detail:`emails:${contacts.length}`})};
}

async function resolveWithExa(company,country,exaKey) {
  if (!exaKey) return {domain:'',diagnostic:diagnostic('exa',{error:'not_configured',stage:'domain_resolution'})};
  const result = await fetchJsonResult(EXA_URL,{
    method:'POST',
    headers:{'x-api-key':exaKey,'Content-Type':'application/json'},
    body:JSON.stringify({query:`${clean(company,160)} official company website ${clean(country,80)}`,type:'fast',numResults:8,excludeDomains:[...BLOCKED]})
  },8000,'exa','domain_resolution');
  if (!result.ok) return {domain:'',diagnostic:result.diagnostic};
  for (const row of Array.isArray(result.data?.results) ? result.data.results : []) {
    const domain = rootHost(row?.url);
    if (!usableDomain(domain,company)) continue;
    if (!companyMatch(company,`${row?.title || ''} ${row?.url || ''} ${row?.text || ''}`)) continue;
    return {domain,diagnostic:diagnostic('exa',{ok:true,status:result.status,stage:'domain_resolution',detail:'matched'})};
  }
  return {domain:'',diagnostic:diagnostic('exa',{ok:true,status:result.status,error:'no_match',stage:'domain_resolution'})};
}

async function resolveWithTavily(company,country) {
  const key = clean(process.env.TAVILY_API_KEY,5000);
  if (!key) return {domain:'',diagnostic:diagnostic('tavily',{error:'not_configured',stage:'domain_resolution'})};
  const result = await fetchJsonResult(TAVILY_URL,{
    method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({query:`"${clean(company,160)}" official website ${clean(country,80)}`,search_depth:'basic',max_results:8,topic:'general',include_answer:false,include_raw_content:false,exclude_domains:[...BLOCKED]})
  },8500,'tavily','domain_resolution');
  if (!result.ok) return {domain:'',diagnostic:result.diagnostic};
  for (const row of Array.isArray(result.data?.results) ? result.data.results : []) {
    const domain = rootHost(row?.url);
    if (!usableDomain(domain,company)) continue;
    if (!companyMatch(company,`${row?.title || ''} ${row?.url || ''} ${row?.content || ''}`)) continue;
    return {domain,diagnostic:diagnostic('tavily',{ok:true,status:result.status,stage:'domain_resolution',detail:'matched'})};
  }
  return {domain:'',diagnostic:diagnostic('tavily',{ok:true,status:result.status,error:'no_match',stage:'domain_resolution'})};
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
  if(!key||!domain) return {contacts:[],diagnostics:[diagnostic('tavily',{error:!key?'not_configured':'missing_domain',stage:'email_search'})]};
  const search = await fetchJsonResult(TAVILY_URL,{
    method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      query:`"${clean(company,160)}" email sales export marketing contact ${clean(country,80)}`,
      search_depth:'basic',max_results:6,topic:'general',include_answer:false,include_raw_content:false,include_domains:[domain]
    })
  },8500,'tavily','email_search');
  if(!search.ok) return {contacts:[],diagnostics:[search.diagnostic]};
  const urls=[...new Set((Array.isArray(search.data?.results)?search.data.results:[])
    .map(row=>clean(row?.url,500)).filter(url=>/^https?:\/\//i.test(url)&&rootHost(url)===domain))]
    .sort((a,b)=>Number(CONTACT_PATH.test(new URL(b).pathname))-Number(CONTACT_PATH.test(new URL(a).pathname)))
    .slice(0,5);
  const searchDiagnostic=diagnostic('tavily',{ok:true,status:search.status,error:urls.length?'':'no_match',stage:'email_search',detail:`urls:${urls.length}`});
  if(!urls.length) return {contacts:[],diagnostics:[searchDiagnostic]};

  const extract = await fetchJsonResult(TAVILY_EXTRACT_URL,{
    method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({urls,query:`email sales export marketing contact ${clean(company,160)}`,chunks_per_source:4,extract_depth:'basic'})
  },10000,'tavily','email_extract');
  if(!extract.ok) return {contacts:[],diagnostics:[searchDiagnostic,extract.diagnostic]};
  const contacts=(Array.isArray(extract.data?.results)?extract.data.results:[])
    .flatMap(row=>officialEmails(row?.raw_content||'',domain,row?.url||`https://${domain}/`));
  return {contacts,diagnostics:[searchDiagnostic,diagnostic('tavily',{ok:true,status:extract.status,error:contacts.length?'':'no_email',stage:'email_extract',detail:`emails:${contacts.length}`})]};
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
  const rows=(Array.isArray(items)?items:[]).slice(0,6);
  const results=await mapLimit(rows,6,async item=>{
    const id=clean(item?.id,180),company=clean(item?.company,180),country=clean(item?.country,80);
    if(!id||!company) return null;
    const diagnostics=[];
    let domain=rootHost(item?.domain||item?.url||''),resolvedBy=domain?'existing':'',hunterSeed=[];
    if(domain&&!usableDomain(domain,company)){domain='';resolvedBy='';}

    if(!domain){
      const hunterCompany=await hunterCompanySearch(company);
      diagnostics.push(hunterCompany.diagnostic);
      if(hunterCompany.domain){domain=hunterCompany.domain;hunterSeed=hunterCompany.contacts;resolvedBy='hunter_company_search';}
    }
    if(!domain){
      const exa=await resolveWithExa(company,country,clean(exaKey,5000));
      diagnostics.push(exa.diagnostic);
      if(exa.domain){domain=exa.domain;resolvedBy='exa';}
    }
    if(!domain){
      const tavily=await resolveWithTavily(company,country);
      diagnostics.push(tavily.diagnostic);
      if(tavily.domain){domain=tavily.domain;resolvedBy='tavily';}
    }
    if(!domain)return{id,company,domain:'',url:'',contacts:[],resolvedBy:'',status:'website_pending',diagnostics};

    let hunter={contacts:hunterSeed,diagnostic:null};
    if(resolvedBy!=='hunter_company_search') hunter=await hunterContacts(domain);
    if(hunter.diagnostic) diagnostics.push(hunter.diagnostic);
    const site=await siteContacts(domain);
    let contacts=chooseContacts([...hunter.contacts,...site]);
    if(!contacts.length){
      const searched=await tavilySiteEmailSearch(company,domain,country);
      diagnostics.push(...searched.diagnostics);
      contacts=chooseContacts([...hunter.contacts,...site,...searched.contacts]);
    }
    return{id,company,domain,url:`https://${domain}/`,contacts,resolvedBy,status:contacts.length?'found':'email_missing',diagnostics};
  });
  return results.filter(Boolean);
}
