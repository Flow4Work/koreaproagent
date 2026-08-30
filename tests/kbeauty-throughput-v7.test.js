import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = name => readFile(path.join(root, name), 'utf8');

test('K-Beauty drains the verified seed backlog before spending on new discovery', async () => {
  const runtime = await source('kbeauty-runtime-v5.js');
  assert.match(runtime, /DOMAIN_PER_RUN\s*=\s*18/);
  assert.match(runtime, /CONTACT_PER_RUN\s*=\s*18/);
  assert.match(runtime, /DISCOVERY_QUEUE_FLOOR\s*=\s*80/);
  assert.match(runtime, /if\(c\.queue>=DISCOVERY_QUEUE_FLOOR\) return \{added:0,lane:'queue_backlog'\}/);
});

test('domain resolution spends search capacity on Exa and Tavily before Hunter fallback', async () => {
  const resolver = await source('lib/kbeauty-domain-resolver-v5.js');
  assert.match(resolver, /slice\(0,18\)/);
  assert.match(resolver, /const \[exa,tavily\] = await Promise\.all/);
  assert.match(resolver, /if \(!picked\[1\]\) \{\s*\n\s*hunter = await hunterResolve\(company\)/);
  assert.doesNotMatch(resolver, /Promise\.all\(\[\s*\n\s*hunterResolve\(company\)/);
  assert.match(resolver, /exaKey \|\| process\.env\.EXA_API_KEY/);
});

test('exhausted Hunter stops being retried while official web and Tavily remain active', async () => {
  const contact = await source('lib/kbeauty-fast-contact-v4.js');
  assert.match(contact, /hunterDisabledUntil/);
  assert.match(contact, /disableHunterIfLimited/);
  assert.match(contact, /credit_limited/);
  assert.match(contact, /const key=clean\(exaKey \|\| process\.env\.EXA_API_KEY/);
  assert.match(contact, /siteContacts\(domain,company\)/);
  assert.match(contact, /tavilySiteEmailSearch\(company,domain,country\)/);
});

test('modified K-Beauty runtime is cache-busted without changing the hunt button contract', async () => {
  const ui = await source('hunt-ui.js');
  const controller = await source('campaign-run-controller.js');
  assert.match(ui, /kbeauty-runtime-v5\.js\?v=20260830-backlog-throughput-v7/);
  assert.match(controller, /id==='kbeauty'\?'진정시키기'/);
  assert.match(controller, /if\(id==='kbeauty'\)\{b\.textContent='후보 찾기'/);
});
