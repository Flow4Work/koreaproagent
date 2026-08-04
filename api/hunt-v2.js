import { POST as baseHunt } from './hunt.js';
import { listSentCompanyDomains, normalizeCompanyKey } from '../lib/sent-companies.js';
import { attendanceGrade, mergeEvidence } from '../lib/hunt-qualification.js';

const clean = (value = '', max = 500) => String(value || '').trim().slice(0, max);
let sentDomainCache = { expiresAt: 0, domains: [] };

async function safeSentDomains() {
  if (sentDomainCache.expiresAt > Date.now()) return sentDomainCache.domains;
  const secret = clean(process.env.GMAIL_SESSION_SECRET, 5000);
  if (!secret) return [];
  try {
    const domains = await listSentCompanyDomains(secret, 250);
    sentDomainCache = { expiresAt: Date.now() + 5 * 60 * 1000, domains };
    return domains;
  }
  catch (error) {
    console.error('hunt sent-domain prefilter failed', clean(error?.message || error, 300));
    return [];
  }
}

function normalizedExcludes(values = []) {
  return [...new Set(values.map(value => normalizeCompanyKey(value)).filter(Boolean))].slice(-500);
}

async function callBaseHunt(request, body) {
  const forwarded = new Request(request.url.replace(/\/api\/hunt-v2(?:\?.*)?$/, '/api/hunt'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return baseHunt(forwarded);
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); }
  catch { return Response.json({ error: '요청 형식이 잘못됐습니다.' }, { status: 400 }); }

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

  const response = await callBaseHunt(request, forwardedBody);
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { return new Response(text, { status: response.status, headers: response.headers }); }
  if (!response.ok) return Response.json(data, { status: response.status, headers: { 'Cache-Control': 'no-store' } });

  const merged = mergeEvidence(Array.isArray(data.leads) ? data.leads : []);
  const graded = merged.map(lead => {
    const grade = lead.campaign === 'kbw' ? attendanceGrade(lead) : { code: '', label: '', contactEligible: true, reason: '' };
    return {
      ...lead,
      attendance_grade: grade.code,
      attendance_grade_label: grade.label,
      attendance_reason: grade.reason,
      contact_eligible: grade.contactEligible,
      quality_reasons: [...new Set([...(lead.quality_reasons || []), grade.code ? `${grade.code}등급 · ${grade.reason}` : ''].filter(Boolean))]
    };
  });
  const leads = graded
    .filter(lead => lead.campaign !== 'kbw' || lead.contact_eligible)
    .sort((a, b) => {
      const gradeScore = grade => grade === 'A' ? 2 : grade === 'B' ? 1 : 0;
      return gradeScore(b.attendance_grade) - gradeScore(a.attendance_grade)
        || Number(b.sales_priority || b.score || 0) - Number(a.sales_priority || a.score || 0);
    })
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
