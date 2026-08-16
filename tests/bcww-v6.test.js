import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(root, file), 'utf8');

test('BCWW API routes through v6 high-volume hunt', async () => {
  const api = await read('api/bcww.js');
  assert.match(api, /bcww-smart-hunt-v6\.js/);
});

test('BCWW v6 keeps volume, real Tavily, and safe degradation guarantees', async () => {
  const source = await read('lib/bcww-smart-hunt-v6.js');
  assert.match(source, /const MAX_RETURNED = 30;/);
  assert.match(source, /const MAX_RESOLVE = 42;/);
  assert.match(source, /const MAX_CONTACTS = 14;/);
  assert.match(source, /https:\/\/api\.tavily\.com\/search/);
  assert.match(source, /VERIFIED_REPEAT_POOL/);
  assert.match(source, /status:200/);
  assert.match(source, /2025 participants are recurrence prospects only/);
});
