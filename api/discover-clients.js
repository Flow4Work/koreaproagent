import { tavilyConfigured, tavilySearch, tavilySearchMany, formatEvidence } from '../lib/web-search.js';
import { AI_MODEL, AI_PROVIDER, aiConfigured, chatJson } from '../lib/ai-provider.js';

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
const DISCOVERY_TOPICS = [
  'developer tools API data infrastructure observability B2B SaaS',
  'cybersecurity identity compliance B2B SaaS',
  'AI customer support workflow automation B2B SaaS',
  'fintech payments treasury expense B2B software',
  'CRM sales revenue intelligence B2B SaaS',
  'HR recruiting workforce B2B SaaS',
  'logistics supply chain procurement B2B software',
  'cloud FinOps DevOps automation SaaS',
  'retail commerce operations B2B SaaS',
  'marketing automation customer data B2B SaaS',
  'hospitality travel property management B2B SaaS',
  'enterprise generative AI knowledge management software',
  'collaboration document workflow automation SaaS',
  'communications video voice API B2B platform',
  'legal contract RegTech B2B SaaS'
];

const TRIGGER = /(series\s+[abc]|seed|funding|raised|raises|investment|expand|expansion|launch|hiring|hire|sales|partnership|international|apac|asia|japan|singapore|australia|global|go-to-market|gtm)/i;
const ASIA_SIGNAL = /(apac|asia|japan|singapore|australia|hong kong|taiwan|southeast asia)/i;
const FUNDING_SIGNAL = /(series\s+[abc]|seed|funding|raised|raises|investment|venture|round|valuation)/i;
const GTM_SIGNAL = /(sales|partnership|partner|channel|hiring|hire|launch|go-to-market|gtm|expansion|expand|international)/i;
const SOFTWARE_SIGNAL = /(saas|software|platform|enterprise|workflow|automation|analytics|crm|api|developer|cybersecurity|fintech|martech|hrtech|customer support|cloud software|b2b)/i;
const COMMERCIAL_SOFTWARE_SIGNAL = /(saas|software|api|workflow|automation|enterprise platform|business platform|customer platform|cloud platform|customers|clients|subscription)/i;
const HARDWARE_HEAVY = /(semiconductor|gpu server|server manufacturer|hardware manufacturer|chipmaker|chip manufacturer|consumer electronics|smartphone maker)/i;
const RESEARCH_HEAVY = /(research lab|research laboratory|foundation model research|ai research company|research-focused|research institute)/i;
const TECHNICAL_ROLE = /(cto|chief technology|engineering|engineer|developer|technical|product|research|scientist|data science|machine learning)/i;
const GTM_ROLE = /(sales|business development|partnership|alliances|growth|revenue|commercial|go-to-market|gtm|market expansion|international|apac|asia|country manager)/i;

