import { buildGoogleAuthUrl, gmailConfig, gmailConfigured, randomNonce, safeReturnPath, stateCookie } from '../../lib/gmail.js';

export async function GET(request) {
  const config = gmailConfig(request);
  if (!gmailConfigured(request)) {
    return Response.json({
      error: 'Gmail OAuth 설정이 아직 완료되지 않았습니다.',
      required: ['GOOGLE_GMAIL_CLIENT_ID','GOOGLE_GMAIL_CLIENT_SECRET','GMAIL_SESSION_SECRET']
    }, { status: 503, headers: { 'Cache-Control':'no-store' } });
  }

  const url = new URL(request.url);
  const returnTo = safeReturnPath(url.searchParams.get('return') || '/');
  const nonce = randomNonce();
  const headers = new Headers({
    Location: buildGoogleAuthUrl(request, nonce),
    'Cache-Control': 'no-store'
  });
  headers.append('Set-Cookie', stateCookie({ nonce, returnTo, exp: Date.now() + 10 * 60 * 1000 }, config.sessionSecret));
  return new Response(null, { status: 302, headers });
}
