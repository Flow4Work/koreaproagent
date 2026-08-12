(() => {
  const BATCH = '20260812-kbw-fresh20-v1';
  const EXPECTED = 20;
  const SENT_ENDPOINT = '/api/gmail?action=sent-domains';
  const SENT_CACHE_KEY = 'kpa.hunt.sentDomains.v1';
  const DELETED_KEY = 'kpa.hunt.deletedDomains.v1';
  const HARD_BLOCKED = new Set(['sooho.io', 'bitmex.com']);
  const INVALID_EMAILS = new Set(['info@succinct.xyz', 'security@raydium.io']);

  const ROWS = [
    {"company":"Talus Network","domain":"talus.network","url":"https://talus.network/","email":"hi@talus.network","title":"Team / Partnerships","language":"en","score":100,"kbw_status":"2026 서울 Talus 커뮤니티 행사 · limited merch/현장 경품 운영","signal":"Talus ran a 2026 Seoul community activation with limited merchandise and on-site giveaways, making local merch production directly relevant.","source_url":"https://luma.com/vkcteemp","contact_source":"https://talus.network/"},
    {"company":"Korea Buidl Week Alliance","domain":"kbwa.events","url":"https://www.buidlkorea.com/","email":"contact@kbwa.events","title":"Alliance / Events","language":"ko","score":100,"kbw_status":"Korea Buidl Week 2026 공식 운영 Alliance","signal":"KBWA runs Korea Buidl Week 2026 in Seoul and explicitly recruits event hosts, sponsors and partners across the week.","source_url":"https://www.buidlkorea.com/about","contact_source":"https://www.buidlkorea.com/contact"},
    {"company":"ARK Point","domain":"arkpoint.kr","url":"https://arkpoint.kr/","email":"teo@arkpoint.kr","title":"CEO / Partnerships","language":"ko","score":99,"kbw_status":"Korea Buidl Week 2026 Alliance · AI Agentic Finance Forum 공동 주최","signal":"ARK Point is a KBWA alliance member and co-hosted the 2026 AI Agentic Finance Forum in Seoul.","source_url":"https://www.buidlkorea.com/events","contact_source":"https://arkpoint.kr/"},
    {"company":"Formula Labs","domain":"formulalabs.xyz","url":"https://formulalabs.xyz/","email":"contact@fomulalabs.xyz","title":"Team / Partnerships","language":"ko","score":97,"kbw_status":"Korea Buidl Week 2026 Alliance 멤버","signal":"Formula Labs is listed in the 2026 Korea Buidl Week Alliance, placing it directly inside the Seoul builder-week operating network.","source_url":"https://www.buidlkorea.com/about","contact_source":"https://formulalabs.xyz/","trusted_cross_domain":true},
    {"company":"Catalyze","domain":"catalyze-research.com","url":"https://catalyze-research.com/","email":"contact@catalyze-research.com","title":"Team / Partnerships","language":"ko","score":100,"kbw_status":"AI/InfraCon 2026 서울 메인 이벤트 호스트 · 현장 giveaways","signal":"Catalyze hosted AI/InfraCon 2026 in Gangnam during BUIDL Week, with food, drinks, networking and attendee giveaways.","source_url":"https://luma.com/8nzr1zec","contact_source":"https://catalyze-research.com/"},
    {"company":"DeSpread","domain":"despread.io","url":"https://despread.io/","email":"contact@despread.io","title":"Business / Partnerships","language":"ko","score":98,"kbw_status":"Korea Buidl Week 2026 Alliance 멤버","signal":"DeSpread is a named member of the 2026 Korea Buidl Week Alliance and is active in Korea-focused Web3 ecosystem development.","source_url":"https://www.buidlkorea.com/about","contact_source":"https://despread.io/"},
    {"company":"IoTrust","domain":"iotrust.kr","url":"https://iotrust.kr/","email":"contact@iotrust.kr","title":"Business / Partnerships","language":"ko","score":98,"kbw_status":"Korea Buidl Week 2026 Alliance · D'Cent 운영사","signal":"IoTrust is represented in the 2026 Korea Buidl Week Alliance, and its D'Cent brand also appears in current BUIDL Week partner activity.","source_url":"https://www.buidlkorea.com/about","contact_source":"https://iotrust.kr/"},
    {"company":"SynFutures","domain":"synfutures.com","url":"https://www.synfutures.com/","email":"info@synfutures.com","title":"Events / Partnerships","language":"en","score":99,"kbw_status":"AI/InfraCon 2026 공식 파트너 · 기존 KBW 서울 행사 직접 공동주최","signal":"SynFutures was a 2026 AI/InfraCon partner in Seoul and has also directly co-hosted a Korea Blockchain Week networking event.","source_url":"https://luma.com/8nzr1zec","contact_source":"https://summit.synfutures.com/"},
    {"company":"IOTA Foundation","domain":"iota.org","url":"https://www.iota.org/","email":"partnerships@iota.org","title":"Partnerships","language":"en","score":98,"kbw_status":"AI/InfraCon 2026 서울 공식 파트너","signal":"IOTA was listed as an official partner of AI/InfraCon 2026 during BUIDL Week in Seoul.","source_url":"https://luma.com/8nzr1zec","contact_source":"https://www.iota.org/build/get-started"},
    {"company":"BNB Chain","domain":"bnbchain.org","url":"https://www.bnbchain.org/","email":"info@bnbchain.org","title":"Ecosystem / Partnerships","language":"en","score":100,"kbw_status":"BuidlHack 2026 $5K 공식 스폰서 트랙 · 서울 Builder Day/Final","signal":"BNB Chain sponsored a dedicated $5,000 track in BuidlHack 2026 and ran a workshop tied to the Korea Buidl Week builder pipeline.","source_url":"https://www.buidlkorea.com/buidlhack2026","contact_source":"https://www.bnbchain.org/en/blog/mvb-accelerator-program-teams-up-with-cmc-labs-to-launch-new-founder-track-aiming-to-incubate-100-new-projects-on-bnb-chain"},
    {"company":"ZetaChain","domain":"zetachain.com","url":"https://www.zetachain.com/","email":"partnerships@zetachain.com","title":"Partnerships","language":"en","score":99,"kbw_status":"2026 Agent Execution Frontier Seoul 공식 스폰서 · 전용 연구 트랙","signal":"ZetaChain sponsored Agent Execution Frontier Seoul 2026 and had a dedicated AI interoperability research track.","source_url":"https://luma.com/u9cpjyrl","contact_source":"https://www.zetachain.com/"},
    {"company":"Tiger Research","domain":"tiger-research.com","url":"https://tiger-research.com/","email":"help@tiger-research.com","title":"Business Development / Events","language":"ko","score":99,"kbw_status":"2026 AI Agentic Finance Forum 파트너 · 서울/아시아 Web3 이벤트 운영","signal":"Tiger Research is a Seoul-based Web3 research and consulting team, appears in 2026 BUIDL Week event programming, and operates curated industry events.","source_url":"https://www.buidlkorea.com/events","contact_source":"https://tiger-research.com/about"},
    {"company":"K1 Research","domain":"k1research.com","url":"https://k1research.com/","email":"info@k1research.com","title":"Research / Marketing / Events","language":"ko","score":100,"kbw_status":"2026 Seoul Signal 청담 직접 주최 · 스폰서 세션/호스피탈리티 운영","signal":"K1 Research hosted 2026 Seoul Signal in Cheongdam with sponsor sessions, champagne, catering, networking and event production.","source_url":"https://luma.com/ufr49cpv","contact_source":"https://k1research.com/"},
    {"company":"Gaea Ventures","domain":"gaeaventures.org","url":"https://gaeaventures.org/","email":"gaeavc@gaeavc.com","title":"Investment / Partnerships","language":"en","score":98,"kbw_status":"2026 Seoul Signal 공식 스폰서","signal":"Gaea Ventures was a named sponsor of 2026 Seoul Signal in Seoul and currently runs its own 2026 ecosystem events.","source_url":"https://luma.com/ufr49cpv","contact_source":"https://gaeaventures.org/Event","trusted_cross_domain":true},
    {"company":"PlaysOut","domain":"playsout.com","url":"https://playsout.com/","email":"contact@playsout.com","title":"Partnerships / Marketing","language":"en","score":98,"kbw_status":"2026 Seoul Signal 공식 스폰서 · KBW 파트너 이력","signal":"PlaysOut was a named sponsor of 2026 Seoul Signal and its official site lists KBW among trusted partners.","source_url":"https://luma.com/ufr49cpv","contact_source":"https://playsout.com/PRIVACYPOLICY.html"},
    {"company":"BFM Times","domain":"bfmtimes.com","url":"https://bfmtimes.com/","email":"tanishk@bfmtimes.com","title":"Business / Media / Events","language":"en","score":100,"kbw_status":"KBW 2026 기간 서울 Media Accelerator & Startup Cohort 운영 예정","signal":"BFM Times is organizing a Web3 media accelerator in Seoul from September 29 to October 1, 2026 alongside Korea Blockchain Week.","source_url":"https://luma.com/t86wuwls","contact_source":"https://www.linkedin.com/in/tanishknigam"},
    {"company":"Galxe","domain":"galxe.com","url":"https://www.galxe.com/","email":"support@galxe.com","title":"Developer Support / Partnerships Routing","language":"en","score":96,"kbw_status":"Gravity가 AI/InfraCon 2026 서울 공식 파트너로 참여","signal":"Gravity, part of the Galxe ecosystem, was listed as a partner of AI/InfraCon 2026 in Seoul; Galxe publishes a direct developer support inbox.","source_url":"https://luma.com/8nzr1zec","contact_source":"https://docs.galxe.com/galxe-integration/resources/support"},
    {"company":"TokenPost","domain":"tokenpost.kr","url":"https://www.tokenpost.kr/","email":"info@tokenpost.kr","title":"Advertising / Partnerships","language":"ko","score":99,"kbw_status":"2026 Agent Execution Frontier Seoul 공식 미디어 파트너","signal":"TokenPost was a media partner for Agent Execution Frontier Seoul 2026 and operates a dedicated advertising/business inquiry inbox in Korea.","source_url":"https://luma.com/u9cpjyrl","contact_source":"https://advertise.tokenpost.kr/ko"},
    {"company":"MANTRA","domain":"mantrachain.io","url":"https://mantrachain.io/","email":"contact@mantrachain.io","title":"Team / Partnerships","language":"en","score":97,"kbw_status":"KBW 서울 Real World Meetup 직접 주최 · Tiger Research 공동 행사","signal":"MANTRA directly hosted a Korea Blockchain Week meetup in Seoul with Tiger Research, including food and drinks for attendees.","source_url":"https://luma.com/mdbdi1fq","contact_source":"https://mantrachain.io/eula"},
    {"company":"Korea Web3 Embassy","domain":"web3embassy.kr","url":"https://www.web3embassy.kr/","email":"info@web3embassy.kr","title":"General / Partnerships","language":"ko","score":97,"kbw_status":"FACTBLOCK·Kintsugi·AhnLab Blockchain Company 한국 Web3 컨소시엄","signal":"Korea Web3 Embassy is a Seoul-based consortium focused on Korean market entry, event organization, community building and global partnerships, with FACTBLOCK and AhnLab Blockchain Company among its members.","source_url":"https://www.web3embassy.kr/","contact_source":"https://www.web3embassy.kr/"},
    {"company":"AhnLab Blockchain Company","domain":"ahnlabblockchain.company","url":"https://ahnlabblockchain.company/","email":"contact@ahnlabblockchain.company","title":"Partnerships","language":"ko","score":96,"kbw_status":"2026 VASP·Cloud Wallet 사업 본격화 · 기존 KBW 기관 행사 공동운영 이력","signal":"AhnLab Blockchain Company expanded its institutional Web3 business in 2026 and has prior Korea Blockchain Week institutional-event involvement.","source_url":"https://company.ahnlab.com/kr/news/press_release_view.do?seqPressRelease=10949","contact_source":"https://ahnlabblockchain.company/company"},
    {"company":"Aleo Network Foundation","domain":"aleo.org","url":"https://aleo.org/","email":"hello@aleo.org","title":"Community / Events","language":"en","score":94,"kbw_status":"KBW 서울 zkHOUSE 직접 주최 이력","signal":"Aleo previously hosted a full-day zkHOUSE during Korea Blockchain Week in Seoul with workshops, meals, BBQ, community programming and awards.","source_url":"https://luma.com/zkhousekbw","contact_source":"https://aleo.org/terms/"},
    {"company":"Notifi Network","domain":"notifi.network","url":"https://notifi.network/","email":"sales@notifi.network","title":"Sales / Partnerships","language":"en","score":94,"kbw_status":"KBW 서울 Chimaek Gangnam Style 공동주최 이력","signal":"Notifi directly co-hosted a Korea Blockchain Week networking event in Gangnam with food, cocktails and a live DJ.","source_url":"https://luma.com/kfc","contact_source":"https://docs.notifi.network/docs/faq"},
    {"company":"BitMart","domain":"bitmart.com","url":"https://www.bitmart.com/","email":"marketing@bitmart.com","title":"Marketing / Collaborations","language":"en","score":94,"kbw_status":"KBW 서울 Chimaek Gangnam Style 공동주최 이력","signal":"BitMart directly co-hosted a Korea Blockchain Week networking event in Gangnam and publishes a collaboration inbox for marketing partnerships.","source_url":"https://luma.com/kfc","contact_source":"https://www.bitmart.com/en/support/articles/7949433565211/7949531403675/360001865494"},
    {"company":"TAC","domain":"tac.build","url":"https://tac.build/","email":"info@tac.build","title":"General / Partnerships","language":"en","score":92,"kbw_status":"서울 Web3 생태계 행사 후보 예비군","signal":"TAC remains a Korea-relevant Web3 infrastructure prospect with a public team inbox and is retained only as a reserve if a primary lead is blocked by sent/deleted history.","source_url":"https://tac.build/","contact_source":"https://tac.build/"}
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
      try { localStorage.setItem(SENT_CACHE_KEY, JSON.stringify(domains)); } catch {}
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

  function makeContact(row) {
    const companyDomain = normalizeDomain(row.domain);
    const emailDomain = normalizeDomain(row.email);
    return {
      email: String(row.email || '').trim().toLowerCase(),
      name: `${row.company} Team`,
      title: row.title,
      emailStatus: 'valid',
      type: row.email.split('@')[0].includes('.') ? 'personal' : 'generic',
      sources: [row.contact_source],
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
      sourceLabel: 'Public contact verified for KBW/Korea event outreach'
    };
  }

  function makeLead(row) {
    const contact = makeContact(row);
    const isKo = row.language === 'ko';
    const question = isKo
      ? '올해 KBW 기간에 서울 행사나 팀 일정이 예정되어 있을까요?'
      : 'Have you already sorted team shirts or staff merch for your Seoul plans?';
    const messageKo = `안녕하세요.\n\n${row.signal}\n\n${question}\n\n필요하시면 티셔츠·후디·스태프 의류를 서울에서 제작해 호텔·사무실·행사장으로 바로 납품할 수 있습니다. 아직 준비 전이라면 가격과 납기를 포함한 옵션 2~3가지만 보내드리겠습니다.`;
    const messageEn = `Hi,\n\nI saw ${row.company}'s recent Seoul/Korea event activity. ${row.signal}\n\n${question}\n\nWe produce T-shirts, hoodies and staff wear locally in Seoul and can deliver directly to your hotel, office or venue. If merch is still open, I can send 2–3 options with pricing and turnaround times.`;

    return {
      id: `kbw-fresh20-20260812:${normalizeDomain(row.domain)}`,
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
      win_label: '승산 있음',
      opportunity_lane: 'fresh-kbw-korea-20260812',
      reachability: row.score >= 98 ? '접근 최우선' : '접근 우선',
      kbw_status: row.kbw_status,
      kbw_status_code: 'verified',
      outreach_language: row.language,
      verified_company: true,
      verified_by: 'manual-research+official-web+sent-audit',
      quality_reasons: ['기존 정적 후보 코드 미포함', 'Gmail 발송 이력 사전 대조', '공개 연락처 근거 확인', '서울·KBW·Korea Web3 이벤트 신호 확인'],
      tool_signals: ['manual_research', 'official_web', 'luma_or_kbw_signal', 'gmail_sent_audit'],
      recommended_role: row.title,
      role_targets: ['Events Lead', 'Partnerships Lead', 'Community Lead', 'Head of Marketing'],
      offer: 'KBW 기간 티셔츠·후디·스태프 의류를 서울 현지에서 제작·납품',
      outreach_goal: 'reply',
      outreach_stage: 'first_touch',
      reply_question: question,
      subject: isKo ? `${row.company} KBW 행사 준비 관련` : `Quick question about ${row.company}'s Seoul plans`,
      message_ko: messageKo,
      message_en: messageEn,
      contact,
      contacts: [contact],
      contact_provider: 'manual_db+official_web',
      contact_status: 'found',
      hardcoded_email_override: true,
      hardcoded_email_source: row.contact_source,
      fresh20_20260812: true
    };
  }

  async function inject(attempt = 0) {
    if (typeof state === 'undefined' || !Array.isArray(state.leads) || typeof mergeLeads !== 'function') {
      if (attempt < 40) setTimeout(() => inject(attempt + 1), 250);
      return;
    }

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
    if (added.length && typeof saveState === 'function') saveState();
    if (added.length && typeof render === 'function') render();

    state.statusText = `KBW 최신 신규 후보 ${added.length}/${EXPECTED} 추가 · 발송/추가/삭제/반송 주소 제외 · 2026-08-12 검증`;
    if (typeof saveState === 'function') saveState();
    if (typeof render === 'function') render();

    window.KBWFresh20_20260812 = {
      batch: BATCH,
      researched: ROWS.length,
      eligible: eligibleRows.length,
      selected: chosenRows.map((row) => row.company),
      added: added.map((lead) => lead.company),
      excluded: ROWS.filter((row) => !chosenRows.includes(row)).map((row) => row.company),
      blockedDomains: [...blocked]
    };
  }

  inject();
})();
