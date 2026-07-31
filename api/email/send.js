import { buildRawMessage, clearSessionCookie, gmailConfig, gmailConfigured, readSession, refreshAccessToken, sameOriginRequest, sendGmailMessage } from '../../lib/gmail.js';

function clean(value = '', max = 500) {
  return String(value || '').trim().slice(0, max);
}

function validEmail(value = '') {
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);
}

function reconnectResponse(message = 'Gmail 연결이 만료되었습니다. 다시 연결해주세요.') {
  const headers = new Headers({ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
  headers.append('Set-Cookie', clearSessionCookie());
  return new Response(JSON.stringify({ error: message, code:'GMAIL_RECONNECT_REQUIRED' }), { status: 401, headers });
}

export async function POST(request) {
  if (!sameOriginRequest(request)) return Response.json({ error:'허용되지 않은 요청입니다.' }, { status:403 });
  if (!gmailConfigured(request)) return Response.json({ error:'Gmail 발송 설정이 아직 완료되지 않았습니다.', code:'GMAIL_NOT_CONFIGURED' }, { status:503 });

  const config = gmailConfig(request);
  const session = readSession(request, config.sessionSecret);
  if (!session?.refreshToken || session?.email !== config.senderEmail) return reconnectResponse('Gmail 계정을 먼저 연결해주세요.');

  let payload = {};
  try { payload = await request.json(); }
  catch { return Response.json({ error:'요청 형식이 잘못됐습니다.' }, { status:400 }); }

  const to = clean(payload.to, 320).toLowerCase();
  const subject = clean(payload.subject, 180).replace(/[\r\n]+/g, ' ');
  const body = String(payload.body || '').trim().slice(0, 12000);

  if (!validEmail(to)) return Response.json({ error:'받는 사람 이메일을 확인해주세요.' }, { status:400 });
  if (!subject) return Response.json({ error:'메일 제목이 비어 있습니다.' }, { status:400 });
  if (body.length < 20) return Response.json({ error:'메일 본문이 너무 짧습니다.' }, { status:400 });

  try {
    const accessToken = await refreshAccessToken(request, session.refreshToken);
    const raw = buildRawMessage({ to, subject, body, senderEmail:config.senderEmail, senderName:config.senderName });
    const sent = await sendGmailMessage(accessToken, raw);
    return Response.json({
      ok: true,
      id: sent.id || null,
      threadId: sent.threadId || null,
      to,
      sender: { email:config.senderEmail, name:config.senderName },
      sentAt: new Date().toISOString()
    }, { headers: { 'Cache-Control':'no-store' } });
  } catch (error) {
    if (error?.code === 'invalid_grant') return reconnectResponse();
    const message = String(error?.message || 'Gmail 발송에 실패했습니다.').replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]').slice(0, 300);
    return Response.json({ error:message, code:'GMAIL_SEND_FAILED' }, { status:502, headers: { 'Cache-Control':'no-store' } });
  }
}
