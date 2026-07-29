import { tavilyConfigured, tavilySearchMany, formatEvidence } from '../lib/web-search.js';
import { AI_MODEL, AI_PROVIDER, aiConfigured, chatJson } from '../lib/ai-provider.js';

function clean(v, max = 1600) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function safeError(v = '') {
  return String(v)
    .replace(/tvly-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[key]')
    .slice(0, 700);
}
function validUrls(v, limit = 5) {
  return Array.isArray(v) ? v.map(String).filter(x => /^https?:\/\//i.test(x)).slice(0, limit) : [];
}
function normalizeUrl(v) {
  try {
    const raw = clean(v, 500);
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ['http:','https:'].includes(u.protocol) ? u.toString() : null;
  } catch { return null; }
}
function host(v) {
  try { return new URL(v).hostname.replace(/^www\./, ''); } catch { return clean(v, 120); }
}

async function researchKorea({ clientUrl, productHint, targetNotes, seeds }) {
  if (!tavilyConfigured()) throw new Error('TAVILY_API_KEY가 필요합니다.');
  const domain = host(clientUrl);
  const product = productHint || domain;
  const target = targetNotes || '한국 B2B 기업';
  const queries = [
    `site:${domain} ${product} product features customers`,
    `${product} ${target} 한국 2026 채용 확장 도입`,
    `${product} Korea enterprise customer support hiring expansion 2026`,
    `${target} 한국 기업 2026 투자 채용 신제품 디지털 전환`
  ];
  if (seeds) queries.push(`${product} ${seeds} 2026`);
  const r = await tavilySearchMany(queries.slice(0, 5), { maxResults: 7, timeRange: 'year' });
  const sources = r.results.slice(0, 18);
  if (!sources.length) throw new Error('Tavily returned no search results');
  return {
    evidence: formatEvidence(sources, 18, 7600),
    sources,
    meta: { ...r.meta, provider: 'tavily', search_results: sources.length }
  };
}

async function structureResearch({ evidence, clientUrl, productHint, targetNotes }) {
  const prompt = `아래 검색 근거만 사용해 고객에게 보여줄 한국 영업 샘플 후보 최대 3곳을 JSON으로 만든다.

고객 SaaS: ${clientUrl}
제품: ${productHint || '근거에서 확인'}
타깃: ${targetNotes || '없음'}

규칙:
- 모든 설명은 한국어. 회사명/URL/영문 메시지만 원문 가능.
- source_urls는 SOURCE의 실제 URL 그대로 사용.
- 단순히 대기업이라서 넣지 말고 SaaS 사용처와 현재 공개 신호가 연결되는 한국 기업만 넣는다.
- 근거가 약하면 낮은 점수와 '현재 공개 근거 부족'을 명시한다.
- fit_score = 사용처40 + 현재신호30 + 접근성20 + 근거10. 근거 1개면 70점 초과 금지.
- 담당자 이름/이메일은 만들지 말고 추천 직책과 검색쿼리만 제공.
- message_ko/message_en은 해당 한국 기업에 실제로 보낼 짧은 B2B 접근문이며 근거 밖 사실 금지.

반드시 아래 구조의 JSON만 반환:
{
  "client":{"name":"","url":"","product":"","korea_value_proposition":""},
  "icp":{"summary":""},
  "prospects":[{
    "company":"","url":"","industry":"","fit_score":0,"why_fit":"","buying_signal":"","signal_date":"",
    "source_urls":[],"recommended_role":"","contact_search_query":"","sales_angle":"","message_ko":"","message_en":""
  }],
  "strategy":{"first_segment":"","core_offer":"","next_action":""}
}

${evidence.slice(0, 7600)}`;

  const structured = await chatJson({ prompt, maxTokens: 1900, temperature: 0 });
  return { data: structured.data, model: structured.model || AI_MODEL, usage: structured.usage || null };
}

function matchingEvidence(company, sources) {
  const n = clean(company, 140).toLowerCase();
  return n ? sources
    .filter(s => `${s.title} ${s.content}`.toLowerCase().includes(n))
    .map(s => s.url)
    .slice(0, 2) : [];
}

function sanitizeResult(data, clientUrl, sources, meta) {
  const prospects = (Array.isArray(data?.prospects) ? data.prospects : [])
    .map(p => {
      let source_urls = validUrls(p?.source_urls);
      if (!source_urls.length) source_urls = matchingEvidence(p?.company, sources);
      let score = Math.max(0, Math.min(100, Number.parseInt(p?.fit_score, 10) || 0));
      if (!source_urls.length) score = Math.min(score, 40);
      if (source_urls.length === 1) score = Math.min(score, 70);
      return {
        company: clean(p?.company, 120),
        url: clean(p?.url, 350),
        industry: clean(p?.industry, 100),
        fit_score: score,
        why_fit: clean(p?.why_fit, 520),
        buying_signal: clean(p?.buying_signal, 460),
        signal_date: clean(p?.signal_date, 60),
        source_urls,
        contact_name: '',
        contact_title: '',
        contact_profile_url: '',
        recommended_role: clean(p?.recommended_role, 120),
        contact_search_query: clean(p?.contact_search_query, 240),
        sales_angle: clean(p?.sales_angle, 420),
        message_ko: clean(p?.message_ko, 900),
        message_en: clean(p?.message_en, 900),
        confidence: source_urls.length >= 2 ? 'high' : 'medium',
        warning: ''
      };
    })
    .filter(p => p.company && /^https?:\/\//i.test(p.url) && p.source_urls.length)
    .slice(0, 3)
    .sort((a, b) => b.fit_score - a.fit_score)
    .map((p, i) => ({ ...p, rank: i + 1 }));

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
  if (!aiConfigured()) return Response.json({ error: 'OPENCODE_ZEN_API_KEY가 Vercel 환경변수에 없습니다.' }, { status: 503 });
  if (!tavilyConfigured()) return Response.json({ error: 'TAVILY_API_KEY가 Vercel 환경변수에 없습니다.' }, { status: 503 });

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
  } catch (e) {
    return Response.json({
      error: safeError(e?.message || e),
      hint: '한국 시장 웹 리서치에 실패했습니다.',
      phase: 'search'
    }, { status: e?.status || 502 });
  }

  try {
    const structured = await structureResearch({ evidence: research.evidence, clientUrl, productHint, targetNotes });
    const result = sanitizeResult(structured.data, clientUrl, research.sources, {
      research: research.meta,
      ai_provider: AI_PROVIDER,
      structure_model: structured.model,
      structure_usage: structured.usage,
      pipeline: 'tavily -> deepseek-v4-flash-free'
    });
    if (!result.prospects.length) {
      return Response.json({
        error: '리서치는 됐지만 근거 URL이 있는 한국 후보를 만들지 못했습니다.',
        hint: '타깃 조건을 조금 넓혀 다시 실행하세요.',
        phase: 'validation',
        meta: { search_results: research.sources.length, provider: research.meta?.provider }
      }, { status: 422 });
    }
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({
      error: safeError(e?.message || e),
      hint: e?.status === 429 ? 'OpenCode Zen 사용량 제한입니다. 잠시 후 다시 실행하세요.' : '웹 리서치는 성공했지만 납품 데이터 정리에 실패했습니다.',
      phase: 'structure'
    }, { status: e?.status || 502 });
  }
}
