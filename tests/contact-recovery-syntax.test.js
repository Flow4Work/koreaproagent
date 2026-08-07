import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('contact API and discovery modules import successfully', async () => {
  const api = await import('../api/contact.js');
  const discovery = await import('../lib/contact-discovery-v2.js');
  const exhaustive = await import('../lib/contact-discovery-exhaustive.js');
  assert.equal(typeof api.POST, 'function');
  assert.equal(typeof discovery.findContacts, 'function');
  assert.equal(typeof exhaustive.findContacts, 'function');
});

test('browser recovery script has valid JavaScript syntax', async () => {
  const source = await readFile(new URL('sent-filter.js', root), 'utf8');
  assert.doesNotThrow(() => new Function(source));
});
