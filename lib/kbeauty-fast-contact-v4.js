const EXA_URL = 'https://api.exa.ai/search';
const TAVILY_URL = 'https://api.tavily.com/search';
const TAVILY_EXTRACT_URL = 'https://api.tavily.com/extract';
const HUNTER_URL = 'https://api.hunter.io/v2/domain-search';

const BLOCKED = new Set(['linkedin.com','facebook.com','instagram.com','youtube.com','x.com','twitter.com','wikipedia.org','10times.com','eventbrite.com','medium.com','made-in-china.com','globalsources.com','tradeindia.com','exporthub.com','tradekey.com','1688.com']);
const FREE_MAIL = new Set(['gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','yahoo.com','yahoo.co.jp','icloud.com','me.com','qq.com','163.com','126.com','foxmail.com']);
const ROLE = /(sales?|marketing|events?|partnerships?|partners?|business|bizdev|bd|community|operations|ops|export|international|overseas|wholesale|distributor|trade|commercial|orders?)/i;
const CATCH_ALL = /^(info|hello|contact|office|team|admin|general|inquiry|enquiry|business|support|help|service|cs)$/i;
const JUNK = /^(security|privacy|legal|billing|careers|jobs|hr|noreply|no-reply|abuse|postmaster|webmaster|mailer-daemon)$/i;
const CONTACT_PATH = /(contact|about|team|staff|people|export|international|overseas|sales|company|profile|corporate|inquir|dealer|distributor|partner|location|office|customer|business)/i;

const clean = (value='', max=500) => String(value || '').replace(/\s+/g,' ').trim().slice(0,max);
const rootHost = value => {
  let raw = clean(value,500).toLowerCase();
  if (!raw) return '';
  if (raw.includes('@') && !raw.includes('://')) raw = raw.split('@').pop() || '';
  try { raw = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname; }
  catch { raw = raw.split('/')[0].split(':')[0]; }
  raw = raw.replace(/^www\./,'').replace(/\.+$/,'');
  const parts = raw.split('.').filter(Boolean);
  if (parts.length <= 2) return raw;
  const second = new Set(['ac','co','com','edu','go','gov','ne','net','or','org']);
  const depth = parts.at(-1)?.length === 2 && second.has(parts.at(-2)) ? 3 : 2;
  return parts.slice(-depth).join('.');
};
const companyKey = value => clean(value,180).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const companyTokens = value => clean(value,180).toLowerCase()
  .replace(/\b(inc|llc|ltd|limited|corp|corporation|company|co|gmbh|plc|group|international|technology|technologies|industrial|industries|products|product|sprayer|packaging)\b/giu,' ')
  .replace(/[^\p{L}\p{N}]+/gu,' ').split(/\s+/u).filter(token => token.length >= 3);
const companyMatch = (company,text) => {
  const tokens = companyTokens(company); if (!tokens.length) return false;
  const hay = clean(text,6000).toLowerCase();
  const hits = tokens.filter(token => hay.includes(token)).length;
  return hits >= Math.min(2,tokens.length) || (tokens.length >= 3 && hits / tokens.length >= 0.5) || (tokens.length === 1 && hay.includes(tokens[0]));
};
const local = email => clean(email,240).toLowerCase().split('@')[0] || '';
const emailHost = email => rootHost(clean(email,240).toLowerCase().split('@')[1] || '');
const sameDomain = (email,domain) => Boolean(emailHost(email) && domain && emailHost(email) === rootHost(domain));
const usableDomain = (domain,company='') => {
  const host=rootHost(domain);
  if (!host || host.endsWith('.kr') || FREE_MAIL.has(host)) return false;
  if (!BLOCKED.has(host)) return true;
  return host === 'alibaba.com' && /alibaba/i.test(company);
};

