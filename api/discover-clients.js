import { tavilyConfigured, tavilySearch, tavilySearchMany, formatEvidence } from '../lib/web-search.js';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const STRUCTURE_MODEL = 'openai/gpt-oss-120b';
const HUNTER_DOMAIN_URL = 'https://api.hunter.io/v2/domain-search';

const DISCOVERY_EXCLUDES = [
  'instagram.com','facebook.com','x.com','twitter.com','youtube.com','reddit.com','pinterest.com',
  'medium.com','crunchbase.com','glassdoor.com','quora.com','internations.org','visible.vc','wikipedia.org'
];
const COMPANY_URL_BLOCKLIST = [
  ...DISCOVERY_EXCLUDES,'linkedin.com','techcrunch.com','reuters.com','prnewswire.com','businesswire.com',
  'forbes.com','bloomberg.com','yahoo.com'
];
const MATURE_COMPANIES = [
  'fiverr','airwallex','canva','anthropic','openai','cohere','stripe','shopify','salesforce','hubspot',
  'atlassian','microsoft','google','amazon','aws','oracle','adobe','zoom','slack','notion','intercom'
];
const TRIGGER = /(series\s+[abc]|seed|funding|raised|raises|investment|expand|expansion|launch|hiring|hire|sales|partnership|international|apac|asia|japan|singapore|australia|global)/i;
const ASIA_SIGNAL = /(apac|asia|japan|singapore|australia|hong kong|taiwan|southeast asia)/i;
const FUNDING_SIGNAL = /(series\s+[abc]|seed|funding|raised|raises|investment|venture|round)/i;
const GTM_SIGNAL = /(sales|partnership|partner|channel|hiring|hire|launch|go-to-market|gtm|expansion|expand)/i;
const SOFTWARE_SIGNAL = /(saas|software|platform|enterprise|workflow|automation|analytics|crm|api|developer|cybersecurity|fintech|martech|hrtech|customer support|cloud software|b2b)/i;
const HARDWARE_HEAVY = /(semiconductor|gpu server|server manufacturer|hardware manufacturer|chipmaker|chip manufacturer|consumer electronics|smartphone maker)/i;

