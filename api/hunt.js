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
  'cryptorank.io','coinpedia.org','iq.wiki','ninjapromo.io','fintechnews.hk','gfma.org','coinmarketcal.com','beincrypto.com'
];

const LARGE_KBW_DOMAINS = new Set([
  'dunamu.com','upbit.com','bithumbcorp.com','bithumb.com','coinone.co.kr','korbit.co.kr','wemix.com'
]);

const CAMPAIGNS = {
  kbw: {
    label: 'KBW 단체복', market: 'global-to-korea',
    queries: [
      '2026 Seoul KBW side event host sponsor meetup web3 startup protocol team community',
      '2026 crypto startup TGE mainnet launch Seoul Korea event community sponsor emerging project'
    ],
    exaQuery: 'Emerging crypto startups, protocols, and web3 teams preparing a Seoul event, side event, meetup, sponsor activation, TGE, token launch, or mainnet launch around Korea Blockchain Week 2026. Prefer reachable small and mid-sized teams over major exchanges and large enterprises.',
    signal: /(kbw|korea blockchain week|seoul|tge|token generation|mainnet|side event|meetup|sponsor|community event|conference|summit|launch)/i,
    intent: /(host|hosting|organizer|organizing|sponsor|sponsoring|side event|meetup|booth|launch|tge|mainnet|activation|서울|행사|주최|스폰서|밋업|출시)/i,
    koOffer: '서울 현지에서 티셔츠·후디·스태프 의류를 제작해 호텔·사무실·행사장으로 빠르게 납품',
    enOffer: 'local Seoul production for team shirts, staff tees, hoodies and event merch with delivery to your hotel, office or venue'
  },
  apparel: {
    label: '국내 단체복', market: 'korea',
    queries: ['2026 서울 중소기업 스타트업 행사 워크숍 체육대회 컨퍼런스 주최 모집','2026 한국 대학 커뮤니티 페스티벌 팝업 행사 운영 스태프 단체복'],
    exaQuery: 'Small and mid-sized Korean organizations actively organizing an upcoming 2026 workshop, festival, conference, expo, company event, university event or community event that may need staff or team apparel',
    signal: /(행사|축제|컨퍼런스|워크숍|체육대회|expo|summit|conference|festival|meetup|박람회|세미나|포럼|팝업)/i,
    intent: /(개최|예정|참가|모집|스폰서|운영|주최|registration|organizer|staff|upcoming)/i,
    koOffer: '행사 일정에 맞춰 단체복·스태프 의류를 제작하고 원하는 장소로 납품', enOffer: 'fast local production of team apparel for an upcoming event'
  },
  ax: {
    label: 'AX PoC', market: 'korea',
    queries: ['2026 한국 중소기업 스타트업 운영 자동화 고객지원 물류 업무혁신 채용 확장','2026 한국 기업 반복업무 고객센터 영업 운영 ERP RPA 도입 확장'],
    exaQuery: 'Small and mid-sized Korean companies showing a current buyer signal for operations automation, customer support automation, ERP workflow automation, back-office productivity, expansion, hiring or digital transformation, excluding AI vendors',
    signal: /(자동화|업무혁신|디지털전환|dx|ax|운영|고객지원|고객센터|cs|영업|물류|erp|rpa|생산성|스마트공장|채용|확장|투자)/i,
    intent: /(도입|확장|채용|투자|증가|신규|계약|수주|launch|hiring|funding|automation|전환|혁신)/i,
    koOffer: '큰 구축 전에 반복업무 하나를 1~2주 안에 자동화해 효과를 검증하는 소형 AX PoC', enOffer: 'a small 1–2 week AI automation proof of concept before a larger build'
  },
  video: {
    label: '영상 제작', market: 'korea',
    queries: ['2026 중소 교회 주일예배 설교 영상 정기 방송 미디어 사역','2026 사찰 법회 법문 영상 정기 콘텐츠 홍보 미디어'],
    exaQuery: 'Korean churches, temples, religious organizations and recurring communities publishing weekly sermons, worship, dharma talks, events or regular video content that may need editing, shorts, subtitles or thumbnails',
    signal: /(교회|성당|사찰|법문|법회|설교|예배|영상|쇼츠|콘텐츠|방송|미디어|행사)/i,
    intent: /(정기|매주|주일|업로드|방송|행사|설교|법문|예배|법회|콘텐츠|media)/i,
    koOffer: '원본 영상이나 주제를 받아 자막·쇼츠·썸네일까지 반복 제작', enOffer: 'fast, low-cost recurring video, shorts, subtitles and thumbnails'
  },
  dev: {
    label: '개발 Capacity', market: 'korea',
    queries: ['2026 한국 중소 브랜딩 디자인 마케팅 에이전시 웹 앱 프로젝트 개발 파트너 협력사','2026 소형 에이전시 개발 외주 협력사 화이트라벨 MVP 웹앱 수주'],
    exaQuery: 'Small and mid-sized Korean agencies, studios and non-development companies with a current need for white-label development capacity, outsourcing partners, MVP delivery, new project wins or short-term web app development support',
    signal: /(에이전시|agency|studio|브랜딩|마케팅|디자인|웹|앱|mvp|프로젝트|디지털|개발)/i,
    intent: /(수주|출시|런칭|프로젝트|제작|파트너|협력사|외주|화이트라벨|launch|partner|outsourc|capacity)/i,
    koOffer: '필요한 기간만 웹·앱·내부툴 개발 인력을 붙이는 소형 외주·화이트라벨 파트너', enOffer: 'flexible white-label development capacity for web, app and internal-tool projects'
  }
};

