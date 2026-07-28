import { hunterConfigured } from '../lib/hunter.js';
import { AI_MODEL, AI_PROVIDER, aiConfigured, checkAiConnection } from '../lib/ai-provider.js';

function safeMessage(text = '') {
  return String(text)
    .replace(/tvly-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/[A-Za-z0-9]{32,}/g, '[key]')
    .slice(0, 280);
}

export async function GET() {
  const zenKeyConfigured = aiConfigured();
  const tavilyKeyConfigured = Boolean(process.env.TAVILY_API_KEY);
  const hunterKeyConfigured = hunterConfigured();

  const ai = await checkAiConnection();
  const result = {
    ok: false,
    aiProvider: AI_PROVIDER,
    aiModel: AI_MODEL,
    aiConfigured: zenKeyConfigured,
    aiConnected: Boolean(ai.ok),
    aiModelAvailable: Boolean(ai.available),
    tavilyConfigured: tavilyKeyConfigured,
    hunterConfigured: hunterKeyConfigured,
    searchProvider: 'tavily',
    models: [AI_MODEL],
    timestamp: new Date().toISOString(),

    // Legacy aliases so the current frontend keeps working during migration.
    groqConfigured: zenKeyConfigured,
    groqConnected: Boolean(ai.ok),
    allModelsAvailable: Boolean(ai.available)
  };

  if (!zenKeyConfigured) {
    result.error = 'OPENCODE_ZEN_API_KEY is missing';
    return Response.json(result, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!ai.ok) {
    result.status = ai.status || 502;
    result.error = safeMessage(ai.error || 'OpenCode Zen connection failed');
    return Response.json(result, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!tavilyKeyConfigured) {
    result.error = 'TAVILY_API_KEY is missing';
    return Response.json(result, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  result.ok = true;
  return Response.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
