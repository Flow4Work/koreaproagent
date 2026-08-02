import { gmailConfig, sameOriginRequest } from '../lib/gmail.js';
import { matchSentCompanies } from '../lib/sent-companies.js';

const MAX_ITEMS = 250;

export async function POST(request) {
  if (!sameOriginRequest(request)) {
    return Response.json({ error: '허용되지 않은 요청입니다.' }, { status: 403 });
  }

  const secret = gmailConfig(request).sessionSecret;
  if (!secret) {
    return Response.json({ error: '발송 이력 보안 설정이 없습니다.' }, { status: 503 });
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 });
  }

  const items = Array.isArray(payload.items) ? payload.items.slice(0, MAX_ITEMS) : [];
  if (!items.length) {
    return Response.json({ ok: true, sentIds: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const sentIds = await matchSentCompanies(items, secret);
    return Response.json({ ok: true, sentIds }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('sent-company match failed', String(error?.message || error).slice(0, 300));
    return Response.json({ error: '발송 이력을 확인하지 못했습니다.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
