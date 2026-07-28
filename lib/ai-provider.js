const ZEN_CHAT_URL = 'https://opencode.ai/zen/v1/chat/completions';
const ZEN_MODELS_URL = 'https://opencode.ai/zen/v1/models';

export const AI_PROVIDER = 'opencode-zen';
export const AI_MODEL = 'deepseek-v4-flash-free';

export function aiConfigured() {
  return Boolean(process.env.OPENCODE_ZEN_API_KEY);
}

function redact(value = '') {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[key]')
    .slice(0, 700);
}

function extractJson(text = '') {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('AI 응답이 비어 있습니다.');
  try { return JSON.parse(raw); } catch {}

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    try { return JSON.parse(fenced); } catch {}
  }

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch {}
  }
  throw new Error('AI가 유효한 JSON을 반환하지 않았습니다.');
}

export async function chatJson({ prompt, maxTokens = 1800, timeoutMs = 35000, temperature = 0 }) {
  if (!aiConfigured()) {
    const e = new Error('OPENCODE_ZEN_API_KEY가 Vercel 환경변수에 없습니다.');
    e.status = 503;
    throw e;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(ZEN_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENCODE_ZEN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: 'Return only valid JSON. Do not wrap JSON in markdown.' },
          { role: 'user', content: prompt }
        ],
        temperature,
        max_tokens: maxTokens
      }),
      signal: controller.signal,
      cache: 'no-store'
    });

    const raw = await response.text();
    if (!response.ok) {
      let detail = raw;
      try { detail = JSON.parse(raw)?.error?.message || raw; } catch {}
      const e = new Error(`OpenCode Zen HTTP ${response.status}: ${redact(detail)}`);
      e.status = response.status;
      e.retryAfter = response.headers.get('retry-after');
      throw e;
    }

    const payload = JSON.parse(raw);
    const content = payload?.choices?.[0]?.message?.content;
    return {
      data: extractJson(content),
      usage: payload?.usage || null,
      model: payload?.model || AI_MODEL
    };
  } catch (e) {
    if (e?.name === 'AbortError') {
      const x = new Error('OpenCode Zen 응답 시간이 초과되었습니다.');
      x.status = 504;
      throw x;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkAiConnection(timeoutMs = 7000) {
  if (!aiConfigured()) return { ok: false, configured: false, available: false, error: 'OPENCODE_ZEN_API_KEY is missing' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(ZEN_MODELS_URL, {
      headers: { Authorization: `Bearer ${process.env.OPENCODE_ZEN_API_KEY}` },
      signal: controller.signal,
      cache: 'no-store'
    });
    const raw = await response.text();
    if (!response.ok) {
      let detail = raw;
      try { detail = JSON.parse(raw)?.error?.message || raw; } catch {}
      return { ok: false, configured: true, available: false, status: response.status, error: redact(detail) };
    }
    const payload = JSON.parse(raw);
    const ids = new Set(Array.isArray(payload?.data) ? payload.data.map(x => x?.id).filter(Boolean) : []);
    return { ok: true, configured: true, available: ids.has(AI_MODEL), modelCount: ids.size };
  } catch (e) {
    return {
      ok: false,
      configured: true,
      available: false,
      error: e?.name === 'AbortError' ? 'OpenCode Zen connection check timed out' : redact(e?.message || e)
    };
  } finally {
    clearTimeout(timer);
  }
}
