const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MODEL = 'meta/muse-glimmer-30b';
const TAVILY_URL = 'https://api.tavily.com/search';
const TAVILY_EXTRACT_URL = 'https://api.tavily.com/extract';

const CONTACT_HINT = /(contact|about|team|staff|people|export|international|overseas|sales|company|profile|corporate|inquir|dealer|distributor|partner|location|office|customer|business)/i;
const BANNED_LOCAL = /^(?:info|hello|contact|office|team|admin|general|inquiry|enquiry|business|support|help|service|cs|security|privacy|legal|billing|careers|jobs|hr|noreply|no-reply|abuse|postmaster|webmaster|mailer-daemon)$/i;

const clean = (value = '', max = 500) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const rootHost = value => {
  let raw = clean(value, 500).toLowerCase();
  if (!raw) return '';
  if (raw.includes('@') && !raw.includes('://')) raw = raw.split('@').pop() || '';
  try { raw = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname; }
  catch { raw = raw.split('/')[0].split(':')[0]; }
  raw = raw.replace(/^www\./, '').replace(/\.+$/, '');
  const parts = raw.split('.').filter(Boolean);
  if (parts.length <= 2) return raw;
  const second = new Set(['ac', 'co', 'com', 'edu', 'go', 'gov', 'ne', 'net', 'or', 'org']);
  const depth = parts.at(-1)?.length === 2 && second.has(parts.at(-2)) ? 3 : 2;
  return parts.slice(-depth).join('.');
};
const validEmail = email => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean(email, 240));
const localPart = email => clean(email, 240).toLowerCase().split('@')[0] || '';
const hasSendable = row => (Array.isArray(row?.contacts) ? row.contacts : []).some(contact => contact?.outreachEligible !== false && validEmail(contact?.email) && !BANNED_LOCAL.test(localPart(contact.email)));

function diagnostic(provider, { ok = false, status = 0, error = '', stage = '', detail = '' } = {}) {
  return { provider, ok: Boolean(ok), status: Number(status) || 0, error: clean(error, 120), stage: clean(stage, 80), detail: clean(detail, 220) };
}

function normalizeEmailText(text = '') {
  return String(text || '')
    .replace(/&#0*64;|&#x0*40;|&commat;/gi, '@')
    .replace(/&#0*46;|&#x0*2e;|&period;/gi, '.')
    .replace(/(?:\[|\(|\{)\s*at\s*(?:\]|\)|\})/gi, '@')
    .replace(/(?:\[|\(|\{)\s*dot\s*(?:\]|\)|\})/gi, '.')
    .replace(/\s+at\s+/gi, '@')
    .replace(/\s+dot\s+/gi, '.');
}

function htmlText(html = '') {
  return normalizeEmailText(String(html || ''))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchText(url, timeoutMs = 7000, maxBytes = 360000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.8'
      }
    });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') || '';
    if (!/text|html|xml|json/i.test(type)) return null;
    return { url: response.url || url, status: response.status, raw: (await response.text()).slice(0, maxBytes) };
  } catch { return null; }
  finally { clearTimeout(timer); }
}

function sameDomainContactLinks(html, baseUrl, domain) {
  const out = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || '')))) {
    try {
      const href = String(match[1] || '').replace(/&amp;/g, '&').trim();
      const label = htmlText(match[2] || '');
      if (!href || /^(?:mailto:|tel:|javascript:|data:)/i.test(href)) continue;
      const url = new URL(href, baseUrl);
      if (!/^https?:$/.test(url.protocol) || rootHost(url.hostname) !== rootHost(domain)) continue;
      if (!CONTACT_HINT.test(`${url.pathname} ${label}`)) continue;
      url.hash = '';
      out.push(url.toString());
    } catch {}
  }
  return [...new Set(out)];
}

async function mapLimit(items, limit, worker) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  const out = new Array(list.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (cursor < list.length) {
      const i = cursor++;
      try { out[i] = await worker(list[i], i); } catch { out[i] = null; }
    }
  });
  await Promise.all(runners);
  return out;
}

