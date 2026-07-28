const TAVILY_URL='https://api.tavily.com/search';

function clean(v,max=1200){return typeof v==='string'?v.trim().slice(0,max):''}

export function tavilyConfigured(){return Boolean(process.env.TAVILY_API_KEY)}

export async function tavilySearch(query,{maxResults=8,timeRange='year',includeDomains=[],excludeDomains=[],topic='general'}={}){
  if(!process.env.TAVILY_API_KEY)throw new Error('TAVILY_API_KEY missing');
  const c=new AbortController(),t=setTimeout(()=>c.abort(),12000),started=Date.now();
  try{
    const response=await fetch(TAVILY_URL,{method:'POST',headers:{Authorization:`Bearer ${process.env.TAVILY_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({query:clean(query,500),search_depth:'basic',max_results:maxResults,topic,time_range:timeRange,include_answer:false,include_raw_content:false,include_domains:includeDomains,exclude_domains:excludeDomains}),signal:c.signal});
    const raw=await response.text();
    if(!response.ok){const e=new Error(`Tavily HTTP ${response.status}: ${clean(raw,500)}`);e.status=response.status;throw e}
    const data=JSON.parse(raw);
    return{results:(Array.isArray(data?.results)?data.results:[]).map(r=>({title:clean(r?.title,260),url:clean(r?.url,500),content:clean(r?.content,900),score:Number(r?.score)||0,published_date:clean(r?.published_date,60)})).filter(r=>/^https?:\/\//i.test(r.url)),usage:data?.usage||null,duration_ms:Date.now()-started,request_id:data?.request_id||''};
  }catch(e){if(e?.name==='AbortError'){const x=new Error('Tavily search timed out');x.status=504;throw x}throw e}finally{clearTimeout(t)}
}

export async function tavilySearchMany(queries,options={}){
  const started=Date.now();
  const settled=await Promise.allSettled(queries.map(q=>tavilySearch(q,options)));
  const all=[];let credits=0,failed=0;
  for(const item of settled){
    if(item.status==='fulfilled'){
      all.push(...item.value.results);
      credits+=Number(item.value?.usage?.credits)||1;
    }else failed+=1;
  }
  if(!all.length&&failed)throw settled.find(x=>x.status==='rejected')?.reason||new Error('Tavily searches failed');
  const seen=new Set();const results=all.filter(r=>{if(seen.has(r.url))return false;seen.add(r.url);return true}).sort((a,b)=>b.score-a.score);
  return{results,meta:{provider:'tavily',queries:queries.length,credits,failed_queries:failed,duration_ms:Date.now()-started}};
}

export function formatEvidence(sources,limit=14,maxChars=7000){return sources.slice(0,limit).map((s,i)=>`SOURCE ${i+1}\nTITLE: ${s.title}\nURL: ${s.url}\nSNIPPET: ${s.content}${s.published_date?`\nDATE: ${s.published_date}`:''}`).join('\n\n').slice(0,maxChars)}