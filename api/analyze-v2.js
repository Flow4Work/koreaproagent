import { tavilyConfigured, tavilySearchMany, formatEvidence } from '../lib/web-search.js';
import { AI_MODEL, AI_PROVIDER, aiConfigured, chatJson } from '../lib/ai-provider.js';

const GENERIC_GIANTS=['samsung','naver','kakao','coupang','lotte','hyundai','sk telecom','kt','lg electronics','lg uplus','posco','hanwha','shinhan','kb financial','woori','hana financial','ncsoft','netmarble'];
const BUYING_TRIGGER=/(hiring|hire|채용|expansion|expand|확장|launch|출시|partnership|파트너|investment|투자|funding|raised|도입|adopt|migration|전환|compliance|규제|automation|자동화|digital transformation|디지털 전환|new office|신사업|restructur|개편|system|시스템)/i;

function clean(v,max=1600){return typeof v==='string'?v.trim().slice(0,max):''}
function safeError(v=''){return String(v).replace(/tvly-[A-Za-z0-9_-]+/g,'[redacted]').replace(/[A-Za-z0-9_-]{32,}/g,'[key]').slice(0,700)}
function normalizeUrl(v){try{const raw=clean(v,500);const u=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`);return['http:','https:'].includes(u.protocol)?u.toString():null}catch{return null}}
function host(v){try{return new URL(v).hostname.replace(/^www\./,'')}catch{return clean(v,120)}}
function token(v=''){return String(v).toLowerCase().replace(/[^a-z0-9가-힣]/g,'')}
function isGenericGiant(company=''){const c=token(company);return GENERIC_GIANTS.some(x=>c===token(x)||c.startsWith(token(x)))}
function sourceRowsForCompany(names,sources){const needles=(Array.isArray(names)?names:[names]).filter(Boolean).map(v=>String(v).toLowerCase());if(!needles.length)return[];return sources.filter(s=>needles.some(n=>`${s.title} ${s.content}`.toLowerCase().includes(n)))}
function hasBuyingTrigger(rows=[]){return rows.some(r=>BUYING_TRIGGER.test(`${r.title} ${r.content}`))}

async function researchKorea({clientUrl,productHint,targetNotes}){const domain=host(clientUrl);const product=clean(productHint,700)||domain;const target=clean(targetNotes,900)||'이 제품을 실제로 구매할 한국 B2B 기업';const queries=[`site:${domain} ${product} product customers use cases`,`"${product}" 한국 B2B 2026 채용 확장 도입 전환 자동화`,`${target} 한국 기업 2026 채용 확장 신사업 시스템 도입`,`${product} Korea companies hiring expansion migration compliance 2026`];const r=await tavilySearchMany(queries,{maxResults:8,timeRange:'year',excludeDomains:['instagram.com','facebook.com','x.com','twitter.com','youtube.com','reddit.com','pinterest.com','wikipedia.org'],topic:'general'});const sources=r.results.slice(0,26);if(!sources.length)throw new Error('한국 잠재고객 근거를 찾지 못했습니다.');return{evidence:formatEvidence(sources,26,11500),sources,meta:{...r.meta,search_results:sources.length}}}

async function structureResearch({evidence,clientUrl,productHint,targetNotes}){const prompt=`SOURCE만 사용해서 ${clientUrl} 제품이 지금 실제로 공략할 가치가 있는 한국 B2B 기업을 최대 5곳 고른다.

제품 설명: ${clean(productHint,700)||'SOURCE의 공식 제품 설명을 확인'}
타깃 조건: ${clean(targetNotes,900)||'제품 사용처와 공개 구매 신호가 동시에 맞는 한국 기업'}

핵심 원칙:
- 유명해서 고르는 것은 금지. Samsung/Naver/Kakao/Coupang/Lotte/Hyundai/SK/LG를 습관적으로 넣지 않는다.
- 각 후보는 SOURCE 안에 회사명이 직접 나오고 최근 12개월 내 채용·확장·신사업·도입·전환·규제·파트너십 같은 '왜 지금 살 수 있는지' 신호가 있어야 한다.
- 제품 기능과 구매 신호의 연결이 구체적이어야 한다. '대기업이라 필요할 것' 같은 설명은 0점이다.
- 중견/성장 기업 중 실제 접근 가능한 계정을 우선한다. 대기업은 직접 근거 2개 이상 + fit_score 88 이상일 때만 후보로 허용한다.
- 5개를 채우지 않는다. 강한 후보가 2개면 2개만 반환한다.
- 담당자 이름/이메일은 만들지 않는다. 실제 접근할 직책만 추천한다.
- 화면 표시 필드는 한국어, 메일용 *_en 필드는 영어로 분리한다.
- fit_score = 제품 적합 35 + 현재 구매신호 35 + 접근 가능성 15 + 근거 명확성 15.

JSON만 반환:
{"prospects":[{"company":"","company_en":"","url":"","industry":"","fit_score":0,"why_fit":"한국어","buying_signal":"한국어","buying_signal_en":"English","signal_date":"","source_urls":[],"recommended_role":"한국어","recommended_role_en":"English","sales_angle":"한국어","problem_match":"제품 기능과 현재 문제의 구체적 연결"}]}

${evidence}`;const s=await chatJson({prompt,maxTokens:1900,timeoutMs:35000,temperature:0});return{data:s.data,usage:s.usage||null,model:s.model||AI_MODEL}}

function sanitize(data,sources){const raw=Array.isArray(data?.prospects)?data.prospects:[];const normalized=raw.map(p=>{const company=clean(p?.company,120),companyEn=clean(p?.company_en,140);const directRows=sourceRowsForCompany([company,companyEn],sources);const directUrls=directRows.map(r=>r.url);const requested=Array.isArray(p?.source_urls)?p.source_urls.map(String):[];const source_urls=requested.filter(u=>directUrls.includes(u)).slice(0,3);const finalUrls=source_urls.length?source_urls:directUrls.slice(0,2);let score=Math.max(0,Math.min(100,Number.parseInt(p?.fit_score,10)||0));if(!directRows.length||!hasBuyingTrigger(directRows)||!clean(p?.why_fit,420)||!clean(p?.buying_signal,420)||!clean(p?.problem_match,420))score=0;if(isGenericGiant(company)&&(directRows.length<2||score<88))score=0;return{company,company_en:companyEn||company,url:clean(p?.url,350),industry:clean(p?.industry,120),fit_score:score,why_fit:clean(p?.why_fit,420),buying_signal:clean(p?.buying_signal,420),buying_signal_en:clean(p?.buying_signal_en,420),signal_date:clean(p?.signal_date,60),source_urls:finalUrls,recommended_role:clean(p?.recommended_role,120),recommended_role_en:clean(p?.recommended_role_en,120)||'Business leader',sales_angle:clean(p?.sales_angle,420),problem_match:clean(p?.problem_match,420),is_giant:isGenericGiant(company)}}).filter(p=>p.company&&p.fit_score>=72&&p.source_urls.length).sort((a,b)=>b.fit_score-a.fit_score);const selected=[];let giants=0;for(const p of normalized){if(p.is_giant&&giants>=1)continue;if(p.is_giant)giants+=1;selected.push(p);if(selected.length>=3)break}return selected.map((p,i)=>({...p,rank:i+1}))}

export async function POST(request){if(!aiConfigured())return Response.json({error:'AI 설정이 필요합니다.'},{status:503});if(!tavilyConfigured())return Response.json({error:'검색 엔진 설정이 필요합니다.'},{status:503});let body={};try{body=await request.json()}catch{return Response.json({error:'요청 형식이 잘못됐습니다.'},{status:400})}const clientUrl=normalizeUrl(body.clientUrl);if(!clientUrl)return Response.json({error:'고객 SaaS URL을 확인하세요.'},{status:400});const productHint=clean(body.productHint,900),targetNotes=clean(body.targetNotes,1200);try{const research=await researchKorea({clientUrl,productHint,targetNotes});const structured=await structureResearch({evidence:research.evidence,clientUrl,productHint,targetNotes});const prospects=sanitize(structured.data,research.sources);if(!prospects.length)return Response.json({error:'이번 검색에서는 제품 적합성과 현재 구매신호를 동시에 만족한 한국 계정이 없었습니다.',phase:'quality_gate',meta:{search_results:research.sources.length}},{status:422});return Response.json({prospects,meta:{research:research.meta,ai_provider:AI_PROVIDER,model:structured.model||AI_MODEL,rule:'direct evidence + concrete product/problem match + current trigger + fit >= 72'}},{headers:{'Cache-Control':'no-store'}})}catch(e){return Response.json({error:safeError(e?.message||e),hint:e?.status===429?'AI 사용량 제한입니다. 잠시 후 다시 실행하세요.':'한국 잠재고객 검증 과정에서 오류가 발생했습니다.'},{status:e?.status||502})}}