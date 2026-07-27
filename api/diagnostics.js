const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_VERSION = '2025-08-16';

function safe(value = '') {
  return String(value).replace(/gsk_[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 500);
}

async function timedFetch(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
    return { response, durationMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
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

export async function GET(request) {
  const key = process.env.GROQ_API_KEY;
  const url = new URL(request.url);
  const runSearch = url.searchParams.get('search') === '1';
  const result = {
    ok: false,
    timestamp: new Date().toISOString(),
    runtime: { node: process.version },
    checks: {
      env: { ok: Boolean(key), message: key ? 'GROQ_API_KEY present' : 'GROQ_API_KEY missing' },
      auth: { ok: false },
      search: { ok: null, skipped: !runSearch }
    }
  };

  if (!key) return Response.json(result, { status: 503, headers: { 'Cache-Control': 'no-store' } });

  try {
    const { response, durationMs } = await timedFetch(GROQ_MODELS_URL, {
      headers: { Authorization: `Bearer ${key}` }
    }, 7000);
    const raw = await response.text();
    result.checks.auth = {
      ok: response.ok,
      status: response.status,
      duration_ms: durationMs,
      rate: rateInfo(response),
      message: response.ok ? 'Groq authentication OK' : safe(raw)
    };
    if (!response.ok) return Response.json(result, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    result.checks.auth = { ok: false, message: error?.name === 'AbortError' ? 'Groq auth check timed out' : safe(error?.message) };
    return Response.json(result, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }

  if (runSearch) {
    try {
      const { response, durationMs } = await timedFetch(GROQ_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Groq-Model-Version': GROQ_VERSION
        },
        body: JSON.stringify({
          model: 'groq/compound-mini',
          messages: [{ role: 'user', content: 'Use web search once. Find the official website of Vercel and return only JSON: {"ok":true,"domain":"vercel.com"}.' }],
          temperature: 0,
          response_format: { type: 'json_object' },
          compound_custom: { tools: { enabled_tools: ['web_search'] } }
        })
      }, 15000);
      const raw = await response.text();
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch {}
      const content = parsed?.choices?.[0]?.message?.content || '';
      result.checks.search = {
        ok: response.ok && /vercel\.com/i.test(content),
        status: response.status,
        duration_ms: durationMs,
        rate: rateInfo(response),
        tool_calls: Array.isArray(parsed?.choices?.[0]?.message?.executed_tools) ? parsed.choices[0].message.executed_tools.length : 0,
        message: response.ok ? safe(content) : safe(raw)
      };
    } catch (error) {
      result.checks.search = { ok: false, message: error?.name === 'AbortError' ? 'Groq web-search test timed out' : safe(error?.message) };
    }
  }

  result.ok = Boolean(result.checks.env.ok && result.checks.auth.ok && (result.checks.search.skipped || result.checks.search.ok));
  return Response.json(result, { status: result.ok ? 200 : 502, headers: { 'Cache-Control': 'no-store' } });
}
