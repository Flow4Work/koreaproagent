import { aiConfigured, chatJson } from '../lib/ai-provider.js';
import {
  buildGlobalExclusions,
  clean,
  fetchPage,
  inferCountry,
  isKoreanCountry,
  mapLimit,
  normalizeCompanyKey,
  publicWebSearchMany,
  resolveOfficialWebsite,
  rootHost,
  stripHtml,
  suppressExactSent,
  verifyForeignEntity
} from '../lib/international-event-campaign.js';

const EVENT = {
  name:'World Smart City Expo 2026',
  short:'WSCE 2026',
  dates:'2026-09-09–2026-09-11',
  venue:'BEXCO, Busan'
};
const OFFICIAL_DOMAIN = 'worldsmartcityexpo.com';
const OFFICIAL_LIST = 'https://worldsmartcityexpo.com/board/bbs/board.php?bo_table=company_en';
const LIST_PAGES = Array.from({ length:14 }, (_, index) => `${OFFICIAL_LIST}&page=${index + 1}`);
const WSCE_CONTEXT = /(?:\bWSCE\b|World\s+Smart\s+City\s+Expo)/i;
const WSCE_2026 = /(?:\bWSCE\s*2026\b|World\s+Smart\s+City\s+Expo[^\n]{0,100}\b2026\b|2026[^\n]{0,100}World\s+Smart\s+City\s+Expo)/i;
const PARTICIPATION = /(exhibitor|exhibiting|participat(?:e|es|ed|ing|ion)|booth|stand\s*(?:no\.?|#)?|pavilion|delegation|attend(?:s|ed|ing)|join(?:s|ed|ing)|meet\s+us\s+at|see\s+you\s+at|showcas(?:e|ing)|출전|참가|전시|부스|出展|参加|參展|参展)/i;
const BAD_NAME = /(?:World Smart City Expo|WSCE|List of Participating Companies|Participating Companies|Smart City Expo|BEXCO|board|view|home)/i;

function htmlAttributeValues(html = '', attribute = 'alt') {
  const out = [];
  const regex = new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']+)["']`, 'gi');
  let match;
  while ((match = regex.exec(String(html)))) {
    const value = clean(stripHtml(match[1] || '', 220), 180);
    if (value) out.push(value);
  }
  return out;
}

function titleCandidates(page = {}, nameHint = '') {
  const html = String(page?.html || '');
  const values = [clean(nameHint, 180)];
  const patterns = [
    /<meta\b[^>]*(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:title["'][^>]*>/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    /<h2[^>]*>([\s\S]*?)<\/h2>/i
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern)?.[1];
    if (match) values.push(clean(stripHtml(match, 220), 180));
  }
  values.push(...htmlAttributeValues(html, 'alt'), ...htmlAttributeValues(html, 'title'));
  return [...new Set(values.map(value => value
    .replace(/\s*[|–—-]\s*(?:WSCE|World Smart City Expo).*$/i, '')
    .replace(/^(?:WSCE|World Smart City Expo)[^|–—-]*[|–—-]\s*/i, '')
    .trim()).filter(value => value.length >= 2 && value.length <= 150 && !BAD_NAME.test(value)))];
}

function listDetailLinks(page = {}) {
  const out = [];
  for (const link of page?.links || []) {
    let parsed;
    try { parsed = new URL(link.url); } catch { continue; }
    if (rootHost(parsed.href) !== OFFICIAL_DOMAIN) continue;
    if (parsed.searchParams.get('bo_table') !== 'company_en' || !parsed.searchParams.get('wr_id')) continue;
    const id = clean(parsed.searchParams.get('wr_id'), 30);
    if (!/^\d+$/.test(id)) continue;
    const nameHint = clean(link.text, 180);
    out.push({ id, url:`https://worldsmartcityexpo.com/board/bbs/board.php?bo_table=company_en&wr_id=${id}`, nameHint });
  }

  const html = String(page?.html || '');
  const regex = /<a\b[^>]*href\s*=\s*["']([^"']*bo_table=company_en[^"']*wr_id=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html))) {
    const id = clean(match[2], 30);
    const body = match[3] || '';
    const alt = htmlAttributeValues(body, 'alt')[0] || htmlAttributeValues(body, 'title')[0] || '';
    out.push({ id, url:`https://worldsmartcityexpo.com/board/bbs/board.php?bo_table=company_en&wr_id=${id}`, nameHint:clean(stripHtml(body, 180) || alt, 180) });
  }
  const byId = new Map();
  for (const item of out) {
    const prev = byId.get(item.id);
    if (!prev || (!prev.nameHint && item.nameHint)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

async function officialParticipantRows() {
  const pages = (await mapLimit(LIST_PAGES, 5, url => fetchPage(url, { timeoutMs:6500, maxBytes:650000 }))).filter(Boolean);
  const details = new Map();
  for (const page of pages) for (const item of listDetailLinks(page)) {
    const prev = details.get(item.id);
    if (!prev || (!prev.nameHint && item.nameHint)) details.set(item.id, item);
  }

  const rows = (await mapLimit([...details.values()].slice(0, 220), 7, async item => {
    const page = await fetchPage(item.url, { timeoutMs:6500, maxBytes:650000 });
    if (!page) return null;
    const candidates = titleCandidates(page, item.nameHint);
    const foreignCountry = inferCountry(page.text, '');
    return {
      id:`official-${item.id}`,
      official:true,
      detail_id:item.id,
      url:item.url,
      text:clean(page.text, 18000),
      links:page.links || [],
      name_candidates:candidates,
      country_hint:isKoreanCountry(foreignCountry) ? '' : foreignCountry
    };
  })).filter(Boolean);
  return { list_pages:pages.length, detail_links:details.size, rows };
}

async function aiExtractOfficial(rows = []) {
  if (!rows.length || !aiConfigured()) return [];
  const chunks = [];
  for (let index = 0; index < rows.length; index += 18) chunks.push(rows.slice(index, index + 18));
  const results = await Promise.all(chunks.map(async chunk => {
    const prompt = `Extract only the actual company/organization represented by each CURRENT WSCE 2026 official participant-detail page.
The rows come directly from the official WSCE 2026 "List of Participating Companies", so participation is established by the source itself.
Do not invent a company, country, website, booth, or participation fact. Use only text/name candidates present in each row.
Reject navigation labels, categories, BEXCO/WSCE itself, Korean companies, Korean subsidiaries/branches, and rows where the participant name cannot be identified.
Country may be empty if the official row does not state it.
Return JSON only: {"items":[{"row_id":"official-123","company":"exact participant name","country":"country or empty","confidence":90}]}
Confidence must be >=85 only when the participant name is directly supported.
ROWS:\n${JSON.stringify(chunk.map(row => ({ row_id:row.id, name_candidates:row.name_candidates, text:clean(row.text, 6500), url:row.url })))}`;
    try {
      const result = await chatJson({ prompt, maxTokens:2600, timeoutMs:30000, temperature:0, hardDeadlineMs:42000 });
      return (Array.isArray(result?.data?.items) ? result.data.items : []).map(item => ({
        row_id:clean(item?.row_id, 40), company:clean(item?.company, 160), country:clean(item?.country, 80), confidence:Number(item?.confidence) || 0
      })).filter(item => item.row_id && item.company && item.confidence >= 85);
    } catch { return []; }
  }));
  return results.flat();
}

function deterministicOfficialNames(rows = []) {
  const out = [];
  for (const row of rows) {
    const candidate = (row.name_candidates || []).find(name => name.length >= 2 && !BAD_NAME.test(name));
    if (!candidate) continue;
    out.push({ row_id:row.id, company:candidate, country:row.country_hint || '', confidence:88 });
  }
  return out;
}

async function resolveOfficialCandidates(rows = [], extracted = [], excludes = new Set()) {
  const rowById = new Map(rows.map(row => [row.id, row]));
  const merged = new Map();
  for (const item of [...deterministicOfficialNames(rows), ...extracted].sort((a,b) => b.confidence - a.confidence)) {
    if (!item.company || merged.has(item.row_id)) continue;
    merged.set(item.row_id, item);
  }
  return (await mapLimit([...merged.values()].slice(0, 100), 6, async item => {
    const row = rowById.get(item.row_id);
    if (!row) return null;
    const countryHint = isKoreanCountry(item.country) ? '' : (item.country || row.country_hint || '');
    const website = await resolveOfficialWebsite(item.company, countryHint, row.links, excludes, [OFFICIAL_DOMAIN]);
    if (!website) return null;
    const domain = normalizeCompanyKey(website.domain);
    if (!domain || excludes.has(domain)) return null;
    const foreign = await verifyForeignEntity({ company:item.company, website, sourceText:row.text, countryHint });
    if (!foreign) return null;
    return {
      company:item.company,
      country:foreign.country,
      domain:foreign.domain,
      url:foreign.url,
      participation:'official exhibitor list',
      confidence:Math.max(90, item.confidence),
      source:{ title:'WSCE 2026 List of Participating Companies', url:row.url, text:row.text }
    };
  })).filter(Boolean);
}

async function fallbackRows() {
  const queries = [
    '"WSCE 2026" exhibitor company',
    '"World Smart City Expo 2026" participating company',
    '"WSCE 2026" booth Busan',
    '"WSCE 2026" pavilion delegation',
    '"WSCE 2026" 出展',
    '"WSCE 2026" 参加 부산'
  ];
  try {
    const result = await publicWebSearchMany(queries, { maxResults:18, timeRange:'year', topic:'general' });
    return (Array.isArray(result?.results) ? result.results : []).map((row, index) => ({
      id:`web-${index}`, title:clean(row?.title, 260), url:clean(row?.url, 500), text:clean(row?.content, 6000), published_date:clean(row?.published_date, 80)
    })).filter(row => WSCE_CONTEXT.test(`${row.title} ${row.text}`) && (WSCE_2026.test(`${row.title} ${row.text}`) || /^2026/.test(row.published_date)) && PARTICIPATION.test(`${row.title} ${row.text}`));
  } catch { return []; }
}

async function aiExtractFallback(rows = []) {
  if (!rows.length || !aiConfigured()) return [];
  const prompt = `Find NAMED non-Korean companies with direct, current WSCE 2026 participation evidence in the supplied web rows.
Accept exhibitor/booth/stand, explicit attending/exhibiting/participating, pavilion or overseas delegation. Reject generic event promotion, recruitment, historical attendance, Korean companies/subsidiaries, and a company that is merely globally active.
Never invent company, country, website or participation. Return only items directly supported by a row.
JSON only: {"items":[{"row_id":"web-0","company":"exact name","country":"country or empty","participation":"exhibitor|booth|attendance|pavilion|delegation","confidence":90}]}
Use confidence >=86.
ROWS:\n${JSON.stringify(rows.slice(0, 60).map(row => ({ row_id:row.id, title:row.title, url:row.url, text:clean(row.text, 3500), published_date:row.published_date })))}`;
  try {
    const result = await chatJson({ prompt, maxTokens:2800, timeoutMs:30000, temperature:0, hardDeadlineMs:42000 });
    return (Array.isArray(result?.data?.items) ? result.data.items : []).map(item => ({
      row_id:clean(item?.row_id, 40), company:clean(item?.company, 160), country:clean(item?.country, 80), participation:clean(item?.participation, 80), confidence:Number(item?.confidence) || 0
    })).filter(item => item.row_id && item.company && item.confidence >= 86);
  } catch { return []; }
}

async function resolveFallbackCandidates(rows = [], items = [], excludes = new Set()) {
  const byId = new Map(rows.map(row => [row.id, row]));
  return (await mapLimit(items.slice(0, 40), 5, async item => {
    const row = byId.get(item.row_id);
    if (!row) return null;
    const countryHint = isKoreanCountry(item.country) ? '' : item.country;
    const sourcePage = await fetchPage(row.url, { timeoutMs:6000, maxBytes:300000 });
    const sourceText = clean(`${row.title} ${row.text} ${sourcePage?.text || ''}`, 16000);
    if (!WSCE_CONTEXT.test(sourceText) || !PARTICIPATION.test(sourceText)) return null;
    const website = await resolveOfficialWebsite(item.company, countryHint, sourcePage?.links || [], excludes, [OFFICIAL_DOMAIN]);
    if (!website) return null;
    const domain = normalizeCompanyKey(website.domain);
    if (!domain || excludes.has(domain)) return null;
    const foreign = await verifyForeignEntity({ company:item.company, website, sourceText, countryHint });
    if (!foreign) return null;
    return { company:item.company, country:foreign.country, domain:foreign.domain, url:foreign.url, participation:item.participation || 'participation', confidence:item.confidence, source:{ title:row.title, url:row.url, text:sourceText } };
  })).filter(Boolean);
}

function leadFrom(candidate) {
  const company = clean(candidate.company, 160);
  const domain = rootHost(candidate.domain);
  const country = clean(candidate.country, 80);
  return {
    id:`wsce:${domain}`, campaign:'wsce', campaign_label:'WSCE 단체복', company, domain,
    url:candidate.url || `https://${domain}/`, source_url:clean(candidate.source?.url, 500), source_title:clean(candidate.source?.title, 260),
    score:Math.max(86, Math.min(99, Number(candidate.confidence) || 90)), sales_priority:Math.max(86, Math.min(99, Number(candidate.confidence) || 90)),
    verified_company:true, wsce_confirmed:true, team_origin:'foreign', team_origin_country:country, outreach_language:'en',
    recommended_role:'Events Lead',
    role_targets:['Events Lead','Event Marketing','Marketing Director','Partnerships Lead','Business Development Director','Operations Lead'],
    subject:'Quick question about WSCE 2026 in Busan',
    message_en:`Hi,\n\nI saw that ${company} is participating in WSCE 2026 in Busan. Quick question — have you already sorted team shirts or staff wear for your Korea trip?\n\nWe produce branded apparel locally in Korea and can deliver directly to your hotel, office or BEXCO, so your team does not need to ship boxes internationally or coordinate production after arrival.\n\nIf it is still open, I can send a few options with pricing and turnaround.`,
    message_ko:'', contact:null, contacts:[], contact_status:'pending'
  };
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); }
  catch { return Response.json({ error:'요청 형식이 잘못됐습니다.' }, { status:400 }); }

  const history = await buildGlobalExclusions(Array.isArray(body.excludeDomains) ? body.excludeDomains : []);
  try {
    const official = await officialParticipantRows();
    const officialExtracted = await aiExtractOfficial(official.rows);
    const officialCandidates = await resolveOfficialCandidates(official.rows, officialExtracted, history.set);

    let fallback = [];
    let fallbackSearched = 0;
    if (officialCandidates.length < 8) {
      const rows = await fallbackRows();
      fallbackSearched = rows.length;
      const extracted = await aiExtractFallback(rows);
      fallback = await resolveFallbackCandidates(rows, extracted, history.set);
    }

    const seen = new Set();
    const provisional = [];
    for (const candidate of [...officialCandidates, ...fallback].sort((a,b) => Number(b.confidence || 0) - Number(a.confidence || 0))) {
      const domain = normalizeCompanyKey(candidate.domain);
      if (!domain || seen.has(domain) || history.set.has(domain) || isKoreanCountry(candidate.country)) continue;
      seen.add(domain);
      provisional.push(leadFrom(candidate));
      if (provisional.length >= 40) break;
    }
    const exact = await suppressExactSent(provisional, history.secret);

    return Response.json({
      campaign:'wsce', campaign_label:'WSCE 단체복', leads:exact.leads,
      meta:{
        event:EVENT, official_source:OFFICIAL_LIST, official_list_pages_loaded:official.list_pages, official_detail_links:official.detail_links,
        official_detail_rows:official.rows.length, official_foreign_candidates:officialCandidates.length, public_web_fallback_used:officialCandidates.length < 8,
        fallback_rows:fallbackSearched, fallback_foreign_candidates:fallback.length, returned:exact.leads.length,
        sent_preexcluded:history.sent.length, deleted_preexcluded:history.deleted.length, sent_exact_suppressed:exact.suppressed,
        participant_gate:'current WSCE 2026 official participant list first; direct 2026 participation evidence only in fallback',
        team_origin_gate:'foreign participant entity only; Korean company/branch/subsidiary and unresolved origin rejected',
        email_gate:'contact-discovery-v2; frontend exposes qualified + valid + same-domain only'
      }
    }, { headers:{ 'Cache-Control':'no-store' } });
  } catch (error) {
    return Response.json({ error:clean(error?.message || error, 400) || 'WSCE 후보 검색에 실패했습니다.' }, { status:Number(error?.status) || 502 });
  }
}
