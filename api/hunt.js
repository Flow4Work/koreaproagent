import { tavilyConfigured, tavilySearch, tavilySearchMany } from '../lib/web-search.js';

const ALWAYS_BLOCKED = [
  'instagram.com','facebook.com','x.com','twitter.com','youtube.com','reddit.com','pinterest.com','linkedin.com',
  'wikipedia.org','medium.com','tiktok.com','threads.net'
];

const SOURCE_ONLY = [
  'techcrunch.com','reuters.com','bloomberg.com','forbes.com','yahoo.com','prnewswire.com','businesswire.com',
  'coindesk.com','cointelegraph.com','blockmedia.co.kr','tokenpost.kr','zdnet.co.kr','etnews.com','platum.kr',
  'venturesquare.net','besuccess.com','startuprecipe.co.kr','eventbrite.com','meetup.com','festa.io','onoffmix.com',
  'event-us.kr','icoanalytics.org','coinmarketcap.com','coingecko.com','newsis.com','yna.co.kr','mk.co.kr','hankyung.com',
  'cryptorank.io','coinpedia.org','iq.wiki','ninjapromo.io','fintechnews.hk','gfma.org'
];

const KBW_SEEDS = ['GRVT','MagicBlock','Real Finance','Kaia','Dunamu Upbit','Bithumb','Coinone','Korbit','Hashed','WEMIX'];

const CAMPAIGNS = {
  kbw: {
    label: 'KBW 단체복', market: 'global-to-korea',
    queries: ['Korea Blockchain Week 2026 Seoul sponsor side event meetup host project','2026 crypto TGE mainnet launch Asia Seoul community event sponsor'],
    exaQuery: 'Crypto companies or projects actively preparing a Seoul event, side event, meetup, sponsorship, TGE, token launch, or mainnet launch around Korea Blockchain Week 2026',
    signal: /(kbw|korea blockchain week|seoul|tge|token generation|mainnet|side event|meetup|sponsor|community event|conference|summit)/i,
    intent: /(host|hosting|organizer|organizing|sponsor|sponsoring|side event|meetup|booth|launch|tge|mainnet|서울|행사|주최|스폰서|밋업|출시)/i,
    koOffer: '서울 현지에서 행사 의류를 제작해 행사 전 숙소·사무실·행사장으로 빠르게 납품',
    enOffer: 'local Seoul event apparel production with fast delivery to your hotel, office, or venue before the event'
  },
  apparel: {
    label: '국내 단체복', market: 'korea',
    queries: ['2026 서울 행사 개최 참가 모집 컨퍼런스 페스티벌 워크숍 주최사','2026 한국 기업 워크숍 체육대회 축제 행사 예정 주최'],
    exaQuery: 'Korean organizations actively organizing an upcoming 2026 workshop, festival, conference, expo, company event, university event, or community event that may need staff or team apparel',
    signal: /(행사|축제|컨퍼런스|워크숍|체육대회|expo|summit|conference|festival|meetup|박람회|세미나|포럼)/i,
    intent: /(개최|예정|참가|모집|스폰서|운영|주최|registration|organizer|staff|upcoming)/i,
    koOffer: '행사 일정에 맞춰 단체복을 빠르게 제작하고 원하는 장소로 납품', enOffer: 'fast local production of team apparel for an upcoming event'
  },
  ax: {
    label: 'AX PoC', market: 'korea',
    queries: ['2026 한국 기업 운영 자동화 고객지원 물류 생산성 채용 확장','2026 한국 중소기업 업무혁신 ERP RPA 고객센터 영업 운영 확장'],
    exaQuery: 'Korean companies showing a current buyer signal for operations automation, customer support automation, ERP workflow automation, back-office productivity, expansion, hiring, or digital transformation, excluding AI vendors',
    signal: /(자동화|업무혁신|디지털전환|dx|ax|운영|고객지원|고객센터|cs|영업|물류|erp|rpa|생산성|스마트공장|채용|확장|투자)/i,
    intent: /(도입|확장|채용|투자|증가|신규|계약|수주|launch|hiring|funding|automation|전환|혁신)/i,
    koOffer: '큰 구축 전에 1~2주 안에 반복업무 하나를 자동화하는 소형 AX PoC', enOffer: 'a small 1–2 week AI automation proof of concept before a larger build'
  },
  video: {
    label: '영상 제작', market: 'korea',
    queries: ['2026 교회 주일예배 설교 영상 정기 방송 미디어 사역','2026 사찰 법회 법문 영상 정기 콘텐츠 홍보 미디어'],
    exaQuery: 'Korean churches, temples, religious organizations, and recurring communities publishing weekly sermons, worship, dharma talks, events, or regular video content that may need editing, shorts, subtitles, or thumbnails',
    signal: /(교회|성당|사찰|법문|법회|설교|예배|영상|쇼츠|콘텐츠|방송|미디어|행사)/i,
    intent: /(정기|매주|주일|업로드|방송|행사|설교|법문|예배|법회|콘텐츠|media)/i,
    koOffer: '원본 영상이나 주제를 받아 자막·쇼츠·썸네일까지 빠르게 반복 제작', enOffer: 'fast, low-cost recurring video, shorts, subtitles and thumbnails'
  },
  dev: {
    label: '개발 Capacity', market: 'korea',
    queries: ['2026 한국 브랜딩 디자인 마케팅 에이전시 웹 앱 프로젝트 파트너 협력사','2026 에이전시 개발 파트너 외주 협력사 웹사이트 앱 제작 수주'],
    exaQuery: 'Korean agencies, studios, and non-development companies with a current need for white-label development capacity, outsourcing partners, MVP delivery, new project wins, or short-term web app development support',
    signal: /(에이전시|agency|studio|브랜딩|마케팅|디자인|웹|앱|mvp|프로젝트|디지털|개발)/i,
    intent: /(수주|출시|런칭|프로젝트|제작|파트너|협력사|외주|화이트라벨|launch|partner|outsourc|capacity)/i,
    koOffer: '필요한 기간만 웹·앱·내부툴 개발 capacity를 붙이는 소형 외주·화이트라벨 파트너', enOffer: 'flexible white-label development capacity for web, app and internal-tool projects'
  }
};

