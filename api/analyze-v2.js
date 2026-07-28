import { tavilyConfigured, tavilySearchMany, formatEvidence } from '../lib/web-search.js';
import { AI_MODEL, AI_PROVIDER, aiConfigured, chatJson } from '../lib/ai-provider.js';

const GENERIC_GIANTS = [
  'samsung','naver','kakao','coupang','lotte','hyundai','sk telecom','kt','lg electronics','lg uplus',
  'posco','hanwha','shinhan','kb financial','woori','hana financial','ncsoft','netmarble'
];
const BUYING_TRIGGER = /(hiring|hire|채용|expansion|expand|확장|launch|출시|partnership|파트너|investment|투자|funding|raised|도입|adopt|migration|전환|compliance|규제|automation|자동화|digital transformation|디지털 전환|new office|신사업|restructur|개편)/i;

function clean(v, max = 1600) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function safeError(v = '') { return String(v).replace(/tvly-[A-Za-z0-9_-]+/g, '[redacted]').replace(/[A-Za-z0-9_-]{32,}/g, '[key]').slice(0, 700); }
function normalizeUrl(v) {
  try {
    const raw = clean(v, 500);
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ['http:','https:'].includes(u.protocol) ? u.toString() : null;
  } catch { return null; }
}
function host(v) { try { return new URL(v).hostname.replace(/^www\./, ''); } catch { return clean(v, 120); } }
function token(v = '') { return String(v).toLowerCase().replace(/[^a-z0-9가-힣]/g, ''); }
function isGenericGiant(company = '') { const c = token(company); return GENERIC_GIANTS.some(x => c === token(x) || c.startsWith(token(x))); }
function sourceRowsForCompany(company, sources) {
  const candidates = [company].filter(Boolean).map(v => String(v).toLowerCase());
  if (!candidates.length) return [];
  return sources.filter(s => candidates.some(needle => `${s.title} ${s.content}`.toLowerCase().includes(needle)));
}
function hasBuyingTrigger(rows = []) { return rows.some(r => BUYING_TRIGGER.test(`${r.title} ${r.content}`)); }

async function researchKorea({ clientUrl, productHint, targetNotes }) {
  const domain = host(clientUrl);
  const product = clean(productHint, 700) || domain;
  const target = clean(targetNotes, 900) || '이 제품을 실제로 구매할 한국 B2B 기업';
  const queries = [
    `site:${domain} ${product} product customers use cases`,
    `"${product}" 한국 B2B 2026 채용 확장 도입 전환 자동화`,
    `${target} 한국 기업 2026 채용 확장 신사업 시스템 도입`,
    `${product} Korea companies hiring expansion migration compliance 2026`
  ];
  const r = await tavilySearchMany(queries, {
    maxResults: 8,
    timeRange: 'year',
    excludeDomains: ['instagram.com','facebook.com','x.com','twitter.com','youtube.com','reddit.com','pinterest.com','wikipedia.org'],
    topic: 'general'
  });
  const sources = r.results.slice(0, 24);
  if (!sources.length) throw new Error('한국 잠재고객 근거를 찾지 못했습니다.');
  return { evidence: formatEvidence(sources, 24, 11000), sources, meta: { ...r.meta, search_results: sources.length } };
}

async function structureResearch({ evidence, clientUrl, productHint, targetNotes }) {
  const prompt = `SOURCE만 사용해서 ${clientUrl} 제품이 지금 실제로 공략할 가치가 있는 한국 B2B 기업을 최대 4곳 고른다.

제품 설명: ${clean(productHint, 700) || 'SOURCE의 공식 제품 설명을 확인'}
타깃 조건: ${clean(targetNotes, 900) || '제품 사용처와 공개 구매 신호가 동시에 맞는 한국 기업'}

핵심 원칙:
- 유명해서 고르는 것은 금지. Samsung/Naver/Kakao/Coupang/Lotte/Hyundai/SK/LG 같은 대기업을 기본값처럼 넣지 않는다.
- 각 후보는 SOURCE 안에 회사명이 직접 나오고, 최근 12개월 내 채용·확장·신사업·도입·전환·규제·파트너십 등 '왜 지금 살 수 있는지' 신호가 있어야 한다.
- 제품 기능과 그 신호가 연결되어야 한다. 단순히 업종이 맞는 것만으로는 부족하다.
- 구매 신호가 애매하면 후보를 채우지 않는다. 4개를 억지로 만들지 않는다.
- 담당자 이름/이메일은 만들지 않는다. 실제로 접근할 직책만 추천한다.
- source_urls는 반드시 해당 후보 회사를 직접 언급한 SOURCE URL만 쓴다.
- fit_score는 제품 적합 35 + 현재 구매신호 35 + 접근 가능성 15 + 근거 명확성 15. 70점 미만은 넣지 않는다.
- 화면 표시용 company, why_fit, buying_signal, recommended_role, sales_angle은 한국어로 작성한다.
- 영문 메일용 company_en, recommended_role_en, buying_signal_en은 자연스러운 영어로 별도 작성한다. company_en은 해당 기업의 공식/통용 영문명만 사용한다.

JSON만 반환:
{"prospects":[{"company":"","company_en":"","url":"","industry":"","fit_score":0,"why_fit":"한국어","buying_signal":"한국어","buying_signal_en":"English","signal_date":"","source_urls":[],"recommended_role":"한국어","recommended_role_en":"English","sales_angle":"한국어"}]}

${evidence}`;
  const structured = await chatJson({ prompt, maxTokens: 1900, timeoutMs: 35000, temperature: 0 });
  return { data: structured.data, usage: structured.usage || null, model: structured.model || AI_MODEL };
}

