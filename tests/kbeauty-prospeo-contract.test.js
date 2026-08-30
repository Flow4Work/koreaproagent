import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = name => readFile(path.join(root, name), 'utf8');

test('Prospeo recovery uses Free-compatible verified-person flow', async () => {
  const code = await source('lib/kbeauty-prospeo-recovery.js');
  assert.match(code, /https:\/\/api\.prospeo\.io\/search-person/);
  assert.match(code, /https:\/\/api\.prospeo\.io\/enrich-person/);
  assert.doesNotMatch(code, /bulk-enrich-person/);
  assert.match(code, /process\.env\.PROSPEO_API_KEY/);
  assert.match(code, /'X-KEY':key/);
  assert.match(code, /only_verified_email:true/);
  assert.match(code, /if \(!sameDomain\(email, expectedDomain\)\) return null/);
});

test('K-Beauty contact API runs Prospeo only as recovery after existing paths', async () => {
  const code = await source('api/find-contacts.js');
  const nvidia = code.indexOf('recoverKBeautyContactRows');
  const prospeo = code.indexOf('recoverKBeautyContactsWithProspeo(recoveredResults)');
  assert.ok(nvidia >= 0 && prospeo > nvidia);
  assert.match(code, /prospeoConfigured:prospeoConfigured\(\)/);
});
