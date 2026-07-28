import { tavilyConfigured, tavilySearch, tavilySearchMany, formatEvidence } from '../lib/web-search.js';
import { hunterConfigured, findContacts, normalizeContacts } from '../lib/hunter.js';
import { qualifyKoreaCandidate, selectTopKoreaCandidates, isMatureCompany } from '../lib/korea-qualification.js';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const STRUCTURE_MODEL = 'openai/gpt-oss-120b';
const DISCOVERY_EXCLUDES = ['instagram.com', 'facebook.com', 'x.com', 'twitter.com', 'youtube.com', 'reddit.com', 'pinterest.com', 'medium.com', 'crunchbase.com', 'glassdoor.com', 'quora.com', 'internations.org', 'visible.vc', 'wikipedia.org'];
const COMPANY_URL_BLOCKLIST = [...DISCOVERY_EXCLUDES, 'linkedin.com', 'techcrunch.com', 'reuters.com', 'prnewswire.com', 'businesswire.com', 'forbes.com', 'bloomberg.com', 'yahoo.com'];
const ROLE_PRIORITY = ['founder', 'ceo', 'vp sales', 'head of sales', 'head of growth', 'head of partnerships', 'head of apac', 'country manager', 'business development'];
const MAX_CANDIDATE_DETAIL = 5;

function clean(v, max = 1400) { return typeof v === 'string' ? v.trim().slice(0, max) : '' }
function safeError(v = '') { return String(v).replace(/gsk_[A-Za-z0-9_-]+/g, '[redacted]').replace(/tvly-[A-Za-z0-9_-]+/g, '[redacted]').replace(/[A-Za-z0-9]{32,}/g, '[key]').slice(0, 700) }
function hostname(v = '') { try { return new URL(v).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }
function rootHost(v = '') { const h = hostname(v), p = h.split('.'); return p.length > 2 ? p.slice(-2).join('.') : h }
function token(v = '') { return String(v).toLowerCase().replace(/[^a-z0-9]/g, '') }
function dedupe(arr) { return [...new Set(arr.filter(Boolean))] }
function safeUrl(v = '') { try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol) ? u.href : '' } catch { return '' } }

const TRIGGER = /(series\s+[ab]|seed|funding|raised|raises|investment|expand|expansion|launch|hiring|hire|sales|partnership|international|apac|asia|japan|singapore|australia|global)/i;

function blockedCompanyUrl(url) {
  const h = rootHost(url);
  return !h || COMPANY_URL_BLOCKLIST.some(x => h === x || h.endsWith('.' + x));
}

function looksLikeCompanyHost(url, company) {
  if (!url || blockedCompanyUrl(url)) return false;
  const h = token(rootHost(url).split('.')[0]), c = token(company);
  return h.length >= 2 && c.length >= 2 && (c.includes(h) || h.includes(c.slice(0, Math.min(c.length, 10))));
}

function companyMentioned(row, company) {
  const c = token(company);
  if (c.length < 3) return false;
  return token(`${row?.title || ''} ${row?.content || ''}`).includes(c);
}

function candidateEvidence(company, sources) {
  return sources.filter(r => companyMentioned(r, company) && TRIGGER.test(`${r.title} ${r.content}`)).slice(0, 3);
}

function explicitKoreaPresence(text = '') {
  const s = String(text).toLowerCase();
  return [/\bkorea\s+(office|team|country manager|general manager|head|sales team|subsidiary|operations)/i,
  /(office|team|subsidiary|operations)\s+(in|for)\s+(south\s+)?korea/i,
  /\bseoul\s+(office|team|hub|based|role|roles|jobs|location)/i,
  /(country manager|head of|general manager)[^.!?]{0,40}(korea|seoul)/i,
  /(launch|launched|operate|operating|operations)[^.!?]{0,40}(in\s+)?(south\s+)?korea/i,
  /(korea|korean)[^.!?]{0,70}(subsidiary|entity|license|office|team)/i].some(r => r.test(s));
}

function pickOfficialUrl(company, hint, rows) {
  if (looksLikeCompanyHost(hint, company)) return `https://${rootHost(hint)}/`;
  const hit = rows.find(r => looksLikeCompanyHost(r.url, company));
  return hit ? `https://${rootHost(hit.url)}/` : '';
}

async function discoverEvidence(focus) {
  if (!tavilyConfigured()) throw new Error('TAVILY_API_KEY needed');
  const f = clean(focus, 600);
  const q = f ? [`${f} APAC expansion funding 2026`, `${f} Japan Singapore Australia expansion 2026`, `${f} Series A Series B international growth 2026`] : ['B2B SaaS APAC expansion 2026', 'AI SaaS Japan Singapore expansion 2026', 'B2B Series B international expansion Asia 2026'];
  const r = await tavilySearchMany(q, { maxResults: 10, timeRange: 'year', excludeDomains: DISCOVERY_EXCLUDES, topic: 'news' });
  const s = r.results.slice(0, 26);
  if (!s.length) throw new Error('No candidates found');
  return { evidence: formatEvidence(s, 26, 10000), sources: s, meta: { ...r.meta, search_results: s.length } };
}

