import { hunterConfigured, findContacts, normalizeContacts } from '../lib/hunter.js';

function clean(v, max = 200) { return typeof v === 'string' ? v.trim().slice(0, max) : '' }

export async function POST(request) {
  if (!hunterConfigured()) return Response.json({ error: 'HUNTER_API_KEY is missing', hunterConfigured: false }, { status: 503 });
  let body = {};
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid request format' }, { status: 400 }) }
  const company = clean(body.company, 120), domain = clean(body.domain, 200), recommendedRole = clean(body.recommendedRole, 80);
  if (!company || !domain) return Response.json({ error: 'company and domain are required' }, { status: 400 });
  try {
    const result = await findContacts(domain, { maxContacts: 10, includeFilters: true });
    const emails = result?.emails || [];
    const contacts = normalizeContacts(emails, recommendedRole);
    if (!contacts.length) return Response.json({ contacts: [], reason: 'no_verified_contact', company, domain });
    return Response.json({ contacts, company, domain });
  } catch (e) {
    return Response.json({ contacts: [], reason: 'no_verified_contact', error: e.message, company, domain }, { status: e.status || 502 });
  }
}
