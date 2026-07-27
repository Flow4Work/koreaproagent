export function GET() {
  return Response.json({
    ok: true,
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    model: process.env.GROQ_MODEL || "groq/compound",
    timestamp: new Date().toISOString()
  });
}