const shortlistSchema = {
  type: 'object', properties: {
    candidates: {
      type: 'array', items: {
        type: 'object', properties: {
          company: { type: 'string' }, official_url_hint: { type: 'string' },
          source_urls: { type: 'array', items: { type: 'string' } }, recommended_role: { type: 'string' }
        }, required: ['company', 'official_url_hint', 'source_urls', 'recommended_role'], additionalProperties: false
      }
    }
  }, required: ['candidates'], additionalProperties: false
};

async function shortlistCandidates(evidence, focus) {
  const prompt = `From the SOURCE data below, extract up to 8 non-Korean B2B SaaS/AI companies showing recent APAC/Japan/Singapore/Australia/global expansion signals. Conditions: 1) Company name must appear in a SOURCE title or text. 2) A SOURCE that names the company must contain investment/expansion/launch/hiring/partnership signal. 3) Exclude Korean companies, mega-cap mature platforms, and companies with mature Korea presence. 4) official_url_hint only when the official site is clear from SOURCE. 5) source_urls only from SOURCE URLs that directly mention the company. 6) recommended_role: Founder, CEO, Head of Sales, BD, Partnerships, or Growth. 7) No descriptions or scores — just order by fit.\nFocus: ${clean(focus, 600) || 'Seed~Series B B2B SaaS/AI with recent APAC/international expansion signals'}\n\n${evidence.slice(0, 10000)}`;
  const c = new AbortController(), t = setTimeout(() => c.abort(), 22000);
  try {
    const response = await fetch(GROQ_CHAT_URL, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: STRUCTURE_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0, reasoning_effort: 'low', reasoning_format: 'hidden', max_completion_tokens: 1200, response_format: { type: 'json_schema', json_schema: { name: 'candidates', strict: true, schema: shortlistSchema } } }), signal: c.signal
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Groq HTTP ${response.status}: ${safeError(raw)}`);
    const payload = JSON.parse(raw), content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Groq returned no candidates');
    return { data: JSON.parse(content), usage: payload?.usage || null };
  } catch (e) {
    if (e?.name === 'AbortError') { const x = new Error('Candidate shortlisting timed out'); x.status = 504; throw x; }
    throw e;
  } finally { clearTimeout(t); }
}

async function verifyCandidateCompany(company, hint, discoverySources) {
  const matched = candidateEvidence(company, discoverySources);
  if (!matched.length) return null;
  const r = await tavilySearch(`"${company}" official website Korea office Seoul country manager Korea team careers`, { maxResults: 9, timeRange: null, excludeDomains: ['instagram.com', 'facebook.com', 'x.com', 'twitter.com', 'youtube.com', 'reddit.com', 'pinterest.com'], topic: 'general' });
  const rows = r.results || [];
  const officialUrl = pickOfficialUrl(company, hint, rows);
  if (!officialUrl) return null;
  const allEvidence = [...(discoverySources || []), ...rows];
  if (rows.some(row => explicitKoreaPresence(`${row.title} ${row.content}`))) return { excluded: true, reason: 'korea_presence_found', company };
  const sourceUrls = dedupe(matched.map(x => x.url)).slice(0, 3);
  if (!sourceUrls.length) return null;
  return { company, officialUrl, evidenceRows: allEvidence, sourceUrls, recommendedRole: 'Head of Sales' };
}

async function findContactForCompany(company, officialUrl, recommendedRole) {
  if (!hunterConfigured()) return { contacts: [], reason: 'hunter_not_configured' };
  try {
    const result = await findContacts(officialUrl, { maxContacts: 10, includeFilters: true });
    if (result.blocked) return { contacts: [], reason: 'blocked' };
    if (result.cached) return { contacts: [], reason: 'duplicate_domain' };
    const emails = result?.emails || [];
    if (!emails.length) return { contacts: [], reason: 'no_contacts' };
    const contacts = normalizeContacts(emails, recommendedRole);
    return { contacts, reason: contacts.length ? 'found' : 'no_contacts' };
  } catch (e) {
    return { contacts: [], reason: 'error', error: safeError(e.message) };
  }
}

async function generateOutreach(company, officialUrl, companySignals, koreaScore, contact) {
  const signalText = (Array.isArray(companySignals) ? companySignals : []).map(s => `- ${s.label}`).join('\n');
  const contactName = contact?.name || '';
  const contactTitle = contact?.title || '';
  const prompt = `Write a short B2B outreach email for ${company} (${officialUrl}). Korea GTM score: ${koreaScore?.overall || 0}/100, tier: ${koreaScore?.tier || ''}. Detected signals:\n${signalText || 'None noted'}\n\nWrite one English and one Korean version. Keep each under 120 words. Mention the company's expansion signals if any, but do NOT invent facts. If no signal evidence exists, keep it generic. Contact name: ${contactName || 'not found'}, title: ${contactTitle || 'not found'}. If no contact name, use a general greeting.`;
  const c = new AbortController(), t = setTimeout(() => c.abort(), 15000);
  try {
    const response = await fetch(GROQ_CHAT_URL, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-oss-20b', messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_completion_tokens: 600 }), signal: c.signal
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Groq outreach HTTP ${response.status}`);
    const payload = JSON.parse(raw), content = payload?.choices?.[0]?.message?.content || '';
    const parts = content.split(/(?=English:|Korean:|---)/).filter(Boolean);
    let outreachEn = '', outreachKo = '';
    for (const part of parts) {
      if (/english/i.test(part)) outreachEn = part.replace(/^[eE]nglish:?\s*/i, '').trim();
      else if (/korean/i.test(part)) outreachKo = part.replace(/^[kK]orean:?\s*/i, '').trim();
    }
    if (!outreachEn && !outreachKo) { outreachEn = content.slice(0, 600); }
    return { outreach_en: outreachEn.slice(0, 1200), outreach_ko: outreachKo.slice(0, 1200) };
  } catch { return { outreach_en: '', outreach_ko: '' }; }
  finally { clearTimeout(t); }
}

export async function POST(request) { try {
  if (!process.env.GROQ_API_KEY) return Response.json({ error: 'GROQ_API_KEY is missing' }, { status: 503 });
  if (!tavilyConfigured()) return Response.json({ error: 'TAVILY_API_KEY is missing' }, { status: 503 });
  let body = {};
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid request format' }, { status: 400 }) }
  const focus = clean(body.focus, 600);
  try {
    const discovery = await discoverEvidence(focus);
    const short = await shortlistCandidates(discovery.evidence, focus);
    const candidates = Array.isArray(short.data?.candidates) ? short.data.candidates.slice(0, 8) : [];
    if (!candidates.length) return Response.json({ error: 'No candidates found', phase: 'shortlist' }, { status: 422 });

    const enriched = [];
    for (let i = 0; i < candidates.length && enriched.length < MAX_CANDIDATE_DETAIL; i++) {
      try {
        const verified = await verifyCandidateCompany(candidates[i].company, candidates[i].official_url_hint, discovery.sources);
        if (!verified) continue;
        if (verified.excluded) continue;
        const contactResult = await findContactForCompany(verified.company, verified.officialUrl, candidates[i].recommended_role || 'Head of Sales');
        const qualification = qualifyKoreaCandidate({
          company: verified.company,
          officialUrl: verified.officialUrl,
          evidenceRows: verified.evidenceRows,
          contacts: contactResult.contacts || [],
          recommendedRole: candidates[i].recommended_role || 'Head of Sales'
        });
        if (!qualification.eligible) continue;
        enriched.push({ verification: verified, qualification, contactResult });
      } catch { }
    }

    const candidatesForDisplay = enriched.map((item, idx) => {
      const q = item.qualification;
      const contact = Array.isArray(item.contactResult?.contacts) && item.contactResult.contacts.length > 0 ? item.contactResult.contacts[0] : null;
      return {
        company: q.company,
        url: q.officialUrl,
        score: q.koreaScore.overall,
        tier: q.koreaScore.tier,
        confidence: q.koreaScore.confidence,
        dimensions: q.koreaScore.dimensions,
        signals: q.signalSummary.labels,
        source_urls: q.signalSummary.sourceUrls,
        fit_score: q.koreaScore.overall,
        why_now: q.signals.slice(0, 3).map(s => `${s.label}`).join(', ') || 'Public evidence of expansion or timing signal detected',
        korea_opportunity: `Korea score ${q.koreaScore.overall}/100 (tier ${q.koreaScore.tier}) — ${q.koreaScore.dimensions.koreaPotential >= 40 ? 'clear Korea potential' : q.koreaScore.dimensions.expansionIntent >= 40 ? 'strong APAC expansion signal' : 'early stage — monitor'}`,        contact: contact ? {
          name: contact.name || null,
          title: contact.title || null,
          email: contact.email || null,
          emailStatus: contact.emailStatus || null,
          linkedinUrl: contact.linkedinUrl || null
        } : null,
        warning: item.verification?.excluded ? '韩国현지 조직 확인됨' : ''
      };
    });

    candidatesForDisplay.sort((a, b) => b.score - a.score);
    const top3 = candidatesForDisplay.slice(0, 3).map((c, i) => ({ ...c, rank: i + 1 }));

    for (const lead of top3) {
      if (lead.contact?.email) {
        try {
          const msgs = await generateOutreach(lead.company, lead.url, lead.signals, { overall: lead.score, tier: lead.tier }, lead.contact);
          lead.outreach_en = msgs.outreach_en;
          lead.outreach_ko = msgs.outreach_ko;
        } catch { }
      }
    }

    return Response.json({
      leads: top3,
      pipeline: 'Tavily → Groq shortlist → Korea Brain qualification → Hunter contacts → Outreach',
      meta: { search: discovery.meta }
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: safeError(e?.message || e), hint: e?.status === 429 ? 'API rate limit. Try again later.' : '', phase: 'pipeline' }, { status: e?.status || 502 });
  }
} catch (e) { return Response.json({ error: "sales_agent_failed", message: safeError(e?.message || e) }, { status: 500 }) } }
