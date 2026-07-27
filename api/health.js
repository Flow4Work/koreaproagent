const MODELS_URL = "https://api.groq.com/openai/v1/models";

function safeMessage(text = "") {
  return String(text).replace(/gsk_[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 280);
}

export async function GET() {
  const model = process.env.GROQ_MODEL || "groq/compound";
  const configured = Boolean(process.env.GROQ_API_KEY);

  if (!configured) {
    return Response.json({
      ok: false,
      groqConfigured: false,
      groqConnected: false,
      model,
      error: "GROQ_API_KEY is missing",
      timestamp: new Date().toISOString()
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(MODELS_URL, {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      signal: controller.signal,
      cache: "no-store"
    });

    const raw = await response.text();
    if (!response.ok) {
      let detail = raw;
      try { detail = JSON.parse(raw)?.error?.message || raw; } catch {}
      return Response.json({
        ok: false,
        groqConfigured: true,
        groqConnected: false,
        model,
        status: response.status,
        error: safeMessage(detail || `Groq returned HTTP ${response.status}`),
        timestamp: new Date().toISOString()
      });
    }

    let modelAvailable = null;
    try {
      const payload = JSON.parse(raw);
      modelAvailable = Array.isArray(payload?.data) ? payload.data.some(item => item?.id === model) : null;
    } catch {}

    return Response.json({
      ok: true,
      groqConfigured: true,
      groqConnected: true,
      model,
      modelAvailable,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return Response.json({
      ok: false,
      groqConfigured: true,
      groqConnected: false,
      model,
      error: error?.name === "AbortError" ? "Groq connection check timed out" : safeMessage(error?.message || "Groq connection failed"),
      timestamp: new Date().toISOString()
    });
  } finally {
    clearTimeout(timeout);
  }
}
