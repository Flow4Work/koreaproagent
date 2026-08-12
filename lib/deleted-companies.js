import {
  companyHash,
  decryptCompanyMetadata,
  encryptCompanyMetadata,
  normalizeCompanyKey
} from './sent-companies.js';

const SUPABASE_URL = 'https://lumhnwhnuxfbghbuhhas.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_KRwgoo9SP-fCrYxLHYQ2hg_jtxx0lmR';
const TABLE = 'kpa_deleted_companies';
const MAX_ITEMS = 2000;
const BATCH_SIZE = 80;

const clean = (value = '', max = 500) => String(value || '').trim().slice(0, max);

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
    throw new Error(`deleted_company_store_${response.status}${detail ? `:${detail}` : ''}`);
  }
  return response;
}

export async function markCompanyDeleted(companyKey, secret, deletedAt = new Date().toISOString(), metadata = {}) {
  const domain = normalizeCompanyKey(companyKey);
  const hash = companyHash(domain, secret);
  if (!hash) throw new Error('deleted_company_key_invalid');

  const companyMeta = encryptCompanyMetadata({
    name: metadata.name || domain,
    domain
  }, secret);

  await supabaseRequest(`${TABLE}?on_conflict=company_hash`, {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify([{ company_hash: hash, deleted_at: deletedAt, company_meta: companyMeta }])
  });

  return hash;
}

export async function markCompaniesDeleted(items = [], secret = '') {
  const rows = [];
  const seen = new Set();

  for (const item of items.slice(0, MAX_ITEMS)) {
    const domain = normalizeCompanyKey(item?.key || item?.domain || item?.companyKey || '');
    if (!domain || seen.has(domain)) continue;
    const hash = companyHash(domain, secret);
    if (!hash) continue;
    seen.add(domain);
    rows.push({
      company_hash: hash,
      deleted_at: clean(item?.deletedAt, 80) || new Date().toISOString(),
      company_meta: encryptCompanyMetadata({
        name: clean(item?.name, 120) || domain,
        domain
      }, secret)
    });
  }

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    await supabaseRequest(`${TABLE}?on_conflict=company_hash`, {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(index, index + BATCH_SIZE))
    });
  }

  return rows.length;
}

export async function listDeletedCompanies(secret = '', limit = MAX_ITEMS) {
  const safeLimit = Math.max(1, Math.min(MAX_ITEMS, Number(limit) || MAX_ITEMS));
  const response = await supabaseRequest(
    `${TABLE}?select=deleted_at,company_meta&order=deleted_at.desc&limit=${safeLimit}`,
    { headers: { Prefer: 'count=exact' } }
  );
  const rows = await response.json().catch(() => []);
  const items = rows.map(row => {
    const metadata = decryptCompanyMetadata(row?.company_meta, secret);
    if (!metadata) return null;
    return { ...metadata, deletedAt: clean(row?.deleted_at, 80) };
  }).filter(Boolean);
  return items;
}

export async function listDeletedCompanyDomains(secret = '', limit = MAX_ITEMS) {
  const items = await listDeletedCompanies(secret, limit);
  return [...new Set(items.map(item => normalizeCompanyKey(item.domain)).filter(Boolean))];
}
