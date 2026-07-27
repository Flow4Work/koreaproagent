const TAVILY_URL='https://api.tavily.com/search';

function clean(v,max=1200){return typeof v==='string'?v.trim().slice(0,max):''}

export function tavilyConfigured(){return Boolean(process.env.TAVILY_API_KEY)}

export async function tavilySearch(query,{maxResults=8,timeRange='year'}={}){
  if(!process.env.TAVILY_API_KEY)throw new Error('TAVILY_API_KEY missing');
  const c=new AbortController(),t=setTimeout(()=>c.abort(),12000),started=Date.now();
  try{
    const response=await fetch(TAVILY_URL,{method:'POST',headers:{Authorization:`Bearer ${process.env.TAVILY_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({query:clean(query,400),search_depth:'basic',max_results:maxResults,include_answer:false,include_raw_content:false,time_range:timeRange}),signal:c.signal});
    const raw=await response.text();
    if(!response.ok){const e=new Error(`Tavily HTTP ${response.status}: ${clean(raw,500)}`);e.status=response.status;throw e}
    const data=JSON.parse(raw);
    return{results:(Array.isArray(data?.results)?data.results:[]).map(r=>({title:clean(r?.title,260),url:clean(r?.url,500),content:clean(r?.content,800),score:Number(r?.score)||0,published_date:clean(r?.published_date,60)})).filter(r=>/^https?:\/\//i.test(r.url)),usage:data?.usage||null,duration_ms:Date.now()-started,request_id:data?.request_id||''};
  }catch(e){if(e?.name==='AbortError'){const x=new Error('Tavily search timed out');x.status=504;throw x}throw e}finally{clearTimeout(t)}
}

export async function tavilySearchMany(queries,{maxResults=7,timeRange='year'}={}){
  const all=[];let credits=0,totalMs=0;
  for(const q of queries){const r=await tavilySearch(q,{maxResults,timeRange});all.push(...r.results);credits+=Number(r?.usage?.credits)||1;totalMs+=r.duration_ms||0}
  const seen=new Set();const results=all.filter(r=>{if(seen.has(r.url))return false;seen.add(r.url);return true}).sort((a,b)=>b.score-a.score);
  return{results,meta:{provider:'tavily',queries:queries.length,credits,duration_ms:totalMs}};
}

export function formatEvidence(sources,limit=14,maxChars=7000){return sources.slice(0,limit).map((s,i)=>`SOURCE ${i+1}\nTITLE: ${s.title}\nURL: ${s.url}\nSNIPPET: ${s.content}${s.published_date?`\nDATE: ${s.published_date}`:''}`).join('\n\n').slice(0,maxChars)}