const VARIANTS = ['recent announcement expansion event','upcoming 2026 launch organizer partner','new project partnership operations'];
const AI_VENDOR = /(ai 솔루션|ai 전문|생성형 ai 스타트업|ai platform|ai company|인공지능 전문기업|automation vendor|rpa 솔루션)/i;
const AX_BUYER = /(고객센터|고객지원|물류|제조|유통|커머스|여행|교육|금융|보험|병원|프랜차이즈|erp|운영|영업|백오피스|스마트공장|생산)/i;
const SOURCE_TITLE = /(top\s*\d+|best .*events|events? to attend|conference[s]? .*2026|event calendar|global adoption index|report|guide|list of|news roundup|press release|pr 2026|organizations?\s*\|)/i;

function clean(value, max = 900) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
function sentence(value, max = 160) { return clean(value,max).replace(/[.!?。！？]+$/g,'').replace(/\\u003e/gi,'').trim(); }
function host(value = '') { try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } }
function rootHost(value = '') { const h = host(value); const p = h.split('.'); if (p.length <= 2) return h; const three = p.slice(-3).join('.'); if (/^(?:[^.]+\.)?(?:co|or|go|ac)\.kr$/.test(three)) return three; return p.slice(-2).join('.'); }
function inList(url, list) { const h = rootHost(url); return list.some(d => h === d || h.endsWith(`.${d}`)); }
function blocked(url) { return !rootHost(url) || inList(url, ALWAYS_BLOCKED); }
function sourceOnly(url) { return inList(url, SOURCE_ONLY); }
function sourceStyle(row = {}) { return sourceOnly(row.url) || SOURCE_TITLE.test(clean(row.title,260)); }
function displayName(title = '', domain = '') { const raw = clean(title, 160).replace(/\s*[|｜].*$/, '').replace(/\s+[–—-]\s+.*$/, '').replace(/^(home|homepage|official site)\s*[:|-]?\s*/i, '').trim(); if (raw.length >= 2 && raw.length <= 70) return raw; return (domain.split('.')[0] || domain).replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 70); }
function normalizedWords(value = '') { return clean(value,160).toLowerCase().replace(/[^a-z0-9가-힣]+/g,' ').split(/\s+/).filter(x => x.length >= 2); }
function domainMatchesCompany(company = '', domain = '') { const stem = (rootHost(`https://${domain}`) || domain).split('.')[0].replace(/[-_]/g,'').toLowerCase(); if (!stem || stem.length < 3) return false; const words = normalizedWords(company).map(x => x.replace(/[^a-z0-9가-힣]/g,'')); return words.some(w => w.length >= 3 && (w.includes(stem) || stem.includes(w))) || clean(company,120).toLowerCase().replace(/[^a-z0-9가-힣]/g,'').includes(stem); }

