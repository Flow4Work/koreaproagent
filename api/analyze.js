import { tavilyConfigured, tavilySearchMany, formatEvidence } from '../lib/web-search.js';
import { AI_MODEL, AI_PROVIDER, aiConfigured, chatJson } from '../lib/ai-provider.js';

function clean(v, max = 1600) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function hasHangul(v = '') { return /[\u3131-\u318E\uAC00-\uD7A3]/.test(String(v || '')); }
function english(v, max = 700) { const x = clean(v, max); return x && !hasHangul(x) ? x : ''; }
function safeError(v = '') { return String(v).replace(/tvly-[A-Za-z0-9_-]+/g, '[redacted]').replace(/[A-Za-z0-9_-]{32,}/g, '[key]').slice(0, 700); }
function validUrls(v, limit = 4) { return Array.isArray(v) ? v.map(String).filter(x => /^https?:\/\//i.test(x)).slice(0, limit) : []; }
function normalizeUrl(v) { try { const raw = clean(v, 500); const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); return ['http:','https:'].includes(u.protocol) ? u.toString() : null; } catch { return null; } }
function host(v) { try { return new URL(v).hostname.replace(/^www\./, ''); } catch { return clean(v, 120); } }

async function researchKorea({ clientUrl, productHint, targetNotes }) {
  if (!tavilyConfigured()) throw new Error('TAVILY_API_KEY가 필요합니다.');
  const domain = host(clientUrl);
  const product = clean(productHint, 500) || domain;
  const target = clean(targetNotes, 500) || 'Korean B2B companies';
  const queries = [
    `site:${domain} ${product} product customers use cases`,
    `${product} ${target} Korea enterprise 2026 hiring expansion adoption`,
    `${target} Korea 2026 hiring expansion digital transformation procurement`
  ];
  const r = await tavilySearchMany(queries, { maxResults: 6, timeRange: 'year' });
  const sources = r.results.slice(0, 14);
  if (!sources.length) throw new Error('Tavily returned no search results');
  return { evidence: formatEvidence(sources, 14, 6200), sources, meta: { ...r.meta, provider:'tavily', search_results:sources.length } };
}

async function structureResearch({ evidence, clientUrl, productHint, targetNotes }) {
  const prompt = `Use ONLY the SOURCE evidence below to select up to 3 Korean B2B accounts that are plausible first targets for this SaaS.

Client SaaS: ${clientUrl}
Product: ${clean(productHint, 500) || 'infer only from SOURCE'}
Target note: ${clean(targetNotes, 500) || 'none'}

Rules:
- Do not pad the list. Return 0-3 accounts.
- A famous Korean company is NOT enough. Each account needs a product-fit reason tied to SOURCE evidence.
- source_urls must be real URLs from SOURCE and must support that company.
- buying_signal_en is allowed ONLY when SOURCE shows a recent concrete signal such as hiring, expansion, adoption, procurement, transformation, regulation, or operating change. Otherwise leave buying_signal_en empty.
- why_fit_en must be concise English and evidence-backed.
- company_en must be the verified English company name. Never output Korean text in company_en.
- recommended_role_en must be an English buyer role, not a fabricated person.
- Do not invent names, emails, deployments, budgets, contracts, or buying intent.
- Korean research fields may be Korean, but every *_en field must contain English only.
- If evidence is weak, omit the account rather than writing "insufficient evidence".

Return JSON only:
{
  "client":{"name":"","url":"","product":"","korea_value_proposition":""},
  "prospects":[{
    "company":"",
    "company_en":"",
    "url":"",
    "industry":"",
    "fit_score":0,
    "why_fit":"",
    "why_fit_en":"",
    "buying_signal":"",
    "buying_signal_en":"",
    "signal_date":"",
    "source_urls":[],
    "recommended_role":"",
    "recommended_role_en":""
  }]
}

SOURCE:
${evidence.slice(0, 6200)}`;
  const structured = await chatJson({ prompt, maxTokens: 1500, timeoutMs: 32000, temperature: 0 });
  return { data: structured.data, model: structured.model || AI_MODEL, usage: structured.usage || null };
}

function matchingEvidence(company, sources) {
  const n = clean(company, 140).toLowerCase();
  return n ? sources.filter(s => `${s.title} ${s.content}`.toLowerCase().includes(n)).map(s => s.url).slice(0, 2) : [];
}

function sanitizeResult(data, clientUrl, sources, meta) {
  const prospects = (Array.isArray(data?.prospects) ? data.prospects : []).map(p => {
    let source_urls = validUrls(p?.source_urls);
    if (!source_urls.length) source_urls = matchingEvidence(p?.company, sources);
    let score = Math.max(0, Math.min(100, Number.parseInt(p?.fit_score, 10) || 0));
    if (!source_urls.length) score = 0;
    if (source_urls.length === 1) score = Math.min(score, 70);
    const companyEn = english(p?.company_en, 120) || english(p?.company, 120);
    const roleEn = english(p?.recommended_role_en, 120) || english(p?.recommended_role, 120);
    const whyFitEn = english(p?.why_fit_en, 420);
    const buyingSignalEn = english(p?.buying_signal_en, 420);
    return {
      company: clean(p?.company, 120),
      company_en: companyEn,
      url: clean(p?.url, 350),
      industry: clean(p?.industry, 100),
      fit_score: score,
      why_fit: clean(p?.why_fit, 520),
      why_fit_en: whyFitEn,
      buying_signal: clean(p?.buying_signal, 460),
      buying_signal_en: buyingSignalEn,
      signal_date: clean(p?.signal_date, 60),
      source_urls,
      recommended_role: clean(p?.recommended_role, 120),
      recommended_role_en: roleEn,
      confidence: source_urls.length >= 2 ? 'high' : 'medium'
    };
  }).filter(p => p.company && p.company_en && /^https?:\/\//i.test(p.url) && p.source_urls.length && p.recommended_role_en && (p.buying_signal_en || p.why_fit_en) && p.fit_score >= 45)
    .sort((a, b) => b.fit_score - a.fit_score)
    .slice(0, 3)
    .map((p, i) => ({ ...p, rank:i + 1 }));

  return {
    generated_at: new Date().toISOString(),
    client: {
      name: clean(data?.client?.name, 120),
      url: clean(data?.client?.url, 350) || clientUrl,
      product: clean(data?.client?.product, 600),
      korea_value_proposition: clean(data?.client?.korea_value_proposition, 600)
    },
    prospects,
    meta
  };
}

export async function POST(request) {
  if (!aiConfigured()) return Response.json({ error:'OPENCODE_ZEN_API_KEY가 Vercel 환경변수에 없습니다.' }, { status:503 });
  if (!tavilyConfigured()) return Response.json({ error:'TAVILY_API_KEY가 Vercel 환경변수에 없습니다.' }, { status:503 });

  let body = {};
  try { body = await request.json(); } catch { return Response.json({ error:'요청 형식이 잘못됐습니다.' }, { status:400 }); }
  const clientUrl = normalizeUrl(body.clientUrl);
  if (!clientUrl) return Response.json({ error:'고객 SaaS URL을 확인하세요.' }, { status:400 });
  const productHint = clean(body.productHint, 700);
  const targetNotes = clean(body.targetNotes, 700);

  let research;
  try { research = await researchKorea({ clientUrl, productHint, targetNotes }); }
  catch (e) { return Response.json({ error:safeError(e?.message || e), hint:'한국 시장 웹 리서치에 실패했습니다.', phase:'search' }, { status:e?.status || 502 }); }

  try {
    const structured = await structureResearch({ evidence:research.evidence, clientUrl, productHint, targetNotes });
    const result = sanitizeResult(structured.data, clientUrl, research.sources, {
      research: research.meta,
      ai_provider: AI_PROVIDER,
      structure_model: structured.model,
      structure_usage: structured.usage,
      pipeline: '3 targeted searches -> DeepSeek shortlist -> strict English outbound validation'
    });
    if (!result.prospects.length) return Response.json({ error:'근거와 영문 발송 기준을 모두 통과한 한국 후보가 없습니다.', hint:'근거 없는 회사를 채우지 않았습니다.', phase:'validation', meta:{ search_results:research.sources.length } }, { status:422 });
    return Response.json(result, { headers:{ 'Cache-Control':'no-store' } });
  } catch (e) {
    return Response.json({ error:safeError(e?.message || e), hint:e?.status === 429 ? 'OpenCode Zen 사용량 제한입니다. 잠시 후 다시 실행하세요.' : '웹 리서치는 성공했지만 후보 정리에 실패했습니다.', phase:'structure' }, { status:e?.status || 502 });
  }
}
