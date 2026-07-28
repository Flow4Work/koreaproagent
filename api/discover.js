import { tavilyConfigured, tavilySearchMany, formatEvidence } from '../lib/web-search.js';
import { AI_MODEL, AI_PROVIDER, aiConfigured, chatJson } from '../lib/ai-provider.js';

const DISCOVERY_EXCLUDES=['instagram.com','facebook.com','x.com','twitter.com','youtube.com','reddit.com','pinterest.com','medium.com','crunchbase.com','glassdoor.com','quora.com','wikipedia.org','g2.com','capterra.com'];
const COMPANY_URL_BLOCKLIST=[...DISCOVERY_EXCLUDES,'linkedin.com','techcrunch.com','reuters.com','prnewswire.com','businesswire.com','forbes.com','bloomberg.com','yahoo.com'];
const MATURE_COMPANIES=['microsoft','google','amazon','aws','oracle','salesforce','adobe','sap','servicenow','workday','shopify','atlassian','zoom','slack','notion','hubspot','intercom','stripe','adyen','nuvei','airwallex','dlocal','twilio','cloudflare','datadog','snowflake','mongodb','gitlab','github','elastic','databricks','canva','fiverr','rippling','brex','plaid','monday.com','openai','anthropic','cohere','gainsight'];
const DISCOVERY_TOPICS=['developer tools API observability data infrastructure B2B SaaS','cybersecurity identity compliance B2B SaaS','AI workflow customer support automation B2B SaaS','fintech treasury expense finance operations B2B software','sales revenue intelligence CRM B2B SaaS','HR recruiting workforce operations B2B SaaS','logistics procurement supply chain B2B software','FinOps DevOps cloud automation SaaS','retail commerce operations B2B SaaS','marketing customer data automation B2B SaaS','hospitality travel property management B2B SaaS','legal contract RegTech B2B SaaS'];
const TRIGGER=/(series\s+[abc]|seed|funding|raised|raises|investment|expand|expansion|launch|hiring|hire|sales|partnership|international|apac|asia|japan|singapore|australia|hong kong|taiwan|go-to-market|gtm)/i;
const ASIA_SIGNAL=/(apac|asia|japan|singapore|australia|hong kong|taiwan|southeast asia)/i;
const GTM_SIGNAL=/(sales|partnership|partner|channel|hiring|hire|launch|go-to-market|gtm|expansion|expand|international|market entry)/i;
const SOFTWARE_SIGNAL=/(saas|software|platform|workflow|automation|analytics|crm|api|developer|cybersecurity|fintech|martech|hrtech|cloud|b2b|enterprise)/i;
const MATURE_SIGNAL=/(nasdaq|nyse|publicly traded|listed company|more than 1,000 employees|over 1,000 employees|more than 1000 employees|over 1000 employees)/i;

