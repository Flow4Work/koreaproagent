import { tavilyConfigured, tavilySearch, tavilySearchMany, formatEvidence } from '../lib/web-search.js';
import { AI_MODEL, AI_PROVIDER, aiConfigured, chatJson } from '../lib/ai-provider.js';

const HUNTER_DOMAIN_URL = 'https://api.hunter.io/v2/domain-search';

const DISCOVERY_EXCLUDES = [
  'instagram.com','facebook.com','x.com','twitter.com','youtube.com','reddit.com','pinterest.com',
  'medium.com','crunchbase.com','glassdoor.com','quora.com','wikipedia.org','g2.com','capterra.com'
];
const COMPANY_URL_BLOCKLIST = [
  ...DISCOVERY_EXCLUDES,'linkedin.com','techcrunch.com','reuters.com','prnewswire.com','businesswire.com',
  'forbes.com','bloomberg.com','yahoo.com'
];

// This product is for a small Korea market-test offer, not enterprise procurement against giant incumbents.
const MATURE_COMPANIES = [
  'microsoft','google','amazon','aws','oracle','salesforce','adobe','sap','servicenow','workday','shopify',
  'atlassian','zoom','slack','notion','hubspot','intercom','stripe','adyen','nuvei','airwallex','dlocal',
  'twilio','cloudflare','datadog','snowflake','mongodb','gitlab','github','elastic','databricks','canva',
  'fiverr','rippling','brex','plaid','monday.com','openai','anthropic','cohere'
];

const DISCOVERY_TOPICS = [
  'developer tools API observability data infrastructure B2B SaaS',
  'cybersecurity identity compliance B2B SaaS',
  'AI workflow customer support automation B2B SaaS',
  'fintech treasury expense finance operations B2B software',
  'sales revenue intelligence CRM B2B SaaS',
  'HR recruiting workforce operations B2B SaaS',
  'logistics procurement supply chain B2B software',
  'FinOps DevOps cloud automation SaaS',
  'retail commerce operations B2B SaaS',
  'marketing customer data automation B2B SaaS'
];

const TRIGGER = /(series\s+[abc]|seed|funding|raised|raises|investment|expand|expansion|launch|hiring|hire|sales|partnership|international|apac|asia|japan|singapore|australia|hong kong|taiwan|go-to-market|gtm)/i;
const ASIA_SIGNAL = /(apac|asia|japan|singapore|australia|hong kong|taiwan|southeast asia)/i;
const GTM_SIGNAL = /(sales|partnership|partner|channel|hiring|hire|launch|go-to-market|gtm|expansion|expand|international)/i;
const FUNDING_SIGNAL = /(series\s+[abc]|seed|funding|raised|raises|investment|venture|round)/i;
const STAGE_SIGNAL = /(seed|series\s+[abc]|startup|scale[- ]?up|venture-backed|growth-stage)/i;
const SOFTWARE_SIGNAL = /(saas|software|platform|workflow|automation|analytics|crm|api|developer|cybersecurity|fintech|martech|hrtech|cloud|b2b|enterprise)/i;
const TOO_MATURE = /(fortune\s*500|nasdaq|nyse|publicly traded|listed company|global workforce|more than [\d,]{4} employees|over [\d,]{4} employees|tens of thousands of employees)/i;
const TECHNICAL_ROLE = /(cto|chief technology|engineering|engineer|developer|technical|product|research|scientist|data science|machine learning)/i;
const GTM_ROLE = /(sales|business development|partnership|alliances|growth|revenue|commercial|go-to-market|gtm|market expansion|international|apac|asia|country manager)/i;

