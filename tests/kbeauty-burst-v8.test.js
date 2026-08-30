import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIntercharmList } from '../lib/kbeauty-seeds-2026.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = name => readFile(path.join(root, name), 'utf8');

test('InterCHARM seed parser extracts the company heading when the profile anchor only says View Profile', () => {
  const html = `
    <a href="/eng/exhibitor/exhi_detail04.asp?idx=1">View Profile</a>
    <h3>AG Organica</h3><p>Skin Care</p>
    <a href="/eng/exhibitor/exhi_detail04.asp?idx=2">View Profile</a>
    <h3>Daxal Cosmetics Pvt Ltd</h3><p>Skin Care</p>`;
  const rows = parseIntercharmList(html);
  assert.deepEqual(rows.map(row => row.company), ['AG Organica', 'Daxal Cosmetics Pvt Ltd']);
  assert.match(rows[0].source_url, /exhi_detail04\.asp\?idx=1/);
});

test('K-Beauty domain resolution checks the official exhibitor profile before paid/search fallbacks', async () => {
  const resolver = await source('lib/kbeauty-domain-resolver-v5.js');
  assert.match(resolver, /officialProfileResolve/);
  assert.match(resolver, /if \(profile\.domain\) return \{id,company,domain:profile\.domain/);
  assert.match(resolver, /const \[exa,tavily\] = await Promise\.all/);
  assert.ok(resolver.indexOf('const profile = await officialProfileResolve(item)') < resolver.indexOf('const [exa,tavily] = await Promise.all'));
});

test('campaign controller forwards queue source evidence without changing the K-Beauty button contract', async () => {
  const controller = await source('campaign-run-controller.js');
  assert.match(controller, /KBEAUTY_QUEUE_KEY\s*=\s*'kpa\.kbeauty\.v6\.queue'/);
  assert.match(controller, /source_url:item\?\.source_url\|\|source\?\.source_url\|\|''/);
  assert.match(controller, /domain:item\?\.domain\|\|source\?\.domain\|\|''/);
  assert.match(controller, /id==='kbeauty'\?'진정시키기'/);
  assert.match(controller, /if\(id==='kbeauty'\)\{b\.textContent='후보 찾기'/);
  assert.match(controller, /count\(id\)<KBEAUTY_MIN\?1200:2500/);
});

test('hunt UI cache-busts the updated controller', async () => {
  const ui = await source('hunt-ui.js');
  assert.match(ui, /campaign-run-controller\.js\?v=20260830-kbeauty-throughput-v8/);
});
