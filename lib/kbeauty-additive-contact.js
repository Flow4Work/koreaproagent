const EXA_URL = 'https://api.exa.ai/search';
const TAVILY_URL = 'https://api.tavily.com/search';

const JUNK = /^(?:security|privacy|legal|billing|careers|jobs|hr|noreply|no-reply|abuse|postmaster|webmaster|mailer-daemon)$/i;
const ROLE = /(sales?|marketing|events?|partnerships?|business|bizdev|export|international|overseas|wholesale|distributor|trade|commercial|orders?)/i;

const clean = (value='', max=500) => String(value || '').replace(/\s+/g,' ').trim().slice(0,max);
const rootHost = value => {
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
};
const localPart=email=>clean(email,240).toLowerCase().split('@')[0]||'';
const validEmail=email=>/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean(email,240));
const sameDomain=(email,domain)=>rootHost(email)===rootHost(domain);

function diagnostic(provider,{ok=false,status=0,error='',detail=''}={}){
  return {provider,stage:'additive_email_search',ok:Boolean(ok),status:Number(status)||0,error:clean(error,100),detail:clean(detail,180)};
}

async function requestJson(url,options={},timeoutMs=9000,provider='provider'){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{...options,signal:controller.signal,cache:'no-store'});
    let data=null;try{data=await response.json();}catch{}
    if(!response.ok)return{ok:false,status:response.status,data:null,diagnostic:diagnostic(provider,{status:response.status,error:clean(data?.error||data?.message||`http_${response.status}`,100)})};
    return{ok:true,status:response.status,data,diagnostic:diagnostic(provider,{ok:true,status:response.status})};
  }catch(error){
    return{ok:false,status:0,data:null,diagnostic:diagnostic(provider,{error:error?.name==='AbortError'?'timeout':'network_error'})};
  }finally{clearTimeout(timer);}
}

function emailsFromText(text='',domain='',source='',provider=''){
  const matches=String(text||'').replace(/\s+at\s+/gi,'@').replace(/\s+dot\s+/gi,'.').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[];
  return [...new Set(matches.map(email=>email.toLowerCase()))]
    .filter(email=>validEmail(email)&&sameDomain(email,domain)&&!JUNK.test(localPart(email)))
    .map(email=>({
      name:'',title:'',email,emailStatus:'unknown',type:ROLE.test(localPart(email))?'generic':'personal',
      sources:[source].filter(Boolean),providers:[provider],provider,qualified:true,outreachEligible:true,
      officialPublished:false,sourceDomain:rootHost(domain),score:provider==='exa'?92:90
    }));
}

async function exaContacts(item={},exaKey=''){
  const key=clean(exaKey||process.env.EXA_API_KEY,5000);
  const domain=rootHost(item?.domain||item?.url||'');
  if(!key||!domain)return{contacts:[],diagnostic:diagnostic('exa',{error:!key?'not_configured':'missing_domain'})};
  const query=`${clean(item?.company,160)} ${domain} sales marketing export international contact email`;
  const result=await requestJson(EXA_URL,{
    method:'POST',headers:{'x-api-key':key,'Content-Type':'application/json'},
    body:JSON.stringify({query,type:'fast',numResults:12})
  },9000,'exa');
  if(!result.ok)return{contacts:[],diagnostic:result.diagnostic};
  const contacts=[];
  for(const row of Array.isArray(result.data?.results)?result.data.results:[]){
    if(rootHost(row?.url)!==domain)continue;
    contacts.push(...emailsFromText(`${row?.title||''} ${row?.text||''}`,domain,row?.url||`https://${domain}/`,'exa'));
  }
  return{contacts,diagnostic:diagnostic('exa',{ok:true,status:result.status,error:contacts.length?'':'no_email',detail:`emails:${contacts.length}`})};
}

async function tavilyContacts(item={}){
  const key=clean(process.env.TAVILY_API_KEY,5000);
  const domain=rootHost(item?.domain||item?.url||'');
  if(!key||!domain)return{contacts:[],diagnostic:diagnostic('tavily',{error:!key?'not_configured':'missing_domain'})};
  const result=await requestJson(TAVILY_URL,{
    method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      query:`${clean(item?.company,160)} sales marketing export international contact email`,
      search_depth:'basic',max_results:20,topic:'general',include_answer:false,include_raw_content:false,
      include_domains:[domain],exclude_domains:[]
    })
  },9000,'tavily');
  if(!result.ok)return{contacts:[],diagnostic:result.diagnostic};
  const contacts=[];
  for(const row of Array.isArray(result.data?.results)?result.data.results:[]){
    if(rootHost(row?.url)!==domain)continue;
    contacts.push(...emailsFromText(`${row?.title||''} ${row?.content||''}`,domain,row?.url||`https://${domain}/`,'tavily'));
  }
  return{contacts,diagnostic:diagnostic('tavily',{ok:true,status:result.status,error:contacts.length?'':'no_email',detail:`emails:${contacts.length}`})};
}

function dedupeContacts(rows=[]){
  const map=new Map();
  for(const row of rows){
    const email=clean(row?.email,240).toLowerCase();
    if(!email||map.has(email))continue;
    map.set(email,{...row,email});
  }
  return [...map.values()].slice(0,8);
}

async function mapLimit(items,limit,worker){
  const list=Array.isArray(items)?items:[];if(!list.length)return[];
  const out=new Array(list.length);let cursor=0;
  const runners=Array.from({length:Math.min(limit,list.length)},async()=>{while(cursor<list.length){const i=cursor++;try{out[i]=await worker(list[i],i);}catch{out[i]=null;}}});
  await Promise.all(runners);return out;
}

export async function findKBeautyAdditiveContacts(items=[],exaKey=''){
  const rows=(Array.isArray(items)?items:[]).slice(0,6);
  const out=await mapLimit(rows,6,async item=>{
    const id=clean(item?.id,180),company=clean(item?.company,180),domain=rootHost(item?.domain||item?.url||'');
    if(!id||!company||!domain)return{id,company,domain,contacts:[],diagnostics:[]};
    const [exa,tavily]=await Promise.all([exaContacts(item,exaKey),tavilyContacts(item)]);
    return{id,company,domain,url:`https://${domain}/`,contacts:dedupeContacts([...(exa.contacts||[]),...(tavily.contacts||[])]),diagnostics:[exa.diagnostic,tavily.diagnostic]};
  });
  return out.filter(Boolean);
}

export function mergeKBeautyContactRows(baseRows=[],additiveRows=[]){
  const additiveById=new Map((Array.isArray(additiveRows)?additiveRows:[]).map(row=>[row?.id,row]));
  return (Array.isArray(baseRows)?baseRows:[]).map(base=>{
    const extra=additiveById.get(base?.id);
    if(!extra)return base;
    return {
      ...base,
      contacts:dedupeContacts([...(base?.contacts||[]),...(extra?.contacts||[])]),
      diagnostics:[...(base?.diagnostics||[]),...(extra?.diagnostics||[])]
    };
  });
}
