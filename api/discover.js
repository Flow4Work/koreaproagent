import { tavilyConfigured, tavilySearch, tavilySearchMany, formatEvidence } from '../lib/web-search.js';
import { AI_MODEL, AI_PROVIDER, aiConfigured, chatJson } from '../lib/ai-provider.js';
import { findContacts, normalizeContacts } from '../lib/contact-discovery.js';

const DISCOVERY_EXCLUDES = [
  'instagram.com','facebook.com','x.com','twitter.com','youtube.com','reddit.com','pinterest.com',
  'medium.com','crunchbase.com','glassdoor.com','quora.com','wikipedia.org','g2.com','capterra.com'
];
const COMPANY_URL_BLOCKLIST = [
  ...DISCOVERY_EXCLUDES,'linkedin.com','techcrunch.com','reuters.com','prnewswire.com','businesswire.com',
  'forbes.com','bloomberg.com','yahoo.com'
];
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
  'marketing customer data automation B2B SaaS',
  'hospitality travel property management B2B SaaS',
  'legal contract RegTech B2B SaaS'
];

const TRIGGER = /(series\s+[abc]|seed|funding|raised|raises|investment|expand|expansion|launch|hiring|hire|sales|partnership|international|apac|asia|japan|singapore|australia|hong kong|taiwan|go-to-market|gtm)/i;
const ASIA_SIGNAL = /(apac|asia|japan|singapore|australia|hong kong|taiwan|southeast asia)/i;
const GTM_SIGNAL = /(sales|partnership|partner|channel|hiring|hire|launch|go-to-market|gtm|expansion|expand|international)/i;
const FUNDING_SIGNAL = /(series\s+[abc]|seed|funding|raised|raises|investment|venture|round)/i;
const SOFTWARE_SIGNAL = /(saas|software|platform|workflow|automation|analytics|crm|api|developer|cybersecurity|fintech|martech|hrtech|cloud|b2b|enterprise)/i;

