import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractIdentityCandidates,
  chooseBrand,
  stripLegalSuffix,
  rootDomain,
  IDENTITY_VERSION
} from '../lib/company-identity.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFile(path.join(root, file), 'utf8');

test('a legal-looking title alone is not enough to verify a public brand', () => {
  const html = '<title>Guangzhou Keyuan Plasticware Co., Ltd.</title><h1>Guangzhou Keyuan Plasticware Co., Ltd.</h1>';
  const selected = chooseBrand(extractIdentityCandidates(html, 'https://keyuanbottle.com/'));
  assert.equal(selected, null);
});

test('strong official-site metadata can establish the public-facing brand', () => {
  const html = '<meta property="og:site_name" content="MUZE Packaging"><title>Premium Cosmetic Packaging</title>';
  const selected = chooseBrand(extractIdentityCandidates(html, 'https://muzepackage.com/'));
  assert.equal(selected?.value, 'MUZE Packaging');
});

test('mixed-case public brand plus official self-description is strong evidence', () => {
  const html = '<html><body><p>MUZE Packaging is a professional manufacturer of plastic bottles and comprehensive packaging solutions.</p></body></html>';
  const selected = chooseBrand(extractIdentityCandidates(html, 'https://muzepackage.com/'));
  assert.equal(selected?.value, 'MUZE Packaging');
});

test('explicit official-site brand declaration can establish a short brand', () => {
  const html = '<html><body><p>MISS EDE is the brand created for modern beauty customers.</p></body></html>';
  const selected = chooseBrand(extractIdentityCandidates(html, 'https://missede.com/about'));
  assert.equal(selected?.value, 'MISS EDE');
});

test('official self-description can establish a short uppercase brand without hardcoding it', () => {
  const html = '<html><body><p>KEYUAN is a designer, developer, producer and seller of cosmetic packaging products.</p></body></html>';
  const selected = chooseBrand(extractIdentityCandidates(html, 'https://keyuanbottle.com/about'));
  assert.equal(selected?.value, 'KEYUAN');
});

test('official invitation wording can establish a public uppercase brand', () => {
  const html = '<html><body><p>Come to QIAONENG, own modern cosmetic packaging solutions for your brand.</p></body></html>';
  const selected = chooseBrand(extractIdentityCandidates(html, 'https://qiaonengpackaging.com/about'));
  assert.equal(selected?.value, 'QIAONENG');
});

test('Vietnamese brand label can beat a country-suffixed site label', () => {
  const html = '<html><head><meta property="og:site_name" content="MISS EDE Vietnam"></head><body><h2>THƯƠNG HIỆU MISS EDE</h2></body></html>';
  const selected = chooseBrand(extractIdentityCandidates(html, 'https://missede.com/about'));
  assert.equal(selected?.value, 'MISS EDE');
});

test('legal suffix stripping remains metadata cleanup only', () => {
  assert.equal(stripLegalSuffix('Bulgarian Rose Plc'), 'Bulgarian Rose');
  assert.equal(stripLegalSuffix('PTN Healthcare GmbH'), 'PTN Healthcare');
  assert.equal(rootDomain('person@sub.example.co.kr'), 'example.co.kr');
});

test('browser identity runtime is email-domain anchored and has no legacy refresh or reload path', async () => {
  const runtime = await source('company-name-llm.js');
  assert.match(runtime, /primaryEmail/);
  assert.match(runtime, /recipient_domain/);
  assert.match(runtime, /KPA_COMPANY_CONTACT_ALLOWED/);
  assert.match(runtime, /rootDomain\(email\)/);
  assert.doesNotMatch(runtime, /refreshContactsForIdentity/);
  assert.doesNotMatch(runtime, /trustedCrossDomain/);
  assert.doesNotMatch(runtime, /location\.reload\s*\(/);
});

test('v5 identity schema is shared by server and browser runtime', async () => {
  assert.equal(IDENTITY_VERSION, '20260830-email-domain-identity-v5');
  const runtime = await source('company-name-llm.js');
  const guard = await source('company-greeting-guard.js');
  assert.match(runtime, /20260830-email-domain-identity-v5/);
  assert.match(guard, /20260830-email-domain-identity-v5/);
});
