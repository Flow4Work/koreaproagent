import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFile(path.join(root, file), 'utf8');

test('K-Beauty mail review loads isolated company-name and campaign templates before mail review', async () => {
  const html = await source('mail-review.html');
  const companyFix = html.indexOf('/kbeauty-company-name-fix.js');
  const campaignTemplate = html.indexOf('/kbeauty-mail-final-v1.js');
  const review = html.indexOf('/mail-review.js');
  assert.ok(companyFix >= 0);
  assert.ok(campaignTemplate > companyFix);
  assert.ok(review > campaignTemplate);
});

test('K-Beauty A/B mail keeps the established structure but names K-Beauty Expo Korea 2026 instead of KBW', async () => {
  const text = await source('kbeauty-mail-final-v1.js');
  assert.match(text, /lead\?\.campaign !== 'kbeauty'/);
  assert.match(text, /Official EA SPORTS merch vendor — produced in Seoul for K-Beauty Expo Korea 2026/);
  assert.match(text, /If your team is coming to K-Beauty Expo Korea 2026/);
  assert.match(text, /Skip the customs delays — K-Beauty Expo Korea 2026 merch produced in Seoul/);
  assert.match(text, /Shipping branded merch into Korea for K-Beauty Expo Korea 2026/);
  assert.match(text, /Want a quick list of options with pricing and lead times\?/);
  assert.match(text, /Happy to send 2–3 options with pricing and turnaround times\./);
});

test('existing K-Beauty drafts containing the accidental KBW copy are reset once without clearing unrelated drafts', async () => {
  const text = await source('kbeauty-mail-final-v1.js');
  assert.match(text, /if \(\/\\bKBW\\b\/i\.test\(text\)\)/);
  assert.match(text, /draft\.subject = '';/);
  assert.match(text, /draft\.body = '';/);
  assert.match(text, /draft\.translation = '';/);
  assert.match(text, /kpa\.kbeauty\.mail\.template\.version\.v1/);
});

test('K-Beauty company-name guard removes obvious page-title names before the greeting is rendered', async () => {
  const text = await source('kbeauty-company-name-fix.js');
  assert.match(text, /canvas\\s\+logo/);
  assert.match(text, /공식\\s\*홈페이지/);
  assert.match(text, /brandFromDomain/);
  assert.match(text, /company_name_source = 'kbeauty-mail-display-guard-v1'/);
  assert.match(text, /lead\?\.campaign !== 'kbeauty'/);
});

test('KBW package-price UI is loaded only when every selected review lead is actually KBW', async () => {
  const html = await source('mail-review.html');
  const loader = await source('kbw-package-email-loader.js');
  assert.match(html, /kbw-package-email-loader\.js\?v=20260901-kbw-only-v1/);
  assert.doesNotMatch(html, /<script src="\/kbw-package-email\.js/);
  assert.match(loader, /selected\.some\(lead => lead\?\.campaign !== 'kbw'\)/);
  assert.match(loader, /script\.src = '\/kbw-package-email\.js\?v=20260806-kbw-package-email-v1'/);
});
