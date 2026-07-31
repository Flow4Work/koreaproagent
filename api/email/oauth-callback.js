import { exchangeAuthorizationCode, fetchGoogleEmail, gmailConfig, gmailConfigured, readOAuthState, safeReturnPath, sessionCookie } from '../../lib/gmail.js';

function redirect(origin, path, status) {
  const target = new URL(safeReturnPath(path), origin);
  target.searchParams.set('gmail', status);
  return target.toString();
}

export async function GET(request) {
  const config = gmailConfig(request);
  const origin = new URL(request.url).origin;
  if (!gmailConfigured(request)) return Response.redirect(redirect(origin, '/', 'not_configured'), 302);

  const url = new URL(request.url);
  const state = readOAuthState(request, config.sessionSecret);
  const returnedState = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const oauthError = url.searchParams.get('error') || '';
  const returnTo = safeReturnPath(state?.returnTo || '/');

  if (oauthError) return Response.redirect(redirect(origin, returnTo, 'cancelled'), 302);
  if (!state || !returnedState || returnedState !== state.nonce || Number(state.exp || 0) < Date.now()) {
    return Response.redirect(redirect(origin, returnTo, 'state_error'), 302);
  }
  if (!code) return Response.redirect(redirect(origin, returnTo, 'code_error'), 302);

  try {
    const tokens = await exchangeAuthorizationCode(request, code);
    if (!tokens.access_token || !tokens.refresh_token) {
      return Response.redirect(redirect(origin, returnTo, 'refresh_token_missing'), 302);
    }

    const email = await fetchGoogleEmail(tokens.access_token);
    if (!email || email !== config.senderEmail) {
      return Response.redirect(redirect(origin, returnTo, 'wrong_account'), 302);
    }

    const headers = new Headers({
      Location: redirect(origin, returnTo, 'connected'),
      'Cache-Control': 'no-store'
    });
    headers.append('Set-Cookie', sessionCookie({
      refreshToken: tokens.refresh_token,
      email,
      connectedAt: new Date().toISOString()
    }, config.sessionSecret));
    return new Response(null, { status: 302, headers });
  } catch {
    return Response.redirect(redirect(origin, returnTo, 'oauth_error'), 302);
  }
}
