import { aiConfigured, chatJson } from '../lib/ai-provider.js';
import {
  buildGlobalExclusions, clean, fetchPage, isKoreanCountry, mapLimit, normalizeCompanyKey,
  publicWebSearch, publicWebSearchMany, resolveOfficialWebsite, rootHost, suppressExactSent,
  textMatchesCompany, verifyForeignEntity
} from '../lib/international-event-campaign.js';

const EVENT = { name:'K-Beauty Expo Korea 2026', dates:'2026-10-15–2026-10-17', venue:'KINTEX, Goyang, Korea' };
const OFFICIAL_DOMAIN = 'kbeautyexpo.com';
const OFFICIAL_HOME = 'https://kbeautyexpo.com/fairDash.do?hl=ENG';
const SEEDS = [
  OFFICIAL_HOME,
  'https://kbeautyexpo.com/fairDash.do?hl=KOR',
  'https://kbeautyexpo.com/fairCorpList.do?hl=ENG',
  'https://kbeautyexpo.com/fairCorpList.do?hl=KOR'
];
const CURRENT = /(?:K-?Beauty\s+Expo(?:\s+Korea)?[^\n]{0,120}2026|2026[^\n]{0,120}K-?Beauty\s+Expo|2026[.\-/\s]*(?:10|Oct(?:ober)?)[.\-/\s]*(?:15|16|17))/i;
const PARTICIPATES = /(exhibitor|exhibiting|exhibit|booth|stand|participat|pavilion|참가업체|참가사|전시업체|부스|참가|出展|参加|參展|参展)/i;
const RECRUITING = /(apply\s+to\s+exhibit|exhibitor\s+application|registration\s+open|application\s+form|참가\s*신청|참가업체\s*모집|모집|募集|応募)/i;
const DIRECTORY = /(fairCorp|corpList|exhibitor|participant|company|참가업체|참가사)/i;
const BAD_SOURCE = /(?:linkedin|facebook|instagram|youtube|twitter|wikipedia|10times|eventbrite|medium|tradefairdates|eventseye)\./i;

const canonical = value => {
  try { const u = new URL(value); u.hash = ''; return u.toString(); } catch { return ''; }
};
const official = value => rootHost(value) === OFFICIAL_DOMAIN;

function pageVariants(url = '') {
  try {
    const base = new URL(url);
    if (!/fairCorpList\.do/i.test(base.pathname)) return [];
    return Array.from({ length:20 }, (_, i) => {
      const u = new URL(base);
      u.searchParams.set('selPageNo', String(i + 1));
      return u.toString();
    });
  } catch { return []; }
}

async function crawlDirectory() {
  const seedPages = (await mapLimit(SEEDS, 4, url => fetchPage(url, { timeoutMs:7000, maxBytes:850000 }))).filter(Boolean);
  const urls = new Map();
  for (const page of seedPages) {
    urls.set(canonical(page.url), page.url);
    for (const link of page.links || []) {
      if (official(link.url) && DIRECTORY.test(`${link.url} ${link.text || ''}`)) urls.set(canonical(link.url), link.url);
    }
  }
  for (const url of [...urls.values()]) for (const variant of pageVariants(url)) urls.set(canonical(variant), variant);
  const extraUrls = [...urls.values()].filter(url => !seedPages.some(p => canonical(p.url) === canonical(url))).slice(0, 90);
  const extraPages = (await mapLimit(extraUrls, 6, url => fetchPage(url, { timeoutMs:7000, maxBytes:850000 }))).filter(Boolean);
  const byUrl = new Map([...seedPages, ...extraPages].map(page => [canonical(page.url), page]));
  const pages = [...byUrl.values()].filter(page => {
    if (!official(page.url)) return false;
    if (CURRENT.test(page.text || '')) return true;
    return /fairCorpList\.do/i.test(page.url) && /K-?Beauty|뷰티/i.test(page.text || '');
  });
  return { seedLoaded:seedPages.length, loaded:byUrl.size, pages };
}