async function officialEvidence(domain) {
  const host = rootHost(domain);
  if (!host) return { pages: [], diagnostics: [diagnostic('official_recovery', { error: 'missing_domain', stage: 'site_recovery' })] };

  const homes = [`https://${host}/`, `https://www.${host}/`, `http://${host}/`, `http://www.${host}/`];
  let home = null;
  for (const url of homes) {
    home = await fetchText(url, 6500, 360000);
    if (home?.raw) break;
  }
  if (!home) return { pages: [], diagnostics: [diagnostic('official_recovery', { error: 'homepage_unreachable', stage: 'site_recovery', detail: host })] };

  const discovered = sameDomainContactLinks(home.raw, home.url, host).slice(0, 14);
  const fixedPaths = [
    'contact', 'contact/', 'contact.html', 'contact-us', 'contact-us/', 'contact_us.html', 'contacts',
    'en/contact', 'en/contact/', 'en/contact.html', 'about', 'about-us', 'about_us.html', 'about/1.html', 'about/9.html',
    'company', 'sales', 'export', 'international', 'overseas', 'dealer', 'distributor', 'partner'
  ];
  const fixed = fixedPaths.map(path => {
    try { return new URL(path, home.url).toString(); } catch { return ''; }
  }).filter(Boolean);
  const urls = [...new Set([home.url, ...discovered, ...fixed])].slice(0, 20);
  const fetched = await mapLimit(urls, 5, async url => url === home.url ? home : await fetchText(url, 6000, 320000));
  const pages = fetched.filter(Boolean).map(page => ({
    url: page.url,
    sourceDomain: host,
    text: htmlText(page.raw).slice(0, 70000),
    raw: normalizeEmailText(page.raw).slice(0, 180000)
  }));
  return { pages, diagnostics: [diagnostic('official_recovery', { ok: true, status: home.status, stage: 'site_recovery', detail: `pages:${pages.length}` })] };
}

function shapePublishedContact(email, sourceUrl, domain, provider = 'official_recovery', extra = {}) {
  const value = clean(email, 240).toLowerCase();
  if (!validEmail(value) || BANNED_LOCAL.test(localPart(value))) return null;
  if (!sourceUrl || rootHost(sourceUrl) !== rootHost(domain)) return null;
  return {
    name: clean(extra.name, 160),
    title: clean(extra.title, 180),
    email: value,
    emailStatus: 'unknown',
    type: 'published',
    sources: [sourceUrl],
    providers: [provider],
    provider,
    qualified: true,
    outreachEligible: true,
    officialPublished: true,
    sourceDomain: rootHost(domain),
    score: provider === 'nvidia_muse_glimmer' ? 96 : 94
  };
}

function directContactsFromEvidence(pages, domain) {
  const contacts = [];
  for (const page of Array.isArray(pages) ? pages : []) {
    const normalized = normalizeEmailText(`${page.raw || ''} ${page.text || ''}`);
    const matches = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    for (const email of matches) {
      const shaped = shapePublishedContact(email, page.url, domain, 'official_recovery');
      if (shaped) contacts.push(shaped);
    }
  }
  const seen = new Set();
  return contacts.filter(contact => {
    if (seen.has(contact.email)) return false;
    seen.add(contact.email);
    return true;
  }).slice(0, 6);
}

