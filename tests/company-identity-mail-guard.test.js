import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reviewHtml = path.join(root, 'mail-review.html');
const templatesPath = path.join(root, 'mail-templates.js');
const guardPath = path.join(root, 'company-identity-mail-guard.js');
const greetingGuardPath = path.join(root, 'company-greeting-guard.js');

async function source(file) { return readFile(file, 'utf8'); }

test('mail review uses stored identity data without loading the background identity runtime', async () => {
  const html = await source(reviewHtml);
  assert.doesNotMatch(html, /company-name-llm\.js/);
  assert.doesNotMatch(html, /company-identity-mail-guard\.js/);
  assert.match(html, /company-greeting-guard\.js/);

  const templates = await source(templatesPath);
  assert.ok(templates.includes("const isMailReview = /\\/mail-review(?:\\/|$)/i.test(location.pathname);"));
  assert.ok(templates.includes("if (!isMailReview && !document.querySelector('script[data-company-identity-runtime]'))"));
});

test('identity validation never silently unchecks mail review companies', async () => {
  const text = await source(guardPath);
  assert.match(text, /restoreLegacyAutoExclusion/);
  assert.match(text, /draft\.included = true/);
  assert.doesNotMatch(text, /draft\.included = false/);
  assert.doesNotMatch(text, /identityAutoExcluded\s*=\s*true/);
  assert.match(text, /contact_candidates/);
});

test('same-domain qualified or evidenced contacts do not disappear from sendability', async () => {
  const text = await source(guardPath);
  assert.match(text, /contact\?\.qualified === true/);
  assert.match(text, /hasEvidence/);
  assert.match(text, /providerList\.includes\('hunter'\)/);
});

test('mail guard uses only server-verified greeting name and never domain-stem guessing', async () => {
  const text = await source(guardPath);
  assert.match(text, /company_identity\?\.greeting_name/);
  assert.doesNotMatch(text, /safeShortBrand/);
  assert.doesNotMatch(text, /domainStem/);
});

test('legacy greeting compatibility does not override any existing identity record', async () => {
  const text = await source(greetingGuardPath);
  assert.match(text, /Once an identity record exists/);
  assert.match(text, /identityRecord\(lead\) && !identityCurrentVerified\(lead\)/);
});
