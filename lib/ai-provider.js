const ZEN_CHAT_URL = 'https://opencode.ai/zen/v1/chat/completions';
const ZEN_MODELS_URL = 'https://opencode.ai/zen/v1/models';

export const AI_PROVIDER = 'opencode-zen';
export const AI_MODEL = 'deepseek-v4-flash-free';

// Provider chain — max 1 call each, never retry same provider.
// 401/403 → immediate config error (no fallback).
// Total AI hard deadline ≤ 75s.
const PROVIDER_CHAIN = [
  { id: 'deepseek-v4-flash-free', type: 'zen',  model: 'deepseek-v4-flash-free', timeoutMs: 35000 },
  { id: 'zen-free-alt',           type: 'zen',  model: 'gpt-4o-mini-free',        timeoutMs: 35000 },
  { id: 'groq',                   type: 'groq', model: 'llama-3.3-70b-versatile',  timeoutMs: 30000 },
];

const TOTAL_DEADLINE_MS = 75000;

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
  const candidates = [message.reasoning_content, message.reasoning, message.thinking];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
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

async function callGroq({ model, prompt, maxTokens, timeoutMs, temperature }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
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
      const e = new Error(`Groq ${model} HTTP ${response.status}: ${String(detail).slice(0, 300)}`);
      e.httpStatus = response.status;
      e.statusCategory = response.status >= 400 && response.status < 500 ? 'client' : 'server';
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
      model: payload?.model || model,
      finishReason: choice?.finish_reason || '',
      usedReasoningFallback: false
    };
  } catch (e) {
    if (e?.name === 'AbortError') {
      const x = new Error(`Groq ${model} 응답 시간이 초과되었습니다.`);
      x.httpStatus = 504;
      x.statusCategory = 'server';
      throw x;
    }
    if (!e.httpStatus) { e.httpStatus = 0; e.statusCategory = 'unknown'; }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function chatJson({ prompt, maxTokens = 1800, timeoutMs = 35000, temperature = 0 }) {
  if (!aiConfigured()) {
    const e = new Error('OPENCODE_ZEN_API_KEY가 Vercel 환경변수에 없습니다.');
    e.status = 503;
    throw e;
  }

  const startTime = Date.now();
  const failures = [];

  for (const provider of PROVIDER_CHAIN) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= TOTAL_DEADLINE_MS) {
      failures.push({ provider: provider.id, reason: '전체 AI 처리 시간 75초 초과' });
      break;
    }

    if (provider.type === 'groq' && !groqConfigured()) continue;

    const remainingBudget = Math.min(provider.timeoutMs, TOTAL_DEADLINE_MS - elapsed);
    if (remainingBudget < 8000) {
      failures.push({ provider: provider.id, reason: '남은 시간 부족' });
      break;
    }

    try {
      const providerLabel = provider.id;

      if (provider.type === 'groq') {
        const result = await callGroq({
          model: provider.model, prompt, maxTokens,
          timeoutMs: remainingBudget, temperature
        });
        return {
          data: result.data,
          usage: result.usage || null,
          model: providerLabel,
          finishReason: result.finishReason,
          usedReasoningFallback: false,
          _providerChain: providerLabel
        };
      }

      const result = await callZen({
        model: provider.model, prompt, maxTokens,
        timeoutMs: remainingBudget, temperature
      });

      const candidates = [result.content, result.reasoning].filter(Boolean);
      let lastParseError = null;
      for (const text of candidates) {
        try {
          return {
            data: extractJson(text),
            usage: result.payload?.usage || null,
            model: providerLabel,
            finishReason: result.finishReason,
            usedReasoningFallback: !result.content && Boolean(result.reasoning),
            _providerChain: providerLabel
          };
        } catch (e) { lastParseError = e; }
      }

      if (!result.content && result.reasoning) {
        failures.push({ provider: providerLabel, reason: '추론만 있고 답변 없음' });
      } else if (!result.content) {
        failures.push({ provider: providerLabel, reason: '빈 응답' });
      } else {
        failures.push({ provider: providerLabel, reason: 'JSON 파싱 실패' });
      }
    } catch (e) {
      if (e.httpStatus === 401 || e.httpStatus === 403) {
        const configErr = new Error(`${provider.id} 설정 오류 (HTTP ${e.httpStatus}): API 키를 확인하세요.`);
        configErr.status = 503;
        throw configErr;
      }
      const reason = e.httpStatus === 504 ? 'timeout'
        : e.httpStatus >= 500 ? `HTTP ${e.httpStatus}`
        : e.httpStatus >= 429 ? '사용량 제한'
        : e.message || '알 수 없는 오류';
      failures.push({ provider: provider.id, reason });
    }
  }

  // All providers exhausted — build descriptive error
  const groqAvail = groqConfigured();
  const parts = [];
  if (failures.length >= 1) parts.push('DeepSeek ' + failures[0].reason);
  if (failures.length >= 2) parts.push('Zen fallback ' + failures[1].reason);
  if (failures.length >= 3) parts.push('Groq ' + failures[2].reason);
  if (!groqAvail && failures.length < 3) parts.push('Groq 미설정');
  const finalMsg = parts.join(' → ');
  const e = new Error(finalMsg);
  e.status = 502;
  e.detail = { chain: failures, groqConfigured: groqAvail };
  throw e;
}

export async function runInferenceSmoke(timeoutMs = 8000) {
  try {
    const result = await chatJson({
      prompt: 'Return only JSON: {"status":"ok","model":"test"}',
      maxTokens: 100,
      timeoutMs,
      temperature: 0
    });
    return { ok: true, model: result.model, providerChain: result._providerChain };
  } catch (e) {
    return { ok: false, error: redact(e.message || e) };
  }
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
