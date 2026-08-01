import crypto from 'node:crypto';

const SESSION_COOKIE = 'kpa_gmail_session';
const STATE_COOKIE = 'kpa_gmail_state';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const STATE_MAX_AGE = 60 * 10;
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const SIGNATURE_MARKER = '\n\nBest,\nLeo Park\nNYF\nCustom apparel produced in Seoul';

const clean = (value = '', max = 500) => String(value || '').trim().slice(0, max);
const env = name => clean(process.env[name] || '', 5000);

export function gmailConfig(request) {
  const requestOrigin = request ? new URL(request.url).origin : '';
  const senderEmail = (env('GMAIL_SENDER_EMAIL') || 'business@notyourflavor.com').toLowerCase();
  return {
    clientId: env('GOOGLE_GMAIL_CLIENT_ID'),
    clientSecret: env('GOOGLE_GMAIL_CLIENT_SECRET'),
    sessionSecret: env('GMAIL_SESSION_SECRET'),
    redirectUri: env('GMAIL_OAUTH_REDIRECT_URI') || (requestOrigin ? `${requestOrigin}/api/gmail` : ''),
    senderEmail,
    senderName: env('GMAIL_SENDER_NAME') || 'NYF'
  };
}

export function gmailConfigured(request) {
  const config = gmailConfig(request);
  return Boolean(config.clientId && config.clientSecret && config.sessionSecret && config.redirectUri && config.senderEmail);
}

function keyFromSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptPayload(payload, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptPayload(value, secret) {
  try {
    const [ivPart, tagPart, dataPart] = String(value || '').split('.');
    if (!ivPart || !tagPart || !dataPart) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFromSecret(secret), Buffer.from(ivPart, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return null;
  }
}

function parseCookies(request) {
  const raw = request.headers.get('cookie') || '';
  const result = {};
  for (const item of raw.split(';')) {
    const index = item.indexOf('=');
    if (index <= 0) continue;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); }
    catch { result[key] = value; }
  }
  return result;
}

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export const sessionCookie = (session, secret) => cookie(SESSION_COOKIE, encryptPayload(session, secret), SESSION_MAX_AGE);
export const stateCookie = (state, secret) => cookie(STATE_COOKIE, encryptPayload(state, secret), STATE_MAX_AGE);
export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export function readSession(request, secret) {
  const encrypted = parseCookies(request)[SESSION_COOKIE];
  return encrypted ? decryptPayload(encrypted, secret) : null;
}

export function readOAuthState(request, secret) {
  const encrypted = parseCookies(request)[STATE_COOKIE];
  return encrypted ? decryptPayload(encrypted, secret) : null;
}

export function safeReturnPath(value = '/') {
  const path = clean(value, 300);
  if (!path.startsWith('/') || path.startsWith('//')) return '/';
  return path;
}

export function buildGoogleAuthUrl(request, nonce) {
  const config = gmailConfig(request);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: `openid email ${GMAIL_SEND_SCOPE}`,
    state: nonce,
    login_hint: config.senderEmail
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeAuthorizationCode(request, code) {
  const config = gmailConfig(request);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code'
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'oauth_code_exchange_failed');
  return data;
}

export async function fetchGoogleEmail(accessToken) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'google_userinfo_failed');
  return clean(data.email || '', 320).toLowerCase();
}

export async function refreshAccessToken(request, refreshToken) {
  const config = gmailConfig(request);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token'
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'oauth_refresh_failed');
    error.code = data.error || 'oauth_refresh_failed';
    throw error;
  }
  return data.access_token;
}

function encodeHeader(value = '') {
  return `=?UTF-8?B?${Buffer.from(String(value), 'utf8').toString('base64')}?=`;
}

