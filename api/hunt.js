import { tavilyConfigured, tavilySearch, tavilySearchMany } from '../lib/web-search.js';

const ALWAYS_BLOCKED = [
  'instagram.com','facebook.com','x.com','twitter.com','youtube.com','reddit.com','pinterest.com','linkedin.com',
  'wikipedia.org','medium.com','tiktok.com','threads.net'
];

const SOURCE_ONLY = [
  'techcrunch.com','reuters.com','bloomberg.com','forbes.com','yahoo.com','prnewswire.com','businesswire.com',
  'coindesk.com','cointelegraph.com','blockmedia.co.kr','tokenpost.kr','zdnet.co.kr','etnews.com','platum.kr',
  'venturesquare.net','besuccess.com','startuprecipe.co.kr','eventbrite.com','meetup.com','festa.io','onoffmix.com',
  'event-us.kr','icoanalytics.org','coinmarketcap.com','coingecko.com','newsis.com','yna.co.kr','mk.co.kr','hankyung.com'
];

const KBW_CURATED = [
  { name:'GRVT', domain:'gr-vt.com', kind:'TGE', signal:'GRVT TGE is scheduled for July 30, 2026 and the project already has meaningful derivatives-market traction.' },
  { name:'MagicBlock', domain:'magicblock.xyz', kind:'TGE', signal:'MagicBlock is active in 2026 builder programs and is tracked for a Q3 2026 token generation event.' },
  { name:'Real Finance', domain:'real.finance', kind:'Launch', signal:'Real Finance is targeting a Q3 2026 mainnet launch and is building institutional RWA infrastructure.' },
  { name:'Bithumb', domain:'bithumbcorp.com', kind:'Korea', signal:'Bithumb remains one of Korea’s largest active digital-asset exchanges.' },
  { name:'Coinone', domain:'coinone.co.kr', kind:'Korea', signal:'Coinone remains an active Korean exchange with institutional and staking products.' },
  { name:'Korbit', domain:'korbit.co.kr', kind:'Korea', signal:'Korbit remains active and is being repositioned under Mirae Asset’s digital-asset strategy.' },
  { name:'Hashed', domain:'hashed.com', kind:'Korea', signal:'Hashed is a long-running Seoul-based blockchain investor and ecosystem builder.' },
  { name:'Kaia', domain:'kaia.io', kind:'Korea', signal:'Kaia remains an active Asia-focused L1 ecosystem centered on stablecoin settlement and onchain finance.' },
  { name:'WEMIX', domain:'wemix.com', kind:'Korea', signal:'WEMIX remains an active Korean blockchain ecosystem with games, staking and community products.' }
];

