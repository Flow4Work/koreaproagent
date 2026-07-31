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
  'cryptorank.io','coinpedia.org','iq.wiki','ninjapromo.io','fintechnews.hk','gfma.org','coinmarketcal.com','beincrypto.com',
  'koreablockchainweek.com','lu.ma','luma.com','bitcoin.com'
];

const LARGE_KBW_DOMAINS = new Set([
  'dunamu.com','upbit.com','bithumbcorp.com','bithumb.com','coinone.co.kr','korbit.co.kr','wemix.com'
]);

const CAMPAIGNS = {
  kbw: {
    label: 'KBW 단체복', market: 'global-to-korea',
    queries: [
      '2026 Korea Blockchain Week sponsor speaker partner side event protocol startup Seoul',
      'site:lu.ma 2026 Seoul KBW crypto web3 side event meetup protocol startup',
      '2026 upcoming TGE token generation mainnet launch emerging crypto protocol startup',
      '2026 web3 startup funding partnership fast growing protocol community launch',
      '2026 crypto project Korea expansion Korean community exchange listing Seoul Asia partnership',
      '2026 KBW Seoul founders team attending networking protocol community no booth'
    ],
    exaQuery: 'Reachable emerging web3 companies and protocols that are strong sales prospects around Korea Blockchain Week 2026: confirmed Seoul or KBW participation, Luma side events, upcoming TGE or mainnet launch, recent funding or rapid momentum, or active Korea/Asia expansion. Exclude generic crypto pages, media, directories, and major top-market-cap projects.',
    signal: /(kbw|korea blockchain week|seoul|korea|tge|token generation|mainnet|side event|meetup|sponsor|community|conference|summit|launch|funding|raised|partnership|testnet|airdrop|listing|expansion)/i,
    intent: /(host|hosting|organizer|sponsor|side event|meetup|booth|launch|tge|mainnet|activation|funding|raised|partner|listing|expansion|attend|서울|한국|행사|주최|스폰서|밋업|출시|투자|파트너|상장|확장)/i,
    koOffer: '서울 현지에서 티셔츠·후디·스태프 의류를 제작해 호텔·사무실·행사장으로 납품',
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

const VARIANTS = ['recent announcement upcoming event','small team startup launch partner','2026 expansion community activation','funding tge emerging protocol'];
const AI_VENDOR = /(ai 솔루션|ai 전문|생성형 ai 스타트업|ai platform|ai company|인공지능 전문기업|automation vendor|rpa 솔루션)/i;
const AX_BUYER = /(고객센터|고객지원|물류|제조|유통|커머스|여행|교육|금융|보험|병원|프랜차이즈|erp|운영|영업|백오피스|스마트공장|생산)/i;
const SOURCE_TITLE = /(top\s*\d+|best .*events|events? to attend|conference[s]? .*2026|event calendar|global adoption index|report|guide|list of|news roundup|press release|pr 2026|organizations?\s*\|)/i;
const SMALL_TEAM_SIGNAL = /(startup|early[- ]stage|seed|series\s*[abc]|emerging|independent|protocol|project team|small team|community-led|스타트업|중소|신생|초기|시드|프리시드|series a|series b|series c)/i;
const LARGE_TEAM_SIGNAL = /(fortune\s*500|global leader|market leader|one of the largest|major exchange|enterprise group|conglomerate|대기업|그룹사|업계 최대|국내 최대|글로벌 대형)/i;
const CRYPTO_SIGNAL = /(crypto|blockchain|web3|defi|exchange|token|tge|mainnet|protocol|layer\s*[12]|l1|l2|wallet|gamefi|가상자산|블록체인|토큰|프로토콜)/i;
const KBW_NAME = /(kbw|korea blockchain week)/i;
const KBW_EXPLICIT_PARTICIPATION = /(speaker|speaking|sponsor|sponsoring|official partner|booth|exhibit|exhibitor|host|hosting|organizer|organizing|side event|meetup|attend|attending|participat|activation|연사|스폰서|후원|부스|참가|참여|주최|사이드 이벤트|밋업)/i;
const KOREA_ACTIVITY = /(seoul|korea|서울|한국)/i;
const EVENT_ACTIVITY = /(event|meetup|conference|summit|community|sponsor|activation|행사|밋업|컨퍼런스|서밋|스폰서|커뮤니티)/i;
const MERCH_BUYING_SIGNAL = /(side event|meetup|booth|exhibit|exhibitor|sponsor|activation|community event|team event|staff|merch|shirt|hoodie|행사|밋업|부스|스폰서|후원|커뮤니티|스태프|굿즈|단체복)/i;
const LAUNCH_SIGNAL = /(tge|token generation|token launch|mainnet(?: launch)?|testnet(?: launch)?|launchpool|launchpad|airdrop|genesis|출시|토큰 생성|메인넷|테스트넷|에어드롭)/i;
const MOMENTUM_SIGNAL = /(raised|raises|funding|funded|seed round|series\s*[abc]|strategic round|investment|backed by|partnership|partners with|ecosystem growth|user growth|tvl|volume|adoption|grant|accelerator|투자 유치|펀딩|파트너십|성장|사용자 증가|거래량)/i;
const KOREA_EXPANSION_SIGNAL = /((seoul|korea|한국|서울).{0,80}(listing|exchange|community|partner|expansion|market|meetup|conference|launch|상장|거래소|커뮤니티|파트너|확장|시장|밋업|행사))|((listing|exchange|community|partner|expansion|market|meetup|conference|launch|상장|거래소|커뮤니티|파트너|확장|시장|밋업|행사).{0,80}(seoul|korea|한국|서울))/i;
const KOREAN_CORP_SIGNAL = /(주식회사|㈜|유한회사|대표이사|사업자등록|본사|한국 법인|대한민국|서울특별시|korea co\.?,?\s*ltd)/i;
const GENERIC_COMPANY_NAMES = new Set([
  'bitcoin','crypto','blockchain','web3','defi','nft','token','ethereum','seoul','korea','kbw','korea blockchain week',
  'conference','summit','event','events','news','home','homepage','official site'
]);

const TOP50_FALLBACK = [
  'bitcoin','ethereum','tether','bnb','xrp','solana','usd coin','usdc','dogecoin','cardano','tron','avalanche','chainlink',
  'stellar','sui','hedera','shiba inu','toncoin','polkadot','bitcoin cash','litecoin','uniswap','near protocol','aptos','internet computer',
  'dai','pepe','aave','bittensor','render','arbitrum','optimism','polygon','mantle','kaspa','cosmos','filecoin','vechain','injective','maker',
  'the graph','algorand','fantom','celestia','lido dao','immutable','theta network','sei','flow'
];
let top50Cache = { expiresAt: 0, names: new Set(TOP50_FALLBACK), source: 'fallback' };

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
function normalizeName(value = '') { return clean(value, 160).toLowerCase().replace(/\b(foundation|labs?|protocol|network|dao|official|finance|chain)\b/g, ' ').replace(/[^a-z0-9가-힣]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function domainMatchesCompany(company = '', domain = '') { const stem = (rootHost(`https://${domain}`) || domain).split('.')[0].replace(/[-_]/g, '').toLowerCase(); if (!stem || stem.length < 3) return false; const words = normalizedWords(company).map(x => x.replace(/[^a-z0-9가-힣]/g, '')); return words.some(w => w.length >= 3 && (w.includes(stem) || stem.includes(w))) || clean(company, 120).toLowerCase().replace(/[^a-z0-9가-힣]/g, '').includes(stem); }

function companyEntityPass(company = '', domain = '') {
  const name = clean(company, 120).toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').trim();
  const stem = String(domain || '').split('.')[0].replace(/[-_]+/g, ' ').toLowerCase().trim();
  if (!name || name.length < 2 || SOURCE_TITLE.test(company)) return false;
  if (GENERIC_COMPANY_NAMES.has(name) || GENERIC_COMPANY_NAMES.has(stem)) return false;
  return true;
}

function isKoreanCompany(company = '', domain = '', text = '') {
  const d = String(domain || '').toLowerCase();
  if (d.endsWith('.kr') || LARGE_KBW_DOMAINS.has(d)) return true;
  return /[가-힣]{2,}/.test(company) && KOREAN_CORP_SIGNAL.test(text);
}

async function fetchJson(url, options = {}, timeoutMs = 7500) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
    const text = await r.text();
    if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
    return text ? JSON.parse(text) : {};
  } finally { clearTimeout(timer); }
}

async function loadTop50Coins() {
  if (top50Cache.expiresAt > Date.now()) return top50Cache;
  try {
    const data = await fetchJson('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false', { headers: { Accept: 'application/json' } }, 4500);
    if (Array.isArray(data) && data.length >= 40) {
      const names = new Set(TOP50_FALLBACK);
      for (const coin of data.slice(0, 50)) {
        const name = normalizeName(coin?.name || '');
        const symbol = clean(coin?.symbol, 30).toLowerCase();
        if (name) names.add(name);
        if (symbol.length >= 4) names.add(symbol);
      }
      top50Cache = { expiresAt: Date.now() + 15 * 60 * 1000, names, source: 'coingecko' };
      return top50Cache;
    }
  } catch { /* fallback below */ }
  top50Cache = { expiresAt: Date.now() + 5 * 60 * 1000, names: new Set(TOP50_FALLBACK), source: 'fallback' };
  return top50Cache;
}

function top50Project(company = '', domain = '', rankedNames = new Set()) {
  const name = normalizeName(company);
  const stem = normalizeName(String(domain || '').split('.')[0].replace(/[-_]+/g, ' '));
  if (!name && !stem) return false;
  for (const coin of rankedNames) {
    const key = normalizeName(coin);
    if (!key || key.length < 3) continue;
    if (name === key || stem === key || name.startsWith(`${key} `) || stem.startsWith(`${key} `)) return true;
  }
  return false;
}

function kbwParticipation(text = '') {
  const value = clean(text, 5000);
  if (KBW_NAME.test(value) && KBW_EXPLICIT_PARTICIPATION.test(value)) return { code: 'confirmed', label: '확정' };
  if (KBW_NAME.test(value) || (KOREA_ACTIVITY.test(value) && EVENT_ACTIVITY.test(value))) return { code: 'likely', label: '유력' };
  return { code: 'unknown', label: '미확인' };
}

function kbwOpportunity(text = '', domain = '') {
  const participation = kbwParticipation(text);
  const launch = LAUNCH_SIGNAL.test(text);
  const momentum = MOMENTUM_SIGNAL.test(text);
  const koreaExpansion = KOREA_EXPANSION_SIGNAL.test(text);
  const merch = MERCH_BUYING_SIGNAL.test(text);
  const reachable = SMALL_TEAM_SIGNAL.test(text) && !LARGE_TEAM_SIGNAL.test(text) && !LARGE_KBW_DOMAINS.has(domain);
  let score = 0;
  const reasons = [];
  const lanes = [];

  if (participation.code === 'confirmed') { score += 30; reasons.push('KBW·서울 방문 확정 신호'); lanes.push('confirmed-korea'); }
  else if (participation.code === 'likely') { score += 15; reasons.push('KBW·서울 방문 유력'); lanes.push('likely-korea'); }
  if (launch) { score += 25; reasons.push('TGE·메인넷·출시 신호'); lanes.push('launch'); }
  if (momentum) { score += 20; reasons.push('최근 투자·성장·파트너십 신호'); lanes.push('momentum'); }
  if (koreaExpansion) { score += 15; reasons.push('한국 확장·커뮤니티 신호'); lanes.push('korea-expansion'); }
  if (reachable) { score += 10; reasons.push('접근 가능한 중소형 팀'); }
  if (merch) { score += 8; reasons.push('현장·굿즈 구매 가능성'); }
  if (LARGE_TEAM_SIGNAL.test(text) || LARGE_KBW_DOMAINS.has(domain)) score -= 15;

  const lane = lanes[0] || (merch ? 'event-buying' : '');
  return { score: Math.max(-15, Math.min(100, score)), reasons, lanes, lane, launch, momentum, koreaExpansion, participation };
}

function hardPass(text, id) {
  const c = CAMPAIGNS[id];
  if (!c.signal.test(text)) return false;
  if (id === 'kbw') {
    if (!CRYPTO_SIGNAL.test(text)) return false;
    const opportunity = kbwOpportunity(text);
    return opportunity.participation.code !== 'unknown' || opportunity.launch || opportunity.momentum || opportunity.koreaExpansion;
  }
  if (!c.intent.test(text)) return false;
  if (id === 'apparel') return /(개최|예정|모집|참가|주최|organizer|upcoming|registration|staff)/i.test(text);
  if (id === 'ax') return !AI_VENDOR.test(text) && AX_BUYER.test(text) && /(확장|채용|투자|증가|전환|혁신|자동화|수주|신규|계약|hiring|expansion|operations)/i.test(text);
  if (id === 'video') return /(교회|성당|사찰|설교|예배|법문|법회)/i.test(text) && /(정기|매주|주일|방송|영상|콘텐츠|미디어|설교|법문)/i.test(text);
  if (id === 'dev') return /(에이전시|agency|studio|브랜딩|마케팅|디자인|비개발|제작사)/i.test(text) && /(파트너|협력사|외주|화이트라벨|수주|프로젝트|partner|outsourc|capacity)/i.test(text);
  return false;
}

function reachability(text, domain, id) {
  let score = 0;
  if (SMALL_TEAM_SIGNAL.test(text)) score += 12;
  if (/(founder|co-founder|head of marketing|community lead|events lead|operations lead|partnerships lead|대표|마케팅 담당|커뮤니티 담당)/i.test(text)) score += 6;
  if (LARGE_TEAM_SIGNAL.test(text)) score -= 18;
  if (id === 'kbw' && LARGE_KBW_DOMAINS.has(domain)) score -= 22;
  return Math.max(-30, Math.min(20, score));
}

function scoreRow(row, id, text, domain, verifiedDirect = false) {
  const c = CAMPAIGNS[id]; let score = 0;
  if (c.signal.test(text)) score += 16;
  if (c.intent.test(text)) score += 14;
  if (hardPass(text, id)) score += 20;
  if (verifiedDirect) score += 8;
  if (row.published_date) score += 5;
  score += Math.min(7, Math.round((Number(row.score) || 0) * 7));
  score += reachability(text, domain, id);
  if (id === 'kbw') score += Math.min(30, Math.round(kbwOpportunity(text, domain).score * 0.45));
  return Math.max(0, Math.min(100, score));
}

function roleFor(id, signal = '') {
  if (id === 'kbw') {
    if (/(side event|meetup|booth|sponsor|activation|행사|밋업|스폰서)/i.test(signal)) return 'Events Lead';
    if (LAUNCH_SIGNAL.test(signal)) return 'Head of Marketing';
    if (/(partner|partnership|expansion|파트너|확장)/i.test(signal)) return 'Partnerships Lead';
    return 'Community Lead';
  }
  if (id === 'apparel') return /(기업|워크숍|체육대회)/i.test(signal) ? '행사 담당자' : 'Marketing Lead';
  if (id === 'ax') return /(고객센터|cs|고객지원)/i.test(signal) ? 'CX Lead' : 'Operations Lead';
  if (id === 'video') return 'Media Lead';
  return 'Founder';
}

function roleTargets(id, signal = '') {
  if (id === 'kbw') return ['Events Lead','Operations Lead','Partnerships Lead','Community Lead','Head of Marketing','Founder','CEO'];
  if (id === 'apparel') return ['행사 담당자','운영 담당자','마케팅 담당자','총무 담당자','대표'];
  if (id === 'ax') return ['Operations Lead','CX Lead','COO','Founder','CEO'];
  if (id === 'video') return ['Media Lead','Content Lead','홍보 담당자','대표'];
  return ['Founder','CEO','PM','Product Lead','Partnerships Lead'];
}

function offerFor(id, c, signal = '') {
  if (id === 'kbw') {
    if (LAUNCH_SIGNAL.test(signal)) return 'TGE·출시 일정과 KBW 방한 가능성에 맞춰 팀웨어·스태프 의류·굿즈를 서울 현지에서 제작·납품';
    if (/(side event|meetup|booth|sponsor|activation|행사|밋업|스폰서)/i.test(signal)) return 'KBW 사이드 이벤트·밋업용 티셔츠·후디·스태프 의류를 서울 현지에서 소량부터 제작·납품';
    return 'KBW 기간 서울 방문 일정이 잡히면 팀웨어·스태프 의류·간단한 행사 굿즈를 현지에서 제작·납품';
  }
  return c.koOffer;
}

function subjectFor(id, company, participationCode = '', language = 'ko') {
  if (id === 'kbw' && language === 'ko') return participationCode === 'confirmed' ? `${company} KBW 행사 준비 관련` : `${company} KBW 서울 일정 관련`;
  if (id === 'kbw') return participationCode === 'confirmed' ? `Quick question about ${company}'s KBW plans` : `Quick question about ${company} in Seoul during KBW`;
  if (id === 'ax') return `${company} 운영 관련 한 가지 질문`;
  if (id === 'video') return `${company} 영상 운영 관련 한 가지 질문`;
  if (id === 'dev') return `${company} 개발 일정 관련 한 가지 질문`;
  return `${company} 행사 준비 관련 한 가지 질문`;
}

function bestEvidence(text, id, fallback = '') {
  const c = CAMPAIGNS[id];
  const parts = String(text || '').split(/(?<=[.!?。！？])\s+|\n+/).map(x => sentence(x, 220)).filter(x => x.length >= 24 && x.length <= 220);
  let best = ''; let bestScore = -1;
  for (const part of parts) {
    let score = 0;
    if (c.signal.test(part)) score += 4;
    if (c.intent.test(part)) score += 5;
    if (/(2026|recent|upcoming|announc|launch|host|sponsor|meetup|event|funding|raised|partner|listing|서울|한국|예정|개최|출시|투자|파트너|상장)/i.test(part)) score += 3;
    if (id === 'kbw' && KBW_NAME.test(part)) score += 4;
    if (id === 'kbw' && KBW_EXPLICIT_PARTICIPATION.test(part)) score += 4;
    if (id === 'kbw' && (LAUNCH_SIGNAL.test(part) || MOMENTUM_SIGNAL.test(part))) score += 4;
    if (SOURCE_TITLE.test(part)) score -= 4;
    if (score > bestScore) { bestScore = score; best = part; }
  }
  return bestScore >= 6 ? best : sentence(fallback, 180);
}

function replyQuestion(id, participationCode = '') {
  if (id === 'kbw') return participationCode === 'confirmed' ? '서울 일정용 팀웨어나 스태프 굿즈 준비는 이미 끝났나요?' : '올해 KBW 기간에 팀에서 서울에 올 가능성이 있나요?';
  if (id === 'apparel') return '이번 행사 단체복이나 스태프 의류는 이미 준비가 끝나셨을까요?';
  if (id === 'ax') return '지금 팀에서 반복업무 자동화를 실제로 검토 중인 게 하나라도 있을까요?';
  if (id === 'video') return '정기 영상의 편집·자막·쇼츠를 지금 내부에서 전부 처리하고 계신가요?';
  return '프로젝트가 몰릴 때 외부 개발 인력을 잠깐 붙일 필요가 있으신가요?';
}

function messageKo(c, id, company, signal, offer, participationCode = '') {
  const trigger = signal || `${company}의 최근 활동`;
  if (id === 'kbw' && participationCode === 'confirmed') return `안녕하세요.\n\n${trigger} 내용을 보고 연락드렸습니다. KBW 기간 서울에서 사용할 팀웨어나 스태프 굿즈는 이미 준비가 끝나셨을까요?\n\n서울 현지에서 티셔츠·후디·행사 굿즈를 제작해 호텔·사무실·행사장으로 납품할 수 있습니다. 아직 확정 전이라면 가능한 옵션 몇 가지만 보내드리겠습니다.`;
  if (id === 'kbw') return `안녕하세요.\n\n${trigger} 내용을 보고 한 가지만 여쭤보려고 연락드렸습니다. 올해 KBW 기간에 팀에서 서울에 오실 가능성이 있나요?\n\n행사나 부스가 없어도 팀 일정이 있다면 티셔츠·스태프 의류·간단한 굿즈를 서울에서 현지 제작해 전달할 수 있습니다. 일정 검토 중이면 가능한 옵션 몇 가지만 보내드리겠습니다.`;
  if (id === 'ax') return `안녕하세요.\n\n${trigger} 내용을 보고 한 가지만 여쭤보려고 연락드렸습니다. 지금 팀에서 반복업무 자동화를 실제로 검토 중인 게 하나라도 있을까요? 있다면 업무 이름만 한 줄 보내주세요. 큰 구축 제안 대신 1~2주 안에 작은 PoC로 확인 가능한지와 대략적인 범위만 먼저 답드리겠습니다.`;
  if (id === 'video') return `안녕하세요.\n\n${trigger} 내용을 보고 한 가지만 여쭤보려고 연락드렸습니다. 정기 영상의 편집·자막·쇼츠를 지금 내부에서 전부 처리하고 계신가요? 외주를 비교 중이시라면 최근 영상 하나만 기준으로 어떤 결과물과 납기가 가능한지 먼저 짧게 보내드릴 수 있습니다. 관심 있으시면 “비교”라고만 답 주셔도 됩니다.`;
  if (id === 'dev') return `안녕하세요.\n\n${trigger} 내용을 보고 한 가지만 여쭤보려고 연락드렸습니다. 프로젝트가 몰릴 때 외부 개발 인력을 잠깐 붙일 필요가 있으신가요? 지금 일정이 밀린 프로젝트가 하나라도 있다면 웹·앱·내부툴 중 무엇인지 한 줄만 보내주세요. 투입 가능 여부와 일정부터 짧게 답드리겠습니다.`;
  return `안녕하세요.\n\n${trigger} 내용을 보고 한 가지만 여쭤보려고 연락드렸습니다. 이번 행사 단체복이나 스태프 의류는 이미 준비가 끝나셨을까요? 아직 업체나 수량이 확정 전이라면 일정에 맞는 제품과 납기 옵션 몇 가지만 비교용으로 보내드릴 수 있습니다. 준비 전이시면 “아직”이라고만 답 주셔도 됩니다.`;
}

function messageEn(c, id, company, signal, participationCode = '') {
  const trigger = signal || `${company}'s recent activity`;
  if (id === 'kbw' && participationCode === 'confirmed') return `Hi,\n\nI saw ${trigger}. Quick question — have you already sorted team shirts or staff merch for Seoul? I work with a local production team here in Korea, so we can handle small-to-mid runs locally and deliver to your hotel, office or venue instead of shipping boxes into the country. If merch is still open, I can send a few local options.`;
  if (id === 'kbw') return `Hi,\n\nI saw ${trigger}. Quick question — is there a chance your team will be in Seoul during KBW this year? Even without a booth or side event, we can produce team shirts, staff wear and simple merch locally in Seoul and deliver to your hotel, office or venue. If Seoul is being discussed, happy to send a few local options.`;
  return `Hi,\n\nI saw ${trigger} and wanted to ask one quick question. Is this something your team is actively working on right now? If yes, reply with the timing and I’ll send one concrete option — no deck or call needed first.`;
}

async function braveSearch(query, key) { if (!key) return []; const params = new URLSearchParams({ q: clean(query, 390), count: '15', country: 'KR', safesearch: 'moderate', freshness: 'pm' }); const data = await fetchJson(`https://api.search.brave.com/res/v1/web/search?${params}`, { headers: { Accept: 'application/json', 'X-Subscription-Token': key } }, 7000); return (Array.isArray(data?.web?.results) ? data.web.results : []).map((r, i) => ({ title: clean(r.title, 260), url: clean(r.url, 500), content: clean(r.description, 900), score: Math.max(0, 1 - i / 20), published_date: clean(r.age, 60), _engine: 'brave' })).filter(r => /^https?:\/\//i.test(r.url)); }
async function exaSearch(query, key) { if (!key) return []; const start = new Date(Date.now() - 365 * 86400000).toISOString(); const data = await fetchJson('https://api.exa.ai/search', { method: 'POST', headers: { 'x-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query: clean(query, 600), type: 'fast', numResults: 10, startPublishedDate: start, excludeDomains: ALWAYS_BLOCKED, contents: { highlights: true } }) }, 9000); return (Array.isArray(data?.results) ? data.results : []).map((r, i) => ({ title: clean(r.title, 260), url: clean(r.url, 500), content: clean(Array.isArray(r.highlights) && r.highlights.length ? r.highlights.join(' ') : (r.text || ''), 1400), score: Math.max(0, 1 - i / 14), published_date: clean(r.publishedDate, 60), _engine: 'exa' })).filter(r => /^https?:\/\//i.test(r.url)); }
async function jinaRead(url, key) { if (!key || !/^https?:\/\//i.test(url)) return ''; const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 6000); try { const r = await fetch(`https://r.jina.ai/${url}`, { headers: { Authorization: `Bearer ${key}`, Accept: 'text/plain' }, signal: controller.signal, cache: 'no-store' }); if (!r.ok) return ''; return (await r.text()).slice(0, 22000); } catch { return ''; } finally { clearTimeout(timer); } }

function resolveCompanyFromJina(markdown, sourceUrl, campaignId, rankedNames = new Set()) {
  const sourceDomain = rootHost(sourceUrl); const c = CAMPAIGNS[campaignId]; const candidates = []; const re = /\[([^\]]{2,90})\]\((https?:\/\/[^)\s]+)\)/g; let m;
  while ((m = re.exec(markdown)) && candidates.length < 120) {
    const url = m[2]; const domain = rootHost(url); if (!domain || domain === sourceDomain || blocked(url) || sourceOnly(url)) continue;
    const anchor = clean(m[1], 90); if (/^(read more|learn more|website|official site|home|click here|source)$/i.test(anchor) || !companyEntityPass(anchor, domain)) continue;
    if (campaignId === 'kbw' && top50Project(anchor, domain, rankedNames)) continue;
    const around = clean(markdown.slice(Math.max(0, m.index - 180), Math.min(markdown.length, re.lastIndex + 260)), 560); const hay = `${anchor} ${domain} ${around}`; let score = 0;
    if (c.signal.test(hay)) score += 4; if (c.intent.test(hay)) score += 4; if (hardPass(hay, campaignId)) score += 10; if (domainMatchesCompany(anchor, domain)) score += 5; if (SMALL_TEAM_SIGNAL.test(hay)) score += 3; if (SOURCE_TITLE.test(anchor)) score -= 6;
    if (campaignId === 'kbw') score += Math.max(0, kbwOpportunity(hay, domain).score / 5);
    if (score >= 10) candidates.push({ url: `https://${domain}/`, domain, company: displayName(anchor, domain), score, text: hay });
  }
  candidates.sort((a, b) => b.score - a.score); return candidates[0] || null;
}

async function dartSignals(key) { if (!key) return []; const end = new Date(), start = new Date(end.getTime() - 21 * 86400000), ymd = d => d.toISOString().slice(0, 10).replace(/-/g, ''); const load = async type => { const q = new URLSearchParams({ crtfc_key: key, bgn_de: ymd(start), end_de: ymd(end), pblntf_ty: type, page_count: '100', sort: 'date', sort_mth: 'desc' }); const data = await fetchJson(`https://opendart.fss.or.kr/api/list.json?${q}`, {}, 7500); return data?.status === '000' && Array.isArray(data.list) ? data.list : []; }; const settled = await Promise.allSettled([load('B'), load('E')]); const rows = settled.flatMap(x => x.status === 'fulfilled' ? x.value : []); const signal = /(신규시설투자|타법인.*취득|영업양수|합병|분할|유상증자|단일판매.*공급계약|투자판단|신규사업|사업목적|주요사항|계약체결|자산.*취득)/i; const seen = new Set(); return rows.filter(r => signal.test(r.report_nm || '')).filter(r => { const k = `${r.corp_name}|${r.report_nm}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 9); }
async function resolveOfficial(company) { try { const r = await tavilySearch(`${company} 공식 홈페이지 회사`, { maxResults: 4, timeRange: 'year', excludeDomains: [...ALWAYS_BLOCKED, ...SOURCE_ONLY] }); const row = r.results.find(x => !blocked(x.url) && !sourceOnly(x.url) && domainMatchesCompany(company, rootHost(x.url))); if (!row) return null; const domain = rootHost(row.url); return domain && companyEntityPass(company, domain) ? { domain, url: `https://${domain}/` } : null; } catch { return null; } }

function makeLead({ campaignId, company, domain, sourceUrl, sourceTitle, publishedDate, rawText, score, verifiedBy, extra = {} }) {
  const c = CAMPAIGNS[campaignId];
  const signal = bestEvidence(rawText, campaignId, sourceTitle);
  const role = roleFor(campaignId, signal);
  const offer = offerFor(campaignId, c, signal);
  const reach = reachability(rawText, domain, campaignId);
  const participation = campaignId === 'kbw' ? kbwParticipation(rawText) : null;
  const opportunity = campaignId === 'kbw' ? kbwOpportunity(rawText, domain) : { score: 0, reasons: [], lane: '' };
  const language = campaignId === 'kbw' ? (isKoreanCompany(company, domain, rawText) ? 'ko' : 'en') : 'ko';
  const winLabel = opportunity.score >= 55 ? '승산 높음' : opportunity.score >= 30 ? '승산 있음' : campaignId === 'kbw' ? '탐색 후보' : '';
  return {
    id: `${campaignId}:${domain}`, campaign: campaignId, campaign_label: c.label, company, domain, url: `https://${domain}/`,
    source_url: sourceUrl, source_title: sourceTitle, published_date: publishedDate || '', signal: clean(signal, 320), score,
    sales_priority: score + opportunity.score, win_score: opportunity.score, win_label: winLabel, opportunity_lane: opportunity.lane || '',
    reachability: reach >= 8 ? '접근 우선' : reach <= -12 ? '대형·후순위' : '일반',
    kbw_status: participation?.label || '', kbw_status_code: participation?.code || '', outreach_language: language,
    verified_company: true, verified_by: verifiedBy,
    quality_reasons: [...(extra.quality_reasons || []), ...(opportunity.reasons || []), language === 'ko' ? '한국 회사 · 한글 메일' : '', winLabel].filter(Boolean),
    tool_signals: extra.tool_signals || [], recommended_role: role, role_targets: roleTargets(campaignId, signal), offer,
    outreach_goal: 'reply', outreach_stage: 'first_touch', reply_question: replyQuestion(campaignId, participation?.code || ''),
    subject: subjectFor(campaignId, company, participation?.code || '', language),
    message_ko: messageKo(c, campaignId, company, signal, offer, participation?.code || ''),
    message_en: messageEn(c, campaignId, company, signal, participation?.code || ''),
    contact: null, contact_status: 'pending'
  };
}

async function rowsToLeads(rows, campaignId, excludes, jinaKey, rankedNames, limit = 12, maxJinaReads = 4) {
  const seen = new Set(), leads = []; let jinaReads = 0;
  for (const row of rows) {
    if (leads.length >= limit || blocked(row.url)) continue;
    let domain = rootHost(row.url), company = displayName(row.title, domain), text = `${row.title || ''} ${row.content || ''}`; let verifiedBy = 'official-domain';
    const direct = !sourceStyle(row) && domainMatchesCompany(company, domain) && companyEntityPass(company, domain);
    if (!direct) {
      if (!jinaKey || jinaReads >= maxJinaReads) continue; jinaReads += 1;
      const page = await jinaRead(row.url, jinaKey); if (!page) continue;
      const resolved = resolveCompanyFromJina(page, row.url, campaignId, rankedNames); if (!resolved) continue;
      domain = resolved.domain; company = resolved.company; text = `${text} ${resolved.text} ${page.slice(0, 4200)}`; verifiedBy = 'jina-source-resolution';
    }
    if (!domain || excludes.has(domain) || seen.has(domain) || !companyEntityPass(company, domain) || !hardPass(text, campaignId)) continue;
    if (campaignId === 'kbw' && top50Project(company, domain, rankedNames)) continue;
    const score = scoreRow(row, campaignId, text, domain, direct); if (score < (campaignId === 'kbw' ? 56 : 66)) continue;
    seen.add(domain);
    leads.push(makeLead({
      campaignId, company, domain, sourceUrl: row.url, sourceTitle: clean(row.title, 220), publishedDate: clean(row.published_date, 60),
      rawText: text, score, verifiedBy,
      extra: { quality_reasons: ['실제 회사 확인', direct ? '회사·도메인 일치' : '외부 소스에서 실제 회사 추출'], tool_signals: [row._engine || 'tavily'] }
    }));
  }
  return leads;
}

async function dartLeads(key, excludes, cycle) {
  const rows = await dartSignals(key); if (!rows.length) return [];
  const start = (cycle * 2) % Math.max(2, rows.length), slice = rows.slice(start, start + 2);
  const resolved = await Promise.all(slice.map(async row => ({ row, official: await resolveOfficial(row.corp_name) })));
  return resolved.filter(x => x.official && !excludes.has(x.official.domain)).map(({ row, official }) => makeLead({
    campaignId: 'ax', company: clean(row.corp_name, 90), domain: official.domain,
    sourceUrl: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(row.rcept_no || '')}`,
    sourceTitle: clean(row.report_nm, 220), publishedDate: clean(row.rcept_dt, 30),
    rawText: `OpenDART 최근 공시: ${row.report_nm}`, score: 88, verifiedBy: 'opendart+official-domain',
    extra: { quality_reasons: ['최근 주요 공시 신호','공식 홈페이지 확인'], tool_signals: ['OpenDART','Tavily'] }
  }));
}

function searchQueries(campaignId, cycle) {
  const campaign = CAMPAIGNS[campaignId];
  if (campaignId !== 'kbw') return campaign.queries.slice(0, 2);
  const pool = campaign.queries;
  const start = (cycle * 2) % pool.length;
  return [pool[start], pool[(start + 1) % pool.length]];
}

export async function POST(request) {
  if (!tavilyConfigured()) return Response.json({ error: 'TAVILY_API_KEY가 필요합니다.' }, { status: 503 });
  let body = {}; try { body = await request.json(); } catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }
  const campaignId = CAMPAIGNS[body.campaign] ? body.campaign : 'kbw', campaign = CAMPAIGNS[campaignId];
  const cycle = Math.max(0, Number.parseInt(body.cycle, 10) || 0);
  const excludes = new Set(Array.isArray(body.excludeDomains) ? body.excludeDomains.map(x => String(x).toLowerCase()) : []);
  const exaKey = clean(body?.tools?.exaKey, 300), jinaKey = clean(body?.tools?.jinaKey, 300), braveKey = clean(body?.tools?.braveKey, 300), dartKey = clean(body?.tools?.dartKey, 100);
  const variant = VARIANTS[cycle % VARIANTS.length];
  const queries = searchQueries(campaignId, cycle).map((q, i) => `${q} ${i === cycle % 2 ? variant : ''}`.trim());
  try {
    const top50 = campaignId === 'kbw' ? await loadTop50Coins() : { names: new Set(), source: 'unused' };
    const dartPromise = campaignId === 'ax' && dartKey ? dartLeads(dartKey, excludes, cycle).catch(() => []) : Promise.resolve([]);
    const search = await tavilySearchMany(queries, { maxResults: 14, timeRange: 'year', excludeDomains: ALWAYS_BLOCKED, topic: 'general' });
    let leads = await rowsToLeads(search.results, campaignId, excludes, jinaKey, top50.names, 12, 4);
    let exaUsed = false;
    if (leads.length < 8 && exaKey) {
      try {
        const extra = await exaSearch(`${campaign.exaQuery} ${variant}`, exaKey); exaUsed = true;
        const more = await rowsToLeads(extra, campaignId, new Set([...excludes, ...leads.map(x => x.domain)]), jinaKey, top50.names, 10, 3); leads.push(...more);
      } catch { /* Tavily remains usable; Exa is optional. */ }
    }
    let braveUsed = false;
    if (leads.length < 6 && braveKey) {
      try {
        const extra = await braveSearch(searchQueries(campaignId, cycle)[0], braveKey); braveUsed = true;
        const more = await rowsToLeads(extra, campaignId, new Set([...excludes, ...leads.map(x => x.domain)]), jinaKey, top50.names, 8, 1); leads.push(...more);
      } catch { /* Existing results remain usable. */ }
    }
    const dartExtra = await dartPromise, dartUsed = dartExtra.length > 0; if (campaignId === 'ax' && dartExtra.length) leads = [...dartExtra, ...leads];
    const unique = [], seen = new Set(); let largeCount = 0;
    for (const lead of leads.sort((a, b) => (b.sales_priority || b.score) - (a.sales_priority || a.score))) {
      if (!lead.domain || seen.has(lead.domain) || excludes.has(lead.domain)) continue;
      if (campaignId === 'kbw' && top50Project(lead.company, lead.domain, top50.names)) continue;
      const large = lead.reachability === '대형·후순위'; if (large && largeCount >= 1) continue;
      if (large) largeCount += 1; seen.add(lead.domain); unique.push(lead); if (unique.length >= 12) break;
    }
    return Response.json({
      campaign: campaignId, campaign_label: campaign.label, leads: unique,
      meta: {
        ...search.meta, returned: unique.length, cycle, jina_used: Boolean(jinaKey), brave_used: braveUsed, exa_used: exaUsed, opendart_used: dartUsed,
        hard_filter: true, company_entity_filter: true, top50_marketcap_filter: campaignId === 'kbw', top50_source: top50.source,
        opportunity_lanes: campaignId === 'kbw' ? ['confirmed-korea','likely-korea','launch','momentum','korea-expansion'] : [],
        opportunity_priority: true, language_routing: true, reachability_priority: true, message_schema: 'reply-first-v4', kbw_participation_gate: false
      }
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: clean(error?.message || error, 500), campaign: campaignId }, { status: Number(error?.status) || 502 });
  }
}