function sanitize(data, sources) {
  const raw = Array.isArray(data?.prospects) ? data.prospects : [];
  return raw.map(p => {
    const company = clean(p?.company, 120);
    const companyEn = clean(p?.company_en, 140);
    const rows = sourceRowsForCompany(company, sources);
    const rowsByEnglish = rows.length ? rows : sourceRowsForCompany(companyEn, sources);
    const directRows = rows.length ? rows : rowsByEnglish;
    const directUrls = directRows.map(r => r.url);
    const requestedUrls = Array.isArray(p?.source_urls) ? p.source_urls.map(String) : [];
    const source_urls = requestedUrls.filter(u => directUrls.includes(u)).slice(0, 3);
    const finalUrls = source_urls.length ? source_urls : directUrls.slice(0, 2);
    let score = Math.max(0, Math.min(100, Number.parseInt(p?.fit_score, 10) || 0));
    const trigger = hasBuyingTrigger(directRows);
    if (!directRows.length || !trigger) score = 0;
    if (isGenericGiant(company) && directRows.length < 2) score = 0;
    return {
      company,
      company_en: companyEn || company,
      url: clean(p?.url, 350),
      industry: clean(p?.industry, 120),
      fit_score: score,
      why_fit: clean(p?.why_fit, 420),
      buying_signal: clean(p?.buying_signal, 420),
      buying_signal_en: clean(p?.buying_signal_en, 420),
      signal_date: clean(p?.signal_date, 60),
      source_urls: finalUrls,
      recommended_role: clean(p?.recommended_role, 120),
      recommended_role_en: clean(p?.recommended_role_en, 120) || 'Business leader',
      sales_angle: clean(p?.sales_angle, 420)
    };
  })
    .filter(p => p.company && p.fit_score >= 70 && p.source_urls.length)
    .sort((a, b) => b.fit_score - a.fit_score)
    .slice(0, 3)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

export async function POST(request) {
  if (!aiConfigured()) return Response.json({ error: 'OPENCODE_ZEN_API_KEY가 필요합니다.' }, { status: 503 });
  if (!tavilyConfigured()) return Response.json({ error: 'TAVILY_API_KEY가 필요합니다.' }, { status: 503 });

  let body = {};
  try { body = await request.json(); }
  catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }

  const clientUrl = normalizeUrl(body.clientUrl);
  if (!clientUrl) return Response.json({ error: '고객 SaaS URL을 확인하세요.' }, { status: 400 });
  const productHint = clean(body.productHint, 900);
  const targetNotes = clean(body.targetNotes, 1200);

  try {
    const research = await researchKorea({ clientUrl, productHint, targetNotes });
    const structured = await structureResearch({ evidence: research.evidence, clientUrl, productHint, targetNotes });
    const prospects = sanitize(structured.data, research.sources);
    if (!prospects.length) {
      return Response.json({
        error: '유명 회사 채우기를 거부하고 검증했더니, 이번 검색에서는 충분히 강한 한국 잠재고객이 없었습니다.',
        phase: 'quality_gate',
        meta: { search_results: research.sources.length }
      }, { status: 422 });
    }
    return Response.json({
      prospects,
      meta: {
        research: research.meta,
        ai_provider: AI_PROVIDER,
        model: structured.model || AI_MODEL,
        rule: 'direct company evidence + current buying trigger + fit score >= 70'
      }
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({
      error: safeError(e?.message || e),
      hint: e?.status === 429 ? 'OpenCode Zen 사용량 제한입니다. 잠시 후 다시 실행하세요.' : '한국 잠재고객 검증 과정에서 오류가 발생했습니다.'
    }, { status: e?.status || 502 });
  }
}