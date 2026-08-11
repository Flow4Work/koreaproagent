(() => {
  const originalFetch = window.fetch.bind(window);
  const EXTRAS = [
    {
      company: 'BDACS',
      domain: 'bdacs.co.kr',
      email: 'sales@bdacs.co.kr',
      contactName: 'BDACS 영업팀',
      title: '영업 / 파트너십',
      language: 'ko',
      score: 90,
      reachability: '접근 우선',
      status: 'likely',
      sourceUrl: 'https://newsroom.bdacs.co.kr/presscenter/pr/250923-prime-custody-solution/',
      contactSource: 'https://bdacs.co.kr/ko'
    },
    {
      company: 'Monad Foundation',
      domain: 'monad.xyz',
      email: 'hello@monad.xyz',
      contactName: 'Monad Team',
      title: 'General / Community',
      language: 'en',
      score: 78,
      reachability: '대형·후순위',
      status: 'confirmed',
      sourceUrl: 'https://koreablockchainweek.com/speakers',
      contactSource: 'https://forum.monad.xyz/tos'
    }
  ];

  const LATEST_BATCH = '20260811-kbw-latest-signals-v1';
  const LATEST_ROWS = [
    {
      company: 'fractl',
      domain: 'fractl.ca',
      email: 'sales@fractl.ca',
      contactName: 'fractl Team',
      contactType: 'generic',
      title: 'Sales / Sponsorships / Co-hosts',
      score: 100,
      reachability: '접근 최우선',
      status: 'KBW 2026 서울 사이드이벤트 2건 직접 주최',
      signal: 'fractl is hosting both the KBW2026 Founders & Investors Brunch and the VCs & LPs Cocktail Hour in Seoul on September 29, and its Luma page explicitly invites sponsorship, co-host and private-event inquiries.',
      sourceUrl: 'https://luma.com/j7lfixyv',
      contactSource: 'https://luma.com/j7lfixyv'
    },
    {
      company: 'Chainalysis',
      domain: 'chainalysis.com',
      email: 'partnerships@chainalysis.com',
      contactName: 'Chainalysis Partnerships Team',
      contactType: 'generic',
      title: 'Partnerships',
      score: 100,
      reachability: '접근 최우선',
      status: 'SCAN 2026 공식 KBW 사이드이벤트 CTF 파트너',
      signal: 'Chainalysis is the CTF Partner for SCAN 2026, an official KBW2026 event with the Seoul final on September 28 and the award conference at Walkerhill on October 1.',
      sourceUrl: 'https://scan.sx/',
      contactSource: 'https://partner.chainalysis.com/'
    },
    {
      company: 'fomo',
      domain: 'fomo.family',
      email: 'support@fomo.family',
      contactName: 'fomo Team',
      contactType: 'generic',
      title: 'Support / Team Routing',
      score: 98,
      reachability: '접근 우선',
      status: 'KBW 2026 공식 연사 확정',
      signal: 'fomo co-founder Se Yong Park is confirmed on the current official KBW2026 speaker lineup in Seoul.',
      sourceUrl: 'https://koreablockchainweek.com/speakers',
      contactSource: 'https://play.google.com/store/apps/details?id=family.fomo.app'
    },
    {
      company: 'Offchain Labs',
      domain: 'offchainlabs.com',
      email: 'dbolger@offchainlabs.com',
      contactName: 'David Bolger',
      contactType: 'personal',
      title: 'Head of Gaming & Consumer Partnerships',
      score: 99,
      reachability: '접근 최우선',
      status: 'KBW 2026 공식 연사 확정',
      signal: 'Offchain Labs co-founder and Chief Scientist Ed Felten is confirmed on the official KBW2026 speaker lineup; David Bolger publicly lists a direct Offchain Labs email and currently leads Gaming & Consumer Partnerships.',
      sourceUrl: 'https://koreablockchainweek.com/speakers',
      contactSource: 'https://forum.arbitrum.foundation/t/2026-agv-council-elections-application-thread/30204/5'
    }
  ];

  const DELETED_KEY = 'kpa.hunt.deletedDomains.v1';
  const SENT_CACHE_KEY = 'kpa.hunt.sentDomains.v1';
  const SENT_ENDPOINT = '/api/gmail?action=sent-domains';
  const BLOCKED = new Set(['sooho.io', 'bitmex.com']);
  const clean = (value = '', max = 500) => String(value || '').trim().slice(0, max);

  function rootDomain(value = '') {
    let host = clean(value, 500).toLowerCase();
    if (host.includes('@') && !host.includes('://')) host = host.split('@').pop() || '';
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

  function isKbwHunt(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = clean(init.method || (typeof input !== 'string' ? input?.method : '') || 'GET', 12).toUpperCase();
    try {
      const parsed = new URL(url, location.origin);
      return method === 'POST' && parsed.origin === location.origin && parsed.pathname === '/api/hunt';
    } catch {
      return false;
    }
  }

  function parseBody(init = {}) {
    if (typeof init.body !== 'string') return {};
    try { return JSON.parse(init.body); } catch { return {}; }
  }

  function makeContact(row) {
    return {
      name: row.contactName,
      title: row.title,
      email: row.email,
      emailStatus: 'valid',
      type: 'generic',
      sources: [row.contactSource],
      providers: ['manual_db', 'official_web'],
      provider: 'manual_db+official_web',
      score: 98,
      scoreBreakdown: { validation: 30, role: 28, identity: 20, domain: 10, evidence: 10, penalty: 0, total: 98 },
      qualified: true,
      verifiedOverride: true,
      verified_override: true,
      trustedCrossDomain: false,
      lookupDomain: row.domain,
      priority: row.score >= 90 ? 10 : 70,
      verifiedAt: '2026-08-05',
      sourceLabel: 'Official public contact verified for KBW outreach'
    };
  }

  function makeLead(row) {
    const confirmed = row.status === 'confirmed';
    const signal = confirmed
      ? 'KBW 2026 공식 연사 소속사로 참석 확인. 대형 프로젝트이므로 후순위에서 서울 팀웨어 준비 여부를 확인.'
      : '이전 KBW 서울 행사 참여 이력이 확인된 국내 기업. 2026 재참석 일정과 단체복·스태프 의류 수요를 한글로 확인.';
    const contact = makeContact(row);
    const messageKo = `안녕하세요.\n\n${signal} 올해 KBW 기간에 서울 행사나 팀 일정이 예정되어 있을까요?\n\n필요하시면 티셔츠·후디·스태프 의류를 서울에서 제작해 사무실이나 행사장으로 납품할 수 있습니다. 아직 준비 전이라면 가격과 납기를 포함한 옵션 2~3가지만 보내드리겠습니다.`;
    const messageEn = `Hi,\n\nI saw that ${row.company} is represented in the official KBW 2026 speaker lineup. Have you already sorted team shirts or staff merch for Seoul?\n\nWe produce T-shirts, hoodies and staff wear locally in Seoul and can deliver to your hotel, office or venue. If merch is still open, I can send 2–3 options with pricing and turnaround times.`;
    return {
      id: `kbw-curated:${row.domain}`,
      campaign: 'kbw',
      campaign_label: 'KBW 단체복',
      company: row.company,
      domain: row.domain,
      url: `https://${row.domain}/`,
      source_url: row.sourceUrl,
      source_title: confirmed ? 'Official KBW 2026 speaker company' : 'Prior KBW participation',
      published_date: '2026-08-05',
      signal,
      score: row.score,
      sales_priority: row.score + (confirmed ? 15 : 20),
      win_score: confirmed ? 65 : 74,
      win_label: '승산 있음',
      opportunity_lane: confirmed ? 'confirmed-kbw-large' : 'likely-kbw-korea',
      reachability: row.reachability,
      kbw_status: confirmed ? '2026 참석 확인' : '재참석 유력',
      kbw_status_code: confirmed ? 'confirmed' : 'likely',
      outreach_language: row.language,
      verified_company: true,
      verified_by: 'manual-research+official-web',
      quality_reasons: ['실제 회사·공식 도메인 확인', '공식 공개 이메일 확인', confirmed ? 'KBW 2026 공식 연사 소속사' : '이전 KBW 참여 이력'],
      tool_signals: ['manual_research', 'official_web'],
      recommended_role: row.title,
      role_targets: ['Events Lead', 'Partnerships Lead', 'Community Lead', 'Head of Marketing'],
      offer: 'KBW 기간 티셔츠·후디·스태프 의류를 서울 현지에서 제작·납품',
      outreach_goal: 'reply',
      outreach_stage: 'first_touch',
      reply_question: row.language === 'ko' ? '올해 KBW 기간에 서울 행사나 팀 일정이 예정되어 있을까요?' : 'Have you already sorted team shirts or staff merch for Seoul?',
      subject: row.language === 'ko' ? `${row.company} KBW 행사 준비 관련` : `Quick question about ${row.company}'s KBW plans`,
      message_ko: messageKo,
      message_en: messageEn,
      contact,
      contacts: [contact],
      contact_provider: 'manual_db+official_web',
      contact_status: 'found'
    };
  }

  function readStoredDomains(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      const rows = Array.isArray(value) ? value : Array.isArray(value?.domains) ? value.domains : [];
      return new Set(rows.map(rootDomain).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  async function liveSentDomains() {
    const cached = readStoredDomains(SENT_CACHE_KEY);
    try {
      const response = await originalFetch(`${SENT_ENDPOINT}&t=${Date.now()}`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data.domains)) return cached;
      const domains = new Set(data.domains.map(rootDomain).filter(Boolean));
      localStorage.setItem(SENT_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), domains: [...domains] }));
      return domains;
    } catch {
      return cached;
    }
  }

  function makeLatestContact(row, index) {
    return {
      email: row.email.toLowerCase(),
      name: row.contactName,
      title: row.title,
      emailStatus: 'valid',
      email_status: 'verified',
      type: row.contactType || 'generic',
      sources: [row.contactSource],
      source_url: row.contactSource,
      provider: 'latest_kbw_signal+public_web',
      providers: ['latest_kbw_signal', 'public_web'],
      score: 99,
      qualified: true,
      verifiedOverride: true,
      verified_override: true,
      trustedCrossDomain: false,
      lookupDomain: rootDomain(row.domain),
      priority: index + 1,
      verifiedAt: '2026-08-11'
    };
  }

  function makeLatestLead(row, index) {
    const contact = makeLatestContact(row, index);
    const message = `Hi ${row.company} team,\n\nI’m reaching out because ${row.signal}\n\nHave you already sorted team shirts, staff wear, or event merch for Seoul around KBW? We produce T-shirts, hoodies, caps, and staff wear locally in Seoul and can deliver directly to your hotel, office, venue, or side-event location.\n\nIf apparel is still open, I can send 2–3 practical options with USD pricing and turnaround times for 20 / 50 / 100 units.\n\nWould it be useful if I send the options?\n\nBest,\nNYF`;
    return {
      id: `kbw-latest-signals:${rootDomain(row.domain)}`,
      batch: LATEST_BATCH,
      campaign: 'kbw',
      campaign_label: 'KBW 단체복',
      company: row.company,
      domain: rootDomain(row.domain),
      url: `https://${rootDomain(row.domain)}/`,
      source_url: row.sourceUrl,
      source_title: row.status,
      published_date: '2026-08-11',
      signal: row.signal,
      score: row.score,
      sales_priority: row.score + 40,
      win_score: Math.min(100, row.score),
      win_label: row.score >= 99 ? '승산 높음' : '우선 연락',
      opportunity_lane: 'kbw2026-fresh-signal',
      reachability: row.reachability,
      kbw_status: row.status,
      kbw_status_code: 'confirmed',
      outreach_language: 'en',
      verified_company: true,
      verified_by: '2026-08-11 latest KBW/Luma research + public contact verification',
      quality_reasons: ['2026-08-11 최신 KBW/Luma 신호', row.status, '공개 업무 이메일 확인', '기존 하드코딩 도메인 중복 제외'],
      tool_signals: ['latest_kbw_2026', 'luma_or_official_kbw', 'verified_public_email'],
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
      contact_provider: 'latest_kbw_signal+public_web',
      contact_status: 'found',
      latest_kbw_signal: true
    };
  }

  let latestRunning = false;
  let latestDone = false;
  const latestStartedAt = Date.now();

  async function injectLatestSignals() {
    if (latestDone || latestRunning) return latestDone;
    if (typeof state === 'undefined' || !Array.isArray(state.leads)) return false;
    latestRunning = true;
    try {
      const deleted = readStoredDomains(DELETED_KEY);
      const sent = await liveSentDomains();
      const rejected = new Set(
        state.rejected instanceof Set
          ? [...state.rejected].map(rootDomain).filter(Boolean)
          : []
      );
      const existingByDomain = new Map();
      for (const lead of state.leads) {
        const domain = rootDomain(lead?.domain || lead?.url || lead?.contact?.email || '');
        if (domain && !existingByDomain.has(domain)) existingByDomain.set(domain, lead);
      }

      const exclusions = { sent: [], deleted: [], rejected: [], existing: [] };
      const eligible = [];
      for (const row of LATEST_ROWS) {
        const domain = rootDomain(row.domain);
        const existing = existingByDomain.get(domain);
        if (BLOCKED.has(domain)) { exclusions.deleted.push(domain); continue; }
        if (sent.has(domain)) { exclusions.sent.push(domain); continue; }
        if (deleted.has(domain)) { exclusions.deleted.push(domain); continue; }
        if (rejected.has(domain)) { exclusions.rejected.push(domain); continue; }
        if (existing && existing.batch !== LATEST_BATCH && !existing.latest_kbw_signal) {
          exclusions.existing.push(domain);
          continue;
        }
        eligible.push(row);
      }

      const freshLeads = eligible.map((row, index) => {
        const lead = makeLatestLead(row, index);
        const existing = existingByDomain.get(lead.domain);
        return existing && (existing.batch === LATEST_BATCH || existing.latest_kbw_signal)
          ? { ...existing, ...lead, id: existing.id || lead.id, contact: lead.contact, contacts: lead.contacts }
          : lead;
      });
      const freshDomains = new Set(freshLeads.map(lead => lead.domain));
      const rest = state.leads.filter(lead => !freshDomains.has(rootDomain(lead?.domain || lead?.url || lead?.contact?.email || '')));
      state.leads = [...freshLeads, ...rest].slice(0, 250);

      if (state.selected instanceof Set) {
        const liveIds = new Set(state.leads.map(lead => lead?.id).filter(Boolean));
        for (const id of [...state.selected]) if (!liveIds.has(id)) state.selected.delete(id);
      }

      state.statusText = `KBW 최신 신규 후보 ${freshLeads.length}/${LATEST_ROWS.length} 반영 · 발송/추가/삭제 제외`;
      if (typeof saveState === 'function') saveState();
      if (typeof render === 'function') render();

      window.KBWLatestSignals20260811 = {
        batch: LATEST_BATCH,
        researched: LATEST_ROWS.length,
        added: freshLeads.length,
        domains: freshLeads.map(lead => lead.domain),
        excluded: exclusions
      };
      console.info(`[KBW latest] added ${freshLeads.length}/${LATEST_ROWS.length}`, exclusions);
      latestDone = true;
      return true;
    } finally {
      latestRunning = false;
    }
  }

  const latestTimer = setInterval(() => {
    injectLatestSignals().then(done => {
      if (done || Date.now() - latestStartedAt > 15000) clearInterval(latestTimer);
    }).catch(() => {
      if (Date.now() - latestStartedAt > 15000) clearInterval(latestTimer);
    });
  }, 150);
  injectLatestSignals().catch(() => {});

  window.fetch = async function kbwCuratedExtraFetch(input, init = {}) {
    if (!isKbwHunt(input, init)) return originalFetch(input, init);
    const body = parseBody(init);
    if (body.campaign && body.campaign !== 'kbw') return originalFetch(input, init);

    const response = await originalFetch(input, init);
    const data = await response.clone().json().catch(() => ({}));
    const excluded = new Set((Array.isArray(body.excludeDomains) ? body.excludeDomains : []).map(rootDomain));
    const extras = EXTRAS.filter(row => !excluded.has(rootDomain(row.domain))).map(makeLead);
    if (!extras.length) return response;

    const merged = [];
    const seen = new Set();
    for (const lead of [...extras, ...(Array.isArray(data.leads) ? data.leads : [])]) {
      const domain = rootDomain(lead?.domain || lead?.url || '');
      if (!domain || seen.has(domain)) continue;
      seen.add(domain);
      merged.push(lead);
      if (merged.length >= 12) break;
    }

    return new Response(JSON.stringify({
      ...data,
      campaign: 'kbw',
      campaign_label: data.campaign_label || 'KBW 단체복',
      leads: merged,
      meta: {
        ...(data.meta || {}),
        curated_kbw_extra_used: true,
        curated_kbw_extra_returned: extras.length
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  };
})();
