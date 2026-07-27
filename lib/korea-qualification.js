// lib/korea-qualification.js
// Hard qualification rules are separated from scoring so an LLM cannot override them.

import {
  detectEstablishedKoreaPresence,
  extractKoreaSignals,
  summarizeSignalEvidence
} from './korea-signals.js';
import { calculateKoreaScore } from './korea-score.js';

const DEFAULT_MATURE_COMPANIES = [
  'airwallex', 'anthropic', 'atlassian', 'aws', 'canva', 'cohere', 'fiverr',
  'google', 'hubspot', 'intercom', 'microsoft', 'notion', 'openai', 'oracle',
  'salesforce', 'shopify', 'slack', 'stripe', 'zoom', 'adobe', 'amazon'
];

function token(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function safeUrl(value = '') {
  try {
    const u = new URL(String(value));
    return ['http:', 'https:'].includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}

export function isMatureCompany(company = '', extraBlocked = []) {
  const companyToken = token(company);
  if (!companyToken) return false;

  const blocklist = [...DEFAULT_MATURE_COMPANIES, ...(Array.isArray(extraBlocked) ? extraBlocked : [])];

  return blocklist.some((name) => {
    const blocked = token(name);
    return blocked && (companyToken === blocked || companyToken.startsWith(blocked));
  });
}

export function qualifyKoreaCandidate({
  company = '',
  officialUrl = '',
  evidenceRows = [],
  contacts = [],
  recommendedRole = '',
  extraMatureCompanies = []
} = {}) {
  const exclusions = [];
  const cautions = [];

  const normalizedOfficialUrl = safeUrl(officialUrl);
  if (!String(company).trim()) exclusions.push('missing_company');
  if (!normalizedOfficialUrl) exclusions.push('missing_official_url');

  const matureCompany = isMatureCompany(company, extraMatureCompanies);
  if (matureCompany) exclusions.push('mature_global_company');

  const koreaPresence = detectEstablishedKoreaPresence(evidenceRows);
  if (koreaPresence.established) exclusions.push('established_korea_presence');

  const signals = extractKoreaSignals(evidenceRows);
  const signalEvidence = summarizeSignalEvidence(signals);

  if (signalEvidence.urls.length === 0) exclusions.push('no_company_specific_signal_evidence');
  if (signalEvidence.urls.length === 1) cautions.push('single_source_evidence');
  if (!Array.isArray(contacts) || contacts.length === 0) cautions.push('no_contact_data');

  const koreaScore = calculateKoreaScore({
    signals,
    contacts,
    recommendedRole,
    establishedKoreaPresence: koreaPresence.established,
    matureCompany,
    evidenceUrls: signalEvidence.urls,
    officialUrl: normalizedOfficialUrl
  });

  return {
    eligible: exclusions.length === 0,
    company: String(company).trim(),
    officialUrl: normalizedOfficialUrl,
    exclusions,
    cautions,
    koreaPresence,
    signals,
    signalSummary: {
      labels: signalEvidence.labels,
      sourceUrls: signalEvidence.urls
    },
    koreaScore
  };
}

export function selectTopKoreaCandidates(candidates = [], limit = 3) {
  return [...candidates]
    .filter((candidate) => candidate?.qualification?.eligible)
    .sort((a, b) => {
      const aScore = Number(a?.qualification?.koreaScore?.overall ?? 0);
      const bScore = Number(b?.qualification?.koreaScore?.overall ?? 0);
      return bScore - aScore;
    })
    .slice(0, Math.max(1, Number(limit) || 3));
}

export { DEFAULT_MATURE_COMPANIES };
