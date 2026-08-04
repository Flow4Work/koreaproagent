import { gmailConfig, sameOriginRequest } from '../lib/gmail.js';
import { listSentCompanyDomains } from '../lib/sent-companies.js';

const clean = (value = '', max = 500) => String(value || '').trim().slice(0, max);

export async function POST(request) {
  if (!sameOriginRequest(request)) return Response.json({ error: '허용되지 않은 요청입니다.' }, { status: 403 });
  const secret = gmailConfig(request).sessionSecret;
  if (!secret) return Response.json({ error: '발송 이력 보안 설정이 없습니다.' }, { status: 503 });
  try {
    const domains = await listSentCompanyDomains(secret, 250);
    return Response.json({ ok: true, domains }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('sent-domain list failed', clean(error?.message || error, 300));
    return Response.json({ error: '발송 완료 회사 목록을 불러오지 못했습니다.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