const KNOWN_DOMAIN_ROWS = [
  ['AJMAL PERFUMES','ajmal.com'],
  ['Alibaba.com','alibaba.com'],
  ['Laboratoire Gilbert','groupe-gilbert.fr'],
  ['MORIRIN CO., LTD.','moririn.co.jp'],
  ['PTN Healthcare GmbH','ptn-healthcare.de'],
  ['BULGARIAN ROSE PLC','bulgarianrose.bg'],
  ['IMS PACKAGING','imspackaging.com'],
  ['YUYAO WELLPACK SPRAYER CO ., LTD','cnwellpack.com'],
  ['ZHUHAI BAOLI FOAM SPRAY PUMP CO., LTD.','zhuhaibaoli.com']
];
const KNOWN_DOMAINS = new Map(KNOWN_DOMAIN_ROWS.map(([company,domain])=>[companyKey(company),domain]));

function diagnostic(provider,{ok=false,status=0,error='',stage='',detail=''}={}) {
  return {provider,ok:Boolean(ok),status:Number(status)||0,error:clean(error,120),stage:clean(stage,80),detail:clean(detail,220)};
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

async function fetchText(url, timeoutMs=6500, maxBytes=320000) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response = await fetch(url,{signal:controller.signal,cache:'no-store',redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 (compatible; KoreaProAgent/1.0)'}});
    if (!response.ok) return null;
    const type = response.headers.get('content-type') || '';
    if (!/text|html|xml|json/i.test(type)) return null;
    return {text:(await response.text()).slice(0,maxBytes),url:response.url || url,status:response.status};
  } catch { return null; }
  finally { clearTimeout(timer); }
}

function contactRank(email,{personal=false,status='unknown',official=false,outreachEligible=true}={}) {
  const lp=local(email);
  const validRank=status==='valid'?8:status==='accept_all'?5:2;
  const intentRank=ROLE.test(lp)?10:personal?8:CATCH_ALL.test(lp)?0:5;
  return validRank+intentRank+(official?4:0)+(outreachEligible?8:-8);
}

function outreachEligibleEmail(email) {
  const lp=local(email);
  return Boolean(email && !CATCH_ALL.test(lp) && !JUNK.test(lp));
}

function shapeHunter(row,domain) {
  const email = clean(row?.value,240).toLowerCase();
  if (!email || !sameDomain(email,domain) || JUNK.test(local(email))) return null;
  const statusRaw = clean(row?.verification?.status || '',80).toLowerCase();
  const emailStatus = /^(valid|verified|deliverable|safe)$/.test(statusRaw) ? 'valid' : statusRaw.includes('accept') ? 'accept_all' : statusRaw === 'invalid' ? 'invalid' : 'unknown';
  if (emailStatus === 'invalid') return null;
  const personal = row?.type === 'personal';
  const outreachEligible=outreachEligibleEmail(email);
  const rank = contactRank(email,{personal,status:emailStatus,outreachEligible});
  return {
    name:clean(`${row?.first_name || ''} ${row?.last_name || ''}`,180),title:clean(row?.position || '',200),email,emailStatus,
    seniority:clean(row?.seniority || '',100),department:clean(row?.department || '',100),type:personal?'personal':'generic',linkedinUrl:clean(row?.linkedin || '',500),
    sources:['hunter.io',...(Array.isArray(row?.sources) ? row.sources.map(source => source?.uri).filter(Boolean) : [])],providers:['hunter'],provider:'hunter',qualified:outreachEligible,
    outreachEligible,officialPublished:false,sourceDomain:rootHost(domain),score:80+rank,_rank:rank
  };
}

function normalizeEmailText(text='') {
  return String(text || '')
    .replace(/&#0*64;|&#x0*40;|&commat;/gi,'@')
    .replace(/&#0*46;|&#x0*2e;/gi,'.')
    .replace(/&period;/gi,'.')
    .replace(/(?:\[|\(|\{)\s*at\s*(?:\]|\)|\})/gi,'@')
    .replace(/(?:\[|\(|\{)\s*dot\s*(?:\]|\)|\})/gi,'.')
    .replace(/\s+at\s+/gi,'@')
    .replace(/\s+dot\s+/gi,'.');
}

function trustedPublishedEmail(email,officialDomain,company='') {
  const mailDomain=emailHost(email);
  if (!mailDomain || FREE_MAIL.has(mailDomain) || BLOCKED.has(mailDomain)) return false;
  if (mailDomain === rootHost(officialDomain)) return true;
  const compactDomain=mailDomain.replace(/[^a-z0-9\p{L}\p{N}]/giu,'');
  return companyTokens(company).filter(token=>token.length>=4).some(token=>compactDomain.includes(token.replace(/[^a-z0-9\p{L}\p{N}]/giu,'')));
}

function officialEmails(text,domain,source,company='') {
  const normalized=normalizeEmailText(text);
  const matches=normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(matches.map(v=>v.toLowerCase()))]
    .filter(email=>trustedPublishedEmail(email,domain,company) && !JUNK.test(local(email)))
    .map(email=>{
      const lp=local(email), outreachEligible=outreachEligibleEmail(email), role=ROLE.test(lp), generic=CATCH_ALL.test(lp);
      const rank=contactRank(email,{personal:!generic&&!role,status:'unknown',official:true,outreachEligible});
      return {
        name:'',title:'',email,emailStatus:'unknown',type:role||generic?'generic':'personal',sources:[source],providers:['official_site'],provider:'official_site',qualified:outreachEligible,
        outreachEligible,officialPublished:true,sourceDomain:rootHost(domain),score:82+rank,_rank:rank
      };
    });
}

function sameDomainLinks(text,baseUrl,domain) {
  const out=[];
  const raw=String(text||'');
  const hrefRe=/href\s*=\s*["']([^"'#]+)["']/gi;
  const locRe=/<loc>\s*([^<]+)\s*<\/loc>/gi;
  const push=value=>{
    try {
      const decoded=String(value||'').replace(/&amp;/g,'&').trim();
      if(!decoded || /^(?:mailto:|tel:|javascript:|data:)/i.test(decoded)) return;
      const url=new URL(decoded,baseUrl);
      if(!/^https?:$/.test(url.protocol) || rootHost(url.hostname)!==rootHost(domain)) return;
      url.hash=''; out.push(url.toString());
    } catch {}
  };
  let match; while((match=hrefRe.exec(raw))) push(match[1]);
  while((match=locRe.exec(raw))) push(match[1]);
  return [...new Set(out)];
}

async function firstReadableHome(domain) {
  const urls=[`https://${domain}/`,`https://www.${domain}/`,`http://${domain}/`,`http://www.${domain}/`];
  for(const url of urls){const page=await fetchText(url,6500,320000);if(page?.text)return page;}
  return null;
}

async function siteContacts(domain,company) {
  const home=await firstReadableHome(domain);
  if(!home) return {contacts:[],diagnostics:[diagnostic('official_site',{error:'homepage_unreachable',stage:'site_crawl',detail:domain})]};
  let base;
  try { base=new URL(home.url); } catch { base=new URL(`https://${domain}/`); }
  const sitemapUrl=new URL('/sitemap.xml',base).toString();
  const sitemap=await fetchText(sitemapUrl,5000,260000);
  const discovered=[...sameDomainLinks(home.text,home.url,domain),...sameDomainLinks(sitemap?.text||'',sitemapUrl,domain)]
    .filter(url=>{try{return CONTACT_PATH.test(new URL(url).pathname);}catch{return false;}})
    .slice(0,18);
  const paths=['contact','contact/','contact.html','contact-us','contact-us/','contact_us.html','contacts','en/contact','en/contact/','en/contact.html','about','about-us','about_us.html','company','export','international','overseas','sales'];
  const fixed=paths.map(path=>{try{return new URL(path,home.url).toString();}catch{return '';}}).filter(Boolean);
  const urls=[...new Set([home.url,...discovered,...fixed])].slice(0,18);
  const pages=await mapLimit(urls,5,async url=>url===home.url?home:await fetchText(url,6000,280000));
  const contacts=pages.filter(Boolean).flatMap(page=>officialEmails(page.text,domain,page.url,company));
  return {contacts,diagnostics:[diagnostic('official_site',{ok:true,status:home.status,stage:'site_crawl',detail:`pages:${pages.filter(Boolean).length};emails:${contacts.length}`})]};
}

async function hunterCompanySearch(company) {
  const key=clean(process.env.HUNTER_API_KEY,5000);
  if(!key)return{domain:'',contacts:[],diagnostic:diagnostic('hunter',{error:'not_configured',stage:'company_search'})};
  const params=new URLSearchParams({company:clean(company,180),limit:'10',api_key:key});
  const result=await fetchJsonResult(`${HUNTER_URL}?${params}`,{},8500,'hunter','company_search');
  if(!result.ok)return{domain:'',contacts:[],diagnostic:result.diagnostic};
  const data=result.data?.data||{},domain=rootHost(data?.domain||''),organization=clean(data?.organization||'',240);
  if(!usableDomain(domain,company))return{domain:'',contacts:[],diagnostic:diagnostic('hunter',{ok:true,status:result.status,error:'no_domain_match',stage:'company_search'})};
  if(organization&&!companyMatch(company,organization)&&!companyMatch(organization,company))return{domain:'',contacts:[],diagnostic:diagnostic('hunter',{ok:true,status:result.status,error:'company_mismatch',stage:'company_search',detail:organization})};
  const contacts=(Array.isArray(data?.emails)?data.emails:[]).map(row=>shapeHunter(row,domain)).filter(Boolean);
  return{domain,contacts,diagnostic:diagnostic('hunter',{ok:true,status:result.status,stage:'company_search',detail:`emails:${contacts.length}`})};
}

async function hunterContacts(domain) {
  const key=clean(process.env.HUNTER_API_KEY,5000);
  if(!key||!domain)return{contacts:[],diagnostic:diagnostic('hunter',{error:!key?'not_configured':'missing_domain',stage:'domain_search'})};
  const params=new URLSearchParams({domain,limit:'10',api_key:key});
  const result=await fetchJsonResult(`${HUNTER_URL}?${params}`,{},8500,'hunter','domain_search');
  if(!result.ok)return{contacts:[],diagnostic:result.diagnostic};
  const contacts=(Array.isArray(result.data?.data?.emails)?result.data.data.emails:[]).map(row=>shapeHunter(row,domain)).filter(Boolean);
  return{contacts,diagnostic:diagnostic('hunter',{ok:true,status:result.status,stage:'domain_search',detail:`emails:${contacts.length}`})};
}

async function resolveWithExa(company,country,exaKey) {
  if(!exaKey)return{domain:'',diagnostic:diagnostic('exa',{error:'not_configured',stage:'domain_resolution'})};
  const result=await fetchJsonResult(EXA_URL,{method:'POST',headers:{'x-api-key':exaKey,'Content-Type':'application/json'},body:JSON.stringify({query:`${clean(company,160)} official website contact ${clean(country,80)}`,type:'fast',numResults:8,excludeDomains:[...BLOCKED]})},8500,'exa','domain_resolution');
  if(!result.ok)return{domain:'',diagnostic:result.diagnostic};
  for(const row of Array.isArray(result.data?.results)?result.data.results:[]){
    const domain=rootHost(row?.url);if(!usableDomain(domain,company))continue;
    if(!companyMatch(company,`${row?.title||''} ${row?.url||''} ${row?.text||''}`))continue;
    return{domain,diagnostic:diagnostic('exa',{ok:true,status:result.status,stage:'domain_resolution',detail:'matched'})};
  }
  return{domain:'',diagnostic:diagnostic('exa',{ok:true,status:result.status,error:'no_match',stage:'domain_resolution'})};
}

async function tavilyQuery(query,options={}) {
  const key=clean(process.env.TAVILY_API_KEY,5000);
  if(!key)return{ok:false,status:0,results:[],diagnostic:diagnostic('tavily',{error:'not_configured',stage:options.stage||'search'})};
  const result=await fetchJsonResult(TAVILY_URL,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({query:clean(query,500),search_depth:options.depth||'basic',max_results:options.maxResults||8,topic:'general',include_answer:false,include_raw_content:false,include_domains:options.includeDomains||[],exclude_domains:options.excludeDomains||[...BLOCKED]})},9000,'tavily',options.stage||'search');
  return{ok:result.ok,status:result.status,results:Array.isArray(result.data?.results)?result.data.results:[],diagnostic:result.diagnostic};
}

async function resolveWithTavily(company,country) {
  const queries=[`"${clean(company,160)}" official website ${clean(country,80)}`,`"${clean(company,160)}" contact email sales export ${clean(country,80)}`];
  const settled=await Promise.all(queries.map(query=>tavilyQuery(query,{maxResults:8,stage:'domain_resolution'})));
  const diagnostics=settled.map(row=>row.diagnostic);
  const rows=settled.flatMap(row=>row.results).sort((a,b)=>Number(b?.score||0)-Number(a?.score||0));
  for(const row of rows){
    const domain=rootHost(row?.url);if(!usableDomain(domain,company))continue;
    if(!companyMatch(company,`${row?.title||''} ${row?.url||''} ${row?.content||''}`))continue;
    return{domain,diagnostics,resolved:true};
  }
  return{domain:'',diagnostics:[...diagnostics,diagnostic('tavily',{ok:true,error:'no_match',stage:'domain_resolution'})],resolved:false};
}

async function tavilySiteEmailSearch(company,domain,country) {
  const search=await tavilyQuery(`"${clean(company,160)}" email sales export marketing international contact ${clean(country,80)}`,{maxResults:8,stage:'email_search',includeDomains:[domain],excludeDomains:[]});
  const diagnostics=[search.diagnostic];
  if(!search.ok)return{contacts:[],diagnostics};
  const validRows=search.results.filter(row=>/^https?:\/\//i.test(clean(row?.url,500))&&rootHost(row?.url)===rootHost(domain));
  const snippetContacts=validRows.flatMap(row=>officialEmails(`${row?.title||''} ${row?.content||''}`,domain,row?.url||`https://${domain}/`,company));
  const urls=[...new Set(validRows.map(row=>clean(row?.url,500)))].sort((a,b)=>Number(CONTACT_PATH.test(new URL(b).pathname))-Number(CONTACT_PATH.test(new URL(a).pathname))).slice(0,6);
  if(!urls.length)return{contacts:snippetContacts,diagnostics:[...diagnostics,diagnostic('tavily',{ok:true,error:snippetContacts.length?'':'no_match',stage:'email_search',detail:`snippets:${snippetContacts.length}`})]};
  const key=clean(process.env.TAVILY_API_KEY,5000);
  const extract=await fetchJsonResult(TAVILY_EXTRACT_URL,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({urls,query:`email sales export marketing international contact ${clean(company,160)}`,chunks_per_source:5,extract_depth:'basic'})},11000,'tavily','email_extract');
  diagnostics.push(extract.diagnostic);
  if(!extract.ok)return{contacts:snippetContacts,diagnostics};
  const extracted=(Array.isArray(extract.data?.results)?extract.data.results:[]).flatMap(row=>officialEmails(row?.raw_content||'',domain,row?.url||`https://${domain}/`,company));
  return{contacts:[...snippetContacts,...extracted],diagnostics:[...diagnostics,diagnostic('tavily',{ok:true,status:extract.status,error:snippetContacts.length||extracted.length?'':'no_email',stage:'email_extract',detail:`emails:${snippetContacts.length+extracted.length}`})]};
}

function chooseContacts(rows=[]) {
  const map=new Map();
  for(const row of rows){
    const email=clean(row?.email,240).toLowerCase();if(!email)continue;
    const old=map.get(email);
    if(!old||Number(row._rank||0)>Number(old._rank||0))map.set(email,{...row,email});
    else{
      old.sources=[...new Set([...(old.sources||[]),...(row.sources||[])])];
      old.providers=[...new Set([...(old.providers||[]),...(row.providers||[])])];
      old.provider=old.providers.join('+');
      old.outreachEligible=Boolean(old.outreachEligible||row.outreachEligible);
    }
  }
  return [...map.values()].sort((a,b)=>Number(Boolean(b.outreachEligible))-Number(Boolean(a.outreachEligible))||Number(b._rank||0)-Number(a._rank||0)).slice(0,6).map(({_rank,...row})=>row);
}

async function mapLimit(items,limit,worker) {
  const list=Array.isArray(items)?items:[];if(!list.length)return[];
  const out=new Array(list.length);let cursor=0;
  const runners=Array.from({length:Math.min(limit,list.length)},async()=>{while(cursor<list.length){const i=cursor++;try{out[i]=await worker(list[i],i);}catch{out[i]=null;}}});
  await Promise.all(runners);return out;
}

export async function findKBeautyContactsFast(items=[],exaKey='') {
  const rows=(Array.isArray(items)?items:[]).slice(0,6);
  const results=await mapLimit(rows,6,async item=>{
    const id=clean(item?.id,180),company=clean(item?.company,180),country=clean(item?.country,80);
    if(!id||!company)return null;
    const diagnostics=[];
    let domain=rootHost(item?.domain||item?.url||''),resolvedBy=domain?'existing':'',hunterSeed=[];
    if(domain&&!usableDomain(domain,company)){domain='';resolvedBy='';}

    if(!domain){
      const hinted=KNOWN_DOMAINS.get(companyKey(company));
      if(hinted){domain=hinted;resolvedBy='verified_domain_hint';diagnostics.push(diagnostic('domain_hint',{ok:true,stage:'domain_resolution',detail:hinted}));}
    }
    if(!domain){
      const hunterCompany=await hunterCompanySearch(company);diagnostics.push(hunterCompany.diagnostic);
      if(hunterCompany.domain){domain=hunterCompany.domain;hunterSeed=hunterCompany.contacts;resolvedBy='hunter_company_search';}
    }
    if(!domain){
      const exa=await resolveWithExa(company,country,clean(exaKey,5000));diagnostics.push(exa.diagnostic);
      if(exa.domain){domain=exa.domain;resolvedBy='exa';}
    }
    if(!domain){
      const tavily=await resolveWithTavily(company,country);diagnostics.push(...tavily.diagnostics);
      if(tavily.domain){domain=tavily.domain;resolvedBy='tavily';}
    }
    if(!domain)return{id,company,domain:'',url:'',contacts:[],resolvedBy:'',status:'website_pending',diagnostics};

    const [hunter,site]=await Promise.all([
      resolvedBy==='hunter_company_search'?Promise.resolve({contacts:hunterSeed,diagnostic:null}):hunterContacts(domain),
      siteContacts(domain,company)
    ]);
    if(hunter.diagnostic)diagnostics.push(hunter.diagnostic);
    diagnostics.push(...site.diagnostics);
    let contacts=chooseContacts([...(hunter.contacts||[]),...(site.contacts||[])]);
    if(!contacts.some(contact=>contact.outreachEligible)){
      const searched=await tavilySiteEmailSearch(company,domain,country);diagnostics.push(...searched.diagnostics);
      contacts=chooseContacts([...(hunter.contacts||[]),...(site.contacts||[]),...(searched.contacts||[])]);
    }
    return{id,company,domain,url:`https://${domain}/`,contacts,resolvedBy,status:contacts.some(contact=>contact.outreachEligible)?'found':contacts.length?'non_sendable_only':'email_missing',diagnostics};
  });
  return results.filter(Boolean);
}
