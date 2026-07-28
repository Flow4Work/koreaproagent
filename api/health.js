import { hunterConfigured } from '../lib/hunter.js';

const MODELS_URL = 'https://api.groq.com/openai/v1/models';
const REQUIRED_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'];

function safeMessage(text = '') {
  return String(text).replace(/gsk_[A-Za-z0-9_-]+/g, '[redacted]').replace(/tvly-[A-Za-z0-9_-]+/g, '[redacted]').replace(/[A-Za-z0-9]{32,}/g, '[key]').slice(0, 280);
}

export async function GET() {
  const groqKeyConfigured = Boolean(process.env.GROQ_API_KEY);
  const tavilyKeyConfigured = Boolean(process.env.TAVILY_API_KEY);
  const hunterKeyConfigured = hunterConfigured();

  const result = {
    ok: false,
    groqConfigured: groqKeyConfigured,
    groqConnected: false,
    tavilyConfigured: tavilyKeyConfigured,
    hunterConfigured: hunterKeyConfigured,
    searchProvider: tavilyKeyConfigured ? 'tavily' : 'groq-browser-fallback',
    models: REQUIRED_MODELS,
    timestamp: new Date().toISOString()
  };

  if (!groqKeyConfigured) {
    result.error = 'GROQ_API_KEY is missing';
    return Response.json(result, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 7000);
    try {
      const response = await fetch(MODELS_URL, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, signal: c.signal, cache: 'no-store' });
      const raw = await response.text();
      if (!response.ok) {
        let detail = raw;
        try { detail = JSON.parse(raw)?.error?.message || raw } catch { }
        result.groqConnected = false;
        result.status = response.status;
        result.error = safeMessage(detail);
        return Response.json(result, { status: 502, headers: { 'Cache-Control': 'no-store' } });
      }
      let available = [];
      try {
        const payload = JSON.parse(raw);
        const ids = new Set(Array.isArray(payload?.data) ? payload.data.map(x => x?.id) : []);
        available = REQUIRED_MODELS.filter(id => ids.has(id));
      } catch { }
      result.ok = true;
      result.groqConnected = true;
      result.modelsAvailable = available;
      result.allModelsAvailable = available.length === REQUIRED_MODELS.length;
      return Response.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    } finally { clearTimeout(t); }
  } catch (error) {
    result.groqConnected = false;
    result.error = error?.name === 'AbortError' ? 'Groq connection check timed out' : safeMessage(error?.message || 'Groq connection failed');
    return Response.json(result, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
