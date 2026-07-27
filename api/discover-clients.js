import { tavilyConfigured, tavilySearch, tavilySearchMany, formatEvidence } from '../lib/web-search.js';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const STRUCTURE_MODEL = 'openai/gpt-oss-120b';
const DISCOVERY_EXCLUDES = [
  'instagram.com','facebook.com','x.com','twitter.com','youtube.com','reddit.com',
  'pinterest.com','medium.com','crunchbase.com','glassdoor.com'
];
const COMPANY_URL_BLOCKLIST = [
  ...DISCOVERY_EXCLUDES,'linkedin.com','techcrunch.com','reuters.com','prnewswire.com',
  'businesswire.com','forbes.com','bloomberg.com','yahoo.com'
];

function clean(v, max = 1400) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function safeError(v = '') { return String(v).replace(/gsk_[A-Za-z0-9_-]+/g, '[redacted]').replace(/tvly-[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 700); }
function hostname(v = '') { try { return new URL(v).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } }
function rootHost(v = '') { const h = hostname(v); const p = h.split('.'); return p.length > 2 ? p.slice(-2).join('.') : h; }
function token(v = '') { return String(v).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function blockedCompanyUrl(url) { const h = rootHost(url); return !h || COMPANY_URL_BLOCKLIST.some(x => h === x || h.endsWith(`.${x}`)); }
function looksLikeCompanyHost(url, company) {
  if (!url || blockedCompanyUrl(url)) return false;
  const hostToken = token(rootHost(url).split('.')[0]);
  const companyToken = token(company);
  if (hostToken.length < 2 || companyToken.length < 2) return false;
  return companyToken.includes(hostToken) || hostToken.includes(companyToken.slice(0, Math.min(companyToken.length, 10)));
}
function validUrls(v, limit = 5) { return Array.isArray(v) ? v.map(String).filter(x => /^https?:\/\//i.test(x)).slice(0, limit) : []; }
function koreanEnough(v = '') { return (String(v).match(/[가-힣]/g) || []).length >= 10; }
function dedupe(arr) { return [...new Set(arr.filter(Boolean))]; }

async function discoverEvidence(focus) {
  if (!tavilyConfigured()) throw new Error('TAVILY_API_KEY가 필요합니다.');
  const userFocus = clean(focus, 700);
  const queries = userFocus ? [
    `${userFocus} APAC expansion funding sales hiring 2026 SaaS`,
    `${userFocus} Japan Singapore Australia expansion 2026 startup`,
    `${userFocus} Series A Series B international expansion 2026`
  ] : [
    'B2B SaaS Series A APAC expansion Japan Singapore Australia 2026',
    'AI SaaS startup APAC sales partnerships hiring 2026 Series A Series B',
    'B2B software startup expands Japan Singapore Australia 2026 funding'
  ];
  const r = await tavilySearchMany(queries, {
    maxResults: 8,
    timeRange: 'year',
    excludeDomains: DISCOVERY_EXCLUDES,
    topic: 'general'
  });
  const sources = r.results.slice(0, 22);
  if (!sources.length) throw new Error('Tavily에서 후보 근거를 찾지 못했습니다.');
  return { evidence: formatEvidence(sources, 22, 9000), sources, meta: { ...r.meta, search_results: sources.length } };
}

const candidateSchema = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          official_url_hint: { type: 'string' },
          fit_score: { type: 'integer' },
          why_buy_our_service: { type: 'string' },
          why_now: { type: 'string' },
          source_urls: { type: 'array', items: { type: 'string' } },
          recommended_role: { type: 'string' },
          korea_opportunity: { type: 'string' }
        },
        required: ['company','official_url_hint','fit_score','why_buy_our_service','why_now','source_urls','recommended_role','korea_opportunity'],
        additionalProperties: false
      }
    }
  },
  required: ['candidates'],
  additionalProperties: false
};