async function tavilyEvidence(company, domain, country = '') {
  const key = clean(process.env.TAVILY_API_KEY, 5000);
  if (!key) return { pages: [], diagnostics: [diagnostic('tavily_recovery', { error: 'not_configured', stage: 'evidence_search' })] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `"${clean(company, 160)}" email sales export marketing international contact ${clean(country, 80)}`,
        search_depth: 'basic', max_results: 6, topic: 'general', include_answer: false, include_raw_content: false,
        include_domains: [rootHost(domain)], exclude_domains: []
      }),
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!response.ok) return { pages: [], diagnostics: [diagnostic('tavily_recovery', { status: response.status, error: `http_${response.status}`, stage: 'evidence_search' })] };
    const data = await response.json();
    const rows = (Array.isArray(data?.results) ? data.results : []).filter(row => /^https?:\/\//i.test(clean(row?.url, 500)) && rootHost(row.url) === rootHost(domain));
    let pages = rows.map(row => ({ url: clean(row?.url, 500), sourceDomain: rootHost(domain), text: clean(`${row?.title || ''} ${row?.content || ''}`, 9000), raw: clean(`${row?.title || ''} ${row?.content || ''}`, 9000) }));

    const urls = [...new Set(rows.map(row => clean(row?.url, 500)))].slice(0, 5);
    if (urls.length) {
      const extractController = new AbortController();
      const extractTimer = setTimeout(() => extractController.abort(), 11000);
      try {
        const extracted = await fetch(TAVILY_EXTRACT_URL, {
          method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls, query: `email sales export marketing international contact ${clean(company, 160)}`, chunks_per_source: 4, extract_depth: 'basic' }),
          signal: extractController.signal, cache: 'no-store'
        });
        if (extracted.ok) {
          const payload = await extracted.json();
          pages = [...pages, ...(Array.isArray(payload?.results) ? payload.results : []).map(row => ({
            url: clean(row?.url, 500), sourceDomain: rootHost(domain), text: clean(row?.raw_content || '', 16000), raw: clean(row?.raw_content || '', 16000)
          })).filter(row => row.url && rootHost(row.url) === rootHost(domain))];
        }
      } catch {} finally { clearTimeout(extractTimer); }
    }
    return { pages, diagnostics: [diagnostic('tavily_recovery', { ok: true, status: response.status, stage: 'evidence_search', detail: `pages:${pages.length}` })] };
  } catch (error) {
    return { pages: [], diagnostics: [diagnostic('tavily_recovery', { error: error?.name === 'AbortError' ? 'timeout' : 'network_error', stage: 'evidence_search' })] };
  } finally { clearTimeout(timer); }
}

function compactEvidence(pages = []) {
  return [...pages]
    .sort((a, b) => Number(/email|e-mail|mail|@|contact|sales|export/i.test(`${b.url} ${b.text}`)) - Number(/email|e-mail|mail|@|contact|sales|export/i.test(`${a.url} ${a.text}`)))
    .slice(0, 6)
    .map(page => ({ url: page.url, text: clean(page.text || page.raw || '', 4500) }));
}

function parseJsonObject(text = '') {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch {}
  }
  return null;
}

function evidenceContainsEmail(pages, sourceUrl, email) {
  const target = clean(email, 240).toLowerCase();
  return (Array.isArray(pages) ? pages : []).some(page => {
    if (clean(page?.url, 500) !== clean(sourceUrl, 500)) return false;
    return normalizeEmailText(`${page?.raw || ''} ${page?.text || ''}`).toLowerCase().includes(target);
  });
}

