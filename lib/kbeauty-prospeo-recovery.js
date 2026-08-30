const SEARCH_URL = 'https://api.prospeo.io/search-person';
const ENRICH_URL = 'https://api.prospeo.io/enrich-person';
const ROLE = /(marketing|sales|export|international|overseas|business development|bizdev|partnership|partner|event|commercial|trade|brand|founder|owner|chief executive|ceo)/i;
const JUNK = /^(security|privacy|legal|billing|careers|jobs|hr|noreply|no-reply|abuse|postmaster|webmaster|mailer-daemon)$/i;
let disabledUntil = 0;

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
  const second = new Set(['ac','co','com','edu','go','gov','ne','net','or','org']);
  const depth = parts.at(-1)?.length === 2 && second.has(parts.at(-2)) ? 3 : 2;
  return parts.slice(-depth).join('.');
};
const localPart = email => clean(email, 240).toLowerCase().split('@')[0] || '';
const validEmail = email => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean(email, 240));
const sameDomain = (email, domain) => rootHost(email) === rootHost(domain);
const parseHeaderNumber = value => {
  if (value == null || value === '') return NaN;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
};

function diagnostic({ ok = false, status = 0, error = '', stage = '', detail = '' } = {}) {
  return { provider:'prospeo', ok:Boolean(ok), status:Number(status)||0, error:clean(error,120), stage:clean(stage,80), detail:clean(detail,220) };
}

function remainingFromHeaders(headers) {
  return {
    dailyLeft: parseHeaderNumber(headers?.get?.('x-daily-request-left')),
    minuteLeft: parseHeaderNumber(headers?.get?.('x-minute-request-left')),
    dailyReset: parseHeaderNumber(headers?.get?.('x-daily-reset-seconds'))
  };
}

function disableFor(result) {
  const code = clean(result?.data?.error_code || result?.error, 120).toUpperCase();
  if (result?.status === 429) {
    const reset = Number(result?.limits?.dailyReset);
    disabledUntil = Date.now() + (Number.isFinite(reset) && reset > 0 ? Math.min(reset * 1000, 24 * 60 * 60 * 1000) : 15 * 60 * 1000);
  } else if (code.includes('INSUFFICIENT_CREDITS') || code.includes('INVALID_API_KEY')) {
    disabledUntil = Date.now() + 24 * 60 * 60 * 1000;
  }
}

async function requestJson(url, body, stage, timeoutMs = 12000) {
  const key = clean(process.env.PROSPEO_API_KEY, 5000);
  if (!key) return { ok:false, status:0, data:null, error:'not_configured', limits:{}, diagnostic:diagnostic({ error:'not_configured', stage }) };
  if (Date.now() < disabledUntil) return { ok:false, status:429, data:null, error:'temporarily_disabled', limits:{}, diagnostic:diagnostic({ status:429, error:'temporarily_disabled', stage }) };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method:'POST',
      headers:{ 'X-KEY':key, 'Content-Type':'application/json' },
      body:JSON.stringify(body),
      cache:'no-store',
      signal:controller.signal
    });
    const limits = remainingFromHeaders(response.headers);
    let data = null;
    try { data = await response.json(); } catch {}
    const apiError = clean(data?.error_code || data?.error || data?.message || `http_${response.status}`, 120);
    if (!response.ok || data?.error === true) {
      const out = { ok:false, status:response.status, data, error:apiError, limits, diagnostic:diagnostic({ status:response.status, error:apiError, stage, detail:`daily_left:${Number.isFinite(limits.dailyLeft)?limits.dailyLeft:'?'}` }) };
      disableFor(out);
      return out;
    }
    return { ok:true, status:response.status, data, error:'', limits, diagnostic:diagnostic({ ok:true, status:response.status, stage, detail:`daily_left:${Number.isFinite(limits.dailyLeft)?limits.dailyLeft:'?'}` }) };
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timeout' : 'network_error';
    return { ok:false, status:0, data:null, error:reason, limits:{}, diagnostic:diagnostic({ error:reason, stage, detail:error?.message || '' }) };
  } finally {
    clearTimeout(timer);
  }
}

function roleScore(person = {}) {
  const title = clean(person?.current_job_title || person?.headline, 220);
  if (!title) return 0;
  let score = ROLE.test(title) ? 40 : 0;
  if (/(head|director|vp|vice president|chief|founder|owner|ceo)/i.test(title)) score += 20;
  if (/(marketing|sales|export|international|business development|partnership|event)/i.test(title)) score += 20;
  return score;
}

