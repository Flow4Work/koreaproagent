import crypto from 'node:crypto';

const SUPABASE_URL = 'https://lumhnwhnuxfbghbuhhas.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_KRwgoo9SP-fCrYxLHYQ2hg_jtxx0lmR';
const TABLE = 'kpa_sent_companies';
const MAX_ITEMS = 250;
const MAX_HISTORY_ITEMS = 250;
const BATCH_SIZE = 80;
const COMMON_SECOND_LEVEL_SUFFIXES = new Set(['ac', 'co', 'com', 'edu', 'go', 'gov', 'ne', 'net', 'or', 'org']);

const clean = (value = '', max = 500) => String(value || '').trim().slice(0, max);

export function normalizeCompanyKey(value = '') {
  let raw = clean(value, 500).toLowerCase();
  if (!raw) return '';

  if (raw.includes('@') && !raw.includes('://')) raw = raw.split('@').pop() || '';

  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    raw = url.hostname;
  } catch {
    raw = raw.split('/')[0].split(':')[0];
  }

  raw = raw.replace(/^www\./, '').replace(/\.+$/, '');
  if (!/^[a-z0-9.-]+$/i.test(raw) || !raw.includes('.')) return '';

  const parts = raw.split('.').filter(Boolean);
  if (parts.length <= 2) return raw;

  const suffixDepth = parts.at(-1)?.length === 2 && COMMON_SECOND_LEVEL_SUFFIXES.has(parts.at(-2)) ? 3 : 2;
  return parts.slice(-suffixDepth).join('.');
}

export function companyHash(companyKey, secret) {
  const normalized = normalizeCompanyKey(companyKey);
  if (!normalized) return '';
  if (!secret) throw new Error('sent_company_secret_missing');
  return crypto.createHmac('sha256', secret).update(normalized).digest('hex');
}

function historyEncryptionKey(secret) {
  if (!secret) throw new Error('sent_company_secret_missing');
  return crypto.createHash('sha256').update(`kpa-sent-history-v1\0${secret}`).digest();
}

export function encryptCompanyMetadata(metadata = {}, secret = '') {
  const domain = normalizeCompanyKey(metadata.domain || metadata.companyKey || '');
  const name = clean(metadata.name || domain, 120);
  if (!domain || !name) throw new Error('sent_company_metadata_invalid');

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', historyEncryptionKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify({ name, domain }), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptCompanyMetadata(value = '', secret = '') {
  const [version, ivText, tagText, encryptedText] = clean(value, 3000).split('.');
  if (version !== 'v1' || !ivText || !tagText || !encryptedText) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', historyEncryptionKey(secret), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64url')),
      decipher.final()
    ]).toString('utf8');
    const parsed = JSON.parse(plaintext);
    const domain = normalizeCompanyKey(parsed?.domain || '');
    const name = clean(parsed?.name || domain, 120);
    return domain && name ? { name, domain } : null;
  } catch {
    return null;
  }
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    const detail = clean(await response.text().catch(() => ''), 300);
    throw new Error(`sent_company_store_${response.status}${detail ? `:${detail}` : ''}`);
  }
  return response;
}

async function fetchExistingHashes(hashes) {
  const existing = new Set();
  for (let index = 0; index < hashes.length; index += BATCH_SIZE) {
    const batch = hashes.slice(index, index + BATCH_SIZE);
    const filter = encodeURIComponent(`in.(${batch.join(',')})`);
    const response = await supabaseRequest(`${TABLE}?select=company_hash&company_hash=${filter}`);
    const rows = await response.json().catch(() => []);
    for (const row of rows) {
      if (row?.company_hash) existing.add(String(row.company_hash));
    }
  }
  return existing;
}

export async function matchSentCompanies(items = [], secret = '') {
  const normalizedItems = items.slice(0, MAX_ITEMS).map((item, index) => {
    const id = clean(item?.id || `item-${index}`, 300);
    const hash = companyHash(item?.key, secret);
    return { id, hash };
  }).filter(item => item.id && item.hash);

  if (!normalizedItems.length) return [];
  const hashes = [...new Set(normalizedItems.map(item => item.hash))];
  const existing = await fetchExistingHashes(hashes);
  return normalizedItems.filter(item => existing.has(item.hash)).map(item => item.id);
}

export async function markCompanySent(companyKey, secret, sentAt = new Date().toISOString(), metadata = {}) {
  const domain = normalizeCompanyKey(companyKey);
  const hash = companyHash(domain, secret);
  if (!hash) throw new Error('sent_company_key_invalid');

  const companyMeta = encryptCompanyMetadata({
    name: metadata.name || domain,
    domain
  }, secret);

  await supabaseRequest(`${TABLE}?on_conflict=company_hash`, {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify([{ company_hash: hash, sent_at: sentAt, company_meta: companyMeta }])
  });

  return hash;
}

export async function listSentCompanies(secret = '', limit = 20) {
  const safeLimit = Math.max(1, Math.min(MAX_HISTORY_ITEMS, Number(limit) || 20));
  const response = await supabaseRequest(`${TABLE}?select=sent_at,company_meta&order=sent_at.desc&limit=${safeLimit}`, {
    headers: { Prefer: 'count=exact' }
  });
  const rows = await response.json().catch(() => []);
  const totalText = response.headers.get('content-range')?.split('/').pop() || '';
  const total = Number.isFinite(Number(totalText)) ? Number(totalText) : rows.length;
  const items = rows.map(row => {
    const metadata = decryptCompanyMetadata(row?.company_meta, secret);
    if (!metadata) return null;
    return { ...metadata, sentAt: clean(row?.sent_at, 80) };
  }).filter(Boolean);
  return { items, total };
}

export async function listSentCompanyDomains(secret = '', limit = MAX_ITEMS) {
  const history = await listSentCompanies(secret, Math.min(MAX_ITEMS, Math.max(1, Number(limit) || MAX_ITEMS)));
  return [...new Set(history.items.map(item => normalizeCompanyKey(item.domain)).filter(Boolean))];
}
