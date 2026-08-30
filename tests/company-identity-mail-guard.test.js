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
const runtimePath = path.join(root, 'company-name-llm.js');

async function source(file) { return readFile(file, 'utf8'); }

test('mail review uses stored identity data without loading background identity runtime', async () => {
  const html = await source(reviewHtml);
  assert.doesNotMatch(html, /company-name-llm\.js/);
  assert.doesNotMatch(html, /company-identity-mail-guard\.js/);
  assert.match(html, /company-greeting-guard\.js/);

  const templates = await source(templatesPath);
  assert.ok(templates.includes("const isMailReview = /\\/mail-review(?:\\/|$)/i.test(location.pathname);"));
  assert.ok(templates.includes("if (!isMailReview && !document.querySelector('script[data-company-identity-runtime]'))"));
});

test('legacy mail guard is a non-mutating v5 compatibility shim', async () => {
  const text = await source(guardPath);
  assert.match(text, /20260830-email-domain-identity-v5/);
  assert.match(text, /recipient_domain/);
  assert.match(text, /KPA_STRICT_SENDABLE_CONTACT/);
  assert.doesNotMatch(text, /localStorage/);
  assert.doesNotMatch(text, /addEventListener/);
  assert.doesNotMatch(text, /hunter/i);
  assert.doesNotMatch(text, /trustedCrossDomain/);
});

test('browser runtime allows only recipient-domain or exact official-site emails', async () => {
  const text = await source(runtimePath);
  assert.match(text, /officialEmailSet/);
  assert.match(text, /rootDomain\(identity\.recipient_domain\)/);
  assert.match(text, /anchor === emailDomain/);
  assert.doesNotMatch(text, /trustedCrossDomain/);
  assert.doesNotMatch(text, /providerList\.includes\('hunter'\)/);
});

test('greeting guard never infers canonical company from domain stem', async () => {
  const text = await source(greetingGuardPath);
  assert.match(text, /recoverMatchingCandidate\(\)\s*\{\s*return ''/s);
  assert.match(text, /identityCurrentVerified/);
  assert.doesNotMatch(text, /recoverMatchingCandidate\(lead\.company/);
});
