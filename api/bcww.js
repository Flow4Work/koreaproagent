import { tavilyConfigured, tavilySearch, tavilySearchMany } from '../lib/web-search.js';
import { aiConfigured, chatJson } from '../lib/ai-provider.js';
import { listSentCompanyDomains, normalizeCompanyKey } from '../lib/sent-companies.js';
import { listDeletedCompanyDomains } from '../lib/deleted-companies.js';

const EVENT = {
  name: 'BCWW 2026',
  dates: '2026-09-14–2026-09-16',
  venue: 'COEX Hall B, Seoul'
};

const SEARCH_QUERIES = [
  '"BCWW 2026" "Stand #" Seoul company',
  '"BCWW 2026" booth exhibitor Seoul company',
  '"BCWW 2026" exhibitor "COEX" company',
  '"BCWW 2026" showcase participant company',
  '"BCWW 2026" "see you" Seoul media company',
  '"BCWW 2026" "meet us" Seoul company'
];

const SOURCE_DOMAINS = new Set([
  'bcww.kr','coex.co.kr','coexcenter.com','linkedin.com','x.com','twitter.com',
  'facebook.com','instagram.com','youtube.com','bizinfo.go.kr','connectplt.kr',
  'globalexhibition.org','kocca.kr','mcst.go.kr','crunchbase.com','imdb.com','variety.com','deadline.com','thetvdb.com'
]);

const BAD_DOMAIN_PARTS = /(news|press|blog|medium|wikipedia|eventbrite|meetup|directory|exhibition|conference)/i;
const EXPLICIT_PARTICIPATION = /(stand\s*#|booth\s*(?:no\.?|#)?|exhibitor|exhibiting|showcase\s+(?:participant|company)|participating\s+(?:in|at)|we(?:'re| are)\s+(?:at|joining|exhibiting)|meet\s+us\s+(?:at|in)|see\s+you\s+(?:at|in))/i;
const BCWW_2026 = /\bBCWW\s*2026\b/i;
const KOREA_ENTITY = /(?:\bKorea\b|코리아|한국(?:지사|법인|오피스|사무소)?)/i;

const clean = (value = '', max = 500) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

function rootHost(value = '') {
  let raw = clean(value, 500).toLowerCase();
  if (!raw) return '';
  try { raw = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname; }
  catch { raw = raw.split('/')[0].split(':')[0]; }
  raw = raw.replace(/^www\./, '').replace(/\.+$/, '');
  const parts = raw.split('.').filter(Boolean);
  if (parts.length <= 2) return raw;
  const secondLevel = new Set(['ac','co','com','edu','go','gov','ne','net','or','org']);
  const depth = parts.at(-1)?.length === 2 && secondLevel.has(parts.at(-2)) ? 3 : 2;
  return parts.slice(-depth).join('.');
}

function directParticipation(text = '') {
  const value = clean(text, 5000);
  if (!BCWW_2026.test(value) || !EXPLICIT_PARTICIPATION.test(value)) return false;
  if (/\bBCWW\s*2025\b/i.test(value) && !BCWW_2026.test(value)) return false;
  return true;
}

function obviouslyKorean(company = '', domain = '', text = '') {
  const host = rootHost(domain);
  if (host.endsWith('.kr')) return true;
  if (KOREA_ENTITY.test(company)) return true;
  return /(?:Korea office|Korean office|한국지사|한국법인|서울지사)/i.test(clean(text, 4000));
}

function sourceLike(domain = '') {
  const host = rootHost(domain);
  return SOURCE_DOMAINS.has(host) || BAD_DOMAIN_PARTS.test(host);
}

function companyTokens(value = '') {
  return clean(value, 160).toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|company|co|gmbh|sa|srl|plc|group|studios?)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/).filter(token => token.length >= 3);
}

function titleMatchesCompany(company = '', row = {}) {
  const tokens = companyTokens(company);
  if (!tokens.length) return false;
  const text = `${row?.title || ''} ${row?.content || ''}`.toLowerCase();
  const hits = tokens.filter(token => text.includes(token)).length;
  return hits >= Math.min(2, tokens.length);
}

function displayCompanyFromTitle(title = '', domain = '') {
  let value = clean(title, 140)
    .replace(/\s+[|–—-]\s+.*$/, '')
    .replace(/\s*\|\s*LinkedIn.*$/i, '')
    .replace(/\s*-\s*(?:Home|Official|Website).*$/i, '')
    .trim();
  if (!value || value.length < 2) value = rootHost(domain).split('.')[0] || '';
  return value;
}

