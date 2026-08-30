import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFile(path.join(root, file), 'utf8');

test('contact endpoint disables Hunter even when the Vercel key remains configured', async () => {
  const text = await source('api/find-contacts.js');
  assert.match(text, /const HUNTER_RUNTIME_DISABLED = true/);
  assert.match(text, /delete process\.env\.HUNTER_API_KEY/);
  assert.match(text, /hunterConfigured:false/);
});

test('general contact discovery never calls Hunter', async () => {
  const text = await source('lib/contact-discovery-v2.js');
  assert.match(text, /hunter:\s*false/);
  assert.doesNotMatch(text, /api\.hunter\.io/);
  assert.doesNotMatch(text, /hunterVerify/);
  assert.doesNotMatch(text, /hunterDomainContacts/);
});

test('company identity resolution has no Hunter dependency', async () => {
  const server = await source('lib/company-identity.js');
  const browser = await source('company-name-llm.js');
  assert.doesNotMatch(server, /hunter/i);
  assert.doesNotMatch(browser, /hunter/i);
});