const CAMPAIGNS = {
  kbw: {
    label: 'KBW 단체복', market: 'global-to-korea', role: 'Events / Marketing / Community Lead',
    queries: [
      'Korea Blockchain Week 2026 Seoul sponsor side event community project',
      '2026 TGE token launch Q3 crypto project Asia Seoul community event',
      'Korean crypto company 2026 exchange blockchain ecosystem event Seoul'
    ],
    signal: /(kbw|korea blockchain week|seoul|tge|token generation|mainnet|side event|meetup|sponsor|community|conference|summit|blockchain|crypto)/i,
    intent: /(event|meetup|conference|sponsor|community|marketing|launch|tge|mainnet|seoul|행사|스폰서|밋업|출시)/i,
    koOffer: '서울 현지 단체복·행사 의류를 빠르게 제작해 행사 전 숙소나 행사장까지 전달',
    enOffer: 'local Seoul event apparel production with fast delivery before the event'
  },
  apparel: {
    label: '국내 단체복', market: 'korea', role: '행사 / 마케팅 / 총무 담당자',
    queries: [
      '2026 서울 행사 개최 참가 모집 컨퍼런스 페스티벌 워크숍 주최사',
      '2026 한국 기업 워크숍 체육대회 축제 행사 예정 주최',
      '2026 서울 expo summit conference festival organizer upcoming'
    ],
    signal: /(행사|축제|컨퍼런스|워크숍|체육대회|expo|summit|conference|festival|meetup|박람회|세미나|포럼)/i,
    intent: /(개최|예정|참가|모집|스폰서|운영|주최|행사|event|organizer|staff|registration)/i,
    koOffer: '행사 일정에 맞춰 단체복을 빠르게 제작하고 원하는 장소로 납품',
    enOffer: 'fast local production of team apparel for an upcoming event'
  },
  ax: {
    label: 'AX PoC', market: 'korea', role: '대표 / 운영 / DX·AI 담당자',
    queries: [
      '2026 한국 기업 디지털전환 운영 자동화 고객지원 물류 생산성 채용 확장',
      '2026 한국 중소기업 업무혁신 ERP RPA 고객센터 영업 운영 확장',
      '2026 Korean company operations digital transformation hiring expansion customer support'
    ],
    signal: /(자동화|업무혁신|디지털전환|dx|ax|운영|고객지원|고객센터|cs|영업|물류|erp|rpa|생산성|스마트공장|채용|확장|투자)/i,
    intent: /(도입|확장|채용|투자|증가|신규|계약|수주|launch|hiring|funding|automation|전환|혁신)/i,
    koOffer: '큰 구축 전에 1~2주 안에 반복업무 하나를 자동화하는 소형 AX PoC',
    enOffer: 'a small 1–2 week AI automation proof of concept before a larger build'
  },
  video: {
    label: '영상 제작', market: 'korea', role: '콘텐츠 / 홍보 / 미디어 담당자',
    queries: [
      '2026 교회 주일예배 설교 영상 정기 방송 미디어 사역',
      '2026 사찰 법회 법문 영상 정기 콘텐츠 홍보 미디어',
      '한국 종교 단체 설교 법문 영상 매주 정기 콘텐츠'
    ],
    signal: /(교회|성당|사찰|법문|법회|설교|예배|영상|쇼츠|콘텐츠|방송|미디어|행사)/i,
    intent: /(정기|매주|주일|업로드|방송|행사|설교|법문|예배|법회|콘텐츠|media)/i,
    koOffer: '원본 영상이나 주제를 받아 자막·쇼츠·썸네일까지 싸고 빠르게 반복 제작',
    enOffer: 'fast, low-cost recurring video, shorts, subtitles and thumbnails'
  },
  dev: {
    label: '개발 Capacity', market: 'korea', role: '대표 / PM / 디지털·프로덕트 담당자',
    queries: [
      '2026 한국 브랜딩 디자인 마케팅 에이전시 웹 앱 프로젝트 파트너 협력사',
      '2026 에이전시 개발 파트너 외주 협력사 웹사이트 앱 제작 수주',
      '2026 한국 비개발 스타트업 MVP 출시 외주 개발 파트너 모집'
    ],
    signal: /(에이전시|agency|studio|브랜딩|마케팅|디자인|웹|앱|mvp|프로젝트|디지털|개발)/i,
    intent: /(수주|출시|런칭|프로젝트|제작|파트너|협력사|외주|화이트라벨|launch|partner|outsourc|build)/i,
    koOffer: '필요한 기간만 웹·앱·내부툴 개발 capacity를 붙이는 소형 외주/화이트라벨 파트너',
    enOffer: 'flexible white-label development capacity for web, app and internal-tool projects'
  }
};

const VARIANTS = ['recent announcement expansion event','upcoming 2026 launch organizer partner','new project partnership operations'];
const AI_VENDOR = /(ai 솔루션|ai 전문|생성형 ai 스타트업|ai platform|ai company|인공지능 전문기업|automation vendor|rpa 솔루션)/i;
const AX_BUYER = /(고객센터|고객지원|물류|제조|유통|커머스|여행|교육|금융|보험|병원|프랜차이즈|erp|운영|영업|백오피스|스마트공장|생산)/i;

