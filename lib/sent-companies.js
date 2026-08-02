import crypto from 'node:crypto';

const SUPABASE_URL = 'https://lumhnwhnuxfbghbuhhas.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_KRwgoo9SP-fCrYxLHYQ2hg_jtxx0lmR';
const TABLE = 'kpa_sent_companies';
const MAX_ITEMS = 250;
const BATCH_SIZE = 80;

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

  const lastThree = parts.slice(-3).join('.');
  if (/^[^.]+\.(?:co|or|go|ac)\.kr$/.test(lastThree)) return lastThree;
  return parts.slice(-2).join('.');
}

export function companyHash(companyKey, secret) {
  const normalized = normalizeCompanyKey(companyKey);
  if (!normalized) return '';
  if (!secret) throw new Error('sent_company_secret_missing');
  return crypto.createHmac('sha256', secret).update(normalized).digest('hex');
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

export async function markCompanySent(companyKey, secret, sentAt = new Date().toISOString()) {
  const hash = companyHash(companyKey, secret);
  if (!hash) throw new Error('sent_company_key_invalid');

  await supabaseRequest(`${TABLE}?on_conflict=company_hash`, {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify([{ company_hash: hash, sent_at: sentAt }])
  });

  return hash;
}
