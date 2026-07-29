import { tavilyConfigured, tavilySearchMany } from '../lib/web-search.js';

const BLOCKED = [
  'instagram.com','facebook.com','x.com','twitter.com','youtube.com','reddit.com','pinterest.com','linkedin.com',
  'wikipedia.org','medium.com','techcrunch.com','reuters.com','bloomberg.com','forbes.com','yahoo.com','prnewswire.com','businesswire.com'
];

const CAMPAIGNS = {
  kbw: {
    label: 'KBW 단체복',
    market: 'global-to-korea',
    role: 'Events / Marketing / Community Lead',
    queries: [
      'Korea Blockchain Week 2026 sponsor partner side event Seoul web3 company',
      'KBW 2026 Seoul meetup side event sponsor web3 project',
      'Korea Blockchain Week 2026 ecosystem partner conference event'
    ],
    signal: /(kbw|korea blockchain week|seoul|side event|meetup|sponsor|partner|conference|summit)/i,
    intent: /(event|meetup|conference|sponsor|partner|community|marketing|seoul)/i,
    koOffer: '서울 현지 단체복·행사 의류를 빠르게 제작해 행사 전 숙소/행사장까지 전달',
    enOffer: 'local Seoul event apparel production with fast delivery before the event'
  },
  apparel: {
    label: '국내 단체복',
    market: 'korea',
    role: '행사 / 마케팅 / 총무 담당자',
    queries: [
      '2026 서울 컨퍼런스 페스티벌 워크숍 행사 주최사 참가 모집',
      '2026 한국 기업 워크숍 체육대회 행사 축제 컨퍼런스',
      '2026 서울 expo summit conference festival organizer'
    ],
    signal: /(행사|축제|컨퍼런스|워크숍|체육대회|expo|summit|conference|festival|meetup|박람회)/i,
    intent: /(주최|참가|모집|스폰서|운영|행사|event|organizer|staff)/i,
    koOffer: '행사 일정에 맞춰 단체복을 빠르게 제작하고 원하는 장소로 납품',
    enOffer: 'fast local production of team apparel for upcoming events'
  },
  ax: {
    label: 'AX PoC',
    market: 'korea',
    role: '대표 / 운영 / DX·AI 담당자',
    queries: [
      '2026 한국 스타트업 AI 자동화 도입 운영 고객지원 영업 업무혁신',
      '2026 한국 중소기업 생성형 AI 업무 자동화 도입 사례 채용',
      '2026 Korean startup AI automation operations customer support hiring'
    ],
    signal: /(ai|인공지능|자동화|생성형|업무혁신|dx|ax|운영|고객지원|cs|영업)/i,
    intent: /(도입|확장|채용|투자|증가|launch|hiring|funding|automation)/i,
    koOffer: '큰 구축 전에 1~2주 안에 반복업무 하나를 자동화하는 소형 AX PoC',
    enOffer: 'a small 1–2 week AI automation proof of concept before a larger build'
  },
  video: {
    label: '영상 제작',
    market: 'korea',
    role: '콘텐츠 / 홍보 / 미디어 담당자',
    queries: [
      '2026 교회 유튜브 설교 영상 쇼츠 콘텐츠 행사',
      '2026 사찰 법문 유튜브 영상 콘텐츠 행사 홍보',
      '한국 종교 단체 유튜브 쇼츠 영상 콘텐츠 정기 업로드'
    ],
    signal: /(교회|사찰|법문|설교|유튜브|영상|쇼츠|콘텐츠|행사|youtube|video|shorts)/i,
    intent: /(정기|매주|업로드|행사|설교|법문|콘텐츠|channel|media)/i,
    koOffer: '원본 영상이나 주제를 받아 자막·쇼츠·썸네일까지 싸고 빠르게 반복 제작',
    enOffer: 'fast, low-cost recurring video, shorts, subtitles and thumbnails'
  },
  dev: {
    label: '개발 Capacity',
    market: 'korea',
    role: '대표 / PM / 디지털·프로덕트 담당자',
    queries: [
      '2026 한국 브랜딩 에이전시 웹사이트 앱 프로젝트 제작 수주',
      '2026 마케팅 디자인 에이전시 웹 개발 프로젝트 파트너',
      '2026 한국 스타트업 MVP 출시 개발 인력 채용 프로젝트'
    ],
    signal: /(에이전시|agency|studio|브랜딩|마케팅|디자인|웹|앱|mvp|프로젝트|개발)/i,
    intent: /(수주|출시|런칭|채용|프로젝트|제작|파트너|launch|hiring|build)/i,
    koOffer: '필요한 기간만 웹·앱·내부툴 개발 capacity를 붙이는 소형 외주/화이트라벨 파트너',
    enOffer: 'flexible white-label development capacity for web, app and internal-tool projects'
  }
};

const VARIANTS = [
  'recent announcement hiring expansion event',
  '2026 upcoming launch organizer sponsor',
  'new project partnership operations'
];

