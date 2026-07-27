// lib/korea-signals.js
// Deterministic signal extraction for Korea GTM qualification.
// No LLM scoring happens here: this module only maps verified evidence text -> explicit signals.

const TEXT_MAX = 12000;

const SIGNALS = [
  // Expansion intent
  {
    id: 'apac_expansion',
    label: 'APAC 확장',
    dimension: 'expansionIntent',
    weight: 24,
    patterns: [/\bapac\b.{0,70}\b(expand|expansion|growth|launch|market|sales|team|hiring)\b/i,
               /\b(expand|expansion|launch|growth)\b.{0,70}\bapac\b/i]
  },
  {
    id: 'japan_expansion',
    label: '일본 진출/확장',
    dimension: 'expansionIntent',
    weight: 18,
    patterns: [/\bjapan\b.{0,70}\b(expand|expansion|launch|market|sales|office|team|partner|hiring)\b/i,
               /\b(expand|expansion|launch)\b.{0,70}\bjapan\b/i]
  },
  {
    id: 'singapore_expansion',
    label: '싱가포르 진출/확장',
    dimension: 'expansionIntent',
    weight: 14,
    patterns: [/\bsingapore\b.{0,70}\b(expand|expansion|launch|market|sales|office|team|partner|hiring)\b/i,
               /\b(expand|expansion|launch)\b.{0,70}\bsingapore\b/i]
  },
  {
    id: 'asia_expansion',
    label: '아시아 확장',
    dimension: 'expansionIntent',
    weight: 16,
    patterns: [/\basia\b.{0,70}\b(expand|expansion|growth|launch|market|sales|team|hiring)\b/i,
               /\b(expand|expansion|launch|growth)\b.{0,70}\basia\b/i]
  },
  {
    id: 'international_expansion',
    label: '글로벌/해외 확장',
    dimension: 'expansionIntent',
    weight: 12,
    patterns: [/\b(international|global|overseas)\b.{0,70}\b(expand|expansion|growth|launch|sales|market)\b/i,
               /\b(expand|expansion|growth)\b.{0,70}\b(international|global|overseas)\b/i]
  },
  {
    id: 'apac_sales_hiring',
    label: 'APAC 영업 채용',
    dimension: 'expansionIntent',
    weight: 18,
    patterns: [/\b(apac|asia)\b.{0,80}\b(account executive|sales|business development|partnerships|country manager|growth)\b.{0,50}\b(hiring|hire|role|job|careers?)\b/i,
               /\b(hiring|hire|role|job|careers?)\b.{0,80}\b(apac|asia)\b.{0,80}\b(sales|business development|partnerships|account executive|country manager)\b/i]
  },

  // Korea potential
  {
    id: 'korea_customer',
    label: '한국 고객/사용 신호',
    dimension: 'koreaPotential',
    weight: 28,
    patterns: [/\b(korea|korean|seoul)\b.{0,80}\b(customer|client|user|merchant|brand|enterprise|case study|adoption)\b/i,
               /\b(customer|client|user|merchant|brand|enterprise|case study)\b.{0,80}\b(korea|korean|seoul)\b/i]
  },
  {
    id: 'korean_localization',
    label: '한국어/한국 현지화 신호',
    dimension: 'koreaPotential',
    weight: 22,
    patterns: [/\b(korean language|korean localization|locali[sz]ation for korea|ko-kr)\b/i,
               /\b(korea|korean)\b.{0,80}\b(locali[sz]e|locali[sz]ation|language support|translation)\b/i]
  },
  {
    id: 'adjacent_market_motion',
    label: '한국 인접 아시아 시장 확장',
    dimension: 'koreaPotential',
    weight: 16,
    patterns: [/\b(japan|singapore|taiwan|hong kong)\b.{0,80}\b(expand|expansion|launch|sales|office|partner|market)\b/i]
  },
  {
    id: 'apac_enterprise_motion',
    label: 'APAC 엔터프라이즈 영업 신호',
    dimension: 'koreaPotential',
    weight: 14,
    patterns: [/\b(apac|asia)\b.{0,90}\b(enterprise|b2b|sales|revenue|customers?|partners?)\b/i]
  },

  // Timing
  {
    id: 'recent_funding',
    label: '최근 투자/펀딩',
    dimension: 'timing',
    weight: 24,
    patterns: [/\b(seed|pre-seed|series\s+[a-e]|funding|funded|raised|raises|investment|financing)\b/i]
  },
  {
    id: 'new_market_launch',
    label: '신규 시장/제품 출시',
    dimension: 'timing',
    weight: 18,
    patterns: [/\b(launch|launched|launches|rollout|rolled out|debut|introduced)\b.{0,100}\b(market|country|region|asia|apac|japan|singapore|product|platform)\b/i]
  },
  {
    id: 'gtm_hiring',
    label: 'GTM/영업 채용',
    dimension: 'timing',
    weight: 18,
    patterns: [/\b(hiring|hire|recruit|opening|role|careers?)\b.{0,100}\b(sales|business development|partnerships|growth|marketing|country manager|account executive)\b/i]
  },
  {
    id: 'partnership_motion',
    label: '파트너십 확대',
    dimension: 'timing',
    weight: 14,
    patterns: [/\b(partnership|partnered|partners with|strategic alliance|channel partner|distribution partner)\b/i]
  },
  {
    id: 'international_growth',
    label: '국제 성장 신호',
    dimension: 'timing',
    weight: 12,
    patterns: [/\b(international|global|overseas|apac|asia)\b.{0,100}\b(growth|revenue|customers|sales|expansion)\b/i]
  }
];

