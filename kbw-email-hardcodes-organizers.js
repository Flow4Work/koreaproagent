(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const previousFetch = window.fetch.bind(window);

  const OVERRIDES = [
    {
      matchDomains: ['seablockchainweek.org'],
      company: 'Southeast Asia Blockchain Week / ShardLab',
      canonicalDomain: 'shardlab.com',
      email: 'info@shardlab.com',
      title: 'Events / Partnerships',
      score: 90,
      winScore: 81,
      winLabel: '승산 높음',
      reachability: '접근 우선',
      kbwStatus: 'ShardLab 주최 행사 확인',
      signal: 'Southeast Asia Blockchain Week identifies ShardLab as its host. ShardLab publishes a Seoul office and official general contact, making it appropriate to ask about Korea event operations and locally produced apparel.',
      contactSource: 'https://shardlab.com/',
      sourceLabel: 'Official event organizer and ShardLab contact'
    },
    {
      matchDomains: ['nexa.org'],
      company: 'Nexa / Bitcoin Unlimited',
      canonicalDomain: 'bitcoinunlimited.info',
      email: 'info@bitcoinunlimited.info',
      title: 'Enterprise / Community Partnerships',
      score: 84,
      winScore: 74,
      winLabel: '승산 있음',
      reachability: '접근 가능',
      kbwStatus: 'KBW 후원 이력·2026 참석 확인 필요',
      signal: 'Nexa is built by Bitcoin Unlimited, which publishes a direct enterprise and general contact. Ask whether the team will return to Seoul before proposing team wear or event merchandise.',
      contactSource: 'https://www.bitcoinunlimited.info/contact',
      sourceLabel: 'Official Bitcoin Unlimited contact for the Nexa team'
    },
    {
      matchDomains: ['hub71.com'],
      company: 'Hub71',
      canonicalDomain: 'hub71.com',
      email: 'info@hub71.com',
      title: 'Ecosystem / Partnerships Routing',
      score: 82,
      winScore: 71,
      winLabel: '승산 있음',
      reachability: '접근 가능',
      kbwStatus: '서울·KBW 참석 여부 확인 필요',
      signal: 'Hub71 is a real startup ecosystem with an official general contact. Keep the first message narrowly focused on whether its Web3 team or portfolio delegation has Seoul plans around KBW.',
      contactSource: 'https://www.hub71.com/contact',
      sourceLabel: 'Official Hub71 contact page'
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
      quality_reasons: [...new Set([...(Array.isArray(lead.quality_reasons) ? lead.quality_reasons : []), '공식 공개 이메일 확인', '발송 가능한 담당 부서 연락처', row.kbwStatus].filter(Boolean))],
      tool_signals: [...new Set([...(Array.isArray(lead.tool_signals) ? lead.tool_signals : []), 'manual_hardcode', 'official_web'].filter(Boolean))],
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

  window.fetch = async function kbwEmailHardcodeOrganizerFetch(input, init = {}) {
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
        meta: { ...(data.meta || {}), kbw_email_hardcodes_organizers_used: appliedCount > 0, kbw_email_hardcodes_organizers_applied: appliedCount }
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }

    return previousFetch(input, init);
  };

  patchStoredLeads();
})();