function clean(value, max = 600) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function host(value = '') {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

function rootHost(value = '') {
  const h = host(value);
  const parts = h.split('.');
  if (parts.length <= 2) return h;
  const suffix2 = parts.slice(-2).join('.');
  const suffix3 = parts.slice(-3).join('.');
  if (/\.(co\.kr|or\.kr|go\.kr|com\.au|co\.uk)$/.test(`.${suffix3}`)) return suffix3;
  return suffix2;
}

function blocked(url = '') {
  const h = rootHost(url);
  return !h || BLOCKED.some(domain => h === domain || h.endsWith(`.${domain}`));
}

function displayName(title = '', domain = '') {
  const raw = clean(title, 180)
    .replace(/\s*[|｜].*$/, '')
    .replace(/\s+[–—-]\s+.*$/, '')
    .replace(/^(home|homepage|official site)\s*[:|-]?\s*/i, '')
    .trim();
  if (raw.length >= 2 && raw.length <= 70) return raw;
  const base = (domain.split('.')[0] || domain).replace(/[-_]+/g, ' ');
  return base.replace(/\b\w/g, c => c.toUpperCase()).slice(0, 70);
}

function scoreRow(row, campaign) {
  const text = `${row.title || ''} ${row.content || ''}`;
  let score = 42;
  if (campaign.signal.test(text)) score += 24;
  if (campaign.intent.test(text)) score += 18;
  if (row.published_date) score += 6;
  score += Math.min(10, Math.round((Number(row.score) || 0) * 10));
  return Math.min(98, score);
}

function subjectFor(campaign, company) {
  if (campaign.market === 'global-to-korea') return `Seoul event apparel for ${company}`;
  if (campaign === CAMPAIGNS.ax) return `${company} 업무 자동화 PoC 제안`;
  if (campaign === CAMPAIGNS.video) return `${company} 영상 콘텐츠 제작 제안`;
  if (campaign === CAMPAIGNS.dev) return `${company} 개발 capacity 파트너 제안`;
  return `${company} 행사 단체복 제작 제안`;
}

function messageKo(campaign, company, signal) {
  const intro = signal ? `최근 ${signal.slice(0, 110)} 관련 내용을 보고 연락드렸습니다.` : `${company}의 최근 활동을 보고 연락드렸습니다.`;
  return `안녕하세요. ${intro}\n\n${campaign.koOffer} 형태로 가볍게 테스트해볼 수 있어 연락드렸습니다. 필요하시면 일정과 범위에 맞춰 바로 가능한 안만 짧게 보내드리겠습니다.`;
}

function messageEn(campaign, company, signal) {
  const trigger = clean(signal, 110) || 'your recent activity';
  return `Hi,\n\nI came across ${company} while looking at ${trigger}. We can help with ${campaign.enOffer}.\n\nIf useful, I can send a very short option based on your timing and scope.`;
}

export async function POST(request) {
  if (!tavilyConfigured()) return Response.json({ error: 'TAVILY_API_KEY가 필요합니다.' }, { status: 503 });

  let body = {};
  try { body = await request.json(); } catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }

  const campaignId = CAMPAIGNS[body.campaign] ? body.campaign : 'kbw';
  const campaign = CAMPAIGNS[campaignId];
  const cycle = Math.max(0, Number.parseInt(body.cycle, 10) || 0);
  const excludes = new Set(Array.isArray(body.excludeDomains) ? body.excludeDomains.map(String).map(v => v.toLowerCase()) : []);
  const variant = VARIANTS[cycle % VARIANTS.length];
  const queries = campaign.queries.slice(0, 2).map((q, i) => `${q} ${i === cycle % 2 ? variant : ''}`.trim());

  try {
    const search = await tavilySearchMany(queries, {
      maxResults: 10,
      timeRange: 'year',
      excludeDomains: BLOCKED,
      topic: 'general'
    });

    const seen = new Set();
    const leads = [];
    for (const row of search.results) {
      if (blocked(row.url)) continue;
      const domain = rootHost(row.url);
      if (!domain || excludes.has(domain) || seen.has(domain)) continue;
      seen.add(domain);

      const company = displayName(row.title, domain);
      const signal = clean(row.title || row.content, 240);
      leads.push({
        id: `${campaignId}:${domain}`,
        campaign: campaignId,
        campaign_label: campaign.label,
        company,
        domain,
        url: `https://${domain}/`,
        source_url: row.url,
        source_title: clean(row.title, 220),
        published_date: clean(row.published_date, 60),
        signal,
        score: scoreRow(row, campaign),
        recommended_role: campaign.role,
        offer: campaign.koOffer,
        subject: subjectFor(campaign, company),
        message_ko: messageKo(campaign, company, signal),
        message_en: messageEn(campaign, company, signal),
        contact: null,
        contact_status: 'pending'
      });
      if (leads.length >= 12) break;
    }

    leads.sort((a, b) => b.score - a.score);
    return Response.json({
      campaign: campaignId,
      campaign_label: campaign.label,
      leads,
      meta: { ...search.meta, returned: leads.length, cycle }
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = Number(error?.status) || 502;
    return Response.json({ error: clean(error?.message || error, 500), campaign: campaignId }, { status });
  }
}
