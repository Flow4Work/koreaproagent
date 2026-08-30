import { collectJinaOfficial2026Seeds } from './kbeauty-jina-seeds.js';

const INTERCHARM_MODERN = 'https://www.intercharmkorea.com/en-us/Exhibitor_directory.html';
const INCOSMETICS_2026 = 'https://www.in-cosmetics.com/korea/en-gb/exhibitor-directory/exhibitor-directory.html';
const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const TAVILY_EXTRACT_URL = 'https://api.tavily.com/extract';
const TAVILY_CRAWL_URL = 'https://api.tavily.com/crawl';
const TARGET_DEFAULT = 500;
const MAX_TARGET = 500;

const EVENT_HOSTS = new Set(['intercharmkorea.com','in-cosmetics.com','rxglobal.com','reedexpo.com','google.com','docs.google.com']);
const SOCIAL_HOSTS = new Set(['linkedin.com','facebook.com','instagram.com','x.com','twitter.com','youtube.com']);

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
    source_url: 'https://ick.intercharmkorea.com/eng/exhibitor/exhi_detail04.asp?idx=6535&param=%26page%3D1&ref_idx=17926',
    evidence_type: 'official_exhibitor_profile', evidence_text: 'Official InterCHARM Korea exhibitor profile; booth I43; event held 1–3 July 2026.'
  },
  {
    company: 'Daxal Cosmetics Pvt Ltd', country: 'India', domain: 'daxalcosmetics.com', tier: 'korea_beauty_event_2026', score: 96,
    source_event: 'InterCHARM Korea 2026',
    source_url: INTERCHARM_MODERN,
    evidence_type: 'official_exhibitor_directory', evidence_text: 'Listed in the current InterCHARM Korea 2026 exhibitor directory; official company domain independently verified.'
  },
  {
    company: 'GUANGZHOU DERMADREAM ELECTRONIC TECHNOLOGY CO., LTD.', country: 'China', domain: 'uhooma.com', tier: 'korea_beauty_event_2026', score: 94,
    source_event: 'InterCHARM Korea 2026',
    source_url: INTERCHARM_MODERN,
    evidence_type: 'official_exhibitor_directory', evidence_text: 'Current InterCHARM Korea 2026 exhibitor source; official company domain independently verified.'
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
    evidence_type: 'company_announcement', evidence_text: 'Company site reports InterCHARM Korea 2026 participation.'
  },
  {
    company: 'Faverton Group Inc.', country: 'Philippines', tier: 'korea_beauty_event_2026', score: 90,
    source_event: 'InterCHARM Korea 2026',
    source_url: 'https://ph.linkedin.com/company/faverton-group-inc',
    evidence_type: 'attendee_announcement', evidence_text: 'Company LinkedIn states it participated in InterCHARM Korea 2026 in Seoul.'
  }
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

