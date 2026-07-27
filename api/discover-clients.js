const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const SEARCH_MODEL = 'groq/compound-mini';
const STRUCTURE_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'];

function clean(value, max = 1400) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function safeError(value = '') { return String(value).replace(/gsk_[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 700); }
function rateInfo(response) { return { remaining_requests: response.headers.get('x-ratelimit-remaining-requests'), remaining_tokens: response.headers.get('x-ratelimit-remaining-tokens'), retry_after: response.headers.get('retry-after') }; }
function validUrls(values, limit = 4) { return Array.isArray(values) ? values.map(String).filter((v) => /^https?:\/\//i.test(v)).slice(0, limit) : []; }

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); const started = Date.now();
  try { const response = await fetch(url, { ...options, signal: controller.signal }); return { response, durationMs: Date.now() - started }; }
  catch (error) { if (error?.name === 'AbortError') { const e = new Error(`Groq search timed out after ${Math.round(timeoutMs/1000)}s`); e.status = 504; throw e; } throw error; }
  finally { clearTimeout(timer); }
}

function evidenceFromPayload(payload) {
  const message = payload?.choices?.[0]?.message || {}; const parts = [];
  if (message.content) parts.push(String(message.content));
  if (Array.isArray(message.executed_tools)) for (const tool of message.executed_tools) {
    if (tool?.arguments) parts.push(String(tool.arguments));
    if (tool?.output) parts.push(String(tool.output));
  }
  return parts.join('\n\n').slice(0, 6000);
}

async function searchBuyers({ focus, version, timeoutMs }) {
  const prompt = `Search the current web for 4-5 overseas B2B SaaS/AI companies that could plausibly buy a small Korea market-entry sales pilot now. Buyer preference: ${focus || 'Seed-Series B; recent APAC/Japan/Singapore/global expansion, funding, or sales/partnership hiring; clear Korea B2B use case; no mature Korea sales team.'} Prioritize triggers from the last 18 months. Avoid giant companies. For every candidate include official company URL plus at least one public source URL supporting the trigger. Never invent facts. Keep the research concise.`;
  const { response, durationMs } = await fetchWithTimeout(GROQ_CHAT_URL, {
    method:'POST', headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`,'Content-Type':'application/json','Groq-Model-Version':version},
    body:JSON.stringify({model:SEARCH_MODEL,messages:[{role:'system',content:'Evidence-first B2B web researcher. Use real current URLs only.'},{role:'user',content:prompt}],temperature:0,max_completion_tokens:1800,compound_custom:{tools:{enabled_tools:['web_search']}}})
  }, timeoutMs);
  const raw=await response.text();
  if(!response.ok){let detail=raw;try{detail=JSON.parse(raw)?.error?.message||raw}catch{}const e=new Error(`Groq search HTTP ${response.status}: ${safeError(detail)}`);e.status=response.status;e.retryAfter=response.headers.get('retry-after');e.rate=rateInfo(response);throw e;}
  const payload=JSON.parse(raw),evidence=evidenceFromPayload(payload);if(!evidence.trim())throw new Error('Groq search returned no usable evidence');
  return{evidence,meta:{model:SEARCH_MODEL,version,duration_ms:durationMs,tool_calls:Array.isArray(payload?.choices?.[0]?.message?.executed_tools)?payload.choices[0].message.executed_tools.length:0,usage:payload?.usage||null,rate:rateInfo(response)}};
}

const leadSchema={type:'object',properties:{
  company:{type:'string'},url:{type:'string'},country:{type:'string'},fit_score:{type:'integer'},
  why_buy_our_service:{type:'string'},why_now:{type:'string'},source_urls:{type:'array',items:{type:'string'}},
  recommended_role:{type:'string'},contact_search_query:{type:'string'},korea_opportunity:{type:'string'},
  outreach_en:{type:'string'},outreach_ko:{type:'string'}
},required:['company','url','country','fit_score','why_buy_our_service','why_now','source_urls','recommended_role','contact_search_query','korea_opportunity','outreach_en','outreach_ko'],additionalProperties:false};
const resultSchema={type:'object',properties:{leads:{type:'array',items:leadSchema},next_action:{type:'string'}},required:['leads','next_action'],additionalProperties:false};

async function structureEvidence({ evidence, focus }) {
  const prompt=`검색 근거만 사용해 우리가 먼저 연락할 해외 SaaS 후보 최대 3곳을 고른다. 조건: ${focus || '최근 확장 신호 + 명확한 한국 B2B 사용처'}. 우리 상품은 390,000원 Korea Pipeline Pilot이며 한국팀 채용 전 한국 시장 가능성을 빠르게 검증한다. 설명은 한국어, 회사명/URL/영문메일만 원문. source_urls는 근거에 실제 등장한 URL만 복사. 확인 안 된 투자·채용·진출은 쓰지 않는다. 근거 1개뿐이면 70점 초과 금지. outreach_en은 50~70단어, 링크 없이 샘플을 보내도 되는지 묻고 끝낸다. 찾지 못한 값은 빈 문자열.\n\nWEB EVIDENCE:\n${evidence.slice(0,6000)}`;
  const failures=[];
  for(const model of STRUCTURE_MODELS){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);try{
    const response=await fetch(GROQ_CHAT_URL,{method:'POST',headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content:prompt}],temperature:0,reasoning_effort:'low',reasoning_format:'hidden',max_completion_tokens:1600,response_format:{type:'json_schema',json_schema:{name:'korea_buyer_leads',strict:true,schema:resultSchema}}}),signal:controller.signal});
    const raw=await response.text();if(!response.ok){let detail=raw;try{detail=JSON.parse(raw)?.error?.message||raw}catch{}const e=new Error(`Groq structure HTTP ${response.status}: ${safeError(detail)}`);e.status=response.status;e.retryAfter=response.headers.get('retry-after');e.rate=rateInfo(response);throw e;}
    const payload=JSON.parse(raw),content=payload?.choices?.[0]?.message?.content;if(!content)throw new Error('Groq structure returned empty content');return{data:JSON.parse(content),model,usage:payload?.usage||null};
  }catch(error){failures.push(error?.name==='AbortError'?`${model} structure timeout`:safeError(error?.message||error));if(error?.status===429)throw error;}finally{clearTimeout(timer)}}
  throw new Error(`Structured output failed: ${failures.join(' | ')}`);
}

function sanitizeLead(lead){const source_urls=validUrls(lead?.source_urls);let score=Math.max(0,Math.min(100,Number.parseInt(lead?.fit_score,10)||0));if(source_urls.length===0)score=Math.min(score,40);if(source_urls.length===1)score=Math.min(score,70);return{company:clean(lead?.company,140),url:clean(lead?.url,350),country:clean(lead?.country,80),category:'',fit_score:score,why_buy_our_service:clean(lead?.why_buy_our_service,420),why_now:clean(lead?.why_now,420),source_urls,recommended_role:clean(lead?.recommended_role,100),contact_search_query:clean(lead?.contact_search_query,220),korea_opportunity:clean(lead?.korea_opportunity,420),outreach_en:clean(lead?.outreach_en,900),outreach_ko:clean(lead?.outreach_ko,900),confidence:source_urls.length>=2?'high':'medium',warning:''};}

export async function POST(request){
  if(!process.env.GROQ_API_KEY)return Response.json({error:'GROQ_API_KEY가 Vercel 환경변수에 없습니다.'},{status:503});
  let body={};try{body=await request.json()}catch{return Response.json({error:'요청 형식이 잘못됐습니다.'},{status:400})}
  const focus=clean(body.focus,1200);let search=null;const failures=[];
  for(const attempt of [{version:'2025-08-16',timeoutMs:32000},{version:'2025-07-23',timeoutMs:26000}]){try{search=await searchBuyers({focus,...attempt});break}catch(error){failures.push(safeError(error?.message||error));if([401,403].includes(error?.status))return Response.json({error:failures.at(-1),hint:'Groq API 키 권한을 확인하세요.'},{status:502});if(error?.status===429)return Response.json({error:failures.at(-1),hint:`Groq 검색 한도입니다. ${error.retryAfter||'잠시'} 후 다시 실행하세요.`,phase:'search',rate:error.rate||null},{status:429})}}
  if(!search)return Response.json({error:`웹검색에 실패했습니다. ${failures.join(' | ')}`,hint:'잠시 후 다시 실행하세요.'},{status:502});
  try{const structured=await structureEvidence({evidence:search.evidence,focus});const leads=(Array.isArray(structured.data?.leads)?structured.data.leads:[]).map(sanitizeLead).filter(l=>l.company&&/^https?:\/\//i.test(l.url)&&l.source_urls.length).slice(0,3).sort((a,b)=>b.fit_score-a.fit_score).map((l,i)=>({...l,rank:i+1}));if(!leads.length)return Response.json({error:'검색은 성공했지만 검증 가능한 후보가 없었습니다.',hint:'조건을 조금 넓혀 다시 실행하세요.'},{status:422});return Response.json({leads,strategy:{best_segment:'',pitch:'',next_action:clean(structured.data?.next_action,400)},meta:{search:search.meta,structure_model:structured.model,structure_usage:structured.usage,returned_count:leads.length,pipeline:'web-search -> strict-structure'}},{headers:{'Cache-Control':'no-store'}})}catch(error){return Response.json({error:safeError(error?.message||error),hint:'웹검색은 성공했지만 구조화 단계에서 실패했습니다.',phase:'structure',rate:error?.rate||null},{status:error?.status===429?429:502})}
}
