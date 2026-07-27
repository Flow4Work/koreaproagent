const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const STRUCTURE_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'];

function clean(value, max = 1800) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function safeError(value = '') { return String(value).replace(/gsk_[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 700); }
function validUrls(values, limit = 8) { return Array.isArray(values) ? values.map(String).filter((v) => /^https?:\/\//i.test(v)).slice(0, limit) : []; }
function normalizeUrl(value) { try { const raw = clean(value, 500); const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); return ['http:','https:'].includes(url.protocol) ? url.toString() : null; } catch { return null; } }
function rateInfo(response) { return { remaining_requests: response.headers.get('x-ratelimit-remaining-requests'), remaining_tokens: response.headers.get('x-ratelimit-remaining-tokens'), retry_after: response.headers.get('retry-after') }; }

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); const started = Date.now();
  try { const response = await fetch(url, { ...options, signal: controller.signal }); return { response, durationMs: Date.now() - started }; }
  catch (error) { if (error?.name === 'AbortError') { const e = new Error(`Groq research timed out after ${Math.round(timeoutMs/1000)}s`); e.status = 504; throw e; } throw error; }
  finally { clearTimeout(timer); }
}

function evidenceFromPayload(payload) {
  const message = payload?.choices?.[0]?.message || {}; const parts = [];
  if (message.content) parts.push(String(message.content));
  if (Array.isArray(message.executed_tools)) for (const tool of message.executed_tools) { if (tool?.arguments) parts.push(`TOOL ARGUMENTS:\n${String(tool.arguments)}`); if (tool?.output) parts.push(`TOOL OUTPUT:\n${String(tool.output)}`); }
  return parts.join('\n\n').slice(0, 18000);
}

