import { POST as baseHunt } from './hunt.js';
import { contactProviderStatus, findContacts } from '../lib/contact-discovery-v2.js';
import { contactDiscoveryConfigured } from '../lib/contact-discovery.js';
import { AI_MODEL, AI_PROVIDER, aiConfigured, groqConfigured, checkAiConnection, runInferenceSmoke } from '../lib/ai-provider.js';
import { attendanceGrade, mergeEvidence } from '../lib/hunt-qualification.js';
import { listSentCompanyDomains, normalizeCompanyKey } from '../lib/sent-companies.js';
import { IDENTITY_VERSION, resolveCompanyIdentities } from '../lib/company-identity.js';

function clean(value, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function safeError(value = '') { return String(value).replace(/[A-Za-z0-9_-]{32,}/g, '[key]').slice(0, 500); }
function normalizeCompanyName(value = '') {
  const original = clean(value, 160);
  const normalized = original
    .replace(/\s*(?:[·|:—–-]\s*)?(?:events?\s+list|list\s+of\s+events)\s*$/i, '')
    .trim();
  return normalized || original;
}

function healthSafeMessage(text = '') {
  return String(text)
    .replace(/tvly-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/[A-Za-z0-9]{32,}/g, '[key]')
    .slice(0, 280);
}

function deploymentMetadata() {
  const deploymentUrl = String(process.env.VERCEL_URL || '').trim();
  return {
    deploymentCommit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    deploymentBranch: process.env.VERCEL_GIT_COMMIT_REF || null,
    deploymentEnvironment: process.env.VERCEL_ENV || null,
    deploymentUrl: deploymentUrl ? `https://${deploymentUrl}` : null
  };
}

async function healthResponse() {
  const opencodeConfigured = aiConfigured();
  const groqKeyConfigured = groqConfigured();
  const tavilyConfigured = Boolean(process.env.TAVILY_API_KEY);
  const contactProviders = contactProviderStatus();
  const contactsConfigured = contactDiscoveryConfigured();

  let ai = { ok: false, available: false, error: 'OpenCode not configured' };
  let smoke = null;

  if (opencodeConfigured) {
    ai = await checkAiConnection();
    if (ai.ok) smoke = await runInferenceSmoke(8000);
  }

  const aiReady = Boolean(opencodeConfigured && ai.ok && smoke?.ok);
  const searchReady = tavilyConfigured;

  const result = {
    ok: Boolean(searchReady && aiReady),
    ...deploymentMetadata(),
    searchReady,
    aiReady,
    aiProvider: AI_PROVIDER,
    aiModel: AI_MODEL,
    opencodeConfigured,
    opencodeConnected: Boolean(ai.ok),
    opencodeModelAvailable: Boolean(ai.available),
    groqConfigured: groqKeyConfigured,
    tavilyConfigured,
    inferenceSmokeOk: Boolean(smoke?.ok),
    inferenceSmokeModel: smoke?.model || null,
    inferenceSmokeError: smoke?.ok ? null : healthSafeMessage(smoke?.error || ai.error || 'AI inference unavailable'),
    contactDiscoveryConfigured: contactsConfigured,
    contactProviders,
    searchProvider: 'tavily',
    timestamp: new Date().toISOString(),
    aiConfigured: opencodeConfigured,
    aiConnected: Boolean(ai.ok),
    aiModelAvailable: Boolean(ai.available),
    allModelsAvailable: Boolean(ai.available)
  };

  if (!tavilyConfigured) {
    result.status = 'tavily_missing';
    result.error = 'TAVILY_API_KEY is missing';
    return Response.json(result, { status: 503, headers: { 'Cache-Control':'no-store' } });
  }

  if (!aiReady) {
    result.status = 'search_ready_ai_degraded';
    result.warning = healthSafeMessage(smoke?.error || ai.error || 'AI inference is currently degraded');
  } else {
    result.status = 'ready';
  }

  return Response.json(result, { status: 200, headers: { 'Cache-Control':'no-store' } });
}

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get('action') === 'health') return healthResponse();
  return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: { 'Cache-Control':'no-store' } });
}

