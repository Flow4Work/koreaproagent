import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function source(file) {
  return readFile(path.join(root, file), 'utf8');
}

function localScriptSources(html) {
  return [...html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/gi)]
    .map(match => match[1])
    .filter(src => src.startsWith('/'))
    .map(src => src.replace(/^\//, '').split('?')[0]);
}

test('mail review is a stable send workspace with no background identity runtime', async () => {
  const html = await source('mail-review.html');
  const scripts = localScriptSources(html);

  assert.ok(scripts.includes('mail-review.js'), 'mail-review.js must remain loaded');
  assert.ok(scripts.includes('company-greeting-guard.js'), 'stored canonical greetings must remain available');
  assert.ok(!scripts.includes('company-name-llm.js'), 'mail-review must not run background identity resolution');
  assert.ok(!scripts.includes('company-identity-mail-guard.js'), 'mail-review must not load the identity send guard');

  const templates = await source('mail-templates.js');
  assert.ok(templates.includes("const isMailReview = /\\/mail-review(?:\\/|$)/i.test(location.pathname);"));
  assert.ok(templates.includes("if (!isMailReview && !document.querySelector('script[data-company-identity-runtime]'))"));
});

test('mail review loaded runtime cannot force a page reload', async () => {
  const html = await source('mail-review.html');
  const scripts = localScriptSources(html);

  for (const script of scripts) {
    const text = await source(script);
    assert.doesNotMatch(text, /location\.reload\s*\(/, `${script} must not force mail-review to reload`);
  }
});

test('mail review runtime cannot reintroduce an unguarded identity-based sendAll click blocker', async () => {
  const html = await source('mail-review.html');
  const scripts = localScriptSources(html);

  for (const script of scripts) {
    const text = await source(script);
    const targetsSendAll = /#sendAllBtn|sendAllBtn/.test(text);
    const hardStopsEvent = /stopImmediatePropagation\s*\(/.test(text);
    const identityBlockMessage = /공식 브랜드명|검증된 연결 근거|발송 중지:/.test(text);
    assert.equal(
      targetsSendAll && hardStopsEvent && identityBlockMessage,
      false,
      `${script} must not intercept mail-review sendAll with an identity-validation hard block`
    );
  }
});

test('mail review selection contract keeps companies included unless the user explicitly excludes them', async () => {
  const text = await source('mail-review-selection-contract.js');
  assert.match(text, /USER_SELECTION_KEY/);
  assert.match(text, /hasOwn\(userSelection, id\) \? userSelection\[id\] !== false : true/);
  assert.match(text, /draft\.included = included/);
  assert.doesNotMatch(text, /identityAutoExcluded\s*=\s*true/);
});