function clean(v, max = 1400) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
function safeError(v = '') {
  return String(v)
    .replace(/tvly-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[key]')
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
function escapeRegExp(v = '') {
  return String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
function excludedCompany(company = '', excludeCompanies = []) {
  const c = token(company);
  return Boolean(c) && excludeCompanies.some(x => {
    const e = token(x);
    return e && (c === e || c.startsWith(e) || e.startsWith(c));
  });
}
function evidenceText(rows = []) {
  return rows.map(r => `${r?.title || ''} ${r?.content || ''}`).join(' ');
}
function companySignalContext(row, company) {
  const title = String(row?.title || '');
  const content = String(row?.content || '');
  const pattern = new RegExp(escapeRegExp(company), 'i');
  if (pattern.test(title) && TRIGGER.test(`${title} ${content}`)) return clean(title, 220);
  const lowerContent = content.toLowerCase();
  const lowerCompany = String(company || '').toLowerCase();
  const index = lowerContent.indexOf(lowerCompany);
  if (index < 0) return '';
  const window = content.slice(Math.max(0, index - 180), Math.min(content.length, index + lowerCompany.length + 280));
  return TRIGGER.test(window) ? clean(window.replace(/\s+/g, ' '), 220) : '';
}
function candidateEvidence(company, sources) {
  const strict = sources
    .map(row => ({ row, signal: companySignalContext(row, company) }))
    .filter(x => x.signal);
  if (strict.length) return strict.slice(0, 4);

  // Search snippets are short. If the company and a growth trigger are both in the same result,
  // keep it as a weaker fallback instead of discarding the company entirely.
  const pattern = new RegExp(escapeRegExp(company), 'i');
  return sources
    .filter(row => pattern.test(`${row?.title || ''} ${row?.content || ''}`) && TRIGGER.test(`${row?.title || ''} ${row?.content || ''}`))
    .slice(0, 3)
    .map(row => ({ row, signal: clean(row?.title || row?.content || '', 220) }));
}
function likelyB2BSoftware(rows = []) {
  const text = evidenceText(rows);
  if (!SOFTWARE_SIGNAL.test(text)) return false;
  if (HARDWARE_HEAVY.test(text) && !COMMERCIAL_SOFTWARE_SIGNAL.test(text)) return false;
  if (RESEARCH_HEAVY.test(text) && !COMMERCIAL_SOFTWARE_SIGNAL.test(text)) return false;
  return true;
}
function explicitKoreaPresence(text = '') {
  const s = String(text).toLowerCase();
  return [
    /korea\s+(office|team|country manager|general manager|head|sales team|subsidiary|operations)/,
    /(office|team|subsidiary|operations)\s+(in|for)\s+(south\s+)?korea/,
    /seoul\s+(office|team|hub|based|role|roles|jobs|location)/,
    /(country manager|head of|general manager)[^.!?]{0,40}(korea|seoul)/,
    /(acquire|acquired|acquisition)[^.!?]{0,80}(korea|korean)/,
    /(korea|korean)[^.!?]{0,50}(subsidiary|entity|office|team|country manager|sales team)/
  ].some(r => r.test(s));
}
function pickOfficialUrl(company, hint, rows) {
  if (looksLikeCompanyHost(hint, company)) return `https://${rootHost(hint)}/`;
  const hit = rows.find(r => looksLikeCompanyHost(r.url, company));
  return hit ? `https://${rootHost(hit.url)}/` : '';
}
function signalScore(matched = []) {
  const rows = matched.map(x => x.row || x);
  const text = evidenceText(rows);
  let score = 30;
  if (ASIA_SIGNAL.test(text)) score += 28;
  else if (/(international|global)/i.test(text)) score += 15;
  if (FUNDING_SIGNAL.test(text)) score += 14;
  if (GTM_SIGNAL.test(text)) score += 18;
  score += Math.min(10, matched.length * 3);
  return Math.min(95, score);
}
function signalTags(matched = []) {
  const rows = matched.map(x => x.row || x);
  const text = evidenceText(rows);
  const tags = [];
  if (ASIA_SIGNAL.test(text)) tags.push('아시아 확장');
  else if (/(international|global)/i.test(text)) tags.push('해외 확장');
  if (FUNDING_SIGNAL.test(text)) tags.push('투자·자금조달');
  if (GTM_SIGNAL.test(text)) tags.push('영업·파트너십 확대');
  return tags.length ? tags : ['해외 성장'];
}
function hashSeed(v = '') {
  let h = 0;
  for (const ch of String(v)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
function pickDiscoveryTopics(seed, count = 3) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(DISCOVERY_TOPICS[(seed + i * 5) % DISCOVERY_TOPICS.length]);
  return [...new Set(out)];
}

async function discoverEvidence(focus, searchVariant) {
  if (!tavilyConfigured()) throw new Error('TAVILY_API_KEY가 필요합니다.');
  const f = clean(focus, 600);
  const seed = hashSeed(searchVariant || `${new Date().toISOString().slice(0, 13)}`);
  const rotated = pickDiscoveryTopics(seed, 3);
  const themes = f ? [f, rotated[0], rotated[1]] : rotated;
  const suffixes = [
    'Japan Singapore APAC expansion partnership hiring funding 2026',
    'international sales go-to-market Asia expansion 2026',
    'Series A Series B growth enterprise customers expansion 2026'
  ];
  const queries = themes.map((theme, i) => `${theme} ${suffixes[i % suffixes.length]}`);
  const r = await tavilySearchMany(queries, {
    maxResults: 12,
    timeRange: 'year',
    excludeDomains: DISCOVERY_EXCLUDES,
    topic: 'general'
  });
  const sources = r.results.slice(0, 34);
  if (!sources.length) throw new Error('최신 후보 근거를 찾지 못했습니다.');
  return {
    evidence: formatEvidence(sources, 34, 13000),
    sources,
    meta: { ...r.meta, search_results: sources.length, themes }
  };
}

async function shortlist(evidence, focus, excludeCompanies = []) {
  const exclusions = excludeCompanies.length ? excludeCompanies.slice(0, 40).join(', ') : '없음';
  const prompt = `아래 SOURCE만 사용해서 우리가 "한국 시장 테스트/아웃바운드 파일럿"을 제안할 해외 회사를 최대 12곳 고른다.

우리가 찾는 고객:
- 기업 고객에게 소프트웨어를 파는 B2B SaaS / enterprise software / API / 업무용 플랫폼 회사
- 최근 1년 안에 해외 확장·투자·영업 채용·파트너십·GTM 신호가 있음
- 특히 일본·싱가포르·APAC 등 아시아 확장 신호가 있으면 우선
- 한국 현지 영업팀을 크게 만들기 전 한국 잠재고객 3곳으로 수요를 시험해볼 만한 회사

사용자 추가 조건: ${clean(focus, 600) || '없음'}
최근 이미 화면에 나온 회사(절대 다시 선택하지 않음): ${exclusions}

반드시 제외:
- 위의 최근 제외 회사
- 한국 회사
- Microsoft, Google, Salesforce 같은 초대형/성숙 글로벌 플랫폼
- 소비자 앱, 미디어, 게임 중심 회사
- AI 연구소/모델 연구가 본업이고 판매 가능한 B2B 소프트웨어가 확인되지 않는 회사
- 반도체·GPU·서버·장비 제조사 등 하드웨어가 본업인 회사
- 컨설팅/에이전시/채용대행사
- SOURCE에 회사명이 직접 등장하지 않는 경우

절대 규칙:
1) 회사명은 SOURCE 제목 또는 본문에 직접 등장해야 한다.
2) source_urls는 그 회사를 직접 언급한 SOURCE URL만 사용한다.
3) 최근 성장·확장 신호가 같은 SOURCE 안에서 확인되면 우선한다.
4) official_url_hint는 SOURCE에 명확한 공식 홈페이지가 있을 때만 넣고 아니면 빈 문자열.
5) recommended_role은 Head of APAC, VP Sales, Head of Sales, Business Development, Partnerships, Growth, CEO, Founder 중 가장 적절한 하나.
6) CTO, Engineering, Product, Research 직책은 한국 시장 영업 제안의 1차 담당자로 선택하지 않는다.
7) 숫자 점수나 근거 밖 사실을 만들지 않는다.
8) 적합한 회사가 적으면 억지로 채우지 않는다.

반드시 아래 JSON 구조만 반환:
{"candidates":[{"company":"","official_url_hint":"","source_urls":[],"recommended_role":""}]}

${evidence.slice(0, 13000)}`;

  const structured = await chatJson({ prompt, maxTokens: 1700, timeoutMs: 35000, temperature: 0 });
  const candidates = Array.isArray(structured.data?.candidates) ? structured.data.candidates : [];
  return {
    data: { candidates: candidates.slice(0, 12) },
    usage: structured.usage || null,
    model: structured.model || AI_MODEL
  };
}

async function verifyCandidate(candidate, discoverySources, excludeCompanies = []) {
  const company = clean(candidate?.company, 120);
  if (!company || matureCompany(company) || excludedCompany(company, excludeCompanies)) return null;

  const matched = candidateEvidence(company, discoverySources);
  if (!matched.length) return null;

  const r = await tavilySearch(
    `"${company}" official website SaaS software platform customers Korea Seoul office team sales partnerships`,
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
  if (!likelyB2BSoftware([...matched.map(x => x.row), ...rows.slice(0, 6)])) return null;

  const koreaRows = rows.filter(row => /korea|seoul|한국|서울/i.test(`${row.title} ${row.content} ${row.url}`));
  if (koreaRows.some(row => explicitKoreaPresence(`${row.title} ${row.content}`))) return null;

  const evidence = matched
    .map(x => x.row)
    .filter(x => /^https?:\/\//i.test(x?.url || ''))
    .slice(0, 4)
    .map(x => ({ title: clean(x.title, 220), url: clean(x.url, 500) }));
  if (!evidence.length) return null;

  const role = clean(candidate?.recommended_role, 80) || 'Head of Sales';
  const signalTitle = clean(matched[0]?.signal, 220) || clean(evidence[0]?.title, 220) || '최근 해외 확장·성장 신호 확인';
  const tags = signalTags(matched);

  return {
    company,
    url: officialUrl,
    priority_score: signalScore(matched),
    signal_title: signalTitle,
    why_buy_our_service: `${tags.join('·')} 신호가 최근 공개 자료에서 확인됐고 한국 현지 영업조직은 명확히 확인되지 않았습니다. 현지 채용 전 소규모 시장 테스트를 제안하기 좋은 후보입니다.`,
    why_now: signalTitle,
    korea_opportunity: '무료 샘플로 한국 잠재고객 3곳, 예상 구매 담당자, 각 회사의 접근 이유를 먼저 제시하고 반응이 있으면 유료 시장검증·아웃바운드로 확장합니다.',
    source_urls: evidence.map(x => x.url),
    evidence,
    recommended_role: role,
    contact_search_query: `"${company}" ("Head of APAC" OR "VP Sales" OR "Head of Sales" OR Partnerships OR "Business Development" OR "Market Expansion") LinkedIn`,
    verification_status: '공식 사이트 확인 · 대규모 한국 현지 영업조직 명시 자료 미발견'
  };
}

function roleMatchScore(position = '', recommendedRole = '') {
  const p = String(position).toLowerCase();
  const target = String(recommendedRole).toLowerCase();
  let score = 0;
  if (GTM_ROLE.test(p)) score += 52;
  if (/head|director|vp|vice president|chief commercial|chief revenue|general manager/.test(p)) score += 24;
  if (/founder|co-founder|ceo|chief executive/.test(p)) score += 12;
  if (target && p.includes(target)) score += 18;
  if (TECHNICAL_ROLE.test(p)) score -= 65;
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
    const bestEntry = ranked[0];
    if (!bestEntry || bestEntry.score < 18) return { status: 'not_found', contact: null };
    const best = bestEntry.raw;
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
  const signal = clean(signalTitle, 170).replace(/\s+/g, ' ');
  return `${hello}\n\nI noticed ${company}'s recent move: ${signal}.\n\nRather than asking for a call, I can send a no-cost Korea market sample: 3 Korean accounts that fit ${company}, the buyer role at each, and why each account may be worth contacting.\n\nIt is a quick way to judge whether Korea deserves a deeper test before adding local headcount.\n\nWorth sending the 3-account sample over?`;
}

export async function POST(request) {
  if (!aiConfigured()) return Response.json({ error: 'OPENCODE_ZEN_API_KEY가 Vercel 환경변수에 없습니다.' }, { status: 503 });
  if (!tavilyConfigured()) return Response.json({ error: '검색 엔진 설정이 필요합니다.' }, { status: 503 });

  let body = {};
  try { body = await request.json(); }
  catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }

  const focus = clean(body.focus, 600);
  const searchVariant = clean(body.searchVariant, 120);
  const excludeCompanies = Array.isArray(body.excludeCompanies)
    ? body.excludeCompanies.map(x => clean(String(x), 120)).filter(Boolean).slice(0, 40)
    : [];

  try {
    const discovery = await discoverEvidence(focus, searchVariant);
    const short = await shortlist(discovery.evidence, focus, excludeCompanies);
    const candidates = (Array.isArray(short.data?.candidates) ? short.data.candidates : [])
      .filter(x => !excludedCompany(x?.company, excludeCompanies))
      .slice(0, 12);

    if (!candidates.length) {
      return Response.json({
        leads: [],
        strategy: { next_action: '이번 검색 묶음은 건너뛰고 다음 후보군을 자동 탐색합니다.' },
        meta: {
          search: discovery.meta,
          ai_provider: AI_PROVIDER,
          structure_model: short.model || AI_MODEL,
          structure_usage: short.usage,
          returned_count: 0,
          excluded_recent_count: excludeCompanies.length,
          hunter_configured: Boolean(process.env.HUNTER_API_KEY),
          stage: 'shortlist_empty'
        }
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const verified = [];
    for (const candidate of candidates) {
      try {
        const v = await verifyCandidate(candidate, discovery.sources, excludeCompanies);
        if (v && !verified.some(x => token(x.company) === token(v.company))) verified.push(v);
      } catch {}
      if (verified.length >= 6) break;
    }

    if (!verified.length) {
      return Response.json({
        leads: [],
        strategy: { next_action: '이번 후보군은 건너뛰고 다음 검색 묶음을 자동 탐색합니다.' },
        meta: {
          search: discovery.meta,
          ai_provider: AI_PROVIDER,
          structure_model: short.model || AI_MODEL,
          structure_usage: short.usage,
          returned_count: 0,
          excluded_recent_count: excludeCompanies.length,
          hunter_configured: Boolean(process.env.HUNTER_API_KEY),
          stage: 'verification_empty'
        }
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    verified.sort((a, b) => b.priority_score - a.priority_score);
    const selected = verified.slice(0, 4);
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
        outreach_ko: `${lead.company}의 최근 성장 신호를 근거로 한국 잠재고객 3곳 무료 샘플을 먼저 제안하고, 반응이 있으면 유료 시장검증·아웃바운드로 전환합니다.`
      });
    }

    return Response.json({
      leads,
      strategy: { next_action: '실제 이메일이 확인된 영업·사업개발 담당자에게 한국 잠재고객 3곳 무료 샘플을 제안합니다.' },
      meta: {
        search: discovery.meta,
        ai_provider: AI_PROVIDER,
        structure_model: short.model || AI_MODEL,
        structure_usage: short.usage,
        returned_count: leads.length,
        excluded_recent_count: excludeCompanies.length,
        hunter_configured: Boolean(process.env.HUNTER_API_KEY),
        pipeline: 'Tavily 후보 탐색 → DeepSeek 후보 정리 → 회사별 공식/B2B 검증 → 한국 현지팀 과다 여부 확인 → Hunter GTM 담당자 → 첫 연락 준비'
      }
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({
      error: safeError(e?.message || e),
      hint: e?.status === 429 ? 'OpenCode Zen 사용량 제한입니다. 잠시 후 다시 시도하세요.' : '고객 발굴 과정에서 오류가 발생했습니다.'
    }, { status: e?.status || 502 });
  }
}
