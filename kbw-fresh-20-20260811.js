(() => {
  const BATCH = '20260811-kbw-fresh20-v1';
  const EXPECTED = 20;
  const SENT_ENDPOINT = '/api/gmail?action=sent-domains';
  const SENT_CACHE_KEY = 'kpa.hunt.sentDomains.v1';
  const DELETED_KEY = 'kpa.hunt.deletedDomains.v1';
  const INVALID_EMAILS = new Set([
    'info@succinct.xyz',
    'security@raydium.io'
  ]);

  const ROWS = [
    {
      company: 'Web3Labs',
      domain: 'web3labs.club',
      url: 'https://www.gwdc.net/',
      email: 'info@web3labs.club',
      title: 'Sponsorship / Partnerships',
      score: 100,
      kbw_status: 'GWDC 2026 Korea 서울 주최 · 후원사 모집 중',
      signal: 'Web3Labs is hosting GWDC 2026 Korea at aT Center Seoul on September 29-30, with sponsors actively being recruited and a public sponsorship email listed.',
      source_url: 'https://luma.com/cp87au4f',
      contact_source: 'https://www.gwdc.net/'
    },
    {
      company: 'Digital AF',
      domain: 'digitalaf.xyz',
      url: 'https://digitalaf.xyz/',
      email: 'digitalaf.xyz@gmail.com',
      title: 'Sponsorship / Events',
      score: 100,
      kbw_status: 'KBW 2026 기간 강남 5일 행사 · 스폰서십 직접 모집',
      signal: 'Digital AF is running a five-day exhibition and side-event space in Gangnam from September 29 to October 3 during KBW 2026 and publishes a direct sponsorship inbox on the event page.',
      source_url: 'https://luma.com/zecq09tp',
      contact_source: 'https://luma.com/zecq09tp'
    },
    {
      company: 'Quantstamp',
      domain: 'quantstamp.com',
      url: 'https://quantstamp.com/',
      email: 'media@quantstamp.com',
      title: 'Media / Events',
      score: 100,
      kbw_status: 'KBW 2026 Security Night 서울 공동주최 · 익스클루시브 스웨그',
      signal: 'Quantstamp is co-hosting Security Night during KBW 2026 in Seoul, with its team presenting on stage and exclusive event swag explicitly advertised.',
      source_url: 'https://luma.com/SecurityNight',
      contact_source: 'https://www.prnewswire.co.uk/news-releases/quantstamp-releases-blockchain-security-protocol-on-ethereum-network-692212101.html'
    },
    {
      company: 'Tars Protocol',
      domain: 'tars.pro',
      url: 'https://tars.pro/',
      email: 'support@tars.pro',
      title: 'Support / Partnerships Routing',
      score: 96,
      kbw_status: 'KBW 서울 ONE OF US 행사 공동 파트너 · 익스클루시브 머치',
      signal: 'Tars Protocol partnered on a Korea Blockchain Week Seoul activation with ONE OF US and Aya where exclusive merchandise was part of the attendee experience.',
      source_url: 'https://luma.com/xs22c413',
      contact_source: 'https://tars.pro/privacy-policy'
    },
    {
      company: 'Gensyn',
      domain: 'gensyn.ai',
      url: 'https://www.gensyn.ai/',
      email: 'hello@gensyn.ai',
      title: 'General / Partnerships',
      score: 99,
      kbw_status: 'KBW 서울 자체 행사 주최 · 한정 스웨그/상품 운영',
      signal: 'Gensyn hosted its own Seoul event during KBW and explicitly promoted exclusive merchandise, limited items and prizes for attendees.',
      source_url: 'https://luma.com/iv9lg7lu',
      contact_source: 'https://github.com/gensyn-ai'
    },
    {
      company: 'Lagrange',
      domain: 'lagrange.dev',
      url: 'https://lagrange.dev/',
      email: 'contact@lagrange.dev',
      title: 'Product / Partnerships',
      score: 99,
      kbw_status: '2026 서울 팝업 공동주최 · 한정판 굿즈 직접 운영',
      signal: 'Lagrange hosted Cafe Lagrange in Seoul with OpenGradient and Sentient, explicitly offering limited-edition merchandise and partner gifts.',
      source_url: 'https://luma.com/1pmns80d',
      contact_source: 'https://lagrange.dev/'
    },
    {
      company: 'Billions',
      domain: 'billions.network',
      url: 'https://billions.network/',
      email: 'growth@billions.network',
      title: 'Growth / Partnerships',
      score: 99,
      kbw_status: '2026 서울 House of Billions 직접 주최',
      signal: 'Billions hosted House of Billions at JBK Convention Hall in Seoul in May 2026, an immersive AI and Korean-culture community activation with physical zones and event production.',
      source_url: 'https://luma.com/071labs-2kto',
      contact_source: 'https://billions.network/ko/blog/billions-know-your-agent'
    },
    {
      company: 'Perle Labs',
      domain: 'perle.xyz',
      url: 'https://www.perle.xyz/',
      email: 'hello@perle.xyz',
      title: 'General / Partnerships',
      score: 99,
      kbw_status: '2026 첫 한국 공식 이벤트 서울 개최',
      signal: 'Perle Labs held its first official Korea event in Seoul in 2026 with the Perle team on site, following prior KBW participation in the Korea Open Source AI Meetup.',
      source_url: 'https://luma.com/yv76cimg',
      contact_source: 'https://www.perle.xyz/about'
    },
    {
      company: 'Kite AI',
      domain: 'kite.ai',
      url: 'https://kite.ai/',
      email: 'support@kite.ai',
      title: 'Support / Partnerships Routing',
      score: 100,
      kbw_status: '2026-07 서울 Proof of AI 직접 주최',
      signal: 'Kite AI hosted a Korea Special Edition of Proof of AI in Seoul on July 20, 2026, bringing its team and ecosystem leaders together around Korea-focused agentic payments.',
      source_url: 'https://luma.com/cj0l4lze',
      contact_source: 'https://kite.ai/terms'
    },
    {
      company: 'ChainGPT',
      domain: 'chaingpt.org',
      url: 'https://www.chaingpt.org/',
      email: 'merch@chaingpt.org',
      title: 'Merch / Partnerships',
      score: 100,
      kbw_status: '2026 서울 AEF 공식 스폰서 · 공식 머치 전용 메일 보유',
      signal: 'ChainGPT sponsored Agent Execution Frontier Seoul 2026 and publicly operates a dedicated merchandise inbox, making it unusually relevant for local apparel production outreach.',
      source_url: 'https://luma.com/u9cpjyrl',
      contact_source: 'https://shop.chaingpt.org/faqs'
    },
    {
      company: 'Ava Labs',
      domain: 'avalabs.org',
      url: 'https://www.avalabs.org/',
      email: 'contact@avalabs.org',
      title: 'General / Partnerships',
      score: 97,
      kbw_status: '2026 서울 Proof of AI 파트너',
      signal: 'Avalanche was an official partner of the large Proof of AI Builder and Influencer Day in Seoul during Korea Build Week 2026.',
      source_url: 'https://luma.com/ProofofAI-Seoul2026Apr',
      contact_source: 'https://www.avalabs.org/cookie-policy'
    },
    {
      company: 'Hedera',
      domain: 'hedera.com',
      url: 'https://hedera.com/',
      email: 'pr@hedera.com',
      title: 'PR / Events',
      score: 97,
      kbw_status: 'KBW 서울 커뮤니티 activation · 익스클루시브 머치',
      signal: 'Hedera joined a Korea Blockchain Week ONE OF US Seoul activation where exclusive merchandise was part of the participant experience.',
      source_url: 'https://luma.com/e8yfk5o7',
      contact_source: 'https://hedera.com/blog/servicenow-and-hedera-enable-cross-organizational-digital-workflows/'
    },
    {
      company: 'OpenGradient',
      domain: 'opengradient.ai',
      url: 'https://www.opengradient.ai/',
      email: 'team@opengradient.ai',
      title: 'Team / Partnerships',
      score: 99,
      kbw_status: '2026 서울 Cafe Lagrange 공동주최 · 파트너 기프트/굿즈',
      signal: 'OpenGradient co-hosted Cafe Lagrange in Seoul in 2026, an all-day popup with limited-edition merchandise and partner-provided gifts.',
      source_url: 'https://luma.com/1pmns80d',
      contact_source: 'https://www.opengradient.ai/blog/introducing-opengradient'
    },
    {
      company: 'Nansen',
      domain: 'nansen.ai',
      url: 'https://nansen.ai/',
      email: 'support@nansen.ai',
      title: 'Support / Sales Routing',
      score: 96,
      kbw_status: '2026 서울 AI Agentic Finance Forum 파트너',
      signal: 'Nansen was a named partner of the AI Agentic Finance Forum in Seoul during BuidlAsia Week 2026, alongside Injective and other ecosystem teams.',
      source_url: 'https://luma.com/3y4qknui',
      contact_source: 'https://nansen.ai/legal/terms-of-services'
    },
    {
      company: 'Pieverse',
      domain: 'pieverse.io',
      url: 'https://www.pieverse.io/',
      email: 'hello@pieverse.io',
      title: 'General / Partnerships',
      score: 98,
      kbw_status: '2026 서울 Agent Execution Frontier 공식 스폰서',
      signal: 'Pieverse sponsored Agent Execution Frontier Seoul 2026 and was assigned a dedicated mass-adoption and UX infrastructure track in the program.',
      source_url: 'https://luma.com/u9cpjyrl',
      contact_source: 'https://www.pieverse.io/whitepaper'
    },
    {
      company: 'Metis',
      domain: 'metis.io',
      url: 'https://www.metis.io/',
      email: 'contact@metis.io',
      title: 'General / Partnerships',
      score: 97,
      kbw_status: '2026 서울 Agent Execution Frontier 공식 스폰서',
      signal: 'Metis was an official sponsor of Agent Execution Frontier Seoul 2026 at Hashed Lounge in Gangnam.',
      source_url: 'https://luma.com/u9cpjyrl',
      contact_source: 'https://www.metis.io/blog/metis-hackathon'
    },
    {
      company: 'Injective Labs',
      domain: 'injectivelabs.org',
      url: 'https://injective.com/',
      email: 'contact@injectivelabs.org',
      title: 'General / Partnerships',
      score: 99,
      kbw_status: '2026 서울 AI Agentic Finance Forum 호스트',
      signal: 'Injective hosted the AI Agentic Finance Forum in Seoul during BuidlAsia Week 2026, with a dedicated community and builder program.',
      source_url: 'https://luma.com/3y4qknui',
      contact_source: 'https://injectivelabs.org/terms/'
    },
    {
      company: 'DSRV',
      domain: 'dsrvlabs.com',
      url: 'https://dsrv.com/',
      email: 'contact@dsrvlabs.com',
      title: 'Business / Partnerships Routing',
      score: 97,
      kbw_status: 'KBW 서울 Espresso 공동주최 · 최신 스웨그 현장 운영',
      signal: 'DSRV co-hosted Espresso & Partner Brews during KBW in Seoul, where the event explicitly promoted fresh swag and branded physical experiences.',
      source_url: 'https://luma.com/h9uxi7c1',
      contact_source: 'https://dsrv.com/privacy-policy'
    },
    {
      company: 'OpenMind',
      domain: 'openmind.org',
      url: 'https://openmind.org/',
      email: 'hello@openmind.org',
      title: 'Community / Partnerships',
      score: 99,
      kbw_status: '2026 서울 OpenMind Korea Meetup 직접 주최',
      signal: 'OpenMind hosted an official Korea community meetup in Seoul in 2026, bringing the OpenMind team and Korean AI/Web3 community together in person.',
      source_url: 'https://luma.com/bs30e2np',
      contact_source: 'https://play.google.com/store/apps/details?id=org.openmind.fabric'
    },
    {
      company: 'Celo Foundation',
      domain: 'celo.org',
      url: 'https://celo.org/',
      email: 'press@celo.org',
      title: 'Press / Events',
      score: 97,
      kbw_status: 'KBW 서울 Espresso 공동주최 · 최신 스웨그 현장 운영',
      signal: 'Celo co-hosted Espresso & Partner Brews during KBW in Seoul, an activation that explicitly offered fresh swag and branded on-site experiences.',
      source_url: 'https://luma.com/h9uxi7c1',
      contact_source: 'https://celo.org/vision'
    }
  ];

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

  function readDeletedDomains() {
    const value = readJson(DELETED_KEY, []);
    const rows = Array.isArray(value) ? value : Array.isArray(value?.domains) ? value.domains : [];
    return rows.map(normalizeDomain).filter(Boolean);
  }

  function cachedSentDomains() {
    const value = readJson(SENT_CACHE_KEY, null);
    const rows = Array.isArray(value) ? value : Array.isArray(value?.domains) ? value.domains : [];
    return rows.map(normalizeDomain).filter(Boolean);
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
    } catch {
      // Keep the cached sent-domain history if Gmail lookup is temporarily unavailable.
    }
    return domains;
  }

  function leadEmails(lead = {}) {
    return [
      lead?.contact?.email,
      ...(Array.isArray(lead?.contacts) ? lead.contacts.map((contact) => contact?.email) : [])
    ].map((email) => String(email || '').trim().toLowerCase()).filter(Boolean);
  }

  function hasKnownBounce(lead = {}) {
    return leadEmails(lead).some((email) => INVALID_EMAILS.has(email));
  }

  function purgeKnownBounces() {
    if (typeof state === 'undefined' || !Array.isArray(state.leads)) return 0;
    const removedIds = [];
    const next = state.leads.filter((lead) => {
      const remove = hasKnownBounce(lead);
      if (remove && lead?.id) removedIds.push(lead.id);
      return !remove;
    });
    const removed = state.leads.length - next.length;
    if (!removed) return 0;
    state.leads = next;
    for (const id of removedIds) state.selected?.delete?.(id);
    if (typeof saveState === 'function') saveState();
    return removed;
  }

  function installBounceFetchGuard() {
    if (window.fetch?.__kbwBounceGuard20260811) return;
    const originalFetch = window.fetch.bind(window);
    const guardedFetch = async function(input, init = {}) {
      const response = await originalFetch(input, init);
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = String(init.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
      let isHunt = false;
      try {
        const parsed = new URL(url, location.origin);
        isHunt = method === 'POST' && parsed.origin === location.origin && parsed.pathname === '/api/hunt';
      } catch {
        isHunt = false;
      }
      if (!isHunt) return response;

      const data = await response.clone().json().catch(() => null);
      if (!data || !Array.isArray(data.leads)) return response;
      const leads = data.leads.filter((lead) => !hasKnownBounce(lead));
      if (leads.length === data.leads.length) return response;

      return new Response(JSON.stringify({ ...data, leads }), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    };
    guardedFetch.__kbwBounceGuard20260811 = true;
    window.fetch = guardedFetch;
  }

  function makeLead(row, index) {
    const contact = {
      email: row.email.toLowerCase(),
      name: `${row.company} Team`,
      title: row.title,
      qualified: true,
      score: 100,
      provider: 'fresh20_exact_public_email+web',
      providers: ['fresh20_exact_public_email', 'public_web'],
      email_status: 'verified',
      emailStatus: 'valid',
      type: row.email.split('@')[0].includes('.') ? 'personal' : 'generic',
      sources: [row.contact_source],
      source_url: row.contact_source,
      verifiedAt: '2026-08-11',
      verifiedOverride: true,
      verified_override: true,
      lookupDomain: normalizeDomain(row.domain),
      priority: index + 1
    };

    const message = `Hi ${row.company} team,\n\nI’m reaching out because ${row.signal}\n\nAre you already planning team shirts, staff wear, or event merch for Seoul around Korea Blockchain Week? We produce T-shirts, hoodies, caps, and staff wear locally in Seoul and can deliver directly to your hotel, office, venue, or side-event location.\n\nIf apparel is still open, I can send 2–3 practical options with USD pricing and turnaround times for 20 / 50 / 100 units.\n\nWould it be useful if I send the options?\n\nBest,\nNYF`;

    return {
      id: `kbw-fresh20-20260811:${normalizeDomain(row.domain)}`,
      batch: BATCH,
      campaign: 'kbw',
      campaign_label: 'KBW 단체복',
      company: row.company,
      domain: normalizeDomain(row.domain),
      url: row.url,
      source_url: row.source_url,
      source_title: row.kbw_status,
      published_date: '2026-08-11',
      signal: row.signal,
      score: row.score,
      sales_priority: row.score + 35,
      win_score: Math.min(100, row.score),
      win_label: row.score >= 99 ? '승산 높음' : '우선 연락',
      opportunity_lane: 'kbw2026-fresh20',
      reachability: '추정 생성 아님 · 공개된 정확한 이메일 주소 확인',
      kbw_status: row.kbw_status,
      kbw_status_code: row.kbw_status.includes('2026') ? 'confirmed' : 'strong-prior-signal',
      outreach_language: 'en',
      verified_company: true,
      verified_by: '2026-08-11 Luma/official web research + exact public email evidence',
      quality_reasons: [
        '최신 서울/KBW/Luma 현장 신호',
        '추정하지 않은 공개 이메일',
        '기존 정적 후보 중복 사전 제외',
        '발송·삭제·거절·현재 추가 후보 런타임 제외'
      ],
      tool_signals: ['fresh_luma_kbw', 'exact_public_email', 'runtime_exclusion_guard'],
      recommended_role: row.title,
      role_targets: [row.title, 'Events', 'Partnerships', 'Marketing', 'Community'],
      offer: 'KBW 기간 서울 방문 팀웨어·스태프웨어·커스텀 의류 현지 제작·납품',
      outreach_goal: 'reply',
      outreach_stage: 'first_touch',
      reply_question: 'Would it be useful if I send the 20 / 50 / 100-unit options?',
      subject: `KBW Seoul teamwear for ${row.company}`,
      message_en: message,
      contact,
      contacts: [contact],
      contact_provider: 'fresh20_exact_public_email+web',
      contact_status: 'found',
      hardcoded_email_override: true,
      hardcoded_email_source: row.contact_source,
      fresh20_20260811: true
    };
  }

  async function inject(attempt = 0) {
    if (typeof state === 'undefined' || !Array.isArray(state.leads) || typeof mergeLeads !== 'function') {
      if (attempt < 40) setTimeout(() => inject(attempt + 1), 250);
      return;
    }

    installBounceFetchGuard();
    const bouncedRemoved = purgeKnownBounces();
    const sent = await liveSentDomains();
    const rejected = state.rejected instanceof Set
      ? [...state.rejected].map(normalizeDomain).filter(Boolean)
      : [];
    const deleted = readDeletedDomains();

    const blocked = new Set([...sent, ...rejected, ...deleted].filter(Boolean));
    const existing = new Set(
      state.leads
        .map((lead) => normalizeDomain(lead?.domain || lead?.url || lead?.contact?.email || ''))
        .filter(Boolean)
    );

    const eligibleRows = ROWS.filter((row) => {
      const domain = normalizeDomain(row.domain);
      const email = String(row.email || '').trim().toLowerCase();
      return domain &&
        !INVALID_EMAILS.has(email) &&
        !blocked.has(domain) &&
        !existing.has(domain);
    });

    const candidates = eligibleRows.map(makeLead);
    const added = mergeLeads(candidates);
    if ((added.length || bouncedRemoved) && typeof saveState === 'function') saveState();
    if ((added.length || bouncedRemoved) && typeof render === 'function') render();

    const excluded = ROWS
      .filter((row) => !eligibleRows.includes(row))
      .map((row) => normalizeDomain(row.domain));

    state.statusText = `KBW 최신 신규 후보 ${added.length}/${EXPECTED} 추가 · 발송/추가/삭제/반송 주소 제외`;
    if (typeof saveState === 'function') saveState();
    if (typeof render === 'function') render();

    window.KBWFresh20_20260811 = {
      batch: BATCH,
      researched: ROWS.length,
      added: added.length,
      bouncedRemoved,
      domains: added.map((lead) => normalizeDomain(lead.domain)),
      excluded
    };
    console.info(`[KBW fresh20] added ${added.length}/${EXPECTED}; bounced removed ${bouncedRemoved}`, { excluded });
  }

  if (ROWS.length !== EXPECTED) {
    console.error(`[KBW fresh20] catalog size mismatch: ${ROWS.length}/${EXPECTED}`);
    return;
  }

  installBounceFetchGuard();
  inject();
})();
