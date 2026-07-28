import { tavilyConfigured, tavilySearch, tavilySearchMany, formatEvidence } from '../lib/web-search.js';
import { AI_MODEL, AI_PROVIDER, aiConfigured, chatJson } from '../lib/ai-provider.js';

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

function clean(value, max = 1400) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function safeError(value = '') { return String(value).replace(/tvly-[A-Za-z0-9_-]+/g, '[redacted]').replace(/[A-Za-z0-9_-]{32,}/g, '[key]').slice(0, 700); }
function hostname(value = '') { try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } }
function rootHost(value = '') { const host = hostname(value), parts = host.split('.'); return parts.length > 2 ? parts.slice(-2).join('.') : host; }
function token(value = '') { return String(value).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function escapeRegExp(value = '') { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function matureCompany(company = '') { const value = token(company); return MATURE_COMPANIES.some(name => value === token(name) || value.startsWith(token(name))); }
function excludedCompany(company = '', excludes = []) {
  const value = token(company);
  return Boolean(value) && excludes.some(name => { const other = token(name); return other && (value === other || value.startsWith(other) || other.startsWith(value)); });
}
function blockedCompanyUrl(url) {
  const host = rootHost(url);
  return !host || COMPANY_URL_BLOCKLIST.some(domain => host === domain || host.endsWith(`.${domain}`));
}
function looksLikeCompanyHost(url, company) {
  if (!url || blockedCompanyUrl(url)) return false;
  const host = token(rootHost(url).split('.')[0]), name = token(company);
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
function hashSeed(value = '') { let hash = 0; for (const char of String(value)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return hash; }
function pickTopics(seed, count = 3) { const out = []; for (let i = 0; i < count; i++) out.push(DISCOVERY_TOPICS[(seed + i * 5) % DISCOVERY_TOPICS.length]); return [...new Set(out)]; }
function companyEvidence(company, sources = []) {
  const pattern = new RegExp(escapeRegExp(company), 'i');
  return sources.filter(row => { const text = `${row?.title || ''} ${row?.content || ''}`; return pattern.test(text) && TRIGGER.test(text); }).slice(0, 4);
}
function scoreSignal(rows = []) {
  const text = rows.map(row => `${row?.title || ''} ${row?.content || ''}`).join(' ');
  if (!ASIA_SIGNAL.test(text)) return 0;
  if (!GTM_SIGNAL.test(text) && !FUNDING_SIGNAL.test(text)) return 0;
  let score = 45;
  if (/japan|singapore|apac/i.test(text)) score += 18;
  else score += 12;
  if (GTM_SIGNAL.test(text)) score += 18;
  if (FUNDING_SIGNAL.test(text)) score += 10;
  score += Math.min(9, rows.length * 3);
  return Math.min(100, score);
}
async function mapConcurrent(items, limit, worker) {
  const output = new Array(items.length); let cursor = 0;
  async function run() { while (cursor < items.length) { const i = cursor++; try { output[i] = await worker(items[i], i); } catch { output[i] = null; } } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
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
  const result = await tavilySearchMany(queries, { maxResults: 12, timeRange: 'year', excludeDomains: DISCOVERY_EXCLUDES, topic: 'general' });
  const sources = result.results.slice(0, 36);
  if (!sources.length) throw new Error('최근 해외 확장 신호를 찾지 못했습니다.');
  return { sources, evidence: formatEvidence(sources, 36, 14500), meta: { ...result.meta, themes: topics, search_results: sources.length } };
}

async function shortlist(evidence, focus, excludeCompanies) {
  const excluded = excludeCompanies.length ? excludeCompanies.slice(0, 70).join(', ') : '없음';
  const prompt = `SOURCE만 사용해서 한국 시장 테스트/아웃바운드 서비스를 제안할 해외 B2B 소프트웨어 회사를 최대 12곳 고른다.

필수 조건:
- B2B SaaS, enterprise software, API, 업무용 플랫폼
- 최근 12개월 내 APAC/Asia/Japan/Singapore/Australia 확장 신호가 직접 확인됨
- 영업채용, 파트너십, 투자, 시장진입 등 지금 연락할 이유가 있음
- 한국 현지 조직이 이미 성숙한 회사는 제외
- 소비자 앱, 미디어, 게임, 하드웨어, 연구소, 컨설팅, 채용대행 제외
- 최근 화면에 나온 회사 제외: ${excluded}
- 사용자 조건: ${clean(focus, 500) || '없음'}

절대 규칙:
1. 회사명과 성장 신호가 SOURCE에 직접 있어야 한다.
2. source_urls는 해당 회사를 직접 언급한 URL만 넣는다.
3. official_url_hint는 확실할 때만 넣고 아니면 빈 문자열.
4. product_summary와 trigger_summary는 반드시 자연스러운 한국어로 작성한다. 회사명/제품 고유명사만 원문 허용.
5. recommended_role은 원문 영문 직책으로 Sales/BD/Partnerships/Growth/APAC/International의 Head/VP/Director 우선, 필요하면 CEO/Founder.
6. 단순 투자만 있고 아시아 확장 맥락이 없으면 넣지 않는다.
7. 적합한 회사가 적으면 억지로 채우지 않는다.

JSON만 반환:
{"candidates":[{"company":"","official_url_hint":"","product_summary":"한국어","trigger_summary":"한국어","source_urls":[],"recommended_role":""}]}

${evidence}`;
  const structured = await chatJson({ prompt, maxTokens: 1800, timeoutMs: 35000, temperature: 0 });
  return { candidates: Array.isArray(structured.data?.candidates) ? structured.data.candidates.slice(0, 12) : [], usage: structured.usage || null, model: structured.model || AI_MODEL };
}

async function verifyCandidate(candidate, discoverySources, excludeCompanies) {
  const company = clean(candidate?.company, 120);
  if (!company || matureCompany(company) || excludedCompany(company, excludeCompanies)) return null;
  const evidence = companyEvidence(company, discoverySources);
  if (!evidence.length) return null;
  const evidenceText = evidence.map(row => `${row.title || ''} ${row.content || ''}`).join(' ');
  if (!ASIA_SIGNAL.test(evidenceText)) return null;

  const verify = await tavilySearch(`"${company}" official website SaaS software platform customers Korea Seoul office team sales partnerships`, {
    maxResults: 9, timeRange: null, excludeDomains: DISCOVERY_EXCLUDES, topic: 'general'
  });
  const rows = verify.results || [];
  const official = looksLikeCompanyHost(candidate?.official_url_hint, company)
    ? `https://${rootHost(candidate.official_url_hint)}/`
    : (() => { const hit = rows.find(row => looksLikeCompanyHost(row.url, company)); return hit ? `https://${rootHost(hit.url)}/` : ''; })();
  if (!official) return null;

  const combined = [...evidence, ...rows.slice(0, 6)];
  const text = combined.map(row => `${row?.title || ''} ${row?.content || ''}`).join(' ');
  if (!SOFTWARE_SIGNAL.test(text)) return null;
  if (rows.some(row => /korea|seoul|한국|서울/i.test(`${row.title} ${row.content}`) && explicitKoreaPresence(`${row.title} ${row.content}`))) return null;
  const priority = scoreSignal(evidence);
  if (priority < 70) return null;

  const recommendedRole = clean(candidate?.recommended_role, 100) || 'Head of Sales';
  const signalTitle = clean(candidate?.trigger_summary, 240) || '최근 아시아 확장 및 GTM 신호가 확인됐습니다.';
  return {
    company,
    url: official,
    priority_score: priority,
    product_summary: clean(candidate?.product_summary, 320) || 'B2B 소프트웨어',
    signal_title: signalTitle,
    why_now: signalTitle,
    korea_gap: '아시아 확장 신호는 확인되지만 한국 로컬 영업조직이 이미 자리 잡았다는 공개 근거는 확인되지 않았습니다.',
    korea_opportunity: '현지 채용 전에 한국 잠재고객과 구매 담당자 반응을 작은 파일럿으로 검증할 수 있는 후보입니다.',
    source_urls: evidence.map(row => row.url).filter(Boolean).slice(0, 4),
    evidence: evidence.map(row => ({ title: clean(row.title, 220), url: clean(row.url, 500), date: clean(row.published_date, 60) })),
    recommended_role: recommendedRole,
    contact: null,
    contact_status: 'pending'
  };
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
    ? body.excludeCompanies.map(value => clean(String(value), 120)).filter(Boolean).slice(0, 100)
    : [];

  try {
    const discovery = await discoverEvidence(focus, searchVariant);
    const short = await shortlist(discovery.evidence, focus, excludeCompanies);
    const candidates = short.candidates.filter(candidate => !excludedCompany(candidate?.company, excludeCompanies));
    const checked = await mapConcurrent(candidates, 4, candidate => verifyCandidate(candidate, discovery.sources, excludeCompanies));
    const leads = checked.filter(Boolean).filter((lead, index, rows) => rows.findIndex(x => token(x.company) === token(lead.company)) === index);
    leads.sort((a, b) => b.priority_score - a.priority_score);
    const selected = leads.slice(0, 8).map((lead, index) => ({ ...lead, rank: index + 1 }));

    return Response.json({
      leads: selected,
      strategy: { next_action: '후보를 먼저 보여주고 연락처와 한국 잠재고객은 화면에서 병렬로 보강합니다.' },
      meta: {
        search: discovery.meta,
        ai_provider: AI_PROVIDER,
        structure_model: short.model || AI_MODEL,
        structure_usage: short.usage,
        considered: candidates.length,
        verified: leads.length,
        returned_count: selected.length,
        excluded_recent_count: excludeCompanies.length,
        pipeline: '병렬 웹 검색 → AI 후보 정리 → 병렬 공식/B2B/한국조직 검증 → 즉시 후보 표시 → 연락처/한국 계정 병렬 보강'
      }
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({
      error: safeError(error?.message || error),
      hint: error?.status === 429 ? '사용량 제한입니다. 잠시 후 다시 시도하세요.' : '고객 발굴 과정에서 오류가 발생했습니다.'
    }, { status: error?.status || 502 });
  }
}