import { IDENTITY_VERSION, resolveCompanyIdentities } from '../lib/company-identity.js';

const clean = (value = '', max = 500) => String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export async function POST(request) {
  let body = {};
  try { body = await request.json(); }
  catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }

  const items = (Array.isArray(body?.items) ? body.items : []).slice(0, 30).map(item => ({
    id: clean(item?.id, 180),
    company: clean(item?.company, 220),
    raw_name: clean(item?.raw_name, 220),
    domain: clean(item?.domain, 240),
    url: clean(item?.url, 500),
    country: clean(item?.country, 100),
    source_title: clean(item?.source_title, 320),
    source_url: clean(item?.source_url, 500)
  })).filter(item => item.id && (item.raw_name || item.company));

  if (!items.length) {
    return Response.json({ identities: [], version: IDENTITY_VERSION }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const identities = await resolveCompanyIdentities(items);
  return Response.json({
    identities,
    version: IDENTITY_VERSION,
    verified: identities.filter(row => row?.status === 'verified').length,
    needs_review: identities.filter(row => row?.status !== 'verified').length
  }, { headers: { 'Cache-Control': 'no-store' } });
}
