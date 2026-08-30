const INTERCHARM_BASE = 'https://ick.intercharmkorea.com/eng/exhibitor/exhi_list02.asp';
const INTERCHARM_ORIGIN = 'https://ick.intercharmkorea.com';
const INCOSMETICS_2026 = 'https://www.in-cosmetics.com/korea/en-gb/exhibitor-directory/exhibitor-directory.html';
const TARGET_DEFAULT = 500;
const MAX_TARGET = 500;
const MAX_PAGES = 52;
const PAGE_CONCURRENCY = 8;

const CURATED_FOREIGN_2026 = [
  {
    company: 'Lithe Bridge B.V.', country: 'Netherlands', domain: 'lithe-bridge.com',
    public_email: 'Leonie@lithe-bridge.com', tier: 'current_kbeauty_2026', score: 100,
    source_event: 'K-Beauty Expo Korea 2026',
    source_url: 'https://nl.linkedin.com/company/lithe-bridge',
    evidence_type: 'attending',
    evidence_text: 'Company announced it will attend K-Beauty Expo Korea 2026 at KINTEX, 15–17 October 2026.'
  },
  {
    company: 'AG Organica', country: 'India', domain: 'pureoilsindia.com', tier: 'korea_beauty_event_2026', score: 96,
    source_event: 'InterCHARM Korea 2026',
    source_url: 'https://ick.intercharmkorea.com/kor/exhibitor/exhi_detail04.asp?idx=6535&param=%26page%3D25&ref_idx=17926',
    evidence_type: 'official_exhibitor_profile', evidence_text: 'Official InterCHARM Korea exhibitor profile; booth I43.'
  },
  {
    company: 'Daxal Cosmetics Pvt Ltd', country: 'India', domain: 'daxalcosmetics.com', tier: 'korea_beauty_event_2026', score: 96,
    source_event: 'InterCHARM Korea 2026',
    source_url: 'https://ick.intercharmkorea.com/kor/exhibitor/exhi_detail04.asp?idx=6475&param=%26page%3D29&ref_idx=17880',
    evidence_type: 'official_exhibitor_profile', evidence_text: 'Official InterCHARM Korea exhibitor profile; booth I41.'
  },
  {
    company: 'GUANGZHOU DERMADREAM ELECTRONIC TECHNOLOGY CO., LTD.', country: 'China', domain: 'uhooma.com', tier: 'korea_beauty_event_2026', score: 96,
    source_event: 'InterCHARM Korea 2026',
    source_url: 'https://ick.intercharmkorea.com/eng/exhibitor/exhi_detail04.asp?idx=6372&param=%26page%3D12&ref_idx=17704',
    evidence_type: 'official_exhibitor_profile', evidence_text: 'Official InterCHARM Korea exhibitor profile; booth I62.'
  },
  {
    company: 'Guangzhou Yumei Leather Co.,Ltd', country: 'China', tier: 'korea_beauty_event_2026', score: 94,
    source_event: 'InterCHARM Korea 2026',
    source_url: 'https://ick.intercharmkorea.com/kor/exhibitor/exhi_detail04.asp?idx=6370&param=%26page%3D30&ref_idx=17702',
    evidence_type: 'official_exhibitor_profile', evidence_text: 'Official InterCHARM Korea exhibitor profile; booth D68.'
  },
  {
    company: 'Guangzhou Ruikang Personal Care Co., Ltd.', country: 'China', domain: 'ruikancare.com', tier: 'korea_beauty_event_2026', score: 94,
    source_event: 'InterCHARM Korea 2026',
    source_url: 'https://www.ruikancare.com/news/Ruikan-at-InterCHARM-KOREA-2026-OEM-ODM-Oral-Care-for-Global-Buyers-COEX-Seoul.html',
    evidence_type: 'company_announcement', evidence_text: 'Company site states participation in InterCHARM Korea 2026 at COEX.'
  },
  {
    company: 'Guangzhou Lvfangzhou Industrial Co., Ltd.', country: 'China', domain: 'lfz-nonwoven.com', tier: 'korea_beauty_event_2026', score: 94,
    source_event: 'InterCHARM Korea 2026',
    source_url: 'https://www.lfz-nonwoven.com/',
    evidence_type: 'company_announcement', evidence_text: 'Company site reports completion of InterCHARM Korea 2026 and booth participation.'
  },
  {
    company: 'Faverton Group Inc.', country: 'Philippines', tier: 'korea_beauty_event_2026', score: 90,
    source_event: 'InterCHARM Korea 2026',
    source_url: 'https://ph.linkedin.com/company/faverton-group-inc',
    evidence_type: 'attendee_announcement', evidence_text: 'Company LinkedIn states it participated in InterCHARM Korea 2026 in Seoul.'
  },
  ...[
    'ALGAKTIV',
    'Givaudan Active Beauty',
    'PROVITAL, S.A.',
    'LipoTrue, SL',
    'Lucas Meyer Cosmetics by Clariant',
    'RAHN AG',
    'Solabia Group',
    'Vytrus Biotech'
  ].map(company => ({
    company, country: '', tier: 'korea_beauty_event_2026', score: 90,
    source_event: 'in-cosmetics Korea 2026',
    source_url: 'https://www.in-cosmetics.com/korea/ko-kr/visit/awards.html',
    evidence_type: 'official_2026_awards', evidence_text: 'Named on the official in-cosmetics Korea 2026 awards/shortlist page.'
  }))
];

