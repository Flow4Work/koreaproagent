(() => {
  const BATCH = '20260811-kbw-better10-v1';
  const SENT_KEYS = ['kpa.hunt.sentDomains.v1', 'kpa.sent.domains.v1'];
  const DELETED_KEY = 'kpa.hunt.deletedDomains.v1';

  const ROWS = [
    {
      company: 'RockawayX',
      domain: 'rockawayx.com',
      email: 'contact@rockawayx.com',
      title: 'Press / Growth Routing',
      score: 100,
      kbwStatus: 'KBW 2026 참석 확정',
      signal: 'Samantha Bohbot, Partner & Chief Growth Officer at RockawayX, is confirmed by KBW2026 to speak in Seoul this fall.',
      sourceUrl: 'https://www.linkedin.com/company/korea-blockchain-week',
      contactSource: 'https://www.rockawayx.com/insights/rockawayx-and-forward-industries-co-lead-strategic-investment-in-onre'
    },
    {
      company: 'Ostium',
      domain: 'ostium.io',
      email: 'team@ostium.io',
      title: 'Partnerships / Institutional',
      score: 100,
      kbwStatus: 'KBW 2026 참석 확정',
      signal: 'Kaledora Fontana Kiernan-Linn, Co-founder & CEO of Ostium, is confirmed by KBW2026 to speak in Seoul this fall.',
      sourceUrl: 'https://www.linkedin.com/posts/kaledora_looking-forward-to-speaking-at-kbw2026-in-activity-7478422787704111105-iLrK',
      contactSource: 'https://docs.ostium.com/traders/community/support'
    },
    {
      company: 'Wingbits',
      domain: 'wingbits.com',
      email: 'sales@wingbits.com',
      title: 'Sales / Business Partnerships',
      score: 98,
      kbwStatus: 'KBW 2026 공식 채널 노출',
      signal: 'KBW2026 is currently featuring co-founder Robin Wingardh in its official 2026 Seoul campaign, giving Wingbits a strong current event signal.',
      sourceUrl: 'https://www.linkedin.com/company/korea-blockchain-week',
      contactSource: 'https://wingbits.com/business-solutions/live-flight-data'
    },
    {
      company: 'Spacecoin',
      domain: 'spacecoin.org',
      email: 'partnerships@spacecoin.org',
      title: 'Partnerships',
      score: 99,
      kbwStatus: 'KBW 2025 타이틀 스폰서 · 재참가 우선',
      signal: 'Spacecoin was a KBW2025 Title Sponsor and continues active commercial expansion across Asia in 2026, making a Seoul return highly relevant.',
      sourceUrl: 'https://www.linkedin.com/posts/korea-blockchain-week_kbw2025-kbw-koreablockchainweek-activity-7363193018532708352-4a68',
      contactSource: 'https://www.linkedin.com/company/spacecoin-official'
    },
    {
      company: 'peaq',
      domain: 'peaq.network',
      email: 'info@peaq.network',
      title: 'General / Partnerships Routing',
      score: 97,
      kbwStatus: 'KBW 2025 메인 행사 연사 · 재참가 우선',
      signal: 'peaq co-founder Leonard Dorlöchter delivered a main-stage KBW2025 keynote in Seoul and the team maintains a strong Korea-facing DePIN and robotics narrative.',
      sourceUrl: 'https://www.linkedin.com/posts/peaqxyz_robots-onchain-leonard-dorl%C3%B6chters-keynote-activity-7376723423827288065-r2-H',
      contactSource: 'https://www.peaq.xyz/legal/imprint'
    },
    {
      company: 'Gaia',
      domain: 'gaianet.ai',
      email: 'hello@gaianet.ai',
      title: 'General / Partnerships Routing',
      score: 97,
      kbwStatus: 'KBW 2025 스폰서·CEO 연사 · 재참가 우선',
      signal: 'Gaia was represented at KBW2025 by co-founder and CEO Matt Wright and appeared in the official conference sponsor program.',
      sourceUrl: 'https://conference.playfablo.com/en/conference/1?sponsorId=29',
      contactSource: 'https://mobile.gaianet.ai/pages/support'
    },
    {
      company: 'DogeOS',
      domain: 'dogeos.com',
      email: 'quests@dogeos.com',
      title: 'Community Campaigns / Routing',
      score: 98,
      kbwStatus: 'KBW 2025 대규모 현장 운영 · 재참가 우선',
      signal: 'DogeOS brought its team to Seoul for KBW2025, sponsored the event, operated a booth and participated in the official afterparty and conference programming.',
      sourceUrl: 'https://blog.dogeos.com/doge-on-the-road-korea-blockchain-week-seoul/',
      contactSource: 'https://cctv.dogeos.com/en/terms'
    },
    {
      company: 'Sonic Labs',
      domain: 'soniclabs.com',
      email: 'bd@soniclabs.com',
      title: 'Business Development',
      score: 97,
      kbwStatus: 'KBW 2025 브론즈 스폰서 · 재참가 우선',
      signal: 'Sonic was an official Bronze Sponsor of KBW2025 and remains active in 2026 with a direct business-development channel for ecosystem partnerships.',
      sourceUrl: 'https://www.linkedin.com/posts/korea-blockchain-week_kbw-koreablockchainweek-web3-activity-7375332947568222208-mAXz',
      contactSource: 'https://blog.soniclabs.com/the-rules-of-an-open-network/'
    },
    {
      company: 'Succinct',
      domain: 'succinct.xyz',
      email: 'info@succinct.xyz',
      title: 'General / Events Routing',
      score: 96,
      kbwStatus: 'KBW 2025 CEO 연사 · 재참가 우선',
      signal: 'Succinct co-founder and CEO Uma Roy was a KBW2025 speaker in Seoul, giving the team a concrete prior on-site conference signal.',
      sourceUrl: 'https://conference.playfablo.com/en/conference/1/speaker?speakerId=117',
      contactSource: 'https://www.succinct.xyz/'
    },
    {
      company: 'Chiliz',
      domain: 'chiliz.com',
      email: 'chilizchainsupport@chiliz.com',
      title: 'Chain Support / Partnerships Routing',
      score: 96,
      kbwStatus: 'KBW 2025 골드 스폰서 · 한국 전략시장',
      signal: 'Chiliz was an official Gold Sponsor of KBW2025 and later described Korea as being at the heart of its strategic global growth after a full week of Seoul activity.',
      sourceUrl: 'https://www.linkedin.com/posts/activity-7374728978063884288-UUmt',
      contactSource: 'https://bridge.chiliz.com/wrap'
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
    const secondLevel = new Set(['ac', 'co', 'com', 'edu', 'go', 'gov', 'ne', 'net', 'or', 'org']);
    const depth = parts.at(-1)?.length === 2 && secondLevel.has(parts.at(-2)) ? 3 : 2;
    return parts.slice(-depth).join('.');
  }

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  }

  function sentDomains() {
    const out = [];
    for (const key of SENT_KEYS) {
      const value = readJson(key, null);
      if (Array.isArray(value?.domains)) out.push(...value.domains);
      else if (Array.isArray(value)) out.push(...value);
    }
    return out.map(normalizeDomain).filter(Boolean);
  }

  function makeLead(row) {
    const message = `Hi ${row.company} team,\n\nI’m reaching out because ${row.signal}\n\nAre you already planning team shirts, staff wear, or event merch for Seoul around Korea Blockchain Week? We produce T-shirts, hoodies, caps, and staff wear locally in Seoul and can deliver directly to your hotel, office, venue, or side-event location.\n\nIf apparel is still open, I can send 2–3 practical options with USD pricing and turnaround times for 20 / 50 / 100 units.\n\nWould it be useful if I send the options?\n\nBest,\nNYF`;
    const contact = {
      email: row.email,
      name: `${row.company} Team`,
      title: row.title,
      emailStatus: 'valid',
      email_status: 'verified',
      type: 'generic',
      sources: [row.contactSource],
      source_url: row.contactSource,
      provider: 'manual_web_research+official_public_contact',
      providers: ['manual_web_research', 'official_public_contact'],
      score: 99,
      qualified: true,
      verifiedOverride: true,
      verified_override: true,
      lookupDomain: row.domain,
      verifiedAt: '2026-08-11'
    };

    return {
      id: `kbw-better10:${row.domain}`,
      batch: BATCH,
      campaign: 'kbw',
      campaign_label: 'KBW 단체복',
      company: row.company,
      domain: row.domain,
      url: `https://${row.domain}/`,
      source_url: row.sourceUrl,
      source_title: row.kbwStatus,
      published_date: '2026-08-11',
      signal: row.signal,
      score: row.score,
      sales_priority: row.score + 20,
      win_score: Math.min(99, row.score),
      win_label: row.score >= 98 ? '승산 높음' : '우선 연락',
      opportunity_lane: row.kbwStatus.includes('2026') ? 'confirmed-or-current-kbw2026' : 'kbw-return-priority',
      reachability: row.score >= 98 ? '접근 최우선' : '접근 우선',
      kbw_status: row.kbwStatus,
      kbw_status_code: row.kbwStatus.includes('2026') ? 'confirmed' : 'return-priority',
      outreach_language: 'en',
      verified_company: true,
      verified_by: 'manual web research + official KBW/company public sources',
      quality_reasons: ['기존 KOREA AGENT 중복 제외', '2026-08-11 현재 회사 활동 확인', row.kbwStatus, '공개 업무 이메일 확인'],
      tool_signals: ['manual_web_research', 'official_kbw_or_company_source', 'verified_public_email'],
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
      contact_provider: 'manual_web_research+official_public_contact',
      contact_status: 'found'
    };
  }

  function inject() {
    if (typeof state === 'undefined' || typeof mergeLeads !== 'function') return;

    const deleted = readJson(DELETED_KEY, []);
    const blocked = new Set([
      ...(state.rejected instanceof Set ? [...state.rejected] : []),
      ...(Array.isArray(deleted) ? deleted : []),
      ...sentDomains(),
      ...(Array.isArray(state.leads) ? state.leads.map((lead) => lead?.domain || lead?.url || lead?.contact?.email) : [])
    ].map(normalizeDomain).filter(Boolean));

    const candidates = ROWS
      .map(makeLead)
      .filter((lead) => !blocked.has(normalizeDomain(lead.domain)));

    const added = mergeLeads(candidates);
    if (added.length && typeof render === 'function') render();

    window.KBWBetter10 = {
      batch: BATCH,
      researched: ROWS.length,
      eligible: candidates.length,
      added: added.length,
      domains: ROWS.map((row) => row.domain)
    };
  }

  inject();
})();
