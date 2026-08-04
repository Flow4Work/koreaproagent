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

  const clean = (value = '', max = 500) => String(value || '').trim().slice(0, max);

  function rootDomain(value = '') {
    let host = clean(value, 500).toLowerCase();
    try {
      host = new URL(host.includes('://') ? host : `https://${host}`).hostname;
    } catch {
      host = host.split('/')[0].split(':')[0];
    }
    return host.replace(/^www\./, '').replace(/\.+$/, '');
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
