import { POST as baseHunt } from './hunt.js';
import { findContacts } from '../lib/contact-discovery-v2.js';
import { attendanceGrade, mergeEvidence } from '../lib/hunt-qualification.js';
import { listSentCompanyDomains, normalizeCompanyKey } from '../lib/sent-companies.js';
import { aiConfigured, chatJson } from '../lib/ai-provider.js';

function clean(value, max = 500) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function safeError(value = '') {
  return String(value).replace(/[A-Za-z0-9_-]{32,}/g, '[key]').slice(0, 500);
}

function normalizeCompanyName(value = '') {
  const original = clean(value, 160);
  const normalized = original
    .replace(/\s*(?:[·|:—–-]\s*)?(?:events?\s+list|list\s+of\s+events)\s*$/i, '')
    .trim();
  return normalized || original;
}

async function cleanCompanyNames(body = {}) {
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 30).map(item => ({
    id: clean(item?.id, 160),
    current_name: normalizeCompanyName(item?.company),
    domain: clean(item?.domain, 180),
    source_title: clean(item?.source_title, 260),
    source_url: clean(item?.source_url, 300)
  })).filter(item => item.id && item.current_name);

  if (!items.length) return Response.json({ names: [] }, { headers: { 'Cache-Control':'no-store' } });
  const fallbackNames = items.map(item => ({ id:item.id, name:item.current_name }));
  if (!aiConfigured()) {
    return Response.json({ names:fallbackNames, model:null, fallback:true }, { headers: { 'Cache-Control':'no-store' } });
  }

  const prompt = `You clean company names only for a cold-email greeting shaped as: Hi {company} team,

For each input, return the real organization or brand name in its shortest natural form.
- Keep an already clean company name unchanged.
- Remove event years, activation labels, page/list words, categories, slogans, descriptions, and marketing copy.
- When the evidence contains an event/title plus the actual host or company, choose the actual host/company.
- Do not add "team", "company", greetings, punctuation, explanations, or guesses unsupported by the evidence.
- Preserve official capitalization when clear.

Required examples:
- "KAST Events List" -> "KAST"
- "ETHNYC 2026 Activations · FORKOFF" -> "FORKOFF"
- "ium Labs: Korea Crypto Marketing Agency & Web3 GTM" -> "ium Labs"
- "Changelly" -> "Changelly"

Return only this JSON shape:
{"items":[{"id":"same input id","name":"short company name"}]}

Inputs:
${JSON.stringify(items)}`;

  try {
    const result = await chatJson({ prompt, maxTokens: 1200, timeoutMs: 30000, temperature: 0, hardDeadlineMs: 45000 });
    const rows = Array.isArray(result?.data?.items) ? result.data.items : [];
    const aiNames = new Map(rows.map(row => [clean(row?.id, 160), normalizeCompanyName(row?.name)]).filter(([id, name]) => id && name));
    const names = items.map(item => ({ id:item.id, name:normalizeCompanyName(aiNames.get(item.id) || item.current_name) }));
    return Response.json({ names, model: result.model || null }, { headers: { 'Cache-Control':'no-store' } });
  } catch (error) {
    return Response.json({
      names:fallbackNames,
      model:null,
      fallback:true,
      warning:safeError(error?.message || '회사명 검증 실패')
    }, { headers: { 'Cache-Control':'no-store' } });
  }
}

let sentDomainCache = { expiresAt: 0, domains: [] };

async function safeSentDomains() {
  if (sentDomainCache.expiresAt > Date.now()) return sentDomainCache.domains;
  const secret = clean(process.env.GMAIL_SESSION_SECRET, 5000);
  if (!secret) return [];
  try {
    const domains = await listSentCompanyDomains(secret, 250);
    sentDomainCache = { expiresAt: Date.now() + 5 * 60 * 1000, domains };
    return domains;
  } catch (error) {
    console.error('hunt sent-domain prefilter failed', clean(error?.message || error, 300));
    return [];
  }
}

function normalizedExcludes(values = []) {
  return [...new Set(values.map(value => normalizeCompanyKey(value)).filter(Boolean))].slice(-500);
}

