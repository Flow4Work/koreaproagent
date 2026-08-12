import { publicWebSearch, publicWebSearchMany } from './public-web-search.js';
import { listSentCompanyDomains, matchSentCompanies, normalizeCompanyKey } from './sent-companies.js';
import { listDeletedCompanyDomains } from './deleted-companies.js';

const USER_AGENT = 'Mozilla/5.0 (compatible; KoreaAgent/1.0; +https://github.com/Flow4Work/koreaproagent)';
const SOCIAL_OR_DIRECTORY = /(?:linkedin\.com|facebook\.com|instagram\.com|youtube\.com|x\.com|twitter\.com|wikipedia\.org|10times\.com|eventbrite\.|medium\.com)/i;
const KOREA_ENTITY = /(?:\bKorea\s+(?:office|branch|subsidiary|team|division|entity)|Korean\s+(?:office|branch|subsidiary|team)|한국(?:지사|법인|오피스|사무소|팀)|코리아(?:\s|$))/i;
const COUNTRY_PATTERNS = [
  ['Japan', /\bJapan(?:ese)?\b|日本/i], ['Taiwan', /\bTaiwan(?:ese)?\b|臺灣|台湾/i],
  ['Thailand', /\bThailand|Thai\b/i], ['Singapore', /\bSingapore(?:an)?\b/i],
  ['Philippines', /\bPhilippines|Filipino\b/i], ['Indonesia', /\bIndonesia(?:n)?\b/i],
  ['Malaysia', /\bMalaysia(?:n)?\b/i], ['Vietnam', /\bVietnam(?:ese)?\b/i],
  ['Hong Kong', /\bHong\s*Kong\b/i], ['China', /\bChina|Chinese\b|中國|中国/i],
  ['India', /\bIndia(?:n)?\b/i], ['Australia', /\bAustralia(?:n)?\b/i],
  ['New Zealand', /\bNew\s+Zealand\b/i], ['United States', /\bUnited\s+States\b|\bU\.S\.A?\.?\b|\bUSA\b|\bAmerican\b/i],
  ['Canada', /\bCanada|Canadian\b/i], ['United Kingdom', /\bUnited\s+Kingdom\b|\bUK\b|\bBritish\b/i],
  ['France', /\bFrance|French\b/i], ['Germany', /\bGermany|German\b/i],
  ['Spain', /\bSpain|Spanish\b/i], ['Italy', /\bItaly|Italian\b/i],
  ['Netherlands', /\bNetherlands|Dutch\b/i], ['Sweden', /\bSweden|Swedish\b/i],
  ['Norway', /\bNorway|Norwegian\b/i], ['Denmark', /\bDenmark|Danish\b/i],
  ['Finland', /\bFinland|Finnish\b/i], ['Switzerland', /\bSwitzerland|Swiss\b/i],
  ['Austria', /\bAustria(?:n)?\b/i], ['Belgium', /\bBelgium|Belgian\b/i],
  ['Ireland', /\bIreland|Irish\b/i], ['Poland', /\bPoland|Polish\b/i],
  ['Portugal', /\bPortugal|Portuguese\b/i], ['Czech Republic', /\bCzech(?:ia| Republic)?\b/i],
  ['Brazil', /\bBrazil|Brazilian\b/i], ['Mexico', /\bMexico|Mexican\b/i],
  ['United Arab Emirates', /\bUnited\s+Arab\s+Emirates\b|\bUAE\b/i], ['Saudi Arabia', /\bSaudi\s+Arabia\b|\bSaudi\b/i],
  ['Mongolia', /\bMongolia(?:n)?\b/i], ['Nepal', /\bNepal(?:ese)?\b/i],
  ['Bangladesh', /\bBangladesh(?:i)?\b/i], ['Sri Lanka', /\bSri\s+Lanka(?:n)?\b/i],
  ['India', /\bIndia(?:n)?\b/i], ['Pakistan', /\bPakistan(?:i)?\b/i],
  ['Türkiye', /\bT(?:u|ü)rkiye\b|\bTurkey\b|Turkish/i], ['Israel', /\bIsrael(?:i)?\b/i],
  ['South Africa', /\bSouth\s+Africa(?:n)?\b/i], ['Egypt', /\bEgypt(?:ian)?\b/i],
  ['Korea', /\bSouth\s+Korea\b|\bRepublic\s+of\s+Korea\b|대한민국|한국/i]
];
const CCTLD_COUNTRY = new Map([
  ['jp','Japan'],['tw','Taiwan'],['th','Thailand'],['sg','Singapore'],['ph','Philippines'],['id','Indonesia'],
  ['my','Malaysia'],['vn','Vietnam'],['hk','Hong Kong'],['cn','China'],['in','India'],['au','Australia'],['nz','New Zealand'],
  ['us','United States'],['ca','Canada'],['uk','United Kingdom'],['fr','France'],['de','Germany'],['es','Spain'],['it','Italy'],
  ['nl','Netherlands'],['se','Sweden'],['no','Norway'],['dk','Denmark'],['fi','Finland'],['ch','Switzerland'],['at','Austria'],
  ['be','Belgium'],['ie','Ireland'],['pl','Poland'],['pt','Portugal'],['cz','Czech Republic'],['br','Brazil'],['mx','Mexico'],
  ['ae','United Arab Emirates'],['sa','Saudi Arabia'],['mn','Mongolia'],['np','Nepal'],['bd','Bangladesh'],['lk','Sri Lanka'],
  ['pk','Pakistan'],['tr','Türkiye'],['il','Israel'],['za','South Africa'],['eg','Egypt'],['kr','Korea']
]);