function stripTags(value = '', max = 180) {
  return clean(decodeHtml(String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')), max);
}

function stripMarkdown(value = '', max = 180) {
  return clean(decodeHtml(String(value || ''))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#~-]+/g, ' '), max);
}

function rootHost(value = '') {
  let raw = clean(value, 500).toLowerCase();
  if (!raw) return '';
  if (raw.includes('@') && !raw.includes('://')) raw = raw.split('@').pop() || '';
  try { raw = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname; }
  catch { raw = raw.split('/')[0].split(':')[0]; }
  raw = raw.replace(/^www\./, '').replace(/\.+$/, '');
  const parts = raw.split('.').filter(Boolean);
  if (parts.length <= 2) return raw;
  const second = new Set(['ac','co','com','edu','go','gov','ne','net','or','org']);
  const depth = parts.at(-1)?.length === 2 && second.has(parts.at(-2)) ? 3 : 2;
  return parts.slice(-depth).join('.');
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
  if (/^(?:view profile|profile|home|about|contact|search|more|next|previous|exhibitor list|exhibitor directory|exhibitor details|website|email|products?|documents?|company information|brands?|categories?|filters?|features?|show information|useful links)$/i.test(name)) return false;
  if (/^(?:booth(?: no\.)?|stand(?: no\.)?|skin care|body care|cosmetics|manufacturing|image|logo|canvas logo|logoimg)$/i.test(name)) return false;
  if (/^(?:k-beauty expo|intercharm korea|in-cosmetics korea|coex|kintex)$/i.test(name)) return false;
  return true;
}

function usableExternalDomain(value = '') {
  const host = rootHost(value);
  if (!host || host.endsWith('.kr') || host.endsWith('.co.kr')) return '';
  if ([...EVENT_HOSTS].some(base => host === base || host.endsWith(`.${base}`))) return '';
  if ([...SOCIAL_HOSTS].some(base => host === base || host.endsWith(`.${base}`))) return '';
  return host;
}

function emailFromBlock(block = '', domain = '') {
  if (!domain) return '';
  const emails = String(block || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return emails.map(value => clean(value, 240).toLowerCase()).find(email => rootHost(email) === rootHost(domain)) || '';
}

function domainFromBlock(block = '') {
  const raw = decodeHtml(String(block || ''));
  const labelled = raw.match(/\[(?:Website|Homepage|Official Website)\]\((https?:\/\/[^)]+)\)/i)?.[1]
    || raw.match(/(?:Website|Homepage|Official Website)\s*[:\-]?\s*(https?:\/\/[^\s)<>]+)/i)?.[1];
  if (labelled) {
    const host = usableExternalDomain(labelled);
    if (host) return host;
  }
  const links = [...raw.matchAll(/https?:\/\/[^\s)\]"'<>]+/gi)].map(match => match[0]);
  for (const link of links) {
    const host = usableExternalDomain(link);
    if (host) return host;
  }
  return '';
}

function rowForCompany(company, block, { pageUrl = '', event = '', score = 90 } = {}) {
  const domain = domainFromBlock(block);
  const publicEmail = emailFromBlock(block, domain);
  return {
    company:clean(company,180),
    country:'',domain,public_email:publicEmail,
    tier:'korea_beauty_event_2026',score,
    source_event:event,source_url:pageUrl,
    source_title:`${event} official 2026 exhibitor evidence`,
    evidence_type:'official_exhibitor_directory',
    evidence_text:`Listed in official ${event} 2026 exhibitor evidence.`,
    curated_2026:true,foreign_status:'pending_official_domain_verification'
  };
}

export function parseGenericOfficialDirectory(html = '', { pageUrl = '', event = '', score = 90 } = {}) {
  const raw = String(html || ''), rows = [], seen = new Set();
  const heading = /<h([2-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  const matches = [...raw.matchAll(heading)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index], level = Number(match[1]);
    const company = stripTags(match[2], 180), key = companyKey(company);
    if (!validCompany(company) || !key || seen.has(key)) continue;
    let end = raw.length;
    for (let next = index + 1; next < matches.length; next += 1) {
      if (Number(matches[next][1]) <= level) { end = Number(matches[next].index) || raw.length; break; }
    }
    const block = raw.slice(Number(match.index || 0), end);
    if (!/(?:\bStand\b|\bBooth\b|부스)/i.test(stripTags(block, 2600))) continue;
    seen.add(key); rows.push(rowForCompany(company, block, { pageUrl, event, score }));
  }
  return rows;
}

export function parseMarkdownOfficialDirectory(markdown = '', { pageUrl = '', event = '', score = 90 } = {}) {
  const raw = decodeHtml(String(markdown || '')), rows = [], seen = new Set();
  const heading = /^(#{2,4})\s+(.+?)\s*$/gm;
  const matches = [...raw.matchAll(heading)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index], level = String(match[1]).length;
    const company = stripMarkdown(match[2], 180), key = companyKey(company);
    if (!validCompany(company) || !key || seen.has(key)) continue;
    let end = raw.length;
    for (let next = index + 1; next < matches.length; next += 1) {
      if (String(matches[next][1]).length <= level) { end = Number(matches[next].index) || raw.length; break; }
    }
    const block = raw.slice(Number(match.index || 0), end);
    if (!/(?:\bStand\b|\bBooth\b|부스)/i.test(block)) continue;
    seen.add(key); rows.push(rowForCompany(company, block, { pageUrl, event, score }));
  }
  return rows;
}

function companyFromIncosmeticsResult(row = {}) {
  const title = clean(row?.title, 220)
    .replace(/\s*[|\-–—]\s*in-?cosmetics\s+korea.*$/i, '')
    .replace(/^exhibitor details\s*[|:\-–—]?\s*/i, '');
  if (validCompany(title) && !/^exhibitor details$/i.test(title)) return title;
  const url = clean(row?.url, 800);
  const slug = url.match(/exhibitor-details\.([^/?#]+?)(?:\.org-[a-f0-9-]+)?\.html/i)?.[1] || '';
  if (!slug) return '';
  try { return clean(decodeURIComponent(slug).replace(/\+/g,' ').replace(/[._-]+/g,' '),180); }
  catch { return clean(slug.replace(/[._-]+/g,' '),180); }
}

async function fetchText(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method:'GET',headers:{'User-Agent':'Mozilla/5.0 (compatible; KoreaProAgent/1.0)','Accept':'text/html,application/xhtml+xml'},
      redirect:'follow',cache:'no-store',signal:controller.signal
    });
    if (!response.ok) return '';
    return await response.text();
  } catch { return ''; }
  finally { clearTimeout(timer); }
}

async function tavilyAdvancedExtract(urls = []) {
  const key = clean(process.env.TAVILY_API_KEY, 5000);
  if (!key || !urls.length) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(TAVILY_EXTRACT_URL, {
      method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({urls,extract_depth:'advanced',format:'markdown',include_images:false}),cache:'no-store',signal:controller.signal
    });
    if (!response.ok) return [];
    const data = await response.json().catch(() => ({}));
    return Array.isArray(data?.results) ? data.results : [];
  } catch { return []; }
  finally { clearTimeout(timer); }
}

async function tavilyDirectoryCrawl(url = '', limit = 100) {
  const key = clean(process.env.TAVILY_API_KEY, 5000);
  if (!key || !url) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 70000);
  try {
    const response = await fetch(TAVILY_CRAWL_URL, {
      method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        url,instructions:'Follow only exhibitor profile/detail pages for the July 1-3 2026 InterCHARM Korea event. Ignore navigation, news, registration, venue and privacy pages.',
        max_depth:1,max_breadth:Math.min(150,limit),limit,extract_depth:'basic',format:'markdown',allow_external:false
      }),cache:'no-store',signal:controller.signal
    });
    if (!response.ok) return [];
    const data = await response.json().catch(() => ({}));
    return Array.isArray(data?.results) ? data.results : [];
  } catch { return []; }
  finally { clearTimeout(timer); }
}

