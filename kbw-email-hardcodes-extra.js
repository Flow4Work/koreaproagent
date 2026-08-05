(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const previousFetch = window.fetch.bind(window);

  const OVERRIDES = [
    {
      matchDomains: ['blockeden.xyz'],
      company: 'BlockEden.xyz',
      canonicalDomain: 'blockeden.xyz',
      email: 'support@blockeden.xyz',
      title: 'Support / Partnerships Routing',
      score: 91,
      winScore: 82,
      winLabel: '승산 높음',
      reachability: '접근 우선',
      kbwStatus: 'Web3 인프라·아시아 행사 접점 확인 필요',
      signal: 'BlockEden publishes an official same-domain support address and operates Web3 infrastructure products. Use the first email to confirm Seoul or KBW plans and ask for routing to the partnerships or events owner.',
      contactSource: 'https://blockeden.xyz/docs/x402/quickstart/',
      sourceLabel: 'Official BlockEden documentation support contact'
    },
    {
      matchDomains: ['bnbchain.org'],
      company: 'BNB Chain',
      canonicalDomain: 'bnbchain.org',
      email: 'info@bnbchain.org',
      title: 'Ecosystem / Partnerships',
      score: 96,
      winScore: 90,
      winLabel: '승산 높음',
      reachability: '접근 최우선',
      kbwStatus: 'KBW 행사 참여 이력',
      signal: 'BNB Chain has participated in Korea Blockchain Week and publishes an official ecosystem contact for accelerators, studios, and builder partnerships. Seoul-local apparel production is directly relevant to event operations.',
      contactSource: 'https://www.bnbchain.org/en/blog/mvb-accelerator-program-teams-up-with-cmc-labs-to-launch-new-founder-track-aiming-to-incubate-100-new-projects-on-bnb-chain',
      sourceLabel: 'Official BNB Chain ecosystem partnership email'
    },
    {
      matchDomains: ['coredao.org'],
      company: 'Core DAO',
      canonicalDomain: 'coredao.org',
      email: 'inquire@coredao.org',
      title: 'Institutional / Partnerships',
      score: 94,
      winScore: 87,
      winLabel: '승산 높음',
      reachability: '접근 우선',
      kbwStatus: 'KBW·한국 행사 신호',
      signal: 'Core DAO publishes an official institutional-inquiries address and has active ecosystem and conference participation. Ask whether the team has Seoul event staffing or apparel needs around KBW.',
      contactSource: 'https://coredao.org/blog/bitcoin%E2%80%91staking%E2%80%91institutions',
      sourceLabel: 'Official Core DAO institutional inquiries email'
    },
    {
      matchDomains: ['aptosnetwork.com'],
      company: 'Aptos Foundation',
      canonicalDomain: 'aptosfoundation.org',
      email: 'community@aptosfoundation.org',
      title: 'Community / Events',
      score: 95,
      winScore: 88,
      winLabel: '승산 높음',
      reachability: '접근 우선',
      kbwStatus: '한국 커뮤니티·서울 행사 이력',
      signal: 'Aptos maintains an active Korea community and Seoul event history. Its official community address is appropriate for routing a concise question about KBW team wear, staff apparel, or event merchandise.',
      contactSource: 'https://forum.aptosfoundation.org/t/usdt-has-officially-arrived-on-aptos-mainnet/13358?page=2',
      sourceLabel: 'Official Aptos Foundation community email published in its forum'
    },
    {
      matchDomains: ['supermoonstation.com'],
      company: 'Supermoon',
      canonicalDomain: 'supermooncamp.com',
      email: 'alpha@supermooncamp.com',
      title: 'Events / Partnerships',
      score: 97,
      winScore: 92,
      winLabel: '승산 높음',
      reachability: '접근 최우선',
      kbwStatus: '글로벌 Web3 행사 운영',
      signal: 'Supermoon runs founder, investor, and community activations around major Web3 conferences and publishes a direct event and media contact. Local Seoul production and venue delivery are a strong operational fit.',
      contactSource: 'https://www.supermoonstation.com/post/exclusive-discount-for-abs2024',
      sourceLabel: 'Official Supermoon event and media inquiries email'
    },
    {
      matchDomains: ['pyth.network'],
      company: 'Pyth Network',
      canonicalDomain: 'pyth.network',
      email: 'business@pyth.network',
      title: 'Business / Partnerships',
      score: 93,
      winScore: 85,
      winLabel: '승산 높음',
      reachability: '접근 우선',
      kbwStatus: '한국 생태계 확장 신호',
      signal: 'Pyth publishes a direct business contact for institutional data providers and ecosystem collaboration. Confirm any Seoul or KBW activation before proposing locally produced team and staff apparel.',
      contactSource: 'https://www.pyth.network/blog/pythiad-6-2021-in-review-2022-in-sight',
      sourceLabel: 'Official Pyth Network business contact'
    },
    {
      matchDomains: ['cryptoforinnovation.org'],
      company: 'Crypto Council for Innovation',
      canonicalDomain: 'cryptocouncil.org',
      email: 'info@cryptocouncil.org',
      title: 'Programs / Partnerships',
      score: 86,
      winScore: 77,
      winLabel: '승산 있음',
      reachability: '접근 가능',
      kbwStatus: '아시아 정책·산업 행사 가능성 확인 필요',
      signal: 'The Crypto Council for Innovation publishes an official general contact for workshops and industry collaboration. Keep the first message limited to confirming Seoul attendance and routing it to the events or operations owner.',
      contactSource: 'https://cryptoforinnovation.org/wp-content/uploads/2024/02/Workshop-Brochure-26-Feb.pdf',
      sourceLabel: 'Official Crypto Council workshop and general contact'
    }
  ];

  const clean = (value = '', max = 500) => String(value || '').trim().slice(0, max);

  function rootDomain(value = '') {
    let host = clean(value, 500).toLowerCase();
    try {
      host = new URL(host.includes('://') ? host : `https://${host}`).hostname;
    } catch {
      host = host.split('/')[0].split(':')[0];
    }
    host = host.replace(/^www\./, '').replace(/\.+$/, '');
    const parts = host.split('.').filter(Boolean);
    if (parts.length <= 2) return host;
    const commonSecond = new Set(['ac', 'co', 'com', 'edu', 'go', 'gov', 'ne', 'net', 'or', 'org']);
    const depth = parts.at(-1)?.length === 2 && commonSecond.has(parts.at(-2)) ? 3 : 2;
    return parts.slice(-depth).join('.');
  }

  function parseBody(init = {}) {
    if (typeof init?.body !== 'string') return {};
    try { return JSON.parse(init.body); } catch { return {}; }
  }

  function requestMeta(input, init = {}) {
    const rawUrl = typeof input === 'string' ? input : input?.url || '';
    const method = clean(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET', 12).toUpperCase();
    try {
      const url = new URL(rawUrl, location.origin);
      return { method, sameOrigin: url.origin === location.origin, pathname: url.pathname };
    } catch {
      return { method, sameOrigin: false, pathname: '' };
    }
  }

  function overrideFor(value = '') {
    const domain = rootDomain(value);
    if (!domain) return null;
    return OVERRIDES.find(row => row.matchDomains.some(candidate => rootDomain(candidate) === domain)) || null;
  }

  function overrideForLead(lead = {}) {
    return overrideFor(lead.original_domain)
      || overrideFor(lead.domain)
      || overrideFor(lead.url)
      || null;
  }

  function makeContact(row) {
    return {
      name: '',
      title: row.title,
      email: row.email,
      emailStatus: 'valid',
      type: 'generic',
      sources: [row.contactSource],
      providers: ['manual_hardcode', 'official_web'],
      provider: 'manual_hardcode+official_web',
      score: 98,
      scoreBreakdown: { validation: 30, role: 28, identity: 20, domain: 10, evidence: 10, penalty: 0, total: 98 },
      qualified: true,
      verifiedOverride: true,
      verified_override: true,
      trustedCrossDomain: row.matchDomains.every(domain => rootDomain(domain) !== rootDomain(row.canonicalDomain)),
      lookupDomain: rootDomain(row.canonicalDomain),
      priority: Math.max(1, 110 - row.score),
      verifiedAt: '2026-08-05',
      sourceLabel: row.sourceLabel
    };
  }

  function messageFor(row) {
    return `Hi,\n\nI’m reaching out because ${row.company} has a relevant Korea, Web3 event, or ecosystem signal. Have you already sorted team shirts, staff wear, or event merch for any Seoul plans around KBW?\n\nWe produce T-shirts, hoodies, and staff wear locally in Seoul and can deliver directly to your hotel, office, or venue. If plans are still open, I can send 2–3 practical options with pricing and turnaround times.`;
  }

  function applyOverride(lead = {}) {
    const row = overrideForLead(lead);
    if (!row) return lead;

    const previousDomain = rootDomain(lead.original_domain || lead.domain || lead.url || '');
    const canonicalDomain = rootDomain(row.canonicalDomain);
    const contact = makeContact(row);
    const reasons = [
      ...(Array.isArray(lead.quality_reasons) ? lead.quality_reasons : []),
      '공식 공개 이메일 확인',
      '발송 가능한 담당 부서 연락처',
      row.kbwStatus
    ];
    const toolSignals = [
      ...(Array.isArray(lead.tool_signals) ? lead.tool_signals : []),
      'manual_hardcode',
      'official_web'
    ];

    return {
      ...lead,
      company: row.company,
      original_domain: previousDomain && previousDomain !== canonicalDomain ? previousDomain : lead.original_domain,
      domain: canonicalDomain,
      url: `https://${canonicalDomain}/`,
      signal: row.signal,
      score: Math.max(Number(lead.score || 0), row.score),
      sales_priority: Math.max(Number(lead.sales_priority || lead.score || 0), row.score + 18),
      win_score: Math.max(Number(lead.win_score || 0), row.winScore),
      win_label: row.winLabel,
      reachability: row.reachability,
      kbw_status: row.kbwStatus,
      outreach_language: 'en',
      verified_company: true,
      verified_by: 'manual-research+official-web+hardcoded',
      quality_reasons: [...new Set(reasons.filter(Boolean))],
      tool_signals: [...new Set(toolSignals.filter(Boolean))],
      recommended_role: row.title,
      role_targets: [row.title, 'Events Lead', 'Partnerships Lead', 'Community Lead', 'Head of Marketing'],
      offer: 'KBW 기간 서울 방문 시 팀웨어·스태프웨어·커스텀 의류를 서울 현지에서 제작·납품',
      outreach_goal: 'reply',
      outreach_stage: 'first_touch',
      reply_question: 'Have you already sorted team shirts, staff wear, or event merch for any Seoul plans around KBW?',
      subject: `Quick question about ${row.company}'s Seoul event plans`,
      message_en: messageFor(row),
      contact,
      contacts: [contact],
      contact_provider: 'manual_hardcode+official_web',
      contact_status: 'found',
      hardcoded_email_override: true,
      hardcoded_email_source: row.contactSource
    };
  }

  function patchStoredLeads() {
    let leads;
    try { leads = JSON.parse(localStorage.getItem(LEADS_KEY) || '[]'); } catch { return; }
    if (!Array.isArray(leads) || !leads.length) return;

    let changed = false;
    const patched = leads.map(lead => {
      const next = applyOverride(lead);
      if (next !== lead) changed = true;
      return next;
    });
    if (changed) localStorage.setItem(LEADS_KEY, JSON.stringify(patched));
  }

  window.fetch = async function kbwEmailHardcodeExtraFetch(input, init = {}) {
    const meta = requestMeta(input, init);

    if (meta.method === 'POST' && meta.sameOrigin && meta.pathname === '/api/contact') {
      const body = parseBody(init);
      const row = overrideFor(body.url || body.domain || body.lookupDomain || '');
      if (row) {
        const contact = makeContact(row);
        return new Response(JSON.stringify({
          contact,
          contacts: [contact],
          provider: 'manual_hardcode+official_web',
          provider_status: { manual_hardcode: true, official_web: true },
          attempts: [{ provider: 'manual_hardcode', status: 'found', count: 1 }],
          qualified_count: 1,
          score_threshold: 75,
          contact_status: 'qualified',
          failure_reason: null,
          stop_reason: 'verified_hardcoded_contact_found',
          cache_hit: false,
          target_contacts: 1
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
      }
    }

    if (meta.method === 'POST' && meta.sameOrigin && meta.pathname === '/api/hunt') {
      const response = await previousFetch(input, init);
      const data = await response.clone().json().catch(() => null);
      if (!data || !Array.isArray(data.leads)) return response;

      const patchedLeads = data.leads.map(applyOverride);
      const appliedCount = patchedLeads.filter(lead => lead?.hardcoded_email_override === true).length;
      return new Response(JSON.stringify({
        ...data,
        leads: patchedLeads,
        meta: {
          ...(data.meta || {}),
          kbw_email_hardcodes_extra_used: appliedCount > 0,
          kbw_email_hardcodes_extra_applied: appliedCount
        }
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }

    return previousFetch(input, init);
  };

  patchStoredLeads();
})();
