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
});

test('actual page entrypoints load only K-Beauty v5 and never the legacy v4 runtime', async () => {
  const index = await source('index.html');
  const ui = await source('hunt-ui.js');
  assert.match(index,/hunt-ui\.js\?v=20260821-kbeauty-v5-2/);
  assert.doesNotMatch(index,/kbeauty-runtime-fix\.js/);
  assert.match(index,/kpa\.kbeauty\.runtime-v5\.2-bootstrap/);
  assert.match(ui,/kbeauty-runtime-v5\.js\?v=20260821-single-owner-v5-2/);
  assert.match(ui,/data-kbeauty-runtime-v5/);
  assert.doesNotMatch(ui,/kbeauty-runtime-fix\.js/);
});

test('K-Beauty v5 is the single active owner after campaign controller initialization', async () => {
  const text = await source('kbeauty-runtime-v5.js');
  assert.match(text,/__KPA_KBEAUTY_RUNTIME_V4__ = true/);
  assert.match(text,/__KPA_CAMPAIGN_RUN_CONTROLLER__/);
  assert.match(text,/runHuntCycle = owner/);
  assert.match(text,/if \(state\.currentCampaign !== 'kbeauty'\) return previousRun\(\)/);
  assert.match(text,/runtime-v5\.2-reset/);
});

test('K-Beauty v5 separates bounded domain resolution from isolated per-company full contact recovery', async () => {
  const runtime = await source('kbeauty-runtime-v5.js');
  const api = await source('api/find-contacts.js');
  assert.match(runtime,/action:'kbeauty_domains'/);
  assert.match(runtime,/action:'kbeauty_fast'/);
  assert.match(runtime,/items:\[\{/);
  assert.match(runtime,/await mapLimit\(candidates,3,async lead/);
  assert.match(runtime,/76000/);
  assert.doesNotMatch(runtime,/post\('\/api\/contact'/);
  assert.match(api,/body\.action === 'kbeauty_domains'/);
  assert.match(api,/pipeline:'kbeauty-domain-v5'/);
  assert.match(api,/body\.action === 'kbeauty_fast'/);
  assert.match(api,/recoverKBeautyContactRows/);
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

test('known domains prioritize IMS then run official/Tavily/NVIDIA recovery independently', async () => {
  const runtime = await source('kbeauty-runtime-v5.js');
  assert.match(runtime,/PRIORITY_DOMAINS = \[\s*'imspackaging\.com'/);
  assert.match(runtime,/items:\[\{[\s\S]*?company:current\.company/);
  assert.match(runtime,/공식\/검색 근거에서 실제 회사 이메일 미확보/);
  assert.doesNotMatch(runtime,/MAX_DEEP_ATTEMPTS/);
  assert.doesNotMatch(runtime,/deepFallback/);
});
