import {
  clearContactCache,
  contactDiscoveryAvailable,
  contactProvidersConfigured,
  findContactsWaterfall
} from './contact-waterfall.js';

export function hunterConfigured() {
  // Backwards-compatible name: the sales pipeline now has a public-web-first
  // contact waterfall, so contact discovery is available even without Hunter.
  return contactDiscoveryAvailable();
}

export function hunterKeyConfigured() {
  return Boolean(process.env.HUNTER_API_KEY);
}

export function contactProviderStatus() {
  return contactProvidersConfigured();
}

export function clearDomainCache() {
  clearContactCache();
}

export async function findContacts(domain, options = {}) {
  return findContactsWaterfall(domain, options);
}

function contactStatus(contact = {}) {
  const raw = String(contact?.verification?.status || contact?.emailStatus || contact?.confidence || '').toLowerCase();
  if (['verified', 'valid', 'deliverable'].includes(raw)) return 'valid';
  if (raw.includes('accept')) return 'accept_all';
  return 'unknown';
}

export function scoreContact(contact = {}) {
  let score = Number(contact.provider_score) || 0;
  const status = contactStatus(contact);
  if (status === 'valid') score += 30;
  else if (status === 'accept_all') score += 15;
  else score += 5;

  if (contact.seniority === 'executive') score += 25;
  else if (contact.seniority === 'senior') score += 15;

  const department = String(contact.department || '').toLowerCase();
  const deptMap = { executive: 20, sales: 15, marketing: 10, management: 10, operations: 5 };
  score += deptMap[department] || 0;

  if (contact.type === 'personal') score += 20;
  else if (contact.type === 'generic') score += 5;
  else score += 10;

  if (contact.decision_maker || contact.decisionMaker) score += 15;
  if (contact.linkedin_url || contact.linkedinUrl) score += 5;
  return score;
}

function normalizeSources(contact = {}) {
  const rows = Array.isArray(contact.sources) ? contact.sources : [];
  const sources = rows.map(source => {
    if (typeof source === 'string') return source;
    return source?.uri || source?.url || source?.domain || '';
  }).filter(Boolean);
  if (sources.length) return [...new Set(sources)].slice(0, 5);
  if (contact.provider) return [String(contact.provider)];
  return [];
}

export function normalizeContacts(rawEmails = [], recommendedRole = '') {
  if (!Array.isArray(rawEmails)) return [];
  const role = String(recommendedRole).toLowerCase().trim();
  const scored = rawEmails.map(contact => {
    const title = String(contact.title || contact.position || '').toLowerCase();
    let matchBonus = 0;
    if (role && title.includes(role)) matchBonus += 30;
    else if (/(founder|ceo|chief executive|vp|vice president|head of|country manager|business development|partnership|growth|sales)/i.test(title)) matchBonus += 15;

    const name = String(contact.first_name || '').trim()
      ? `${String(contact.first_name || '').trim()} ${String(contact.last_name || '').trim()}`.trim()
      : String(contact.full_name || contact.name || '').trim();

    return {
      name,
      title: String(contact.title || contact.position || '').slice(0, 200),
      email: String(contact.email || '').slice(0, 200),
      emailStatus: contactStatus(contact),
      seniority: contact.seniority || '',
      department: contact.department || '',
      linkedinUrl: contact.linkedin_url || contact.linkedinUrl || contact.linkedin || '',
      decisionMaker: Boolean(contact.decision_maker || contact.decisionMaker),
      sources: normalizeSources(contact),
      provider: contact.provider || '',
      score: scoreContact(contact) + matchBonus
    };
  }).filter(contact => contact.email || contact.linkedinUrl || contact.name);

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
