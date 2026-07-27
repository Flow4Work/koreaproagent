const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function normalizeUrl(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const raw = value.trim();
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ['http:', 'https:'].includes(u.protocol) ? u.toString() : null;
  } catch { return null; }
}
function clampInt(value,min,max,fallback){const n=Number.parseInt(value,10);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;}
function cleanText(value,max=4000){return typeof value==='string'?value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,' ').trim().slice(0,max):'';}
function cleanUrls(values){return Array.isArray(values)?values.map(v=>cleanText(String(v),400)).filter(v=>/^https?:\/\//i.test(v)).slice(0,8):[];}
function safeError(value=''){return String(value).replace(/gsk_[A-Za-z0-9_-]+/g,'[redacted]').slice(0,500);}
function parseMaybeJson(text){if(!text)throw new Error('Groq returned an empty response');try{return JSON.parse(text)}catch{}const f=text.match(/```(?:json)?\s*([\s\S]*?)```/i);if(f){try{return JSON.parse(f[1])}catch{}}const a=text.indexOf('{'),b=text.lastIndexOf('}');if(a>=0&&b>a){try{return JSON.parse(text.slice(a,b+1))}catch{}}throw new Error('Groq result could not be parsed as JSON');}

function sanitizeResult(data,clientUrl,requestedCount,model,mode,diagnostics={}){
  const prospects=Array.isArray(data?.prospects)?data.prospects.slice(0,requestedCount):[];
  return {
    generated_at:new Date().toISOString(),
    client:{name:cleanText(data?.client?.name,120),url:cleanText(data?.client?.url,300)||clientUrl,product:cleanText(data?.client?.product,700),korea_value_proposition:cleanText(data?.client?.korea_value_proposition,700)},
    icp:{summary:cleanText(data?.icp?.summary,900),industries:Array.isArray(data?.icp?.industries)?data.icp.industries.map(v=>cleanText(String(v),80)).filter(Boolean).slice(0,10):[],company_signals:Array.isArray(data?.icp?.company_signals)?data.icp.company_signals.map(v=>cleanText(String(v),160)).filter(Boolean).slice(0,12):[],buyer_roles:Array.isArray(data?.icp?.buyer_roles)?data.icp.buyer_roles.map(v=>cleanText(String(v),100)).filter(Boolean).slice(0,10):[]},
    prospects:prospects.map((p,idx)=>({rank:idx+1,company:cleanText(p?.company,120),url:cleanText(p?.url,300),industry:cleanText(p?.industry,100),fit_score:Math.max(0,Math.min(100,Number(p?.fit_score)||0)),why_fit:cleanText(p?.why_fit,600),buying_signal:cleanText(p?.buying_signal,500),signal_date:cleanText(p?.signal_date,50),source_urls:cleanUrls(p?.source_urls),contact_name:cleanText(p?.contact_name,120),contact_title:cleanText(p?.contact_title,120),contact_profile_url:cleanText(p?.contact_profile_url,400),recommended_role:cleanText(p?.recommended_role,120),contact_search_query:cleanText(p?.contact_search_query,250),sales_angle:cleanText(p?.sales_angle,500),message_ko:cleanText(p?.message_ko,1100),message_en:cleanText(p?.message_en,1100),confidence:['high','medium','low'].includes(String(p?.confidence).toLowerCase())?String(p.confidence).toLowerCase():'medium',warning:cleanText(p?.warning,300)})).filter(p=>p.company),
    strategy:{first_segment:cleanText(data?.strategy?.first_segment,400),core_offer:cleanText(data?.strategy?.core_offer,500),outreach_sequence:Array.isArray(data?.strategy?.outreach_sequence)?data.strategy.outreach_sequence.map(v=>cleanText(String(v),250)).filter(Boolean).slice(0,7):[],next_action:cleanText(data?.strategy?.next_action,500)},
    research_notes:Array.isArray(data?.research_notes)?data.research_notes.map(v=>cleanText(String(v),350)).filter(Boolean).slice(0,12):[],
    meta:{model,mode,requested_count:requestedCount,...diagnostics}
  };
}

async function callGroq({model,prompt,timeoutMs,deep}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(GROQ_URL,{method:'POST',headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`,'Content-Type':'application/json','Groq-Model-Version':'latest'},body:JSON.stringify({model,messages:[{role:'system',content:'Evidence-first Korea GTM researcher. Use current web evidence. Never invent facts. Return strict JSON only.'},{role:'user',content:prompt}],temperature:0.1,response_format:{type:'json_object'},citation_options:'disabled',compound_custom:{tools:{enabled_tools:deep?['web_search','visit_website']:['web_search']}}}),signal:controller.signal});
    const raw=await response.text();if(!response.ok){let detail=raw;try{detail=JSON.parse(raw)?.error?.message||raw}catch{}const e=new Error(`Groq HTTP ${response.status}: ${safeError(detail)}`);e.status=response.status;throw e;}
    const payload=JSON.parse(raw);const message=payload?.choices?.[0]?.message;return {parsed:parseMaybeJson(message?.content),payload,toolCalls:Array.isArray(message?.executed_tools)?message.executed_tools.length:0};
  }catch(error){if(error?.name==='AbortError')throw new Error(`Groq research timed out after ${Math.round(timeoutMs/1000)}s`);throw error;}finally{clearTimeout(timer)}
}

export async function POST(request){
  if(!process.env.GROQ_API_KEY)return Response.json({error:'GROQ_API_KEY is missing in Vercel Environment Variables.'},{status:503});
  let body={};try{body=await request.json()}catch{return Response.json({error:'Invalid request body.'},{status:400})}
  const clientUrl=normalizeUrl(body.clientUrl);if(!clientUrl)return Response.json({error:'A valid client SaaS URL is required.'},{status:400});
  const count=clampInt(body.count,3,15,5);const mode=body.mode==='deep'?'deep':'fast';const productHint=cleanText(body.productHint,1600);const targetNotes=cleanText(body.targetNotes,1800);const seeds=cleanText(body.seeds,5000);const preferred=mode==='deep'?(process.env.GROQ_MODEL||'groq/compound'):'groq/compound-mini';
  const prompt=`MISSION\nResearch the SaaS below and create a Korea Prospect Pack with up to ${count} real Korean companies that plausibly need it.\n\nCLIENT URL\n${clientUrl}\n\nPRODUCT HINT\n${productHint||'Infer from the official site.'}\n\nTARGET NOTES\n${targetNotes||'Choose the strongest Korea ICP based on the product.'}\n\nOPTIONAL SEEDS\n${seeds||'None. Discover candidates yourself.'}\n\nRULES\n1. Research the client site first.\n2. Use current web evidence for Korean companies and buying signals.\n3. Prefer hiring, expansion, product launches, support load, partnerships, funding, regulation, or technology change relevant to the product.\n4. Every non-obvious claim needs source_urls. Never invent URLs, people, dates, hiring, funding, or customer counts.\n5. Fill contact_name/title/profile only when publicly verified. Otherwise leave them blank and provide recommended_role + contact_search_query. Never guess email addresses.\n6. Fit score = 40 use-case fit + 30 current signal + 20 reachable buyer + 10 evidence.\n7. Korean and English outreach must be short, specific, and evidence-based.\n\nOUTPUT ONLY JSON\n{"client":{"name":"","url":"","product":"","korea_value_proposition":""},"icp":{"summary":"","industries":[],"company_signals":[],"buyer_roles":[]},"prospects":[{"company":"","url":"","industry":"","fit_score":0,"why_fit":"","buying_signal":"","signal_date":"","source_urls":[],"contact_name":"","contact_title":"","contact_profile_url":"","recommended_role":"","contact_search_query":"","sales_angle":"","message_ko":"","message_en":"","confidence":"high|medium|low","warning":""}],"strategy":{"first_segment":"","core_offer":"","outreach_sequence":[],"next_action":""},"research_notes":[]}`;
  const attempts=mode==='deep'?[{model:preferred,timeoutMs:34000,deep:true},{model:'groq/compound-mini',timeoutMs:16000,deep:false}]:[{model:'groq/compound-mini',timeoutMs:24000,deep:false},{model:'groq/compound',timeoutMs:24000,deep:true}];
  const failures=[];
  for(let i=0;i<attempts.length;i++){
    const attempt=attempts[i];
    try{const {parsed,payload,toolCalls}=await callGroq({...attempt,prompt});const result=sanitizeResult(parsed,clientUrl,count,attempt.model,mode,{tool_calls:toolCalls,fallback_used:i>0,usage:payload?.usage||null});result.meta.returned_count=result.prospects.length;if(!result.prospects.length)throw new Error('Research returned zero usable Korean prospects');return Response.json(result,{headers:{'Cache-Control':'no-store'}})}catch(error){failures.push(safeError(error?.message||'Unknown Groq error'))}
  }
  return Response.json({error:`Korea pipeline generation failed after automatic retry. ${failures.join(' | ')}`,hint:'Try 5 prospects in Fast mode first. If it persists, check Groq rate limits.'},{status:502,headers:{'Cache-Control':'no-store'}});
}
