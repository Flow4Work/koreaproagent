import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reviewHtml = path.join(root, 'mail-review.html');
const guardPath = path.join(root, 'company-identity-mail-guard.js');
const greetingGuardPath = path.join(root, 'company-greeting-guard.js');

async function source(file) { return readFile(file, 'utf8'); }

test('mail review loads identity v3 directly before template bootstrap', async () => {
  const html = await source(reviewHtml);
  assert.match(html, /data-company-identity-runtime="1"[^>]+company-name-llm\.js\?v=20260830-company-identity-v3/);
  assert.match(html, /company-identity-mail-guard\.js\?v=20260830-company-identity-v3/);
  assert.ok(html.indexOf('company-name-llm.js?v=20260830-company-identity-v3') < html.indexOf('mail-templates.js?v=20260830-company-identity-v3'));
});

test('unverified identities are auto-excluded only from sending', async () => {
  const text = await source(guardPath);
  assert.match(text, /draft\.identityAutoExcluded = true/);
  assert.match(text, /draft\.included = false/);
  assert.match(text, /contact_candidates/);
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
  assert.match(text, /identityRecord\(lead\) && !identityV3Verified\(lead\)/);
});
