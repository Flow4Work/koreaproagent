(() => {
  const originalFetch = window.fetch.bind(window);
  const CURATED = [
  {
    "company": "Hack VC",
    "domain": "hack.vc",
    "email": "contact@hack.vc",
    "contact": "Hack VC Team",
    "title": "Events / Partnerships",
    "status": "side_event",
    "score": 98,
    "source": "https://www.hack.vc/",
    "contact_source": "https://www.hack.vc/terms"
  },
  {
    "company": "Wachsman",
    "domain": "wachsman.com",
    "email": "info@wachsman.com",
    "contact": "Wachsman Team",
    "title": "Events / Strategic Communications",
    "status": "confirmed",
    "score": 96,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://wachsman.com/contact-wachsman/"
  },
  {
    "company": "SALT",
    "domain": "salt.org",
    "email": "info@salt.org",
    "contact": "SALT Team",
    "title": "Events / Partnerships",
    "status": "confirmed",
    "score": 96,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://www.salt.org/contact"
  },
  {
    "company": "DeFi Education Fund",
    "domain": "defieducationfund.org",
    "email": "support@defieducationfund.org",
    "contact": "DeFi Education Fund Team",
    "title": "General / Partnerships",
    "status": "confirmed",
    "score": 89,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://www.defieducationfund.org/privacy-policy"
  },
  {
    "company": "Solana Policy Institute",
    "domain": "solanapolicyinstitute.org",
    "email": "info@solanapolicyinstitute.org",
    "contact": "Solana Policy Institute Team",
    "title": "Events / Partnerships",
    "status": "confirmed",
    "score": 94,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://www.solanapolicyinstitute.org/privacy"
  },
  {
    "company": "Privy",
    "domain": "privy.io",
    "email": "sales@privy.io",
    "contact": "Privy Sales Team",
    "title": "Sales / Partnerships",
    "status": "confirmed",
    "score": 95,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://www.privy.io/pricing"
  },
  {
    "company": "DoubleZero",
    "domain": "doublezero.xyz",
    "email": "austin@doublezero.xyz",
    "contact": "Austin Federa",
    "title": "Co-Founder",
    "status": "confirmed",
    "score": 96,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://doublezero.xyz/whitepaper.pdf",
    "ctype": "personal"
  },
  {
    "company": "Kaiko",
    "domain": "kaiko.com",
    "email": "sales@kaiko.com",
    "contact": "Kaiko Sales Team",
    "title": "Sales / Partnerships",
    "status": "confirmed",
    "score": 95,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://www.kaiko.com/news/kaiko-joins-icma-to-advance-transparency-in-digital-asset-markets"
  },
  {
    "company": "GSR",
    "domain": "gsr.io",
    "email": "gsr@gsr.io",
    "contact": "GSR Team",
    "title": "General / Partnerships",
    "status": "confirmed",
    "score": 92,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://www.gsr.io/gsr-website-terms-and-conditions/"
  },
  {
    "company": "FalconX",
    "domain": "falconx.io",
    "email": "info@falconx.io",
    "contact": "FalconX Team",
    "title": "General / Partnerships",
    "status": "confirmed",
    "score": 91,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://www.falconx.io/terms-of-use"
  },
  {
    "company": "SharpLink",
    "domain": "sharplink.com",
    "email": "info@sharplink.com",
    "contact": "SharpLink Team",
    "title": "General / Partnerships",
    "status": "confirmed",
    "score": 91,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://www.sharplink.com/contact"
  },
  {
    "company": "Maelstrom",
    "domain": "maelstrom.fund",
    "email": "investments@maelstrom.fund",
    "contact": "Maelstrom Team",
    "title": "Investments / Partnerships",
    "status": "confirmed",
    "score": 91,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://maelstrom.fund/vision/"
  },
  {
    "company": "BitMine",
    "domain": "bitminetech.io",
    "email": "info@bitminetech.io",
    "contact": "BitMine Team",
    "title": "Partnerships / Business Inquiries",
    "status": "confirmed",
    "score": 94,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://www.bitminetech.io/contact"
  },
  {
    "company": "Kalshi",
    "domain": "kalshi.com",
    "email": "institutional@kalshi.com",
    "contact": "Kalshi Institutional Team",
    "title": "Institutional / Partnerships",
    "status": "confirmed",
    "score": 93,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://institutional.kalshi.com/"
  },
  {
    "company": "Lighter",
    "domain": "lighter.xyz",
    "email": "support@lighter.xyz",
    "contact": "Lighter Team",
    "title": "General / Events",
    "status": "confirmed",
    "score": 82,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://app.lighter.xyz/mobile-privacy-policy.html"
  },
  {
    "company": "YZi Labs",
    "domain": "yzilabs.com",
    "email": "media@yzilabs.com",
    "contact": "YZi Labs Media Team",
    "title": "Media / Events",
    "status": "confirmed",
    "score": 80,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://www.yzilabs.com/blog"
  },
  {
    "company": "Bitwise Asset Management",
    "domain": "bitwiseinvestments.com",
    "email": "team@bitwiseinvestments.com",
    "contact": "Bitwise Team",
    "title": "General / Partnerships",
    "status": "confirmed",
    "score": 90,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://bitwiseinvestments.com/privacy-policy"
  },
  {
    "company": "Canton Network",
    "domain": "canton.network",
    "email": "media@canton.network",
    "contact": "Canton Network Media Team",
    "title": "Media / Events",
    "status": "confirmed",
    "score": 80,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://www.canton.network/newsroom"
  },
  {
    "company": "Figure",
    "domain": "figure.com",
    "email": "digitalassets@figure.com",
    "contact": "Figure Digital Assets Team",
    "title": "Digital Assets / Partnerships",
    "status": "confirmed",
    "score": 93,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://investors.figure.com/news-releases/"
  },
  {
    "company": "Bullish",
    "domain": "bullish.com",
    "email": "sales@bullish.com",
    "contact": "Bullish Sales Team",
    "title": "Sales / Partnerships",
    "status": "confirmed",
    "score": 93,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://investors.bullish.com/news/"
  },
  {
    "company": "Optimism",
    "domain": "optimism.io",
    "email": "partnerships@optimism.io",
    "contact": "Optimism Partnerships Team",
    "title": "Partnerships",
    "status": "confirmed",
    "score": 84,
    "source": "https://koreablockchainweek.com/speakers",
    "contact_source": "https://gov.optimism.io/t/partner-fund-overview/5268",
    "reach": "대형·후순위"
  },
  {
    "company": "Sahara AI",
    "domain": "saharalabs.ai",
    "email": "team@saharalabs.ai",
    "contact": "Sahara AI Team",
    "title": "Community / Partnerships",
    "status": "likely",
    "score": 87,
    "source": "https://saharalabs.ai/community/about-us",
    "contact_source": "https://saharalabs.ai/community/about-us"
  },
  {
    "company": "Chris & Partners",
    "domain": "chrisandpartners.co",
    "email": "hello@chrisandpartners.co",
    "contact": "Chris & Partners Team",
    "title": "Events / Production",
    "status": "likely",
    "score": 92,
    "source": "https://chrisandpartners.co/contact/",
    "contact_source": "https://chrisandpartners.co/contact/"
  },
  {
    "company": "071Labs",
    "domain": "071labs.io",
    "email": "contact@071labs.io",
    "contact": "071Labs Team",
    "title": "Events / Partnerships",
    "status": "likely",
    "score": 89,
    "source": "https://www.071labs.io/",
    "contact_source": "https://www.071labs.io/"
  },
  {
    "company": "Theoriq",
    "domain": "theoriq.ai",
    "email": "business@theoriq.ai",
    "contact": "Theoriq Business Team",
    "title": "Business / Partnerships",
    "status": "likely",
    "score": 89,
    "source": "https://www.theoriq.ai/blog/a-new-chapter-at-theoriq",
    "contact_source": "https://www.theoriq.ai/blog/a-new-chapter-at-theoriq"
  },
  {
    "company": "GOAT Network",
    "domain": "goat.network",
    "email": "hi@goat.network",
    "contact": "GOAT Network Team",
    "title": "Community / Partnerships",
    "status": "likely",
    "score": 88,
    "source": "https://www.goat.network/",
    "contact_source": "https://www.goat.network/"
  },
  {
    "company": "Blockdaemon",
    "domain": "blockdaemon.com",
    "email": "hello@blockdaemon.com",
    "contact": "Blockdaemon Team",
    "title": "General / Partnerships",
    "status": "likely",
    "score": 85,
    "source": "https://www.blockdaemon.com/",
    "contact_source": "https://www.blockdaemon.com/blog/blockdaemon-bulletin-august-2023"
  },
  {
    "company": "Aztec",
    "domain": "aztec.foundation",
    "original_domain": "aztec.network",
    "email": "hello@aztec.foundation",
    "contact": "Aztec Foundation Team",
    "title": "Community / Partnerships",
    "status": "likely",
    "score": 86,
    "source": "https://aztec.network/",
    "contact_source": "https://aztec.network/terms-of-service"
  },
  {
    "company": "Spartan Group",
    "domain": "spartangroup.io",
    "email": "info@spartangroup.io",
    "contact": "Spartan Group Team",
    "title": "General / Partnerships",
    "status": "likely",
    "score": 84,
    "source": "https://www.spartangroup.io/",
    "contact_source": "https://www.spartangroup.io/privacy-policy"
  },
  {
    "company": "Four Pillars",
    "domain": "4pillars.io",
    "email": "support@4pillars.io",
    "contact": "Four Pillars Team",
    "title": "Community / Events",
    "status": "likely",
    "score": 81,
    "source": "https://4pillars.io/en",
    "contact_source": "https://4pillars.io/en"
  },
  {
    "company": "Animoca Brands",
    "domain": "animocabrands.com",
    "email": "research@animocabrands.com",
    "contact": "Animoca Brands Research Team",
    "title": "Research / Partnerships",
    "status": "likely",
    "score": 82,
    "source": "https://research.animocabrands.com/contact",
    "contact_source": "https://research.animocabrands.com/contact",
    "reach": "대형·후순위"
  },
  {
    "company": "Mantle",
    "domain": "mantle.xyz",
    "email": "community@mantle.xyz",
    "contact": "Mantle Community Team",
    "title": "Community / Events",
    "status": "likely",
    "score": 86,
    "source": "https://www.mantle.xyz/",
    "contact_source": "https://forum.mantle.xyz/tos"
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

  function requestBody(init = {}) {
    if (typeof init.body !== 'string') return {};
    try { return JSON.parse(init.body); } catch { return {}; }
  }

  function contactFor(row) {
    const lookup = rootDomain(row.original_domain || row.domain);
    const crossDomain = Boolean(row.original_domain && rootDomain(row.email.split('@')[1] || '') !== lookup);
    return {
      name: row.contact,
      title: row.title,
      email: row.email.toLowerCase(),
      emailStatus: 'valid',
      type: row.ctype || 'generic',
      sources: [row.contact_source],
      providers: ['manual_db', 'official_web'],
      provider: 'manual_db+official_web',
      score: 98,
      scoreBreakdown: { validation: 30, role: 28, identity: 20, domain: 10, evidence: 10, penalty: 0, total: 98 },
      qualified: true,
      verifiedOverride: true,
      verified_override: true,
      trustedCrossDomain: crossDomain,
      lookupDomain: lookup,
      priority: row.score >= 90 ? 10 : row.score >= 85 ? 20 : 60,
      verifiedAt: '2026-08-05',
      sourceLabel: 'Official public contact verified for KBW outreach'
    };
  }

  function leadFor(row) {
    const confirmed = row.status === 'confirmed';
    const sideEvent = row.status === 'side_event';
    const signal = sideEvent
      ? 'KBW 2026 사이드 이벤트 주최 신호 확인. 호스트·스태프 의류와 현장 굿즈 수요를 우선 확인.'
      : confirmed
        ? 'KBW 2026 공식 연사 소속사로 참석 확인. 서울 현지 팀웨어·스태프 의류 준비 여부를 바로 확인할 가치가 높음.'
        : '이전 KBW 서울 행사·생태계 활동 이력이 있는 재참석 유력 후보. 2026 서울 일정 확인부터 접근.';
    const sourceTitle = sideEvent
      ? 'KBW 2026 side-event host signal'
      : confirmed
        ? 'Official KBW 2026 speaker company'
        : 'Prior KBW / Seoul ecosystem activity';
    const question = confirmed || sideEvent
      ? 'Have you already sorted team shirts or staff merch for Seoul?'
      : 'Is your team planning to be in Seoul during KBW 2026?';
    const intro = sideEvent
      ? `I saw that ${row.company} is connected to a KBW 2026 side event in Seoul.`
      : confirmed
        ? `I saw that ${row.company} is represented in the official KBW 2026 speaker lineup.`
        : `I saw ${row.company}'s prior KBW and Seoul ecosystem activity.`;
    const messageEn = `Hi,\n\n${intro} ${question}\n\nWe produce T-shirts, hoodies and staff wear locally in Seoul and can deliver to your hotel, office or venue, including on short timelines. If merch is still open, I can send 2–3 options with pricing and turnaround times.`;
    const messageKo = `안녕하세요.\n\n${signal} 서울 일정용 팀웨어나 스태프 의류 준비는 이미 끝나셨을까요?\n\n서울 현지에서 티셔츠·후디·스태프 의류를 제작해 호텔·사무실·행사장으로 납품할 수 있습니다. 아직 확정 전이라면 가격과 납기를 포함한 옵션 2~3가지만 보내드리겠습니다.`;
    const contact = contactFor(row);
    const domain = rootDomain(row.domain);
    return {
      id: `kbw-curated:${domain}`,
      campaign: 'kbw',
      campaign_label: 'KBW 단체복',
      company: row.company,
      domain,
      original_domain: row.original_domain ? rootDomain(row.original_domain) : undefined,
      url: row.original_domain ? `https://${rootDomain(row.original_domain)}/` : `https://${domain}/`,
      source_url: row.source,
      source_title: sourceTitle,
      published_date: '2026-08-05',
      signal,
      score: row.score,
      sales_priority: row.score + (sideEvent ? 28 : confirmed ? 22 : 10),
      win_score: sideEvent ? 90 : confirmed ? 82 : 62,
      win_label: sideEvent || confirmed ? '승산 높음' : '승산 있음',
      opportunity_lane: sideEvent ? 'confirmed-side-event' : confirmed ? 'confirmed-kbw' : 'likely-kbw',
      reachability: row.reach || (row.score >= 90 ? '접근 우선' : '일반'),
      kbw_status: sideEvent ? '2026 사이드 이벤트' : confirmed ? '2026 참석 확인' : '재참석 유력',
      kbw_status_code: sideEvent || confirmed ? 'confirmed' : 'likely',
      outreach_language: 'en',
      verified_company: true,
      verified_by: 'manual-research+official-web',
      quality_reasons: [
        '실제 회사·공식 도메인 확인',
        '공식 공개 이메일 확인',
        sideEvent ? '2026 사이드 이벤트 주최 신호' : confirmed ? 'KBW 2026 공식 연사 소속사' : '이전 KBW·서울 활동 이력',
        sideEvent || confirmed ? '승산 높음' : '승산 있음'
      ],
      tool_signals: ['manual_research', 'official_web'],
      recommended_role: row.title,
      role_targets: ['Events Lead', 'Partnerships Lead', 'Community Lead', 'Head of Marketing', 'Founder', 'CEO'],
      offer: 'KBW 기간 티셔츠·후디·스태프 의류를 서울 현지에서 제작해 호텔·사무실·행사장으로 납품',
      outreach_goal: 'reply',
      outreach_stage: 'first_touch',
      reply_question: question,
      subject: `Quick question about ${row.company}'s KBW plans`,
      message_ko: messageKo,
      message_en: messageEn,
      contact,
      contacts: [contact],
      contact_provider: 'manual_db+official_web',
      contact_status: 'found'
    };
  }

  function curatedFor(body = {}) {
    if (body.campaign && body.campaign !== 'kbw') return [];
    const excluded = new Set((Array.isArray(body.excludeDomains) ? body.excludeDomains : []).map(rootDomain).filter(Boolean));
    const available = CURATED.filter(row => {
      const domain = rootDomain(row.domain);
      const original = rootDomain(row.original_domain || '');
      return !excluded.has(domain) && (!original || !excluded.has(original));
    });
    if (!available.length) return [];
    const cycle = Math.max(1, Number.parseInt(body.cycle, 10) || 1);
    const start = ((cycle - 1) * 8) % available.length;
    const rotated = available.slice(start).concat(available.slice(0, start));
    return rotated.slice(0, 10).map(leadFor);
  }

  function mergeLeads(curated = [], discovered = []) {
    const merged = [];
    const seen = new Set();
    for (const lead of [...curated, ...(Array.isArray(discovered) ? discovered : [])]) {
      const domain = rootDomain(lead?.domain || lead?.url || '');
      if (!domain || seen.has(domain)) continue;
      seen.add(domain);
      merged.push(lead);
      if (merged.length >= 12) break;
    }
    return merged;
  }

  window.fetch = async function kbwCuratedFetch(input, init = {}) {
    if (!isKbwHunt(input, init)) return originalFetch(input, init);
    const body = requestBody(init);
    if (body.campaign && body.campaign !== 'kbw') return originalFetch(input, init);

    const curated = curatedFor(body);
    try {
      const response = await originalFetch(input, init);
      const data = await response.clone().json().catch(() => ({}));
      if (!curated.length) return response;
      const payload = {
        ...data,
        campaign: 'kbw',
        campaign_label: data.campaign_label || 'KBW 단체복',
        leads: mergeLeads(curated, data.leads),
        meta: {
          ...(data.meta || {}),
          curated_kbw_used: true,
          curated_kbw_returned: curated.length,
          curated_kbw_total: CURATED.length,
          curated_kbw_source: 'official attendance and verified public contacts'
        }
      };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    } catch (error) {
      if (!curated.length) throw error;
      return new Response(JSON.stringify({
        campaign: 'kbw',
        campaign_label: 'KBW 단체복',
        leads: curated,
        meta: {
          curated_kbw_used: true,
          curated_kbw_fallback: true,
          curated_kbw_returned: curated.length,
          curated_kbw_total: CURATED.length
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }
  };
})();