async function tavilyIncosmetics2026Search() {
  const key = clean(process.env.TAVILY_API_KEY, 5000);
  if (!key) return [];
  const queries = [
    'site:in-cosmetics.com/korea/en-gb/exhibitor-directory/exhibitor-details "1-3 July 2026" "COEX, Seoul"',
    'site:in-cosmetics.com/korea/en-gb/exhibitor-directory/exhibitor-details "1 July 2026" China exhibitor',
    'site:in-cosmetics.com/korea/en-gb/exhibitor-directory/exhibitor-details "1 July 2026" Japan exhibitor',
    'site:in-cosmetics.com/korea/en-gb/exhibitor-directory/exhibitor-details "1 July 2026" India exhibitor',
    'site:in-cosmetics.com/korea/en-gb/exhibitor-directory/exhibitor-details "1 July 2026" France Germany exhibitor',
    'site:in-cosmetics.com/korea/en-gb/exhibitor-directory/exhibitor-details "1 July 2026" Taiwan Singapore exhibitor',
    'site:in-cosmetics.com/korea/en-gb/exhibitor-directory/exhibitor-details "1 July 2026" USA UK exhibitor',
    'site:in-cosmetics.com/korea/en-gb/exhibitor-directory/exhibitor-details "Wednesday 1 July 2026" exhibitor'
  ];
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < queries.length) {
      const query = queries[cursor++];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(TAVILY_SEARCH_URL, {
          method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
          body:JSON.stringify({query,search_depth:'basic',max_results:20,topic:'general',include_answer:false,include_raw_content:false}),
          cache:'no-store',signal:controller.signal
        });
        if (!response.ok) continue;
        const data = await response.json().catch(() => ({}));
        for (const row of Array.isArray(data?.results) ? data.results : []) results.push(row);
      } catch {} finally { clearTimeout(timer); }
    }
  }
  await Promise.all(Array.from({length:4}, worker));
  const seen = new Set(), rows = [];
  for (const result of results) {
    const url = clean(result?.url,800);
    if (!/in-cosmetics\.com\/korea\/en-gb\/exhibitor-directory\/exhibitor-details/i.test(url)) continue;
    const evidence = clean(`${result?.title||''} ${result?.content||''}`,2600);
    if (!/(?:1\s*-\s*3 July 2026|1 July 2026|Wednesday 1 July 2026)/i.test(evidence)) continue;
    const company = companyFromIncosmeticsResult(result), keyName = companyKey(company);
    if (!validCompany(company) || !keyName || seen.has(keyName)) continue;
    seen.add(keyName);
    rows.push(rowForCompany(company,evidence,{pageUrl:url,event:'in-cosmetics Korea 2026',score:90}));
  }
  return rows;
}