function clean(value, max = 900) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
function host(value = '') { try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } }
function rootHost(value = '') {
  const h = host(value); const p = h.split('.'); if (p.length <= 2) return h;
  const three = p.slice(-3).join('.'); if (/^(?:[^.]+\.)?(?:co|or|go|ac)\.kr$/.test(three)) return three;
  return p.slice(-2).join('.');
}
function inList(url, list) { const h = rootHost(url); return list.some(d => h === d || h.endsWith(`.${d}`)); }
function blocked(url) { return !rootHost(url) || inList(url, ALWAYS_BLOCKED); }
function sourceOnly(url) { return inList(url, SOURCE_ONLY); }
function displayName(title = '', domain = '') {
  const raw = clean(title, 160).replace(/\s*[|｜].*$/, '').replace(/\s+[–—-]\s+.*$/, '').replace(/^(home|homepage|official site)\s*[:|-]?\s*/i, '').trim();
  if (raw.length >= 2 && raw.length <= 70) return raw;
  return (domain.split('.')[0] || domain).replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 70);
}
function hardPass(text, id, curated = false) {
  const c = CAMPAIGNS[id]; if (!c.signal.test(text) || !c.intent.test(text)) return false;
  if (id === 'kbw') return curated || (/(crypto|blockchain|web3|defi|exchange|token|tge|mainnet|가상자산|블록체인)/i.test(text) && /(seoul|korea|kbw|event|launch|tge|mainnet|서울|한국|행사)/i.test(text));
  if (id === 'apparel') return /(개최|예정|모집|참가|주최|organizer|upcoming|registration|staff)/i.test(text);
  if (id === 'ax') return !AI_VENDOR.test(text) && AX_BUYER.test(text) && /(확장|채용|투자|증가|전환|혁신|자동화|수주|신규|계약|hiring|expansion|operations)/i.test(text);
  if (id === 'video') return /(교회|성당|사찰|설교|예배|법문|법회)/i.test(text) && /(정기|매주|주일|방송|영상|콘텐츠|미디어|설교|법문)/i.test(text);
  if (id === 'dev') return /(에이전시|agency|studio|브랜딩|마케팅|디자인|비개발|제작사)/i.test(text) && /(파트너|협력사|외주|화이트라벨|수주|프로젝트|partner|outsourc)/i.test(text);
  return false;
}
function scoreRow(row, id, text, curated = false) {
  const c = CAMPAIGNS[id]; let score = 0;
  if (c.signal.test(text)) score += 32; if (c.intent.test(text)) score += 28; if (row.published_date) score += 6;
  if (curated) score += 24; if (hardPass(text, id, curated)) score += 12;
  score += Math.min(8, Math.round((Number(row.score) || 0) * 8));
  return Math.min(98, score);
}
function subjectFor(id, company) {
  if (id === 'kbw') return `Seoul event apparel for ${company}`;
  if (id === 'ax') return `${company} 업무 자동화 PoC 제안`;
  if (id === 'video') return `${company} 영상 콘텐츠 제작 제안`;
  if (id === 'dev') return `${company} 개발 파트너 제안`;
  return `${company} 행사 단체복 제작 제안`;
}
function messageKo(c, company, signal) { const intro = signal ? `최근 ${signal.slice(0, 105)} 관련 내용을 보고 연락드렸습니다.` : `${company}의 최근 활동을 보고 연락드렸습니다.`; return `안녕하세요. ${intro}\n\n${c.koOffer} 형태로 가볍게 테스트해볼 수 있어 연락드렸습니다. 필요하시면 일정과 범위에 맞춰 바로 가능한 안만 짧게 보내드리겠습니다.`; }
function messageEn(c, company, signal) { const trigger = clean(signal, 105) || 'your recent activity'; return `Hi,\n\nI came across ${company} while looking at ${trigger}. We can help with ${c.enOffer}.\n\nIf useful, I can send a very short option based on your timing and scope.`; }

async function fetchJson(url, options = {}, timeoutMs = 7500) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { const r = await fetch(url, { ...options, signal: controller.signal, cache:'no-store' }); const text = await r.text(); if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; } return text ? JSON.parse(text) : {}; }
  finally { clearTimeout(timer); }
}

async function braveSearch(query, key) {
  if (!key) return [];
  const params = new URLSearchParams({ q: clean(query, 390), count:'15', country:'KR', safesearch:'moderate', freshness:'pm' });
  const data = await fetchJson(`https://api.search.brave.com/res/v1/web/search?${params}`, { headers:{ Accept:'application/json', 'X-Subscription-Token':key } }, 8000);
  return (Array.isArray(data?.web?.results) ? data.web.results : []).map((r, i) => ({ title:clean(r.title,260), url:clean(r.url,500), content:clean(r.description,900), score:Math.max(0, 1 - i / 20), published_date:clean(r.age,60), _engine:'brave' })).filter(r => /^https?:\/\//i.test(r.url));
}

async function jinaRead(url, key) {
  if (!key || !/^https?:\/\//i.test(url)) return '';
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const r = await fetch(`https://r.jina.ai/${url}`, { headers:{ Authorization:`Bearer ${key}`, Accept:'text/plain' }, signal:controller.signal, cache:'no-store' });
    if (!r.ok) return ''; return (await r.text()).slice(0, 24000);
  } catch { return ''; } finally { clearTimeout(timer); }
}

function resolveLinkFromJina(markdown, sourceUrl, title) {
  const sourceDomain = rootHost(sourceUrl); const titleWords = clean(title, 120).toLowerCase().split(/[^a-z0-9가-힣]+/).filter(x => x.length >= 3);
  const candidates = []; const re = /\[([^\]]{2,90})\]\((https?:\/\/[^)\s]+)\)/g; let m;
  while ((m = re.exec(markdown)) && candidates.length < 80) {
    const url = m[2]; const domain = rootHost(url); if (!domain || domain === sourceDomain || blocked(url) || sourceOnly(url)) continue;
    const anchor = clean(m[1], 90); const hay = `${anchor} ${domain}`.toLowerCase();
    const matches = titleWords.filter(w => hay.includes(w)).length; let score = matches * 4;
    if (/official|회사|홈페이지|website|project|protocol|foundation|company/i.test(anchor)) score += 3;
    if (score > 0) candidates.push({ url:`https://${domain}/`, domain, company:displayName(anchor, domain), score });
  }
  candidates.sort((a,b) => b.score - a.score); return candidates[0] || null;
}