function foreignCcTld(domain = '') {
  const host = rootHost(domain);
  const tld = host.split('.').pop() || '';
  return /^[a-z]{2}$/.test(tld) && tld !== 'kr';
}

async function safeHistoryDomains() {
  const secret = clean(process.env.GMAIL_SESSION_SECRET, 5000);
  if (!secret) return { sent: [], deleted: [] };
  const [sent, deleted] = await Promise.all([
    listSentCompanyDomains(secret, 250).catch(() => []),
    listDeletedCompanyDomains(secret, 2000).catch(() => [])
  ]);
  return { sent, deleted };
}

function rawRows(search = {}) {
  return (Array.isArray(search?.results) ? search.results : [])
    .map((row, index) => ({
      id: `r${index}`,
      title: clean(row?.title, 260),
      url: clean(row?.url, 500),
      content: clean(row?.content || row?.snippet || row?.description, 1800),
      published_date: clean(row?.published_date, 80),
      engine: clean(row?._engine, 40) || 'web'
    }))
    .filter(row => /^https?:\/\//i.test(row.url))
    .filter(row => directParticipation(`${row.title} ${row.content}`));
}

async function aiExtract(rows = []) {
  if (!rows.length || !aiConfigured()) return [];
  const prompt = `Identify CURRENT foreign companies that are directly participating in BCWW 2026 in Seoul.

The goal is high precision, not volume. A company may be returned only when the supplied row itself clearly says the organization will take part in BCWW 2026 as an exhibitor, booth/stand operator, showcase participant, or an organization explicitly saying "meet us/see you at BCWW 2026".

STRICT EXCLUSIONS:
- Do not return companies merely mentioned as past BCWW 2025 participants.
- Do not return a person/company just because they liked, reposted, commented on, or were shown next to a generic BCWW registration announcement.
- Do not treat conference speakers, buyers, organizers, press articles, directories, or generic event pages as exhibitors.
- Do not return Korean companies or a Korean subsidiary/office.
- foreign=true only when the row gives a concrete non-Korean country/location/entity signal. If origin is uncertain, omit it.
- Never invent a website/domain.

Return JSON only:
{"items":[{"row_id":"r0","company":"official organization name","country":"country supported by row","participation":"booth|stand|exhibitor|showcase|explicit attendance","confidence":95}]}

Only include confidence >= 90.

ROWS:
${JSON.stringify(rows.map(row => ({
    row_id: row.id,
    title: row.title,
    url: row.url,
    text: row.content
  })))}`;

  try {
    const result = await chatJson({ prompt, maxTokens: 1800, timeoutMs: 30000, temperature: 0, hardDeadlineMs: 42000 });
    const items = Array.isArray(result?.data?.items) ? result.data.items : [];
    return items.map(item => ({
      row_id: clean(item?.row_id, 20),
      company: clean(item?.company, 140),
      country: clean(item?.country, 80),
      participation: clean(item?.participation, 80),
      confidence: Number(item?.confidence) || 0
    })).filter(item => item.row_id && item.company && item.country && item.confidence >= 90);
  } catch {
    return [];
  }
}

async function resolveOfficialDomain(company = '', country = '', excludes = new Set()) {
  const query = `"${clean(company, 140)}" official website ${clean(country, 80)}`;
  let result;
  try { result = await tavilySearch(query, { maxResults: 7, topic: 'general' }); }
  catch { return null; }
  const rows = Array.isArray(result?.results) ? result.results : [];
  for (const row of rows) {
    const domain = rootHost(row?.url);
    if (!domain || sourceLike(domain) || excludes.has(normalizeCompanyKey(domain))) continue;
    if (obviouslyKorean(company, domain, `${row?.title || ''} ${row?.content || ''}`)) continue;
    if (!titleMatchesCompany(company, row)) continue;
    return { domain, url: `https://${domain}/` };
  }
  return null;
}

async function directCandidates(rows = [], excludes = new Set()) {
  const out = [];
  for (const row of rows) {
    const domain = rootHost(row.url);
    if (!domain || sourceLike(domain) || excludes.has(normalizeCompanyKey(domain))) continue;
    const company = displayCompanyFromTitle(row.title, domain);
    const text = `${row.title} ${row.content}`;
    if (obviouslyKorean(company, domain, text)) continue;
    if (!foreignCcTld(domain)) continue;
    out.push({
      company,
      country: '',
      participation: 'explicit attendance',
      confidence: 92,
      domain,
      url: `https://${domain}/`,
      source: row
    });
  }
  return out;
}

function leadFrom(candidate) {
  const company = clean(candidate.company, 140);
  const domain = rootHost(candidate.domain);
  const source = candidate.source || {};
  const trigger = candidate.participation === 'stand' || candidate.participation === 'booth'
    ? `${company} is confirmed with a ${candidate.participation} at BCWW 2026`
    : `${company} is confirmed to participate in BCWW 2026`;

  return {
    id: `bcww:${domain}`,
    campaign: 'bcww',
    campaign_label: 'BCWW 단체복',
    company,
    domain,
    url: candidate.url || `https://${domain}/`,
    source_url: clean(source.url, 500),
    source_title: clean(source.title, 260),
    published_date: clean(source.published_date, 80),
    signal: trigger,
    score: 90,
    sales_priority: Number(candidate.confidence) || 90,
    verified_company: true,
    bcww_confirmed: true,
    team_origin: 'foreign',
    team_origin_country: clean(candidate.country, 80),
    outreach_language: 'en',
    recommended_role: 'Events Lead',
    role_targets: ['Events Lead','Event Marketing','Marketing Director','Partnerships Lead','Operations Lead','Business Development Director','Founder','CEO'],
    subject: `Quick question about ${company} at BCWW 2026`,
    message_en: `Hi,\n\nI saw that ${company} is participating in BCWW 2026 in Seoul. Quick question — have you already sorted team shirts or staff wear for the trip?\n\nWe produce branded apparel locally in Seoul and can deliver directly to your hotel, office or COEX, so your team does not have to manufacture overseas, ship boxes into Korea, or coordinate with Korean vendors after arrival.\n\nIf it is still open, I can send a few local options with pricing and turnaround.`,
    message_ko: '',
    contact: null,
    contact_status: 'pending'
  };
}

export function bcwwRowEligible(row = {}) {
  const text = `${row?.title || ''} ${row?.content || ''}`;
  return directParticipation(text);
}

export async function POST(request) {
  if (!tavilyConfigured()) return Response.json({ error: '검색 엔진 연결이 필요합니다.' }, { status: 503 });

  let body = {};
  try { body = await request.json(); }
  catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }

  const existing = Array.isArray(body.excludeDomains) ? body.excludeDomains : [];
  const history = await safeHistoryDomains();
  const excludes = new Set([...existing, ...history.sent, ...history.deleted].map(normalizeCompanyKey).filter(Boolean));

  try {
    const search = await tavilySearchMany(SEARCH_QUERIES, {
      maxResults: 12,
      timeRange: 'year',
      topic: 'general'
    });
    const rows = rawRows(search);

    const direct = await directCandidates(rows, excludes);
    const extracted = await aiExtract(rows);
    const rowById = new Map(rows.map(row => [row.id, row]));
    const resolved = [];

    for (const item of extracted.slice(0, 8)) {
      const source = rowById.get(item.row_id);
      if (!source) continue;
      if (obviouslyKorean(item.company, '', `${source.title} ${source.content}`)) continue;
      const official = await resolveOfficialDomain(item.company, item.country, excludes);
      if (!official) continue;
      resolved.push({ ...item, ...official, source });
    }

    const combined = [...direct, ...resolved];
    const seen = new Set();
    const leads = [];
    for (const candidate of combined.sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))) {
      const domain = normalizeCompanyKey(candidate.domain);
      if (!domain || seen.has(domain) || excludes.has(domain)) continue;
      if (obviouslyKorean(candidate.company, domain, `${candidate.source?.title || ''} ${candidate.source?.content || ''}`)) continue;
      seen.add(domain);
      leads.push(leadFrom(candidate));
      if (leads.length >= 10) break;
    }

    return Response.json({
      campaign: 'bcww',
      campaign_label: 'BCWW 단체복',
      leads,
      meta: {
        event: EVENT,
        returned: leads.length,
        searched_rows: rows.length,
        sent_preexcluded: history.sent.length,
        deleted_preexcluded: history.deleted.length,
        participation_gate: 'BCWW 2026 + direct exhibitor/booth/showcase/explicit attendance only',
        team_origin_gate: 'foreign only; uncertain or Korea entity rejected',
        historical_participants_allowed: false,
        email_gate: 'frontend exposes only same-domain qualified + valid contacts'
      }
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: clean(error?.message || error, 400) || 'BCWW 후보 검색에 실패했습니다.' }, { status: Number(error?.status) || 502 });
  }
}
