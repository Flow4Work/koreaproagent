import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'api');
const vercelPath = path.join(root, 'vercel.json');
const HOBBY_FUNCTION_LIMIT = 12;

async function apiFunctions() {
  return (await readdir(apiDir, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => entry.name)
    .sort();
}

test('Vercel Hobby serverless function budget stays within limit', async () => {
  const functions = await apiFunctions();
  assert.ok(
    functions.length <= HOBBY_FUNCTION_LIMIT,
    `api/ contains ${functions.length} JS functions (${functions.join(', ')}), exceeding the Hobby limit of ${HOBBY_FUNCTION_LIMIT}`
  );
});

test('legacy discovery aliases are rewrites, not extra serverless functions', async () => {
  const functions = await apiFunctions();
  assert.equal(functions.includes('discover-clients.js'), false);
  assert.equal(functions.includes('discover-v2.js'), false);

  const config = JSON.parse(await readFile(vercelPath, 'utf8'));
  const rewrites = new Map((config.rewrites || []).map(item => [item.source, item.destination]));
  assert.equal(rewrites.get('/api/discover-clients'), '/api/discover');
  assert.equal(rewrites.get('/api/discover-v2'), '/api/discover');
});
