const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const SEARCH_MODEL = 'groq/compound-mini';
const STRUCTURE_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'];

function clean(value, max = 1600) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function safeError(value = '') {
  return String(value).replace(/gsk_[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 700);
}
function rateInfo(response) {
  return {
    remaining_requests: response.headers.get('x-ratelimit-remaining-requests'),
    remaining_tokens: response.headers.get('x-ratelimit-remaining-tokens'),
    retry_after: response.headers.get('retry-after')
  };
}
function validUrls(values, limit = 6) {
  return Array.isArray(values)
    ? values.map(String).filter((v) => /^https?:\/\//i.test(v)).slice(0, limit)
    : [];
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return { response, durationMs: Date.now() - started };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const e = new Error(`Groq search timed out after ${Math.round(timeoutMs / 1000)}s`);
      e.status = 504;
      throw e;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function evidenceFromPayload(payload) {
  const message = payload?.choices?.[0]?.message || {};
  const parts = [];
  if (message.content) parts.push(String(message.content));
  if (Array.isArray(message.executed_tools)) {
    for (const tool of message.executed_tools) {
      if (tool?.arguments) parts.push(`SEARCH ARGUMENTS:\n${String(tool.arguments)}`);
      if (tool?.output) parts.push(`SEARCH RESULTS:\n${String(tool.output)}`);
    }
  }
  return parts.join('\n\n').slice(0, 14000);
}

async function searchBuyers({ focus, version, timeoutMs }) {
  const prompt = `Search the current web for overseas B2B SaaS/AI companies that could plausibly buy a small Korea market-entry sales pilot now.\n\nBuyer preference:\n${focus || 'Seed to Series B B2B SaaS/AI; recent funding, APAC/Japan/Singapore/global expansion, or sales/partnership hiring; a clear B2B use case in Korea; no mature Korea sales organization.'}\n\nFind up to 6 candidates. Prioritize concrete triggers from the last 18 months. Avoid giant companies and companies with a mature Korea office. For every candidate, include the official company URL and at least one public source URL supporting the trigger. Do not invent facts. This is research only; plain text is fine.`;

  const { response, durationMs } = await fetchWithTimeout(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
      'Groq-Model-Version': version
    },
    body: JSON.stringify({
      model: SEARCH_MODEL,
      messages: [
        { role: 'system', content: 'You are an evidence-first B2B web researcher. Use web search, cite real URLs, and never invent companies or events.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      compound_custom: { tools: { enabled_tools: ['web_search'] } }
    })
  }, timeoutMs);

  const raw = await response.text();
  if (!response.ok) {
    let detail = raw;
    try { detail = JSON.parse(raw)?.error?.message || raw; } catch {}
    const error = new Error(`Groq search HTTP ${response.status}: ${safeError(detail)}`);
    error.status = response.status;
    error.retryAfter = response.headers.get('retry-after');
    error.rate = rateInfo(response);
    throw error;
  }
  const payload = JSON.parse(raw);
  const evidence = evidenceFromPayload(payload);
  if (!evidence.trim()) throw new Error('Groq search returned no usable evidence');
  return {
    evidence,
    meta: {
      model: SEARCH_MODEL,
      version,
      duration_ms: durationMs,
      tool_calls: Array.isArray(payload?.choices?.[0]?.message?.executed_tools)
        ? payload.choices[0].message.executed_tools.length
        : 0,
      usage: payload?.usage || null,
      rate: rateInfo(response)
    }
  };
}

const candidateSchema = {
  type: 'object',
  properties: {
    leads: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          url: { type: 'string' },
          country: { type: 'string' },
          category: { type: 'string' },
          fit_score: { type: 'integer' },
          why_buy_our_service: { type: 'string' },
          why_now: { type: 'string' },
          source_urls: { type: 'array', items: { type: 'string' } },
          recommended_role: { type: 'string' },
          contact_search_query: { type: 'string' },
          korea_opportunity: { type: 'string' },
          outreach_en: { type: 'string' },
          outreach_ko: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          warning: { type: 'string' }
        },
        required: ['company','url','country','category','fit_score','why_buy_our_service','why_now','source_urls','recommended_role','contact_search_query','korea_opportunity','outreach_en','outreach_ko','confidence','warning'],
        additionalProperties: false
      }
    },
    strategy: {
      type: 'object',
      properties: {
        best_segment: { type: 'string' },
        pitch: { type: 'string' },
        next_action: { type: 'string' }
      },
      required: ['best_segment','pitch','next_action'],
      additionalProperties: false
    }
  },
  required: ['leads','strategy'],
  additionalProperties: false
};