function cleanName(value = '') {
  const name = clean(value, 160).replace(/^[\s•·|–—-]+|[\s•·|–—-]+$/g, '');
  if (!name || name.length < 2 || name.length > 140) return '';
  if (/^(?:home|about|contact|search|more|detail|view|next|previous|english|korean|한국어|목록|상세|검색|전체|company|companies|exhibitors?|participants?|참가업체|참가사|업체)$/i.test(name)) return '';
  return name;
}

function linkNames(pages = []) {
  const out = [];
  for (const page of pages) for (const link of page.links || []) {
    if (!official(link.url) || !DIRECTORY.test(link.url)) continue;
    const company = cleanName(link.text);
    if (!company) continue;
    out.push({ company, country:'', page, confidence:96 });
  }
  return out;
}

async function aiNames(pages = []) {
  if (!pages.length || !aiConfigured()) return [];
  const chunks = [];
  for (let i = 0; i < pages.length; i += 10) chunks.push(pages.slice(i, i + 10));
  const batches = await mapLimit(chunks, 3, async (chunk, chunkIndex) => {
    const rows = chunk.map((page, index) => ({ id:`p${chunkIndex}-${index}`, url:page.url, text:clean(page.text, 9000) }));
    const prompt = `Extract only NAMED CURRENT 2026 exhibitors/participating brands from these OFFICIAL K-Beauty Expo Korea pages.
Reject organizers, venue, media, menus, buyers, visitors, application/recruitment copy, past exhibitors and anything not literally in the row.
Do not infer or invent attendance, country, website or company names. Country may be empty.
Return JSON only: {"items":[{"id":"p0-0","company":"exact displayed company/brand","country":"","confidence":95}]}
Use confidence >=90 only.
ROWS:
${JSON.stringify(rows)}`;
    try {
      const result = await chatJson({ prompt, maxTokens:3200, timeoutMs:32000, temperature:0, hardDeadlineMs:44000 });
      const pageById = new Map(rows.map((row, index) => [row.id, chunk[index]]));
      return (Array.isArray(result?.data?.items) ? result.data.items : []).map(item => {
        const company = cleanName(item?.company);
        const page = pageById.get(clean(item?.id, 50));
        const confidence = Number(item?.confidence) || 0;
        if (!company || !page || confidence < 90 || !textMatchesCompany(company, page.text)) return null;
        return { company, country:clean(item?.country, 80), page, confidence };
      }).filter(Boolean);
    } catch { return []; }
  });
  return batches.flat();
}

