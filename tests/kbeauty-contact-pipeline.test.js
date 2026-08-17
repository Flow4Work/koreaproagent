import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fastPath = path.join(root, 'lib', 'kbeauty-fast-contact.js');
const runtimePath = path.join(root, 'kbeauty-runtime-fix.js');

async function source(file) { return readFile(file, 'utf8'); }

test('K-Beauty contact runtime sends small sequential batches', async () => {
  const text = await source(runtimePath);
  assert.match(text, /const batches=chunk\(candidates,5\)/);
  assert.match(text, /for\(let index=0;index<batches\.length;index\+=1\)/);
  assert.match(text, /await post\('\/api\/find-contacts'/);
});

test('Hunter resolves company and emails with Domain Search directly', async () => {
  const text = await source(fastPath);
  assert.doesNotMatch(text, /domain-finder/);
  assert.match(text, /new URLSearchParams\(\{company:clean\(company,180\),limit:'10',api_key:key\}\)/);
  assert.match(text, /resolvedBy='hunter_company_search'/);
});

test('Tavily email fallback uses Search then Extract', async () => {
  const text = await source(fastPath);
  assert.match(text, /TAVILY_EXTRACT_URL = 'https:\/\/api\.tavily\.com\/extract'/);
  assert.match(text, /stage:'email_search'/);
  assert.match(text, /stage:'email_extract'/);
  assert.match(text, /raw_content/);
});

test('provider HTTP and timeout failures remain observable', async () => {
  const text = await source(fastPath);
  assert.match(text, /status:response\.status/);
  assert.match(text, /error\?\.name === 'AbortError' \? 'timeout' : 'network_error'/);
  assert.match(text, /diagnostics/);
});
