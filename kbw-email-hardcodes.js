(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const originalFetch = window.fetch.bind(window);

  const OVERRIDES = [
    {
      matchDomains: ['carv.io'],
      company: 'CARV',
      canonicalDomain: 'carv.io',
      email: 'support@carv.io',
      title: 'Community / Partnerships',
      score: 90,
      winScore: 82,
      winLabel: '승산 높음',
      reachability: '접근 우선',
      kbwStatus: '서울·한국 접점 확인 필요',
      signal: 'CARV has active ecosystem partnerships and a verified Korea-facing project contact. Confirm whether the team has Seoul or KBW plans before proposing locally produced apparel.',
      contactSource: 'https://static.upbit.com/guide/circulating_supply/CARV_20241015.pdf',
      sourceLabel: 'Official project contact published in an Upbit disclosure'
    },
    {
      matchDomains: ['hashkey.com'],
      company: 'HashKey Group',
      canonicalDomain: 'hashkey.com',
      email: 'enquiries@hashkey.com',
      title: 'Business Enquiries / Partnerships',
      score: 90,
      winScore: 80,
      winLabel: '승산 높음',
      reachability: '접근 가능',
      kbwStatus: '한국 확장 신호',
      signal: 'HashKey publishes a general business-enquiries address and operates across Asian digital-asset markets. Use a concise Seoul-event apparel question rather than a broad sales introduction.',
      contactSource: 'https://group.hashkey.com/en/hsk',
      sourceLabel: 'Official HashKey Group business enquiries contact'
    },
    {
      matchDomains: ['marketacross.com'],
      company: 'MarketAcross',
      canonicalDomain: 'marketacross.com',
      email: 'info@marketacross.com',
      title: 'Events / Partnerships',
      score: 94,
      winScore: 88,
      winLabel: '승산 높음',
      reachability: '접근 우선',
      kbwStatus: 'KBW 관련 행사 경험',
      signal: 'MarketAcross works with major blockchain conferences and has Korea Blockchain Week-related event experience, making local Seoul production and last-mile delivery directly relevant.',
      contactSource: 'https://marketacross.com/wp-content/uploads/2024/06/One-pager_Document_MarketAcross-2.pdf',
      sourceLabel: 'Official MarketAcross company one-pager and event services'
    },
    {
      matchDomains: ['ch3.agency'],
      company: 'CH3',
      canonicalDomain: 'ch3.agency',
      email: 'hello@ch3.agency',
      title: 'Event Production / Partnerships',
      score: 95,
      winScore: 89,
      winLabel: '승산 높음',
      reachability: '접근 우선',
      kbwStatus: 'Web3 행사·머치 직접 연관',
      signal: 'CH3 produces crypto and Web3 events and explicitly offers merch, swag, brand activations, and event production. A Seoul local-production partnership is a strong operational fit.',
      contactSource: 'https://www.ch3.agency/contact-us/',
      sourceLabel: 'Public company email with official CH3 event and merch services'
    },
    {
      matchDomains: ['protocolcamp.com'],
      company: 'Protocol Camp / ShardLab',
      canonicalDomain: 'shardlab.com',
      email: 'info@shardlab.com',
      title: 'Program Operations / Partnerships',
      score: 96,
      winScore: 91,
      winLabel: '승산 높음',
      reachability: '접근 최우선',
      kbwStatus: '2026 일정·서울 운영사 확인',
      signal: 'Protocol Camp lists a September 29–October 1, 2026 kick-off and identifies ShardLab as the organizer. ShardLab also publishes a Seoul office and official general contact, so local apparel delivery is immediately relevant.',
      contactSource: 'https://shardlab.com/',
      sourceLabel: 'Official Protocol Camp organizer and ShardLab contact'
    },
    {
      matchDomains: ['bpn.finance'],
      company: 'Better Payment Network',
      canonicalDomain: 'bpn.finance',
      email: 'support@bpn.finance',
      title: 'General Support / Partnerships Routing',
      score: 78,
      winScore: 70,
      winLabel: '승산 있음',
      reachability: '접근 가능',
      kbwStatus: '행사 참석 여부 확인 필요',
      signal: 'BPN is an active Web3 payments team with recent ecosystem partnerships and an official same-domain contact. Keep the first message limited to confirming Seoul plans and route it to the event or partnerships owner.',
      contactSource: 'https://www.bpn.finance/terms-of-use',
      sourceLabel: 'Official BPN communication address'
    },
    {
      matchDomains: ['sygnum.com'],
      company: 'Sygnum',
      canonicalDomain: 'sygnum.com',
      email: 'contactus@sygnum.com',
      title: 'General Enquiries',
      score: 74,
      winScore: 64,
      winLabel: '탐색 후보',
      reachability: '후순위',
      kbwStatus: 'KBW 참석 여부 확인 필요',
      signal: 'Sygnum publishes an official general-enquiries address, but the current lead lacks a confirmed KBW signal. Make it sendable while keeping it below event-confirmed prospects.',
      contactSource: 'https://www.sygnum.com/contact-us/',
      sourceLabel: 'Official Sygnum general enquiries contact'
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
      '발송 가능한 동일 도메인 연락처',
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
      offer: 'KBW 기간 티셔츠·후디·스태프 의류를 서울 현지에서 제작·납품',
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

  window.fetch = async function kbwEmailHardcodeFetch(input, init = {}) {
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
      const response = await originalFetch(input, init);
      const data = await response.clone().json().catch(() => null);
      if (!data || !Array.isArray(data.leads)) return response;

      const patchedLeads = data.leads.map(applyOverride);
      const appliedCount = patchedLeads.filter(lead => lead?.hardcoded_email_override === true).length;
      return new Response(JSON.stringify({
        ...data,
        leads: patchedLeads,
        meta: {
          ...(data.meta || {}),
          kbw_email_hardcodes_used: appliedCount > 0,
          kbw_email_hardcodes_applied: appliedCount
        }
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }

    return originalFetch(input, init);
  };

  patchStoredLeads();
})();