function hardPass(text, id) {
  const c = CAMPAIGNS[id]; if (!c.signal.test(text) || !c.intent.test(text)) return false;
  if (id === 'kbw') { const crypto = /(crypto|blockchain|web3|defi|exchange|token|tge|mainnet|가상자산|블록체인)/i.test(text); const korea = /(seoul|korea|kbw|korea blockchain week|서울|한국)/i.test(text); const buying = /(kbw|korea blockchain week|side event|meetup|host|organizer|sponsor|booth|tge|token generation|mainnet launch|community event|주최|스폰서|밋업|행사|출시)/i.test(text); return crypto && korea && buying; }
  if (id === 'apparel') return /(개최|예정|모집|참가|주최|organizer|upcoming|registration|staff)/i.test(text);
  if (id === 'ax') return !AI_VENDOR.test(text) && AX_BUYER.test(text) && /(확장|채용|투자|증가|전환|혁신|자동화|수주|신규|계약|hiring|expansion|operations)/i.test(text);
  if (id === 'video') return /(교회|성당|사찰|설교|예배|법문|법회)/i.test(text) && /(정기|매주|주일|방송|영상|콘텐츠|미디어|설교|법문)/i.test(text);
  if (id === 'dev') return /(에이전시|agency|studio|브랜딩|마케팅|디자인|비개발|제작사)/i.test(text) && /(파트너|협력사|외주|화이트라벨|수주|프로젝트|partner|outsourc|capacity)/i.test(text);
  return false;
}
function scoreRow(row, id, text, verifiedDirect = false) { const c = CAMPAIGNS[id]; let score = 0; if (c.signal.test(text)) score += 22; if (c.intent.test(text)) score += 22; if (hardPass(text,id)) score += 24; if (verifiedDirect) score += 10; if (row.published_date) score += 6; score += Math.min(8, Math.round((Number(row.score) || 0) * 8)); return Math.min(96, score); }
function roleFor(id, signal = '') { if (id === 'kbw') { if (/(tge|launch|mainnet|출시)/i.test(signal)) return 'Marketing / Community Lead'; if (/(side event|meetup|sponsor|booth|event|행사|밋업|스폰서)/i.test(signal)) return 'Events / Marketing Lead'; return 'Community / Marketing Lead'; } if (id === 'apparel') return /(기업|워크숍|체육대회)/i.test(signal) ? '총무 / 행사 담당자' : '행사 / 마케팅 담당자'; if (id === 'ax') return /(고객센터|cs|고객지원)/i.test(signal) ? 'CX / 운영 책임자' : '운영 / DX·AI 담당자'; if (id === 'video') return '콘텐츠 / 미디어 담당자'; return '대표 / PM / 프로덕트 담당자'; }
function offerFor(id, c, signal = '') { if (id === 'kbw') { if (/(tge|token generation|mainnet|launch|출시)/i.test(signal)) return 'TGE·출시 일정에 맞춘 팀웨어·스태프 의류를 서울에서 제작해 행사 전 숙소·사무실·행사장으로 납품'; if (/(side event|meetup|booth|sponsor|행사|밋업|스폰서)/i.test(signal)) return 'KBW 사이드 이벤트·밋업용 스태프/팀 의류를 서울 현지에서 빠르게 제작·납품'; } return c.koOffer; }
function subjectFor(id, company) { if (id === 'kbw') return `Seoul event apparel for ${company}`; if (id === 'ax') return `${company} 업무 자동화 PoC 제안`; if (id === 'video') return `${company} 영상 콘텐츠 제작 제안`; if (id === 'dev') return `${company} 개발 파트너 제안`; return `${company} 행사 단체복 제작 제안`; }
function messageKo(c, id, company, signal, offer) { const trigger = sentence(signal,120) || `${company}의 최근 활동`; if (id === 'ax') return `안녕하세요.\n\n${trigger} 관련 내용을 보고 연락드렸습니다. 지금 단계에서는 큰 구축보다 반복업무 하나를 1~2주 안에 자동화해 효과를 확인하는 방식이 잘 맞아 보여 연락드렸습니다. ${offer} 형태로 시작할 수 있고, 기존 업무 흐름을 크게 바꾸지 않는 범위로 잡을 수 있습니다. 현재 가장 시간이 많이 드는 업무 하나만 알려주시면 적용 가능한 범위와 예상 일정을 짧게 정리해드리겠습니다. 검토해보실까요?`; if (id === 'video') return `안녕하세요.\n\n${trigger} 관련 내용을 보고 연락드렸습니다. 정기 콘텐츠는 촬영보다 편집·자막·쇼츠·썸네일을 꾸준히 처리하는 과정에서 부담이 커지는 경우가 많아 연락드렸습니다. ${offer} 형태로 필요한 부분만 반복 제작할 수 있습니다. 최근 영상 하나를 기준으로 작업 범위와 납기 예시를 짧게 정리해드릴 수 있습니다. 필요하실까요?`; if (id === 'dev') return `안녕하세요.\n\n${trigger} 관련 내용을 보고 연락드렸습니다. 프로젝트가 몰리거나 내부 개발 인력이 부족한 구간에 필요한 기간만 개발 capacity를 붙이는 방식으로 협업할 수 있어 연락드렸습니다. ${offer} 형태로 웹·앱·내부툴 중 필요한 범위만 맡을 수 있습니다. 현재 일정이 빠듯한 프로젝트가 있다면 투입 가능 범위와 예상 일정을 짧게 정리해드리겠습니다. 협력사 후보로 검토해보실까요?`; return `안녕하세요.\n\n${trigger} 관련 내용을 보고 연락드렸습니다. 행사 일정이 정해진 뒤 단체복 제작과 납품 일정을 맞추는 과정이 급해지는 경우가 많아 연락드렸습니다. ${offer} 형태로 제작부터 납품까지 일정에 맞춰 진행할 수 있습니다. 수량과 희망 납기만 알려주시면 가능한 옵션을 2~3개로 짧게 정리해드리겠습니다. 검토해보실까요?`; }
function messageEn(c, id, company, signal) { const trigger = sentence(signal,125) || 'your recent activity'; if (id === 'kbw') return `Hi,\n\nI noticed ${company} while looking into ${trigger}. If you are preparing a Seoul event, side event, meetup, launch, or KBW activation, we can produce team and staff apparel locally in Korea and deliver it to your hotel, office, or venue before the event. Local production helps avoid international shipping lead time and makes last-minute quantity or artwork changes easier. I can send 2–3 simple options with estimated turnaround based on your timing and headcount. Would that be useful?`; return `Hi,\n\nI noticed ${company} while looking into ${trigger}. We can help with ${c.enOffer}. The scope can stay small and practical so you can test it without a large commitment. I can send a short option with estimated timing based on your current need. Would that be useful?`; }