function clean(v, max = 1400) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function safeError(v = '') {
  return String(v).replace(/tvly-[A-Za-z0-9_-]+/g, '[redacted]').replace(/[A-Za-z0-9_-]{32,}/g, '[key]').slice(0, 700);
}
function hostname(v = '') { try { return new URL(v).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } }
function rootHost(v = '') { const h = hostname(v), p = h.split('.'); return p.length > 2 ? p.slice(-2).join('.') : h; }
function token(v = '') { return String(v).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function escapeRegExp(v = '') { return String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function evidenceText(rows = []) { return rows.map(r => `${r?.title || ''} ${r?.content || ''}`).join(' '); }

function matureCompany(company = '') {
  const c = token(company);
  return MATURE_COMPANIES.some(x => c === token(x) || c.startsWith(token(x)));
}
function excludedCompany(company = '', excludeCompanies = []) {
  const c = token(company);
  return Boolean(c) && excludeCompanies.some(x => {
    const e = token(x);
    return e && (c === e || c.startsWith(e) || e.startsWith(c));
  });
}
function blockedCompanyUrl(url) {
  const h = rootHost(url);
  return !h || COMPANY_URL_BLOCKLIST.some(x => h === x || h.endsWith(`.${x}`));
}
function looksLikeCompanyHost(url, company) {
  if (!url || blockedCompanyUrl(url)) return false;
  const h = token(rootHost(url).split('.')[0]), c = token(company);
  return h.length >= 2 && c.length >= 2 && (c.includes(h) || h.includes(c.slice(0, Math.min(c.length, 10))));
}
function companySignalContext(row, company) {
  const title = String(row?.title || '');
  const content = String(row?.content || '');
  const pattern = new RegExp(escapeRegExp(company), 'i');
  const text = `${title} ${content}`;
  if (!pattern.test(text) || !TRIGGER.test(text)) return '';
  const lower = content.toLowerCase();
  const needle = String(company || '').toLowerCase();
  const index = lower.indexOf(needle);
  if (index < 0) return clean(title || content, 240);
  const window = content.slice(Math.max(0, index - 180), Math.min(content.length, index + needle.length + 300));
  return TRIGGER.test(window) ? clean(window.replace(/\s+/g, ' '), 240) : clean(title, 240);
}
function candidateEvidence(company, sources) {
  return sources
    .map(row => ({ row, signal: companySignalContext(row, company) }))
    .filter(x => x.signal)
    .slice(0, 5);
}
function explicitKoreaPresence(text = '') {
  const s = String(text).toLowerCase();
  return [
    /korea\s+(office|team|country manager|general manager|head|sales team|subsidiary|operations|entity)/,
    /(office|team|subsidiary|operations|entity)\s+(in|for)\s+(south\s+)?korea/,
    /seoul\s+(office|team|hub|based|role|roles|jobs|location)/,
    /(country manager|head of|general manager)[^.!?]{0,50}(korea|seoul)/,
    /(korea|korean)[^.!?]{0,60}(subsidiary|entity|office|team|country manager|sales team)/
  ].some(r => r.test(s));
}
function pickOfficialUrl(company, hint, rows) {
  if (looksLikeCompanyHost(hint, company)) return `https://${rootHost(hint)}/`;
  const hit = rows.find(r => looksLikeCompanyHost(r.url, company));
  return hit ? `https://${rootHost(hit.url)}/` : '';
}
function scoreCandidate(matched, verifyRows) {
  const text = evidenceText([...matched.map(x => x.row), ...verifyRows]);
  if (!ASIA_SIGNAL.test(text)) return 0;
  if (!GTM_SIGNAL.test(text) && !FUNDING_SIGNAL.test(text)) return 0;
  if (TOO_MATURE.test(text)) return 0;
  let score = 25;
  score += 25; // explicit Asia/APAC signal is a hard gate
  if (GTM_SIGNAL.test(text)) score += 18;
  if (FUNDING_SIGNAL.test(text)) score += 12;
  if (STAGE_SIGNAL.test(text)) score += 10;
  score += Math.min(10, matched.length * 3);
  return Math.min(100, score);
}
function roleMatchScore(position = '', recommendedRole = '') {
  const p = String(position).toLowerCase();
  const target = String(recommendedRole).toLowerCase();
  let score = 0;
  if (GTM_ROLE.test(p)) score += 50;
  if (/head|director|vp|vice president|chief commercial|chief revenue|general manager/.test(p)) score += 24;
  if (/founder|co-founder|ceo|chief executive/.test(p)) score += 10;
  if (target && p.includes(target)) score += 16;
  if (TECHNICAL_ROLE.test(p)) score -= 70;
  return score;
}

function hashSeed(v = '') {
  let h = 0;
  for (const ch of String(v)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
function pickDiscoveryTopics(seed, count = 3) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(DISCOVERY_TOPICS[(seed + i * 3) % DISCOVERY_TOPICS.length]);
  return [...new Set(out)];
}

async function discoverEvidence(focus, searchVariant) {
  const f = clean(focus, 500);
  const seed = hashSeed(searchVariant || new Date().toISOString().slice(0, 13));
  const themes = f ? [f, ...pickDiscoveryTopics(seed, 2)] : pickDiscoveryTopics(seed, 3);
  const suffixes = [
    'APAC Japan Singapore expansion hiring partnership Series A Series B 2026',
    'Asia go-to-market sales hiring expansion funding B2B SaaS 2026',
    'Japan Singapore market expansion partnership venture-backed SaaS 2026'
  ];
  const queries = themes.map((theme, i) => `${theme} ${suffixes[i]}`);
  const r = await tavilySearchMany(queries, {
    maxResults: 10,
    timeRange: 'year',
    excludeDomains: DISCOVERY_EXCLUDES,
    topic: 'general'
  });
  const sources = r.results.slice(0, 28);
  if (!sources.length) throw new Error('최근 APAC 확장 신호를 찾지 못했습니다.');
  return { evidence: formatEvidence(sources, 28, 12000), sources, meta: { ...r.meta, themes, search_results: sources.length } };
}

async function shortlist(evidence, focus, excludeCompanies = []) {
  const exclusions = excludeCompanies.length ? excludeCompanies.slice(0, 50).join(', ') : '없음';
  const prompt = `SOURCE만 사용해서 한국 시장 테스트 서비스를 살 가능성이 있는 해외 B2B 소프트웨어 회사만 최대 8곳 고른다.

우리 ICP:
- B2B SaaS / enterprise software / API / 업무용 플랫폼
- 최근 12개월 내 APAC·Asia·Japan·Singapore 중 하나에 실제 확장 신호가 반드시 있음
- 영업채용, 파트너십, GTM, 투자, 시장진입 같은 타이밍 신호가 있음
- 아직 한국 로컬 영업조직이 뚜렷하지 않아, 한국 잠재고객을 먼저 검증하는 작은 파일럿을 살 이유가 있음
- Seed~Series C 또는 성장 단계 회사 우선. 이미 거대한 글로벌 플랫폼은 제외

반드시 제외:
- 한국 회사
- Microsoft/Google/Salesforce/Stripe/Nuvei 같은 성숙 대형사
- 소비자 앱, 미디어, 게임, 하드웨어, 연구소, 컨설팅, 채용대행
- APAC/Asia/Japan/Singapore 신호 없이 그냥 'global' 또는 투자만 나온 회사
- 회사명이 SOURCE에 직접 등장하지 않는 회사
- 최근 화면에 나온 회사: ${exclusions}

사용자 조건: ${clean(focus, 500) || '없음'}

규칙:
1) 근거 없는 회사명, 직원수, 고객사, 한국 진출 여부를 만들지 않는다.
2) source_urls는 해당 회사와 성장 신호를 직접 언급한 SOURCE만 넣는다.
3) product_summary는 SOURCE에서 확인 가능한 제품만 한 문장으로 쓴다.
4) trigger_summary는 왜 지금 연락해야 하는지 한 문장으로 쓴다.
5) recommended_role은 Head/VP/Director급 Sales, BD, Partnerships, APAC, International, Growth 중 선택한다. 기술직은 금지.
6) 애매하면 넣지 않는다. 8개를 채우지 않아도 된다.

JSON만 반환:
{"candidates":[{"company":"","official_url_hint":"","product_summary":"","trigger_summary":"","trigger_date":"","source_urls":[],"recommended_role":""}]}

${evidence}`;
  const structured = await chatJson({ prompt, maxTokens: 1700, timeoutMs: 35000, temperature: 0 });
  const candidates = Array.isArray(structured.data?.candidates) ? structured.data.candidates : [];
  return { candidates: candidates.slice(0, 8), usage: structured.usage || null, model: structured.model || AI_MODEL };
}

async function verifyCandidate(candidate, discoverySources, excludeCompanies = []) {
  const company = clean(candidate?.company, 120);
  if (!company || matureCompany(company) || excludedCompany(company, excludeCompanies)) return null;

  const matched = candidateEvidence(company, discoverySources);
  if (!matched.length) return null;
  const matchedText = evidenceText(matched.map(x => x.row));
  if (!ASIA_SIGNAL.test(matchedText)) return null;
  if (!SOFTWARE_SIGNAL.test(matchedText) && !clean(candidate?.product_summary, 300)) return null;

  const verification = await tavilySearchMany([
    `"${company}" official SaaS software platform customers APAC Japan Singapore 2026`,
    `"${company}" Korea Seoul office team country manager sales subsidiary 2026`
  ], {
    maxResults: 7,
    timeRange: 'year',
    excludeDomains: ['instagram.com','facebook.com','x.com','twitter.com','youtube.com','reddit.com','pinterest.com'],
    topic: 'general'
  });
  const rows = verification.results || [];
  const officialUrl = pickOfficialUrl(company, candidate?.official_url_hint, rows);
  if (!officialUrl) return null;

  const combinedText = evidenceText([...matched.map(x => x.row), ...rows]);
  if (TOO_MATURE.test(combinedText)) return null;
  const koreaRows = rows.filter(row => /korea|seoul|한국|서울/i.test(`${row.title} ${row.content}`));
  if (koreaRows.some(row => explicitKoreaPresence(`${row.title} ${row.content}`))) return null;

  const priority = scoreCandidate(matched, rows);
  if (priority < 70) return null;

  const evidence = [...matched.map(x => x.row), ...rows.filter(x => ASIA_SIGNAL.test(`${x.title} ${x.content}`))]
    .filter((x, i, arr) => /^https?:\/\//i.test(x?.url || '') && arr.findIndex(y => y.url === x.url) === i)
    .slice(0, 4)
    .map(x => ({ title: clean(x.title, 220), url: clean(x.url, 500), date: clean(x.published_date, 60) }));
  if (!evidence.length) return null;

  const role = clean(candidate?.recommended_role, 90) || 'Head of Sales';
  const signal = clean(candidate?.trigger_summary, 260) || clean(matched[0]?.signal, 260);
  const product = clean(candidate?.product_summary, 320) || 'B2B software';

  return {
    company,
    url: officialUrl,
    product_summary: product,
    priority_score: priority,
    signal_title: signal,
    signal_date: clean(candidate?.trigger_date, 60),
    why_now: signal,
    korea_gap: '최근 APAC 확장 신호는 확인됐지만 한국 로컬 영업팀·지사·Country Manager는 공개 근거에서 확인되지 않았습니다.',
    fit_reason: '한국 조직을 만들기 전에 실제 한국 계정과 담당자 반응을 작게 검증하는 파일럿이 맞는 단계입니다.',
    evidence,
    source_urls: evidence.map(x => x.url),
    recommended_role: role
  };
}

async function findHunterContact(company, url, recommendedRole) {
  if (!process.env.HUNTER_API_KEY) return { status: 'not_configured', contact: null };
  const domain = rootHost(url);
  if (!domain) return { status: 'no_domain', contact: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const endpoint = `${HUNTER_DOMAIN_URL}?domain=${encodeURIComponent(domain)}&limit=10`;
    const response = await fetch(endpoint, {
      headers: { 'X-API-KEY': process.env.HUNTER_API_KEY },
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!response.ok) return { status: `http_${response.status}`, contact: null };
    const payload = await response.json();
    const emails = Array.isArray(payload?.data?.emails) ? payload.data.emails : [];
    const ranked = emails
      .filter(x => x?.value && (x?.type === 'personal' || x?.first_name || x?.last_name))
      .map(x => ({
        raw: x,
        score: roleMatchScore(x?.position, recommendedRole) + Math.min(25, (Number(x?.confidence) || 0) / 4)
      }))
      .filter(x => (Number(x.raw?.confidence) || 0) >= 60)
      .sort((a, b) => b.score - a.score);
    const bestEntry = ranked[0];
    if (!bestEntry || bestEntry.score < 35) return { status: 'not_found', contact: null };
    const best = bestEntry.raw;
    return {
      status: 'found',
      contact: {
        name: clean([best.first_name, best.last_name].filter(Boolean).join(' '), 120),
        title: clean(best.position, 140),
        email: clean(best.value, 240),
        confidence: Math.max(0, Math.min(100, Number(best.confidence) || 0)),
        linkedin_url: clean(best.linkedin_url || best.linkedin, 500)
      }
    };
  } catch (e) {
    return { status: e?.name === 'AbortError' ? 'timeout' : 'error', contact: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request) {
  if (!aiConfigured()) return Response.json({ error: 'OPENCODE_ZEN_API_KEY가 필요합니다.' }, { status: 503 });
  if (!tavilyConfigured()) return Response.json({ error: 'TAVILY_API_KEY가 필요합니다.' }, { status: 503 });

  let body = {};
  try { body = await request.json(); }
  catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }

  const focus = clean(body.focus, 500);
  const searchVariant = clean(body.searchVariant, 120);
  const excludeCompanies = Array.isArray(body.excludeCompanies)
    ? body.excludeCompanies.map(x => clean(String(x), 120)).filter(Boolean).slice(0, 80)
    : [];

  try {
    const discovery = await discoverEvidence(focus, searchVariant);
    const short = await shortlist(discovery.evidence, focus, excludeCompanies);
    const candidates = short.candidates.filter(x => !excludedCompany(x?.company, excludeCompanies));

    const verified = [];
    for (const candidate of candidates) {
      try {
        const v = await verifyCandidate(candidate, discovery.sources, excludeCompanies);
        if (v && !verified.some(x => token(x.company) === token(v.company))) verified.push(v);
      } catch {}
      if (verified.length >= 5) break;
    }
    verified.sort((a, b) => b.priority_score - a.priority_score);

    const leads = [];
    for (const lead of verified) {
      const hunter = await findHunterContact(lead.company, lead.url, lead.recommended_role);
      if (!hunter.contact?.email) continue;
      leads.push({ ...lead, contact: hunter.contact, contact_status: hunter.status });
      if (leads.length >= 3) break;
    }

    return Response.json({
      leads: leads.map((x, i) => ({ ...x, rank: i + 1 })),
      meta: {
        search: discovery.meta,
        ai_provider: AI_PROVIDER,
        model: short.model || AI_MODEL,
        considered: candidates.length,
        verified: verified.length,
        ready: leads.length,
        policy: 'Asia signal + Korea gap + GTM timing + verified GTM email'
      }
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({
      error: safeError(e?.message || e),
      hint: e?.status === 429 ? 'OpenCode Zen 사용량 제한입니다. 잠시 후 다시 실행하세요.' : '고품질 후보 검증 과정에서 오류가 발생했습니다.'
    }, { status: e?.status || 502 });
  }
}