async function shortlistCandidates(evidence, focus) {
  const prompt = `아래 최신 웹 검색 근거만 사용해, 우리가 '한국 시장 테스트 서비스'를 제안할 해외 B2B SaaS/AI 회사 후보를 최대 7곳 고른다.\n\n사용자 조건: ${clean(focus, 700) || 'Seed~Series B급 소·중형 B2B SaaS/AI. APAC·일본·싱가포르·호주 등 해외 확장 신호가 있고 한국에 아직 강한 현지 영업조직이 없는 회사.'}\n\n우리가 파는 것: 한국 현지 직원을 뽑기 전에 한국 잠재고객을 빠르게 테스트할 수 있도록, 한국 기업 샘플·접촉 이유·추천 담당 직책·첫 아웃바운드 방향을 정리해 주는 유료 파일럿.\n\n규칙:\n- 한국 회사, 초대형 글로벌 플랫폼, 이미 한국 사업이 성숙한 회사는 제외한다.\n- 회사명과 실제 최신 확장/투자/영업 신호가 검색 근거에 있어야 한다.\n- why_buy_our_service, why_now, korea_opportunity는 반드시 자연스러운 한국어 1~2문장으로 작성한다.\n- official_url_hint는 근거에 공식 홈페이지가 명확히 보일 때만 넣고, 뉴스/SNS/채용공고 URL을 넣지 않는다. 모르면 빈 문자열.\n- source_urls는 아래 SOURCE에 실제 등장한 URL만 사용한다.\n- fit_score는 우리 서비스 구매 가능성 기준 0~100.\n- recommended_role은 Founder/CEO/Head of Sales/BD/Partnerships/Growth 중 가장 적합한 역할 하나.\n- 근거 밖 사실을 만들지 않는다.\n\nWEB EVIDENCE:\n${evidence.slice(0, 9000)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 22000);
  try {
    const response = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: STRUCTURE_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        reasoning_effort: 'low',
        reasoning_format: 'hidden',
        max_completion_tokens: 1800,
        response_format: { type: 'json_schema', json_schema: { name: 'sales_candidates', strict: true, schema: candidateSchema } }
      }),
      signal: controller.signal
    });
    const raw = await response.text();
    if (!response.ok) {
      let detail = raw; try { detail = JSON.parse(raw)?.error?.message || raw; } catch {}
      const e = new Error(`Groq HTTP ${response.status}: ${safeError(detail)}`); e.status = response.status; throw e;
    }
    const payload = JSON.parse(raw);
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Groq가 후보 데이터를 반환하지 않았습니다.');
    return { data: JSON.parse(content), usage: payload?.usage || null };
  } catch (e) {
    if (e?.name === 'AbortError') { const x = new Error('후보 정리가 시간 초과되었습니다.'); x.status = 504; throw x; }
    throw e;
  } finally { clearTimeout(timer); }
}

function explicitKoreaPresence(text = '') {
  const s = String(text).toLowerCase();
  const patterns = [
    /korea\s+(office|team|country manager|general manager|head|sales team|subsidiary|operations)/,
    /(office|team|subsidiary|operations)\s+(in|for)\s+(south\s+)?korea/,
    /seoul\s+(office|team|hub|based|role|roles|jobs|location)/,
    /(country manager|head of|general manager)[^.!?]{0,40}(korea|seoul)/,
    /(launch|launched|launching|operate|operating|operations)[^.!?]{0,40}(in\s+)?(south\s+)?korea/,
    /(acquire|acquired|acquisition)[^.!?]{0,80}(korea|korean)/,
    /(korea|korean)[^.!?]{0,50}(subsidiary|entity|license|office|team)/
  ];
  return patterns.some(r => r.test(s));
}

function pickOfficialUrl(company, hint, rows) {
  if (looksLikeCompanyHost(hint, company)) return `https://${rootHost(hint)}/`;
  const exact = rows.find(r => looksLikeCompanyHost(r.url, company));
  return exact ? `https://${rootHost(exact.url)}/` : '';
}