async function researchKorea({ clientUrl, productHint, targetNotes, seeds, model, version, timeoutMs }) {
  const prompt = `Research the current public web to prepare a Korea sales prospect pack for this SaaS.\n\nCLIENT: ${clientUrl}\nPRODUCT HINT: ${productHint || 'Infer from public information.'}\nKOREA TARGET NOTES: ${targetNotes || 'Choose the strongest Korean B2B ICP.'}\nOPTIONAL SEEDS: ${seeds || 'None.'}\n\nCollect evidence for the client product and up to 5 real Korean companies that plausibly need it. Prefer concrete recent signals: hiring, expansion, launches, partnerships, support load, regulation, technology changes, or investment. Include official company URLs and public source URLs. Do not invent people, events, dates, or URLs. Plain-text research notes are fine; do not format as JSON.`;
  const { response, durationMs } = await fetchWithTimeout(GROQ_CHAT_URL, {
    method:'POST', headers:{ Authorization:`Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type':'application/json', 'Groq-Model-Version':version },
    body:JSON.stringify({ model, messages:[{role:'system',content:'You are an evidence-first Korea B2B researcher. Use current web evidence and real URLs only.'},{role:'user',content:prompt}], temperature:0, compound_custom:{tools:{enabled_tools:['web_search']}} })
  }, timeoutMs);
  const raw = await response.text();
  if (!response.ok) { let detail=raw; try{detail=JSON.parse(raw)?.error?.message||raw}catch{} const e=new Error(`Groq research HTTP ${response.status}: ${safeError(detail)}`); e.status=response.status; e.retryAfter=response.headers.get('retry-after'); e.rate=rateInfo(response); throw e; }
  const payload=JSON.parse(raw); const evidence=evidenceFromPayload(payload); if(!evidence.trim())throw new Error('Groq research returned no usable evidence');
  return { evidence, meta:{ model, version, duration_ms:durationMs, tool_calls:Array.isArray(payload?.choices?.[0]?.message?.executed_tools)?payload.choices[0].message.executed_tools.length:0, usage:payload?.usage||null, rate:rateInfo(response) } };
}

const prospectSchema={
  type:'object',
  properties:{
    client:{type:'object',properties:{name:{type:'string'},url:{type:'string'},product:{type:'string'},korea_value_proposition:{type:'string'}},required:['name','url','product','korea_value_proposition'],additionalProperties:false},
    icp:{type:'object',properties:{summary:{type:'string'},industries:{type:'array',items:{type:'string'}},company_signals:{type:'array',items:{type:'string'}},buyer_roles:{type:'array',items:{type:'string'}}},required:['summary','industries','company_signals','buyer_roles'],additionalProperties:false},
    prospects:{type:'array',items:{type:'object',properties:{company:{type:'string'},url:{type:'string'},industry:{type:'string'},fit_score:{type:'integer'},why_fit:{type:'string'},buying_signal:{type:'string'},signal_date:{type:'string'},source_urls:{type:'array',items:{type:'string'}},contact_name:{type:'string'},contact_title:{type:'string'},contact_profile_url:{type:'string'},recommended_role:{type:'string'},contact_search_query:{type:'string'},sales_angle:{type:'string'},message_ko:{type:'string'},message_en:{type:'string'},confidence:{type:'string',enum:['high','medium','low']},warning:{type:'string'}},required:['company','url','industry','fit_score','why_fit','buying_signal','signal_date','source_urls','contact_name','contact_title','contact_profile_url','recommended_role','contact_search_query','sales_angle','message_ko','message_en','confidence','warning'],additionalProperties:false}},
    strategy:{type:'object',properties:{first_segment:{type:'string'},core_offer:{type:'string'},next_action:{type:'string'}},required:['first_segment','core_offer','next_action'],additionalProperties:false}
  },
  required:['client','icp','prospects','strategy'], additionalProperties:false
};

async function structureResearch({ evidence, clientUrl, productHint, targetNotes, count }) {
  const prompt=`아래 실시간 웹 리서치만 근거로 Korea Prospect Pack을 만든다.\n\n고객 URL: ${clientUrl}\n제품 힌트: ${productHint||'없음'}\n한국 타깃 조건: ${targetNotes||'없음'}\n최대 후보 수: ${count}\n\n규칙:\n- 모든 설명은 한국어. 회사명/URL/영문 메시지만 원문 허용.\n- 한국 후보는 WEB EVIDENCE에 실제 회사와 URL 또는 근거가 있는 경우만 넣는다.\n- source_urls는 아래 텍스트에 실제로 등장한 URL만 그대로 사용한다.\n- 최근 신호가 확인되지 않으면 buying_signal에 '현재 공개 근거 부족'이라고 적고 점수를 낮춘다.\n- contact_name/title/profile은 공개 근거가 있을 때만 채우고, 아니면 빈 문자열 + recommended_role/contact_search_query를 제공한다. 이메일은 만들지 않는다.\n- fit_score는 사용처 40 + 현재 신호 30 + 담당자 접근성 20 + 근거 10. 근거 URL이 하나뿐이면 70점 초과 금지.\n- message_ko/message_en은 실제 해당 한국 기업에 보낼 짧은 B2B 접근문이다. 근거 밖 내용을 넣지 않는다.\n- 찾지 못한 값은 빈 문자열로 둔다.\n\nWEB EVIDENCE:\n${evidence.slice(0,18000)}`;
  const failures=[];
  for(const model of STRUCTURE_MODELS){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{const response=await fetch(GROQ_CHAT_URL,{method:'POST',headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:'웹 근거를 정확한 한국 B2B 영업 데이터로 구조화한다. 근거 밖 사실을 만들지 않는다.'},{role:'user',content:prompt}],temperature:0,reasoning_effort:'low',response_format:{type:'json_schema',json_schema:{name:'korea_prospect_pack',strict:true,schema:prospectSchema}}}),signal:controller.signal});const raw=await response.text();if(!response.ok){let detail=raw;try{detail=JSON.parse(raw)?.error?.message||raw}catch{}const e=new Error(`Groq structure HTTP ${response.status}: ${safeError(detail)}`);e.status=response.status;throw e;}const payload=JSON.parse(raw),content=payload?.choices?.[0]?.message?.content;if(!content)throw new Error('Groq structure returned empty content');return{data:JSON.parse(content),model,usage:payload?.usage||null};}catch(error){failures.push(error?.name==='AbortError'?`${model} structure timeout`:safeError(error?.message||error));if(error?.status===429)throw error;}finally{clearTimeout(timer)}}throw new Error(`Structured output failed: ${failures.join(' | ')}`);
}

function sanitizeResult(data, clientUrl, count, meta) {
  const prospects=(Array.isArray(data?.prospects)?data.prospects:[]).slice(0,count).map((p,idx)=>{const source_urls=validUrls(p?.source_urls);let score=Math.max(0,Math.min(100,Number.parseInt(p?.fit_score,10)||0));if(source_urls.length===0)score=Math.min(score,40);if(source_urls.length===1)score=Math.min(score,70);return{rank:idx+1,company:clean(p?.company,120),url:clean(p?.url,350),industry:clean(p?.industry,100),fit_score:score,why_fit:clean(p?.why_fit,600),buying_signal:clean(p?.buying_signal,500),signal_date:clean(p?.signal_date,60),source_urls,contact_name:clean(p?.contact_name,120),contact_title:clean(p?.contact_title,120),contact_profile_url:clean(p?.contact_profile_url,400),recommended_role:clean(p?.recommended_role,120),contact_search_query:clean(p?.contact_search_query,280),sales_angle:clean(p?.sales_angle,500),message_ko:clean(p?.message_ko,1000),message_en:clean(p?.message_en,1000),confidence:['high','medium','low'].includes(p?.confidence)?p.confidence:'medium',warning:clean(p?.warning,350)}}).filter(p=>p.company&&/^https?:\/\//i.test(p.url)&&p.source_urls.length).sort((a,b)=>b.fit_score-a.fit_score).map((p,idx)=>({...p,rank:idx+1}));
  return{generated_at:new Date().toISOString(),client:{name:clean(data?.client?.name,120),url:clean(data?.client?.url,350)||clientUrl,product:clean(data?.client?.product,700),korea_value_proposition:clean(data?.client?.korea_value_proposition,700)},icp:{summary:clean(data?.icp?.summary,800),industries:Array.isArray(data?.icp?.industries)?data.icp.industries.map(x=>clean(String(x),80)).filter(Boolean).slice(0,8):[],company_signals:Array.isArray(data?.icp?.company_signals)?data.icp.company_signals.map(x=>clean(String(x),160)).filter(Boolean).slice(0,10):[],buyer_roles:Array.isArray(data?.icp?.buyer_roles)?data.icp.buyer_roles.map(x=>clean(String(x),100)).filter(Boolean).slice(0,8):[]},prospects,strategy:{first_segment:clean(data?.strategy?.first_segment,400),core_offer:clean(data?.strategy?.core_offer,500),next_action:clean(data?.strategy?.next_action,500)},meta};
}

export async function POST(request){
  if(!process.env.GROQ_API_KEY)return Response.json({error:'GROQ_API_KEY가 Vercel 환경변수에 없습니다.'},{status:503});
  let body={};try{body=await request.json()}catch{return Response.json({error:'요청 형식이 잘못됐습니다.'},{status:400})}
  const clientUrl=normalizeUrl(body.clientUrl);if(!clientUrl)return Response.json({error:'고객 SaaS URL을 확인하세요.'},{status:400});
  const productHint=clean(body.productHint,1400),targetNotes=clean(body.targetNotes,1600),seeds=clean(body.seeds,2500),count=Math.max(3,Math.min(5,Number.parseInt(body.count,10)||5));
  const attempts=[{model:'groq/compound',version:'2025-08-16',timeoutMs:58000},{model:'groq/compound-mini',version:'2025-07-23',timeoutMs:30000}];let research=null;const failures=[];
  for(const attempt of attempts){try{research=await researchKorea({clientUrl,productHint,targetNotes,seeds,...attempt});break}catch(error){failures.push(safeError(error?.message||error));if([401,403].includes(error?.status))return Response.json({error:failures.at(-1),hint:'Groq API 키 권한을 확인하세요.'},{status:502});if(error?.status===429)return Response.json({error:failures.at(-1),hint:`Groq 사용량 제한입니다. ${error.retryAfter||'잠시'} 후 다시 실행하세요.`,rate:error.rate||null},{status:429})}}
  if(!research)return Response.json({error:`웹 리서치에 실패했습니다. ${failures.join(' | ')}`,hint:'잠시 후 다시 실행하세요.'},{status:502});
  try{const structured=await structureResearch({evidence:research.evidence,clientUrl,productHint,targetNotes,count});const result=sanitizeResult(structured.data,clientUrl,count,{research:research.meta,structure_model:structured.model,structure_usage:structured.usage,pipeline:'web-research -> strict-structure'});if(!result.prospects.length)return Response.json({error:'리서치는 성공했지만 근거가 있는 한국 후보를 찾지 못했습니다.',hint:'타깃 조건을 조금 넓혀 다시 실행하세요.'},{status:422});return Response.json(result,{headers:{'Cache-Control':'no-store'}});}catch(error){return Response.json({error:safeError(error?.message||error),hint:'웹 리서치는 성공했지만 결과 구조화에 실패했습니다.'},{status:error?.status===429?429:502});}
}