async function qualifiedHunt(request, body = {}) {
  const sentDomains = await safeSentDomains();
  const excludes = normalizedExcludes([
    ...(Array.isArray(body.excludeDomains) ? body.excludeDomains : []),
    ...sentDomains
  ]);
  const bodyJinaKey = clean(body?.tools?.jinaKey, 5000);
  const envJinaKey = clean(process.env.JINA_API_KEY, 5000);
  const forwardedBody = {
    ...body,
    excludeDomains: excludes,
    tools: {
      ...(body.tools || {}),
      jinaKey: bodyJinaKey || envJinaKey
    }
  };
  delete forwardedBody.action;

  const forwarded = new Request(request.url.replace(/\/api\/contact(?:\?.*)?$/, '/api/hunt'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(forwardedBody)
  });
  const response = await baseHunt(forwarded);
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { return new Response(text, { status: response.status, headers: response.headers }); }
  if (!response.ok) return Response.json(data, { status: response.status, headers: { 'Cache-Control': 'no-store' } });

  const merged = mergeEvidence(Array.isArray(data.leads) ? data.leads : []);
  const graded = merged.map(lead => {
    const grade = lead.campaign === 'kbw'
      ? attendanceGrade(lead)
      : { code: '', label: '', contactEligible: true, reason: '' };
    return {
      ...lead,
      attendance_grade: grade.code,
      attendance_grade_label: grade.label,
      attendance_reason: grade.reason,
      contact_eligible: grade.contactEligible,
      quality_reasons: [...new Set([
        ...(lead.quality_reasons || []),
        grade.code ? `${grade.code}등급 · ${grade.reason}` : ''
      ].filter(Boolean))]
    };
  });
  const gradeScore = grade => grade === 'A' ? 2 : grade === 'B' ? 1 : 0;
  const leads = graded
    .filter(lead => lead.campaign !== 'kbw' || lead.contact_eligible)
    .sort((a, b) => gradeScore(b.attendance_grade) - gradeScore(a.attendance_grade)
      || Number(b.sales_priority || b.score || 0) - Number(a.sales_priority || a.score || 0))
    .slice(0, 12);
  const counts = graded.reduce((acc, lead) => {
    if (lead.attendance_grade) acc[lead.attendance_grade] = (acc[lead.attendance_grade] || 0) + 1;
    return acc;
  }, {});

  return Response.json({
    ...data,
    leads,
    meta: {
      ...(data.meta || {}),
      returned: leads.length,
      sent_preexcluded: sentDomains.length,
      jina_env_used: Boolean(!bodyJinaKey && envJinaKey),
      attendance_gate: body.campaign === 'kbw' ? 'A+B only' : 'not_applied',
      attendance_grade_counts: counts,
      contact_search_grades: body.campaign === 'kbw' ? ['A', 'B'] : ['all'],
      evidence_merge: true
    }
  }, { headers: { 'Cache-Control': 'no-store' } });
}

