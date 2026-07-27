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
  if (!text) throw new Error("Empty model response");
  try { return JSON.parse(text); } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) return JSON.parse(text.slice(first, last + 1));
  throw new Error("Model did not return valid JSON");
}

function cleanUrls(values) {
  return Array.isArray(values)
    ? values.map(v => cleanText(String(v), 400)).filter(v => /^https?:\/\//i.test(v)).slice(0, 8)
    : [];
}

function sanitize(data, requestedCount, model, mode) {
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
    meta: { model, mode, requested_count: requestedCount }
  };
}

export async function POST(request) {
  if (!process.env.GROQ_API_KEY) {
    return Response.json({ error: "GROQ_API_KEY is not configured." }, { status: 503 });
  }

  let body = {};
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const count = clampInt(body.count, 3, 12, 5);
  const mode = body.mode === "fast" ? "fast" : "deep";
  const focus = cleanText(body.focus, 1600);
  const model = mode === "fast" ? "groq/compound-mini" : (process.env.GROQ_MODEL || "groq/compound");

  const prompt = `You are an evidence-first B2B sales prospecting agent. Your client is a Korean operator selling a productized service called Korea Pipeline Pilot.

OUR OFFER
We help overseas B2B SaaS and AI companies test South Korea without hiring a Korea team. We research their product, identify Korean companies likely to buy it, find relevant decision-maker roles or publicly verified people, identify current buying signals, and create personalized outreach. The initial pilot is intentionally easy to buy and can later become recurring Korea GTM operations.

MISSION
Find exactly ${count} overseas B2B SaaS or AI companies that are plausible buyers of this Korea market-entry / pipeline service RIGHT NOW. Do the discovery yourself using current web research. For each candidate, also produce a tiny free sample: up to 3 Korean companies that could plausibly buy that candidate's product. This free sample is the hook for our outbound.

OPTIONAL FOCUS
${focus || "Prefer small-to-mid-size B2B SaaS/AI companies, roughly startup through Series B, that show APAC/global expansion signals but do not appear to have a mature Korea sales operation."}

IDEAL BUYER SIGNALS
- recent funding or growth
- APAC, Japan, Singapore, SEA or international expansion
- hiring in sales, partnerships, growth, market expansion or regional roles
- launched a product with clear Korean enterprise/SMB use cases
- has customers in Asia but weak/no visible Korea presence
- founder-led or compact GTM team where a 390,000 KRW pilot is easy to test

RESEARCH RULES
1. Use current web research; do not invent companies, URLs, funding, hiring, expansion, people, or Korean targets.
2. Every non-obvious claim needs source_urls. Prefer official company pages, careers, funding announcements, reputable news, public professional profiles, and official Korean company pages.
3. Avoid huge companies that obviously already have a mature Korea operation unless there is a specific unmet Korea GTM reason.
4. A decision-maker name/profile may be filled only when publicly verified. Otherwise leave it blank and provide recommended_role + contact_search_query.
5. Never invent or guess personal email addresses.
6. The sample Korean targets must be product-specific; explain why each Korean target could plausibly need the overseas company's product.
7. Outreach must mention one verified trigger and the fact that we already found a few Korea-fit accounts. Keep it short and low-pressure. Do not claim a guaranteed sale.
8. Fit score: 35 Korea-market fit + 30 current expansion/buying trigger + 20 accessibility of buyer + 15 evidence quality.
9. Prefer quality over fame. Lower confidence or add warning when evidence is weak.

OUTPUT
Return ONLY valid JSON with this exact shape:
{
  "offer":{"name":"Korea Pipeline Pilot","promise":"","suggested_price_krw":390000},
  "leads":[
    {
      "company":"","url":"","country":"","category":"","fit_score":0,
      "why_buy_our_service":"","why_now":"","source_urls":[],
      "decision_maker_name":"","decision_maker_title":"","decision_maker_profile_url":"",
      "recommended_role":"","contact_search_query":"",
      "korea_opportunity":"",
      "sample_korean_targets":[{"company":"","url":"","reason":"","source_urls":[]}],
      "outreach_en":"","outreach_ko":"","confidence":"high|medium|low","warning":""
    }
  ],
  "strategy":{"best_segment":"","pitch":"","daily_action":"","next_action":""}
}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), mode === "fast" ? 25000 : 55000);

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
          { role: "system", content: "Act as a rigorous outbound researcher. Use live web research. Return strict JSON only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.15,
        response_format: { type: "json_object" }
      }),
      signal: controller.signal
    });

    const raw = await response.text();
    if (!response.ok) {
      let detail = raw;
      try { detail = JSON.parse(raw)?.error?.message || raw; } catch {}
      return Response.json({ error: `Groq request failed: ${detail}` }, { status: response.status });
    }

    const payload = JSON.parse(raw);
    const content = payload?.choices?.[0]?.message?.content;
    const result = sanitize(parseMaybeJson(content), count, model, mode);
    result.meta.returned_count = result.leads.length;
    result.meta.usage = payload?.usage || null;
    return Response.json(result);
  } catch (error) {
    const message = error?.name === "AbortError" ? "Client discovery timed out. Try Fast mode or fewer companies." : (error?.message || "Unknown error");
    return Response.json({ error: message }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}