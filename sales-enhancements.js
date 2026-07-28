(() => {
  const RECENT_KEY = 'kpa.sales.recentCompanies';
  const RUN_KEY = 'kpa.sales.runCount';
  const MAX_RECENT = 36;

  const MORNING_TOPICS = [
    '개발자 도구·API·데이터 인프라 B2B SaaS',
    '사이버보안·ID·컴플라이언스 B2B SaaS',
    'AI 고객지원·업무 자동화 B2B SaaS',
    'B2B 핀테크·결제·재무 운영 소프트웨어',
    'CRM·세일즈·Revenue Intelligence SaaS',
    'HR·채용·워크포스 B2B SaaS',
    '물류·공급망·구매관리 B2B 소프트웨어',
    '클라우드·FinOps·DevOps 자동화 SaaS',
    '리테일·커머스 운영 B2B SaaS',
    '마케팅 자동화·고객데이터 B2B SaaS'
  ];

  const AFTERNOON_TOPICS = [
    '호텔·여행·프로퍼티 운영 B2B SaaS',
    '기업용 생성형 AI·지식관리 소프트웨어',
    '협업·문서·워크플로 자동화 SaaS',
    '기업용 영상·음성·커뮤니케이션 API',
    '데이터 분석·BI·관측성 B2B SaaS',
    '법무·계약·RegTech B2B SaaS',
    '제조·현장 운영 소프트웨어 SaaS',
    '이커머스 운영·물류 자동화 SaaS',
    '파트너·채널·세일즈 운영 B2B SaaS',
    'AI 에이전트·백오피스 자동화 B2B SaaS'
  ];

  function readRecent() {
    try {
      const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(v) ? v.filter(Boolean).slice(0, MAX_RECENT) : [];
    } catch { return []; }
  }

  function saveRecent(companies = []) {
    const merged = [...companies, ...readRecent()]
      .map(v => String(v || '').trim())
      .filter(Boolean);
    const seen = new Set();
    const unique = merged.filter(name => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(unique));
  }

  function daySeed(now) {
    const start = new Date(now.getFullYear(), 0, 0);
    return Math.floor((now - start) / 86400000);
  }

  function pickFive(pool, seed) {
    const out = [];
    for (let i = 0; i < 5; i++) out.push(pool[(seed * 3 + i * 2) % pool.length]);
    return [...new Set(out)].slice(0, 5);
  }

  function renderTopics() {
    const root = document.getElementById('dailyTopics');
    const label = document.getElementById('topicTimeLabel');
    const focus = document.getElementById('salesFocus');
    if (!root || !focus) return;

    const now = new Date();
    const afternoon = now.getHours() >= 14;
    const pool = afternoon ? AFTERNOON_TOPICS : MORNING_TOPICS;
    const seed = daySeed(now) + (afternoon ? 17 : 0);
    const topics = pickFive(pool, seed);
    if (label) label.textContent = afternoon ? '오후 추천 · 14:00' : '오전 추천 · 09:00';

    root.innerHTML = topics.map((topic, i) => `<button type="button" class="topic-chip" data-topic-index="${i}">${topic}</button>`).join('');
    root.querySelectorAll('.topic-chip').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        const same = btn.classList.contains('active');
        root.querySelectorAll('.topic-chip').forEach(x => x.classList.remove('active'));
        if (same) {
          focus.value = '';
          return;
        }
        btn.classList.add('active');
        focus.value = `${topics[i]}. 최근 1년 내 해외 확장·투자·영업 채용·파트너십 신호가 있고 한국 현지 영업조직이 아직 강하지 않은 회사.`;
      });
    });
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input?.url || '');
    const method = String(init?.method || 'GET').toUpperCase();
    const isDiscovery = method === 'POST' && /\/api\/discover-clients(?:\?|$)/.test(url);
    let nextInit = init;

    if (isDiscovery && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body || '{}');
        const runCount = Number(localStorage.getItem(RUN_KEY) || '0') + 1;
        localStorage.setItem(RUN_KEY, String(runCount));
        body.excludeCompanies = readRecent();
        body.searchVariant = `${new Date().toISOString().slice(0, 10)}-${new Date().getHours() >= 14 ? 'pm' : 'am'}-${runCount}`;
        nextInit = { ...init, body: JSON.stringify(body) };
      } catch {}
    }

    const response = await originalFetch(input, nextInit);
    if (isDiscovery && response.ok) {
      response.clone().json().then(data => {
        const names = Array.isArray(data?.leads) ? data.leads.map(x => x?.company).filter(Boolean) : [];
        if (names.length) saveRecent(names);
      }).catch(() => {});
    }
    return response;
  };

  renderTopics();
})();
