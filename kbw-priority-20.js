(() => {
  const SOURCE_KBW = 'https://koreablockchainweek.com/speakers';
  const SENT_CACHE_KEY = 'kpa.hunt.sentDomains.v1';
  const DELETED_KEY = 'kpa.hunt.deletedDomains.v1';

  const rows = [
    ['OKX','okx.com','media@okx.com','https://www.okx.com/learn/okx-announces-zero-knowledge-proof-solvency-verification','KBW2026 official speaker: Star Xu, CEO & Founder',100],
    ['Robinhood','robinhood.com','press@robinhood.com','https://investors.robinhood.com/news-releases/news-release-details/robinhood-announces-private-offering-20-billion-convertible','KBW2026 official speaker: Johann Kerbrat, SVP & GM of Crypto',100],
    ['MoonPay','moonpay.com','press@moonpay.com','https://www.globenewswire.com/news-release/2026/06/09/3308770/0/en/house-of-doge-and-moonpay-enable-dogecoin-payments-across-6-000-merchants-and-launch-%C3%90oge-pay.html','KBW2026 official speaker: Caroline Pham, Chief Legal Officer & Chief Administrative Officer',99],
    ['Ripple','ripple.com','press@ripple.com','https://ripple.com/ripple-press/ripple-receives-full-eu-mica-casp-license/','KBW2026 official speaker: Monica Long, President',99],
    ['Tether','tether.to','press@tether.to','https://www.globenewswire.com/news-release/2026/02/18/3240269/0/en/rumble-and-tether-add-usa-to-rumble-wallet.html','KBW2026 official speaker: Bo Hines, CEO of Tether USA₮',99],
    ['World Liberty Financial','worldlibertyfinancial.com','info@worldlibertyfinancial.com','https://worldlibertyfinancial.com/','KBW2026 official speaker: Zach Witkoff, CEO',98],
    ['Cloudflare','cloudflare.com','press@cloudflare.com','https://www.cloudflare.com/press/','KBW2026 official speaker: Will Papper, Director of Product, Agent Payments',98],
    ['Money20/20','money2020.com','press@money2020.com','https://us.money2020.com/media/newsroom/2022-10-18-us22-do-better','KBW2026 official speaker: Ian Fong, Vice President, Content Asia',97],
    ['Turnkey','turnkey.com','hello@turnkey.com','https://www.turnkey.com/legal/terms','KBW2026 official speaker: Michael Lewellen, Head of Solutions Engineering',97],
    ['Backpack','backpack.exchange','support@backpack.exchange','https://support.backpack.exchange/technical-docs/onboarding','KBW2026 official speaker: Armani Ferrante, Co-Founder & CEO',97],
    ['Plasma','plasma.to','support@plasma.to','https://www.plasma.org/privacy-policy','KBW2026 official speaker: Zaheer Ebtikar, CSO',96],
    ['Solana Foundation','solana.com','hello@solana.com','https://solana.com/community','Current Seoul/Korea ecosystem signal and official public contact',95],
    ['Coinbase','coinbase.com','press@coinbase.com','https://www.coinbase.com/press','Global crypto team with active ecosystem/event partnerships; official public contact',95],
    ['Kraken','kraken.com','marketing@kraken.com','https://support.kraken.com/articles/4410362151828-business-inquiries','Official marketing/sponsorship contact; strong KBW-week outreach fit',95],
    ['Chainlink','chainlink.com','press@chainlink.com','https://chain.link/press','Global Web3 infrastructure team with active institutional/event footprint; official public contact',94],
    ['Ledger','ledger.com','media@ledger.com','https://support.ledger.com/contact-us','Global crypto hardware/security team with event and brand activation fit; official public contact',94],
    ['Fireblocks','fireblocks.com','info@fireblocks.com','https://www.fireblocks.com/','Global digital-asset infrastructure team with Asia institutional footprint; official public contact',94],
    ['BitGo','bitgo.com','press@bitgo.com','https://www.bitgo.com/press/','Global digital-asset infrastructure team with current institutional expansion; official public contact',93],
    ['TRM Labs','trmlabs.com','press@trmlabs.com','https://www.trmlabs.com/press-center','Global blockchain-intelligence team with current Asia/public-sector event fit; official public contact',93],
    ['Apollo Global Management','apollo.com','communications@apollo.com','https://www.apollo.com/aboutus/contact-us','Institutional digital-assets and Asia-Pacific outreach fit; official APAC communications contact',92]
  ];

  function normalizeDomain(value = '') {
    let raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw.includes('@') && !raw.includes('://')) raw = raw.split('@').pop() || '';
    try { raw = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname; }
    catch { raw = raw.split('/')[0].split(':')[0]; }
    return raw.replace(/^www\./, '').replace(/\.+$/, '');
  }

  function readArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function cachedSentDomains() {
    try {
      const value = JSON.parse(localStorage.getItem(SENT_CACHE_KEY) || 'null');
      return Array.isArray(value?.domains) ? value.domains : [];
    } catch { return []; }
  }

  function makeLead([company, domain, email, contactSource, signal, priority]) {
    const message = `Hi ${company} team,\n\nI’m reaching out because your team is a strong fit for our KBW 2026 Seoul outreach. We produce custom teamwear locally in Seoul for international teams visiting Korea — T-shirts, caps, staff wear, and rush small-batch orders, with local delivery.\n\nIf you need apparel for KBW week, I can send a simple USD quote for 20 / 50 / 100 units plus available lead times.\n\nWould it be useful if I send the options?\n\nBest,\nNYF`;
    return {
      id: `kbw-priority-2026:${domain}`,
      campaign: 'kbw',
      campaign_label: 'KBW 단체복',
      company,
      domain,
      url: `https://${domain}`,
      verified_company: true,
      verified_by: 'official KBW/public company sources + hardcoded verified contact',
      score: priority,
      sales_priority: priority,
      win_label: priority >= 97 ? '승산 높음' : '우선 연락',
      signal,
      source_url: signal.startsWith('KBW2026 official speaker') ? SOURCE_KBW : contactSource,
      offer: 'KBW 기간 서울 방문 팀웨어·스태프웨어·커스텀 의류 현지 제작·납품',
      recommended_role: 'Marketing / Events / Partnerships',
      role_targets: ['Marketing','Events','Partnerships','Communications'],
      quality_reasons: ['실제 회사 확인','공식 공개 이메일','KBW/서울 적합도 높음','하드코딩 검증'],
      tool_signals: ['official_web','verified_email'],
      outreach_language: 'en',
      subject: `KBW 2026 Seoul teamwear for ${company}`,
      message_en: message,
      reply_question: 'Would it be useful if I send the 20 / 50 / 100-unit options?',
      contact_status: 'found',
      contact_provider: 'hardcoded-official-web',
      contact: {
        email,
        name: `${company} Team`,
        title: 'Marketing / Events / Communications',
        qualified: true,
        score: 100,
        provider: 'hardcoded-official-web',
        email_status: 'verified',
        source_url: contactSource
      },
      contacts: []
    };
  }

  function inject() {
    if (typeof state === 'undefined' || typeof mergeLeads !== 'function') return;

    const blocked = new Set([
      ...[...state.rejected].map(normalizeDomain),
      ...readArray(DELETED_KEY).map(normalizeDomain),
      ...cachedSentDomains().map(normalizeDomain)
    ].filter(Boolean));

    const existing = new Set((state.leads || []).map(lead => normalizeDomain(lead.domain || lead.url || lead.contact?.email)).filter(Boolean));
    const leads = rows
      .map(makeLead)
      .filter(lead => !blocked.has(normalizeDomain(lead.domain)) && !existing.has(normalizeDomain(lead.domain)));

    const added = mergeLeads(leads);
    if (added.length && typeof render === 'function') render();
    window.KBWPriority20 = { total: rows.length, added: added.length, domains: rows.map(row => row[1]) };
  }

  inject();
})();