function wrapBase64(value) {
  return value.match(/.{1,76}/g)?.join('\r\n') || '';
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function htmlEmail(body = '') {
  const normalized = String(body || '').replace(/\r/g, '').trim();
  const signatureIndex = normalized.lastIndexOf(SIGNATURE_MARKER);
  const messageBody = signatureIndex >= 0 ? normalized.slice(0, signatureIndex).trim() : normalized;
  const hasSignature = signatureIndex >= 0;
  const paragraphs = messageBody.split(/\n{2,}/).map(part => part.trim()).filter(Boolean);
  const bodyHtml = paragraphs.map(part => (
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#111827;">${escapeHtml(part).replace(/\n/g, '<br>')}</p>`
  )).join('');

  const signatureHtml = hasSignature ? `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:18px 0 0 0;border-top:1px solid #e5e7eb;">
  <tr><td style="padding:15px 0 0 0;font-family:Arial,Helvetica,sans-serif;">
    <div style="font-size:14px;line-height:1.5;color:#111827;margin:0 0 7px 0;">Best,</div>
    <div style="font-size:14px;line-height:1.45;color:#111827;font-weight:700;">Leo Park</div>
    <div style="font-size:13px;line-height:1.45;color:#111827;">NYF</div>
    <div style="font-size:12px;line-height:1.5;color:#6b7280;margin:1px 0 10px 0;">Custom apparel produced in Seoul</div>
    <div style="font-size:12px;line-height:1.7;color:#4b5563;">
      Instagram · <a href="https://www.instagram.com/notyourflavor/" style="color:#374151;text-decoration:none;">@notyourflavor</a><br>
      Production · <a href="https://www.instagram.com/timesewingmachine" style="color:#374151;text-decoration:none;">@timesewingmachine</a>
    </div>
    <div style="font-size:11px;line-height:1.55;color:#9ca3af;margin-top:9px;">
      7-3 Daesagwan-ro 31-gil<br>
      Yongsan-gu, Seoul 04420, South Korea
    </div>
  </td></tr>
</table>` : '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0;padding:0;background:#ffffff;">
  <tr><td align="left">
    <table role="presentation" width="580" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:580px;margin:0;">
      <tr><td style="box-sizing:border-box;padding:2px 18px 8px 18px;font-family:Arial,Helvetica,sans-serif;color:#111827;">
        ${bodyHtml}${signatureHtml}
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

export function buildRawMessage({ to, subject, body, html, senderEmail, senderName }) {
  const cleanSubject = String(subject || '').replace(/[\r\n]+/g, ' ').trim();
  const cleanName = String(senderName || '').replace(/[\r\n<>]+/g, ' ').trim();
  const boundary = `kpa_alt_${crypto.randomBytes(12).toString('hex')}`;
  const domain = (String(senderEmail || '').split('@')[1] || 'notyourflavor.com').replace(/[^a-z0-9.-]/gi, '') || 'notyourflavor.com';
  const date = new Date().toUTCString();
  const messageId = `<${crypto.randomUUID()}@${domain}>`;
  const textBase64 = wrapBase64(Buffer.from(String(body || ''), 'utf8').toString('base64'));
  const polishedHtml = htmlEmail(body);
  const htmlBase64 = wrapBase64(Buffer.from(polishedHtml, 'utf8').toString('base64'));
  void html;

  const message = [
    `Date: ${date}`,
    `Message-ID: ${messageId}`,
    `From: ${cleanName} <${senderEmail}>`,
    `To: ${to}`,
    `Reply-To: ${senderEmail}`,
    `Subject: ${encodeHeader(cleanSubject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    textBase64,
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    htmlBase64,
    `--${boundary}--`,
    ''
  ].join('\r\n');

  return Buffer.from(message, 'utf8').toString('base64url');
}

export async function sendGmailMessage(accessToken, raw) {
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw }),
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.error || 'gmail_send_failed');
    error.status = response.status;
    throw error;
  }
  return data;
}

export function sameOriginRequest(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}

export const randomNonce = () => crypto.randomBytes(24).toString('base64url');
