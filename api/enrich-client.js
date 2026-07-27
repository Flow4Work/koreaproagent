const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function clean(value, max = 1600) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const s = String(text || "");
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) return JSON.parse(s.slice(first, last + 1));
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
          { role: "system", content: "Research one B2B company deeply with current public web evidence. Never invent people, emails, companies or URLs. Return JSON only." },
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

function sanitizeLead(data, candidate) {
  const lead = data?.lead || data || {};
  const targets = Array.isArray(lead?.sample_korean_targets) ? lead.sample_korean_targets.slice(0, 3).map(t => ({
    company: clean(t?.company, 120),
    url: clean(t?.url, 350),
    reason: clean(t?.reason, 500),
    source_urls: Array.isArray(t?.source_urls) ? t.source_urls.filter(x => /^https?:\/\//i.test(String(x))).slice(0, 5) : []
  })).filter(t => t.company) : [];
  return {
    company: clean(lead?.company, 140) || candidate.company,
    url: clean(lead?.url, 350) || candidate.url,
    country: clean(lead?.country, 80) || candidate.country,
    category: clean(lead?.category, 120) || candidate.category,
    fit_score: Math.max(0, Math.min(100, Number(lead?.fit_score) || 0)),
    why_buy_our_service: clean(lead?.why_buy_our_service, 800),
    why_now: clean(lead?.why_now, 700) || candidate.trigger,
    source_urls: Array.isArray(lead?.source_urls) ? lead.source_urls.filter(x => /^https?:\/\//i.test(String(x))).slice(0, 8) : (candidate.source_urls || []),
    decision_maker_name: clean(lead?.decision_maker_name, 120),
    decision_maker_title: clean(lead?.decision_maker_title, 120),
    decision_maker_profile_url: clean(lead?.decision_maker_profile_url, 400),
    recommended_role: clean(lead?.recommended_role, 120) || candidate.recommended_role,
    contact_search_query: clean(lead?.contact_search_query, 280) || candidate.contact_search_query,
    korea_opportunity: clean(lead?.korea_opportunity, 800),
    sample_korean_targets: targets,
    outreach_en: clean(lead?.outreach_en, 1400),
    outreach_ko: clean(lead?.outreach_ko, 1400),
    confidence: ["high", "medium", "low"].includes(String(lead?.confidence).toLowerCase()) ? String(lead.confidence).toLowerCase() : "medium",
    warning: clean(lead?.warning, 400)
  };
}

export async function POST(request) {
  if (!process.env.GROQ_API_KEY) return Response.json({ error: "GROQ_API_KEY is missing." }, { status: 503 });
  let body = {};
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  const candidate = body?.candidate || {};
  const mode = body.mode === "deep" ? "deep" : "fast";
  if (!clean(candidate.company) || !/^https?:\/\//i.test(clean(candidate.url))) return Response.json({ error: "A valid candidate is required." }, { status: 400 });

  const prompt = `Research this ONE overseas SaaS/AI company for our Korea Pipeline Pilot.\n\nCOMPANY\n${clean(candidate.company, 140)}\n${clean(candidate.url, 350)}\nCurrent trigger from stage 1: ${clean(candidate.trigger, 700)}\nKnown sources: ${(candidate.source_urls || []).join(" | ")}\n\nOUR OFFER\nFor KRW 390,000 we map Korean companies likely to buy its product, current buying reasons, relevant buyer roles, and personalized outreach before it hires a Korea team.\n\nTASK\n1. Verify the product and current expansion/need signal.\n2. Explain why this company could buy our Korea pilot now.\n3. Find 1-3 REAL Korean companies that plausibly need its product, with official URLs and evidence where possible.\n4. Find a publicly verified decision maker only if evidence is clear; otherwise return the best role + a search query. Never guess emails.\n5. Write one short English cold email mentioning a verified trigger and that we already mapped a few Korea-fit accounts.\n6. Score 0-100 using Korea fit, trigger strength, buyer accessibility, evidence quality.\n\nReturn JSON only:\n{"lead":{"company":"","url":"","country":"","category":"","fit_score":0,"why_buy_our_service":"","why_now":"","source_urls":[],"decision_maker_name":"","decision_maker_title":"","decision_maker_profile_url":"","recommended_role":"","contact_search_query":"","korea_opportunity":"","sample_korean_targets":[{"company":"","url":"","reason":"","source_urls":[]}],"outreach_en":"","outreach_ko":"","confidence":"high|medium|low","warning":""}}`;

  const attempts = mode === "deep"
    ? [
        { model: "groq/compound", timeoutMs: 30000, deep: true },
        { model: "groq/compound-mini", timeoutMs: 16000, deep: false }
      ]
    : [
        { model: "groq/compound-mini", timeoutMs: 16000, deep: false },
        { model: "groq/compound", timeoutMs: 26000, deep: true }
      ];

  const failures = [];
  for (const attempt of attempts) {
    try {
      const data = await callGroq({ ...attempt, prompt });
      const lead = sanitizeLead(data, candidate);
      if (!lead.why_buy_our_service && !lead.korea_opportunity) throw new Error("Enrichment returned insufficient data");
      return Response.json({ lead, meta: { model: attempt.model, mode, fallback_used: attempt !== attempts[0] } }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      failures.push(error?.name === "AbortError" ? "timeout" : clean(error?.message, 600));
    }
  }
  return Response.json({ error: `Company enrichment failed. ${failures.join(" | ")}` }, { status: 502 });
}