async function verifyCandidate(candidate) {
  const company = clean(candidate?.company, 120);
  if (!company) return null;
  const query = `"${company}" official website Korea office Seoul country manager Korea team careers`;
  const r = await tavilySearch(query, {
    maxResults: 9,
    timeRange: null,
    excludeDomains: ['instagram.com','facebook.com','x.com','twitter.com','youtube.com','reddit.com','pinterest.com'],
    topic: 'general'
  });
  const rows = r.results || [];
  const officialUrl = pickOfficialUrl(company, candidate?.official_url_hint, rows);
  if (!officialUrl) return null;

  const koreaQueryRows = rows.filter(row => /korea|seoul|한국|서울/i.test(`${row.title} ${row.content} ${row.url}`));
  const active = koreaQueryRows.some(row => explicitKoreaPresence(`${row.title} ${row.content}`));
  if (active) return null;

  const originalEvidence = validUrls(candidate?.source_urls, 4);
  const verificationEvidence = koreaQueryRows.slice(0, 2).map(r => r.url);
  const sourceUrls = dedupe([...originalEvidence, ...verificationEvidence]).slice(0, 5);
  if (!sourceUrls.length) return null;

  const companyName = clean(candidate.company, 120);
  const fallbackWhy = `${companyName}는 최근 해외 확장 신호가 확인됐고, 한국 현지 영업조직은 이번 검증에서 확인되지 않아 한국 시장을 작게 시험해 볼 제안 대상으로 적합합니다.`;
  const fallbackNow = `최근 공개된 해외 확장·투자·영업 신호를 근거로 지금 한국 잠재고객 샘플을 제안해 볼 수 있습니다.`;
  const fallbackOpportunity = `${companyName}의 제품이 맞을 가능성이 높은 한국 B2B 기업 3곳을 먼저 찾아 실제 시장 반응을 확인합니다.`;
  const role = clean(candidate?.recommended_role, 100) || 'Head of Sales';
  const score = Math.max(0, Math.min(100, Number.parseInt(candidate?.fit_score, 10) || 0));

  return {
    company: companyName,
    url: officialUrl,
    fit_score: sourceUrls.length === 1 ? Math.min(score, 70) : score,
    why_buy_our_service: koreanEnough(candidate?.why_buy_our_service) ? clean(candidate.why_buy_our_service, 380) : fallbackWhy,
    why_now: koreanEnough(candidate?.why_now) ? clean(candidate.why_now, 380) : fallbackNow,
    korea_opportunity: koreanEnough(candidate?.korea_opportunity) ? clean(candidate.korea_opportunity, 380) : fallbackOpportunity,
    source_urls: sourceUrls,
    recommended_role: role,
    contact_search_query: `"${companyName}" (Founder OR CEO OR "Head of Sales" OR Partnerships OR Growth) LinkedIn`,
    verification_status: '한국 현지 조직 미확인',
    verification_note: '공식 홈페이지 확인 · 한국 오피스/현지팀 명시 자료 미발견',
    outreach_en: `Hi — I came across ${companyName} while researching B2B SaaS teams expanding internationally. I help teams test Korea before hiring locally by mapping 3 Korean accounts and why each may be worth contacting. I can send you a free 3-account sample for ${companyName}. Would that be useful?`,
    outreach_ko: `안녕하세요. 해외 확장 중인 B2B SaaS를 조사하다 ${companyName}를 보게 됐습니다. 한국에서 현지 직원을 채용하기 전에 잠재고객과 접촉 이유를 작게 검증하는 일을 하고 있습니다. ${companyName}에 맞는 한국 기업 3곳 샘플을 무료로 보내드려도 될까요?`
  };
}

export async function POST(request) {
  if (!process.env.GROQ_API_KEY) return Response.json({ error: 'GROQ_API_KEY가 없습니다.' }, { status: 503 });
  if (!tavilyConfigured()) return Response.json({ error: 'TAVILY_API_KEY가 없습니다.' }, { status: 503 });
  let body = {}; try { body = await request.json(); } catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }
  const focus = clean(body.focus, 700);

  try {
    const discovery = await discoverEvidence(focus);
    const shortlist = await shortlistCandidates(discovery.evidence, focus);
    const candidates = Array.isArray(shortlist.data?.candidates) ? shortlist.data.candidates.slice(0, 7) : [];
    if (!candidates.length) return Response.json({ error: '조건에 맞는 해외 SaaS 후보를 만들지 못했습니다.' }, { status: 422 });

    const verified = [];
    for (const candidate of candidates) {
      try {
        const result = await verifyCandidate(candidate);
        if (result) verified.push(result);
      } catch {}
      if (verified.length >= 3) break;
    }

    const leads = verified.sort((a, b) => b.fit_score - a.fit_score).slice(0, 3).map((lead, i) => ({ ...lead, rank: i + 1 }));
    if (!leads.length) {
      return Response.json({ error: '검색은 됐지만 공식 홈페이지와 한국 조직 검증을 통과한 후보가 없었습니다.', hint: '조건을 조금 넓혀 다시 실행하세요.' }, { status: 422 });
    }

    return Response.json({
      leads,
      strategy: { next_action: '1위 회사의 실제 의사결정자를 확인하고 무료 한국 기업 3곳 샘플을 제안하는 첫 메일을 보냅니다.' },
      meta: {
        search: discovery.meta,
        structure_model: STRUCTURE_MODEL,
        structure_usage: shortlist.usage,
        returned_count: leads.length,
        pipeline: 'Tavily 후보 검색 → Groq 후보 선별 → Tavily 공식URL/한국조직 검증'
      }
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: safeError(e?.message || e), hint: e?.status === 429 ? 'API 사용량 제한입니다. 잠시 후 다시 시도하세요.' : '후보 발굴 과정에서 오류가 발생했습니다.' }, { status: e?.status || 502 });
  }
}