function clean(value = '', max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function decodeHtml(value = '') {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n) || 32));
}

function stripTags(value = '') {
  return clean(decodeHtml(String(value || '').replace(/<[^>]+>/g, ' ')), 180);
}

function companyKey(value = '') {
  return clean(value, 180).toLowerCase()
    .replace(/\b(?:inc|llc|ltd|limited|corp|corporation|company|co|gmbh|plc)\b/giu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}

function validCompany(value = '') {
  const name = clean(value, 180);
  if (name.length < 2 || name.length > 150) return false;
  if (/^(?:view profile|profile|home|about|contact|search|more|next|previous|exhibitor list)$/i.test(name)) return false;
  return true;
}

function absoluteUrl(href = '') {
  try { return new URL(decodeHtml(href), INTERCHARM_ORIGIN).href; }
  catch { return ''; }
}

export function parseIntercharmList(html = '', pageUrl = INTERCHARM_BASE) {
  const rows = [];
  const seen = new Set();
  const anchor = /<a\b[^>]*href\s*=\s*["']([^"']*exhi_detail04\.asp[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchor.exec(String(html || '')))) {
    const company = stripTags(match[2]);
    const key = companyKey(company);
    if (!validCompany(company) || !key || seen.has(key)) continue;
    seen.add(key);
    const sourceUrl = absoluteUrl(match[1]) || pageUrl;
    rows.push({
      company,
      country: '',
      tier: 'korea_beauty_event_2026',
      score: 88,
      source_event: 'InterCHARM Korea 2026',
      source_url: sourceUrl,
      source_title: 'InterCHARM Korea 2026 official exhibitor portal',
      evidence_type: 'official_exhibitor_directory',
      evidence_text: 'Listed in the official InterCHARM Korea exhibitor portal for the 1–3 July 2026 event.',
      curated_2026: true,
      foreign_status: 'pending_official_domain_verification'
    });
  }
  return rows;
}

async function fetchText(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KoreaProAgent/1.0; +https://github.com/Flow4Work/koreaproagent)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) return '';
    return await response.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit(items, limit, worker) {
  const input = Array.isArray(items) ? items : [];
  const out = new Array(input.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= input.length) return;
      try { out[index] = await worker(input[index], index); }
      catch { out[index] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, input.length || 1)) }, run));
  return out;
}

export async function collectOfficial2026Seeds(target = TARGET_DEFAULT) {
  const wanted = Math.max(1, Math.min(MAX_TARGET, Number(target) || TARGET_DEFAULT));
  const rows = [];
  const seen = new Set();

  const add = item => {
    const company = clean(item?.company, 180);
    const key = companyKey(company);
    if (!validCompany(company) || !key || seen.has(key)) return false;
    seen.add(key);
    rows.push({ ...item, company, curated_2026: true });
    return true;
  };

  for (const item of CURATED_FOREIGN_2026) add(item);

  const pages = Array.from({ length: MAX_PAGES }, (_, i) => i + 1);
  for (let start = 0; start < pages.length && rows.length < wanted; start += PAGE_CONCURRENCY) {
    const batch = pages.slice(start, start + PAGE_CONCURRENCY);
    const pageRows = await mapLimit(batch, PAGE_CONCURRENCY, async page => {
      const url = page === 1 ? INTERCHARM_BASE : `${INTERCHARM_BASE}?page=${page}`;
      const html = await fetchText(url);
      return parseIntercharmList(html, url);
    });
    let added = 0;
    for (const group of pageRows) {
      for (const item of Array.isArray(group) ? group : []) {
        if (rows.length >= wanted) break;
        if (add(item)) added += 1;
      }
    }
    if (!added && start >= 24) break;
  }

  return rows.slice(0, wanted);
}

function setCors(req, res) {
  const origin = req?.headers?.origin || '';
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const requested = Number(req.method === 'GET' ? req.query?.limit : req.body?.limit) || TARGET_DEFAULT;
  const limit = Math.max(1, Math.min(MAX_TARGET, requested));
  const candidates = await collectOfficial2026Seeds(limit);

  const exact = candidates.filter(item => item.tier === 'current_kbeauty_2026').length;
  const curatedForeign = candidates.filter(item => clean(item.country, 80)).length;
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(200).json({
    ok: true,
    candidates,
    meta: {
      requested: limit,
      returned: candidates.length,
      exact_kbeauty_2026: exact,
      curated_foreign_known: curatedForeign,
      official_2026_source: 'InterCHARM Korea 2026 official exhibitor portal',
      official_2026_source_url: INTERCHARM_BASE,
      secondary_2026_source_url: INCOSMETICS_2026,
      rule: 'These are source-backed 2026 candidates. Foreign legal entity, official domain, Company Identity and email must still pass the existing strict downstream verification before sending.',
      collected_at: new Date().toISOString()
    }
  });
}
