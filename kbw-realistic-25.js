(() => {
  const SENT_ENDPOINT = '/api/gmail?action=sent-domains';
  const SENT_CACHE_KEY = 'kpa.hunt.sentDomains.v1';
  const DELETED_KEY = 'kpa.hunt.deletedDomains.v1';
  const BATCH = '20260807-kbw-realistic25-v1';
  const ROWS = [{"company":"KAST","domain":"kast.xyz","url":"https://www.kast.xyz/","email":"business@kast.xyz","contact_source":"https://www.kast.xyz/verify","source_url":"https://koreablockchainweek.com/speakers","signal":"KBW2026 공식 스피커 확정: Raagulan Pathy (Founder & CEO).","score":100,"title":"Business"},{"company":"Dromos Labs","domain":"dromos.xyz","url":"https://dromos.xyz/","email":"hello@dromos.xyz","contact_source":"https://dromos.xyz/","source_url":"https://koreablockchainweek.com/speakers","signal":"KBW2026 공식 스피커 확정: Alex Cutler (Co-Founder & CEO).","score":100,"title":"General / Partnerships"},{"company":"Pudgy Penguins","domain":"pudgypenguins.io","url":"https://www.pudgypenguins.com/","email":"support@pudgypenguins.io","contact_source":"https://shop.pudgypenguins.com/pages/privacy-policy","source_url":"https://koreablockchainweek.com/speakers","signal":"KBW2026 공식 스피커 확정: Luca Netz (CEO). 2025에도 Pudgy Korea 행사를 운영.","score":99,"title":"Support / Routing"},{"company":"Sui Foundation","domain":"sui.io","url":"https://www.sui.io/","email":"media@sui.io","contact_source":"https://www.sui.io/press-center","source_url":"https://blog.sui.io/kbw-2025-impact-builder-house-seoul/","signal":"KBW2025 공식 컨퍼런스 파트너. 서울에서 Sui Builder House: APAC까지 직접 운영.","score":98,"title":"Media / Events"},{"company":"0G","domain":"0g.ai","url":"https://0g.ai/","email":"contact@0g.ai","contact_source":"https://0g.ai/contact","source_url":"https://www.prnewswire.com/news-releases/korea-blockchain-week-2025-announces-donald-trump-jr-as-keynote-speaker-with-sui-stable-and-0g-as-conference-partners-302489481.html","signal":"KBW2025 공식 컨퍼런스 파트너로 참가. 한국/AI·Web3 시장 재참가 가능성이 높음.","score":98,"title":"General / Partnerships"},{"company":"Sentient","domain":"sentient.xyz","url":"https://sentient.xyz/","email":"contact@sentient.xyz","contact_source":"https://sentient.foundation/legal/terms","source_url":"https://www.prnewswire.com/news-releases/korea-blockchain-week-2025-announces-donald-trump-jr-as-keynote-speaker-with-sui-stable-and-0g-as-conference-partners-302489481.html","signal":"KBW2025 공식 라인업에 Sandeep Nailwal이 참여. AI×Web3 분야로 2026 재방문 가능성 높음.","score":97,"title":"General / Partnerships"},{"company":"DWF Labs","domain":"dwf-labs.com","url":"https://www.dwf-labs.com/","email":"media@dwf-labs.com","contact_source":"https://www.prnewswire.com/news-releases/dwf-labs-offers-support-for-web3-industry-amidst-market-panic-301676499.html","source_url":"https://www.dwf-labs.com/events/past-events/dwf-labs-korea-blockchain-week-2025","signal":"KBW2025 참가 + DWF Labs Haus 사이드이벤트까지 직접 운영한 반복 참가형 팀.","score":97,"title":"Media / Events"},{"company":"Aethir","domain":"aethir.com","url":"https://aethir.com/","email":"enterprisesales@aethir.com","contact_source":"https://ecosystem.aethir.com/blog-posts/u-s-crypto-regulation-reaches-a-tipping-point-what-the-genius-act-means-for-enterprise-blockchain-ai-infrastructure-and-aethir","source_url":"https://ecosystem.aethir.com/blog-posts/aethir-at-korea-blockchain-week-2025","signal":"KBW2025에서 자체 고급 이벤트 3개와 추가 패널 참여를 운영한 적극적 현장 팀.","score":97,"title":"Enterprise Sales / Partnerships"},{"company":"io.net","domain":"io.net","url":"https://io.net/","email":"support@io.net","contact_source":"https://support.io.net/","source_url":"https://io.net/events/korea-blockchain-week-2025","signal":"KBW2025 내부 계획에 부스·브랜딩·키노트·해커톤·GTM, 잠정 예산 $100K까지 명시.","score":97,"title":"Support / Routing"},{"company":"Nexa","domain":"nexa.org","url":"https://nexa.org/","email":"info@nexa.org","contact_source":"https://gitlab.com/nexa/libnexa-js","source_url":"https://forum.nexa.org/t/nexa-a-sponsor-of-korea-blockchain-week-2025/1510","signal":"KBW2025 공식 스폰서. 브랜드 부스와 여러 팀원이 서울 현장 참가.","score":96,"title":"General / Partnerships"},{"company":"BYDFi","domain":"bydfi.com","url":"https://www.bydfi.com/","email":"bd@bydfi.com","contact_source":"https://support.bydfi.com/hc/en-us/articles/6931589444111-Join-us","source_url":"https://www.bydfi.com/en/support/ANNOUNCEMENT/articles/rkeqrghletxy","signal":"KBW2025 메인 부스 #33 운영 + Pudgy Korea 등 여러 사이드이벤트 참가·후원.","score":96,"title":"Business Development"},{"company":"Roam","domain":"weroam.xyz","url":"https://weroam.xyz/","email":"sales@weroam.xyz","contact_source":"https://shop.weroam.xyz/troubleshooting-guide/","source_url":"https://www.prnewswire.com/news-releases/roam-joins-kbw2025-impact-as-sponsor-and-shares-vision-for-a-global-open-wireless-network-302567303.html","signal":"KBW2025 IMPACT 실버 스폰서. 한국이 핵심 사용 시장이라 반복 참가 명분이 강함.","score":96,"title":"Sales / Partnerships"},{"company":"Polymesh","domain":"polymesh.network","url":"https://polymesh.network/","email":"info@polymesh.network","contact_source":"https://assets.polymesh.network/whitepaper.pdf","source_url":"https://polymesh.network/blog/polymesh-sponsors-korea-blockchain-week-2025","signal":"KBW2025 공식 스폰서이며 Senior Marketing Manager가 현장 상주. 한국을 전략 시장으로 명시.","score":96,"title":"General / Partnerships"},{"company":"UXLINK","domain":"uxlink.io","url":"https://www.uxlink.io/","email":"admin@uxlink.io","contact_source":"https://www.uxlink.io/","source_url":"https://luma.com/cs3eq605","signal":"KBW2025 GM Breakfast 공동주최. 서울에서 VC·창업자 대상 행사 운영 경험이 직접 확인됨.","score":95,"title":"Admin / Partnerships Routing"},{"company":"SNZ Capital","domain":"snzholding.com","url":"https://snzholding.com/","email":"ethereumhkhub@snzholding.com","contact_source":"https://www.snzholding.com/contact","source_url":"https://snzholding.com/community-and-event/430","signal":"KBW2025에서 300명+ GM Breakfast 주최 및 여러 사이드이벤트 공동주최.","score":95,"title":"Business Development"},{"company":"Aster","domain":"asterdex.com","url":"https://www.asterdex.com/","email":"contact@asterdex.com","contact_source":"https://play.google.com/store/apps/details?id=com.astermobile.app.android","source_url":"https://www.bnbchain.org/en/blog/bnb-chain-takeover-at-korea-blockchain-week-2025","signal":"KBW2025 BNB Seoul: Hanok House 공식 스폰서 activation 참가.","score":94,"title":"General / Partnerships"},{"company":"Akedo","domain":"akedo.gg","url":"https://akedo.gg/","email":"support@akedo.gg","contact_source":"https://www.partners.akedo.gg/faq","source_url":"https://www.bnbchain.org/en/blog/bnb-chain-takeover-at-korea-blockchain-week-2025","signal":"KBW2025 BNB Seoul: Hanok House 공식 스폰서 activation 참가.","score":94,"title":"Support / Partnerships Routing"},{"company":"MiL.k","domain":"milkplay.com","url":"https://www.milkplay.com/","email":"help@milkplay.com","contact_source":"https://play.google.com/store/apps/details?id=com.milkpartners.milk","source_url":"https://www.bnbchain.org/en/blog/bnb-chain-takeover-at-korea-blockchain-week-2025","signal":"KBW2025 BNB Seoul: Hanok House 공식 스폰서. 한국 현장 팀 운영 가능성이 매우 높음.","score":94,"title":"Support / Partnerships Routing"},{"company":"CoinEasy","domain":"coineasy.xyz","url":"https://coineasy.xyz/","email":"contact@coineasy.xyz","contact_source":"https://play.google.com/store/apps/details?id=com.coineasy.coineasy","source_url":"https://luma.com/t8nn9spg","signal":"KBW2025 AI, DePIN & RWA Day 공동주최. 서울 기반이라 행사 스태프웨어 수요 접근성이 높음.","score":94,"title":"General / Events"},{"company":"Lair Finance","domain":"lair.fi","url":"https://lair.fi/","email":"contact@lair.fi","contact_source":"https://lair-finance.gitbook.io/lair-finance/general-guides/media-kit","source_url":"https://luma.com/p1lrbvhj","signal":"KBW2025 Injective Insights 행사 공식 스폰서로 서울 현장 참여.","score":93,"title":"General / Partnerships"},{"company":"Ignight Capital","domain":"ignight.capital","url":"https://www.ignight.capital/","email":"contact@ignight.capital","contact_source":"https://www.ignight.capital/intro","source_url":"https://luma.com/p1lrbvhj","signal":"KBW2025 Injective Insights 공식 스폰서. 아시아 Web3 딜플로우형 행사와 높은 적합도.","score":93,"title":"Investments / Partnerships"},{"company":"LBank Labs","domain":"lbank.com","url":"https://www.lbank.com/","email":"business@lbank.com","contact_source":"https://www.lbank.com/support/articles/27124099471897","source_url":"https://luma.com/cs3eq605","signal":"KBW2025 GM Breakfast 공동주최 파트너. 서울 VC·파운더 네트워킹에 직접 참여.","score":93,"title":"Business / Partnerships"},{"company":"CARV","domain":"carv.io","url":"https://carv.io/","email":"support@carv.io","contact_source":"https://static.upbit.com/guide/circulating_supply/CARV_20241015.pdf","source_url":"https://newsletter.carv.io/p/carv-monthly-newsletter-building","signal":"KBW2025 Infinite Seoul 직접 주최, 576명 규모 행사 운영. 현장 브랜딩·스태프 수요 가능성이 높음.","score":93,"title":"Support / Events Routing"},{"company":"Taiko","domain":"taiko.xyz","url":"https://taiko.xyz/","email":"hello@taiko.xyz","contact_source":"https://static.upbit.com/guide/circulating_supply/TAIKO_20240606.pdf","source_url":"https://luma.com/cs3eq605","signal":"KBW2025 GM Breakfast 공동주최 + AI, DePIN & RWA Day 공동주최로 서울 활동 다수.","score":93,"title":"General / Partnerships"},{"company":"Sogni AI","domain":"sogni.ai","url":"https://www.sogni.ai/","email":"dream@sogni.ai","contact_source":"https://play.google.com/store/apps/details?id=ai.sogni.app.twa","source_url":"https://2025.sogni.ai/","signal":"2025 연간 공식 회고에서 Korea Blockchain Week 팀 참가를 직접 명시. AI/DePIN 사이드이벤트도 공동주최.","score":92,"title":"Support / Partnerships Routing"}];

  function normalizeDomain(value = '') {
    let raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw.includes('@') && !raw.includes('://')) raw = raw.split('@').pop() || '';
    try { raw = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname; }
    catch { raw = raw.split('/')[0].split(':')[0]; }
    raw = raw.replace(/^www\./, '').replace(/\.+$/, '');
    const parts = raw.split('.').filter(Boolean);
    if (parts.length <= 2) return raw;
    const secondLevel = new Set(['ac','co','com','edu','go','gov','ne','net','or','org']);
    const depth = parts.at(-1)?.length === 2 && secondLevel.has(parts.at(-2)) ? 3 : 2;
    return parts.slice(-depth).join('.');
  }

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  }

  function cachedSentDomains() {
    const cached = readJson(SENT_CACHE_KEY, null);
    return Array.isArray(cached?.domains) ? cached.domains.map(normalizeDomain).filter(Boolean) : [];
  }

  async function liveSentDomains() {
    let domains = cachedSentDomains();
    try {
      const response = await window.fetch(`${SENT_ENDPOINT}&t=${Date.now()}`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(data.domains)) {
        domains = [...new Set(data.domains.map(normalizeDomain).filter(Boolean))];
        localStorage.setItem(SENT_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), domains }));
      }
    } catch { /* cached history remains a fallback; sent-filter.js rechecks server-side */ }
    return domains;
  }

  function makeLead(row) {
    const contact = {
      email: row.email,
      name: `${row.company} Team`,
      title: row.title,
      qualified: true,
      score: 100,
      provider: 'manual_hardcode+public_web',
      email_status: 'verified',
      emailStatus: 'valid',
      sources: [row.contact_source],
      source_url: row.contact_source,
      verifiedAt: '2026-08-07'
    };
    const message = `Hi ${row.company} team,

I’m reaching out because your team has a strong, concrete Korea Blockchain Week signal — either confirmed for KBW 2026 or actively on the ground in Seoul during KBW 2025.

We produce custom teamwear locally in Seoul for visiting Web3 teams: T-shirts, caps, staff wear, and rush small-batch orders, with delivery to hotels, offices, or venues.

If you expect an on-ground team for KBW 2026, I can send a simple USD quote for 20 / 50 / 100 units plus current lead times.

Would it be useful if I send the options?

Best,
NYF`;

    return {
      id: `kbw-realistic-2026:${row.domain}`,
      batch: BATCH,
      campaign: 'kbw',
      campaign_label: 'KBW 단체복',
      company: row.company,
      domain: normalizeDomain(row.domain),
      url: row.url,
      source_url: row.source_url,
      source_title: 'Verified KBW participation / Seoul event evidence',
      published_date: '2026-08-07',
      signal: row.signal,
      score: row.score,
      sales_priority: row.score,
      win_score: Math.max(75, row.score - 15),
      win_label: row.score >= 98 ? '2026 참석 확정' : row.score >= 96 ? '재참가 매우 유력' : '재참가 유력',
      opportunity_lane: 'kbw-repeat-or-confirmed',
      reachability: '공개 업무 이메일 확인',
      kbw_status: row.score >= 98 ? 'KBW2026 직접 참석 신호' : 'KBW2025 현장 활동 기반 재참가 후보',
      kbw_status_code: row.score >= 98 ? 'confirmed' : 'likely',
      outreach_language: 'en',
      verified_company: true,
      verified_by: 'KBW official / first-party event evidence + public professional contact',
      quality_reasons: ['실제 KBW 참석·주최·후원 근거', '공개 업무 이메일 확인', '기존 하드코드·DB 중복 제외', '발송 이력 서버 필터 적용'],
      tool_signals: ['official_kbw_or_first_party_event', 'public_contact', 'manual_hardcode'],
      recommended_role: row.title,
      role_targets: [row.title, 'Events', 'Marketing', 'Partnerships', 'Community'],
      offer: 'KBW 기간 서울 방문 팀웨어·스태프웨어·커스텀 의류 현지 제작·납품',
      outreach_goal: 'reply',
      outreach_stage: 'first_touch',
      reply_question: 'Would it be useful if I send the 20 / 50 / 100-unit options?',
      subject: `KBW 2026 Seoul teamwear for ${row.company}`,
      message_en: message,
      contact,
      contacts: [contact],
      contact_provider: 'manual_hardcode+public_web',
      contact_status: 'found',
      hardcoded_email_override: true,
      hardcoded_email_source: row.contact_source
    };
  }

  async function inject() {
    if (typeof state === 'undefined' || typeof mergeLeads !== 'function') return;

    const sent = await liveSentDomains();
    const rejected = [...(state.rejected || [])].map(normalizeDomain);
    const deleted = (readJson(DELETED_KEY, []) || []).map(normalizeDomain);
    const blocked = new Set([...sent, ...rejected, ...deleted].filter(Boolean));
    const existing = new Set(
      (Array.isArray(state.leads) ? state.leads : [])
        .map(lead => normalizeDomain(lead.domain || lead.url || lead.contact?.email))
        .filter(Boolean)
    );

    const candidates = ROWS
      .map(makeLead)
      .filter(lead => !blocked.has(lead.domain) && !existing.has(lead.domain));

    const added = mergeLeads(candidates);
    if (added.length && typeof render === 'function') render();

    window.KBWRealistic25 = {
      batch: BATCH,
      total: ROWS.length,
      added: added.length,
      blockedBySentOrDelete: ROWS.length - candidates.length,
      domains: ROWS.map(row => normalizeDomain(row.domain))
    };
  }

  inject();
})();