const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_VERSION = '2025-08-16';

function clean(value, max = 1200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const s = String(text || '');
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) return JSON.parse(s.slice(first, last + 1));
  throw new Error('Groq returned invalid JSON');
}

function rateInfo(response) {
  return {
    remaining_requests: response.headers.get('x-ratelimit-remaining-requests'),
    remaining_tokens: response.headers.get('x-ratelimit-remaining-tokens'),
    reset_requests: response.headers.get('x-ratelimit-reset-requests'),
    reset_tokens: response.headers.get('x-ratelimit-reset-tokens'),
    retry_after: response.headers.get('retry-after')
  };
}

async function callGroq({ model, prompt, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
        'Groq-Model-Version': GROQ_VERSION
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Find real current B2B companies using web research. Never invent facts or URLs. Return one JSON object only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
        citation_options: 'disabled',
        compound_custom: { tools: { enabled_tools: ['web_search'] } }
      }),
      signal: controller.signal
    });
    const raw = await response.text();
    if (!response.ok) {
      let detail = raw;
      try { detail = JSON.parse(raw)?.error?.message || raw; } catch {}
      const error = new Error(`Groq HTTP ${response.status}: ${clean(detail, 500)}`);
      error.status = response.status;
      error.retryAfter = response.headers.get('retry-after');
      error.rate = rateInfo(response);
      throw error;
    }
    const payload = JSON.parse(raw);
    return {
      data: parseJson(payload?.choices?.[0]?.message?.content),
      durationMs: Date.now() - started,
      toolCalls: Array.isArray(payload?.choices?.[0]?.message?.executed_tools) ? payload.choices[0].message.executed_tools.length : 0,
      rate: rateInfo(response),
      usage: payload?.usage || null
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const e = new Error(`Groq timeout after ${Math.round(timeoutMs / 1000)}s`);
      e.status = 504;
      throw e;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request) {
  if (!process.env.GROQ_API_KEY) return Response.json({ error: 'GROQ_API_KEY is missing.' }, { status: 503 });
  let body = {};
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request body.' }, { status: 400 }); }

  const count = Math.max(3, Math.min(5, Number.parseInt(body.count, 10) || 3));
  const focus = clean(body.focus, 1800);
  const mode = body.mode === 'deep' ? 'deep' : 'fast';
  const prompt = `Find ${count} overseas B2B SaaS/AI companies that are plausible buyers of a low-risk Korea market-entry sales pilot now.\n\nBuyer profile: ${focus || 'Seed-Series B B2B SaaS/AI, recent APAC/Japan/Singapore/global expansion or sales/partnership hiring, clear Korea B2B use case, and no obvious mature Korea sales team.'}\n\nUse current web search. For each candidate verify one concrete recent trigger with public evidence. Avoid giant companies and companies with an obvious mature Korea sales team. Do NOT research Korean target accounts yet.\n\nReturn JSON only:\n{"candidates":[{"company":"","url":"","country":"","category":"","trigger":"","source_urls":[],"recommended_role":"","contact_search_query":""}],"strategy":{"best_segment":"","pitch":""}}`;

  const attempts = mode === 'deep'
    ? [{ model: 'groq/compound', timeoutMs: 22000 }, { model: 'groq/compound-mini', timeoutMs: 14000 }]
    : [{ model: 'groq/compound-mini', timeoutMs: 14000 }, { model: 'groq/compound', timeoutMs: 18000 }];

  const failures = [];
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    try {
      const result = await callGroq({ ...attempt, prompt });
      const data = result.data;
      const candidates = Array.isArray(data?.candidates) ? data.candidates.slice(0, count).map(c => ({
        company: clean(c?.company, 140),
        url: clean(c?.url, 350),
        country: clean(c?.country, 80),
        category: clean(c?.category, 120),
        trigger: clean(c?.trigger, 700),
        source_urls: Array.isArray(c?.source_urls) ? c.source_urls.map(String).filter(x => /^https?:\/\//i.test(x)).slice(0, 5) : [],
        recommended_role: clean(c?.recommended_role, 120),
        contact_search_query: clean(c?.contact_search_query, 280)
      })).filter(c => c.company && /^https?:\/\//i.test(c.url)) : [];
      if (!candidates.length) throw new Error('No usable candidates returned');
      return Response.json({
        candidates,
        strategy: data?.strategy || {},
        meta: {
          model: attempt.model,
          mode,
          fallback_used: i > 0,
          duration_ms: result.durationMs,
          tool_calls: result.toolCalls,
          rate: result.rate,
          usage: result.usage
        }
      }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      failures.push(clean(error?.message || 'unknown error', 600));
      if ([401, 403].includes(error?.status)) {
        return Response.json({ error: failures.at(-1), hint: 'Groq API key permission/authentication failed.' }, { status: 502 });
      }
      if (error?.status === 429) {
        return Response.json({
          error: failures.at(-1),
          hint: `Groq rate limit reached. Wait ${error.retryAfter || 'a few'} seconds and retry with Fast + 3 candidates.`,
          rate: error.rate || null
        }, { status: 429, headers: { 'Cache-Control': 'no-store' } });
      }
    }
  }

  return Response.json({
    error: `Candidate discovery failed. ${failures.join(' | ')}`,
    hint: 'Run the top-right diagnostic test. If auth/search are OK, retry Fast + 3 candidates.'
  }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
}
