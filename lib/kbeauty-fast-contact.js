const EXA_URL = 'https://api.exa.ai/search';
const HUNTER_URL = 'https://api.hunter.io/v2/domain-search';
const BLOCKED = new Set(['linkedin.com','facebook.com','instagram.com','youtube.com','x.com','twitter.com','wikipedia.org','10times.com','eventbrite.com','medium.com','made-in-china.com','globalsources.com','tradeindia.com','exporthub.com','tradekey.com']);
const ROLE = /^(sales|marketing|events?|event|partnerships?|partners?|business|bizdev|bd|community|operations|ops|export|international)$/i;
const CATCH_ALL = /^(info|hello|contact|office|team|admin)$/i;
const JUNK = /^(support|help|security|privacy|legal|billing|careers|jobs|hr|noreply|no-reply|abuse|postmaster|webmaster)$/i;

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
  .replace(/\b(inc|llc|ltd|limited|corp|corporation|company|co|gmbh|plc|group)\b/giu,' ')
  .replace(/[^\p{L}\p{N}]+/gu,' ').split(/\s+/u).filter(token => token.length >= 2);
const companyMatch = (company,text) => {
  const tokens = companyTokens(company); if (!tokens.length) return false;
  const hay = clean(text,4000).toLowerCase();
  return tokens.filter(token => hay.includes(token)).length >= Math.min(2,tokens.length);
};
const sameDomain = (email,domain) => {
  const host = clean(email,240).toLowerCase().split('@')[1] || '';
  return Boolean(host && domain && (host === domain || host.endsWith(`.${domain}`)));
};
const local = email => clean(email,240).toLowerCase().split('@')[0] || '';

async function fetchJson(url, options={}, timeoutMs=8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url,{...options,signal:controller.signal,cache:'no-store'});
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
  finally { clearTimeout(timer); }
}

async function resolveWithExa(company,country,exaKey) {
  if (!exaKey) return '';
  const data = await fetchJson(EXA_URL,{
    method:'POST',
    headers:{'x-api-key':exaKey,'Content-Type':'application/json'},
    body:JSON.stringify({
      query:`${clean(company,160)} official company website ${clean(country,80)}`,
      type:'fast',numResults:6,
      excludeDomains:[...BLOCKED]
    })
  },9000);
  for (const row of Array.isArray(data?.results) ? data.results : []) {
    const domain = rootHost(row?.url);
    if (!domain || domain.endsWith('.kr') || BLOCKED.has(domain)) continue;
    if (!companyMatch(company,`${row?.title || ''} ${row?.url || ''} ${row?.text || ''}`)) continue;
    return domain;
  }
  return '';
}

function shapeHunter(row,domain) {
  const email = clean(row?.value,240).toLowerCase();
  const localPart = local(email);
  if (!email || !sameDomain(email,domain) || JUNK.test(localPart) || CATCH_ALL.test(localPart)) return null;
  const statusRaw = clean(row?.verification?.status || '',80).toLowerCase();
  const emailStatus = /^(valid|verified|deliverable|safe)$/.test(statusRaw) ? 'valid' : statusRaw.includes('accept') ? 'accept_all' : statusRaw === 'invalid' ? 'invalid' : 'unknown';
  if (emailStatus === 'invalid') return null;
  const sources = ['hunter.io',...(Array.isArray(row?.sources) ? row.sources.map(source => source?.uri).filter(Boolean) : [])];
  const personal = row?.type === 'personal' || !ROLE.test(localPart);
  const roleRank = ROLE.test(localPart) ? 2 : 0;
  const personalRank = personal ? 3 : 0;
  const validRank = emailStatus === 'valid' ? 4 : emailStatus === 'accept_all' ? 2 : 1;
  return {
    name:clean(`${row?.first_name || ''} ${row?.last_name || ''}`,180),
    title:clean(row?.position || '',200),
    email,emailStatus,
    seniority:clean(row?.seniority || '',100),department:clean(row?.department || '',100),
    type:personal ? 'personal' : 'generic',linkedinUrl:clean(row?.linkedin || '',500),
    sources:[...new Set(sources)],providers:['hunter'],provider:'hunter',qualified:true,
    score:70 + roleRank + personalRank + validRank,
    _rank:roleRank + personalRank + validRank
  };
}

async function hunterContacts(domain) {
  const key = clean(process.env.HUNTER_API_KEY,5000);
  if (!key || !domain) return [];
  const params = new URLSearchParams({domain,limit:'20',api_key:key});
  const data = await fetchJson(`${HUNTER_URL}?${params}`,{},8500);
  return (Array.isArray(data?.data?.emails) ? data.data.emails : [])
    .map(row => shapeHunter(row,domain)).filter(Boolean)
    .sort((a,b) => b._rank-a._rank).slice(0,4)
    .map(({_rank,...contact}) => contact);
}

async function mapLimit(items,limit,worker) {
  const out = new Array(items.length); let cursor = 0;
  const runners = Array.from({length:Math.min(limit,items.length)},async()=>{
    while (cursor < items.length) { const i = cursor++; try { out[i] = await worker(items[i],i); } catch { out[i] = null; } }
  });
  await Promise.all(runners); return out;
}

export async function findKBeautyContactsFast(items=[],exaKey='') {
  const rows = (Array.isArray(items) ? items : []).slice(0,60);
  const results = await mapLimit(rows,10,async item => {
    const id = clean(item?.id,180); const company = clean(item?.company,180); const country = clean(item?.country,80);
    let domain = rootHost(item?.domain || item?.url || '');
    let resolvedBy = domain ? 'existing' : '';
    if (!domain) { domain = await resolveWithExa(company,country,clean(exaKey,5000)); if (domain) resolvedBy = 'exa'; }
    if (!domain) return {id,company,domain:'',url:'',contacts:[],resolvedBy:'',status:'website_pending'};
    const contacts = await hunterContacts(domain);
    return {id,company,domain,url:`https://${domain}/`,contacts,resolvedBy,status:contacts.length?'found':'hunter_empty'};
  });
  return results.filter(Boolean);
}
