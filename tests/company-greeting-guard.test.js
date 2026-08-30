import test from 'node:test';
import assert from 'node:assert/strict';

await import('../company-greeting-guard.js');
const api = globalThis.KPA_COMPANY_NAMES;
const VERSION = '20260830-email-domain-identity-v5';

function verifiedLead(company = 'FORKOFF', domain = 'forkoff.xyz') {
  return {
    company: 'wrong scraped title',
    domain,
    company_identity: {
      identity_version: VERSION,
      status: 'verified',
      confidence: 0.97,
      greeting_name: company,
      brand_name: company,
      recipient_domain: domain
    }
  };
}

test('does not reconstruct a company name from a domain when scraped title is bad', () => {
  const lead = { company: 'ETHNYC 2026 Activations · FORKOFF', domain: 'forkoff.xyz' };
  assert.equal(api.canonicalCompanyName(lead), '');
  assert.equal(api.greetingForLead(lead), 'Hi there,');
  assert.equal(api.recoverMatchingCandidate(lead.company, lead.domain), '');
});

test('does not recover polluted company text from an email domain', () => {
  const lead = {
    company: 'CT GROUP team [ info@ctgroupvietnam.com ]',
    domain: 'ctgroupvietnam.com',
    contact: { email: 'info@ctgroupvietnam.com' }
  };
  assert.equal(api.canonicalCompanyName(lead), '');
  assert.equal(api.greetingForLead(lead), 'Hi there,');
});

test('verified v5 identity is the single source of company greeting', () => {
  const lead = verifiedLead('Hack VC', 'hack.vc');
  assert.equal(api.canonicalCompanyName(lead), 'Hack VC');
  assert.equal(api.greetingForLead(lead), 'Hi Hack VC team,');
});

test('handles common multi-label public suffixes', () => {
  assert.equal(api.registrableDomain('https://team.example.co.uk/path'), 'example.co.uk');
  assert.equal(api.registrableDomain('hello@brand.com.au'), 'brand.com.au');
  assert.equal(api.registrableDomain('https://www.sample.co.kr'), 'sample.co.kr');
});

test('rejects mailbox labels as personal names', () => {
  const lead = {
    company: 'Example',
    domain: 'example.com',
    contact: { name: 'Sales Team', first_name: 'Sales', email: 'sales@example.com' }
  };
  assert.equal(api.greetingForLead(lead, true), 'Hi Example team,');
});

test('uses a valid first name only when explicitly preferred', () => {
  const lead = {
    company: 'Example',
    domain: 'example.com',
    contact: { name: 'Alice Kim', first_name: 'Alice', email: 'alice@example.com' }
  };
  assert.equal(api.greetingForLead(lead, true), 'Hi Alice,');
  assert.equal(api.greetingForLead(lead, false), 'Hi Example team,');
});

test('falls back safely when neither verified identity nor clean company is usable', () => {
  assert.equal(api.greetingForLead({ company: '2026 Events List' }), 'Hi there,');
});

test('rewrites only the greeting line from verified identity', () => {
  const lead = verifiedLead('FORKOFF', 'forkoff.xyz');
  const body = 'Hi wrong scraped title team,\n\nShipping branded merch into Korea can be difficult.';
  assert.equal(
    api.rewriteEnglishGreeting(body, lead),
    'Hi FORKOFF team,\n\nShipping branded merch into Korea can be difficult.'
  );
});
