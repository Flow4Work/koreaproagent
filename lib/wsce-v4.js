import { POST as basePOST } from './wsce-v3.js';
import {
  buildGlobalExclusions,
  clean,
  fetchPage,
  mapLimit,
  normalizeCompanyKey,
  resolveOfficialWebsite,
  rootHost,
  suppressExactSent,
  verifyForeignEntity
} from './international-event-campaign.js';

const EVENT_DOMAIN = 'worldsmartcityexpo.com';
const PROGRAM_URLS = [
  'https://worldsmartcityexpo.com/eng/sub06/sub01.php',
  'https://www.worldsmartcityexpo.com/eng/sub06/sub01.php'
];

function countryFromDescriptor(value = '') {
  const text = clean(value, 220);
  if (/\bUAE\b|United Arab Emirates/i.test(text)) return 'United Arab Emirates';
  if (/Vietnam/i.test(text)) return 'Vietnam';
  if (/Singapore/i.test(text)) return 'Singapore';
  if (/Japan/i.test(text)) return 'Japan';
  if (/Taiwan/i.test(text)) return 'Taiwan';
  if (/Thailand/i.test(text)) return 'Thailand';
  if (/Indonesia/i.test(text)) return 'Indonesia';
  if (/Malaysia/i.test(text)) return 'Malaysia';
  return '';
}

function programHosts(text = '', sourceUrl = '') {
  const out = [];
  const seen = new Set();
  const value = clean(text, 30000);
  const pattern = /(?:Part\s+\d+\s+)?Hosted by\s+(.{2,180}?)\s+Focus Areas\s*:/gi;
  let match;
  while ((match = pattern.exec(value))) {
    const raw = clean(match[1], 180).replace(/^[•*·\-\s]+/, '').trim();
    if (!raw) continue;
    const parts = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    const company = clean(parts?.[1] || raw, 140);
    const descriptor = clean(parts?.[2] || '', 180);
    const country = countryFromDescriptor(`${descriptor} ${raw}`);
    const key = company.toLowerCase();
    if (!company || company.length < 2 || seen.has(key) || !country) continue;
    seen.add(key);
    out.push({ company, country, descriptor, sourceUrl });
  }
  return out;
}

function leadFromProgramHost(candidate = {}) {
  const company = clean(candidate.company, 160);
  const domain = rootHost(candidate.domain);
  const country = clean(candidate.country, 80);
  return {
    id:`wsce:${domain}`,
    campaign:'wsce',
    campaign_label:'WSCE 단체복',
    company,
    domain,
    url:candidate.url || `https://${domain}/`,
    source_url:clean(candidate.sourceUrl, 700),
    source_title:'WSCE 2026 official business program',
    signal:`WSCE 2026 official program host · ${country}`,
    score:96,
    sales_priority:96,
    verified_company:true,
    wsce_confirmed:true,
    team_origin:'foreign',
    team_origin_country:country,
    outreach_language:'en',
    recommended_role:'Events Lead',
    role_targets:['Events Lead','Event Marketing','Marketing Director','Partnerships Lead','Business Development Director','Operations Lead','Country Manager','Founder','CEO'],
    subject:'Quick question about WSCE 2026 in Busan',
    message_en:`Hi,\n\nI saw that ${company} is participating in the official WSCE 2026 business program in Busan. Quick question — have you already sorted team shirts or staff wear for your Korea trip?\n\nWe produce branded apparel locally in Korea and can deliver directly to your hotel, office or BEXCO, so your team does not need to ship boxes internationally or coordinate production after arrival.\n\nIf it is still open, I can send a few options with pricing and turnaround.`,
    message_ko:'',
    contact:null,
    contacts:[],
    contact_status:'pending'
  };
}

async function officialProgramLeads(body = {}) {
  const history = await buildGlobalExclusions(Array.isArray(body.excludeDomains) ? body.excludeDomains : []);
  const pages = (await Promise.all(PROGRAM_URLS.map(url => fetchPage(url, { timeoutMs:6500, maxBytes:550000 }).catch(() => null)))).filter(Boolean);
  const hosts = [];
  const seen = new Set();
  for (const page of pages) {
    for (const host of programHosts(page.text, page.url)) {
      const key = host.company.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      hosts.push({ ...host, links:page.links || [] });
    }
  }

  const resolved = (await mapLimit(hosts.slice(0, 8), 4, async host => {
    const website = await resolveOfficialWebsite(host.company, host.country, host.links, history.set, [EVENT_DOMAIN]);
    if (!website) return null;
    const domain = normalizeCompanyKey(website.domain);
    if (!domain || history.set.has(domain)) return null;
    const foreign = await verifyForeignEntity({ company:host.company, website, sourceText:'', countryHint:host.country });
    if (!foreign) return null;
    return leadFromProgramHost({ ...host, domain:foreign.domain, url:foreign.url, country:foreign.country || host.country });
  })).filter(Boolean);

  const exact = await suppressExactSent(resolved, history.secret);
  return exact.leads;
}

export async function POST(request) {
  let body = {};
  try { body = await request.clone().json(); }
  catch { return basePOST(request); }

  const [baseResponse, programLeads] = await Promise.all([
    basePOST(request),
    officialProgramLeads(body).catch(() => [])
  ]);

  let base = null;
  try { base = await baseResponse.clone().json(); }
  catch { return baseResponse; }

  if (!baseResponse.ok && !programLeads.length) return baseResponse;

  const byDomain = new Map();
  for (const lead of [...(Array.isArray(base?.leads) ? base.leads : []), ...programLeads]) {
    const domain = normalizeCompanyKey(lead?.domain || lead?.url || '');
    if (!domain || byDomain.has(domain)) continue;
    byDomain.set(domain, lead);
  }
  const leads = [...byDomain.values()].slice(0, 40);

  return Response.json({
    ...(base && typeof base === 'object' ? base : {}),
    campaign:'wsce',
    campaign_label:'WSCE 단체복',
    leads,
    meta:{
      ...(base?.meta || {}),
      official_program_foreign_candidates:programLeads.length,
      returned:leads.length,
      program_gate:'named foreign organizations explicitly shown as hosts in the current official WSCE 2026 business program'
    }
  }, { headers:{ 'Cache-Control':'no-store' } });
}
