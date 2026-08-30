const EXA_URL = 'https://api.exa.ai/search';
const TAVILY_URL = 'https://api.tavily.com/search';
const HUNTER_URL = 'https://api.hunter.io/v2/domain-search';

const BLOCKED = new Set([
  'linkedin.com','facebook.com','instagram.com','youtube.com','x.com','twitter.com','wikipedia.org',
  '10times.com','eventbrite.com','medium.com','made-in-china.com','globalsources.com','tradeindia.com',
  'exporthub.com','tradekey.com','1688.com'
]);
const FREE_MAIL = new Set(['gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','yahoo.com','yahoo.co.jp','icloud.com','me.com','qq.com','163.com','126.com','foxmail.com']);
const KNOWN = new Map([
  ['ajmal perfumes','ajmal.com'],
  ['alibaba com','alibaba.com'],
  ['laboratoire gilbert','groupe-gilbert.fr'],
  ['moririn co ltd','moririn.co.jp'],
  ['ptn healthcare gmbh','ptn-healthcare.de'],
  ['bulgarian rose plc','bulgarianrose.bg'],
  ['ims packaging','imspackaging.com'],
  ['yuyao wellpack sprayer co ltd','cnwellpack.com'],
  ['zhuhai baoli foam spray pump co ltd','zhuhaibaoli.com']
]);
let hunterDisabledUntil = 0;

const clean = (value = '', max = 500) => String(value || '').replace(/\s+/g,' ').trim().slice(0,max);
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
const companyKey = value => clean(value,180).toLowerCase().replace(/\b(?:inc|llc|ltd|limited|corp|corporation|company|co|gmbh|plc)\b/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const companyTokens = value => companyKey(value).split(/\s+/u).filter(token => token.length >= 3);
const companyMatch = (company,text) => {
  const tokens = companyTokens(company);
  if (!tokens.length) return false;
  const hay = clean(text,6500).toLowerCase();
  const hits = tokens.filter(token => hay.includes(token)).length;
  return hits >= Math.min(2,tokens.length) || (tokens.length >= 3 && hits / tokens.length >= 0.5) || (tokens.length === 1 && hay.includes(tokens[0]));
};
const usableDomain = (domain, company = '') => {
  const host = rootHost(domain);
  if (!host || host.endsWith('.kr') || FREE_MAIL.has(host)) return false;
  if (!BLOCKED.has(host)) return true;
  return host === 'alibaba.com' && /alibaba/i.test(company);
};
const diagnostic = (provider,{ok=false,status=0,error='',detail=''}={}) => ({provider,stage:'domain_resolution',ok:Boolean(ok),status:Number(status)||0,error:clean(error,100),detail:clean(detail,180)});

async function fetchJson(url, options = {}, timeoutMs = 8500, provider = 'provider') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url,{...options,signal:controller.signal,cache:'no-store'});
    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok) return {ok:false,data:null,diagnostic:diagnostic(provider,{status:response.status,error:clean(data?.errors?.[0]?.details||data?.errors?.[0]?.id||data?.error||data?.message||`http_${response.status}`,100)})};
    return {ok:true,data,diagnostic:diagnostic(provider,{ok:true,status:response.status})};
  } catch (error) {
    return {ok:false,data:null,diagnostic:diagnostic(provider,{error:error?.name==='AbortError'?'timeout':'network_error'})};
  } finally { clearTimeout(timer); }
}

async function hunterResolve(company) {
  const key = clean(process.env.HUNTER_API_KEY,5000);
  if (!key) return {domain:'',diagnostic:diagnostic('hunter',{error:'not_configured'})};
  if (Date.now() < hunterDisabledUntil) return {domain:'',diagnostic:diagnostic('hunter',{error:'credit_limited'})};
  const params = new URLSearchParams({company:clean(company,180),limit:'10',api_key:key});
  const result = await fetchJson(`${HUNTER_URL}?${params}`,{},8500,'hunter');
  if (!result.ok) {
    const error = clean(result.diagnostic?.error,100).toLowerCase();
    if (result.diagnostic?.status === 429 || /credit|limit|rate/.test(error)) hunterDisabledUntil = Date.now() + 12 * 60 * 60 * 1000;
    return {domain:'',diagnostic:result.diagnostic};
  }
  const data = result.data?.data || {};
  const domain = rootHost(data?.domain || '');
  const organization = clean(data?.organization || '',240);
  if (!usableDomain(domain,company)) return {domain:'',diagnostic:diagnostic('hunter',{ok:true,status:result.diagnostic.status,error:'no_domain_match'})};
  if (organization && !companyMatch(company,organization) && !companyMatch(organization,company)) return {domain:'',diagnostic:diagnostic('hunter',{ok:true,status:result.diagnostic.status,error:'company_mismatch',detail:organization})};
  return {domain,diagnostic:diagnostic('hunter',{ok:true,status:result.diagnostic.status,detail:'matched'})};
}

