import { findContacts, normalizeContacts } from '../lib/contact-discovery.js';

function clean(value, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function safeError(value = '') { return String(value).replace(/[A-Za-z0-9_-]{32,}/g, '[key]').slice(0, 500); }

export async function POST(request) {
  let body = {};
  try { body = await request.json(); }
  catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }

  const url = clean(body.url, 500);
  const recommendedRole = clean(body.recommendedRole, 120) || 'Operations Lead';
  const roleTargets = Array.isArray(body.roleTargets) ? body.roleTargets.map(role => clean(role, 120)).filter(Boolean) : [];
  const fallbackRoles = ['Operations Lead','Partnerships Lead','Community Lead','Head of Marketing','Founder','CEO'];
  const roles = [...new Set([recommendedRole, ...roleTargets, ...fallbackRoles])].slice(0, 5);
  if (!url) return Response.json({ error: '회사 URL이 필요합니다.' }, { status: 400 });

  try {
    const contacts = [];
    const seen = new Set();
    const providers = [];
    const attempts = [];

    for (const role of roles) {
      if (contacts.length >= 4) break;
      const result = await findContacts(url, { maxContacts: 8, minContacts: 4, recommendedRole: role });
      if (result?.provider) providers.push(...String(result.provider).split('+').filter(Boolean));
      for (const attempt of result?.attempts || []) attempts.push({ ...attempt, role });
      for (const contact of normalizeContacts(result?.emails || [], role)) {
        const key = clean(contact.email || contact.linkedinUrl || contact.name, 220).toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        contacts.push(contact);
        if (contacts.length >= 4) break;
      }
    }

    contacts.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    return Response.json({
      contact: contacts[0] || null,
      contacts: contacts.slice(0, 4),
      provider: [...new Set(providers)].join('+') || null,
      attempts,
      target_contacts: 4
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: safeError(error?.message || error) }, { status: 502 });
  }
}
