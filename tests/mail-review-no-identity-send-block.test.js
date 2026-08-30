import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const guard = await readFile(new URL('../company-identity-mail-guard.js', import.meta.url), 'utf8');

test('company identity guard never intercepts the mail-review send button', () => {
  assert.doesNotMatch(guard, /closest\?\.\('#sendAllBtn'\)/);
  assert.doesNotMatch(guard, /stopImmediatePropagation\(\)/);
  assert.doesNotMatch(guard, /발송 중지:/);
});