const KOREA_PRESENCE_PATTERNS = [
  /\bkorea\s+(office|team|country manager|general manager|head|sales team|subsidiary|operations|entity)\b/i,
  /\b(office|team|subsidiary|operations|entity)\s+(in|for)\s+(south\s+)?korea\b/i,
  /\bseoul\s+(office|team|hub|based|role|roles|jobs|location)\b/i,
  /\b(country manager|head of|general manager)[^.!?]{0,60}\b(korea|seoul)\b/i,
  /\b(launch|launched|operate|operating|operations)[^.!?]{0,60}\b(in\s+)?(south\s+)?korea\b/i,
  /\b(korea|korean)[^.!?]{0,70}\b(subsidiary|entity|license|office|team)\b/i
];

function clean(value, max = TEXT_MAX) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function rowText(row = {}) {
  return clean(`${row.title ?? ''} ${row.content ?? ''}`, TEXT_MAX);
}

function safeUrl(value = '') {
  try {
    const u = new URL(String(value));
    return ['http:', 'https:'].includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}

export function normalizeEvidenceRows(rows = []) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const output = [];

  for (const row of rows) {
    const url = safeUrl(row?.url);
    const text = rowText(row);
    if (!url || !text) continue;
    const key = `${url}|${text.slice(0, 180)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    output.push({
      title: clean(row?.title, 300),
      content: clean(row?.content, 5000),
      url,
      publishedDate: clean(row?.published_date ?? row?.publishedDate ?? row?.date, 80)
    });
  }

  return output;
}

export function detectEstablishedKoreaPresence(rows = []) {
  const normalized = normalizeEvidenceRows(rows);
  const matches = [];

  for (const row of normalized) {
    const text = rowText(row);
    if (KOREA_PRESENCE_PATTERNS.some((pattern) => pattern.test(text))) {
      matches.push({
        url: row.url,
        title: row.title,
        excerpt: text.slice(0, 360)
      });
    }
  }

  return {
    established: matches.length > 0,
    matches: matches.slice(0, 5)
  };
}

export function extractKoreaSignals(rows = []) {
  const normalized = normalizeEvidenceRows(rows);
  const found = [];

  for (const signal of SIGNALS) {
    const evidence = normalized
      .filter((row) => signal.patterns.some((pattern) => pattern.test(rowText(row))))
      .slice(0, 3)
      .map((row) => ({
        url: row.url,
        title: row.title,
        publishedDate: row.publishedDate
      }));

    if (evidence.length) {
      found.push({
        id: signal.id,
        label: signal.label,
        dimension: signal.dimension,
        weight: signal.weight,
        evidence
      });
    }
  }

  return found;
}

export function summarizeSignalEvidence(signals = []) {
  const urls = new Set();
  const labels = [];

  for (const signal of Array.isArray(signals) ? signals : []) {
    labels.push(signal.label);
    for (const evidence of signal.evidence ?? []) {
      if (evidence?.url) urls.add(evidence.url);
    }
  }

  return {
    labels: [...new Set(labels)],
    urls: [...urls]
  };
}

export const KOREA_SIGNAL_DEFINITIONS = SIGNALS.map(
  ({ id, label, dimension, weight }) => ({ id, label, dimension, weight })
);
