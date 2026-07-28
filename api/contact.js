import { findContacts, normalizeContacts } from '../lib/contact-discovery.js';

function clean(value, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function safeError(value = '') { return String(value).replace(/[A-Za-z0-9_-]{32,}/g, '[key]').slice(0, 500); }

export async function POST(request) {
  let body = {};
  try { body = await request.json(); }
  catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }

  const url = clean(body.url, 500);
  const recommendedRole = clean(body.recommendedRole, 120) || 'Head of Sales';
  if (!url) return Response.json({ error: '회사 URL이 필요합니다.' }, { status: 400 });

  try {
    const result = await findContacts(url, { maxContacts: 8, recommendedRole });
    const contacts = normalizeContacts(result?.emails || [], recommendedRole);
    return Response.json({
      contact: contacts[0] || null,
      contacts: contacts.slice(0, 3),
      provider: result?.provider || null,
      attempts: result?.attempts || []
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: safeError(error?.message || error) }, { status: 502 });
  }
}