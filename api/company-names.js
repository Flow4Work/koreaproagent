import { aiConfigured, chatJson } from '../lib/ai-provider.js';

const clean = (value = '', max = 300) => String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

export async function POST(request) {
  if (!aiConfigured()) {
    return Response.json({ error: '회사명 검증용 LLM이 연결되어 있지 않습니다.' }, { status: 503, headers: { 'Cache-Control':'no-store' } });
  }

  let payload = {};
  try { payload = await request.json(); }
  catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }

  const items = (Array.isArray(payload.items) ? payload.items : []).slice(0, 30).map(item => ({
    id: clean(item?.id, 160),
    current_name: clean(item?.company, 160),
    domain: clean(item?.domain, 180),
    source_title: clean(item?.source_title, 260),
    source_url: clean(item?.source_url, 300)
  })).filter(item => item.id && item.current_name);

  if (!items.length) return Response.json({ names: [] }, { headers: { 'Cache-Control':'no-store' } });

  const prompt = `You clean company names only for a cold-email greeting shaped as: Hi {company} team,

For each input, return the real organization or brand name in its shortest natural form.
- Keep an already clean company name unchanged.
- Remove event years, activation labels, page/list words, categories, slogans, descriptions, and marketing copy.
- When the evidence contains an event/title plus the actual host or company, choose the actual host/company.
- Do not add "team", "company", greetings, punctuation, explanations, or guesses unsupported by the evidence.
- Preserve official capitalization when clear.

Required examples:
- "KAST Events List" -> "KAST"
- "ETHNYC 2026 Activations · FORKOFF" -> "FORKOFF"
- "ium Labs: Korea Crypto Marketing Agency & Web3 GTM" -> "ium Labs"
- "Changelly" -> "Changelly"

Return only this JSON shape:
{"items":[{"id":"same input id","name":"short company name"}]}

Inputs:
${JSON.stringify(items)}`;

  try {
    const result = await chatJson({ prompt, maxTokens: 1200, timeoutMs: 30000, temperature: 0, hardDeadlineMs: 45000 });
    const rows = Array.isArray(result?.data?.items) ? result.data.items : [];
    const allowedIds = new Set(items.map(item => item.id));
    const names = rows.map(row => ({ id: clean(row?.id, 160), name: clean(row?.name, 80) }))
      .filter(row => allowedIds.has(row.id) && row.name);
    return Response.json({ names, model: result.model || null }, { headers: { 'Cache-Control':'no-store' } });
  } catch (error) {
    return Response.json({ error: clean(error?.message || '회사명 검증 실패', 300) }, { status: Number(error?.status) || 502, headers: { 'Cache-Control':'no-store' } });
  }
}