function shapeContact(match = {}, expectedDomain = '') {
  const person = match?.person || {};
  const email = clean(person?.email?.email, 240).toLowerCase();
  const status = clean(person?.email?.status, 40).toUpperCase();
  if (!validEmail(email) || status !== 'VERIFIED' || JUNK.test(localPart(email))) return null;
  if (!sameDomain(email, expectedDomain)) return null;
  const title = clean(person?.current_job_title, 200);
  return {
    name:clean(person?.full_name || `${person?.first_name || ''} ${person?.last_name || ''}`, 180),
    title,
    email,
    emailStatus:'valid',
    type:'personal',
    linkedinUrl:clean(person?.linkedin_url, 500),
    sources:['prospeo.io'],
    providers:['prospeo'],
    provider:'prospeo',
    qualified:true,
    outreachEligible:true,
    officialPublished:false,
    sourceDomain:rootHost(expectedDomain),
    score:96 + Math.min(4, Math.floor(roleScore(person) / 20))
  };
}

function hasSendable(row = {}) {
  return (Array.isArray(row?.contacts) ? row.contacts : []).some(contact => validEmail(contact?.email) && contact?.outreachEligible !== false);
}

function slotDelay(domain = '') {
  let hash = 0;
  for (const ch of rootHost(domain)) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return Math.abs(hash) % 4 * 1100;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function recoverOne(row = {}) {
  if (!row?.domain || hasSendable(row)) return row;
  const domain = rootHost(row.domain);
  if (!domain) return row;

  await sleep(slotDelay(domain));
  const search = await requestJson(SEARCH_URL, {
    page:1,
    filters:{ company:{ websites:{ include:[domain] } } }
  }, 'person_search');
  const diagnostics = [...(Array.isArray(row.diagnostics) ? row.diagnostics : []), search.diagnostic];
  if (!search.ok) return { ...row, diagnostics };

  const candidates = (Array.isArray(search.data?.results) ? search.data.results : [])
    .filter(item => rootHost(item?.company?.domain || item?.company?.website) === domain)
    .sort((a,b) => roleScore(b?.person) - roleScore(a?.person))
    .slice(0, 2);
  if (!candidates.length) return { ...row, diagnostics:[...diagnostics, diagnostic({ ok:true, status:search.status, error:'no_person_match', stage:'person_search' })] };

  for (let index = 0; index < candidates.length; index += 1) {
    const personId = clean(candidates[index]?.person?.person_id, 120);
    if (!personId) continue;
    if (index > 0) await sleep(1100);
    const enrich = await requestJson(ENRICH_URL, {
      only_verified_email:true,
      data:{ person_id:personId }
    }, 'person_enrich');
    diagnostics.push(enrich.diagnostic);
    if (!enrich.ok) {
      const code = clean(enrich?.data?.error_code || enrich?.error, 120).toUpperCase();
      if (code.includes('NO_MATCH')) continue;
      return { ...row, diagnostics };
    }
    const contact = shapeContact(enrich.data, domain);
    if (!contact) continue;

    const existing = Array.isArray(row.contacts) ? row.contacts : [];
    const dedup = new Map();
    for (const candidate of [...existing, contact]) {
      const email = clean(candidate?.email, 240).toLowerCase();
      if (!email || dedup.has(email)) continue;
      dedup.set(email, candidate);
    }
    return {
      ...row,
      contacts:[...dedup.values()].slice(0, 6),
      status:'found',
      diagnostics:[...diagnostics, diagnostic({ ok:true, status:enrich.status, stage:'person_enrich', detail:'verified:1' })]
    };
  }

  return { ...row, diagnostics:[...diagnostics, diagnostic({ ok:true, status:200, error:'no_verified_email', stage:'person_enrich' })] };
}

export function prospeoConfigured() {
  return Boolean(clean(process.env.PROSPEO_API_KEY, 5000));
}

export async function recoverKBeautyContactsWithProspeo(results = []) {
  if (!prospeoConfigured() || Date.now() < disabledUntil) return Array.isArray(results) ? results : [];
  const rows = Array.isArray(results) ? results : [];
  const out = [];
  for (const row of rows) out.push(await recoverOne(row));
  return out;
}
