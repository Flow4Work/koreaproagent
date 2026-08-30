import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function source(name) {
  return readFile(path.join(root, name), 'utf8');
}

test('K-Beauty button contract stays 후보 찾기 -> 진정시키기', async () => {
  const controller = await source('campaign-run-controller.js');
  assert.match(controller, /id==='kbeauty'\?'진정시키기'/);
  assert.match(controller, /if\(id==='kbeauty'\)\{b\.textContent='후보 찾기'/);
  assert.match(controller, /if\(id==='kbeauty'\) return void auto\(id\)/);
  assert.match(controller, /return stop\(id,id==='kbeauty'/);
});

test('2026 seed feeder never owns or rewrites the hunt button', async () => {
  const feeder = await source('kbeauty-seed-feeder.js');
  assert.doesNotMatch(feeder, /getElementById\(['"]runBtn['"]\)/);
  assert.doesNotMatch(feeder, /textContent\s*=\s*['"](?:자동사냥|진정시키기|후보 찾기)['"]/);
  assert.match(feeder, /state\.auto === true && state\.autoCampaign === 'kbeauty'/);
  assert.match(feeder, /activeController\?\.abort\(\)/);
});
