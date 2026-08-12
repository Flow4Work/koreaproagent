(() => {
  const BATCH = '20260812-kbw-fresh20-v2';
  const OBSOLETE_BATCH = '20260812-kbw-fresh20-v1';
  const EXPECTED = 20;
  const SENT_ENDPOINT = '/api/gmail?action=sent-domains';
  const SENT_CACHE_KEY = 'kpa.hunt.sentDomains.v1';
  const DELETED_KEY = 'kpa.hunt.deletedDomains.v1';
  const HARD_BLOCKED = new Set(['sooho.io', 'bitmex.com', 'bitmart.com', 'despread.io']);
  const INVALID_EMAILS = new Set(['info@succinct.xyz', 'security@raydium.io']);

  const ROWS = [
    {
        "company": "Saga",
        "domain": "saga.xyz",
        "url": "https://www.saga.xyz/",
        "email": "info@saga.xyz",
        "title": "Media / Ecosystem / Partnerships",
        "score": 97,
        "kbw_status": "2026 Open Source AI Summit Seoul 공식 연사",
        "signal": "Saga Developer Relations joined the 2026 Open Source AI Summit in Seoul during BUIDL Week.",
        "source_url": "https://luma.com/5ud5jwip",
        "contact_source": "https://www.saga.xyz/media-kit"
    },
    {
        "company": "WalletConnect",
        "domain": "walletconnect.com",
        "url": "https://walletconnect.com/",
        "email": "sales@walletconnect.com",
        "title": "Sales / Ecosystem Partnerships",
        "score": 99,
        "kbw_status": "Korea Buidl Week 2026 Coffee Connect Seoul 직접 운영",
        "signal": "WalletConnect ran Coffee Connect during Korea Buidl Week 2026 in Seoul, creating a direct current on-site team signal.",
        "source_url": "https://www.buidlkorea.com/events",
        "contact_source": "https://docs.walletconnect.network/wallet-sdk/chain-support/overview"
    },
    {
        "company": "Optimum",
        "domain": "getoptimum.xyz",
        "url": "https://www.getoptimum.xyz/",
        "email": "info@getoptimum.xyz",
        "title": "Team / Partnerships",
        "score": 99,
        "kbw_status": "Korea Buidl Week 2026 CODED @ BUIDL ASIA 직접 주최",
        "signal": "Optimum hosted CODED @ BUIDL ASIA in Gangnam during Korea Buidl Week 2026.",
        "source_url": "https://luma.com/ube7qfat",
        "contact_source": "https://www.getoptimum.xyz/privacy-policy"
    },
    {
        "company": "SheFi",
        "domain": "shefi.org",
        "url": "https://www.shefi.org/",
        "email": "social@shefi.org",
        "title": "Community / Partnerships",
        "score": 99,
        "kbw_status": "SheFi Seoul Summit 2026 직접 운영",
        "signal": "SheFi returned to Seoul for its third SheFi Seoul Summit in 2026 with an in-person BUIDL Week program.",
        "source_url": "https://luma.com/jz7wca0x",
        "contact_source": "https://www.shefi.org/terms-and-condition"
    },
    {
        "company": "Hyperbolic",
        "domain": "hyperbolic.ai",
        "url": "https://www.hyperbolic.ai/",
        "email": "sales@hyperbolic.ai",
        "title": "Sales / Partnerships",
        "score": 98,
        "kbw_status": "KBW Seoul AI After Hours 직접 주최",
        "signal": "Hyperbolic hosted AI After Hours during Korea Blockchain Week in Seoul with a large in-person audience, drinks and light bites.",
        "source_url": "https://luma.com/74q8pbkf",
        "contact_source": "https://www.hyperbolic.ai/docs/reserved/getting-started"
    },
    {
        "company": "B3",
        "domain": "b3.fun",
        "url": "https://www.b3.fun/",
        "email": "contact@b3.fun",
        "title": "Foundation / Partnerships",
        "score": 98,
        "kbw_status": "KBW Seoul Boon & B3yond activation 직접 운영",
        "signal": "B3 ran a Korea Blockchain Week Seoul activation with hundreds of attendees, giving the team a concrete event-operations signal.",
        "source_url": "https://luma.com/a1rzrusu",
        "contact_source": "https://docs.b3.fun/protocol/whitepaper-mica"
    },
    {
        "company": "Keplr",
        "domain": "keplr.app",
        "url": "https://www.keplr.app/",
        "email": "contact@keplr.app",
        "title": "Community / Partnerships",
        "score": 96,
        "kbw_status": "KBW Seoul Infra Day 현장 참여",
        "signal": "Keplr joined Infra Day during Korea Blockchain Week in Seoul, an in-person ecosystem event with food and drinks.",
        "source_url": "https://luma.com/jgpjd00y",
        "contact_source": "https://privacy-policy.keplr.app/"
    },
    {
        "company": "Starknet Foundation",
        "domain": "starknetfoundation.org",
        "url": "https://www.starknetfoundation.org/",
        "email": "developerpartnerships@starknetfoundation.org",
        "title": "Developer Partnerships",
        "score": 99,
        "kbw_status": "KBW Seoul StarkMart physical activation 운영",
        "signal": "Starknet ran StarkMart during Korea Blockchain Week in Seoul and maintained developer-partnership activity around the ecosystem.",
        "source_url": "https://luma.com/StarkMart",
        "contact_source": "https://www.starknet.io/blog/the-starknet-foundation-meet-the-committees/"
    },
    {
        "company": "Quack AI",
        "domain": "quackai.ai",
        "url": "https://quackai.ai/",
        "email": "business@quackai.ai",
        "title": "Business / Partnerships",
        "score": 97,
        "kbw_status": "AI/InfraCon 2026 Seoul 공식 파트너",
        "signal": "Quack AI was an official partner of AI/InfraCon 2026 in Seoul during BUIDL Week.",
        "source_url": "https://luma.com/8nzr1zec",
        "contact_source": "https://q402.quackai.ai/grant"
    },
    {
        "company": "Unibase",
        "domain": "unibase.com",
        "url": "https://www.unibase.com/",
        "email": "support@unibase.com",
        "title": "Ecosystem / Partnerships Routing",
        "score": 100,
        "kbw_status": "2026 BUIDL ASIA Seoul 직접 주최 · 신규 굿즈/merch share",
        "signal": "Unibase hosted the 2026 Agent Economy Summit in Seoul with catering, newly released project merchandise and a dedicated merch-share check-in.",
        "source_url": "https://luma.com/vhv3f8n8",
        "contact_source": "https://www.unibase.com/aip"
    },
    {
        "company": "Nethermind",
        "domain": "nethermind.io",
        "url": "https://www.nethermind.io/",
        "email": "hello@nethermind.io",
        "title": "Business / Partnerships",
        "score": 98,
        "kbw_status": "2026 Open Source AI Summit Seoul 공식 스폰서·연사",
        "signal": "Nethermind sponsored the 2026 Open Source AI Summit Seoul and had its AI product team speaking on stage.",
        "source_url": "https://luma.com/5ud5jwip",
        "contact_source": "https://www.nethermind.io/contact-us"
    },
    {
        "company": "Exabits",
        "domain": "exabits.ai",
        "url": "https://www.exabits.ai/",
        "email": "contact@exabits.ai",
        "title": "Business / Partnerships",
        "score": 98,
        "kbw_status": "2026 Open Source AI Summit Seoul 공식 스폰서",
        "signal": "Exabits sponsored the 2026 Open Source AI Summit Seoul during BUIDL Week.",
        "source_url": "https://luma.com/5ud5jwip",
        "contact_source": "https://www.globenewswire.com/news-release/2025/04/28/3069524/0/en/Exabits-teams-up-with-NEAR-to-push-the-boundaries-of-decentralized-AI.html"
    },
    {
        "company": "NEAR AI",
        "domain": "near.ai",
        "url": "https://near.ai/",
        "email": "social@near.foundation",
        "title": "AI Ecosystem / Community",
        "score": 100,
        "kbw_status": "BuidlHack 2026 $5K 공식 스폰서 트랙 · Seoul Summit 공동주최",
        "signal": "NEAR AI sponsored a dedicated $5,000 BuidlHack 2026 track and co-hosted the Open Source AI Summit Seoul.",
        "source_url": "https://www.buidlkorea.com/buidlhack2026",
        "contact_source": "https://www.globenewswire.com/news-release/2025/04/28/3069524/0/en/Exabits-teams-up-with-NEAR-to-push-the-boundaries-of-decentralized-AI.html",
        "trusted_cross_domain": true
    },
    {
        "company": "Axelar Foundation",
        "domain": "axelar.network",
        "url": "https://www.axelar.network/",
        "email": "info@axelar.foundation",
        "title": "Foundation / Partnerships",
        "score": 97,
        "kbw_status": "AI/InfraCon 2026 Seoul 공식 파트너",
        "signal": "Axelar was an official partner of AI/InfraCon 2026 in Seoul during BUIDL Week.",
        "source_url": "https://luma.com/8nzr1zec",
        "contact_source": "https://www.axelar.network/privacy-policy",
        "trusted_cross_domain": true
    },
    {
        "company": "Anchored Finance",
        "domain": "anchored.finance",
        "url": "https://anchored.finance/",
        "email": "info@anchored.finance",
        "title": "Business / Partnerships",
        "score": 100,
        "kbw_status": "RWA Forum Seoul 2026 공동주최",
        "signal": "Anchored co-hosted the April 2026 RWA Forum in Seoul, with its CEO and strategy lead both on the program.",
        "source_url": "https://www.rwaforum.kr/",
        "contact_source": "https://anchored.finance/"
    },
    {
        "company": "Alpaca",
        "domain": "alpaca.markets",
        "url": "https://alpaca.markets/",
        "email": "support@alpaca.markets",
        "title": "Business / Partnerships Routing",
        "score": 99,
        "kbw_status": "RWA Forum Seoul 2026 공동주최·CRO 연사",
        "signal": "Alpaca co-hosted the April 2026 RWA Forum in Seoul and sent its Chief Revenue Officer to the program.",
        "source_url": "https://www.rwaforum.kr/",
        "contact_source": "https://alpaca.markets/contact"
    },
    {
        "company": "Blue Ocean Technologies",
        "domain": "blueocean-tech.io",
        "url": "https://blueocean-tech.io/",
        "email": "sales@blueoceanats.com",
        "title": "Sales / APAC Partnerships",
        "score": 99,
        "kbw_status": "RWA Forum Seoul 2026 APAC 연사",
        "signal": "Blue Ocean Technologies joined the 2026 RWA Forum in Seoul through its APAC leadership, adding a concrete Korea-facing institutional event signal.",
        "source_url": "https://www.rwaforum.kr/",
        "contact_source": "https://blueocean-tech.io/contact-us/",
        "trusted_cross_domain": true
    },
    {
        "company": "OpenEden",
        "domain": "openeden.com",
        "url": "https://openeden.com/",
        "email": "support@openeden.com",
        "title": "Growth / Partnerships Routing",
        "score": 99,
        "kbw_status": "RWA Forum Seoul 2026 CEO 연사 · 한국 핵심시장 신호",
        "signal": "OpenEden CEO Jeremy Ng joined the 2026 RWA Forum in Seoul, and the team has continued active Korea-facing institutional RWA outreach.",
        "source_url": "https://www.rwaforum.kr/",
        "contact_source": "https://t.me/openeden"
    },
    {
        "company": "Jito Foundation",
        "domain": "jito.network",
        "url": "https://www.jito.network/",
        "email": "jitopr@mgroupsc.com",
        "title": "Media / APAC Routing",
        "score": 98,
        "kbw_status": "RWA Forum Seoul 2026 Korea Lead 연사",
        "signal": "Jito's Korea Lead joined the 2026 RWA Forum in Seoul while the foundation expanded institutional Solana infrastructure across APAC.",
        "source_url": "https://www.rwaforum.kr/",
        "contact_source": "https://www.globenewswire.com/news-release/2026/05/06/3288875/0/en/Jito-Foundation-and-Solana-Company-NASDAQ-HSDT-Announce-Strategic-Partnership-to-Expand-Institutional-Solana-Infrastructure-Across-Asia-Pacific-Region.html",
        "trusted_cross_domain": true
    },
    {
        "company": "EigenLayer",
        "domain": "eigenlayer.xyz",
        "url": "https://www.eigenlayer.xyz/",
        "email": "builders@eigenlabs.org",
        "title": "Developer Relations / Ecosystem",
        "score": 98,
        "kbw_status": "2026 Open Source AI Summit Seoul 재단 CEO 연사",
        "signal": "EigenLayer Foundation CEO Robert Drost spoke at the 2026 Open Source AI Summit Seoul during BUIDL Week.",
        "source_url": "https://luma.com/5ud5jwip",
        "contact_source": "https://blog.eigencloud.xyz/celebrating-commit-boost/",
        "trusted_cross_domain": true
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

  function storedDomains(key) {
    const value = readJson(key, []);
    const values = Array.isArray(value) ? value : Array.isArray(value?.domains) ? value.domains : [];
    return values.map(normalizeDomain).filter(Boolean);
  }

  async function liveSentDomains() {
    const cached = storedDomains(SENT_CACHE_KEY);
    try {
      const response = await window.fetch(`${SENT_ENDPOINT}&t=${Date.now()}`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data.domains)) return cached;
      const domains = [...new Set(data.domains.map(normalizeDomain).filter(Boolean))];
      try { localStorage.setItem(SENT_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), domains })); } catch {}
      return domains;
    } catch {
      return cached;
    }
  }

  function existingDomains() {
    const result = new Set();
    for (const lead of state.leads || []) {
      [
        lead?.domain,
        lead?.url,
        lead?.contact?.email,
        ...(Array.isArray(lead?.contacts) ? lead.contacts.map((item) => item?.email) : [])
      ].forEach((value) => {
        const domain = normalizeDomain(value || '');
        if (domain) result.add(domain);
      });
    }
    return result;
  }

  function purgeObsoleteAndBlocked() {
    if (typeof state === 'undefined' || !Array.isArray(state.leads)) return 0;
    const removedIds = [];
    const next = state.leads.filter((lead) => {
      const id = String(lead?.id || '');
      const domain = normalizeDomain(lead?.domain || lead?.url || lead?.contact?.email || '');
      const obsolete = lead?.batch === OBSOLETE_BATCH || id.startsWith('kbw-fresh20-20260812:');
      const hardBlocked = HARD_BLOCKED.has(domain);
      const remove = obsolete || hardBlocked;
      if (remove && lead?.id) removedIds.push(lead.id);
      return !remove;
    });
    const removed = state.leads.length - next.length;
    if (removed) {
      state.leads = next;
      for (const id of removedIds) state.selected?.delete?.(id);
    }
    if (state.rejected instanceof Set) {
      for (const domain of HARD_BLOCKED) state.rejected.add(domain);
    }
    return removed;
  }

  function installHardBlockFetchGuard() {
    if (window.fetch?.__kbwHardBlock20260812v2) return;
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
      const leads = data.leads.filter((lead) => {
        const domain = normalizeDomain(lead?.domain || lead?.url || lead?.contact?.email || '');
        return !HARD_BLOCKED.has(domain);
      });
      if (leads.length === data.leads.length) return response;

      return new Response(JSON.stringify({ ...data, leads }), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    };
    guardedFetch.__kbwHardBlock20260812v2 = true;
    window.fetch = guardedFetch;
  }

  function makeContact(row) {
    const companyDomain = normalizeDomain(row.domain);
    const emailDomain = normalizeDomain(row.email);
    return {
      email: String(row.email || '').trim().toLowerCase(),
      name: `${row.company} Team`,
      title: row.title,
      emailStatus: 'valid',
      email_status: 'verified',
      type: row.email.split('@')[0].includes('.') ? 'personal' : 'generic',
      sources: [row.contact_source],
      source_url: row.contact_source,
      providers: ['manual_db', 'official_web'],
      provider: 'manual_db+official_web',
      score: 99,
      qualified: true,
      verifiedOverride: true,
      verified_override: true,
      trustedCrossDomain: row.trusted_cross_domain === true || (companyDomain && emailDomain && companyDomain !== emailDomain),
      lookupDomain: row.domain,
      priority: row.score >= 98 ? 10 : 30,
      verifiedAt: '2026-08-12',
      sourceLabel: 'Public business contact verified for Seoul/KBW outreach'
    };
  }

  function makeLead(row) {
    const contact = makeContact(row);
    const question = 'Have you already sorted team shirts, staff wear, or event merch for your next Seoul visit?';
    const messageEn = `Hi ${row.company} team,

I saw ${row.company}'s recent Seoul/Korea event activity. ${row.signal}

${question}

We produce T-shirts, hoodies, caps and staff wear locally in Seoul and can deliver directly to your hotel, office or venue. If apparel is still open, I can send 2–3 practical options with USD pricing and turnaround times for 20 / 50 / 100 units.

Would it be useful if I send the options?

Best,
NYF`;

    return {
      id: `kbw-fresh20-20260812-v2:${normalizeDomain(row.domain)}`,
      batch: BATCH,
      campaign: 'kbw',
      campaign_label: 'KBW 단체복',
      company: row.company,
      domain: normalizeDomain(row.domain),
      url: row.url,
      source_url: row.source_url,
      source_title: row.kbw_status,
      published_date: '2026-08-12',
      signal: row.signal,
      score: row.score,
      sales_priority: row.score + 35,
      win_score: Math.min(100, row.score),
      win_label: row.score >= 98 ? '승산 높음' : '우선 연락',
      opportunity_lane: 'fresh-overseas-kbw-korea-20260812',
      reachability: row.score >= 98 ? '접근 최우선' : '접근 우선',
      kbw_status: row.kbw_status,
      kbw_status_code: 'verified',
      outreach_language: 'en',
      verified_company: true,
      verified_by: '2026-08-12 Luma/Korea Buidl Week/official web + Gmail Sent audit',
      quality_reasons: [
        '해외/글로벌 팀',
        '서울·KBW·Korea Buidl Week 현장 신호 확인',
        '공개 업무 이메일 근거 확인',
        '기존 하드코딩 후보 제외',
        'Gmail 발송 이력 사전 대조'
      ],
      tool_signals: ['fresh_2026_seoul', 'luma_or_kbw', 'verified_public_email', 'gmail_sent_audit'],
      recommended_role: row.title,
      role_targets: [row.title, 'Events', 'Partnerships', 'Marketing', 'Community'],
      offer: 'KBW 기간 서울 방문 팀웨어·스태프웨어·커스텀 의류 현지 제작·납품',
      outreach_goal: 'reply',
      outreach_stage: 'first_touch',
      reply_question: question,
      subject: `Quick question about ${row.company}'s Seoul plans`,
      message_en: messageEn,
      contact,
      contacts: [contact],
      contact_provider: 'manual_db+official_web',
      contact_status: 'found',
      hardcoded_email_override: true,
      hardcoded_email_source: row.contact_source,
      fresh20_20260812: true,
      fresh20_version: 2
    };
  }

  async function inject(attempt = 0) {
    if (typeof state === 'undefined' || !Array.isArray(state.leads) || typeof mergeLeads !== 'function') {
      if (attempt < 40) setTimeout(() => inject(attempt + 1), 250);
      return;
    }

    installHardBlockFetchGuard();
    const removed = purgeObsoleteAndBlocked();
    const sent = await liveSentDomains();
    const deleted = storedDomains(DELETED_KEY);
    const rejected = state.rejected instanceof Set
      ? [...state.rejected].map(normalizeDomain).filter(Boolean)
      : [];
    const blocked = new Set([...sent, ...deleted, ...rejected, ...HARD_BLOCKED].filter(Boolean));
    const existing = existingDomains();
    const seen = new Set();

    const eligibleRows = ROWS.filter((row) => {
      const companyDomain = normalizeDomain(row.domain);
      const email = String(row.email || '').trim().toLowerCase();
      const emailDomain = normalizeDomain(email);
      if (!companyDomain || !emailDomain || INVALID_EMAILS.has(email)) return false;
      if (blocked.has(companyDomain) || blocked.has(emailDomain)) return false;
      if (existing.has(companyDomain) || existing.has(emailDomain)) return false;
      if (seen.has(companyDomain) || seen.has(emailDomain)) return false;
      seen.add(companyDomain);
      seen.add(emailDomain);
      return true;
    });

    const chosenRows = eligibleRows.slice(0, EXPECTED);
    const added = mergeLeads(chosenRows.map(makeLead));
    if ((added.length || removed) && typeof saveState === 'function') saveState();
    if ((added.length || removed) && typeof render === 'function') render();

    state.statusText = `KBW 해외 신규 후보 ${added.length}/${EXPECTED} 추가 · 발송/추가/삭제/반송/영업종료 제외 · 2026-08-12 재검증`;
    if (typeof saveState === 'function') saveState();
    if (typeof render === 'function') render();

    window.KBWFresh20_20260812 = {
      batch: BATCH,
      version: 2,
      researched: ROWS.length,
      eligible: eligibleRows.length,
      selected: chosenRows.map((row) => row.company),
      added: added.map((lead) => lead.company),
      excluded: ROWS.filter((row) => !chosenRows.includes(row)).map((row) => row.company),
      blockedDomains: [...blocked],
      obsoleteRemoved: removed
    };
  }

  installHardBlockFetchGuard();
  inject();
})();