async function exaResolve(company,country,exaKey) {
  const key = clean(exaKey || process.env.EXA_API_KEY,5000);
  if (!key) return {domain:'',diagnostic:diagnostic('exa',{error:'not_configured'})};
  const result = await fetchJson(EXA_URL,{
    method:'POST',headers:{'x-api-key':key,'Content-Type':'application/json'},
    body:JSON.stringify({query:`${clean(company,160)} official company website ${clean(country,80)}`,type:'fast',numResults:8,excludeDomains:[...BLOCKED]})
  },8500,'exa');
  if (!result.ok) return {domain:'',diagnostic:result.diagnostic};
  for (const row of Array.isArray(result.data?.results)?result.data.results:[]) {
    const domain = rootHost(row?.url);
    if (!usableDomain(domain,company)) continue;
    if (!companyMatch(company,`${row?.title||''} ${row?.url||''} ${row?.text||''}`)) continue;
    return {domain,diagnostic:diagnostic('exa',{ok:true,status:result.diagnostic.status,detail:'matched'})};
  }
  return {domain:'',diagnostic:diagnostic('exa',{ok:true,status:result.diagnostic.status,error:'no_match'})};
}

async function tavilyResolve(company,country) {
  const key = clean(process.env.TAVILY_API_KEY,5000);
  if (!key) return {domain:'',diagnostic:diagnostic('tavily',{error:'not_configured'})};
  const result = await fetchJson(TAVILY_URL,{
    method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({query:`\"${clean(company,160)}\" official website ${clean(country,80)}`,search_depth:'basic',max_results:8,topic:'general',include_answer:false,include_raw_content:false,exclude_domains:[...BLOCKED]})
  },8500,'tavily');
  if (!result.ok) return {domain:'',diagnostic:result.diagnostic};
  const rows = Array.isArray(result.data?.results)?result.data.results:[];
  rows.sort((a,b)=>Number(b?.score||0)-Number(a?.score||0));
  for (const row of rows) {
    const domain = rootHost(row?.url);
    if (!usableDomain(domain,company)) continue;
    if (!companyMatch(company,`${row?.title||''} ${row?.url||''} ${row?.content||''}`)) continue;
    return {domain,diagnostic:diagnostic('tavily',{ok:true,status:result.diagnostic.status,detail:'matched'})};
  }
  return {domain:'',diagnostic:diagnostic('tavily',{ok:true,status:result.diagnostic.status,error:'no_match'})};
}

async function mapLimit(items,limit,worker) {
  const list = Array.isArray(items)?items:[];
  if (!list.length) return [];
  const out = new Array(list.length);
  let cursor = 0;
  const runners = Array.from({length:Math.min(limit,list.length)},async()=>{
    while (cursor < list.length) {
      const i = cursor++;
      try { out[i] = await worker(list[i],i); } catch { out[i] = null; }
    }
  });
  await Promise.all(runners);
  return out;
}

export async function resolveKBeautyDomainsV5(items = [], exaKey = '') {
  const rows = (Array.isArray(items)?items:[]).slice(0,18);
  const results = await mapLimit(rows,4,async item => {
    const id = clean(item?.id,180), company = clean(item?.company,180), country = clean(item?.country,80);
    if (!id || !company) return null;
    const existing = rootHost(item?.domain || item?.url || '');
    if (usableDomain(existing,company)) return {id,company,domain:existing,url:`https://${existing}/`,resolvedBy:'existing',diagnostics:[diagnostic('existing',{ok:true,detail:existing})]};

    const hinted = KNOWN.get(companyKey(company));
    if (hinted) return {id,company,domain:hinted,url:`https://${hinted}/`,resolvedBy:'verified_domain_hint',diagnostics:[diagnostic('domain_hint',{ok:true,detail:hinted})]};

    const [exa,tavily] = await Promise.all([
      exaResolve(company,country,exaKey),
      tavilyResolve(company,country)
    ]);
    let hunter = {domain:'',diagnostic:diagnostic('hunter',{error:'not_needed'})};
    let picked = exa.domain ? ['exa',exa.domain] : tavily.domain ? ['tavily',tavily.domain] : ['', ''];
    if (!picked[1]) {
      hunter = await hunterResolve(company);
      if (hunter.domain) picked = ['hunter',hunter.domain];
    }
    return {
      id,company,domain:picked[1],url:picked[1]?`https://${picked[1]}/`:'',resolvedBy:picked[0],
      diagnostics:[exa.diagnostic,tavily.diagnostic,hunter.diagnostic]
    };
  });
  return results.filter(Boolean);
}