export const clean = (value = '', max = 500) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

export function decodeEntities(value = '') {
  const named = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ' };
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (all, name) => named[name.toLowerCase()] ?? all);
}

export function stripHtml(html = '', max = 18000) {
  return clean(decodeEntities(String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')), max);
}

export function rootHost(value = '') {
  let raw = clean(value, 500).toLowerCase();
  if (!raw) return '';
  if (raw.includes('@') && !raw.includes('://')) raw = raw.split('@').pop() || '';
  try { raw = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname; }
  catch { raw = raw.split('/')[0].split(':')[0]; }
  raw = raw.replace(/^www\./, '').replace(/\.+$/, '');
  const parts = raw.split('.').filter(Boolean);
  if (parts.length <= 2) return raw;
  const secondLevel = new Set(['ac','co','com','edu','go','gov','ne','net','or','org']);
  const depth = parts.at(-1)?.length === 2 && secondLevel.has(parts.at(-2)) ? 3 : 2;
  return parts.slice(-depth).join('.');
}

export function inferCountry(text = '', domain = '') {
  const value = clean(text, 20000);
  for (const [country, pattern] of COUNTRY_PATTERNS) if (pattern.test(value)) return country;
  return CCTLD_COUNTRY.get(rootHost(domain).split('.').pop() || '') || '';
}

export function isKoreanCountry(country = '') {
  return /^(?:south\s+)?korea$|republic\s+of\s+korea|대한민국|한국/i.test(clean(country, 100));
}

export function isKoreanEntity(company = '', domain = '', text = '') {
  const host = rootHost(domain);
  if (!host) return false;
  if (host.endsWith('.kr')) return true;
  if (/\bKorea\b|코리아|한국/.test(clean(company, 180))) return true;
  return KOREA_ENTITY.test(clean(text, 12000));
}

export function companyTokens(value = '') {
  return clean(value, 180).toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|company|co|gmbh|sa|srl|plc|group|university|college|school|institute|institution)\b/giu, ' ')
    .replace(/株式会社|有限会社|公司|集團|集团|大学|大學/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/u).filter(token => token.length >= 2);
}

export function textMatchesCompany(company = '', text = '') {
  const tokens = companyTokens(company);
  if (!tokens.length) return false;
  const haystack = clean(text, 20000).toLowerCase();
  const hits = tokens.filter(token => haystack.includes(token)).length;
  return hits >= Math.min(2, tokens.length);
}

export function extractLinks(html = '', baseUrl = '') {
  const links = [];
  const seen = new Set();
  const pattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(String(html)))) {
    const href = decodeEntities(match[1] || '').trim();
    if (!href || /^(?:javascript:|mailto:|tel:|#)/i.test(href)) continue;
    let url = '';
    try { url = new URL(href, baseUrl).toString(); } catch { continue; }
    if (!/^https?:\/\//i.test(url)) continue;
    url = url.replace(/#.*$/, '');
    const key = url.replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ url, text: stripHtml(match[2] || '', 300) });
  }
  return links;
}

export async function fetchPage(url = '', { timeoutMs = 7000, maxBytes = 500000 } = {}) {
  if (!/^https?:\/\//i.test(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect:'follow',
      signal:controller.signal,
      headers:{ 'User-Agent':USER_AGENT, Accept:'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5' },
      cache:'no-store'
    });
    if (!response.ok) return null;
    const type = String(response.headers.get('content-type') || '');
    if (type && !/(html|text|json|xml)/i.test(type)) return null;
    const html = (await response.text()).slice(0, maxBytes);
    const finalUrl = response.url || url;
    return { url:finalUrl, html, text:stripHtml(html, 22000), links:extractLinks(html, finalUrl) };
  } catch { return null; }
  finally { clearTimeout(timer); }
}