function uniqueNames(rows = []) {
  const seen = new Set();
  return rows.filter(row => {
    const key = cleanName(row.company).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cycleSlice(items = [], cycle = 1, size = 90) {
  if (!items.length) return [];
  const width = Math.min(size, items.length);
  const start = ((Math.max(1, Number(cycle) || 1) - 1) * width) % items.length;
  return Array.from({ length:width }, (_, i) => items[(start + i) % items.length]);
}

async function resolveOfficialForeign(rows = [], excludes = new Set()) {
  const stats = { website:0, origin:0 };
  const resolved = (await mapLimit(rows, 6, async row => {
    const website = await resolveOfficialWebsite(row.company, isKoreanCountry(row.country) ? '' : row.country, row.page?.links || [], excludes, [OFFICIAL_DOMAIN]);
    if (!website) { stats.website += 1; return null; }
    const domain = normalizeCompanyKey(website.domain);
    if (!domain || excludes.has(domain)) return null;
    const foreign = await verifyForeignEntity({ company:row.company, website, sourceText:row.page?.text || '', countryHint:row.country });
    if (!foreign) { stats.origin += 1; return null; }
    return {
      company:row.company, country:foreign.country, domain:foreign.domain, url:foreign.url,
      source:{ title:'K-Beauty Expo Korea 2026 official exhibitor directory', url:row.page.url, text:clean(row.page.text, 16000) }
    };
  })).filter(Boolean);
  return { rows:[...new Map(resolved.map(row => [row.domain, row])).values()], stats };
}

async function fallbackCandidates(excludes = new Set()) {
  if (!aiConfigured()) return [];
  const queries = [
    '"K-Beauty Expo Korea 2026" exhibitor',
    '"K-Beauty Expo Korea 2026" participating',
    '"K-뷰티엑스포 코리아 2026" 참가',
    '"K-Beauty Expo Korea" 2026 出展',
    '"K-Beauty Expo Korea" 2026 參展'
  ];
  const searched = await publicWebSearchMany(queries, { maxResults:14, timeRange:'year', topic:'general' }).catch(() => ({ results:[] }));
  const rows = (Array.isArray(searched?.results) ? searched.results : []).map((row, i) => ({
    id:`w${i}`, title:clean(row?.title, 260), url:clean(row?.url, 500), text:clean(`${row?.title || ''} ${row?.content || ''}`, 6000)
  })).filter(row => row.url && !BAD_SOURCE.test(rootHost(row.url)) && CURRENT.test(row.text) && PARTICIPATES.test(row.text));

  if (!rows.length) return [];
  const prompt = `Extract only a NAMED FOREIGN company/brand explicitly saying it will exhibit/participate at K-Beauty Expo Korea 2026.
Reject organizers, Korean agencies/distributors/branches, generic lists and past participation. Do not invent anything.
JSON only: {"items":[{"id":"w0","company":"exact name","country":"","confidence":92}]}
Use confidence >=90.
ROWS:
${JSON.stringify(rows)}`;
  let items = [];
  try {
    const result = await chatJson({ prompt, maxTokens:2400, timeoutMs:30000, temperature:0, hardDeadlineMs:42000 });
    items = Array.isArray(result?.data?.items) ? result.data.items : [];
  } catch { return []; }

  const byId = new Map(rows.map(row => [row.id, row]));
  return (await mapLimit(items.slice(0, 40), 5, async item => {
    const row = byId.get(clean(item?.id, 50));
    const company = cleanName(item?.company);
    if (!row || !company || Number(item?.confidence) < 90) return null;
    const page = await fetchPage(row.url, { timeoutMs:6000, maxBytes:350000 });
    const website = await resolveOfficialWebsite(company, clean(item?.country, 80), page?.links || [], excludes, [OFFICIAL_DOMAIN]);
    if (!website) return null;
    const domain = normalizeCompanyKey(website.domain);
    if (!domain || excludes.has(domain)) return null;
    const foreign = await verifyForeignEntity({ company, website, sourceText:row.text, countryHint:clean(item?.country, 80) });
    if (!foreign) return null;

    const proofQueries = [
      `site:${foreign.domain} "K-Beauty Expo Korea" 2026`,
      `site:${foreign.domain} "K-Beauty Expo" Korea 2026`
    ];
    for (const query of proofQueries) {
      const proof = await publicWebSearch(query, { maxResults:8, timeRange:'year', includeDomains:[foreign.domain], topic:'general' }).catch(() => null);
      for (const hit of Array.isArray(proof?.results) ? proof.results : []) {
        if (rootHost(hit?.url) !== foreign.domain) continue;
        const proofPage = await fetchPage(hit.url, { timeoutMs:6500, maxBytes:450000 });
        const text = clean(`${hit?.title || ''} ${hit?.content || ''} ${proofPage?.text || ''}`, 18000);
        if (CURRENT.test(text) && PARTICIPATES.test(text) && !RECRUITING.test(text) && textMatchesCompany(company, text)) {
          return { company, country:foreign.country, domain:foreign.domain, url:foreign.url, source:{ title:`${company} official 2026 K-Beauty Expo participation`, url:hit.url, text } };
        }
      }
    }
    return null;
  })).filter(Boolean);
}

function lead(candidate) {
  const company = clean(candidate.company, 180);
  const domain = rootHost(candidate.domain);
  return {
    id:`kbeauty:${domain}`, campaign:'kbeauty', campaign_label:'K-Beauty Expo Korea 2026 단체복',
    company, domain, url:candidate.url || `https://${domain}/`,
    source_url:clean(candidate.source?.url, 500), source_title:clean(candidate.source?.title, 260),
    score:0, sales_priority:0, verified_company:true, kbeauty_confirmed:true,
    team_origin:'foreign', team_origin_country:clean(candidate.country, 80), outreach_language:'en',
    recommended_role:'Marketing / Events',
    role_targets:['Marketing Director','Brand Manager','Events Manager','International Sales','Export Manager','Partnerships','Founder','CEO'],
    subject:'Quick question about your K-Beauty Expo Korea team',
    message_en:`Hi,

I saw that ${company} is exhibiting at K-Beauty Expo Korea 2026 this October.

Quick question — have you already sorted branded staff shirts or team wear for your Korea booth team?

We produce custom apparel locally in Korea and can deliver directly to KINTEX or your hotel, so your team does not need to ship boxes internationally.

If it is still open, I can send a few simple options with pricing and turnaround.`,
    message_ko:'', contact:null, contacts:[], contact_status:'pending'
  };
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); }
  catch { return Response.json({ error:'요청 형식이 잘못됐습니다.' }, { status:400 }); }

  const history = await buildGlobalExclusions(Array.isArray(body.excludeDomains) ? body.excludeDomains : []);
  try {
    const crawled = await crawlDirectory();
    const named = uniqueNames([...linkNames(crawled.pages), ...await aiNames(crawled.pages)]);
    const cycle = Math.max(1, Number(body.cycle) || 1);
    const batch = cycleSlice(named, cycle, 90);
    const officialForeign = await resolveOfficialForeign(batch, history.set);
    const fallback = officialForeign.rows.length < 8 ? await fallbackCandidates(history.set) : [];

    const seen = new Set();
    const provisional = [];
    for (const candidate of [...officialForeign.rows, ...fallback]) {
      const domain = normalizeCompanyKey(candidate.domain);
      if (!domain || seen.has(domain) || history.set.has(domain) || isKoreanCountry(candidate.country)) continue;
      seen.add(domain);
      provisional.push(lead(candidate));
      if (provisional.length >= 40) break;
    }
    const exact = await suppressExactSent(provisional, history.secret);

    return Response.json({
      campaign:'kbeauty', campaign_label:'K-Beauty Expo Korea 2026 단체복', leads:exact.leads,
      meta:{
        event:EVENT, official_source:OFFICIAL_HOME, cycle,
        official_seed_pages_loaded:crawled.seedLoaded, official_pages_loaded:crawled.loaded,
        official_directory_pages:crawled.pages.length, official_named_rows:named.length, official_cycle_rows:batch.length,
        official_foreign_candidates:officialForeign.rows.length, official_website_unresolved:officialForeign.stats.website,
        official_origin_unresolved:officialForeign.stats.origin, fallback_foreign_candidates:fallback.length,
        returned:exact.leads.length, sent_preexcluded:history.sent.length, deleted_preexcluded:history.deleted.length,
        sent_exact_suppressed:exact.suppressed,
        participant_gate:'current 2026 official K-Beauty Expo exhibitor directory; fallback only with company-owned official-domain participation proof',
        historical_participants_allowed:false,
        team_origin_gate:'foreign HQ/company only; Korean company/branch/distributor and unresolved origin rejected',
        email_gate:'Hunter + official-company-site discovery; guessed emails forbidden'
      }
    }, { headers:{ 'Cache-Control':'no-store' } });
  } catch (error) {
    return Response.json({ error:clean(error?.message || error, 400) || 'K-Beauty Expo Korea 2026 후보 검색에 실패했습니다.' }, { status:Number(error?.status) || 502 });
  }
}