function clean(v,max=1400){return typeof v==='string'?v.trim().slice(0,max):''}
function safeError(v=''){return String(v).replace(/tvly-[A-Za-z0-9_-]+/g,'[redacted]').replace(/[A-Za-z0-9_-]{32,}/g,'[key]').slice(0,700)}
function hostname(v=''){try{return new URL(v).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
function rootHost(v=''){const h=hostname(v),p=h.split('.');return p.length>2?p.slice(-2).join('.'):h}
function token(v=''){return String(v).toLowerCase().replace(/[^a-z0-9]/g,'')}
function escapeRegExp(v=''){return String(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function matureCompany(company=''){const c=token(company);return MATURE_COMPANIES.some(x=>c===token(x)||c.startsWith(token(x)))}
function excludedCompany(company='',excludes=[]){const c=token(company);return Boolean(c)&&excludes.some(x=>{const e=token(x);return e&&(c===e||c.startsWith(e)||e.startsWith(c))})}
function blockedCompanyUrl(url){const h=rootHost(url);return !h||COMPANY_URL_BLOCKLIST.some(x=>h===x||h.endsWith(`.${x}`))}
function looksLikeCompanyHost(url,company){if(!url||blockedCompanyUrl(url))return false;const h=token(rootHost(url).split('.')[0]),c=token(company);return h.length>=2&&c.length>=2&&(c.includes(h)||h.includes(c.slice(0,Math.min(c.length,10))))}
function explicitKoreaPresence(text=''){const s=String(text).toLowerCase();return[/korea\s+(office|team|country manager|general manager|head|sales team|subsidiary|operations|entity)/,/(office|team|subsidiary|operations|entity)\s+(in|for)\s+(south\s+)?korea/,/seoul\s+(office|team|hub|based|role|roles|jobs|location)/,/(country manager|head of|general manager)[^.!?]{0,50}(korea|seoul)/,/(korea|korean)[^.!?]{0,60}(subsidiary|entity|office|team|country manager|sales team)/].some(r=>r.test(s))}
function hashSeed(v=''){let h=0;for(const c of String(v))h=(h*31+c.charCodeAt(0))>>>0;return h}
function pickTopics(seed,count=4){const out=[];for(let i=0;i<count;i++)out.push(DISCOVERY_TOPICS[(seed+i*5)%DISCOVERY_TOPICS.length]);return[...new Set(out)]}
function companyEvidence(company,sources=[]){const p=new RegExp(escapeRegExp(company),'i');return sources.filter(r=>{const t=`${r?.title||''} ${r?.content||''}`;return p.test(t)&&TRIGGER.test(t)}).slice(0,5)}
function recentBonus(date=''){const t=Date.parse(date);if(!Number.isFinite(t))return 0;const days=(Date.now()-t)/86400000;if(days<=90)return 8;if(days<=180)return 5;if(days<=365)return 2;return 0}
function scoreLead(candidate,evidence,verifyRows){const discoveryText=evidence.map(r=>`${r.title} ${r.content}`).join(' ');const verifyText=verifyRows.map(r=>`${r.title} ${r.content}`).join(' ');const fit=Math.round(Math.max(0,Math.min(100,Number(candidate?.fit_score)||0))*.3);const timing=Math.min(30,(GTM_SIGNAL.test(discoveryText)?20:0)+(ASIA_SIGNAL.test(discoveryText)?6:0)+recentBonus(candidate?.trigger_date));const evidenceScore=Math.min(20,evidence.length*5+(verifyRows.length?5:0));const koreaGap=explicitKoreaPresence(verifyText)?0:20;return{fit,timing,evidence:evidenceScore,korea_gap:koreaGap,total:Math.min(100,fit+timing+evidenceScore+koreaGap)}}

async function discoverEvidence(focus,variant){const seed=hashSeed(variant||new Date().toISOString().slice(0,13));const base=clean(focus,500);const topics=base?[base,...pickTopics(seed,3)]:pickTopics(seed,4);const suffixes=['APAC Japan Singapore expansion sales hiring partnership B2B SaaS 2026','Asia market entry go-to-market hiring partnership Series A Series B 2026','Japan Singapore expansion channel partnerships enterprise software 2026','APAC international sales launch hiring venture-backed SaaS 2026'];const queries=topics.map((t,i)=>`${t} ${suffixes[i%suffixes.length]}`);const r=await tavilySearchMany(queries,{maxResults:12,timeRange:'year',excludeDomains:DISCOVERY_EXCLUDES,topic:'general'});const sources=r.results.slice(0,44);if(!sources.length)throw new Error('최근 해외 확장 신호를 찾지 못했습니다.');return{sources,evidence:formatEvidence(sources,44,15000),meta:{...r.meta,themes:topics,search_results:sources.length}}}

async function shortlist(evidence,focus,excludeCompanies){const excluded=excludeCompanies.length?excludeCompanies.slice(0,100).join(', '):'없음';const prompt=`SOURCE만 사용해 한국 시장 테스트/아웃바운드 서비스를 제안할 해외 B2B 소프트웨어 회사를 최대 14곳 고른다.

우리 ICP:
- 직원 수가 대략 20~1000명인 성장 단계 B2B SaaS/enterprise software/API 우선
- Seed~Series C 또는 성장 단계 우선
- 최근 12개월 내 APAC/Asia/Japan/Singapore/Australia 확장 신호가 직접 확인됨
- 단순 투자 뉴스가 아니라 sales hiring, partnership, channel, launch, market entry, international GTM 같은 실행 신호가 있어야 함
- 한국 현지 영업조직이 이미 자리 잡은 회사와 글로벌 대형 incumbent는 제외
- 소비자 앱, 미디어, 게임, 하드웨어, 연구소, 컨설팅, 채용대행 제외
- 최근/제외 회사: ${excluded}
- 사용자 조건: ${clean(focus,500)||'없음'}

품질 규칙:
1. 회사명과 신호가 SOURCE에 직접 있어야 한다.
2. product_summary와 trigger_summary는 한국어로, 회사명/제품명은 원문 유지.
3. trigger_summary는 '왜 지금 연락해야 하는가'를 구체적 사건 1개로 쓴다.
4. 투자만 있는 후보는 넣지 않는다. 아시아 확장 실행 신호와 결합돼야 한다.
5. fit_score는 우리 Korea market-test 서비스 적합도를 0~100으로 평가한다.
6. maturity_risk는 이미 자체 글로벌 GTM 조직이 충분해 외부 소형 파일럿 필요성이 낮을 위험을 0~100으로 평가한다. 60 이상이면 원칙적으로 제외한다.
7. source_urls는 해당 회사를 직접 언급한 SOURCE URL만.
8. recommended_role은 Head/VP/Director of Sales, BD, Partnerships, APAC, International, Growth 또는 Founder/CEO 중 실제 구매 가능성이 높은 영문 직책.
9. 애매하면 채우지 않는다.

JSON만 반환:
{"candidates":[{"company":"","official_url_hint":"","product_summary":"","trigger_summary":"","trigger_date":"","trigger_type":"sales_hiring|partnership|market_entry|launch|expansion|funding_plus_gtm|other","source_urls":[],"recommended_role":"","fit_score":0,"maturity_risk":0}]}

${evidence}`;const s=await chatJson({prompt,maxTokens:1900,timeoutMs:35000,temperature:0});const rows=Array.isArray(s.data?.candidates)?s.data.candidates:[];return{candidates:rows.filter(c=>(Number(c?.fit_score)||0)>=55&&(Number(c?.maturity_risk)||0)<60).sort((a,b)=>(Number(b.fit_score)||0)-(Number(a.fit_score)||0)).slice(0,10),usage:s.usage||null,model:s.model||AI_MODEL}}

async function verifyBatch(candidates,discoverySources){const queries=candidates.map(c=>`"${clean(c.company,120)}" official website SaaS software APAC Japan Singapore Korea Seoul office team sales partnerships 2026`);const verification=await tavilySearchMany(queries,{maxResults:7,timeRange:null,excludeDomains:DISCOVERY_EXCLUDES,topic:'general'});const rows=verification.results||[];const leads=[];for(const candidate of candidates){const company=clean(candidate?.company,120);if(!company||matureCompany(company))continue;const evidence=companyEvidence(company,discoverySources);if(!evidence.length)continue;const discoveryText=evidence.map(r=>`${r.title} ${r.content}`).join(' ');if(!ASIA_SIGNAL.test(discoveryText)||!GTM_SIGNAL.test(discoveryText))continue;const pattern=new RegExp(escapeRegExp(company),'i');const verifyRows=rows.filter(r=>pattern.test(`${r.title} ${r.content}`)).slice(0,7);if(!verifyRows.length)continue;const verifyText=verifyRows.map(r=>`${r.title} ${r.content}`).join(' ');if(MATURE_SIGNAL.test(verifyText)||explicitKoreaPresence(verifyText))continue;const official=looksLikeCompanyHost(candidate?.official_url_hint,company)?`https://${rootHost(candidate.official_url_hint)}/`:(()=>{const hit=verifyRows.find(r=>looksLikeCompanyHost(r.url,company));return hit?`https://${rootHost(hit.url)}/`:''})();if(!official)continue;const fullText=`${discoveryText} ${verifyText}`;if(!SOFTWARE_SIGNAL.test(fullText))continue;const score=scoreLead(candidate,evidence,verifyRows);if(score.total<72)continue;leads.push({company,url:official,priority_score:score.total,score_breakdown:score,product_summary:clean(candidate.product_summary,320)||'B2B 소프트웨어',signal_title:clean(candidate.trigger_summary,260)||'최근 아시아 GTM 실행 신호가 확인됐습니다.',signal_date:clean(candidate.trigger_date,60),signal_type:clean(candidate.trigger_type,60),why_now:clean(candidate.trigger_summary,260),korea_gap:'최근 공개 자료 기준 한국 로컬 영업조직이 이미 자리 잡았다는 근거는 확인되지 않았습니다.',korea_opportunity:'현지 채용 전에 한국 잠재고객과 구매 담당자 반응을 작은 파일럿으로 검증하기 좋은 단계입니다.',evidence:evidence.map(r=>({title:clean(r.title,220),url:clean(r.url,500),date:clean(r.published_date,60)})),recommended_role:clean(candidate.recommended_role,100)||'Head of Sales',contact:null,contact_status:'pending'})}return{leads,meta:verification.meta}}

export async function POST(request){if(!aiConfigured())return Response.json({error:'AI 설정이 필요합니다.'},{status:503});if(!tavilyConfigured())return Response.json({error:'검색 엔진 설정이 필요합니다.'},{status:503});let body={};try{body=await request.json()}catch{return Response.json({error:'요청 형식이 잘못됐습니다.'},{status:400})}const focus=clean(body.focus,600);const variant=clean(body.searchVariant,120);const excludeCompanies=Array.isArray(body.excludeCompanies)?body.excludeCompanies.map(x=>clean(String(x),120)).filter(Boolean).slice(0,120):[];try{const discovery=await discoverEvidence(focus,variant);const short=await shortlist(discovery.evidence,focus,excludeCompanies);const candidates=short.candidates.filter(c=>!excludedCompany(c?.company,excludeCompanies));const verified=await verifyBatch(candidates,discovery.sources);const leads=verified.leads.filter((x,i,a)=>a.findIndex(y=>token(y.company)===token(x.company))===i).sort((a,b)=>b.priority_score-a.priority_score).slice(0,8).map((x,i)=>({...x,rank:i+1}));return Response.json({leads,strategy:{next_action:'후보를 먼저 보여주고 연락처와 한국 테스트 계정은 화면에서 병렬 보강합니다.'},meta:{search:discovery.meta,verification:verified.meta,ai_provider:AI_PROVIDER,structure_model:short.model||AI_MODEL,structure_usage:short.usage,considered:candidates.length,verified:leads.length,returned_count:leads.length,excluded_recent_count:excludeCompanies.length,pipeline:'병렬 신호 검색 → AI ICP 정리 → 병렬 일괄 검증 → 후보 즉시 표시 → 연락처/한국 계정 점진 보강'}},{headers:{'Cache-Control':'no-store'}})}catch(e){return Response.json({error:safeError(e?.message||e),hint:e?.status===429?'검색/AI 사용량 제한입니다. 잠시 후 다시 실행하세요.':'후보 발굴 과정에서 오류가 발생했습니다.'},{status:e?.status||502})}}