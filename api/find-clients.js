const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

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
  if (!text) throw new Error("Groq returned an empty response");
  try { return JSON.parse(text); } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)); } catch {}
  }
  throw new Error("Groq research finished, but the result could not be parsed as JSON");
}

function cleanUrls(values) {
  return Array.isArray(values)
    ? values.map(v => cleanText(String(v), 400)).filter(v => /^https?:\/\//i.test(v)).slice(0, 8)
    : [];
}

function safeError(value = "") {
  return String(value).replace(/gsk_[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 500);
}

function sanitize(data, requestedCount, model, mode, diagnostics = {}) {
  const leads = Array.isArray(data?.leads) ? data.leads.slice(0, requestedCount) : [];
  return {
    generated_at: new Date().toISOString(),
    offer: {
      name: cleanText(data?.offer?.name, 120) || "Korea Pipeline Pilot",
      promise: cleanText(data?.offer?.promise, 500),
      suggested_price_krw: Number(data?.offer?.suggested_price_krw) || 390000
    },
    leads: leads.map((lead, idx) => ({
      rank: idx + 1,
      company: cleanText(lead?.company, 140),
      url: cleanText(lead?.url, 350),
      country: cleanText(lead?.country, 80),
      category: cleanText(lead?.category, 120),
      fit_score: Math.max(0, Math.min(100, Number(lead?.fit_score) || 0)),
      why_buy_our_service: cleanText(lead?.why_buy_our_service, 700),
      why_now: cleanText(lead?.why_now, 600),
      source_urls: cleanUrls(lead?.source_urls),
      decision_maker_name: cleanText(lead?.decision_maker_name, 120),
      decision_maker_title: cleanText(lead?.decision_maker_title, 120),
      decision_maker_profile_url: cleanText(lead?.decision_maker_profile_url, 400),
      recommended_role: cleanText(lead?.recommended_role, 120),
      contact_search_query: cleanText(lead?.contact_search_query, 280),
      korea_opportunity: cleanText(lead?.korea_opportunity, 750),
      sample_korean_targets: Array.isArray(lead?.sample_korean_targets)
        ? lead.sample_korean_targets.slice(0, 3).map(t => ({
            company: cleanText(t?.company, 120),
            url: cleanText(t?.url, 350),
            reason: cleanText(t?.reason, 450),
            source_urls: cleanUrls(t?.source_urls)
          })).filter(t => t.company)
        : [],
      outreach_en: cleanText(lead?.outreach_en, 1200),
      outreach_ko: cleanText(lead?.outreach_ko, 1200),
      confidence: ["high", "medium", "low"].includes(String(lead?.confidence).toLowerCase()) ? String(lead.confidence).toLowerCase() : "medium",
      warning: cleanText(lead?.warning, 350)
    })).filter(x => x.company && /^https?:\/\//i.test(x.url)),
    strategy: {
      best_segment: cleanText(data?.strategy?.best_segment, 500),
      pitch: cleanText(data?.strategy?.pitch, 700),
      daily_action: cleanText(data?.strategy?.daily_action, 600),
      next_action: cleanText(data?.strategy?.next_action, 600)
    },
    meta: { model, mode, requested_count: requestedCount, ...diagnostics }
  };
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
          { role: "system", content: "You are a rigorous B2B prospecting researcher. Use current web evidence. Never invent facts. Return strict JSON only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
        citation_options: "disabled",
        compound_custom: {
          tools: {
            enabled_tools: deep ? ["web_search", "visit_website"] : ["web_search"]
          }
        }
      }),
      signal: controller.signal
    });

    const raw = await response.text();
    if (!response.ok) {
      let detail = raw;
      try { detail = JSON.parse(raw)?.error?.message || raw; } catch {}
      const error = new Error(`Groq HTTP ${response.status}: ${safeError(detail)}`);
      error.status = response.status;
      throw error;
    }

    const payload = JSON.parse(raw);
    const message = payload?.choices?.[0]?.message;
    const parsed = parseMaybeJson(message?.content);
    const toolCalls = Array.isArray(message?.executed_tools) ? message.executed_tools.length : 0;
    return { parsed, payload, toolCalls };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`Groq research timed out after ${Math.round(timeoutMs / 1000)}s`);
      timeoutError.code = "TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request) {
  if (!process.env.GROQ_API_KEY) {
    return Response.json({ error: "GROQ_API_KEY is missing in Vercel Environment Variables." }, { status: 503 });
  }

  let body = {};
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

  const count = clampInt(body.count, 3, 8, 3);
  const mode = body.mode === "deep" ? "deep" : "fast";
  const focus = cleanText(body.focus, 1600);
  const preferredModel = mode === "deep" ? (process.env.GROQ_MODEL || "groq/compound") : "groq/compound-mini";

  const prompt = `MISSION\nFind ${count} overseas B2B SaaS or AI companies that are good buyers RIGHT NOW for a Korea market-entry sales pilot.\n\nOUR OFFER\nKorea Pipeline Pilot: before the company hires a Korea team, we identify Korean companies likely to buy its product, explain why now, identify the relevant buyer role or a publicly verified person, and prepare personalized outreach. Initial pilot price: KRW 390,000.\n\nBUYER PROFILE\n${focus || "Seed through Series B B2B SaaS/AI. Prefer recent funding, APAC/Japan/Singapore/SEA expansion, international sales or partnership hiring, clear Korean B2B use cases, and weak/no mature Korea sales operation."}\n\nRESEARCH RULES\n1. Search the current web. Do not rely on memory for recent facts.\n2. Return real overseas companies with official URLs. Avoid giant companies with mature Korea teams.\n3. For each lead, find at least one concrete current trigger when possible: funding, APAC expansion, regional hiring, partnership, product launch, or international growth.\n4. Put evidence URLs in source_urls. Never invent URLs, funding, hiring, people, or dates.\n5. Decision-maker names/profile URLs only when publicly verified; otherwise leave them blank and return recommended_role + contact_search_query. Never guess emails.\n6. For every overseas lead, give 1-3 real Korean companies that plausibly fit that product. Use official URLs and a short reason. These are the free sample hook.\n7. Write a brief English outreach message using one verified trigger and saying we already mapped a few Korea-fit accounts. No hype and no guaranteed results.\n8. Score: 35 Korea fit + 30 current trigger + 20 buyer accessibility + 15 evidence quality.\n\nOUTPUT\nReturn ONLY one valid JSON object with this structure:\n{\n  "offer":{"name":"Korea Pipeline Pilot","promise":"","suggested_price_krw":390000},\n  "leads":[{\n    "company":"","url":"","country":"","category":"","fit_score":0,\n    "why_buy_our_service":"","why_now":"","source_urls":[],\n    "decision_maker_name":"","decision_maker_title":"","decision_maker_profile_url":"",\n    "recommended_role":"","contact_search_query":"",\n    "korea_opportunity":"",\n    "sample_korean_targets":[{"company":"","url":"","reason":"","source_urls":[]}],\n    "outreach_en":"","outreach_ko":"","confidence":"high|medium|low","warning":""\n  }],\n  "strategy":{"best_segment":"","pitch":"","daily_action":"","next_action":""}\n}`;

  const attempts = mode === "deep"
    ? [
        { model: preferredModel, timeoutMs: 34000, deep: true },
        { model: "groq/compound-mini", timeoutMs: 16000, deep: false }
      ]
    : [
        { model: "groq/compound-mini", timeoutMs: 24000, deep: false },
        { model: "groq/compound", timeoutMs: 24000, deep: true }
      ];

  const failures = [];

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    try {
      const { parsed, payload, toolCalls } = await callGroq({ ...attempt, prompt });
      const result = sanitize(parsed, count, attempt.model, mode, {
        returned_count: Array.isArray(parsed?.leads) ? parsed.leads.length : 0,
        tool_calls: toolCalls,
        fallback_used: i > 0,
        usage: payload?.usage || null
      });

      if (!result.leads.length) throw new Error("Research returned zero usable buyer leads");
      result.meta.returned_count = result.leads.length;
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      failures.push(safeError(error?.message || "Unknown Groq error"));
    }
  }

  return Response.json({
    error: `Client discovery failed after automatic retry. ${failures.join(" | ")}`,
    hint: "Try 3 candidates in Fast mode. If this persists, verify the Groq key and rate limits in Groq Console."
  }, { status: 502, headers: { "Cache-Control": "no-store" } });
}
