import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reviewHtml = path.join(root, 'mail-review.html');
const guardPath = path.join(root, 'company-identity-mail-guard.js');

async function source(file) { return readFile(file, 'utf8'); }

test('mail review loads the identity runtime directly with a fresh cache key', async () => {
  const html = await source(reviewHtml);
  assert.match(html, /data-company-identity-runtime="1"[^>]+company-name-llm\.js\?v=20260830-company-identity-v2/);
  assert.match(html, /company-identity-mail-guard\.js\?v=20260830-company-identity-v1/);
});

test('unverified identities are auto-excluded from mail review', async () => {
  const text = await source(guardPath);
  assert.match(text, /draft\.identityAutoExcluded = true/);
  assert.match(text, /draft\.included = false/);
  assert.match(text, /contact_status = 'identity_needs_review'/);
});

test('verified long legal-style names can collapse to one domain-matching brand token', async () => {
  const text = await source(guardPath);
  assert.match(text, /function safeShortBrand/);
  assert.match(text, /matched\.length !== 1/);
  assert.match(text, /stem\.includes\(lower\)/);
  assert.match(text, /'plasticware'/);
});
