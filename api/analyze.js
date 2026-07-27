const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function normalizeUrl(value) {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function cleanText(value, max = 4000) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").trim().slice(0, max);
}

function parseMaybeJson(text) {
  if (!text) throw new Error("Empty model response");
  try { return JSON.parse(text); } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) return JSON.parse(text.slice(first, last + 1));
  throw new Error("Model did not return valid JSON");
}

function sanitizeResult(data, clientUrl) {
  const prospects = Array.isArray(data?.prospects) ? data.prospects.slice(0, 20) : [];
  return {
    generated_at: new Date().toISOString(),
    client: {
      name: cleanText(data?.client?.name, 120),
      url: cleanText(data?.client?.url, 300) || clientUrl,
      product: cleanText(data?.client?.product, 700),
      korea_value_proposition: cleanText(data?.client?.korea_value_proposition, 700)
    },
    icp: {
      summary: cleanText(data?.icp?.summary, 900),
      industries: Array.isArray(data?.icp?.industries) ? data.icp.industries.map(v => cleanText(String(v), 80)).filter(Boolean).slice(0, 10) : [],
      company_signals: Array.isArray(data?.icp?.company_signals) ? data.icp.company_signals.map(v => cleanText(String(v), 160)).filter(Boolean).slice(0, 12) : [],
      buyer_roles: Array.isArray(data?.icp?.buyer_roles) ? data.icp.buyer_roles.map(v => cleanText(String(v), 100)).filter(Boolean).slice(0, 10) : []
    },
    prospects: prospects.map((p, idx) => ({
      rank: idx + 1,
      company: cleanText(p?.company, 120),
      url: cleanText(p?.url, 300),
      industry: cleanText(p?.industry, 100),
      fit_score: Math.max(0, Math.min(100, Number(p?.fit_score) || 0)),
      why_fit: cleanText(p?.why_fit, 600),
      buying_signal: cleanText(p?.buying_signal, 500),
      signal_date: cleanText(p?.signal_date, 50),
      source_urls: Array.isArray(p?.source_urls) ? p.source_urls.map(v => cleanText(String(v), 400)).filter(v => /^https?:\/\//i.test(v)).slice(0, 6) : [],
      contact_name: cleanText(p?.contact_name, 120),
      contact_title: cleanText(p?.contact_title, 120),
      contact_profile_url: cleanText(p?.contact_profile_url, 400),
      recommended_role: cleanText(p?.recommended_role, 120),
      contact_search_query: cleanText(p?.contact_search_query, 250),
      sales_angle: cleanText(p?.sales_angle, 500),
      message_ko: cleanText(p?.message_ko, 1100),
      message_en: cleanText(p?.message_en, 1100),
      confidence: ["high", "medium", "low"].includes(String(p?.confidence).toLowerCase()) ? String(p.confidence).toLowerCase() : "medium",
      warning: cleanText(p?.warning, 300)
    })).filter(p => p.company),
    strategy: {
      first_segment: cleanText(data?.strategy?.first_segment, 400),
      core_offer: cleanText(data?.strategy?.core_offer, 500),
      outreach_sequence: Array.isArray(data?.strategy?.outreach_sequence) ? data.strategy.outreach_sequence.map(v => cleanText(String(v), 250)).filter(Boolean).slice(0, 7) : [],
      next_action: cleanText(data?.strategy?.next_action, 500)
    },
    research_notes: Array.isArray(data?.research_notes) ? data.research_notes.map(v => cleanText(String(v), 350)).filter(Boolean).slice(0, 12) : []
  };
}

export async function POST(request) {
  if (!process.env.GROQ_API_KEY) return Response.json({ error: "GROQ_API_KEY is not configured. Add it in Vercel Project Settings → Environment Variables." }, { status: 503 });

  let body = {};
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const clientUrl = normalizeUrl(body.clientUrl);
  if (!clientUrl) return Response.json({ error: "A valid client URL is required." }, { status: 400 });

  const count = clampInt(body.count, 3, 20, 8);
  const productHint = cleanText(body.productHint, 1600);
  const targetNotes = cleanText(body.targetNotes, 1800);
  const seeds = cleanText(body.seeds, 5000);
  const mode = body.mode === "fast" ? "fast" : "deep";
  const model = mode === "fast" ? "groq/compound-mini" : (process.env.GROQ_MODEL || "groq/compound");

  const prompt = `You are a rigorous B2B go-to-market research agent for the South Korean market.

MISSION
Research the client's product and produce a sourced Korea Prospect Pack with exactly ${count} ranked Korean target companies when evidence is available.

CLIENT URL
${clientUrl}

OPTIONAL PRODUCT HINT
${productHint || "None. Infer carefully from the official website."}

OPTIONAL TARGET NOTES
${targetNotes || "None. Determine a sensible ICP for Korea."}

OPTIONAL SEED PROSPECTS
${seeds || "None. Discover candidates yourself."}

RESEARCH RULES
1. Visit/research the client website first. Do not guess the product.
2. Focus on companies operating in South Korea that plausibly have a current use case for the product.
3. Prefer concrete buying signals: recent hiring, expansion, funding, product launch, overseas growth, customer-support load, technology changes, partnerships, regulation, or other evidence relevant to this product.
4. Every non-obvious prospect claim must have one or more source_urls. Prefer official company pages, job posts, filings, reputable news, or public professional profiles.
5. Never invent a person's name, title, profile URL, email address, funding event, hiring event, customer count, or source URL.
6. contact_name/contact_title/contact_profile_url may be filled ONLY when a public source clearly verifies them. Otherwise leave those fields empty and provide recommended_role + contact_search_query.
7. Never infer or generate private/personal email addresses. This MVP does not output guessed emails.
8. Scores must reflect evidence quality and commercial fit, not company fame.
9. Korean outbound message must be natural, brief, specific, and not claim facts unsupported by sources. English message should explain the same approach simply.
10. If evidence is weak, say so in warning and lower confidence.
11. Use current web research. Prefer recent signals but do not fabricate dates.

SCORING
- 40 points: clear product/use-case fit
- 30 points: current buying signal
- 20 points: likely reachable relevant team
- 10 points: evidence quality

OUTPUT
Return ONLY a valid JSON object, with no markdown, matching this shape:
{
  "client": {"name":"","url":"","product":"","korea_value_proposition":""},
  "icp": {"summary":"","industries":[],"company_signals":[],"buyer_roles":[]},
  "prospects": [
    {
      "company":"","url":"","industry":"","fit_score":0,
      "why_fit":"","buying_signal":"","signal_date":"",
      "source_urls":[],
      "contact_name":"","contact_title":"","contact_profile_url":"",
      "recommended_role":"","contact_search_query":"",
      "sales_angle":"","message_ko":"","message_en":"",
      "confidence":"high|medium|low","warning":""
    }
  ],
  "strategy": {"first_segment":"","core_offer":"","outreach_sequence":[],"next_action":""},
  "research_notes":[]
}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), mode === "fast" ? 25000 : 55000);

  try {
    const groqResponse = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
        "Groq-Model-Version": "latest"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Be evidence-first. Use live web tools where useful. Output strict JSON only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
      }),
      signal: controller.signal
    });

    const raw = await groqResponse.text();
    if (!groqResponse.ok) {
      let detail = raw;
      try { detail = JSON.parse(raw)?.error?.message || raw; } catch {}
      return Response.json({ error: `Groq request failed: ${detail}` }, { status: groqResponse.status });
    }

    const payload = JSON.parse(raw);
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = parseMaybeJson(content);
    const result = sanitizeResult(parsed, clientUrl);
    result.meta = {
      model,
      mode,
      requested_count: count,
      returned_count: result.prospects.length,
      usage: payload?.usage || null
    };
    return Response.json(result);
  } catch (error) {
    const message = error?.name === "AbortError" ? "Research timed out. Try Fast mode or fewer prospects." : (error?.message || "Unknown error");
    return Response.json({ error: message }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
