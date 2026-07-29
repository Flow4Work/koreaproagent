import { contactDiscoveryConfigured, contactProviderStatus } from '../lib/contact-discovery.js';
import { AI_MODEL, AI_PROVIDER, aiConfigured, groqConfigured, checkAiConnection, runInferenceSmoke } from '../lib/ai-provider.js';

function safeMessage(text = '') {
  return String(text)
    .replace(/tvly-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/[A-Za-z0-9]{32,}/g, '[key]')
    .slice(0, 280);
}

export async function GET() {
  const zenKeyConfigured = aiConfigured();
  const groqKeyConfigured = groqConfigured();
  const tavilyKeyConfigured = Boolean(process.env.TAVILY_API_KEY);
  const contactProviders = contactProviderStatus();
  const contactsConfigured = contactDiscoveryConfigured();

  const ai = await checkAiConnection();

  // Run lightweight inference smoke test (≤ 8s) to verify actual model works
  let smokeResult = null;
  if (zenKeyConfigured && ai.ok) {
    smokeResult = await runInferenceSmoke(8000);
  }

  const result = {
    ok: false,
    aiProvider: AI_PROVIDER,
    aiModel: AI_MODEL,
    opencodeConfigured: zenKeyConfigured,
    opencodeConnected: Boolean(ai.ok),
    opencodeModelAvailable: Boolean(ai.available),
    groqConfigured: groqKeyConfigured,
    tavilyConfigured: tavilyKeyConfigured,
    inferenceSmokeOk: Boolean(smokeResult?.ok),
    inferenceSmokeModel: smokeResult?.model || null,
    contactDiscoveryConfigured: contactsConfigured,
    contactProviders,
    searchProvider: 'tavily',
    models: ai.models || [AI_MODEL],
    timestamp: new Date().toISOString(),

    // Legacy aliases for frontend compatibility
    aiConfigured: zenKeyConfigured,
    aiConnected: Boolean(ai.ok),
    aiModelAvailable: Boolean(ai.available),
    allModelsAvailable: Boolean(ai.available)
  };

  if (!zenKeyConfigured) {
    result.status = 'opencode_missing';
    result.error = 'OPENCODE_ZEN_API_KEY is missing';
    return Response.json(result, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!ai.ok) {
    result.status = ai.status || 'opencode_connection_failed';
    result.error = safeMessage(ai.error || 'OpenCode Zen connection failed');
    return Response.json(result, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!tavilyKeyConfigured) {
    result.status = 'tavily_missing';
    result.error = 'TAVILY_API_KEY is missing';
    return Response.json(result, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  // Only mark ok if inference smoke test also passed
  result.ok = Boolean(smokeResult?.ok);
  if (!result.ok) {
    result.status = 'inference_smoke_failed';
    result.error = safeMessage(smokeResult?.error || 'AI 연결됨 but inference smoke test 실패');
  }
  return Response.json(result, { status: result.ok ? 200 : 502, headers: { 'Cache-Control': 'no-store' } });
}
