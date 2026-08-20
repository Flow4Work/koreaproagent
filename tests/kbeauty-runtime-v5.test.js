import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source = file => readFile(path.join(root,file),'utf8');

test('hidden KBW fresh batches no longer overwrite global K-Beauty status', async () => {
  const text = await source('trusted-contact-email.js');
  assert.doesNotMatch(text,/setTimeout\(loadFresh20/);
  assert.doesNotMatch(text,/kbw-fresh-20-20260812\.js/);
  assert.match(text,/kbeauty-runtime-v5\.js/);
});

test('K-Beauty v5 is the single active owner after campaign controller initialization', async () => {
  const text = await source('kbeauty-runtime-v5.js');
  assert.match(text,/__KPA_KBEAUTY_RUNTIME_V4__ = true/);
  assert.match(text,/__KPA_CAMPAIGN_RUN_CONTROLLER__/);
  assert.match(text,/runHuntCycle = owner/);
  assert.match(text,/if \(state\.currentCampaign !== 'kbeauty'\) return previousRun\(\)/);
});

test('K-Beauty v5 separates bounded domain resolution from per-company contact discovery', async () => {
  const runtime = await source('kbeauty-runtime-v5.js');
  const api = await source('api/find-contacts.js');
  assert.match(runtime,/action:'kbeauty_domains'/);
  assert.match(runtime,/post\('\/api\/contact'/);
  assert.match(runtime,/chunk\(candidates,6\)/);
  assert.match(runtime,/items:\[\{id:current\.id/);
  assert.match(api,/body\.action === 'kbeauty_domains'/);
  assert.match(api,/pipeline:'kbeauty-domain-v5'/);
});

test('domain resolver runs providers in parallel and keeps the IMS known-domain fast path', async () => {
  const text = await source('lib/kbeauty-domain-resolver-v5.js');
  assert.match(text,/\['ims packaging','imspackaging\.com'\]/);
  assert.match(text,/Promise\.all\(\[/);
  assert.match(text,/hunterResolve\(company\)/);
  assert.match(text,/exaResolve\(company,country,exaKey\)/);
  assert.match(text,/tavilyResolve\(company,country\)/);
  assert.match(text,/slice\(0,12\)/);
});

test('one hard company cannot erase successful contacts from the rest of a K-Beauty batch', async () => {
  const text = await source('kbeauty-runtime-v5.js');
  assert.match(text,/await mapLimit\(candidates,4,async lead/);
  assert.match(text,/post\('\/api\/contact',[\s\S]*?36000\)/);
  assert.doesNotMatch(text,/items:candidates\.map\([\s\S]*?action:'kbeauty_fast'/);
});
