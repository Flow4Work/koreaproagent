import { contactProviderStatus } from '../lib/contact-discovery-v2.js';
import { contactDiscoveryConfigured } from '../lib/contact-discovery.js';
import { AI_MODEL, AI_PROVIDER, aiConfigured, groqConfigured, checkAiConnection, runInferenceSmoke } from '../lib/ai-provider.js';

function safeMessage(text = '') {
  return String(text)
    .replace(/tvly-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/[A-Za-z0-9]{32,}/g, '[key]')
    .slice(0, 280);
}

export async function GET() {
  const opencodeConfigured = aiConfigured();
  const groqKeyConfigured = groqConfigured();
  const tavilyConfigured = Boolean(process.env.TAVILY_API_KEY);
  const contactProviders = contactProviderStatus();
  const contactsConfigured = contactDiscoveryConfigured();

  let ai = { ok: false, available: false, error: 'OpenCode not configured' };
  let smoke = null;

  if (opencodeConfigured) {
    ai = await checkAiConnection();
    if (ai.ok) smoke = await runInferenceSmoke(8000);
  }

  const aiReady = Boolean(opencodeConfigured && ai.ok && smoke?.ok);
  const searchReady = tavilyConfigured;

  const result = {
    ok: Boolean(searchReady && aiReady),
    searchReady,
    aiReady,
    aiProvider: AI_PROVIDER,
    aiModel: AI_MODEL,
    opencodeConfigured,
    opencodeConnected: Boolean(ai.ok),
    opencodeModelAvailable: Boolean(ai.available),
    groqConfigured: groqKeyConfigured,
    tavilyConfigured,
    inferenceSmokeOk: Boolean(smoke?.ok),
    inferenceSmokeModel: smoke?.model || null,
    inferenceSmokeError: smoke?.ok ? null : safeMessage(smoke?.error || ai.error || 'AI inference unavailable'),
    contactDiscoveryConfigured: contactsConfigured,
    contactProviders,
    searchProvider: 'tavily',
    timestamp: new Date().toISOString(),

    // Legacy aliases kept for older frontend versions.
    aiConfigured: opencodeConfigured,
    aiConnected: Boolean(ai.ok),
    aiModelAvailable: Boolean(ai.available),
    allModelsAvailable: Boolean(ai.available)
  };

  if (!tavilyConfigured) {
    result.status = 'tavily_missing';
    result.error = 'TAVILY_API_KEY is missing';
    return Response.json(result, { status: 503, headers: { 'Cache-Control':'no-store' } });
  }

  if (!aiReady) {
    result.status = 'search_ready_ai_degraded';
    result.warning = safeMessage(smoke?.error || ai.error || 'AI inference is currently degraded');
  } else {
    result.status = 'ready';
  }

  // Fast hunt only needs search. AI degradation is reported but does not block the app.
  return Response.json(result, { status: 200, headers: { 'Cache-Control':'no-store' } });
}
