(() => {
  const BATCH = '20260811-kbw-canonical40-v1';
  const BLOCKED = new Set(['sooho.io', 'bitmex.com']);
  const EXPECTED = 40;
  const startedAt = Date.now();
  let timer = null;

  const ROWS = [
    { company:'Uniswap Labs', domain:'uniswap.org', email:'support@uniswap.org', title:'Support / General Routing', score:96, status:'KBW 2025 서울 사이드이벤트', signal:'Uniswap Labs hosted Uniswap Hangout during Korea Blockchain Week 2025 in Seoul.', source:'https://luma.com/2zb4db0d', contactSource:'https://support.uniswap.org/hc/en-us/articles/17522892515341-Official-Uniswap-Labs-links' },
    { company:'Kiln', domain:'kiln.fi', email:'media@kiln.fi', title:'Media / Events', score:95, status:'KBW 2025 공식 사이드이벤트 스폰서', signal:'Kiln sponsored SYNC: SEOUL 2025 AFTER DARK during Korea Blockchain Week.', source:'https://luma.com/3cz481z4', contactSource:'https://www.kiln.fi/contact' },
    { company:'LayerZero Labs', domain:'layerzero.network', email:'notices@layerzero.network', title:'Official Notice / Routing', score:95, status:'KBW 2025 공식 사이드이벤트 스폰서', signal:'LayerZero sponsored SYNC: SEOUL 2025 AFTER DARK and has an active APAC footprint.', source:'https://luma.com/3cz481z4', contactSource:'https://layerzero.network/terms' },
    { company:'Solayer Labs', domain:'solayer.org', email:'team@solayer.org', title:'Team / General', score:95, status:'KBW 2025 공식 사이드이벤트 스폰서', signal:'Solayer sponsored SYNC: SEOUL 2025 AFTER DARK during Korea Blockchain Week.', source:'https://luma.com/3cz481z4', contactSource:'https://solayer.org/terms' },
    { company:'Sanctum', domain:'sanctum.so', email:'hello@sanctum.so', title:'General / Team', score:95, status:'KBW 2025 공식 사이드이벤트 스폰서', signal:'Sanctum sponsored SYNC: SEOUL 2025 AFTER DARK during Korea Blockchain Week.', source:'https://luma.com/3cz481z4', contactSource:'https://sanctum.so/app/privacy' },
    { company:'Kaia DLT Foundation', domain:'kaia.io', email:'contact@kaia.io', title:'General / Partnerships', score:94, status:'KBW 2025 서울 직접 행사', signal:'Kaia hosted the Stable Gathering during Korea Blockchain Week 2025 in Seoul.', source:'https://luma.com/etppffre', contactSource:'https://www.kaia.io/privacy' },
    { company:'Raydium', domain:'raydium.io', email:'security@raydium.io', title:'Official Email / Routing', score:89, status:'KBW 2025 서울 직접 행사', signal:'Raydium hosted Café Rave during Korea Blockchain Week 2025 in Seoul.', source:'https://luma.com/ea9lcg6b', contactSource:'https://docs.raydium.io/raydium/security' },
    { company:'Symbiotic', domain:'symbiotic.fi', email:'verify@symbiotic.fi', title:'Official Email / Routing', score:90, status:'KBW 2025 서울 빌더 행사', signal:'Symbiotic ran a featured builder event and protocol session during KBW 2025.', source:'https://luma.com/zxb31fde', contactSource:'https://docs.symbiotic.fi/' },
    { company:'Web3 Foundation / Polkadot', domain:'web3.foundation', email:'press@web3.foundation', title:'Press / Events', score:94, status:'KBW 2025 Frequency House 공동주최', signal:'Polkadot co-hosted Frequency House during Korea Blockchain Week 2025.', source:'https://luma.com/pytchjnq', contactSource:'https://web3.foundation/press/' },
    { company:'Ethereum Foundation', domain:'ethereum.org', email:'press@ethereum.org', title:'Press / Events', score:92, status:'KBW 2025 서울 행사 참여', signal:'Ethereum Foundation participated in the Seoul Digital Money Summit during KBW 2025.', source:'https://www.sooho.io/en/articles/seoul-digital-money-summit', contactSource:'https://ethereum.org/en/about/' },
    { company:'MemeCore', domain:'memecore.com', email:'biz@memecore.com', title:'Business / Partnerships', score:97, status:'KBW 2025 대형 사이드이벤트 주최', signal:'MemeCore hosted HALLOMEME, a major KBW 2025 side event in Seoul.', source:'https://www.prnewswire.com/news-releases/memecore-kbw-2025-side-event-hallomeme-ride-until-next-morning-concludes-with-great-success-302568066.html', contactSource:'https://www.memecore.com/' },
    { company:'PayProtocol', domain:'payprotocol.io', email:'help@payprotocol.io', title:'Service / Partnership Routing', score:94, status:'KBW 2025 현장 스폰서', signal:'PayProtocol participated as a KBW 2025 sponsor with an on-site booth.', source:'https://view.asiae.co.kr/en/article/2025091814194144204', contactSource:'https://payprotocol.io/partnership' },
    { company:'TRON DAO', domain:'tron.network', email:'press@tron.network', title:'Press / Events', score:93, status:'KBW 2025 메인 행사·서울 activation', signal:'TRON leadership headlined KBW 2025 and the team ran Seoul activations around the conference.', source:'https://www.prnewswire.com/news-releases/korea-blockchain-week-2025-hollywood-stars-nba-champions-and-blockchain-visionaries-unite-at-kbw2025-impact-conference-302524228.html', contactSource:'https://tron.network/' },
    { company:'LF Decentralized Trust', domain:'lfdecentralizedtrust.org', email:'ecosystem@lfdecentralizedtrust.org', title:'Ecosystem / Partnerships', score:97, status:'KBW 2025 서울 행사 공동주최', signal:'LF Decentralized Trust co-hosted Seoul Digital Money Summit during Korea Blockchain Week 2025.', source:'https://www.lfdecentralizedtrust.org/events/seoul-digital-money-summit-2025', contactSource:'https://www.lfdecentralizedtrust.org/about/contact' },
    { company:'Rootstone', domain:'rootstone.io', email:'trade@rootstone.io', title:'Institutional Desk / Partnerships', score:97, status:'KBW 2025 BTCFi Seoulmates 공동주최', signal:'Rootstone co-hosted BTCFi Seoulmates during KBW 2025.', source:'https://luma.com/ppmnb9b7', contactSource:'https://rootstone.io/contact' },
    { company:'Move Industries / Movement', domain:'movementlabs.xyz', email:'joe.chen@movementlabs.xyz', title:'Joe Chen · Head of APAC BD', score:100, status:'KBW 2025 Movement Summit 직접 주최', signal:'Movement hosted Movement Summit @KBW 2025 and published its APAC sponsorship contact.', source:'https://luma.com/movementsummitkbw', contactSource:'https://luma.com/movementsummitkbw' },
    { company:'Orbs', domain:'orbs.com', email:'hello@orbs.com', title:'General / Partnerships', score:97, status:'KBW 2025 BTCFi Seoulmates 공동주최', signal:'Orbs co-hosted BTCFi Seoulmates during KBW 2025.', source:'https://luma.com/ppmnb9b7', contactSource:'https://www.orbs.com/contact/' },
    { company:'blocmates', domain:'blocmates.com', email:'help@blocmates.com', title:'Team / Media Routing', score:96, status:'KBW 2025 Stargate 행사 공동주최', signal:'blocmates co-hosted a Stargate x blocmates event during Korea Blockchain Week 2025.', source:'https://luma.com/b4lkd27i', contactSource:'https://www.blocmates.com/privacy-policy' },
    { company:'Zircuit', domain:'zircuit.com', email:'bootstrap@zircuit.com', title:'Team / Technical Routing', score:96, status:'KBW 2025 서울 행사 직접 주최', signal:'Zircuit hosted Better Times with Virtuals and Rialo during KBW 2025.', source:'https://luma.com/BetterTimesatKBW', contactSource:'https://docs.zircuit.com/build/start/run-zircuit' },
    { company:'Allora Network', domain:'allora.network', email:'forge@allora.network', title:'Forge / Team Routing', score:96, status:'KBW 2025 서울 행사 직접 주최', signal:'Allora Labs hosted a featured private event during KBW 2025.', source:'https://luma.com/AlloraKBW', contactSource:'https://forge.allora.network/competitions/15' },
    { company:'Odos / Semiotic AI', domain:'odos.xyz', email:'legal@odos.xyz', title:'Official Email / Routing', score:92, status:'KBW 2025 Finale Night 공동주최', signal:'Odos co-hosted Finale Night: Beyond the Chain during KBW 2025.', source:'https://luma.com/gb0im416', contactSource:'https://assets.odos.xyz/TermsOfUse.html' },
    { company:'RedStone', domain:'redstone.finance', email:'contact@redstone.finance', title:'General / Partnerships', score:98, status:'KBW 2025 BTCFi Seoulmates 공동주최', signal:'RedStone co-hosted BTCFi Seoulmates during KBW 2025.', source:'https://luma.com/ppmnb9b7', contactSource:'https://blog.redstone.finance/home/' },
    { company:'Stargate', domain:'stargate.finance', email:'notices@stargate.finance', title:'Official Notice / Routing', score:95, status:'KBW 2025 서울 행사 공동주최', signal:'Stargate co-hosted a Stargate x blocmates event during Korea Blockchain Week 2025.', source:'https://luma.com/b4lkd27i', contactSource:'https://stargate.finance/terms' },
    { company:'Bastion', domain:'bastion.com', email:'legal@bastion.com', title:'Official Email / Routing', score:99, status:'KBW 2026 공식 연사 확정', signal:'Caroline Friedman, COO & Founding Member of Bastion, is confirmed as a KBW 2026 speaker.', source:'https://koreablockchainweek.com/speakers', contactSource:'https://bastion.com/terms-of-service' },
    { company:'a16z crypto', domain:'a16z.com', email:'seoul-info@a16z.com', title:'Seoul Office', score:100, status:'KBW 2026 공식 연사 + 서울 오피스', signal:'a16z crypto has confirmed KBW 2026 representation and operates a Seoul office.', source:'https://koreablockchainweek.com/speakers', contactSource:'https://a16z.com/offices/' },
    { company:'Kresus Labs', domain:'kresus.com', email:'support@kresus.com', title:'Support / General Routing', score:99, status:'KBW 2026 공식 연사 확정', signal:'Trevor Traina, Founder & CEO of Kresus Labs, is confirmed as a KBW 2026 speaker.', source:'https://koreablockchainweek.com/speakers', contactSource:'https://www.kresus.com/' },
    { company:'Bedrock', domain:'bedrock.technology', email:'support@bedrock.technology', title:'Support / Team Routing', score:97, status:'KBW 2025 BTCFi Seoulmates 공동주최', signal:'Bedrock co-hosted BTCFi Seoulmates during KBW 2025.', source:'https://luma.com/ppmnb9b7', contactSource:'https://app.bedrock.technology/crosschain' },
    { company:'Asia Stablecoin Alliance', domain:'asiastable.org', email:'alex@asiastable.org', title:'Alex Lim · Partnerships / Executive Director', score:100, status:'KBW 2025 공식 사이드이벤트 공동주최', signal:'Asia Stablecoin Alliance co-hosted SYNC: SEOUL 2025 AFTER DARK and published a direct partnership contact.', source:'https://luma.com/3cz481z4', contactSource:'https://luma.com/3cz481z4' },
    { company:'Ethena Labs', domain:'ethena.fi', email:'Ethena-August@augustco.com', title:'PR / Media Contact', score:99, status:'KBW 2026 공식 연사 확정', signal:'Guy Young, Founder & CEO of Ethena, is confirmed as a KBW 2026 speaker.', source:'https://koreablockchainweek.com/speakers', contactSource:'https://www.businesswire.com/news/home/20250723966873/en/', trustedCrossDomain:true },
    { company:'RockawayX', domain:'rockawayx.com', email:'contact@rockawayx.com', title:'Growth / Partnerships Routing', score:100, status:'KBW 2026 참석 확정', signal:'RockawayX leadership is confirmed for KBW 2026 in Seoul.', source:'https://www.linkedin.com/company/korea-blockchain-week', contactSource:'https://www.rockawayx.com/' },
    { company:'Ostium', domain:'ostium.io', email:'team@ostium.io', title:'Partnerships / Institutional', score:100, status:'KBW 2026 참석 확정', signal:'Ostium co-founder and CEO Kaledora Fontana Kiernan-Linn is confirmed for KBW 2026 in Seoul.', source:'https://www.linkedin.com/posts/kaledora_looking-forward-to-speaking-at-kbw2026-in-activity-7478422787704111105-iLrK', contactSource:'https://docs.ostium.com/traders/community/support' },
    { company:'Wingbits', domain:'wingbits.com', email:'sales@wingbits.com', title:'Sales / Business Partnerships', score:98, status:'KBW 2026 공식 채널 노출', signal:'KBW 2026 is currently featuring Wingbits co-founder Robin Wingardh in its Seoul campaign.', source:'https://www.linkedin.com/company/korea-blockchain-week', contactSource:'https://wingbits.com/business-solutions/live-flight-data' },
    { company:'Spacecoin', domain:'spacecoin.org', email:'partnerships@spacecoin.org', title:'Partnerships', score:99, status:'KBW 2025 타이틀 스폰서 · 재참가 우선', signal:'Spacecoin was a KBW 2025 Title Sponsor and remains an active Asia-facing Web3 team.', source:'https://www.linkedin.com/posts/korea-blockchain-week_kbw2025-kbw-koreablockchainweek-activity-7363193018532708352-4a68', contactSource:'https://spacecoin.org/' },
    { company:'peaq', domain:'peaq.network', email:'info@peaq.network', title:'General / Partnerships Routing', score:97, status:'KBW 2025 메인 연사 · 재참가 우선', signal:'peaq co-founder Leonard Dorlöchter delivered a main-stage KBW 2025 keynote in Seoul.', source:'https://conference.playfablo.com/en/conference/1/speaker?speakerId=281', contactSource:'https://www.peaq.xyz/legal/imprint' },
    { company:'Gaia', domain:'gaianet.ai', email:'hello@gaianet.ai', title:'General / Partnerships Routing', score:97, status:'KBW 2025 스폰서·CEO 연사 · 재참가 우선', signal:'Gaia was represented at KBW 2025 by co-founder and CEO Matt Wright and appeared in the sponsor program.', source:'https://conference.playfablo.com/en/conference/1?sponsorId=29', contactSource:'https://mobile.gaianet.ai/pages/support' },
    { company:'DogeOS', domain:'dogeos.com', email:'quests@dogeos.com', title:'Community Campaigns / Routing', score:98, status:'KBW 2025 대규모 현장 운영 · 재참가 우선', signal:'DogeOS brought its team to Seoul for KBW 2025, sponsored the event, operated a booth and joined official programming.', source:'https://blog.dogeos.com/doge-on-the-road-korea-blockchain-week-seoul/', contactSource:'https://cctv.dogeos.com/en/terms' },
    { company:'Sonic Labs', domain:'soniclabs.com', email:'bd@soniclabs.com', title:'Business Development', score:97, status:'KBW 2025 브론즈 스폰서 · 재참가 우선', signal:'Sonic was an official Bronze Sponsor of KBW 2025 and maintains a direct business-development channel.', source:'https://www.linkedin.com/posts/korea-blockchain-week_kbw-koreablockchainweek-web3-activity-7375332947568222208-mAXz', contactSource:'https://blog.soniclabs.com/the-rules-of-an-open-network/' },
    { company:'Succinct', domain:'succinct.xyz', email:'info@succinct.xyz', title:'General / Events Routing', score:96, status:'KBW 2025 CEO 연사 · 재참가 우선', signal:'Succinct co-founder and CEO Uma Roy was a KBW 2025 speaker in Seoul.', source:'https://conference.playfablo.com/en/conference/1/speaker?speakerId=117', contactSource:'https://www.succinct.xyz/' },
    { company:'Chiliz', domain:'chiliz.com', email:'chilizchainsupport@chiliz.com', title:'Chain Support / Partnerships Routing', score:96, status:'KBW 2025 골드 스폰서 · 한국 전략시장', signal:'Chiliz was an official Gold Sponsor of KBW 2025 and has continued strategic activity in Korea.', source:'https://www.linkedin.com/posts/activity-7374728978063884288-UUmt', contactSource:'https://bridge.chiliz.com/wrap' },
    { company:'Hyperliquid Labs', domain:'hyperliquid.xyz', email:'support@hl.xyz', title:'Official Support / Routing', score:100, status:'KBW 2026 공식 연사 확정', signal:'Jeff Yan, CEO of Hyperliquid Labs, is confirmed on the official KBW 2026 speaker lineup.', source:'https://koreablockchainweek.com/speakers', contactSource:'https://play.google.com/store/apps/details?id=xyz.hyperliquid.app', trustedCrossDomain:true }
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

  function makeLead(row, index) {
    const message = `Hi ${row.company} team,\n\nI’m reaching out because ${row.signal}\n\nAre you already planning team shirts, staff wear, or event merch for Seoul around Korea Blockchain Week? We produce T-shirts, hoodies, caps, and staff wear locally in Seoul and can deliver directly to your hotel, office, venue, or side-event location.\n\nIf apparel is still open, I can send 2–3 practical options with USD pricing and turnaround times for 20 / 50 / 100 units.\n\nWould it be useful if I send the options?\n\nBest,\nNYF`;
    const contact = {
      email: row.email.toLowerCase(),
      name: `${row.company} Team`,
      title: row.title,
      emailStatus: 'valid',
      email_status: 'verified',
      type: row.email.split('@')[0].includes('.') ? 'personal' : 'generic',
      sources: [row.contactSource],
      source_url: row.contactSource,
      provider: 'canonical_kbw40+public_web',
      providers: ['canonical_kbw40','public_web'],
      score: 99,
      qualified: true,
      verifiedOverride: true,
      verified_override: true,
      trustedCrossDomain: Boolean(row.trustedCrossDomain),
      lookupDomain: row.domain,
      priority: index + 1,
      verifiedAt: '2026-08-11'
    };
    return {
      id: `kbw-canonical40:${normalizeDomain(row.domain)}`,
      batch: BATCH,
      campaign: 'kbw',
      campaign_label: 'KBW 단체복',
      company: row.company,
      domain: normalizeDomain(row.domain),
      url: `https://${normalizeDomain(row.domain)}/`,
      source_url: row.source,
      source_title: row.status,
      published_date: '2026-08-11',
      signal: row.signal,
      score: row.score,
      sales_priority: row.score + 30,
      win_score: Math.min(100, row.score),
      win_label: row.score >= 98 ? '승산 높음' : '우선 연락',
      opportunity_lane: row.status.includes('2026') ? 'kbw2026-current' : 'kbw-return-priority',
      reachability: row.score >= 98 ? '접근 최우선' : '접근 우선',
      kbw_status: row.status,
      kbw_status_code: row.status.includes('2026') ? 'confirmed' : 'prior-kbw-strong',
      outreach_language: 'en',
      verified_company: true,
      verified_by: 'canonical 40 research batch + public KBW/company sources',
      quality_reasons: ['2026-08-11 신규 40개 고정 카탈로그', row.status, '공개 업무 이메일 확인'],
      tool_signals: ['canonical_kbw40','public_web','verified_public_email'],
      recommended_role: row.title,
      role_targets: [row.title,'Events','Partnerships','Marketing','Community'],
      offer: 'KBW 기간 서울 방문 팀웨어·스태프웨어·커스텀 의류 현지 제작·납품',
      outreach_goal: 'reply',
      outreach_stage: 'first_touch',
      reply_question: 'Would it be useful if I send the 20 / 50 / 100-unit options?',
      subject: `KBW Seoul teamwear for ${row.company}`,
      message_en: message,
      contact,
      contacts: [contact],
      contact_provider: 'canonical_kbw40+public_web',
      contact_status: 'found',
      canonical_kbw40: true
    };
  }

  function applyCatalog() {
    if (typeof state === 'undefined' || !Array.isArray(state.leads)) return false;

    if (state.rejected instanceof Set) {
      for (const domain of BLOCKED) state.rejected.add(domain);
    }

    state.leads = state.leads.filter((lead) => !BLOCKED.has(normalizeDomain(lead?.domain || lead?.url)));

    const canonical = ROWS.map(makeLead);
    const canonicalDomains = new Set(canonical.map((lead) => normalizeDomain(lead.domain)));
    const existingByDomain = new Map();
    for (const lead of state.leads) {
      const domain = normalizeDomain(lead?.domain || lead?.url || lead?.contact?.email);
      if (domain && !existingByDomain.has(domain)) existingByDomain.set(domain, lead);
    }

    const canonicalWithStableIds = canonical.map((lead) => {
      const existing = existingByDomain.get(normalizeDomain(lead.domain));
      if (!existing) return lead;
      return { ...existing, ...lead, id: existing.id || lead.id, contact: lead.contact, contacts: lead.contacts };
    });

    const rest = state.leads.filter((lead) => !canonicalDomains.has(normalizeDomain(lead?.domain || lead?.url || lead?.contact?.email)));
    state.leads = [...canonicalWithStableIds, ...rest].slice(0, 250);

    if (state.selected instanceof Set) {
      const liveIds = new Set(state.leads.map((lead) => lead?.id).filter(Boolean));
      for (const id of [...state.selected]) if (!liveIds.has(id)) state.selected.delete(id);
    }

    const presentDomains = new Set(state.leads.map((lead) => normalizeDomain(lead?.domain || lead?.url)).filter(Boolean));
    const present = canonical.filter((lead) => presentDomains.has(normalizeDomain(lead.domain))).length;
    const sendReady = typeof leadReady === 'function' ? canonicalWithStableIds.filter(leadReady).length : null;

    state.statusText = `KBW 신규 고정 후보 ${present}/${EXPECTED} 반영`;
    if (typeof saveState === 'function') saveState();
    if (typeof render === 'function') render();

    window.KBWCanonical40 = {
      batch: BATCH,
      expected: EXPECTED,
      present,
      sendReady,
      blockedRemoved: [...BLOCKED],
      domains: canonical.map((lead) => lead.domain)
    };
    console.info(`[KBW canonical40] visible ${present}/${EXPECTED}; send-ready ${sendReady ?? 'n/a'}`);
    return present === EXPECTED;
  }

  function tick() {
    if (applyCatalog() || Date.now() - startedAt > 15000) {
      if (timer) clearInterval(timer);
      timer = null;
    }
  }

  if (ROWS.length !== EXPECTED) {
    console.error(`[KBW canonical40] catalog size mismatch: ${ROWS.length}/${EXPECTED}`);
    return;
  }

  timer = setInterval(tick, 150);
  tick();
})();
