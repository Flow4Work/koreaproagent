const ZEN_CHAT_URL = 'https://opencode.ai/zen/v1/chat/completions';
const ZEN_MODELS_URL = 'https://opencode.ai/zen/v1/models';
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const AI_PROVIDER = 'provider-chain';
export const AI_MODEL = 'deepseek-v4-flash-free';

// Each provider is tried at most once. The alternate Zen model is a currently
// published OpenCode free model and can be replaced without changing callers.
const PROVIDER_CHAIN = [
  { id: 'deepseek-v4-flash-free', type: 'zen', model: 'deepseek-v4-flash-free', timeoutMs: 30000 },
  { id: 'mimo-v2.5-free', type: 'zen', model: 'mimo-v2.5-free', timeoutMs: 20000 },
  { id: 'groq', type: 'groq', model: 'llama-3.3-70b-versatile', timeoutMs: 18000 }
];

const TOTAL_DEADLINE_MS = 70000;

export function aiConfigured() {
  return Boolean(process.env.OPENCODE_ZEN_API_KEY);
}

export function groqConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
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
  for (const value of [message.reasoning_content, message.reasoning, message.thinking]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function providerError(message, httpStatus = 0) {
  const error = new Error(message);
  error.httpStatus = Number(httpStatus) || 0;
  return error;
}

async function callZen({ model, prompt, maxTokens, timeoutMs, temperature }) {
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
        model,
        messages: [
          { role: 'system', content: 'Return only valid JSON. Do not wrap JSON in markdown. Do not invent facts outside the supplied evidence.' },
          { role: 'user', content: prompt }
        ],
        temperature,
        max_tokens: model === AI_MODEL ? Math.max(maxTokens, 2500) : maxTokens
      }),
      signal: controller.signal,
      cache: 'no-store'
    });

    const raw = await response.text();
    if (!response.ok) {
      let detail = raw;
      try { detail = JSON.parse(raw)?.error?.message || raw; } catch {}
      throw providerError(`OpenCode Zen ${model} HTTP ${response.status}: ${redact(detail)}`, response.status);
    }

    let payload;
    try { payload = JSON.parse(raw); }
    catch { throw providerError(`OpenCode Zen ${model} returned invalid JSON`, 502); }

    const choice = payload?.choices?.[0] || {};
    const message = choice?.message || {};
    return {
      payload,
      content: contentText(message.content),
      reasoning: reasoningText(message),
      finishReason: choice?.finish_reason || '',
      model: payload?.model || model
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw providerError(`OpenCode Zen ${model} timeout`, 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function callGroq({ model, prompt, maxTokens, timeoutMs, temperature }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
          { role: 'system', content: 'Return only valid JSON. Do not wrap JSON in markdown. Do not invent facts outside the supplied evidence.' },
          { role: 'user', content: prompt }
        ],
        temperature,
        max_tokens: Math.max(maxTokens, 2200)
      }),
      signal: controller.signal,
      cache: 'no-store'
    });

    const raw = await response.text();
    if (!response.ok) {
      let detail = raw;
      try { detail = JSON.parse(raw)?.error?.message || raw; } catch {}
      throw providerError(`Groq ${model} HTTP ${response.status}: ${redact(detail)}`, response.status);
    }

    let payload;
    try { payload = JSON.parse(raw); }
    catch { throw providerError(`Groq ${model} returned invalid JSON`, 502); }

    const choice = payload?.choices?.[0] || {};
    const message = choice?.message || {};
    return {
      data: extractJson(contentText(message.content)),
      usage: payload?.usage || null,
      model: payload?.model || model,
      finishReason: choice?.finish_reason || ''
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw providerError(`Groq ${model} timeout`, 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function failureReason(error) {
  const status = Number(error?.httpStatus) || 0;
  if (status === 504) return 'timeout';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return `HTTP_${status}`;
  if (status >= 400) return `HTTP_${status}`;
  return redact(error?.message || 'unknown_error');
}

export async function chatJson({
  prompt,
  maxTokens = 1800,
  timeoutMs = 30000,
  temperature = 0,
  hardDeadlineMs = TOTAL_DEADLINE_MS
}) {
  if (!aiConfigured()) {
    const error = new Error('OPENCODE_ZEN_API_KEY가 Vercel 환경변수에 없습니다.');
    error.status = 503;
    throw error;
  }

  const startedAt = Date.now();
  const deadline = Math.min(TOTAL_DEADLINE_MS, Math.max(8000, Number(hardDeadlineMs) || TOTAL_DEADLINE_MS));
  const callerTimeout = Math.max(8000, Number(timeoutMs) || 30000);
  const failures = [];

  for (const provider of PROVIDER_CHAIN) {
    if (provider.type === 'groq' && !groqConfigured()) {
      failures.push({ provider: provider.id, reason: 'not_configured' });
      continue;
    }

    const elapsed = Date.now() - startedAt;
    const remaining = deadline - elapsed;
    if (remaining < 2500) {
      failures.push({ provider: provider.id, reason: 'deadline_exhausted' });
      break;
    }

    const providerTimeout = Math.max(2000, Math.min(provider.timeoutMs, callerTimeout, remaining - 250));

    try {
      if (provider.type === 'groq') {
        const result = await callGroq({
          model: provider.model,
          prompt,
          maxTokens,
          timeoutMs: providerTimeout,
          temperature
        });
        return {
          data: result.data,
          usage: result.usage,
          model: result.model,
          finishReason: result.finishReason,
          usedReasoningFallback: false,
          _providerChain: provider.id,
          _failuresBeforeSuccess: failures
        };
      }

      const result = await callZen({
        model: provider.model,
        prompt,
        maxTokens,
        timeoutMs: providerTimeout,
        temperature
      });

      const texts = [result.content, result.reasoning].filter(Boolean);
      let parseError = null;
      for (const text of texts) {
        try {
          return {
            data: extractJson(text),
            usage: result.payload?.usage || null,
            model: result.model,
            finishReason: result.finishReason,
            usedReasoningFallback: !result.content && Boolean(result.reasoning),
            _providerChain: provider.id,
            _failuresBeforeSuccess: failures
          };
        } catch (error) {
          parseError = error;
        }
      }

      if (!texts.length) failures.push({ provider: provider.id, reason: 'empty_response' });
      else failures.push({ provider: provider.id, reason: redact(parseError?.message || 'invalid_json') });
    } catch (error) {
      const status = Number(error?.httpStatus) || 0;
      if (status === 401 || status === 403) {
        const configError = new Error(`${provider.id} 설정 오류 (HTTP ${status}): API 키를 확인하세요.`);
        configError.status = 503;
        throw configError;
      }
      failures.push({ provider: provider.id, reason: failureReason(error) });
    }
  }

  const attempted = failures.filter(row => row.reason !== 'not_configured');
  const message = failures.map(row => `${row.provider}:${row.reason}`).join(' → ') || '사용 가능한 AI 공급자가 없습니다.';
  const error = new Error(message);
  error.status = attempted.length && attempted.every(row => row.reason === 'rate_limit') ? 429 : 502;
  error.detail = { chain: failures, groqConfigured: groqConfigured() };
  throw error;
}

export async function runInferenceSmoke(timeoutMs = 8000) {
  const perProvider = Math.max(1800, Math.floor(Math.max(4000, timeoutMs) / 3));
  const failures = [];

  for (const provider of PROVIDER_CHAIN) {
    if (provider.type === 'groq' && !groqConfigured()) continue;
    try {
      if (provider.type === 'groq') {
        const result = await callGroq({
          model: provider.model,
          prompt: 'Return only JSON: {"status":"ok"}',
          maxTokens: 60,
          timeoutMs: perProvider,
          temperature: 0
        });
        return { ok: result?.data?.status === 'ok', model: result.model, providerChain: provider.id };
      }

      const result = await callZen({
        model: provider.model,
        prompt: 'Return only JSON: {"status":"ok"}',
        maxTokens: 60,
        timeoutMs: perProvider,
        temperature: 0
      });
      for (const text of [result.content, result.reasoning].filter(Boolean)) {
        try {
          const data = extractJson(text);
          if (data?.status === 'ok') return { ok: true, model: result.model, providerChain: provider.id };
        } catch {}
      }
      failures.push(`${provider.id}:invalid_response`);
    } catch (error) {
      failures.push(`${provider.id}:${failureReason(error)}`);
    }
  }

  return { ok: false, error: failures.join(' → ') || 'inference smoke failed' };
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
    const models = Array.isArray(payload?.data) ? payload.data.map(row => row?.id).filter(Boolean) : [];
    const ids = new Set(models);
    return {
      ok: true,
      configured: true,
      available: ids.has(AI_MODEL),
      alternateAvailable: ids.has('mimo-v2.5-free'),
      modelCount: models.length,
      models
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      available: false,
      error: error?.name === 'AbortError' ? 'OpenCode Zen connection check timed out' : redact(error?.message || error)
    };
  } finally {
    clearTimeout(timer);
  }
}