async function fetchJson(url, options = {}, timeoutMs = 7500) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { const r = await fetch(url, { ...options, signal: controller.signal, cache:'no-store' }); const text = await r.text(); if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; } return text ? JSON.parse(text) : {}; } finally { clearTimeout(timer); } }
async function braveSearch(query, key) { if (!key) return []; const params = new URLSearchParams({ q: clean(query,390), count:'15', country:'KR', safesearch:'moderate', freshness:'pm' }); const data = await fetchJson(`https://api.search.brave.com/res/v1/web/search?${params}`, { headers:{ Accept:'application/json', 'X-Subscription-Token':key } }, 7000); return (Array.isArray(data?.web?.results) ? data.web.results : []).map((r,i)=>({ title:clean(r.title,260), url:clean(r.url,500), content:clean(r.description,900), score:Math.max(0,1-i/20), published_date:clean(r.age,60), _engine:'brave' })).filter(r=>/^https?:\/\//i.test(r.url)); }
async function exaSearch(query, key) { if (!key) return []; const start = new Date(Date.now() - 365 * 86400000).toISOString(); const data = await fetchJson('https://api.exa.ai/search', { method:'POST', headers:{ 'x-api-key':key, 'Content-Type':'application/json', Accept:'application/json' }, body:JSON.stringify({ query:clean(query,600), type:'fast', numResults:8, startPublishedDate:start, excludeDomains:ALWAYS_BLOCKED, contents:{ highlights:true } }) }, 9000); return (Array.isArray(data?.results) ? data.results : []).map((r,i)=>({ title:clean(r.title,260), url:clean(r.url,500), content:clean(Array.isArray(r.highlights) && r.highlights.length ? r.highlights.join(' ') : (r.text || ''),1200), score:Math.max(0,1-i/12), published_date:clean(r.publishedDate,60), _engine:'exa' })).filter(r=>/^https?:\/\//i.test(r.url)); }
async function jinaRead(url, key) { if (!key || !/^https?:\/\//i.test(url)) return ''; const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 6000); try { const r = await fetch(`https://r.jina.ai/${url}`, { headers:{ Authorization:`Bearer ${key}`, Accept:'text/plain' }, signal:controller.signal, cache:'no-store' }); if (!r.ok) return ''; return (await r.text()).slice(0,22000); } catch { return ''; } finally { clearTimeout(timer); } }

function resolveCompanyFromJina(markdown, sourceUrl, campaignId) { const sourceDomain = rootHost(sourceUrl); const c = CAMPAIGNS[campaignId]; const candidates = []; const re = /\[([^\]]{2,90})\]\((https?:\/\/[^)\s]+)\)/g; let m; while ((m = re.exec(markdown)) && candidates.length < 120) { const url = m[2]; const domain = rootHost(url); if (!domain || domain === sourceDomain || blocked(url) || sourceOnly(url)) continue; const anchor = clean(m[1],90); if (/^(read more|learn more|website|official site|home|click here|source)$/i.test(anchor)) continue; const around = clean(markdown.slice(Math.max(0,m.index-180), Math.min(markdown.length,re.lastIndex+220)),500); const hay = `${anchor} ${domain} ${around}`; let score = 0; if (c.signal.test(hay)) score += 4; if (c.intent.test(hay)) score += 4; if (hardPass(hay,campaignId)) score += 10; if (domainMatchesCompany(anchor,domain)) score += 5; if (SOURCE_TITLE.test(anchor)) score -= 6; if (score >= 9) candidates.push({ url:`https://${domain}/`, domain, company:displayName(anchor,domain), score, text:hay }); } candidates.sort((a,b)=>b.score-a.score); return candidates[0] || null; }

async function dartSignals(key) { if (!key) return []; const end=new Date(), start=new Date(end.getTime()-21*86400000), ymd=d=>d.toISOString().slice(0,10).replace(/-/g,''); const load=async type=>{ const q=new URLSearchParams({crtfc_key:key,bgn_de:ymd(start),end_de:ymd(end),pblntf_ty:type,page_count:'100',sort:'date',sort_mth:'desc'}); const data=await fetchJson(`https://opendart.fss.or.kr/api/list.json?${q}`,{},7500); return data?.status==='000'&&Array.isArray(data.list)?data.list:[]; }; const settled=await Promise.allSettled([load('B'),load('E')]); const rows=settled.flatMap(x=>x.status==='fulfilled'?x.value:[]); const signal=/(신규시설투자|타법인.*취득|영업양수|합병|분할|유상증자|단일판매.*공급계약|투자판단|신규사업|사업목적|주요사항|계약체결|자산.*취득)/i; const seen=new Set(); return rows.filter(r=>signal.test(r.report_nm||'')).filter(r=>{const k=`${r.corp_name}|${r.report_nm}`;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,9); }
async function resolveOfficial(company) { try { const r=await tavilySearch(`${company} 공식 홈페이지 회사`,{maxResults:4,timeRange:'year',excludeDomains:[...ALWAYS_BLOCKED,...SOURCE_ONLY]}); const row=r.results.find(x=>!blocked(x.url)&&!sourceOnly(x.url)&&domainMatchesCompany(company,rootHost(x.url))); if(!row)return null; const domain=rootHost(row.url); return domain?{domain,url:`https://${domain}/`}:null; } catch { return null; } }

function makeLead({ campaignId, company, domain, sourceUrl, sourceTitle, publishedDate, signal, score, verifiedBy, extra = {} }) { const c=CAMPAIGNS[campaignId], role=roleFor(campaignId,signal), offer=offerFor(campaignId,c,signal); return { id:`${campaignId}:${domain}`, campaign:campaignId, campaign_label:c.label, company, domain, url:`https://${domain}/`, source_url:sourceUrl, source_title:sourceTitle, published_date:publishedDate||'', signal:clean(signal,320), score, verified_company:true, verified_by:verifiedBy, quality_reasons:extra.quality_reasons||[], tool_signals:extra.tool_signals||[], recommended_role:role, offer, subject:subjectFor(campaignId,company), message_ko:messageKo(c,campaignId,company,signal,offer), message_en:messageEn(c,campaignId,company,signal,offer), contact:null, contact_status:'pending' }; }

async function rowsToLeads(rows, campaignId, excludes, jinaKey, limit = 12, maxJinaReads = 2) { const seen=new Set(), leads=[]; let jinaReads=0; for(const row of rows){ if(leads.length>=limit||blocked(row.url))continue; let domain=rootHost(row.url), company=displayName(row.title,domain), text=`${row.title||''} ${row.content||''}`; let verifiedBy='official-domain', direct=!sourceStyle(row)&&domainMatchesCompany(company,domain); if(!direct){ if(!jinaKey||jinaReads>=maxJinaReads)continue; jinaReads+=1; const page=await jinaRead(row.url,jinaKey); if(!page)continue; const resolved=resolveCompanyFromJina(page,row.url,campaignId); if(!resolved)continue; domain=resolved.domain; company=resolved.company; text=`${text} ${resolved.text} ${page.slice(0,3500)}`; verifiedBy='jina-source-resolution'; } if(!domain||excludes.has(domain)||seen.has(domain)||!hardPass(text,campaignId))continue; const score=scoreRow(row,campaignId,text,direct); if(score<68)continue; seen.add(domain); leads.push(makeLead({ campaignId,company,domain,sourceUrl:row.url,sourceTitle:clean(row.title,220),publishedDate:clean(row.published_date,60), signal:sentence(row.title||row.content,280),score,verifiedBy, extra:{quality_reasons:['구매 신호 확인',direct?'회사·도메인 일치':'소스에서 실제 회사 추출'],tool_signals:[row._engine||'tavily']} })); } return leads; }

async function dartLeads(key, excludes, cycle) { const rows=await dartSignals(key); if(!rows.length)return[]; const start=(cycle*2)%Math.max(2,rows.length), slice=rows.slice(start,start+2); const resolved=await Promise.all(slice.map(async row=>({row,official:await resolveOfficial(row.corp_name)}))); return resolved.filter(x=>x.official&&!excludes.has(x.official.domain)).map(({row,official})=>makeLead({ campaignId:'ax',company:clean(row.corp_name,90),domain:official.domain, sourceUrl:`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(row.rcept_no||'')}`, sourceTitle:clean(row.report_nm,220),publishedDate:clean(row.rcept_dt,30), signal:`OpenDART 최근 공시: ${sentence(row.report_nm,180)}`,score:90,verifiedBy:'opendart+official-domain', extra:{quality_reasons:['최근 주요 공시 신호','공식 홈페이지 확인'],tool_signals:['OpenDART','Tavily']} })); }
function kbwSeedQuery(cycle) { const seed=KBW_SEEDS[cycle%KBW_SEEDS.length]; return `${seed} 2026 Seoul KBW event meetup sponsor TGE mainnet launch`; }

export async function POST(request) {
  if(!tavilyConfigured())return Response.json({error:'TAVILY_API_KEY가 필요합니다.'},{status:503});
  let body={}; try{body=await request.json();}catch{return Response.json({error:'요청 형식이 잘못됐습니다.'},{status:400});}
  const campaignId=CAMPAIGNS[body.campaign]?body.campaign:'kbw', campaign=CAMPAIGNS[campaignId]; const cycle=Math.max(0,Number.parseInt(body.cycle,10)||0); const excludes=new Set(Array.isArray(body.excludeDomains)?body.excludeDomains.map(x=>String(x).toLowerCase()):[]); const exaKey=clean(body?.tools?.exaKey,300), jinaKey=clean(body?.tools?.jinaKey,300), braveKey=clean(body?.tools?.braveKey,300), dartKey=clean(body?.tools?.dartKey,100); const variant=VARIANTS[cycle%VARIANTS.length]; const queries=campaign.queries.slice(0,2).map((q,i)=>`${q} ${i===cycle%2?variant:''}`.trim()); if(campaignId==='kbw'&&cycle%2===0)queries[1]=kbwSeedQuery(cycle);
  try{
    const dartPromise=campaignId==='ax'&&dartKey?dartLeads(dartKey,excludes,cycle).catch(()=>[]):Promise.resolve([]);
    const search=await tavilySearchMany(queries,{maxResults:10,timeRange:'year',excludeDomains:ALWAYS_BLOCKED,topic:'general'});
    let leads=await rowsToLeads(search.results,campaignId,excludes,jinaKey,10,2);
    let exaUsed=false;
    if(leads.length<6&&exaKey&&cycle%2===0){ try{ const extra=await exaSearch(campaign.exaQuery,exaKey); exaUsed=true; const more=await rowsToLeads(extra,campaignId,new Set([...excludes,...leads.map(x=>x.domain)]),jinaKey,8,2); leads.push(...more); }catch{/* Tavily remains usable; Exa is optional. */} }
    let braveUsed=false;
    if(leads.length<6&&braveKey){ try{ const extra=await braveSearch(campaign.queries[cycle%campaign.queries.length],braveKey); braveUsed=true; const more=await rowsToLeads(extra,campaignId,new Set([...excludes,...leads.map(x=>x.domain)]),jinaKey,8,1); leads.push(...more); }catch{/* Existing results remain usable. */} }
    const dartExtra=await dartPromise, dartUsed=dartExtra.length>0; if(campaignId==='ax'&&dartExtra.length)leads=[...dartExtra,...leads];
    const unique=[], seen=new Set(); for(const lead of leads.sort((a,b)=>b.score-a.score)){ if(!lead.domain||seen.has(lead.domain)||excludes.has(lead.domain))continue; seen.add(lead.domain); unique.push(lead); if(unique.length>=12)break; }
    return Response.json({ campaign:campaignId,campaign_label:campaign.label,leads:unique, meta:{...search.meta,returned:unique.length,cycle,jina_used:Boolean(jinaKey),brave_used:braveUsed,exa_used:exaUsed,opendart_used:dartUsed,hard_filter:true} },{headers:{'Cache-Control':'no-store'}});
  }catch(error){ return Response.json({error:clean(error?.message||error,500),campaign:campaignId},{status:Number(error?.status)||502}); }
}
