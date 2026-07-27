// lib/korea-score.js
// Deterministic Korea GTM scoring.
// Inputs must already be grounded in verified web/Hunter evidence.

const DIMENSIONS = ['koreaPotential', 'expansionIntent', 'timing', 'reachability'];

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : 0));
}

function uniqueCount(values = []) {
  return new Set(values.filter(Boolean)).size;
}

function scoreSignalDimension(signals, dimension) {
  const matching = (Array.isArray(signals) ? signals : []).filter((s) => s?.dimension === dimension);
  const raw = matching.reduce((sum, signal) => sum + clamp(signal?.weight, 0, 40), 0);

  // Multiple independent URLs increase confidence, but cannot dominate the score.
  const evidenceUrls = matching.flatMap((signal) => (signal?.evidence ?? []).map((e) => e?.url));
  const evidenceBonus = Math.min(14, uniqueCount(evidenceUrls) * 3);

  return clamp(raw + evidenceBonus);
}

function normalizedVerification(value = '') {
  return String(value).toLowerCase().trim();
}

export function scoreReachability(contacts = [], recommendedRole = '') {
  if (!Array.isArray(contacts) || contacts.length === 0) return 0;

  const target = String(recommendedRole).toLowerCase().trim();
  let best = 0;

  for (const contact of contacts) {
    let score = 0;
    const verification = normalizedVerification(
      contact?.emailStatus ?? contact?.verification?.status ?? contact?.verification_status
    );

    if (verification === 'valid') score += 34;
    else if (verification === 'accept_all') score += 20;
    else if (verification === 'unknown') score += 8;

    if (contact?.decision_maker === true || contact?.decisionMaker === true) score += 22;

    const seniority = String(contact?.seniority ?? '').toLowerCase();
    if (seniority === 'executive') score += 18;
    else if (seniority === 'senior') score += 11;

    const department = String(contact?.department ?? '').toLowerCase();
    if (['executive', 'sales', 'management', 'marketing', 'operations'].includes(department)) score += 9;

    const title = String(contact?.title ?? contact?.position ?? '').toLowerCase();
    if (target && title.includes(target)) score += 14;
    else if (/(founder|chief executive|ceo|vp|vice president|head of|country manager|business development|partnership|growth|sales)/i.test(title)) score += 10;

    if (contact?.linkedinUrl || contact?.linkedin_url || contact?.linkedin) score += 5;
    if (contact?.email) score += 4;

    best = Math.max(best, clamp(score));
  }

  return best;
}

export function calculateKoreaScore({
  signals = [],
  contacts = [],
  recommendedRole = '',
  establishedKoreaPresence = false,
  matureCompany = false,
  evidenceUrls = [],
  officialUrl = ''
} = {}) {
  const koreaPotential = scoreSignalDimension(signals, 'koreaPotential');
  const expansionIntent = scoreSignalDimension(signals, 'expansionIntent');
  const timing = scoreSignalDimension(signals, 'timing');
  const reachability = scoreReachability(contacts, recommendedRole);

  const uniqueEvidence = uniqueCount([
    ...evidenceUrls,
    ...signals.flatMap((signal) => (signal?.evidence ?? []).map((e) => e?.url))
  ]);

  let overall = Math.round(
    koreaPotential * 0.35 +
    expansionIntent * 0.30 +
    timing * 0.20 +
    reachability * 0.15
  );

  // Guardrails.
  if (!officialUrl) overall = Math.min(overall, 45);
  if (uniqueEvidence === 0) overall = Math.min(overall, 35);
  else if (uniqueEvidence === 1) overall = Math.min(overall, 72);

  if (matureCompany) overall = Math.min(overall, 50);
  if (establishedKoreaPresence) overall = Math.min(overall, 25);

  const tier =
    overall >= 80 ? 'A' :
    overall >= 68 ? 'B' :
    overall >= 55 ? 'C' : 'D';

  const confidence =
    uniqueEvidence >= 4 ? 'high' :
    uniqueEvidence >= 2 ? 'medium' : 'low';

  return {
    overall,
    tier,
    confidence,
    dimensions: {
      koreaPotential,
      expansionIntent,
      timing,
      reachability
    },
    evidenceCount: uniqueEvidence
  };
}

export function sortByKoreaScore(candidates = []) {
  return [...candidates].sort((a, b) => {
    const aScore = Number(a?.koreaScore?.overall ?? a?.score ?? 0);
    const bScore = Number(b?.koreaScore?.overall ?? b?.score ?? 0);
    if (bScore !== aScore) return bScore - aScore;

    const aReach = Number(a?.koreaScore?.dimensions?.reachability ?? 0);
    const bReach = Number(b?.koreaScore?.dimensions?.reachability ?? 0);
    return bReach - aReach;
  });
}

export { DIMENSIONS as KOREA_SCORE_DIMENSIONS };
