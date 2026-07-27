const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function clean(value, max = 1200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const fenced = String(text || "").match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }
  const first = String(text || "").indexOf("{");
  const last = String(text || "").lastIndexOf("}");
  if (first >= 0 && last > first) return JSON.parse(String(text).slice(first, last + 1));
  throw new Error("Groq returned invalid JSON");
}

async function callGroq({ model, prompt, timeoutMs, deep }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
        "Groq-Model-Version": "latest"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Find real current B2B companies using web research. Never invent facts. Return JSON only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
        citation_options: "disabled",
        compound_custom: { tools: { enabled_tools: deep ? ["web_search", "visit_website"] : ["web_search"] } }
      }),
      signal: controller.signal
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Groq HTTP ${response.status}: ${raw.slice(0, 500)}`);
    const payload = JSON.parse(raw);
    return parseJson(payload?.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request) {
  if (!process.env.GROQ_API_KEY) return Response.json({ error: "GROQ_API_KEY is missing." }, { status: 503 });
  let body = {};
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  const count = Math.max(3, Math.min(5, Number.parseInt(body.count, 10) || 3));
  const focus = clean(body.focus, 1800);

  const prompt = `Find ${count} overseas B2B SaaS/AI companies that are plausible buyers of a low-risk Korea market-entry sales pilot now.\n\nBuyer profile: ${focus || "Seed-Series B B2B SaaS/AI, recent APAC/Japan/Singapore/global expansion or sales/partnership hiring, clear Korea B2B use case, and no obvious mature Korea sales team."}\n\nFor each candidate verify a current trigger with public web evidence. Avoid giant companies. Do NOT research Korean target accounts yet; that happens in the next stage.\n\nReturn JSON only:\n{"candidates":[{"company":"","url":"","country":"","category":"","trigger":"","source_urls":[],"recommended_role":"","contact_search_query":""}],"strategy":{"best_segment":"","pitch":""}}`;

  const attempts = [
    { model: "groq/compound", timeoutMs: 26000, deep: true },
    { model: "groq/compound-mini", timeoutMs: 16000, deep: false }
  ];
  const failures = [];
  for (const attempt of attempts) {
    try {
      const data = await callGroq({ ...attempt, prompt });
      const candidates = Array.isArray(data?.candidates) ? data.candidates.slice(0, count).map(c => ({
        company: clean(c?.company, 140),
        url: clean(c?.url, 350),
        country: clean(c?.country, 80),
        category: clean(c?.category, 120),
        trigger: clean(c?.trigger, 700),
        source_urls: Array.isArray(c?.source_urls) ? c.source_urls.filter(x => /^https?:\/\//i.test(String(x))).slice(0, 5) : [],
        recommended_role: clean(c?.recommended_role, 120),
        contact_search_query: clean(c?.contact_search_query, 280)
      })).filter(c => c.company && /^https?:\/\//i.test(c.url)) : [];
      if (!candidates.length) throw new Error("No usable candidates returned");
      return Response.json({ candidates, strategy: data?.strategy || {}, meta: { model: attempt.model, fallback_used: attempt !== attempts[0] } }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      failures.push(error?.name === "AbortError" ? "timeout" : clean(error?.message, 600));
    }
  }
  return Response.json({ error: `Candidate discovery failed. ${failures.join(" | ")}` }, { status: 502 });
}