export async function mapLimit(items = [], limit = 5, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length:Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { out[index] = await worker(items[index], index); }
      catch { out[index] = null; }
    }
  });
  await Promise.all(runners);
  return out;
}

function historySecret() { return clean(process.env.GMAIL_SESSION_SECRET, 5000); }

export async function buildGlobalExclusions(extra = []) {
  const secret = historySecret();
  const [sent, deleted] = secret ? await Promise.all([
    listSentCompanyDomains(secret, 600).catch(() => []),
    listDeletedCompanyDomains(secret, 2000).catch(() => [])
  ]) : [[], []];
  const domains = [...new Set([...extra, ...sent, ...deleted].map(normalizeCompanyKey).filter(Boolean))];
  return { secret, sent, deleted, set:new Set(domains) };
}

export async function suppressExactSent(leads = [], secret = historySecret()) {
  if (!secret || !leads.length) return { leads, suppressed:0 };
  const matched = await matchSentCompanies(leads.map(lead => ({ id:lead.id, key:lead.domain || lead.url || lead.company })), secret).catch(() => []);
  const sentIds = new Set(matched);
  return { leads:leads.filter(lead => !sentIds.has(lead.id)), suppressed:sentIds.size };
}

function externalWebsiteCandidates(sourceLinks = [], eventDomains = []) {
  const blocked = new Set(eventDomains.map(rootHost).filter(Boolean));
  return sourceLinks.filter(link => {
    const domain = rootHost(link?.url);
    if (!domain || blocked.has(domain) || SOCIAL_OR_DIRECTORY.test(domain)) return false;
    return true;
  });
}

export async function resolveOfficialWebsite(company = '', countryHint = '', sourceLinks = [], excludes = new Set(), eventDomains = []) {
  const direct = externalWebsiteCandidates(sourceLinks, eventDomains);
  const matching = direct.filter(link => textMatchesCompany(company, `${link.text} ${link.url}`));
  const candidates = matching.length ? matching : (direct.length === 1 ? direct : []);
  for (const link of candidates) {
    const domain = rootHost(link.url);
    if (!domain || excludes.has(normalizeCompanyKey(domain)) || domain.endsWith('.kr')) continue;
    const page = await fetchPage(link.url, { timeoutMs:5500, maxBytes:220000 });
    if (!page) continue;
    if (!textMatchesCompany(company, `${page.text} ${link.text} ${link.url}`)) continue;
    return { domain, url:`https://${domain}/`, page, source:'official-participant-link' };
  }

  let result;
  try {
    result = await publicWebSearch(`${clean(company, 160)} official website ${clean(countryHint, 80)}`, { maxResults:10, topic:'general' });
  } catch { return null; }
  for (const row of Array.isArray(result?.results) ? result.results : []) {
    const domain = rootHost(row?.url);
    if (!domain || excludes.has(normalizeCompanyKey(domain)) || domain.endsWith('.kr') || SOCIAL_OR_DIRECTORY.test(domain) || eventDomains.map(rootHost).includes(domain)) continue;
    if (!textMatchesCompany(company, `${row?.title || ''} ${row?.content || ''} ${row?.url || ''}`)) continue;
    const page = await fetchPage(row.url, { timeoutMs:5500, maxBytes:220000 });
    if (!page || !textMatchesCompany(company, `${page.text} ${row?.title || ''}`)) continue;
    return { domain, url:`https://${domain}/`, page, source:'public-web-official-resolution' };
  }
  return null;
}

export async function verifyForeignEntity({ company = '', website = null, sourceText = '', countryHint = '' } = {}) {
  const domain = rootHost(website?.domain || website?.url || '');
  if (!domain || domain.endsWith('.kr')) return null;
  const companyPage = website?.page || await fetchPage(website?.url || `https://${domain}/`, { timeoutMs:5500, maxBytes:250000 });
  if (!companyPage) return null;
  if (!textMatchesCompany(company, `${companyPage.text} ${companyPage.url}`)) return null;

  const combined = clean(`${sourceText} ${companyPage.text}`, 32000);
  if (isKoreanEntity(company, domain, combined)) return null;
  const country = clean(countryHint, 80) || inferCountry(combined, domain);
  if (!country || isKoreanCountry(country)) return null;
  return { domain, url:`https://${domain}/`, country, official_text:clean(companyPage.text, 5000) };
}

export { publicWebSearch, publicWebSearchMany, normalizeCompanyKey };