async function cleanCompanyNames(body = {}) {
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 30).map(item => ({
    id: clean(item?.id, 180),
    company: normalizeCompanyName(item?.raw_name || item?.company),
    raw_name: clean(item?.raw_name || item?.company, 220),
    domain: clean(item?.domain, 240),
    url: clean(item?.url, 500),
    country: clean(item?.country, 100),
    source_title: clean(item?.source_title, 320),
    source_url: clean(item?.source_url, 500)
  })).filter(item => item.id && item.company);

  if (!items.length) {
    return Response.json({ names: [], identities: [], version: IDENTITY_VERSION }, { headers: { 'Cache-Control':'no-store' } });
  }

  const identities = await resolveCompanyIdentities(items);
  const currentById = new Map(items.map(item => [item.id, item.company]));
  const names = identities.map(identity => ({
    id: identity.id,
    name: identity.status === 'verified' && identity.greeting_name
      ? identity.greeting_name
      : currentById.get(identity.id) || '',
    status: identity.status,
    confidence: Number(identity.confidence || 0),
    evidence_url: identity.evidence_url || ''
  }));

  return Response.json({
    names,
    identities,
    version: IDENTITY_VERSION,
    verified: identities.filter(row => row?.status === 'verified').length,
    needs_review: identities.filter(row => row?.status !== 'verified').length
  }, { headers: { 'Cache-Control':'no-store' } });
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

function failureReason(result = {}) {
  const attempts = Array.isArray(result.attempts) ? result.attempts : [];
  if (attempts.some(attempt => attempt.reason === 'generic_only')) return '지원·대표메일만 발견';
  if (attempts.some(attempt => attempt.reason === 'invalid_only')) return '검증 실패 이메일만 발견';
  if (attempts.some(attempt => attempt.reason === 'below_quality_threshold')) return '직무 또는 품질 점수 미달';
  if (attempts.every(attempt => attempt.status === 'skipped')) return '메일 공급자 미연결';
  if (attempts.some(attempt => attempt.status === 'error' && attempt.code === 429)) return '메일 공급자 사용량 한도 초과';
  if (attempts.some(attempt => attempt.status === 'error')) return '일부 메일 공급자 오류';
  return result.stopReason === 'all_providers_exhausted_no_results' ? '공개·공급자 이메일 없음' : '적합한 담당자 이메일 미확보';
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); }
  catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }

  if (body.action === 'company_names') return cleanCompanyNames(body);
  if (body.action === 'hunt_v2') return qualifiedHunt(request, body);

  const url = clean(body.url, 500);
  const recommendedRole = clean(body.recommendedRole, 120) || 'Operations Lead';
  const roleTargets = Array.isArray(body.roleTargets) ? body.roleTargets.map(role => clean(role, 120)).filter(Boolean) : [];
  const fallbackRoles = ['Events Lead','Operations Lead','Partnerships Lead','Community Lead','Head of Marketing','Founder','CEO'];
  const roles = [...new Set([recommendedRole, ...roleTargets, ...fallbackRoles])].slice(0, 10);
  if (!url) return Response.json({ error: '회사 URL이 필요합니다.' }, { status: 400 });

  try {
    const result = await findContacts(url, {
      maxContacts: 8,
      minQualified: 1,
      recommendedRole,
      roleTargets: roles
    });
    const contacts = Array.isArray(result?.emails) ? result.emails.slice(0, 4) : [];
    const primary = contacts.find(contact => contact.qualified) || null;
    return Response.json({
      contact: primary,
      contacts,
      provider: result.provider || null,
      provider_status: result.providerStatus || {},
      attempts: result.attempts || [],
      qualified_count: Number(result.qualifiedCount) || 0,
      score_threshold: Number(result.scoreThreshold) || 75,
      contact_status: primary ? 'qualified' : 'failed',
      failure_reason: primary ? null : failureReason(result),
      stop_reason: result.stopReason || null,
      cache_hit: Boolean(result.cacheHit),
      target_contacts: 1
    }, { headers: { 'Cache-Control':'no-store' } });
  } catch (error) {
    return Response.json({ error: safeError(error?.message || error) }, { status: 502 });
  }
}
