import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFile(path.join(root, file), 'utf8');

test('mail review restores every company to included unless the user explicitly excluded it', async () => {
  const text = await source('mail-review-selection-contract.js');
  assert.match(text, /USER_SELECTION_KEY/);
  assert.match(text, /hasOwn\(userSelection, id\) \? userSelection\[id\] !== false : true/);
  assert.match(text, /delete draft\.identityAutoExcluded/);
});

test('mail review records only explicit user include or exclude actions', async () => {
  const text = await source('mail-review-selection-contract.js');
  assert.match(text, /input\[data-action="include"\]/);
  assert.match(text, /rememberSelection/);
  assert.match(text, /rememberRenderedCard/);
});

test('company identity validation cannot intercept the mail review send button', async () => {
  const text = await source('mail-review-selection-contract.js');
  assert.match(text, /button\.id = 'sendAllBtnMailReview'/);
  assert.match(text, /bypassButton\.id = 'sendAllBtn'/);
});

test('selection contract loads after identity guards and before mail review runtime', async () => {
  const html = await source('mail-review.html');
  const contract = html.indexOf('mail-review-selection-contract.js?v=20260830-user-selection-only-v1');
  assert.ok(contract > html.indexOf('company-identity-mail-guard.js?v=20260830-company-identity-v4'));
  assert.ok(contract < html.indexOf('mail-review.js?v=20260830-selection-restore-v1'));
});
