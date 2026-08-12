import { aiConfigured, chatJson } from '../lib/ai-provider.js';
import {
  buildGlobalExclusions,
  clean,
  fetchPage,
  inferCountry,
  isKoreanCountry,
  mapLimit,
  normalizeCompanyKey,
  publicWebSearch,
  publicWebSearchMany,
  resolveOfficialWebsite,
  rootHost,
  suppressExactSent,
  verifyForeignEntity
} from '../lib/international-event-campaign.js';

const EVENT = {
  name:'The 60th International Education & Career Fair in Korea',
  dates:{ busan:'2026-09-12–2026-09-13', seoul:'2026-09-19–2026-09-20' },
  venues:{ busan:'BEXCO, Busan', seoul:'COEX, Seoul' }
};
const OFFICIAL_DOMAIN = 'uhak2min.com';
const OFFICIAL_HOME = 'https://www.uhak2min.com/en/';
const OFFICIAL_SEEDS = [
  OFFICIAL_HOME,
  'https://www.uhak2min.com/en/exhibition/outline',
  'https://www.uhak2min.com/en/exhibitor/guide',
  'https://www.uhak2min.com/en/media/board-data',
  'https://www.uhak2min.com/en/media/board-notice',
  'https://www.uhak2min.com/en/media/board-news',
  'https://www.uhak2min.com/en/seminar',
  'https://www.uhak2min.com/en/exhibition/seminar',
  'https://www.uhak2min.com/en/exhibition/floor-plan',
  'https://www.uhak2min.com/en/media/newsletter'
];
const CURRENT_CONTEXT = /(?:\b60th\b|International\s+Education\s*(?:&|and)\s*Career\s+Fair[^\n]{0,120}(?:2026|Korea)|2026[^\n]{0,120}International\s+Education|Sep(?:tember)?\s*(?:12|13|19|20)[^\n]{0,80}2026|2026[^\n]{0,80}Sep(?:tember)?\s*(?:12|19))/i;
const PARTICIPATION = /(exhibitor|exhibiting|participat(?:e|es|ed|ing|ion)|booth|stand\s*(?:no\.?|#)?|seminar|present(?:er|ing)|attend(?:s|ed|ing)|join(?:s|ed|ing)|delegation|pavilion|유학박람회[^\n]{0,40}(?:참가|부스|세미나)|참가|出展|参加|參展|参展)/i;
const RECRUITMENT_ONLY = /(apply\s+to\s+exhibit|exhibitor\s+application|registration\s+open|register\s+now|application\s+form|모집|신청|募集|応募)/i;
const INSTITUTION_TYPE = /(university|college|school|academy|institute|institution|education|faculty|international\s+office|admissions|embassy|consulate|ministry|government|department\s+of\s+education|board\s+of\s+education|universit[ée]|universidad|universit[aà]|hochschule|大学|大學|学院|學院|教育|大使館|대학|대학교|학교|교육부|대사관)/i;
const KOREAN_AGENCY = /(유학원|유학센터|유학\s*에이전|study\s+abroad\s+agency|education\s+agency\s+(?:in\s+)?korea|korea\s+office|korean\s+branch|한국지사|한국법인|코리아)/i;
const OFFICIAL_PATH = /(exhibitor|seminar|floor|download|board-data|board-notice|board-news|newsletter|press|media|2026|60th|guide|outline)/i;
const BAD_SOURCE = /(?:linkedin\.com|facebook\.com|instagram\.com|youtube\.com|x\.com|twitter\.com|wikipedia\.org|10times\.com|studyabroad|directory|news|blog|medium\.com)/i;

function currentOfficialPage(page = {}) {
  const text = `${page.url || ''} ${page.text || ''}`;
  if (CURRENT_CONTEXT.test(text)) return true;
  return /\/en\/(?:$|exhibition\/outline|exhibitor\/guide|media\/board-data|media\/board-notice)/i.test(page.url || '') && /2026|60th|September|Sep\b/i.test(page.text || '');
}

async function crawlOfficialMaterials() {
  const first = (await mapLimit(OFFICIAL_SEEDS, 5, url => fetchPage(url, { timeoutMs:6500, maxBytes:700000 }))).filter(Boolean);
  const discovered = new Map();
  for (const page of first) {
    discovered.set(page.url.replace(/\/$/, ''), page.url);
    for (const link of page.links || []) {
      if (rootHost(link.url) !== OFFICIAL_DOMAIN || !OFFICIAL_PATH.test(`${link.url} ${link.text || ''}`)) continue;
      discovered.set(link.url.replace(/\/$/, ''), link.url);
    }
  }
  const additionalUrls = [...discovered.values()].filter(url => !OFFICIAL_SEEDS.some(seed => seed.replace(/\/$/, '') === url.replace(/\/$/, ''))).slice(0, 60);
  const additional = (await mapLimit(additionalUrls, 6, url => fetchPage(url, { timeoutMs:6500, maxBytes:700000 }))).filter(Boolean);
  const byUrl = new Map([...first, ...additional].map(page => [page.url.replace(/\/$/, ''), page]));
  const pages = [...byUrl.values()].filter(currentOfficialPage);
  return { seed_loaded:first.length, discovered:discovered.size, pages };
}

async function aiExtractOfficial(pages = []) {
  if (!pages.length || !aiConfigured()) return [];
  const chunks = [];
  for (let index = 0; index < pages.length; index += 14) chunks.push(pages.slice(index, index + 14));
  const results = await Promise.all(chunks.map(async (chunk, chunkIndex) => {
    const rows = chunk.map((page, index) => ({ id:`official-${chunkIndex}-${index}`, page }));
    const prompt = `Extract only NAMED CURRENT 2026 foreign participants in the 60th International Education & Career Fair in Korea from these OFFICIAL event-site pages.
Valid entities: university, college, school, education institution, embassy/consulate, ministry or government education organization.
Valid current participation evidence: listed exhibitor, booth/floor-plan entry, current 2026 seminar presenter/host institution, or an explicit 2026 participation statement.
Reject: past exhibitors, generic overseas university lists, event examples, Korean study-abroad agencies, Korean representatives/branches, application/recruitment notices, sponsors with no participation evidence, and any name not directly present in the row.
Do not infer attendance from reputation. Do not invent company, country, website or participation.
Return JSON only: {"items":[{"row_id":"official-0-0","company":"exact institution name","country":"country or empty","entity_type":"university|school|education institution|embassy|government","participation":"exhibitor|seminar|floor plan|explicit participation","confidence":90}]}
Use confidence >=86.
ROWS:\n${JSON.stringify(rows.map(row => ({ row_id:row.id, url:row.page.url, text:clean(row.page.text, 8500) })))}`;
    try {
      const result = await chatJson({ prompt, maxTokens:3000, timeoutMs:30000, temperature:0, hardDeadlineMs:42000 });
      const pageById = new Map(rows.map(row => [row.id, row.page]));
      return (Array.isArray(result?.data?.items) ? result.data.items : []).map(item => ({
        row_id:clean(item?.row_id, 50), company:clean(item?.company, 180), country:clean(item?.country, 80), entity_type:clean(item?.entity_type, 80), participation:clean(item?.participation, 80), confidence:Number(item?.confidence) || 0,
        page:pageById.get(clean(item?.row_id, 50)) || null
      })).filter(item => item.page && item.company && item.confidence >= 86 && INSTITUTION_TYPE.test(`${item.entity_type} ${item.company}`));
    } catch { return []; }
  }));
  return results.flat();
}

async function resolveOfficialCandidates(items = [], excludes = new Set()) {
  const seenNames = new Set();
  return (await mapLimit(items.sort((a,b) => b.confidence - a.confidence).filter(item => {
    const key = item.company.toLowerCase();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  }).slice(0, 80), 5, async item => {
    const sourceText = clean(item.page?.text, 18000);
    if (!CURRENT_CONTEXT.test(sourceText) || !PARTICIPATION.test(sourceText) || KOREAN_AGENCY.test(`${item.company} ${sourceText}`)) return null;
    const countryHint = isKoreanCountry(item.country) ? '' : item.country;
    const website = await resolveOfficialWebsite(item.company, countryHint, item.page?.links || [], excludes, [OFFICIAL_DOMAIN]);
    if (!website) return null;
    const domain = normalizeCompanyKey(website.domain);
    if (!domain || excludes.has(domain)) return null;
    const foreign = await verifyForeignEntity({ company:item.company, website, sourceText, countryHint });
    if (!foreign || !INSTITUTION_TYPE.test(`${item.entity_type} ${item.company} ${foreign.official_text}`)) return null;
    return {
      company:item.company, country:foreign.country, domain:foreign.domain, url:foreign.url,
      entity_type:item.entity_type, participation:item.participation, confidence:item.confidence,
      source:{ title:'60th International Education & Career Fair in Korea official material', url:item.page.url, text:sourceText }
    };
  })).filter(Boolean);
}

async function fallbackDiscoveryRows() {
  const queries = [
    '"60th International Education & Career Fair in Korea" exhibitor 2026',
    '"International Education & Career Fair in Korea" September 2026 university',
    '"Korea education fair" 2026 university COEX BEXCO attending',
    '"한국 유학 박람회" 2026 해외 대학 참가',
    '"韓国" "教育フェア" 2026 大学 参加',
    '"韓国" "留学フェア" 2026 大学 出展',
    '"韩国" "教育展" 2026 大学 参展',
    '"Korea" 2026 salon education université participant'
  ];
  const batches = [];
  for (let index = 0; index < queries.length; index += 6) {
    try { batches.push(await publicWebSearchMany(queries.slice(index, index + 6), { maxResults:18, timeRange:'year', topic:'general' })); }
    catch { /* continue */ }
  }
  const byUrl = new Map();
  for (const batch of batches) for (const row of Array.isArray(batch?.results) ? batch.results : []) {
    const url = clean(row?.url, 500);
    if (!url || BAD_SOURCE.test(rootHost(url))) continue;
    const text = clean(`${row?.title || ''} ${row?.content || ''}`, 7000);
    if (!CURRENT_CONTEXT.test(text) || !PARTICIPATION.test(text) || (RECRUITMENT_ONLY.test(text) && !/we(?:'re| are| will be)|our\s+(?:university|school|institution)|参加します|出展します|參展|참가합니다/i.test(text))) continue;
    byUrl.set(url, { id:`web-${byUrl.size}`, title:clean(row?.title, 260), url, text, published_date:clean(row?.published_date, 80) });
  }
  return [...byUrl.values()].slice(0, 80);
}

async function aiExtractFallback(rows = []) {
  if (!rows.length || !aiConfigured()) return [];
  const prompt = `Extract only NAMED foreign universities, schools, education institutions, embassies or government education bodies that explicitly say they are participating in the CURRENT 2026 60th International Education & Career Fair in Korea.
The final proof must come from the institution's own official domain. Do not accept past participation, generic university directories, Korean study-abroad agencies, Korean branches, or third-party claims as final proof.
Do not invent a name, country, website or attendance. Return only row-supported names.
JSON only: {"items":[{"row_id":"web-0","company":"exact institution name","country":"country or empty","entity_type":"university|school|education institution|embassy|government","confidence":90}]}
Use confidence >=86.
ROWS:\n${JSON.stringify(rows.slice(0, 70).map(row => ({ row_id:row.id, title:row.title, url:row.url, text:clean(row.text, 4200), published_date:row.published_date })))}`;
  try {
    const result = await chatJson({ prompt, maxTokens:3000, timeoutMs:30000, temperature:0, hardDeadlineMs:42000 });
    return (Array.isArray(result?.data?.items) ? result.data.items : []).map(item => ({
      row_id:clean(item?.row_id, 50), company:clean(item?.company, 180), country:clean(item?.country, 80), entity_type:clean(item?.entity_type, 80), confidence:Number(item?.confidence) || 0
    })).filter(item => item.row_id && item.company && item.confidence >= 86 && INSTITUTION_TYPE.test(`${item.entity_type} ${item.company}`));
  } catch { return []; }
}

function localizedProofQueries(domain = '', company = '', country = '') {
  const base = `site:${domain} "${clean(company, 140)}"`;
  const queries = [
    `${base} "International Education" Korea 2026`,
    `${base} Korea education fair September 2026`
  ];
  if (/Japan/i.test(country)) queries.push(`${base} 韓国 教育フェア 2026 参加`);
  if (/China|Taiwan|Hong Kong/i.test(country)) queries.push(`${base} 韩国 教育展 2026 参展`);
  if (/France|Belgium|Switzerland/i.test(country)) queries.push(`${base} Corée salon éducation 2026`);
  if (/Spain|Mexico/i.test(country)) queries.push(`${base} Corea feria educación 2026`);
  if (/Germany|Austria/i.test(country)) queries.push(`${base} Korea Bildungsmesse 2026`);
  return queries.slice(0, 4);
}

async function officialDomainParticipationProof(company = '', country = '', website = null, initialRow = null) {
  const domain = rootHost(website?.domain || website?.url || '');
  if (!domain) return null;
  if (initialRow && rootHost(initialRow.url) === domain) {
    const page = await fetchPage(initialRow.url, { timeoutMs:6500, maxBytes:450000 });
    const text = clean(`${initialRow.title} ${initialRow.text} ${page?.text || ''}`, 18000);
    if (CURRENT_CONTEXT.test(text) && PARTICIPATION.test(text)) return { url:initialRow.url, text };
  }
  for (const query of localizedProofQueries(domain, company, country)) {
    let result;
    try { result = await publicWebSearch(query, { maxResults:8, timeRange:'year', includeDomains:[domain], topic:'general' }); }
    catch { continue; }
    for (const row of Array.isArray(result?.results) ? result.results : []) {
      if (rootHost(row?.url) !== domain) continue;
      const page = await fetchPage(row.url, { timeoutMs:6500, maxBytes:450000 });
      const text = clean(`${row?.title || ''} ${row?.content || ''} ${page?.text || ''}`, 20000);
      if (CURRENT_CONTEXT.test(text) && PARTICIPATION.test(text) && !RECRUITMENT_ONLY.test(text)) return { url:row.url, text };
    }
  }
  return null;
}

async function resolveFallbackCandidates(rows = [], items = [], excludes = new Set()) {
  const rowById = new Map(rows.map(row => [row.id, row]));
  return (await mapLimit(items.slice(0, 50), 5, async item => {
    const row = rowById.get(item.row_id);
    if (!row || KOREAN_AGENCY.test(`${item.company} ${row.text}`)) return null;
    const countryHint = isKoreanCountry(item.country) ? '' : item.country;
    const sourcePage = await fetchPage(row.url, { timeoutMs:6000, maxBytes:400000 });
    const website = await resolveOfficialWebsite(item.company, countryHint, sourcePage?.links || [], excludes, [OFFICIAL_DOMAIN]);
    if (!website) return null;
    const domain = normalizeCompanyKey(website.domain);
    if (!domain || excludes.has(domain)) return null;
    const foreign = await verifyForeignEntity({ company:item.company, website, sourceText:row.text, countryHint });
    if (!foreign || !INSTITUTION_TYPE.test(`${item.entity_type} ${item.company} ${foreign.official_text}`)) return null;
    const proof = await officialDomainParticipationProof(item.company, foreign.country, website, row);
    if (!proof) return null;
    return {
      company:item.company, country:foreign.country, domain:foreign.domain, url:foreign.url,
      entity_type:item.entity_type, participation:'official institution announcement', confidence:item.confidence,
      source:{ title:`${item.company} official 2026 Korea fair participation`, url:proof.url, text:proof.text }
    };
  })).filter(Boolean);
}

function leadFrom(candidate) {
  const company = clean(candidate.company, 180);
  const domain = rootHost(candidate.domain);
  const country = clean(candidate.country, 80);
  return {
    id:`education_fair:${domain}`, campaign:'education_fair', campaign_label:'International Education Fair 단체복', company, domain,
    url:candidate.url || `https://${domain}/`, source_url:clean(candidate.source?.url, 500), source_title:clean(candidate.source?.title, 260),
    score:Math.max(86, Math.min(99, Number(candidate.confidence) || 90)), sales_priority:Math.max(86, Math.min(99, Number(candidate.confidence) || 90)),
    verified_company:true, education_fair_confirmed:true, team_origin:'foreign', team_origin_country:country, outreach_language:'en',
    recommended_role:'International Office',
    role_targets:['International Office','International Admissions','Admissions Director','International Recruitment','Marketing Director','Events Lead','Partnerships Lead'],
    subject:'Quick question about your Korea education fair team',
    message_en:`Hi,\n\nI saw that ${company} is participating in the 60th International Education & Career Fair in Korea this September. Quick question — have you already sorted branded staff shirts or team wear for your Korea trip?\n\nWe produce custom apparel locally in Korea and can deliver directly to your hotel, BEXCO or COEX, so your team does not need to ship boxes internationally or coordinate production after arrival.\n\nIf it is still open, I can send a few options with pricing and turnaround.`,
    message_ko:'', contact:null, contacts:[], contact_status:'pending'
  };
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); }
  catch { return Response.json({ error:'요청 형식이 잘못됐습니다.' }, { status:400 }); }

  const history = await buildGlobalExclusions(Array.isArray(body.excludeDomains) ? body.excludeDomains : []);
  try {
    const official = await crawlOfficialMaterials();
    const officialExtracted = await aiExtractOfficial(official.pages);
    const officialCandidates = await resolveOfficialCandidates(officialExtracted, history.set);

    let fallbackRows = [];
    let fallbackCandidates = [];
    if (officialCandidates.length < 8) {
      fallbackRows = await fallbackDiscoveryRows();
      const extracted = await aiExtractFallback(fallbackRows);
      fallbackCandidates = await resolveFallbackCandidates(fallbackRows, extracted, history.set);
    }

    const seen = new Set();
    const provisional = [];
    for (const candidate of [...officialCandidates, ...fallbackCandidates].sort((a,b) => Number(b.confidence || 0) - Number(a.confidence || 0))) {
      const domain = normalizeCompanyKey(candidate.domain);
      if (!domain || seen.has(domain) || history.set.has(domain) || isKoreanCountry(candidate.country)) continue;
      seen.add(domain);
      provisional.push(leadFrom(candidate));
      if (provisional.length >= 40) break;
    }
    const exact = await suppressExactSent(provisional, history.secret);

    return Response.json({
      campaign:'education_fair', campaign_label:'International Education Fair 단체복', leads:exact.leads,
      meta:{
        event:EVENT, official_source:OFFICIAL_HOME, official_seed_pages_loaded:official.seed_loaded, official_internal_links_discovered:official.discovered,
        official_current_pages:official.pages.length, official_current_participants:officialCandidates.length,
        public_web_fallback_used:officialCandidates.length < 8, fallback_rows:fallbackRows.length, fallback_official_domain_participants:fallbackCandidates.length,
        returned:exact.leads.length, sent_preexcluded:history.sent.length, deleted_preexcluded:history.deleted.length, sent_exact_suppressed:exact.suppressed,
        participant_gate:'2026 official exhibitor/seminar/floor/download/media materials first; fallback requires institution-owned official-domain participation proof',
        historical_participants_allowed:false,
        team_origin_gate:'foreign institution itself only; Korean agency/representative/branch and unresolved origin rejected',
        email_gate:'contact-discovery-v2; frontend exposes qualified + valid + same-domain only'
      }
    }, { headers:{ 'Cache-Control':'no-store' } });
  } catch (error) {
    return Response.json({ error:clean(error?.message || error, 400) || 'International Education Fair 후보 검색에 실패했습니다.' }, { status:Number(error?.status) || 502 });
  }
}