function uniqueContacts(body = {}) {
  const rows = [
    body.contact,
    ...(Array.isArray(body.existingContacts) ? body.existingContacts : []),
    ...(Array.isArray(body.contacts) ? body.contacts : [])
  ].filter(Boolean);
  const seen = new Set();
  return rows.filter(contact => {
    const key = clean(contact?.email || contact?.linkedinUrl || contact?.name, 240).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 30);
}

function targetRoles(body = {}) {
  const recommendedRole = clean(body.recommendedRole, 120) || 'Operations Lead';
  const requested = Array.isArray(body.roleTargets) ? body.roleTargets.map(role => clean(role, 120)).filter(Boolean) : [];
  const fallback = [
    'Events Lead','Event Marketing','Field Marketing','Experiential Marketing','Brand Activation','Sponsorships',
    'Operations Lead','Partnerships Lead','Strategic Partnerships','Community Lead','Ecosystem Lead','Head of Marketing',
    'Country Manager','APAC Lead','Business Development','Founder','CEO'
  ];
  return {
    recommendedRole,
    roles: [...new Set([recommendedRole, ...requested, ...fallback])].slice(0, 20)
  };
}

function failureType(result = {}) {
  const summary = result.verificationSummary || {};
  const attempts = Array.isArray(result.attempts) ? result.attempts : [];
  const qualityReason = attempts.find(attempt => attempt.provider === 'quality_gate')?.reason;
  if (result.stopReason === 'invalid_domain') return 'invalid_domain';
  if (qualityReason === 'generic_only' || Number(summary.generic) > 0 && !Number(summary.personal) && !Number(summary.role_mailbox)) return 'generic_only';
  if (Number(summary.accept_all) > 0) return 'accept_all';
  if (Number(summary.unknown) > 0) return 'unknown';
  if (qualityReason === 'below_quality_threshold') return 'role_or_quality';
  if (!Number(summary.valid) && !Number(summary.accept_all) && !Number(summary.unknown)) return 'no_email';
  return 'not_qualified';
}

function failureReason(result = {}) {
  const type = failureType(result);
  const attempts = Array.isArray(result.attempts) ? result.attempts : [];
  if (type === 'generic_only') return '지원·대표메일만 발견';
  if (type === 'accept_all') return '수신 여부를 확정할 수 없는 accept-all 메일';
  if (type === 'unknown') return 'SMTP 검증 결과가 불확실한 이메일';
  if (type === 'role_or_quality') return '직무 또는 품질 점수 미달';
  if (type === 'invalid_domain') return '회사 도메인 확인 실패';
  if (attempts.every(attempt => attempt.status === 'skipped')) return '메일 공급자 미연결';
  if (attempts.some(attempt => attempt.status === 'error' && attempt.code === 429)) return '메일 공급자 사용량 한도 초과';
  if (attempts.some(attempt => attempt.status === 'error')) return '일부 메일 공급자 오류';
  return result.stopReason === 'all_providers_exhausted_no_results' ? '공개·공급자 이메일 없음' : '적합한 담당자 이메일 미확보';
}

async function buildContactResult(body = {}) {
  const url = clean(body.url, 500);
  if (!url) throw Object.assign(new Error('회사 URL이 필요합니다.'), { status: 400 });
  const { recommendedRole, roles } = targetRoles(body);
  const seedContacts = uniqueContacts(body);
  const forceVerify = body.forceVerify === true;
  const result = await findContacts(url, {
    maxContacts: 12,
    minQualified: 1,
    recommendedRole,
    roleTargets: roles,
    seedContacts,
    verifyLimit: Math.min(Math.max(Number(body.verifyLimit) || (forceVerify ? 12 : 8), 1), 20),
    stopAfterQualified: body.stopAfterQualified !== false,
    forceRefresh: forceVerify
  });
  const contacts = Array.isArray(result?.emails) ? result.emails.slice(0, 6) : [];
  const primary = contacts.find(contact => contact.qualified) || null;
  return {
    contact: primary,
    contacts,
    provider: result.provider || null,
    provider_status: result.providerStatus || {},
    attempts: result.attempts || [],
    qualified_count: Number(result.qualifiedCount) || 0,
    score_threshold: Number(result.scoreThreshold) || 75,
    contact_status: primary ? 'qualified' : 'failed',
    failure_type: primary ? null : failureType(result),
    failure_reason: primary ? null : failureReason(result),
    stop_reason: result.stopReason || null,
    cache_hit: Boolean(result.cacheHit),
    target_contacts: 1,
    verification_summary: result.verificationSummary || {},
    role_targets: result.roleTargets || roles
  };
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        output[index] = { status: 'fulfilled', value: await worker(items[index], index) };
      } catch (error) {
        output[index] = { status: 'rejected', reason: error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return output;
}

async function reverifyBatch(body = {}) {
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 4);
  if (!items.length) return Response.json({ results: [], processed: 0 }, { headers: { 'Cache-Control':'no-store' } });
  const settled = await mapLimit(items, 2, async item => ({
    id: clean(item?.id, 180),
    ...(await buildContactResult({
      ...item,
      forceVerify: true,
      verifyLimit: Number(item?.verifyLimit) || 12,
      stopAfterQualified: true
    }))
  }));
  const results = settled.map((entry, index) => {
    if (entry.status === 'fulfilled') return entry.value;
    return {
      id: clean(items[index]?.id, 180),
      contact: null,
      contacts: [],
      contact_status: 'failed',
      failure_type: 'request_error',
      failure_reason: safeError(entry.reason?.message || '재검증 실패')
    };
  });
  return Response.json({
    results,
    processed: results.length,
    qualified: results.filter(result => result.contact?.qualified).length
  }, { headers: { 'Cache-Control':'no-store' } });
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); }
  catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }

  if (body.action === 'company_names') return cleanCompanyNames(body);
  if (body.action === 'hunt_v2') return qualifiedHunt(request, body);
  if (body.action === 'reverify_batch') return reverifyBatch(body);

  try {
    return Response.json(await buildContactResult(body), { headers: { 'Cache-Control':'no-store' } });
  } catch (error) {
    const status = Number(error?.status) || 502;
    return Response.json({ error: safeError(error?.message || error) }, { status });
  }
}
