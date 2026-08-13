import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const hunt = fs.readFileSync(new URL('../hunt-ui.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../lib/bcww-hybrid-v4.js', import.meta.url), 'utf8');

test('BCWW initial view requests hardcoded seeds automatically', () => {
  assert.ok(hunt.includes("post('/api/bcww', { staticOnly:true"));
  assert.ok(hunt.includes("sales.addEventListener('load', loadStaticBcww"));
  assert.ok(hunt.includes('mergeStaticBcww(result?.leads || [])'));
});

test('BCWW backend must short-circuit staticOnly before dynamic discovery', () => {
  const staticGate = api.indexOf('body?.staticOnly===true');
  const dynamicSearch = api.indexOf('basePost(request)');
  assert.ok(staticGate >= 0, 'staticOnly fast path missing');
  assert.ok(dynamicSearch >= 0, 'dynamic BCWW path missing');
  assert.ok(staticGate < dynamicSearch, 'static hardcoded seeds must return before dynamic web discovery');
});
