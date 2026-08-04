import { findContacts, normalizeContacts } from '../lib/contact-discovery.js';
import { qualifyContacts, summarizeContactFailure } from '../lib/contact-qualification.js';
import { aiConfigured, chatJson } from '../lib/ai-provider.js';

function clean(value, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function safeError(value = '') { return String(value).replace(/[A-Za-z0-9_-]{32,}/g, '[key]').slice(0, 500); }
function normalizeCompanyName(value = '') {
  const original = clean(value, 160);
  const normalized = original
    .replace(/\s*(?:[·|:—–-]\s*)?(?:events?\s+list|list\s+of\s+events)\s*$/i, '')
    .trim();
  return normalized || original;
}

async function cleanCompanyNames(body = {}) {
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 30).map(item => ({
    id: clean(item?.id, 160),
    current_name: normalizeCompanyName(item?.company),
    domain: clean(item?.domain, 180),
    source_title: clean(item?.source_title, 260),
    source_url: clean(item?.source_url, 300)
  })).filter(item => item.id && item.current_name);

  if (!items.length) return Response.json({ names: [] }, { headers: { 'Cache-Control':'no-store' } });

  const fallbackNames = items.map(item => ({ id:item.id, name:item.current_name }));
  if (!aiConfigured()) {
    return Response.json({ names:fallbackNames, model:null, fallback:true }, { headers: { 'Cache-Control':'no-store' } });
  }

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
    const aiNames = new Map(rows.map(row => [clean(row?.id, 160), normalizeCompanyName(row?.name)]).filter(([id, name]) => id && name));
    const names = items.map(item => ({
      id:item.id,
      name:normalizeCompanyName(aiNames.get(item.id) || item.current_name)
    }));
    return Response.json({ names, model: result.model || null }, { headers: { 'Cache-Control':'no-store' } });
  } catch (error) {
    return Response.json({
      names:fallbackNames,
      model:null,
      fallback:true,
      warning:safeError(error?.message || '회사명 검증 실패')
    }, { headers: { 'Cache-Control':'no-store' } });
  }
}

function contactKey(contact = {}) {
  return clean(contact.email || contact.linkedinUrl || contact.name, 220).toLowerCase();
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); }
  catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }

  if (body.action === 'company_names') return cleanCompanyNames(body);

  const url = clean(body.url, 500);
  const recommendedRole = clean(body.recommendedRole, 120) || 'Operations Lead';
  const roleTargets = Array.isArray(body.roleTargets) ? body.roleTargets.map(role => clean(role, 120)).filter(Boolean) : [];
  const fallbackRoles = ['Operations Lead','Partnerships Lead','Community Lead','Head of Marketing','Events Lead','Founder','CEO'];
  const roles = [...new Set([recommendedRole, ...roleTargets, ...fallbackRoles])].slice(0, 5);
  if (!url) return Response.json({ error: '회사 URL이 필요합니다.' }, { status: 400 });

  try {
    const contactMap = new Map();
    const providers = [];
    const attempts = [];
    let qualified = { sendable: [], fallback: [] };

    for (const role of roles) {
      const result = await findContacts(url, {
        maxContacts: 10,
        minContacts: 10,
        recommendedRole: role
      });
      if (result?.provider) providers.push(...String(result.provider).split('+').filter(Boolean));
      for (const attempt of result?.attempts || []) attempts.push({ ...attempt, role });

      for (const contact of normalizeContacts(result?.emails || [], role)) {
        const key = contactKey(contact);
        if (!key) continue;
        const previous = contactMap.get(key);
        if (!previous || Number(contact.score || 0) > Number(previous.score || 0)) contactMap.set(key, contact);
      }

      qualified = qualifyContacts([...contactMap.values()], roles, 4);
      if (qualified.sendable.length >= 2) break;
    }

    const failure = qualified.sendable.length ? null : summarizeContactFailure(qualified.fallback, attempts);
    return Response.json({
      contact: qualified.sendable[0] || null,
      contacts: qualified.sendable,
      fallback_contacts: qualified.fallback,
      provider: [...new Set(providers)].join('+') || null,
      attempts,
      target_contacts: 4,
      qualification_policy: 'strict-role-email-v1',
      failure_code: failure?.code || null,
      failure_reason: failure?.reason || null
    }, { headers: { 'Cache-Control':'no-store' } });
  } catch (error) {
    return Response.json({ error: safeError(error?.message || error) }, { status: 502 });
  }
}
