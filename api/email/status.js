import { gmailConfig, gmailConfigured, readSession } from '../../lib/gmail.js';

export async function GET(request) {
  const config = gmailConfig(request);
  const configured = gmailConfigured(request);
  const session = configured ? readSession(request, config.sessionSecret) : null;
  const connected = Boolean(session?.refreshToken && session?.email === config.senderEmail);

  return Response.json({
    configured,
    connected,
    sender: { email: config.senderEmail, name: config.senderName }
  }, { headers: { 'Cache-Control':'no-store' } });
}
