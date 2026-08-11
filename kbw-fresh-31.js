(() => {
  const SENT_ENDPOINT = '/api/gmail?action=sent-domains';
  const SENT_CACHE_KEY = 'kpa.sent.domains.v1';
  const DELETED_KEY = 'kpa.hunt.deletedDomains.v1';
  const BATCH = '20260811-kbw-fresh31';
  const ROWS = [
  {
    "company": "Uniswap Labs",
    "domain": "uniswap.org",
    "email": "support@uniswap.org",
    "title": "Support / General Routing",
    "score": 96,
    "signal": "Hosted Uniswap Hangout during Korea Blockchain Week 2025 in Seoul.",
    "source": "https://luma.com/2zb4db0d",
    "contactSource": "https://support.uniswap.org/hc/en-us/articles/17522892515341-Official-Uniswap-Labs-links"
  },
  {
    "company": "Kiln",
    "domain": "kiln.fi",
    "email": "media@kiln.fi",
    "title": "Media / Events",
    "score": 95,
    "signal": "Sponsor of SYNC: SEOUL 2025 AFTER DARK, an official KBW side event.",
    "source": "https://luma.com/3cz481z4",
    "contactSource": "https://www.kiln.fi/contact"
  },
  {
    "company": "LayerZero Labs",
    "domain": "layerzero.network",
    "email": "notices@layerzero.network",
    "title": "Official Notice / Routing",
    "score": 95,
    "signal": "Sponsor of SYNC: SEOUL 2025 AFTER DARK during KBW and active Korea/APAC leadership.",
    "source": "https://luma.com/3cz481z4",
    "contactSource": "https://layerzero.network/terms"
  },
  {
    "company": "Solayer Labs",
    "domain": "solayer.org",
    "email": "team@solayer.org",
    "title": "Team / General",
    "score": 95,
    "signal": "Sponsor of SYNC: SEOUL 2025 AFTER DARK during Korea Blockchain Week.",
    "source": "https://luma.com/3cz481z4",
    "contactSource": "https://solayer.org/terms"
  },
  {
    "company": "Sanctum",
    "domain": "sanctum.so",
    "email": "hello@sanctum.so",
    "title": "General / Team",
    "score": 95,
    "signal": "Sponsor of SYNC: SEOUL 2025 AFTER DARK during Korea Blockchain Week.",
    "source": "https://luma.com/3cz481z4",
    "contactSource": "https://sanctum.so/app/privacy"
  },
  {
    "company": "Kaia DLT Foundation",
    "domain": "kaia.io",
    "email": "contact@kaia.io",
    "title": "General / Partnerships Routing",
    "score": 94,
    "signal": "Kaia hosted the Stable Gathering during Korea Blockchain Week 2025 in Seoul.",
    "source": "https://luma.com/etppffre",
    "contactSource": "https://www.kaia.io/privacy"
  },
  {
    "company": "Raydium",
    "domain": "raydium.io",
    "email": "security@raydium.io",
    "title": "Official Email / Routing",
    "score": 89,
    "signal": "Raydium hosted Café Rave during Korea Blockchain Week 2025 in Seoul.",
    "source": "https://luma.com/ea9lcg6b",
    "contactSource": "https://docs.raydium.io/raydium/security"
  },
  {
    "company": "Symbiotic",
    "domain": "symbiotic.fi",
    "email": "verify@symbiotic.fi",
    "title": "Official Email / Routing",
    "score": 90,
    "signal": "Symbiotic ran a featured builder event and protocol session during KBW 2025.",
    "source": "https://luma.com/zxb31fde",
    "contactSource": "https://docs.symbiotic.fi/"
  },
  {
    "company": "Web3 Foundation / Polkadot",
    "domain": "web3.foundation",
    "email": "press@web3.foundation",
    "title": "Press / Events",
    "score": 94,
    "signal": "Polkadot co-hosted Frequency House during Korea Blockchain Week 2025.",
    "source": "https://luma.com/pytchjnq",
    "contactSource": "https://web3.foundation/press/"
  },
  {
    "company": "SOOHO.IO",
    "domain": "sooho.io",
    "email": "contact@sooho.io",
    "title": "General / Partnerships",
    "score": 98,
    "signal": "Hosted Seoul Digital Money Summit as a KBW 2025 side event.",
    "source": "https://www.sooho.io/en/articles/seoul-digital-money-summit",
    "contactSource": "https://www.sooho.io/en/"
  },
  {
    "company": "Ethereum Foundation",
    "domain": "ethereum.org",
    "email": "press@ethereum.org",
    "title": "Press / Events",
    "score": 92,
    "signal": "Participated in SOOHO.IO's Seoul Digital Money Summit during KBW 2025.",
    "source": "https://www.sooho.io/en/articles/seoul-digital-money-summit",
    "contactSource": "https://ethereum.org/en/about/"
  },
  {
    "company": "MemeCore",
    "domain": "memecore.com",
    "email": "ambassador@memecore.org",
    "title": "Ambassador / Community Partnerships",
    "score": 97,
    "signal": "Hosted HALLOMEME, a major KBW 2025 side event in Seoul with about 5,000 participants.",
    "source": "https://www.prnewswire.com/news-releases/memecore-kbw-2025-side-event-hallomeme-ride-until-next-morning-concludes-with-great-success-302568066.html",
    "contactSource": "https://ambassador.memecore.com/privacy"
  },
  {
    "company": "BitMEX",
    "domain": "bitmex.com",
    "email": "affiliates@bitmex.com",
    "title": "Affiliates / Partnerships",
    "score": 95,
    "signal": "BitMEX Research was title sponsor of Game Night during KBW 2025.",
    "source": "https://luma.com/uyxzt9n4",
    "contactSource": "https://www.bitmex.com/affiliates"
  },
  {
    "company": "PayProtocol",
    "domain": "payprotocol.io",
    "email": "help@payprotocol.io",
    "title": "Service / Partnership Routing",
    "score": 94,
    "signal": "PayProtocol participated as a KBW 2025 sponsor with an on-site booth.",
    "source": "https://view.asiae.co.kr/en/article/2025091814194144204",
    "contactSource": "https://payprotocol.io/partnership"
  },
  {
    "company": "TRON DAO",
    "domain": "tron.network",
    "email": "press@tron.network",
    "title": "Press / Events",
    "score": 93,
    "signal": "TRON founder Justin Sun headlined KBW 2025 and TRON ran KBW activations in Seoul.",
    "source": "https://www.prnewswire.com/news-releases/korea-blockchain-week-2025-hollywood-stars-nba-champions-and-blockchain-visionaries-unite-at-kbw2025-impact-conference-302524228.html",
    "contactSource": "https://tron.network/"
  },
  {
    "company": "LF Decentralized Trust",
    "domain": "lfdecentralizedtrust.org",
    "email": "ecosystem@lfdecentralizedtrust.org",
    "title": "Ecosystem / Partnerships",
    "score": 97,
    "signal": "Co-hosted Seoul Digital Money Summit during Korea Blockchain Week 2025.",
    "source": "https://www.lfdecentralizedtrust.org/events/seoul-digital-money-summit-2025",
    "contactSource": "https://www.lfdecentralizedtrust.org/about/contact"
  },
  {
    "company": "Rootstone",
    "domain": "rootstone.io",
    "email": "trade@rootstone.io",
    "title": "Institutional Desk / Partnerships",
    "score": 97,
    "signal": "Co-hosted BTCFi Seoulmates during KBW 2025.",
    "source": "https://luma.com/ppmnb9b7",
    "contactSource": "https://rootstone.io/contact"
  },
  {
    "company": "Move Industries / Movement",
    "domain": "movementlabs.xyz",
    "email": "joe.chen@movementlabs.xyz",
    "title": "Joe Chen · Head of APAC BD",
    "score": 100,
    "signal": "Hosted Movement Summit @KBW 2025; the event explicitly published this APAC sponsorship contact.",
    "source": "https://luma.com/movementsummitkbw",
    "contactSource": "https://luma.com/movementsummitkbw"
  },
  {
    "company": "Orbs",
    "domain": "orbs.com",
    "email": "hello@orbs.com",
    "title": "General / Partnerships",
    "score": 97,
    "signal": "Co-hosted BTCFi Seoulmates during KBW 2025.",
    "source": "https://luma.com/ppmnb9b7",
    "contactSource": "https://www.orbs.com/contact/"
  },
  {
    "company": "blocmates",
    "domain": "blocmates.com",
    "email": "help@blocmates.com",
    "title": "Team / Media Routing",
    "score": 96,
    "signal": "Co-hosted Stargate x blocmates event during Korea Blockchain Week 2025.",
    "source": "https://luma.com/b4lkd27i",
    "contactSource": "https://www.blocmates.com/privacy-policy"
  },
  {
    "company": "Zircuit",
    "domain": "zircuit.com",
    "email": "bootstrap@zircuit.com",
    "title": "Team / Technical Routing",
    "score": 96,
    "signal": "Hosted Better Times with Virtuals and Rialo during KBW 2025.",
    "source": "https://luma.com/BetterTimesatKBW",
    "contactSource": "https://docs.zircuit.com/build/start/run-zircuit"
  },
  {
    "company": "Allora Network",
    "domain": "allora.network",
    "email": "forge@allora.network",
    "title": "Forge / Team Routing",
    "score": 96,
    "signal": "Allora Labs hosted a featured private event during KBW 2025.",
    "source": "https://luma.com/AlloraKBW",
    "contactSource": "https://forge.allora.network/competitions/15"
  },
  {
    "company": "Odos / Semiotic AI",
    "domain": "odos.xyz",
    "email": "legal@odos.xyz",
    "title": "Official Email / Routing",
    "score": 92,
    "signal": "ODOS co-hosted Finale Night: Beyond the Chain during KBW 2025.",
    "source": "https://luma.com/gb0im416",
    "contactSource": "https://assets.odos.xyz/TermsOfUse.html"
  },
  {
    "company": "RedStone",
    "domain": "redstone.finance",
    "email": "contact@redstone.finance",
    "title": "General / Partnerships",
    "score": 98,
    "signal": "Co-hosted BTCFi Seoulmates during KBW 2025.",
    "source": "https://luma.com/ppmnb9b7",
    "contactSource": "https://blog.redstone.finance/home/"
  },
  {
    "company": "Stargate",
    "domain": "stargate.finance",
    "email": "notices@stargate.finance",
    "title": "Official Notice / Routing",
    "score": 95,
    "signal": "Co-hosted a Stargate x blocmates event during Korea Blockchain Week 2025.",
    "source": "https://luma.com/b4lkd27i",
    "contactSource": "https://stargate.finance/terms"
  },
  {
    "company": "Bastion",
    "domain": "bastion.com",
    "email": "legal@bastion.com",
    "title": "Official Email / Routing",
    "score": 93,
    "signal": "Caroline Friedman, COO & Founding Member of Bastion, is confirmed as a KBW 2026 speaker.",
    "source": "https://koreablockchainweek.com/speakers",
    "contactSource": "https://bastion.com/terms-of-service"
  },
  {
    "company": "a16z crypto",
    "domain": "a16z.com",
    "email": "seoul-info@a16z.com",
    "title": "Seoul Office",
    "score": 100,
    "signal": "a16z crypto has multiple confirmed KBW 2026 speakers and now operates a Seoul office.",
    "source": "https://koreablockchainweek.com/speakers",
    "contactSource": "https://a16z.com/offices/"
  },
  {
    "company": "Kresus Labs",
    "domain": "kresus.com",
    "email": "support@kresus.com",
    "title": "Support / General Routing",
    "score": 93,
    "signal": "Trevor Traina, Founder & CEO of Kresus Labs, is confirmed as a KBW 2026 speaker.",
    "source": "https://koreablockchainweek.com/speakers",
    "contactSource": "https://www.kresus.com/"
  },
  {
    "company": "Bedrock",
    "domain": "bedrock.technology",
    "email": "support@bedrock.technology",
    "title": "Support / Team Routing",
    "score": 97,
    "signal": "Co-hosted BTCFi Seoulmates during KBW 2025.",
    "source": "https://luma.com/ppmnb9b7",
    "contactSource": "https://app.bedrock.technology/crosschain"
  },
  {
    "company": "Asia Stablecoin Alliance",
    "domain": "asiastable.org",
    "email": "alex@asiastable.org",
    "title": "Alex Lim · Partnerships / Executive Director",
    "score": 100,
    "signal": "Co-hosted SYNC: SEOUL 2025 AFTER DARK, a KBW side event, and published a partnership contact.",
    "source": "https://luma.com/3cz481z4",
    "contactSource": "https://luma.com/3cz481z4"
  },
  {
    "company": "Ethena Labs",
    "domain": "ethena.fi",
    "email": "Ethena-August@augustco.com",
    "title": "PR / Media Contact",
    "score": 91,
    "signal": "Guy Young, Founder & CEO of Ethena, is confirmed as a KBW 2026 speaker.",
    "source": "https://koreablockchainweek.com/speakers",
    "contactSource": "https://www.businesswire.com/news/home/20250723966873/en/"
  }
];

  const rootDomain = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split(':')[0];

  const readJson = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };

  const cachedSentDomains = () => {
    const raw = readJson(SENT_CACHE_KEY, []);
    const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.domains) ? raw.domains : []);
    return new Set(list.map(rootDomain).filter(Boolean));
  };

  const liveSentDomains = async () => {
    const cached = cachedSentDomains();
    try {
      const response = await fetch(`${SENT_ENDPOINT}&t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!response.ok) return cached;
      const data = await response.json();
      const list = Array.isArray(data) ? data : (Array.isArray(data?.domains) ? data.domains : []);
      if (!list.length) return cached;
      const normalized = [...new Set(list.map(rootDomain).filter(Boolean))];
      try { localStorage.setItem(SENT_CACHE_KEY, JSON.stringify(normalized)); } catch {}
      return new Set(normalized);
    } catch {
      return cached;
    }
  };

  const makeLead = (row) => {
    const now = new Date().toISOString();
    const email = row.email.toLowerCase();
    const contact = {
      name: '',
      title: row.title || 'Public contact',
      email,
      confidence: row.score >= 97 ? 0.98 : row.score >= 94 ? 0.95 : 0.90,
      provider: 'manual_research+official_web',
      status: 'valid',
      verifiedAt: '2026-08-11',
      source: row.contactSource,
      sourceUrl: row.contactSource
    };
    const greeting = `Hi ${row.company} team,`;
    const subject = `KBW Seoul merch support for ${row.company}`;
    const message = `${greeting}\n\nI saw that ${row.company} is active around Korea Blockchain Week. If your team is planning branded T-shirts, hoodies, caps, or staff wear in Seoul, NYF can produce locally and deliver directly to your hotel, office, or venue — useful when overseas shipping timelines are tight.\n\nHappy to send 2–3 options with pricing and turnaround times.\n\nBest,\nLeo Park\nNYF · Custom apparel produced in Seoul`;

    return {
      id: `kbw-fresh31:${rootDomain(row.domain)}`,
      campaign: 'kbw',
      company: row.company,
      domain: rootDomain(row.domain),
      url: `https://${rootDomain(row.domain)}`,
      source_url: row.source,
      source_title: row.signal,
      published_date: '2026-08-11',
      signal: row.signal,
      evidence: row.signal,
      evidence_url: row.source,
      score: row.score,
      sales_priority: row.score,
      win_score: row.score,
      win_label: row.score >= 97 ? 'A' : row.score >= 94 ? 'A-' : 'B+',
      opportunity_lane: row.signal.includes('KBW 2026') ? 'KBW 2026 confirmed speaker' : 'KBW side-event / sponsor',
      reachability: row.title,
      kbw_status: row.signal.includes('KBW 2026') ? '2026 confirmed' : '2025 proven',
      outreach_language: 'en',
      verified_company: true,
      verified_by: 'manual-research+official-web+kbw-evidence',
      batch: BATCH,
      quality_reasons: [
        row.signal,
        `Public email verified from: ${row.contactSource}`,
        'Excluded from the existing hardcoded KBW lead batches before insertion.'
      ],
      contacts: [contact],
      contact,
      email,
      subject,
      greeting,
      message,
      created_at: now,
      updated_at: now
    };
  };

  const inject = async () => {
    if (typeof state === 'undefined' || typeof mergeLeads !== 'function') return;

    const existingDomains = new Set((state.leads || []).map((lead) => rootDomain(lead?.domain || lead?.url)).filter(Boolean));
    const existingCompanies = new Set((state.leads || []).map((lead) => String(lead?.company || '').trim().toLowerCase()).filter(Boolean));
    const rejectedDomains = new Set([...(state.rejected || [])].map(rootDomain).filter(Boolean));
    const deletedDomains = new Set(readJson(DELETED_KEY, []).map(rootDomain).filter(Boolean));
    const sentDomains = await liveSentDomains();

    const fresh = [];
    for (const row of ROWS) {
      const domain = rootDomain(row.domain);
      const companyKey = String(row.company || '').trim().toLowerCase();
      if (!domain || !row.email) continue;
      if (existingDomains.has(domain) || existingCompanies.has(companyKey)) continue;
      if (rejectedDomains.has(domain) || deletedDomains.has(domain) || sentDomains.has(domain)) continue;
      fresh.push(makeLead(row));
      existingDomains.add(domain);
      existingCompanies.add(companyKey);
    }

    if (fresh.length) {
      mergeLeads(fresh);
      if (typeof render === 'function') render();
      if (typeof refreshCounts === 'function') refreshCounts();
    }

    window.KBWFresh31 = {
      batch: BATCH,
      researched: ROWS.length,
      inserted: fresh.length,
      skipped: ROWS.length - fresh.length,
      companies: ROWS.map((row) => row.company)
    };
    console.info(`[KBW fresh31] inserted ${fresh.length} / ${ROWS.length} researched leads`);
  };

  const run = () => void inject();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();
