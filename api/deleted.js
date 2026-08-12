import {
  listDeletedCompanyDomains,
  markCompaniesDeleted,
  markCompanyDeleted
} from '../lib/deleted-companies.js';

const MAX_BATCH = 250;
const clean = (value = '', max = 500) => String(value || '').trim().slice(0, max);

function sameOrigin(request) {
  const origin = clean(request.headers.get('origin'), 500);
  if (!origin) return true;
  try { return origin === new URL(request.url).origin; }
  catch { return false; }
}

function secret() {
  return clean(process.env.GMAIL_SESSION_SECRET, 5000);
}

async function readJson(request) {
  try { return await request.json(); }
  catch { return null; }
}

export async function GET(request) {
  if (!sameOrigin(request)) return Response.json({ error: '허용되지 않은 요청입니다.' }, { status: 403 });
  const value = secret();
  if (!value) return Response.json({ error: '삭제 이력 보안 설정이 없습니다.' }, { status: 503 });

  try {
    const domains = await listDeletedCompanyDomains(value, 2000);
    return Response.json({ ok: true, domains }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('deleted-company list failed', clean(error?.message || error, 300));
    return Response.json({ error: '삭제 이력을 불러오지 못했습니다.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request) {
  if (!sameOrigin(request)) return Response.json({ error: '허용되지 않은 요청입니다.' }, { status: 403 });
  const value = secret();
  if (!value) return Response.json({ error: '삭제 이력 보안 설정이 없습니다.' }, { status: 503 });

  const payload = await readJson(request);
  if (!payload) return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 });

  try {
    if (Array.isArray(payload.items)) {
      const items = payload.items.slice(0, MAX_BATCH).map(item => ({
        key: clean(item?.key || item?.domain, 500),
        name: clean(item?.name, 120),
        deletedAt: clean(item?.deletedAt, 80)
      })).filter(item => item.key);
      const saved = await markCompaniesDeleted(items, value);
      return Response.json({ ok: true, saved }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const companyKey = clean(payload.companyKey || payload.domain, 500);
    const companyName = clean(payload.companyName, 120);
    if (!companyKey) return Response.json({ error: '삭제할 회사 도메인이 없습니다.' }, { status: 400 });
    await markCompanyDeleted(companyKey, value, new Date().toISOString(), { name: companyName });
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('deleted-company save failed', clean(error?.message || error, 300));
    return Response.json({ error: '삭제 이력을 저장하지 못했습니다.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
