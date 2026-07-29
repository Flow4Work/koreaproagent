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

function contentText(content) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map(part => {
      if (typeof part === 'string') return part;
      if (part?.type === 'text' && typeof part?.text === 'string') return part.text;
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function reasoningText(message = {}) {
  const candidates = [message.reasoning_content, message.reasoning, message.thinking];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

async function callZen({ prompt, maxTokens, timeoutMs, temperature }) {
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
    const choice = payload?.choices?.[0] || {};
    const message = choice?.message || {};
    return {
      payload,
      content: contentText(message.content),
      reasoning: reasoningText(message),
      finishReason: choice?.finish_reason || ''
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

async function groqFallback({ prompt, maxTokens, temperature }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Return only valid JSON. Do not wrap JSON in markdown.' },
          { role: 'user', content: prompt }
        ],
        temperature,
        max_tokens: Math.max(maxTokens, 4096)
      }),
      signal: controller.signal,
      cache: 'no-store'
    });
    const raw = await response.text();
    if (!response.ok) {
      let detail = raw;
      try { detail = JSON.parse(raw)?.error?.message || raw; } catch {}
      const e = new Error(`Groq HTTP ${response.status}: ${String(detail).slice(0, 300)}`);
      e.status = response.status;
      throw e;
    }
    const payload = JSON.parse(raw);
    const choice = payload?.choices?.[0] || {};
    const message = choice?.message || {};
    const content = contentText(message.content);
    const data = extractJson(content);
    return {
      data,
      usage: payload?.usage || null,
      model: payload?.model || 'groq-llama-3.3-70b',
      finishReason: choice?.finish_reason || '',
      usedReasoningFallback: false
    };
  } catch (e) {
    if (e?.name === 'AbortError') {
      const x = new Error('Groq fallback 응답 시간이 초과되었습니다.');
      x.status = 504;
      throw x;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function chatJson({ prompt, maxTokens = 1800, timeoutMs = 55000, temperature = 0 }) {
  if (!aiConfigured()) {
    const e = new Error('OPENCODE_ZEN_API_KEY가 Vercel 환경변수에 없습니다.');
    e.status = 503;
    throw e;
  }

  // 1st attempt: caller's maxTokens. 2nd attempt (content=null/length): bigger budget for reasoning+output.
  const budgets = [maxTokens, Math.max(maxTokens, 2500)];
  const effectiveTimeout = Math.max(55000, timeoutMs);
  let lastError = null;

  // Outer loop: retry transient errors (timeout/504) once after brief delay
  for (let outer = 0; outer < 2; outer++) {
    for (let attempt = 0; attempt < budgets.length; attempt++) {
      try {
        const result = await callZen({
          prompt,
          maxTokens: budgets[attempt],
          timeoutMs: effectiveTimeout,
          temperature
        });

        const candidates = [result.content, result.reasoning].filter(Boolean);
        for (const text of candidates) {
          try {
            return {
              data: extractJson(text),
              usage: result.payload?.usage || null,
              model: result.payload?.model || AI_MODEL,
              finishReason: result.finishReason,
              usedReasoningFallback: !result.content && Boolean(result.reasoning)
            };
          } catch (e) {
            lastError = e;
          }
        }

        const shouldRetry = attempt === 0 && (!result.content || result.finishReason === 'length');
        if (!shouldRetry) break;
      } catch (e) {
        lastError = e;
        // Transient: timeout (504/Abort) → break inner, let outer retry once
        if (e?.status === 504 || e?.name === 'AbortError') {
          if (outer === 0) {
            await new Promise(r => setTimeout(r, 800));
            break;
          }
          // Already retried once
          const timeout = new Error('DeepSeek timeout: 응답 시간이 초과되었습니다.');
          timeout.status = 504;
          throw timeout;
        }
        // Non-transient HTTP error or parse error → propagate immediately
        if (e?.status && e.status !== 504) {
          throw new Error(`DeepSeek HTTP ${e.status}: ${e.message}`);
        }
        throw e;
      }
    }
    // If inner loop broke due to transient error on first pass → retry outer
    const isTransient = lastError && (lastError.status === 504 || lastError.name === 'AbortError');
    if (isTransient && outer === 0) continue;
    break;
  }

  // DeepSeek exhausted → try Groq fallback if configured
  if (process.env.GROQ_API_KEY) {
    try {
      return await groqFallback({ prompt, maxTokens, temperature });
    } catch (groqError) {
      const msg = 'DeepSeek 실패 → Groq fallback도 실패했습니다.';
      const finalError = new Error(msg);
      finalError.status = 502;
      finalError.detail = {
        deepseek: lastError
          ? (lastError.status === 504 ? 'timeout' : lastError.message)
          : 'JSON 답변 미완성',
        groq: groqError?.message || 'unknown'
      };
      throw finalError;
    }
  }

  const e = new Error(lastError?.message || 'DeepSeek가 최종 JSON 답변을 완성하지 못했습니다. 다시 실행해주세요.');
  e.status = 502;
  throw e;
}

export async function checkAiConnection(timeoutMs = 7000) {
  if (!aiConfigured()) {
    return { ok: false, configured: false, available: false, error: 'OPENCODE_ZEN_API_KEY is missing' };
  }

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
