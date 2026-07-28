const MODELS_URL = 'https://api.groq.com/openai/v1/models';
const REQUIRED_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'];

function safeMessage(text = '') {
  return String(text)
    .replace(/gsk_[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/tvly-[A-Za-z0-9_-]+/g, '[redacted]')
    .slice(0, 280);
}

export async function GET() {
  const groqConfigured = Boolean(process.env.GROQ_API_KEY);
  const tavilyConfigured = Boolean(process.env.TAVILY_API_KEY);
  const hunterConfigured = Boolean(process.env.HUNTER_API_KEY);

  if (!groqConfigured) {
    return Response.json({
      ok: false,
      groqConfigured: false,
      groqConnected: false,
      tavilyConfigured,
      hunterConfigured,
      searchProvider: tavilyConfigured ? 'tavily' : 'groq-browser-fallback',
      models: REQUIRED_MODELS,
      error: 'GROQ_API_KEY is missing',
      timestamp: new Date().toISOString()
    });
  }

  const c = new AbortController(), t = setTimeout(() => c.abort(), 7000);
  try {
    const response = await fetch(MODELS_URL, {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      signal: c.signal,
      cache: 'no-store'
    });
    const raw = await response.text();
    if (!response.ok) {
      let detail = raw;
      try { detail = JSON.parse(raw)?.error?.message || raw; } catch {}
      return Response.json({
        ok: false,
        groqConfigured: true,
        groqConnected: false,
        tavilyConfigured,
        hunterConfigured,
        searchProvider: tavilyConfigured ? 'tavily' : 'groq-browser-fallback',
        models: REQUIRED_MODELS,
        status: response.status,
        error: safeMessage(detail),
        timestamp: new Date().toISOString()
      });
    }

    let available = [];
    try {
      const payload = JSON.parse(raw);
      const ids = new Set(Array.isArray(payload?.data) ? payload.data.map(x => x?.id) : []);
      available = REQUIRED_MODELS.filter(id => ids.has(id));
    } catch {}

    return Response.json({
      ok: true,
      groqConfigured: true,
      groqConnected: true,
      tavilyConfigured,
      hunterConfigured,
      searchProvider: tavilyConfigured ? 'tavily' : 'groq-browser-fallback',
      models: REQUIRED_MODELS,
      modelsAvailable: available,
      allModelsAvailable: available.length === REQUIRED_MODELS.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return Response.json({
      ok: false,
      groqConfigured: true,
      groqConnected: false,
      tavilyConfigured,
      hunterConfigured,
      searchProvider: tavilyConfigured ? 'tavily' : 'groq-browser-fallback',
      models: REQUIRED_MODELS,
      error: error?.name === 'AbortError' ? 'Groq connection check timed out' : safeMessage(error?.message || 'Groq connection failed'),
      timestamp: new Date().toISOString()
    });
  } finally {
    clearTimeout(t);
  }
}