function clean(v, max = 1400) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
function safeError(v = '') {
  return String(v)
    .replace(/gsk_[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/tvly-[A-Za-z0-9_-]+/g, '[redacted]')
    .slice(0, 700);
}
function hostname(v = '') {
  try { return new URL(v).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}
function rootHost(v = '') {
  const h = hostname(v), p = h.split('.');
  return p.length > 2 ? p.slice(-2).join('.') : h;
}
function token(v = '') {
  return String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
}
function blockedCompanyUrl(url) {
  const h = rootHost(url);
  return !h || COMPANY_URL_BLOCKLIST.some(x => h === x || h.endsWith(`.${x}`));
}
function looksLikeCompanyHost(url, company) {
  if (!url || blockedCompanyUrl(url)) return false;
  const h = token(rootHost(url).split('.')[0]), c = token(company);
  return h.length >= 2 && c.length >= 2 && (c.includes(h) || h.includes(c.slice(0, Math.min(c.length, 10))));
}
function matureCompany(company = '') {
  const c = token(company);
  return MATURE_COMPANIES.some(x => c === token(x) || c.startsWith(token(x)));
}
function companyMentioned(row, company) {
  const c = token(company);
  if (c.length < 3) return false;
  return token(`${row?.title || ''} ${row?.content || ''}`).includes(c);
}
function candidateEvidence(company, sources) {
  return sources.filter(r => companyMentioned(r, company) && TRIGGER.test(`${r.title} ${r.content}`)).slice(0, 4);
}
function dedupe(arr) {
  return [...new Set(arr.filter(Boolean))];
}
function evidenceText(rows = []) {
  return rows.map(r => `${r?.title || ''} ${r?.content || ''}`).join(' ');
}
function likelyB2BSoftware(rows = []) {
  const text = evidenceText(rows);
  if (!SOFTWARE_SIGNAL.test(text)) return false;
  if (HARDWARE_HEAVY.test(text) && !/(saas|software|platform|api|automation)/i.test(text)) return false;
  return true;
}
function explicitKoreaPresence(text = '') {
  const s = String(text).toLowerCase();
  return [
    /korea\s+(office|team|country manager|general manager|head|sales team|subsidiary|operations)/,
    /(office|team|subsidiary|operations)\s+(in|for)\s+(south\s+)?korea/,
    /seoul\s+(office|team|hub|based|role|roles|jobs|location)/,
    /(country manager|head of|general manager)[^.!?]{0,40}(korea|seoul)/,
    /(launch|launched|launching|operate|operating|operations)[^.!?]{0,40}(in\s+)?(south\s+)?korea/,
    /(acquire|acquired|acquisition)[^.!?]{0,80}(korea|korean)/,
    /(korea|korean)[^.!?]{0,50}(subsidiary|entity|license|office|team)/
  ].some(r => r.test(s));
}
function pickOfficialUrl(company, hint, rows) {
  if (looksLikeCompanyHost(hint, company)) return `https://${rootHost(hint)}/`;
  const hit = rows.find(r => looksLikeCompanyHost(r.url, company));
  return hit ? `https://${rootHost(hit.url)}/` : '';
}
function signalScore(matched = []) {
  const text = evidenceText(matched);
  let score = 35;
  if (ASIA_SIGNAL.test(text)) score += 25;
  else if (/(international|global)/i.test(text)) score += 15;
  if (FUNDING_SIGNAL.test(text)) score += 15;
  if (GTM_SIGNAL.test(text)) score += 15;
  score += Math.min(10, matched.length * 3);
  return Math.min(95, score);
}

async function discoverEvidence(focus) {
  if (!tavilyConfigured()) throw new Error('TAVILY_API_KEY가 필요합니다.');
  const f = clean(focus, 600);
  const target = f || '중소형 해외 B2B SaaS 또는 enterprise AI software 회사';
  const queries = [
    `${target} Japan Singapore APAC expansion funding 2026`,
    `${target} international sales hiring partnership Asia 2026`,
    `${target} Series A Series B growth expansion 2026`
  ];
  const r = await tavilySearchMany(queries, {
    maxResults: 12,
    timeRange: 'year',
    excludeDomains: DISCOVERY_EXCLUDES,
    topic: 'news'
  });
  const sources = r.results.slice(0, 30);
  if (!sources.length) throw new Error('최신 후보 근거를 찾지 못했습니다.');
  return { evidence: formatEvidence(sources, 30, 12000), sources, meta: { ...r.meta, search_results: sources.length } };
}

const schema = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          official_url_hint: { type: 'string' },
          source_urls: { type: 'array', items: { type: 'string' } },
          recommended_role: { type: 'string' }
        },
        required: ['company', 'official_url_hint', 'source_urls', 'recommended_role'],
        additionalProperties: false
      }
    }
  },
  required: ['candidates'],
  additionalProperties: false
};

