import test from 'node:test';
import assert from 'node:assert/strict';

await import('../company-greeting-guard.js');
const api = globalThis.KPA_COMPANY_NAMES;

test('uses the domain-matching company segment instead of an event title', () => {
  const lead = { company: 'ETHNYC 2026 Activations · FORKOFF', domain: 'forkoff.xyz' };
  assert.equal(api.canonicalCompanyName(lead), 'FORKOFF');
  assert.equal(api.greetingForLead(lead), 'Hi FORKOFF team,');
});

test('removes team and email pollution from a company name', () => {
  const lead = {
    company: 'CT GROUP team [ info@ctgroupvietnam.com ]',
    domain: 'ctgroupvietnam.com',
    contact: { email: 'info@ctgroupvietnam.com' }
  };
  assert.equal(api.canonicalCompanyName(lead), 'CT Group');
  assert.equal(api.greetingForLead(lead), 'Hi CT Group team,');
});

test('keeps an explicit manually verified company name', () => {
  const lead = {
    id: 'kbw-curated:hack.vc',
    company: 'Hack VC',
    domain: 'hack.vc',
    contact: { verifiedOverride: true, email: 'contact@hack.vc' }
  };
  assert.equal(api.canonicalCompanyName(lead), 'Hack VC');
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

test('falls back safely when neither company nor domain is usable', () => {
  assert.equal(api.greetingForLead({ company: '2026 Events List' }), 'Hi there,');
});

test('rewrites only the greeting line of saved drafts', () => {
  const lead = { company: 'ETHNYC 2026 Activations · FORKOFF', domain: 'forkoff.xyz' };
  const body = 'Hi ETHNYC 2026 Activations · FORKOFF team,\n\nShipping branded merch into Korea can be difficult.';
  assert.equal(
    api.rewriteEnglishGreeting(body, lead),
    'Hi FORKOFF team,\n\nShipping branded merch into Korea can be difficult.'
  );
});