export async function collectOfficial2026Seeds(target = TARGET_DEFAULT) {
  const wanted = Math.max(1, Math.min(MAX_TARGET, Number(target) || TARGET_DEFAULT));
  const rows = [], seen = new Set();
  const add = item => {
    const company = clean(item?.company, 180), key = companyKey(company);
    if (!validCompany(company) || !key || seen.has(key)) return false;
    seen.add(key); rows.push({ ...item, company, curated_2026:true }); return true;
  };
  const addMany = items => { for (const item of Array.isArray(items) ? items : []) { if (rows.length >= wanted) break; add(item); } };

  addMany(CURATED_FOREIGN_2026);

  // Independent source APIs contribute together. Jina browser-renders the JS directories while Tavily supplies extract/search evidence.
  const [jinaSeeds, intercharmHtml, extracted, inCosmeticsSearch] = await Promise.all([
    collectJinaOfficial2026Seeds(wanted),
    fetchText(INTERCHARM_MODERN),
    tavilyAdvancedExtract([INTERCHARM_MODERN]),
    tavilyIncosmetics2026Search()
  ]);
  addMany(jinaSeeds);
  addMany(parseGenericOfficialDirectory(intercharmHtml,{pageUrl:INTERCHARM_MODERN,event:'InterCHARM Korea 2026',score:92}));
  for (const result of extracted) addMany(parseMarkdownOfficialDirectory(result?.raw_content || '',{pageUrl:result?.url || INTERCHARM_MODERN,event:'InterCHARM Korea 2026',score:92}));
  addMany(inCosmeticsSearch);

  if (rows.length < Math.min(160,wanted)) {
    const crawled = await tavilyDirectoryCrawl(INTERCHARM_MODERN, Math.min(140,wanted));
    for (const result of crawled) addMany(parseMarkdownOfficialDirectory(result?.raw_content || '',{pageUrl:result?.url || INTERCHARM_MODERN,event:'InterCHARM Korea 2026',score:92}));
  }

  return rows.slice(0,wanted);
}