async function shortlist(evidence, focus) {
  const prompt = `아래 SOURCE만 사용해서 우리가 "한국 시장 테스트/아웃바운드 파일럿"을 제안할 해외 회사를 최대 10곳 고른다.

우리가 찾는 고객:
- 기업 고객에게 소프트웨어를 파는 B2B SaaS / enterprise AI / API / 업무용 플랫폼 회사
- 소·중형 또는 성장 단계 회사로, 최근 1년 안에 해외 확장·투자·영업 채용·파트너십 신호가 있음
- 특히 일본·싱가포르·APAC 등 아시아 확장 신호가 있으면 우선
- 한국 현지 영업팀을 크게 만들기 전, 한국 잠재고객 3곳으로 수요를 시험해볼 만한 회사

사용자 추가 조건: ${clean(focus, 600) || '없음'}

반드시 제외:
- 한국 회사
- Microsoft, Google, Salesforce 같은 초대형/성숙 글로벌 플랫폼
- 소비자 앱, 미디어, 게임 중심 회사
- 반도체·GPU·서버·장비 제조사 등 하드웨어가 본업인 회사
- 컨설팅/에이전시/채용대행사
- SOURCE에 회사명이 직접 등장하지 않거나, 그 회사의 최신 성장/확장 신호가 없는 경우

절대 규칙:
1) 회사명은 SOURCE 제목 또는 본문에 직접 등장해야 한다.
2) source_urls는 그 회사를 직접 언급한 SOURCE URL만 사용한다.
3) official_url_hint는 SOURCE에 명확한 공식 홈페이지가 있을 때만 넣고 아니면 빈 문자열.
4) recommended_role은 Founder, CEO, Head of Sales, BD, Partnerships, Growth 중 하나.
5) 숫자 점수나 근거 밖 사실을 만들지 않는다.
6) 적합한 회사가 적으면 억지로 채우지 않는다.

${evidence.slice(0, 12000)}`;
  const c = new AbortController(), t = setTimeout(() => c.abort(), 24000);
  try {
    const response = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: STRUCTURE_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        reasoning_effort: 'low',
        reasoning_format: 'hidden',
        max_completion_tokens: 1500,
        response_format: { type: 'json_schema', json_schema: { name: 'candidate_names', strict: true, schema } }
      }),
      signal: c.signal
    });
    const raw = await response.text();
    if (!response.ok) {
      let d = raw;
      try { d = JSON.parse(raw)?.error?.message || raw; } catch {}
      const e = new Error(`Groq HTTP ${response.status}: ${safeError(d)}`);
      e.status = response.status;
      throw e;
    }
    const payload = JSON.parse(raw), content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error('후보 분석 결과가 비어 있습니다.');
    return { data: JSON.parse(content), usage: payload?.usage || null };
  } catch (e) {
    if (e?.name === 'AbortError') {
      const x = new Error('후보 정리가 시간 초과되었습니다.');
      x.status = 504;
      throw x;
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function verifyCandidate(candidate, discoverySources) {
  const company = clean(candidate?.company, 120);
  if (!company || matureCompany(company)) return null;

  const matched = candidateEvidence(company, discoverySources);
  if (!matched.length) return null;

  const r = await tavilySearch(
    `"${company}" official website B2B SaaS software platform customers Korea Seoul office team careers`,
    {
      maxResults: 10,
      timeRange: null,
      excludeDomains: ['instagram.com','facebook.com','x.com','twitter.com','youtube.com','reddit.com','pinterest.com'],
      topic: 'general'
    }
  );
  const rows = r.results || [];
  const officialUrl = pickOfficialUrl(company, candidate?.official_url_hint, rows);
  if (!officialUrl) return null;
  if (!likelyB2BSoftware([...matched, ...rows.slice(0, 5)])) return null;

  const koreaRows = rows.filter(row => /korea|seoul|한국|서울/i.test(`${row.title} ${row.content} ${row.url}`));
  if (koreaRows.some(row => explicitKoreaPresence(`${row.title} ${row.content}`))) return null;

  const evidence = matched
    .filter(x => /^https?:\/\//i.test(x?.url || ''))
    .slice(0, 4)
    .map(x => ({ title: clean(x.title, 220), url: clean(x.url, 500) }));
  if (!evidence.length) return null;

  const role = clean(candidate?.recommended_role, 80) || 'Head of Sales';
  const signalTitle = clean(evidence[0]?.title, 220) || '최근 해외 확장·성장 신호 확인';

  return {
    company,
    url: officialUrl,
    priority_score: signalScore(matched),
    signal_title: signalTitle,
    why_buy_our_service: '최근 해외 성장 신호가 있고 한국 현지 영업조직은 확인되지 않았습니다. 현지 채용 전에 한국 잠재고객 3곳으로 수요를 시험하기 좋은 후보입니다.',
    why_now: signalTitle,
    korea_opportunity: `${company}에 맞는 한국 잠재고객 3곳과 각 회사에 연락할 이유를 무료 샘플로 먼저 제안합니다.`,
    source_urls: evidence.map(x => x.url),
    evidence,
    recommended_role: role,
    contact_search_query: `"${company}" (Founder OR CEO OR "Head of Sales" OR Partnerships OR Growth) LinkedIn`,
    verification_status: '공식 사이트 확인 · 한국 현지 영업조직 명시 자료 미발견'
  };
}

function roleMatchScore(position = '', recommendedRole = '') {
  const p = String(position).toLowerCase();
  const target = String(recommendedRole).toLowerCase();
  let score = 0;
  if (/founder|co-founder|ceo|chief executive/.test(p)) score += 32;
  if (/head|director|vp|vice president|chief/.test(p)) score += 24;
  if (/sales|business development|partnership|growth|revenue|commercial|go-to-market|gtm/.test(p)) score += 30;
  if (target && p.includes(target)) score += 20;
  return score;
}

async function findHunterContact(company, url, recommendedRole) {
  if (!process.env.HUNTER_API_KEY) return { status: 'not_configured', contact: null };
  const domain = rootHost(url);
  if (!domain) return { status: 'no_domain', contact: null };

  const c = new AbortController(), t = setTimeout(() => c.abort(), 9000);
  try {
    const endpoint = `${HUNTER_DOMAIN_URL}?domain=${encodeURIComponent(domain)}&limit=10`;
    const response = await fetch(endpoint, {
      headers: { 'X-API-KEY': process.env.HUNTER_API_KEY },
      signal: c.signal,
      cache: 'no-store'
    });
    if (!response.ok) return { status: `http_${response.status}`, contact: null };
    const payload = await response.json();
    const emails = Array.isArray(payload?.data?.emails) ? payload.data.emails : [];
    const ranked = emails
      .filter(x => x?.value && (x?.type === 'personal' || x?.first_name || x?.last_name))
      .map(x => ({
        raw: x,
        score: roleMatchScore(x?.position, recommendedRole) + Math.min(25, Number(x?.confidence) || 0) / 4
      }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0]?.raw;
    if (!best) return { status: 'not_found', contact: null };

    const name = clean([best.first_name, best.last_name].filter(Boolean).join(' '), 120);
    return {
      status: 'found',
      contact: {
        name,
        title: clean(best.position, 140),
        email: clean(best.value, 240),
        confidence: Math.max(0, Math.min(100, Number(best.confidence) || 0)),
        linkedin_url: clean(best.linkedin_url || best.linkedin, 500)
      }
    };
  } catch (e) {
    return { status: e?.name === 'AbortError' ? 'timeout' : 'error', contact: null };
  } finally {
    clearTimeout(t);
  }
}

function buildOutreach(company, contact, signalTitle) {
  const first = clean(contact?.name, 80).split(' ')[0];
  const hello = first ? `Hi ${first},` : 'Hi,';
  return `${hello}\n\nI came across ${company} while looking at B2B software teams expanding internationally. I saw the recent growth signal around ${signalTitle}.\n\nI help teams test Korea before hiring locally: I map 3 Korean accounts that fit the product, why each is worth contacting, and the right buyer angle.\n\nI can send a free 3-account sample for ${company}. Would that be useful?`;
}

export async function POST(request) {
  if (!process.env.GROQ_API_KEY) return Response.json({ error: '분석 엔진 설정이 필요합니다.' }, { status: 503 });
  if (!tavilyConfigured()) return Response.json({ error: '검색 엔진 설정이 필요합니다.' }, { status: 503 });

  let body = {};
  try { body = await request.json(); } catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }
  const focus = clean(body.focus, 600);

  try {
    const discovery = await discoverEvidence(focus);
    const short = await shortlist(discovery.evidence, focus);
    const candidates = Array.isArray(short.data?.candidates) ? short.data.candidates.slice(0, 10) : [];
    if (!candidates.length) return Response.json({ error: '조건에 맞는 해외 B2B 소프트웨어 회사를 찾지 못했습니다.' }, { status: 422 });

    const verified = [];
    for (const candidate of candidates) {
      try {
        const v = await verifyCandidate(candidate, discovery.sources);
        if (v) verified.push(v);
      } catch {}
      if (verified.length >= 5) break;
    }

    if (!verified.length) {
      return Response.json({
        error: '최신 성장 신호·B2B 소프트웨어·공식 사이트·한국 조직 조건을 모두 통과한 회사가 없었습니다.',
        hint: '업종 조건을 조금 넓혀 다시 실행하세요.'
      }, { status: 422 });
    }

    verified.sort((a, b) => b.priority_score - a.priority_score);
    const selected = verified.slice(0, 3);

    const leads = [];
    for (let i = 0; i < selected.length; i++) {
      const lead = selected[i];
      const hunter = await findHunterContact(lead.company, lead.url, lead.recommended_role);
      const contact = hunter.contact;
      leads.push({
        ...lead,
        rank: i + 1,
        contact,
        contact_status: hunter.status,
        outreach_en: buildOutreach(lead.company, contact, lead.signal_title),
        outreach_ko: `${lead.company}의 최근 해외 성장 신호를 확인했습니다. 한국 현지 채용 전에 실제 잠재고객 3곳으로 수요를 작게 검증할 수 있다는 제안을 보내는 단계입니다.`
      });
    }

    return Response.json({
      leads,
      strategy: {
        next_action: '1위 회사의 실제 담당자에게 한국 잠재고객 3곳 무료 샘플을 제안합니다.'
      },
      meta: {
        search: discovery.meta,
        structure_model: STRUCTURE_MODEL,
        structure_usage: short.usage,
        returned_count: leads.length,
        hunter_configured: Boolean(process.env.HUNTER_API_KEY),
        pipeline: '최신 성장 신호 검색 → B2B 소프트웨어 선별 → 공식 사이트/한국 조직 확인 → 담당자 탐색 → 첫 연락 준비'
      }
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({
      error: safeError(e?.message || e),
      hint: e?.status === 429 ? 'API 사용량 제한입니다. 잠시 후 다시 시도하세요.' : '고객 발굴 과정에서 오류가 발생했습니다.'
    }, { status: e?.status || 502 });
  }
}