async function nvidiaExtract(unresolved = []) {
  const key = clean(process.env.NVIDIA_API_KEY, 5000);
  if (!key || !unresolved.length) return { byId: new Map(), diagnostic: diagnostic('nvidia_muse_glimmer', { error: !key ? 'not_configured' : 'no_input', stage: 'evidence_reasoning' }) };
  const evidence = unresolved.map(item => ({ id: item.id, company: item.company, domain: item.domain, pages: compactEvidence(item.pages) }));
  const prompt = `You extract business contact emails from supplied evidence only. Never invent or infer an email pattern. For each company, return only emails that are literally present in one supplied page after obvious obfuscation such as [at]/[dot] is normalized. Prefer sales, export, international, marketing, events, partnerships, founder or named-person contacts. Reject generic mailbox locals: info, hello, contact, office, team, admin, general, inquiry, enquiry, business, support, help, service, cs, security, privacy, legal, billing, careers, jobs, hr, noreply. The source_url must exactly match one supplied page URL. JSON only: {"items":[{"id":"...","contacts":[{"email":"...","source_url":"...","name":"","title":""}]}]}. If there is no explicit usable email, return an empty contacts array. EVIDENCE:\n${JSON.stringify(evidence)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 24000);
  try {
    const response = await fetch(NVIDIA_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages: [{ role: 'system', content: 'Evidence-bound extraction only. Never fabricate contact data.' }, { role: 'user', content: prompt }],
        temperature: 0.95,
        top_p: 1,
        max_tokens: 1800,
        reasoning_effort: 'low',
        stream: false
      }),
      signal: controller.signal,
      cache: 'no-store'
    });
    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok) return { byId: new Map(), diagnostic: diagnostic('nvidia_muse_glimmer', { status: response.status, error: clean(data?.message || data?.error || `http_${response.status}`, 100), stage: 'evidence_reasoning' }) };
    const parsed = parseJsonObject(data?.choices?.[0]?.message?.content || '');
    const byId = new Map();
    for (const item of Array.isArray(parsed?.items) ? parsed.items : []) byId.set(clean(item?.id, 180), Array.isArray(item?.contacts) ? item.contacts : []);
    return { byId, diagnostic: diagnostic('nvidia_muse_glimmer', { ok: true, status: response.status, error: byId.size ? '' : 'no_match', stage: 'evidence_reasoning', detail: `companies:${byId.size}` }) };
  } catch (error) {
    return { byId: new Map(), diagnostic: diagnostic('nvidia_muse_glimmer', { error: error?.name === 'AbortError' ? 'timeout' : 'network_error', stage: 'evidence_reasoning' }) };
  } finally { clearTimeout(timer); }
}

function mergeContacts(row, contacts) {
  const map = new Map();
  for (const contact of [...(Array.isArray(row?.contacts) ? row.contacts : []), ...(Array.isArray(contacts) ? contacts : [])]) {
    const email = clean(contact?.email, 240).toLowerCase();
    if (!email || map.has(email)) continue;
    map.set(email, { ...contact, email });
  }
  row.contacts = [...map.values()].slice(0, 6);
  if (row.contacts.some(contact => contact?.outreachEligible !== false && validEmail(contact?.email) && !BANNED_LOCAL.test(localPart(contact.email)))) row.status = 'found';
  return row;
}

export function nvidiaKBeautyConfigured() {
  return Boolean(clean(process.env.NVIDIA_API_KEY, 5000));
}

export async function recoverKBeautyContactRows(results = [], items = []) {
  const sourceById = new Map((Array.isArray(items) ? items : []).map(item => [clean(item?.id, 180), item]));
  const rows = (Array.isArray(results) ? results : []).map(row => ({ ...row, contacts: Array.isArray(row?.contacts) ? [...row.contacts] : [], diagnostics: Array.isArray(row?.diagnostics) ? [...row.diagnostics] : [] }));
  const misses = rows.filter(row => !hasSendable(row)).slice(0, 5);
  if (!misses.length) return rows;

  const unresolved = [];
  await mapLimit(misses, 3, async row => {
    const source = sourceById.get(clean(row?.id, 180)) || {};
    const company = clean(row?.company || source?.company, 180);
    const country = clean(source?.country, 80);
    const domain = rootHost(row?.domain || source?.domain || source?.url || '');
    if (!domain) {
      row.diagnostics.push(diagnostic('official_recovery', { error: 'missing_domain', stage: 'site_recovery' }));
      return;
    }

    const official = await officialEvidence(domain);
    row.diagnostics.push(...official.diagnostics);
    let pages = official.pages;
    let direct = directContactsFromEvidence(pages, domain);
    if (!direct.length) {
      const searched = await tavilyEvidence(company, domain, country);
      row.diagnostics.push(...searched.diagnostics);
      pages = [...pages, ...searched.pages];
      direct = directContactsFromEvidence(pages, domain);
    }
    if (direct.length) {
      mergeContacts(row, direct);
      row.diagnostics.push(diagnostic('official_recovery', { ok: true, stage: 'email_recovery', detail: `emails:${direct.length}` }));
      return;
    }
    unresolved.push({ id: clean(row?.id, 180), company, domain, pages, row });
  });

  const nvidia = await nvidiaExtract(unresolved);
  for (const item of unresolved) {
    item.row.diagnostics.push(nvidia.diagnostic);
    const rawContacts = nvidia.byId.get(item.id) || [];
    const validated = [];
    for (const raw of rawContacts) {
      const email = clean(raw?.email, 240).toLowerCase();
      const sourceUrl = clean(raw?.source_url, 500);
      if (!evidenceContainsEmail(item.pages, sourceUrl, email)) continue;
      const contact = shapePublishedContact(email, sourceUrl, item.domain, 'nvidia_muse_glimmer', { name: raw?.name, title: raw?.title });
      if (contact) validated.push(contact);
    }
    if (validated.length) mergeContacts(item.row, validated);
  }
  return rows;
}
