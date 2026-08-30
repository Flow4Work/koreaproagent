import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reviewHtml = path.join(root, 'mail-review.html');
const runtimePath = path.join(root, 'company-name-llm.js');
const guardPath = path.join(root, 'company-identity-mail-guard.js');
const greetingGuardPath = path.join(root, 'company-greeting-guard.js');

async function source(file) { return readFile(file, 'utf8'); }

test('mail review keeps identity naming but does not load either identity send blocker', async () => {
  const html = await source(reviewHtml);
  assert.match(html, /data-company-identity-runtime="1"[^>]+company-name-llm\.js\?v=20260830-mail-review-sendfix-v1/);
  assert.doesNotMatch(html, /company-identity-mail-guard\.js/);
  assert.ok(html.indexOf('company-name-llm.js?v=20260830-mail-review-sendfix-v1') < html.indexOf('mail-templates.js?v=20260830-company-identity-v4'));

  const runtime = await source(runtimePath);
  assert.match(runtime, /if \(\/mail-review\/i\.test\(location\.pathname\)\) return;\s*\n\s*const button = event\.target\?\.closest\?\.\('#sendAllBtn'\)/);
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