async function dartSignals(key) {
  if (!key) return [];
  const end = new Date(); const start = new Date(end.getTime() - 21 * 86400000); const ymd = d => d.toISOString().slice(0,10).replace(/-/g,'');
  const load = async type => {
    const q = new URLSearchParams({ crtfc_key:key, bgn_de:ymd(start), end_de:ymd(end), pblntf_ty:type, page_count:'100', sort:'date', sort_mth:'desc' });
    const data = await fetchJson(`https://opendart.fss.or.kr/api/list.json?${q}`, {}, 9000);
    return data?.status === '000' && Array.isArray(data.list) ? data.list : [];
  };
  const settled = await Promise.allSettled([load('B'), load('E')]);
  const rows = settled.flatMap(x => x.status === 'fulfilled' ? x.value : []);
  const signal = /(신규시설투자|타법인.*취득|영업양수|합병|분할|유상증자|단일판매.*공급계약|투자판단|신규사업|사업목적|주요사항|계약체결|자산.*취득)/i;
  const seen = new Set();
  return rows.filter(r => signal.test(r.report_nm || '')).filter(r => { const k = `${r.corp_name}|${r.report_nm}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
}

async function resolveOfficial(company) {
  try {
    const r = await tavilySearch(`${company} 공식 홈페이지 회사`, { maxResults:5, timeRange:'year', excludeDomains:[...ALWAYS_BLOCKED, ...SOURCE_ONLY] });
    const row = r.results.find(x => !blocked(x.url) && !sourceOnly(x.url));
    if (!row) return null; const domain = rootHost(row.url); return domain ? { domain, url:`https://${domain}/` } : null;
  } catch { return null; }
}

function makeLead({ id, campaignId, company, domain, sourceUrl, sourceTitle, publishedDate, signal, score, verifiedBy, extra = {} }) {
  const c = CAMPAIGNS[campaignId];
  return { id:id || `${campaignId}:${domain}`, campaign:campaignId, campaign_label:c.label, company, domain, url:`https://${domain}/`, source_url:sourceUrl, source_title:sourceTitle, published_date:publishedDate || '', signal:clean(signal,320), score, verified_company:true, verified_by:verifiedBy, quality_reasons:extra.quality_reasons || [], tool_signals:extra.tool_signals || [], recommended_role:c.role, offer:c.koOffer, subject:subjectFor(campaignId, company), message_ko:messageKo(c, company, signal), message_en:messageEn(c, company, signal), contact:null, contact_status:'pending' };
}

async function rowsToLeads(rows, campaignId, excludes, jinaKey, limit = 12) {
  const c = CAMPAIGNS[campaignId]; const seen = new Set(); const leads = [];
  for (const row of rows) {
    if (leads.length >= limit || blocked(row.url)) continue;
    let domain = rootHost(row.url); let company = displayName(row.title, domain); let text = `${row.title || ''} ${row.content || ''}`; let verifiedBy = 'official-domain';
    if (sourceOnly(row.url)) {
      const page = await jinaRead(row.url, jinaKey); if (!page) continue;
      const resolved = resolveLinkFromJina(page, row.url, row.title); if (!resolved) continue;
      domain = resolved.domain; company = resolved.company; text += ` ${page.slice(0,7000)}`; verifiedBy = 'jina-source-resolution';
    }
    if (!domain || excludes.has(domain) || seen.has(domain) || !hardPass(text, campaignId, false)) continue;
    const score = scoreRow(row, campaignId, text, false); if (score < 60) continue;
    seen.add(domain);
    leads.push(makeLead({ campaignId, company, domain, sourceUrl:row.url, sourceTitle:clean(row.title,220), publishedDate:clean(row.published_date,60), signal:clean(row.title || row.content,280), score, verifiedBy, extra:{ quality_reasons:['캠페인 필수 신호 통과','실제 회사 도메인 확인'], tool_signals:[row._engine || 'tavily'] } }));
  }
  return leads;
}

function curatedKbwLeads(excludes, cycle) {
  const ordered = KBW_CURATED.slice(cycle % KBW_CURATED.length).concat(KBW_CURATED.slice(0, cycle % KBW_CURATED.length));
  return ordered.filter(x => !excludes.has(x.domain)).slice(0, 4).map((x, i) => makeLead({ campaignId:'kbw', company:x.name, domain:x.domain, sourceUrl:`https://${x.domain}/`, sourceTitle:`${x.name} · ${x.kind}`, signal:x.signal, score:94 - i * 3, verifiedBy:'curated-kbw-pool', extra:{ quality_reasons:[x.kind === 'Korea' ? '국내 장기 생존 크립토 기업' : '2026 출시/TGE 신호','공식 도메인 고정'], tool_signals:['curated'] } }));
}

async function dartLeads(key, excludes, cycle) {
  const rows = await dartSignals(key); if (!rows.length) return [];
  const slice = rows.slice((cycle * 3) % Math.max(3, rows.length), (cycle * 3) % Math.max(3, rows.length) + 3);
  const resolved = await Promise.all(slice.map(async row => ({ row, official:await resolveOfficial(row.corp_name) })));
  return resolved.filter(x => x.official && !excludes.has(x.official.domain)).map(({ row, official }) => makeLead({ campaignId:'ax', company:clean(row.corp_name,90), domain:official.domain, sourceUrl:`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(row.rcept_no || '')}`, sourceTitle:clean(row.report_nm,220), publishedDate:clean(row.rcept_dt,30), signal:`OpenDART 최근 공시: ${clean(row.report_nm,180)}`, score:88, verifiedBy:'opendart+official-domain', extra:{ quality_reasons:['최근 주요 공시 신호','공식 홈페이지 확인'], tool_signals:['OpenDART','Tavily'] } }));
}

export async function POST(request) {
  if (!tavilyConfigured()) return Response.json({ error:'TAVILY_API_KEY가 필요합니다.' }, { status:503 });
  let body = {}; try { body = await request.json(); } catch { return Response.json({ error:'요청 형식이 잘못됐습니다.' }, { status:400 }); }
  const campaignId = CAMPAIGNS[body.campaign] ? body.campaign : 'kbw'; const campaign = CAMPAIGNS[campaignId];
  const cycle = Math.max(0, Number.parseInt(body.cycle,10) || 0); const excludes = new Set(Array.isArray(body.excludeDomains) ? body.excludeDomains.map(x => String(x).toLowerCase()) : []);
  const jinaKey = clean(body?.tools?.jinaKey,300); const braveKey = clean(body?.tools?.braveKey,300); const dartKey = clean(body?.tools?.dartKey,100);
  const variant = VARIANTS[cycle % VARIANTS.length]; const queries = campaign.queries.slice(0,2).map((q,i) => `${q} ${i === cycle % 2 ? variant : ''}`.trim());

  try {
    const search = await tavilySearchMany(queries, { maxResults:10, timeRange:'year', excludeDomains:ALWAYS_BLOCKED, topic:'general' });
    let leads = await rowsToLeads(search.results, campaignId, excludes, jinaKey, 10);
    let braveUsed = false;
    if (leads.length < 6 && braveKey) {
      try {
        const extra = await braveSearch(campaign.queries[cycle % campaign.queries.length], braveKey); braveUsed = true;
        const more = await rowsToLeads(extra, campaignId, new Set([...excludes, ...leads.map(x => x.domain)]), jinaKey, 8); leads.push(...more);
      } catch { /* Tavily results remain usable. */ }
    }
    if (campaignId === 'kbw') leads = [...curatedKbwLeads(new Set([...excludes, ...leads.map(x => x.domain)]), cycle), ...leads];
    let dartUsed = false;
    if (campaignId === 'ax' && dartKey) {
      try { const extra = await dartLeads(dartKey, new Set([...excludes, ...leads.map(x => x.domain)]), cycle); leads = [...extra, ...leads]; dartUsed = true; } catch { /* Web search remains usable. */ }
    }
    const unique = []; const seen = new Set();
    for (const lead of leads.sort((a,b) => b.score - a.score)) { if (!lead.domain || seen.has(lead.domain) || excludes.has(lead.domain)) continue; seen.add(lead.domain); unique.push(lead); if (unique.length >= 12) break; }
    return Response.json({ campaign:campaignId, campaign_label:campaign.label, leads:unique, meta:{ ...search.meta, returned:unique.length, cycle, jina_used:Boolean(jinaKey), brave_used:braveUsed, opendart_used:dartUsed, hard_filter:true } }, { headers:{ 'Cache-Control':'no-store' } });
  } catch (error) {
    return Response.json({ error:clean(error?.message || error,500), campaign:campaignId }, { status:Number(error?.status) || 502 });
  }
}
