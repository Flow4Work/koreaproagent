import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFile(path.join(root, file), 'utf8');

test('K-Beauty seed collection uses current 2026 official directories, not the stale legacy bulk list', async () => {
  const seeds = await source('lib/kbeauty-seeds-2026.js');
  assert.match(seeds, /INTERCHARM_MODERN/);
  assert.match(seeds, /INCOSMETICS_2026/);
  assert.match(seeds, /TAVILY_EXTRACT_URL/);
  assert.match(seeds, /TAVILY_CRAWL_URL/);
  assert.match(seeds, /extract_depth:'advanced'/);
  assert.match(seeds, /parseMarkdownOfficialDirectory/);
  assert.doesNotMatch(seeds, /exhi_list02\.asp/);
});

test('broad domain providers contribute in parallel and expose all candidate domains', async () => {
  const resolver = await source('lib/kbeauty-domain-resolver-v5.js');
  assert.match(resolver, /const \[profile,exa,tavily\] = await Promise\.all\(/);
  assert.match(resolver, /officialProfileResolve\(item\)/);
  assert.match(resolver, /exaResolve\(company,country,exaKey\)/);
  assert.match(resolver, /tavilyResolve\(company,country\)/);
  assert.match(resolver, /domain_candidates:candidates/);
  assert.match(resolver, /Hunter is deliberately scarce-credit recovery/);
});

test('email discovery unions broad providers and runs NVIDIA plus Prospeo recovery in parallel', async () => {
  const api = await source('api/find-contacts.js');
  const additive = await source('lib/kbeauty-additive-contact.js');
  assert.match(api, /const \[baseResults, additiveResults\] = await Promise\.all/);
  assert.match(api, /mergeKBeautyContactRows\(baseResults, additiveResults\)/);
  assert.match(api, /const \[nvidiaResults, prospeoResults\] = await Promise\.all/);
  assert.match(api, /kbeauty-email-additive-union\+nvidia\+prospeo-parallel-recovery/);
  assert.match(additive, /Promise\.all\(\[exaContacts\(item,exaKey\),tavilyContacts\(item\)\]\)/);
});

test('current 2026 seed feed refreshes without taking ownership of the K-Beauty hunt button', async () => {
  const feeder = await source('kbeauty-seed-feeder.js');
  const controller = await source('campaign-run-controller.js');
  assert.match(feeder, /kpa\.kbeauty\.seed2026\.union-v3\.meta/);
  assert.doesNotMatch(feeder, /textContent\s*=\s*['"](?:후보 찾기|진정시키기|자동사냥)/);
  assert.match(controller, /id==='kbeauty'\?'진정시키기'/);
  assert.match(controller, /if\(id==='kbeauty'\)\{b\.textContent='후보 찾기'/);
});
