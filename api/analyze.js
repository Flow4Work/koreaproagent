import { tavilyConfigured, tavilySearchMany, formatEvidence } from '../lib/web-search.js';
import { AI_MODEL, AI_PROVIDER, aiConfigured, chatJson } from '../lib/ai-provider.js';

function clean(value, max = 1600) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function hasHangul(value = '') {
  return /[\u3131-\u318E\uAC00-\uD7A3]/.test(String(value || ''));
}

function english(value, max = 700) {
  const text = clean(value, max);
  return text && !hasHangul(text) ? text : '';
}

function safeError(value = '') {
  return String(value)
    .replace(/tvly-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[key]')
    .slice(0, 700);
}

function normalizeUrl(value) {
  try {
    const raw = clean(value, 500);
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function host(value) {
  try { return new URL(value).hostname.replace(/^www\./, ''); }
  catch { return clean(value, 120); }
}

async function researchKorea({ clientUrl, productHint, targetNotes, seeds }) {
  if (!tavilyConfigured()) throw new Error('TAVILY_API_KEY가 필요합니다.');

  const domain = host(clientUrl);
  const product = clean(productHint, 1200) || domain;
  const target = clean(targetNotes, 1400) || '한국 B2B 기업';
  const queries = [
    `site:${domain} ${product} product features customers`,
    `${product} ${target} 한국 2026 채용 확장 도입`,
    `${product} Korea enterprise customer support hiring expansion 2026`,
    `${target} 한국 기업 2026 투자 채용 신제품 디지털 전환`
  ];
  if (seeds) queries.push(`${product} ${seeds} 2026`);

  const result = await tavilySearchMany(queries.slice(0, 5), { maxResults: 7, timeRange: 'year' });
  const sources = result.results.slice(0, 18);
  if (!sources.length) throw new Error('Tavily returned no search results');

  return {
    evidence: formatEvidence(sources, 18, 7600),
    sources,
    meta: { ...result.meta, provider: 'tavily', search_results: sources.length }
  };
}

async function structureResearch({ evidence, clientUrl, productHint, targetNotes }) {
  const prompt = `아래 SOURCE만 사용해 이 SaaS가 실제로 공략할 만한 한국 B2B 계정을 최대 3곳 선정한다.

고객 SaaS: ${clientUrl}
제품: ${clean(productHint, 1200) || 'SOURCE에서 확인'}
타깃: ${clean(targetNotes, 1400) || '없음'}

규칙:
- 유명 기업 이름을 채우기 위해 후보를 만들지 않는다. 근거가 약하면 후보 수를 줄인다.
- 회사별 source_urls는 반드시 SOURCE에 실제로 존재하고 그 회사를 직접 뒷받침하는 URL만 사용한다.
- 최근 채용, 확장, 도입, 신제품, 파트너십, 운영 변화 등 공개 신호가 있으면 buying_signal에 적고, 없으면 억지로 만들지 않는다.
- fit_score = 제품 적합 40 + 현재 신호 30 + 접근성 20 + 근거 10. SOURCE 1개뿐이면 70점 초과 금지.
- 담당자 개인 이름, 이메일, 계약, 예산, 구매 의도는 절대 추측하지 않는다.
- 화면용 company, why_fit, buying_signal, recommended_role, sales_angle은 한국어로 작성한다.
- 영문 메일용 필드는 반드시 영어만 사용한다.
- company_en은 공식 또는 통용 영문 회사명.
- recommended_role_en은 실제 구매 가능성이 높은 영문 직책이며 개인 이름이 아니다.
- why_fit_en은 제품 적합 이유를 영어 한 문장으로 작성한다.
- buying_signal_en은 SOURCE로 확인된 현재 신호만 영어 한 문장으로 작성하고, 신호가 없으면 빈 문자열.
- message_en은 SOURCE 근거만 사용한 짧은 영문 접근 메시지다.

JSON만 반환:
{
  "client":{"name":"","url":"","product":"","korea_value_proposition":""},
  "icp":{"summary":""},
  "prospects":[{
    "company":"","company_en":"","url":"","industry":"","fit_score":0,
    "why_fit":"","why_fit_en":"","buying_signal":"","buying_signal_en":"","signal_date":"",
    "source_urls":[],"recommended_role":"","recommended_role_en":"","contact_search_query":"",
    "sales_angle":"","sales_angle_en":"","message_ko":"","message_en":""
  }],
  "strategy":{"first_segment":"","core_offer":"","next_action":""}
}

SOURCE:
${evidence.slice(0, 7600)}`;

  const structured = await chatJson({ prompt, maxTokens: 1900, temperature: 0 });
  return {
    data: structured.data,
    model: structured.model || AI_MODEL,
    providerChain: structured._providerChain || null,
    usage: structured.usage || null
  };
}

function matchingEvidence(names, sources) {
  const needles = (Array.isArray(names) ? names : [names])
    .map(value => clean(value, 140).toLowerCase())
    .filter(Boolean);
  if (!needles.length) return [];

  return sources
    .filter(source => {
      const text = `${source.title || ''} ${source.content || ''}`.toLowerCase();
      return needles.some(needle => text.includes(needle));
    })
    .map(source => source.url)
    .filter(Boolean)
    .slice(0, 3);
}

function sanitizeResult(data, clientUrl, sources, meta) {
  const allowedUrls = new Set(sources.map(source => source.url).filter(Boolean));

  const prospects = (Array.isArray(data?.prospects) ? data.prospects : [])
    .map(prospect => {
      const company = clean(prospect?.company, 120);
      const companyEn = english(prospect?.company_en, 140) || english(company, 140);
      const recommendedRole = clean(prospect?.recommended_role, 120);
      const recommendedRoleEn = english(prospect?.recommended_role_en, 140) || english(recommendedRole, 140);
      const whyFitEn = english(prospect?.why_fit_en, 520);
      const buyingSignalEn = english(prospect?.buying_signal_en, 520);
      const salesAngleEn = english(prospect?.sales_angle_en, 520);

      let sourceUrls = Array.isArray(prospect?.source_urls)
        ? prospect.source_urls.map(String).filter(url => allowedUrls.has(url)).slice(0, 3)
        : [];
      if (!sourceUrls.length) sourceUrls = matchingEvidence([company, companyEn], sources);

      let score = Math.max(0, Math.min(100, Number.parseInt(prospect?.fit_score, 10) || 0));
      if (!sourceUrls.length) score = 0;
      if (sourceUrls.length === 1) score = Math.min(score, 70);

      return {
        company,
        company_en: companyEn,
        url: clean(prospect?.url, 350),
        industry: clean(prospect?.industry, 100),
        fit_score: score,
        why_fit: clean(prospect?.why_fit, 520),
        why_fit_en: whyFitEn,
        buying_signal: clean(prospect?.buying_signal, 520),
        buying_signal_en: buyingSignalEn,
        signal_date: clean(prospect?.signal_date, 60),
        source_urls: sourceUrls,
        contact_name: '',
        contact_title: '',
        contact_profile_url: '',
        recommended_role: recommendedRole,
        recommended_role_en: recommendedRoleEn,
        contact_search_query: clean(prospect?.contact_search_query, 240),
        sales_angle: clean(prospect?.sales_angle, 520),
        sales_angle_en: salesAngleEn,
        message_ko: clean(prospect?.message_ko, 900),
        message_en: english(prospect?.message_en, 900),
        confidence: sourceUrls.length >= 2 ? 'high' : 'medium'
      };
    })
    .filter(prospect =>
      prospect.company &&
      prospect.company_en &&
      prospect.source_urls.length &&
      prospect.recommended_role_en &&
      (prospect.buying_signal_en || prospect.why_fit_en || prospect.sales_angle_en) &&
      prospect.fit_score >= 45
    )
    .sort((a, b) => b.fit_score - a.fit_score)
    .slice(0, 3)
    .map((prospect, index) => ({ ...prospect, rank: index + 1 }));

  return {
    generated_at: new Date().toISOString(),
    client: {
      name: clean(data?.client?.name, 120),
      url: clean(data?.client?.url, 350) || clientUrl,
      product: clean(data?.client?.product, 600),
      korea_value_proposition: clean(data?.client?.korea_value_proposition, 600)
    },
    icp: { summary: clean(data?.icp?.summary, 700), industries: [], company_signals: [], buyer_roles: [] },
    prospects,
    strategy: {
      first_segment: clean(data?.strategy?.first_segment, 400),
      core_offer: clean(data?.strategy?.core_offer, 450),
      next_action: clean(data?.strategy?.next_action, 450)
    },
    meta
  };
}

export async function POST(request) {
  if (!aiConfigured()) {
    return Response.json({ error: 'OPENCODE_ZEN_API_KEY가 Vercel 환경변수에 없습니다.' }, { status: 503 });
  }
  if (!tavilyConfigured()) {
    return Response.json({ error: 'TAVILY_API_KEY가 Vercel 환경변수에 없습니다.' }, { status: 503 });
  }

  let body = {};
  try { body = await request.json(); }
  catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }

  const clientUrl = normalizeUrl(body.clientUrl);
  if (!clientUrl) return Response.json({ error: '고객 SaaS URL을 확인하세요.' }, { status: 400 });

  const productHint = clean(body.productHint, 1200);
  const targetNotes = clean(body.targetNotes, 1400);
  const seeds = clean(body.seeds, 1800);

  let research;
  try {
    research = await researchKorea({ clientUrl, productHint, targetNotes, seeds });
  } catch (error) {
    return Response.json({
      error: safeError(error?.message || error),
      hint: '한국 시장 웹 리서치에 실패했습니다.',
      phase: 'search'
    }, { status: error?.status || 502 });
  }

  try {
    const structured = await structureResearch({ evidence: research.evidence, clientUrl, productHint, targetNotes });
    const result = sanitizeResult(structured.data, clientUrl, research.sources, {
      research: research.meta,
      ai_provider: AI_PROVIDER,
      structure_model: structured.model,
      provider_chain: structured.providerChain,
      structure_usage: structured.usage,
      pipeline: 'tavily -> AI provider chain -> strict send-ready English validation'
    });

    if (!result.prospects.length) {
      return Response.json({
        error: '근거와 영문 발송 기준을 모두 통과한 한국 후보가 없습니다.',
        hint: '근거 없는 회사를 채우지 않았습니다.',
        phase: 'validation',
        meta: { search_results: research.sources.length, provider: research.meta?.provider }
      }, { status: 422 });
    }

    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({
      error: safeError(error?.message || error),
      hint: error?.status === 429 ? 'AI 사용량 제한입니다. 잠시 후 다시 실행하세요.' : '웹 리서치는 성공했지만 납품 데이터 정리에 실패했습니다.',
      phase: 'structure'
    }, { status: error?.status || 502 });
  }
}
