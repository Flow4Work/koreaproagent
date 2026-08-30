import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJinaDirectory } from '../lib/kbeauty-jina-seeds.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFile(path.join(root, file), 'utf8');

test('K-Beauty seed collection unions paginated Jina-rendered and Tavily-backed current 2026 directories', async () => {
  const seeds = await source('lib/kbeauty-seeds-2026.js');
  const jina = await source('lib/kbeauty-jina-seeds.js');
  assert.match(seeds, /collectJinaOfficial2026Seeds/);
  assert.match(seeds, /const \[jinaSeeds, intercharmHtml, extracted, inCosmeticsSearch\] = await Promise\.all/);
  assert.match(seeds, /INTERCHARM_MODERN/);
  assert.match(seeds, /INCOSMETICS_2026/);
  assert.match(seeds, /TAVILY_EXTRACT_URL/);
  assert.match(seeds, /TAVILY_CRAWL_URL/);
  assert.doesNotMatch(seeds, /exhi_list02\.asp/);
  assert.match(jina, /JINA_READER_URL = 'https:\/\/r\.jina\.ai\/'/);
  assert.match(jina, /INTERCHARM_PAGE_COUNT = 28/);
  assert.match(jina, /process\.env\.JINA_API_KEY/);
  assert.match(jina, /function pagedSources\(\)/);
  assert.match(jina, /mapLimit\(pagedSources\(\),12/);
});

test('Jina rendered directory parser extracts exhibitor cards but not directory UI labels', () => {
  const markdown = `
InterCHARM Korea
July 1 - 3, 2026
524 Exhibitors
Filters
TINDA
Professional beauty manufacturer
Stand A-K32
Website
Email
TUBEST CO., LTD.
Cosmetic packaging company
Stand A-H46
Website
`;
  const rows = parseJinaDirectory(markdown, {
    url:'https://www.intercharmkorea.com/en-us/Exhibitor_directory.html',
    event:'InterCHARM Korea 2026',
    score:94,
    marker:/July\s+1\s*-\s*3,?\s*2026/i
  });
  assert.deepEqual(rows.map(row => row.company), ['TINDA','TUBEST CO., LTD.']);
  assert.ok(rows.every(row => row.seed_provider === 'jina_reader'));
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

test('Jina seed refresh does not take ownership of the K-Beauty hunt button', async () => {
  const feeder = await source('kbeauty-seed-feeder.js');
  const controller = await source('campaign-run-controller.js');
  const huntUi = await source('hunt-ui.js');
  assert.match(feeder, /kpa\.kbeauty\.seed2026\.union-v4-jina\.meta/);
  assert.match(huntUi, /kbeauty-seed-feeder\.js\?v=20260831-seed-union-v4-jina/);
  assert.doesNotMatch(feeder, /textContent\s*=\s*['"](?:후보 찾기|진정시키기|자동사냥)/);
  assert.match(controller, /id==='kbeauty'\?'진정시키기'/);
  assert.match(controller, /if\(id==='kbeauty'\)\{b\.textContent='후보 찾기'/);
});