const VARIANTS = ['recent announcement upcoming event','small team startup launch partner','2026 expansion community activation'];
const AI_VENDOR = /(ai 솔루션|ai 전문|생성형 ai 스타트업|ai platform|ai company|인공지능 전문기업|automation vendor|rpa 솔루션)/i;
const AX_BUYER = /(고객센터|고객지원|물류|제조|유통|커머스|여행|교육|금융|보험|병원|프랜차이즈|erp|운영|영업|백오피스|스마트공장|생산)/i;
const SOURCE_TITLE = /(top\s*\d+|best .*events|events? to attend|conference[s]? .*2026|event calendar|global adoption index|report|guide|list of|news roundup|press release|pr 2026|organizations?\s*\|)/i;
const SMALL_TEAM_SIGNAL = /(startup|early[- ]stage|seed|series\s*[ab]|emerging|independent|protocol|project team|small team|community-led|스(?:타트업|몰)|중소|신생|초기|시드|프리시드|series a|series b)/i;
const LARGE_TEAM_SIGNAL = /(fortune\s*500|global leader|market leader|one of the largest|major exchange|enterprise group|conglomerate|대기업|그룹사|업계 최대|국내 최대|글로벌 대형)/i;

function clean(value, max = 900) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
function sentence(value, max = 180) { return clean(value, max).replace(/[.!?。！？]+$/g, '').replace(/\\u003e/gi, '').replace(/\s+([,.;:!?])/g, '$1').trim(); }
function host(value = '') { try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } }
function rootHost(value = '') { const h = host(value); const p = h.split('.'); if (p.length <= 2) return h; const three = p.slice(-3).join('.'); if (/^(?:[^.]+\.)?(?:co|or|go|ac)\.kr$/.test(three)) return three; return p.slice(-2).join('.'); }
function inList(url, list) { const h = rootHost(url); return list.some(d => h === d || h.endsWith(`.${d}`)); }
function blocked(url) { return !rootHost(url) || inList(url, ALWAYS_BLOCKED); }
function sourceOnly(url) { return inList(url, SOURCE_ONLY); }
function sourceStyle(row = {}) { return sourceOnly(row.url) || SOURCE_TITLE.test(clean(row.title, 260)); }
function displayName(title = '', domain = '') { const raw = clean(title, 160).replace(/\s*[|｜].*$/, '').replace(/\s+[–—-]\s+.*/, '').replace(/^(home|homepage|official site)\s*[:|-]?\s*/i, '').trim(); if (raw.length >= 2 && raw.length <= 70) return raw; return (domain.split('.')[0] || domain).replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 70); }
function normalizedWords(value = '') { return clean(value, 160).toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').split(/\s+/).filter(x => x.length >= 2); }
function domainMatchesCompany(company = '', domain = '') { const stem = (rootHost(`https://${domain}`) || domain).split('.')[0].replace(/[-_]/g, '').toLowerCase(); if (!stem || stem.length < 3) return false; const words = normalizedWords(company).map(x => x.replace(/[^a-z0-9가-힣]/g, '')); return words.some(w => w.length >= 3 && (w.includes(stem) || stem.includes(w))) || clean(company, 120).toLowerCase().replace(/[^a-z0-9가-힣]/g, '').includes(stem); }

function hardPass(text, id) {
  const c = CAMPAIGNS[id]; if (!c.signal.test(text) || !c.intent.test(text)) return false;
  if (id === 'kbw') { const crypto = /(crypto|blockchain|web3|defi|exchange|token|tge|mainnet|protocol|가상자산|블록체인)/i.test(text); const korea = /(seoul|korea|kbw|korea blockchain week|서울|한국)/i.test(text); const buying = /(kbw|korea blockchain week|side event|meetup|host|organizer|sponsor|booth|activation|tge|token generation|mainnet launch|community event|주최|스폰서|밋업|행사|출시)/i.test(text); return crypto && korea && buying; }
  if (id === 'apparel') return /(개최|예정|모집|참가|주최|organizer|upcoming|registration|staff)/i.test(text);
  if (id === 'ax') return !AI_VENDOR.test(text) && AX_BUYER.test(text) && /(확장|채용|투자|증가|전환|혁신|자동화|수주|신규|계약|hiring|expansion|operations)/i.test(text);
  if (id === 'video') return /(교회|성당|사찰|설교|예배|법문|법회)/i.test(text) && /(정기|매주|주일|방송|영상|콘텐츠|미디어|설교|법문)/i.test(text);
  if (id === 'dev') return /(에이전시|agency|studio|브랜딩|마케팅|디자인|비개발|제작사)/i.test(text) && /(파트너|협력사|외주|화이트라벨|수주|프로젝트|partner|outsourc|capacity)/i.test(text);
  return false;
}

function reachability(text, domain, id) {
  let score = 0;
  if (SMALL_TEAM_SIGNAL.test(text)) score += 12;
  if (/(founder|co-founder|head of marketing|community lead|events lead|partnerships lead|대표|마케팅 담당|커뮤니티 담당)/i.test(text)) score += 6;
  if (LARGE_TEAM_SIGNAL.test(text)) score -= 18;
  if (id === 'kbw' && LARGE_KBW_DOMAINS.has(domain)) score -= 22;
  return Math.max(-30, Math.min(20, score));
}

function scoreRow(row, id, text, domain, verifiedDirect = false) {
  const c = CAMPAIGNS[id]; let score = 0;
  if (c.signal.test(text)) score += 20;
  if (c.intent.test(text)) score += 20;
  if (hardPass(text, id)) score += 24;
  if (verifiedDirect) score += 8;
  if (row.published_date) score += 5;
  score += Math.min(7, Math.round((Number(row.score) || 0) * 7));
  score += reachability(text, domain, id);
  return Math.max(0, Math.min(96, score));
}

function roleFor(id, signal = '') {
  if (id === 'kbw') {
    if (/(side event|meetup|booth|sponsor|activation|행사|밋업|스폰서)/i.test(signal)) return 'Events Lead';
    if (/(tge|launch|mainnet|출시)/i.test(signal)) return 'Head of Marketing';
    return 'Community Lead';
  }
  if (id === 'apparel') return /(기업|워크숍|체육대회)/i.test(signal) ? '행사 담당자' : 'Marketing Lead';
  if (id === 'ax') return /(고객센터|cs|고객지원)/i.test(signal) ? 'CX Lead' : 'Operations Lead';
  if (id === 'video') return 'Media Lead';
  return 'Founder';
}

function roleTargets(id, signal = '') {
  if (id === 'kbw') return /(side event|meetup|booth|sponsor|activation|행사|밋업|스폰서)/i.test(signal)
    ? ['Events Lead','Head of Marketing','Community Lead','Partnerships Lead','Founder','CEO']
    : ['Head of Marketing','Community Lead','Partnerships Lead','Founder','CEO'];
  if (id === 'apparel') return ['행사 담당자','마케팅 담당자','총무 담당자','대표'];
  if (id === 'ax') return ['Operations Lead','CX Lead','COO','Founder','CEO'];
  if (id === 'video') return ['Media Lead','Content Lead','홍보 담당자','대표'];
  return ['Founder','CEO','PM','Product Lead','Partnerships Lead'];
}

function offerFor(id, c, signal = '') {
  if (id === 'kbw') {
    if (/(tge|token generation|mainnet|launch|출시)/i.test(signal)) return '출시·TGE 일정에 맞춰 팀 티셔츠·후디·스태프 의류를 서울에서 제작하고 행사 전 현지 납품';
    if (/(side event|meetup|booth|sponsor|activation|행사|밋업|스폰서)/i.test(signal)) return 'KBW 사이드 이벤트·밋업용 티셔츠·후디·스태프 의류를 서울 현지에서 소량부터 빠르게 제작·납품';
  }
  return c.koOffer;
}

function subjectFor(id, company, signal = '') {
  if (id === 'kbw') return /(side event|meetup|booth|activation)/i.test(signal) ? `${company} Seoul event merch` : `Local merch production in Seoul for ${company}`;
  if (id === 'ax') return `${company} 반복업무 1개만 먼저 자동화해보는 제안`;
  if (id === 'video') return `${company} 정기 영상 제작 부담 줄이는 제안`;
  if (id === 'dev') return `${company} 프로젝트 개발 capacity 제안`;
  return `${company} 행사 단체복 제작 제안`;
}

function bestEvidence(text, id, fallback = '') {
  const c = CAMPAIGNS[id];
  const parts = String(text || '').split(/(?<=[.!?。！？])\s+|\n+/).map(x => sentence(x, 220)).filter(x => x.length >= 24 && x.length <= 220);
  let best = ''; let bestScore = -1;
  for (const part of parts) {
    let score = 0;
    if (c.signal.test(part)) score += 4;
    if (c.intent.test(part)) score += 6;
    if (/(2026|recent|upcoming|announc|launch|host|sponsor|meetup|event|서울|한국|예정|개최|출시|모집)/i.test(part)) score += 3;
    if (SOURCE_TITLE.test(part)) score -= 4;
    if (score > bestScore) { bestScore = score; best = part; }
  }
  return bestScore >= 6 ? best : sentence(fallback, 180);
}

function messageKo(c, id, company, signal, offer) {
  const trigger = signal || `${company}의 최근 활동`;
  if (id === 'ax') return `안녕하세요.\n\n${trigger} 내용을 보고 연락드렸습니다. 이런 시기에는 큰 AI 구축보다 실제로 시간을 잡아먹는 반복업무 하나를 먼저 없애보는 편이 판단이 빠릅니다. 저희는 ${offer} 형태로 시작하고, 기존 시스템을 갈아엎지 않고도 적용 가능한 범위를 먼저 잡습니다. 현재 팀에서 매주 반복되는 업무 하나만 알려주시면 1~2주 안에 어디까지 자동화할 수 있는지와 예상 비용 범위를 짧게 정리해드리겠습니다. 검토해보실 만할까요?`;
  if (id === 'video') return `안녕하세요.\n\n${trigger} 내용을 보고 연락드렸습니다. 정기 콘텐츠는 촬영 자체보다 편집·자막·쇼츠·썸네일을 매번 챙기는 일이 오래 남는 경우가 많습니다. 저희는 ${offer} 형태로 반복 작업을 맡아 내부 담당자가 기획과 운영에 집중할 수 있게 돕습니다. 최근 영상 하나만 보내주시면 같은 소재로 만들 수 있는 결과물과 작업 범위, 예상 납기를 먼저 짧게 보여드리겠습니다. 한번 비교해보실까요?`;
  if (id === 'dev') return `안녕하세요.\n\n${trigger} 내용을 보고 연락드렸습니다. 수주가 몰리거나 내부 개발자가 부족한 구간에는 장기 채용보다 필요한 기간만 외부 capacity를 붙이는 편이 빠를 때가 있습니다. 저희는 ${offer} 형태로 웹·앱·내부툴 중 필요한 범위만 맡고, 기존 PM/디자인팀 흐름에 맞춰 붙을 수 있습니다. 지금 일정이 밀리는 프로젝트가 있다면 요구사항 3~4줄만 보내주세요. 투입 가능 범위와 일정부터 짧게 답드리겠습니다.`;
  return `안녕하세요.\n\n${trigger} 내용을 보고 연락드렸습니다. 행사 일정이 잡히면 단체복은 디자인보다 수량 확정·제작·납품 시간을 맞추는 일이 더 급해지는 경우가 많습니다. 저희는 ${offer} 형태로 일정에 맞춰 제작부터 현장 납품까지 처리합니다. 행사 날짜와 대략적인 수량만 알려주시면 가능한 제품 2~3개와 예상 납기·가격대를 먼저 정리해드리겠습니다. 비교 견적용으로 받아보셔도 괜찮습니다.`;
}

function messageEn(c, id, company, signal) {
  const trigger = signal || `${company}'s recent activity`;
  if (id === 'kbw') return `Hi,\n\nI saw ${trigger}. If your team is doing anything in Seoul around KBW, merch usually becomes painful late in the timeline: international shipping, size changes, and getting boxes to the actual venue. We produce team shirts, staff tees, hoodies and simple event merch locally in Korea, including small-to-mid runs, and can deliver to a hotel, office or venue in Seoul. If you send me the event date and rough quantity, I’ll reply with 2–3 realistic production options, turnaround and a ballpark range — no deck or call needed first. Worth sending over?`;
  return `Hi,\n\nI saw ${trigger} and thought there may be a practical fit. We can help with ${c.enOffer}, starting with a small scope rather than a large commitment. Send me the timing and the one outcome you need most, and I’ll reply with a concrete option and expected turnaround. Would that be useful?`;
}

async function fetchJson(url, options = {}, timeoutMs = 7500) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { const r = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' }); const text = await r.text(); if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; } return text ? JSON.parse(text) : {}; } finally { clearTimeout(timer); } }
async function braveSearch(query, key) { if (!key) return []; const params = new URLSearchParams({ q: clean(query, 390), count: '15', country: 'KR', safesearch: 'moderate', freshness: 'pm' }); const data = await fetchJson(`https://api.search.brave.com/res/v1/web/search?${params}`, { headers: { Accept: 'application/json', 'X-Subscription-Token': key } }, 7000); return (Array.isArray(data?.web?.results) ? data.web.results : []).map((r, i) => ({ title: clean(r.title, 260), url: clean(r.url, 500), content: clean(r.description, 900), score: Math.max(0, 1 - i / 20), published_date: clean(r.age, 60), _engine: 'brave' })).filter(r => /^https?:\/\//i.test(r.url)); }
async function exaSearch(query, key) { if (!key) return []; const start = new Date(Date.now() - 365 * 86400000).toISOString(); const data = await fetchJson('https://api.exa.ai/search', { method: 'POST', headers: { 'x-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query: clean(query, 600), type: 'fast', numResults: 10, startPublishedDate: start, excludeDomains: ALWAYS_BLOCKED, contents: { highlights: true } }) }, 9000); return (Array.isArray(data?.results) ? data.results : []).map((r, i) => ({ title: clean(r.title, 260), url: clean(r.url, 500), content: clean(Array.isArray(r.highlights) && r.highlights.length ? r.highlights.join(' ') : (r.text || ''), 1400), score: Math.max(0, 1 - i / 14), published_date: clean(r.publishedDate, 60), _engine: 'exa' })).filter(r => /^https?:\/\//i.test(r.url)); }
async function jinaRead(url, key) { if (!key || !/^https?:\/\//i.test(url)) return ''; const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 6000); try { const r = await fetch(`https://r.jina.ai/${url}`, { headers: { Authorization: `Bearer ${key}`, Accept: 'text/plain' }, signal: controller.signal, cache: 'no-store' }); if (!r.ok) return ''; return (await r.text()).slice(0, 22000); } catch { return ''; } finally { clearTimeout(timer); } }

function resolveCompanyFromJina(markdown, sourceUrl, campaignId) {
  const sourceDomain = rootHost(sourceUrl); const c = CAMPAIGNS[campaignId]; const candidates = []; const re = /\[([^\]]{2,90})\]\((https?:\/\/[^)\s]+)\)/g; let m;
  while ((m = re.exec(markdown)) && candidates.length < 120) {
    const url = m[2]; const domain = rootHost(url); if (!domain || domain === sourceDomain || blocked(url) || sourceOnly(url)) continue;
    const anchor = clean(m[1], 90); if (/^(read more|learn more|website|official site|home|click here|source)$/i.test(anchor)) continue;
    const around = clean(markdown.slice(Math.max(0, m.index - 180), Math.min(markdown.length, re.lastIndex + 260)), 560); const hay = `${anchor} ${domain} ${around}`; let score = 0;
    if (c.signal.test(hay)) score += 4; if (c.intent.test(hay)) score += 5; if (hardPass(hay, campaignId)) score += 10; if (domainMatchesCompany(anchor, domain)) score += 5; if (SMALL_TEAM_SIGNAL.test(hay)) score += 3; if (SOURCE_TITLE.test(anchor)) score -= 6;
    if (score >= 10) candidates.push({ url: `https://${domain}/`, domain, company: displayName(anchor, domain), score, text: hay });
  }
  candidates.sort((a, b) => b.score - a.score); return candidates[0] || null;
}

async function dartSignals(key) { if (!key) return []; const end = new Date(), start = new Date(end.getTime() - 21 * 86400000), ymd = d => d.toISOString().slice(0, 10).replace(/-/g, ''); const load = async type => { const q = new URLSearchParams({ crtfc_key: key, bgn_de: ymd(start), end_de: ymd(end), pblntf_ty: type, page_count: '100', sort: 'date', sort_mth: 'desc' }); const data = await fetchJson(`https://opendart.fss.or.kr/api/list.json?${q}`, {}, 7500); return data?.status === '000' && Array.isArray(data.list) ? data.list : []; }; const settled = await Promise.allSettled([load('B'), load('E')]); const rows = settled.flatMap(x => x.status === 'fulfilled' ? x.value : []); const signal = /(신규시설투자|타법인.*취득|영업양수|합병|분할|유상증자|단일판매.*공급계약|투자판단|신규사업|사업목적|주요사항|계약체결|자산.*취득)/i; const seen = new Set(); return rows.filter(r => signal.test(r.report_nm || '')).filter(r => { const k = `${r.corp_name}|${r.report_nm}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 9); }
async function resolveOfficial(company) { try { const r = await tavilySearch(`${company} 공식 홈페이지 회사`, { maxResults: 4, timeRange: 'year', excludeDomains: [...ALWAYS_BLOCKED, ...SOURCE_ONLY] }); const row = r.results.find(x => !blocked(x.url) && !sourceOnly(x.url) && domainMatchesCompany(company, rootHost(x.url))); if (!row) return null; const domain = rootHost(row.url); return domain ? { domain, url: `https://${domain}/` } : null; } catch { return null; } }

function makeLead({ campaignId, company, domain, sourceUrl, sourceTitle, publishedDate, rawText, score, verifiedBy, extra = {} }) {
  const c = CAMPAIGNS[campaignId]; const signal = bestEvidence(rawText, campaignId, sourceTitle); const role = roleFor(campaignId, signal); const offer = offerFor(campaignId, c, signal); const reach = reachability(rawText, domain, campaignId);
  return { id: `${campaignId}:${domain}`, campaign: campaignId, campaign_label: c.label, company, domain, url: `https://${domain}/`, source_url: sourceUrl, source_title: sourceTitle, published_date: publishedDate || '', signal: clean(signal, 320), score, sales_priority: score + reach, reachability: reach >= 8 ? '접근 우선' : reach <= -12 ? '대형·후순위' : '일반', verified_company: true, verified_by: verifiedBy, quality_reasons: [...(extra.quality_reasons || []), reach >= 8 ? '접근성 우선' : reach <= -12 ? '대형사 후순위' : ''].filter(Boolean), tool_signals: extra.tool_signals || [], recommended_role: role, role_targets: roleTargets(campaignId, signal), offer, subject: subjectFor(campaignId, company, signal), message_ko: messageKo(c, campaignId, company, signal, offer), message_en: messageEn(c, campaignId, company, signal), contact: null, contact_status: 'pending' };
}

async function rowsToLeads(rows, campaignId, excludes, jinaKey, limit = 12, maxJinaReads = 3) {
  const seen = new Set(), leads = []; let jinaReads = 0;
  for (const row of rows) {
    if (leads.length >= limit || blocked(row.url)) continue;
    let domain = rootHost(row.url), company = displayName(row.title, domain), text = `${row.title || ''} ${row.content || ''}`; let verifiedBy = 'official-domain'; const direct = !sourceStyle(row) && domainMatchesCompany(company, domain);
    if (!direct) {
      if (!jinaKey || jinaReads >= maxJinaReads) continue; jinaReads += 1;
      const page = await jinaRead(row.url, jinaKey); if (!page) continue; const resolved = resolveCompanyFromJina(page, row.url, campaignId); if (!resolved) continue;
      domain = resolved.domain; company = resolved.company; text = `${text} ${resolved.text} ${page.slice(0, 4200)}`; verifiedBy = 'jina-source-resolution';
    }
    if (!domain || excludes.has(domain) || seen.has(domain) || !hardPass(text, campaignId)) continue;
    const score = scoreRow(row, campaignId, text, domain, direct); if (score < 66) continue;
    seen.add(domain); leads.push(makeLead({ campaignId, company, domain, sourceUrl: row.url, sourceTitle: clean(row.title, 220), publishedDate: clean(row.published_date, 60), rawText: text, score, verifiedBy, extra: { quality_reasons: ['구매 신호 확인', direct ? '회사·도메인 일치' : '소스에서 실제 회사 추출'], tool_signals: [row._engine || 'tavily'] } }));
  }
  return leads;
}

async function dartLeads(key, excludes, cycle) { const rows = await dartSignals(key); if (!rows.length) return []; const start = (cycle * 2) % Math.max(2, rows.length), slice = rows.slice(start, start + 2); const resolved = await Promise.all(slice.map(async row => ({ row, official: await resolveOfficial(row.corp_name) }))); return resolved.filter(x => x.official && !excludes.has(x.official.domain)).map(({ row, official }) => makeLead({ campaignId: 'ax', company: clean(row.corp_name, 90), domain: official.domain, sourceUrl: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(row.rcept_no || '')}`, sourceTitle: clean(row.report_nm, 220), publishedDate: clean(row.rcept_dt, 30), rawText: `OpenDART 최근 공시: ${row.report_nm}`, score: 88, verifiedBy: 'opendart+official-domain', extra: { quality_reasons: ['최근 주요 공시 신호','공식 홈페이지 확인'], tool_signals: ['OpenDART','Tavily'] } })); }

export async function POST(request) {
  if (!tavilyConfigured()) return Response.json({ error: 'TAVILY_API_KEY가 필요합니다.' }, { status: 503 });
  let body = {}; try { body = await request.json(); } catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }
  const campaignId = CAMPAIGNS[body.campaign] ? body.campaign : 'kbw', campaign = CAMPAIGNS[campaignId]; const cycle = Math.max(0, Number.parseInt(body.cycle, 10) || 0); const excludes = new Set(Array.isArray(body.excludeDomains) ? body.excludeDomains.map(x => String(x).toLowerCase()) : []); const exaKey = clean(body?.tools?.exaKey, 300), jinaKey = clean(body?.tools?.jinaKey, 300), braveKey = clean(body?.tools?.braveKey, 300), dartKey = clean(body?.tools?.dartKey, 100); const variant = VARIANTS[cycle % VARIANTS.length]; const queries = campaign.queries.slice(0, 2).map((q, i) => `${q} ${i === cycle % 2 ? variant : ''}`.trim());
  try {
    const dartPromise = campaignId === 'ax' && dartKey ? dartLeads(dartKey, excludes, cycle).catch(() => []) : Promise.resolve([]);
    const search = await tavilySearchMany(queries, { maxResults: 12, timeRange: 'year', excludeDomains: ALWAYS_BLOCKED, topic: 'general' });
    let leads = await rowsToLeads(search.results, campaignId, excludes, jinaKey, 12, 3);
    let exaUsed = false;
    if (leads.length < 8 && exaKey) { try { const extra = await exaSearch(`${campaign.exaQuery} ${variant}`, exaKey); exaUsed = true; const more = await rowsToLeads(extra, campaignId, new Set([...excludes, ...leads.map(x => x.domain)]), jinaKey, 10, 3); leads.push(...more); } catch { /* Tavily remains usable; Exa is optional. */ } }
    let braveUsed = false;
    if (leads.length < 6 && braveKey) { try { const extra = await braveSearch(campaign.queries[cycle % campaign.queries.length], braveKey); braveUsed = true; const more = await rowsToLeads(extra, campaignId, new Set([...excludes, ...leads.map(x => x.domain)]), jinaKey, 8, 1); leads.push(...more); } catch { /* Existing results remain usable. */ } }
    const dartExtra = await dartPromise, dartUsed = dartExtra.length > 0; if (campaignId === 'ax' && dartExtra.length) leads = [...dartExtra, ...leads];
    const unique = [], seen = new Set(); let largeCount = 0;
    for (const lead of leads.sort((a, b) => (b.sales_priority || b.score) - (a.sales_priority || a.score))) {
      if (!lead.domain || seen.has(lead.domain) || excludes.has(lead.domain)) continue;
      const large = lead.reachability === '대형·후순위'; if (large && largeCount >= 2) continue;
      if (large) largeCount += 1; seen.add(lead.domain); unique.push(lead); if (unique.length >= 12) break;
    }
    return Response.json({ campaign: campaignId, campaign_label: campaign.label, leads: unique, meta: { ...search.meta, returned: unique.length, cycle, jina_used: Boolean(jinaKey), brave_used: braveUsed, exa_used: exaUsed, opendart_used: dartUsed, hard_filter: true, reachability_priority: true, message_schema: 'reply-first-v1' } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return Response.json({ error: clean(error?.message || error, 500), campaign: campaignId }, { status: Number(error?.status) || 502 }); }
}