async function structureEvidence({ evidence, focus, count }) {
  const prompt = `아래는 실시간 웹검색 결과다. 이 텍스트에 실제로 나온 정보만 사용해서 우리가 먼저 연락할 해외 SaaS 후보를 최대 ${count}곳 고른다.\n\n찾는 조건:\n${focus || 'Seed~Series B B2B SaaS/AI, 최근 확장 신호가 있고 한국 B2B 사용처가 명확한 회사.'}\n\n우리 상품:\n390,000원 Korea Pipeline Pilot — 한국팀을 채용하기 전에 한국에서 팔릴 가능성을 빠르게 검증하도록 잠재고객 방향, 접촉 이유, 담당 역할, 첫 영업문을 제공한다.\n\n규칙:\n- 설명은 한국어. 회사명/URL/영문 메일만 원문 허용.\n- source_urls는 아래 검색 결과에 실제로 등장한 http(s) URL만 그대로 복사한다. URL을 만들거나 보정하지 않는다.\n- 최근 투자/채용/진출이 검색 근거에 없으면 단정하지 않는다.\n- 한국 시장 적합성이 약하면 점수를 낮춘다.\n- fit_score는 0~100 정수. 근거 URL 1개뿐이면 70점을 넘기지 않는다.\n- 추천 담당자는 해외 SaaS 내부의 Founder/CEO/Head of Sales/Partnerships/Growth 등 실제 구매 결정을 할 역할이다.\n- outreach_en은 60~90단어. 확인된 신호 1개를 언급하고, 한국 시장을 빠르게 검증하는 작은 파일럿을 제안하며, 샘플을 보내도 되는지 묻고 끝낸다. 링크를 넣지 않는다.\n- 찾지 못한 값은 빈 문자열로 둔다. 거짓으로 채우지 않는다.\n\nWEB EVIDENCE:\n${evidence.slice(0, 14000)}`;

  const failures = [];
  for (const model of STRUCTURE_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(GROQ_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: '검색 근거를 검증 가능한 한국어 영업 후보 데이터로 구조화한다. 근거 밖 사실을 만들지 않는다.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0,
          reasoning_effort: 'low',
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'korea_buyer_leads', strict: true, schema: candidateSchema }
          }
        }),
        signal: controller.signal
      });
      const raw = await response.text();
      if (!response.ok) {
        let detail = raw;
        try { detail = JSON.parse(raw)?.error?.message || raw; } catch {}
        const error = new Error(`Groq structure HTTP ${response.status}: ${safeError(detail)}`);
        error.status = response.status;
        throw error;
      }
      const payload = JSON.parse(raw);
      const content = payload?.choices?.[0]?.message?.content;
      if (!content) throw new Error('Groq structure returned empty content');
      return { data: JSON.parse(content), model, usage: payload?.usage || null };
    } catch (error) {
      const message = error?.name === 'AbortError' ? `${model} structure timeout` : safeError(error?.message || error);
      failures.push(message);
      if (error?.status === 429) throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Structured output failed: ${failures.join(' | ')}`);
}

function sanitizeLead(lead) {
  const source_urls = validUrls(lead?.source_urls, 6);
  let score = Math.max(0, Math.min(100, Number.parseInt(lead?.fit_score, 10) || 0));
  if (source_urls.length === 0) score = Math.min(score, 40);
  if (source_urls.length === 1) score = Math.min(score, 70);
  return {
    company: clean(lead?.company, 140),
    url: clean(lead?.url, 350),
    country: clean(lead?.country, 80),
    category: clean(lead?.category, 120),
    fit_score: score,
    why_buy_our_service: clean(lead?.why_buy_our_service, 520),
    why_now: clean(lead?.why_now, 520),
    source_urls,
    recommended_role: clean(lead?.recommended_role, 120),
    contact_search_query: clean(lead?.contact_search_query, 280),
    korea_opportunity: clean(lead?.korea_opportunity, 500),
    outreach_en: clean(lead?.outreach_en, 1200),
    outreach_ko: clean(lead?.outreach_ko, 1200),
    confidence: ['high','medium','low'].includes(lead?.confidence) ? lead.confidence : 'medium',
    warning: clean(lead?.warning, 400)
  };
}

export async function POST(request) {
  if (!process.env.GROQ_API_KEY) {
    return Response.json({ error: 'GROQ_API_KEY가 Vercel 환경변수에 없습니다.' }, { status: 503 });
  }
  let body = {};
  try { body = await request.json(); } catch {
    return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 });
  }
  const focus = clean(body.focus, 1800);
  const count = 3;
  const attempts = [
    { version: '2025-08-16', timeoutMs: 32000 },
    { version: '2025-07-23', timeoutMs: 26000 }
  ];
  const failures = [];
  let search = null;

  for (const attempt of attempts) {
    try {
      search = await searchBuyers({ focus, ...attempt });
      break;
    } catch (error) {
      failures.push(safeError(error?.message || error));
      if ([401,403].includes(error?.status)) {
        return Response.json({ error: failures.at(-1), hint: 'Groq API 키 권한을 확인하세요.' }, { status: 502 });
      }
      if (error?.status === 429) {
        return Response.json({ error: failures.at(-1), hint: `Groq 사용량 제한입니다. ${error.retryAfter || '잠시'} 후 다시 실행하세요.`, rate: error.rate || null }, { status: 429 });
      }
    }
  }

  if (!search) {
    return Response.json({ error: `웹검색에 실패했습니다. ${failures.join(' | ')}`, hint: '잠시 후 다시 실행하세요.' }, { status: 502 });
  }

  try {
    const structured = await structureEvidence({ evidence: search.evidence, focus, count });
    const leads = (Array.isArray(structured.data?.leads) ? structured.data.leads : [])
      .map(sanitizeLead)
      .filter((lead) => lead.company && /^https?:\/\//i.test(lead.url) && lead.source_urls.length)
      .slice(0, count)
      .sort((a, b) => b.fit_score - a.fit_score)
      .map((lead, index) => ({ ...lead, rank: index + 1 }));

    if (!leads.length) {
      return Response.json({ error: '검색은 성공했지만 검증 가능한 후보가 없었습니다.', hint: '조건을 조금 넓혀 다시 실행하세요.' }, { status: 422 });
    }

    return Response.json({
      leads,
      strategy: structured.data?.strategy || {},
      meta: {
        search: search.meta,
        structure_model: structured.model,
        structure_usage: structured.usage,
        returned_count: leads.length,
        pipeline: 'web-search -> strict-structure'
      }
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: safeError(error?.message || error), hint: '웹검색은 성공했지만 결과 구조화에 실패했습니다.' }, { status: error?.status === 429 ? 429 : 502 });
  }
}