function clean(value, max = 1400) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function safeError(value = '') {
  return String(value).replace(/tvly-[A-Za-z0-9_-]+/g, '[redacted]').replace(/[A-Za-z0-9_-]{32,}/g, '[key]').slice(0, 700);
}
function hostname(value = '') {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}
function rootHost(value = '') {
  const host = hostname(value), parts = host.split('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : host;
}
function token(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}
function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function matureCompany(company = '') {
  const value = token(company);
  return MATURE_COMPANIES.some(name => value === token(name) || value.startsWith(token(name)));
}
function excludedCompany(company = '', excludes = []) {
  const value = token(company);
  return Boolean(value) && excludes.some(name => {
    const other = token(name);
    return other && (value === other || value.startsWith(other) || other.startsWith(value));
  });
}
function blockedCompanyUrl(url) {
  const host = rootHost(url);
  return !host || COMPANY_URL_BLOCKLIST.some(domain => host === domain || host.endsWith(`.${domain}`));
}
function looksLikeCompanyHost(url, company) {
  if (!url || blockedCompanyUrl(url)) return false;
  const host = token(rootHost(url).split('.')[0]);
  const name = token(company);
  return host.length >= 2 && name.length >= 2 && (name.includes(host) || host.includes(name.slice(0, Math.min(name.length, 10))));
}
function explicitKoreaPresence(text = '') {
  const value = String(text).toLowerCase();
  return [
    /korea\s+(office|team|country manager|general manager|head|sales team|subsidiary|operations|entity)/,
    /(office|team|subsidiary|operations|entity)\s+(in|for)\s+(south\s+)?korea/,
    /seoul\s+(office|team|hub|based|role|roles|jobs|location)/,
    /(country manager|head of|general manager)[^.!?]{0,50}(korea|seoul)/,
    /(korea|korean)[^.!?]{0,60}(subsidiary|entity|office|team|country manager|sales team)/
  ].some(pattern => pattern.test(value));
}
function hashSeed(value = '') {
  let hash = 0;
  for (const char of String(value)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}
function pickTopics(seed, count = 3) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(DISCOVERY_TOPICS[(seed + i * 5) % DISCOVERY_TOPICS.length]);
  return [...new Set(out)];
}
function companyEvidence(company, sources = []) {
  const pattern = new RegExp(escapeRegExp(company), 'i');
  return sources.filter(row => {
    const text = `${row?.title || ''} ${row?.content || ''}`;
    return pattern.test(text) && TRIGGER.test(text);
  }).slice(0, 4);
}
function scoreSignal(rows = []) {
  const text = rows.map(row => `${row?.title || ''} ${row?.content || ''}`).join(' ');
  let score = 35;
  if (ASIA_SIGNAL.test(text)) score += 28;
  else if (/(international|global)/i.test(text)) score += 12;
  if (GTM_SIGNAL.test(text)) score += 18;
  if (FUNDING_SIGNAL.test(text)) score += 12;
  return Math.min(100, score);
}

async function discoverEvidence(focus, searchVariant) {
  const seed = hashSeed(searchVariant || new Date().toISOString().slice(0, 13));
  const base = clean(focus, 500);
  const topics = base ? [base, ...pickTopics(seed, 2)] : pickTopics(seed, 3);
  const suffixes = [
    'APAC Japan Singapore expansion hiring partnership Series A Series B 2026',
    'Asia go-to-market sales hiring expansion funding B2B SaaS 2026',
    'Japan Singapore market expansion partnership venture-backed SaaS 2026'
  ];
  const queries = topics.map((topic, index) => `${topic} ${suffixes[index % suffixes.length]}`);
  const result = await tavilySearchMany(queries, {
    maxResults: 11,
    timeRange: 'year',
    excludeDomains: DISCOVERY_EXCLUDES,
    topic: 'general'
  });
  const sources = result.results.slice(0, 32);
  if (!sources.length) throw new Error('최근 해외 확장 신호를 찾지 못했습니다.');
  return { sources, evidence: formatEvidence(sources, 32, 13000), meta: { ...result.meta, themes: topics, search_results: sources.length } };
}

async function shortlist(evidence, focus, excludeCompanies) {
  const excluded = excludeCompanies.length ? excludeCompanies.slice(0, 60).join(', ') : '없음';
  const prompt = `SOURCE만 사용해서 한국 시장 테스트/아웃바운드 서비스를 제안할 해외 B2B 소프트웨어 회사를 최대 10곳 고른다.

필수 조건:
- B2B SaaS, enterprise software, API, 업무용 플랫폼
- 최근 12개월 내 APAC/Asia/Japan/Singapore/Australia 확장 또는 국제 GTM 신호
- 영업채용, 파트너십, 투자, 시장진입 등 지금 연락할 이유가 있음
- 한국 현지 조직이 이미 성숙한 대기업은 제외
- 소비자 앱, 미디어, 게임, 하드웨어, 연구소, 컨설팅, 채용대행 제외
- 최근 화면에 나온 회사 제외: ${excluded}
- 사용자 조건: ${clean(focus, 500) || '없음'}

절대 규칙:
1. 회사명과 성장 신호가 SOURCE에 직접 있어야 한다.
2. source_urls는 해당 회사를 직접 언급한 URL만 넣는다.
3. official_url_hint는 확실할 때만 넣고 아니면 빈 문자열.
4. product_summary와 trigger_summary는 SOURCE 밖 사실을 만들지 않는다.
5. recommended_role은 Sales/BD/Partnerships/Growth/APAC/International의 Head/VP/Director 우선, 필요하면 CEO/Founder.
6. 적합한 회사가 적으면 억지로 채우지 않는다.

JSON만 반환:
{"candidates":[{"company":"","official_url_hint":"","product_summary":"","trigger_summary":"","source_urls":[],"recommended_role":""}]}

${evidence}`;
  const structured = await chatJson({ prompt, maxTokens: 1800, timeoutMs: 35000, temperature: 0 });
  return {
    candidates: Array.isArray(structured.data?.candidates) ? structured.data.candidates.slice(0, 10) : [],
    usage: structured.usage || null,
    model: structured.model || AI_MODEL
  };
}

async function verifyCandidate(candidate, discoverySources, excludeCompanies) {
  const company = clean(candidate?.company, 120);
  if (!company || matureCompany(company) || excludedCompany(company, excludeCompanies)) return null;
  const evidence = companyEvidence(company, discoverySources);
  if (!evidence.length) return null;

  const verify = await tavilySearch(`"${company}" official website SaaS software platform customers Korea Seoul office team sales partnerships`, {
    maxResults: 9,
    timeRange: null,
    excludeDomains: DISCOVERY_EXCLUDES,
    topic: 'general'
  });
  const rows = verify.results || [];
  const official = looksLikeCompanyHost(candidate?.official_url_hint, company)
    ? `https://${rootHost(candidate.official_url_hint)}/`
    : (() => {
        const hit = rows.find(row => looksLikeCompanyHost(row.url, company));
        return hit ? `https://${rootHost(hit.url)}/` : '';
      })();
  if (!official) return null;

  const combined = [...evidence, ...rows.slice(0, 6)];
  const text = combined.map(row => `${row?.title || ''} ${row?.content || ''}`).join(' ');
  if (!SOFTWARE_SIGNAL.test(text)) return null;
  if (rows.some(row => /korea|seoul|한국|서울/i.test(`${row.title} ${row.content}`) && explicitKoreaPresence(`${row.title} ${row.content}`))) return null;

  const recommendedRole = clean(candidate?.recommended_role, 100) || 'Head of Sales';
  const contactResult = await findContacts(official, { maxContacts: 8, recommendedRole });
  const contacts = normalizeContacts(contactResult?.emails || [], recommendedRole);
  const contact = contacts[0] || null;
  const signalTitle = clean(candidate?.trigger_summary, 220) || clean(evidence[0]?.title, 220) || '최근 해외 확장 신호 확인';

  return {
    company,
    url: official,
    priority_score: scoreSignal(evidence),
    product_summary: clean(candidate?.product_summary, 320),
    signal_title: signalTitle,
    why_now: signalTitle,
    why_buy_our_service: '최근 해외 확장 신호가 확인됐고 한국 현지 영업조직은 명확히 확인되지 않아 작은 한국 시장 테스트를 제안하기 좋은 후보입니다.',
    korea_opportunity: '한국 잠재고객과 구매 담당자를 먼저 검증해 현지 채용 전에 수요를 시험할 수 있습니다.',
    source_urls: evidence.map(row => row.url).filter(Boolean).slice(0, 4),
    evidence: evidence.map(row => ({ title: clean(row.title, 220), url: clean(row.url, 500) })),
    recommended_role: recommendedRole,
    contact_search_query: `"${company}" ("Head of APAC" OR "VP Sales" OR "Head of Sales" OR Partnerships OR "Business Development") LinkedIn`,
    contact,
    contact_status: contact ? 'found' : 'not_found',
    contact_provider: contactResult?.provider || null,
    contact_attempts: contactResult?.attempts || []
  };
}

function baseOutreach(lead) {
  const first = clean(lead?.contact?.name, 80).split(/\s+/)[0];
  const hello = first ? `Hi ${first},` : 'Hi,';
  return `${hello}\n\nI noticed ${lead.company}'s recent move: ${clean(lead.signal_title, 170)}.\n\nI work on small Korea market tests for overseas B2B software companies. I can map a few Korean accounts, likely buyer roles, and the public signals behind each before you commit local headcount.\n\nWorth seeing a small Korea sample?`;
}

export async function POST(request) {
  if (!aiConfigured()) return Response.json({ error: 'AI 설정이 필요합니다.' }, { status: 503 });
  if (!tavilyConfigured()) return Response.json({ error: '검색 엔진 설정이 필요합니다.' }, { status: 503 });

  let body = {};
  try { body = await request.json(); }
  catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }

  const focus = clean(body.focus, 600);
  const searchVariant = clean(body.searchVariant, 120);
  const excludeCompanies = Array.isArray(body.excludeCompanies)
    ? body.excludeCompanies.map(value => clean(String(value), 120)).filter(Boolean).slice(0, 80)
    : [];

  try {
    const discovery = await discoverEvidence(focus, searchVariant);
    const short = await shortlist(discovery.evidence, focus, excludeCompanies);
    const candidates = short.candidates.filter(candidate => !excludedCompany(candidate?.company, excludeCompanies));

    const leads = [];
    for (const candidate of candidates) {
      try {
        const lead = await verifyCandidate(candidate, discovery.sources, excludeCompanies);
        if (!lead || leads.some(existing => token(existing.company) === token(lead.company))) continue;
        lead.outreach_en = baseOutreach(lead);
        lead.outreach_ko = `${lead.company}의 최근 해외 확장 신호를 근거로 한국 시장 테스트를 제안합니다.`;
        leads.push(lead);
      } catch { }
      if (leads.length >= 6) break;
    }

    leads.sort((a, b) => {
      const emailDelta = Number(Boolean(b.contact?.email)) - Number(Boolean(a.contact?.email));
      return emailDelta || b.priority_score - a.priority_score;
    });
    leads.forEach((lead, index) => { lead.rank = index + 1; });

    return Response.json({
      leads,
      strategy: {
        next_action: leads.some(lead => lead.contact?.email)
          ? '이메일이 확인된 후보는 바로 샘플 생성으로 넘기고, 나머지는 회사·근거를 보존합니다.'
          : '담당자 이메일이 없어도 검증된 회사와 근거를 버리지 않고 다음 연락처 탐색 대상으로 보존합니다.'
      },
      meta: {
        search: discovery.meta,
        ai_provider: AI_PROVIDER,
        structure_model: short.model || AI_MODEL,
        structure_usage: short.usage,
        returned_count: leads.length,
        email_count: leads.filter(lead => lead.contact?.email).length,
        excluded_recent_count: excludeCompanies.length,
        pipeline: '웹 후보 탐색 → AI 후보 정리 → 공식/B2B/한국조직 검증 → 공개 웹 → Prospeo → Apollo → Tomba 연락처 탐색'
      }
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({
      error: safeError(error?.message || error),
      hint: error?.status === 429 ? '사용량 제한입니다. 잠시 후 다시 시도하세요.' : '고객 발굴 과정에서 오류가 발생했습니다.'
    }, { status: error?.status || 502 });
  }
}
