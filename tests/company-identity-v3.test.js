import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractIdentityCandidates,
  chooseBrand,
  stripLegalSuffix,
  rootDomain
} from '../lib/company-identity.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFile(path.join(root, file), 'utf8');

test('a legal-looking title alone is not enough to verify a public brand', () => {
  const html = '<title>Guangzhou Keyuan Plasticware Co., Ltd.</title><h1>Guangzhou Keyuan Plasticware Co., Ltd.</h1>';
  const selected = chooseBrand(extractIdentityCandidates(html, 'https://keyuanbottle.com/'), 'Guangzhou Keyuan Plasticware', 'keyuanbottle.com');
  assert.equal(selected, null);
});

test('strong official-site metadata can establish the public-facing brand', () => {
  const html = '<meta property="og:site_name" content="MUZE Packaging"><title>Premium Cosmetic Packaging</title>';
  const selected = chooseBrand(extractIdentityCandidates(html, 'https://muzepackage.com/'), 'Muzepackage', 'muzepackage.com');
  assert.equal(selected?.value, 'MUZE Packaging');
});

test('explicit official-site brand declaration can establish a short brand', () => {
  const html = '<html><body><p>MISS EDE is the brand created for modern beauty customers.</p></body></html>';
  const selected = chooseBrand(extractIdentityCandidates(html, 'https://missede.com/about'), 'MISS EDE Vietnam', 'missede.com');
  assert.equal(selected?.value, 'MISS EDE');
});

test('official self-description can establish a short uppercase brand without hardcoding it', () => {
  const html = '<html><body><p>KEYUAN is a designer, developer, producer and seller of cosmetic packaging products.</p></body></html>';
  const selected = chooseBrand(extractIdentityCandidates(html, 'https://keyuanbottle.com/about'), 'Guangzhou Keyuan Plasticware', 'keyuanbottle.com');
  assert.equal(selected?.value, 'KEYUAN');
});

test('official invitation wording can establish a public uppercase brand', () => {
  const html = '<html><body><p>Come to QIAONENG, own modern cosmetic packaging solutions for your brand.</p></body></html>';
  const selected = chooseBrand(extractIdentityCandidates(html, 'https://qiaonengpackaging.com/about'), 'Guangzhou Qiaoneng Plastic Product Co.,Ltd', 'qiaonengpackaging.com');
  assert.equal(selected?.value, 'QIAONENG');
});

test('official why-choose heading can establish a mixed-case brand phrase', () => {
  const html = '<html><body><h2>Why Choose MUZE Packaging?</h2></body></html>';
  const selected = chooseBrand(extractIdentityCandidates(html, 'https://muzepackage.com/about'), 'Guangzhou Muze Packaging Solutions Technology Co., Ltd', 'muzepackage.com');
  assert.equal(selected?.value, 'MUZE Packaging');
});

test('Vietnamese brand label can beat a country-suffixed site label', () => {
  const html = '<html><head><meta property="og:site_name" content="MISS EDE Vietnam"></head><body><h2>THƯƠNG HIỆU MISS EDE</h2></body></html>';
  const selected = chooseBrand(extractIdentityCandidates(html, 'https://missede.com/about'), 'MISS EDE Vietnam', 'missede.com');
  assert.equal(selected?.value, 'MISS EDE');
});

test('legal suffix stripping remains metadata cleanup only', () => {
  assert.equal(stripLegalSuffix('Bulgarian Rose Plc'), 'Bulgarian Rose');
  assert.equal(stripLegalSuffix('PTN Healthcare GmbH'), 'PTN Healthcare');
  assert.equal(rootDomain('person@sub.example.co.kr'), 'example.co.kr');
});

test('browser runtime preserves broad contact candidates and gates only sending', async () => {
  const runtime = await source('company-name-llm.js');
  assert.match(runtime, /contact_candidates/);
  assert.match(runtime, /official_site_email/);
  assert.match(runtime, /KPA_COMPANY_CONTACT_ALLOWED/);
  assert.match(runtime, /needs_contact_refresh/);
  assert.doesNotMatch(runtime, /lead\.contacts\s*=\s*kept/);
});

test('mail guard no longer guesses brands from a domain stem', async () => {
  const guard = await source('company-identity-mail-guard.js');
  assert.doesNotMatch(guard, /safeShortBrand/);
  assert.doesNotMatch(guard, /domainStem/);
  assert.match(guard, /company_identity\?\.greeting_name/);
});

test('legacy greeting guard does not infer from domains after any identity record exists', async () => {
  const guard = await source('company-greeting-guard.js');
  assert.match(guard, /Once an identity record exists/);
  assert.match(guard, /identityRecord\(lead\) && !identityCurrentVerified\(lead\)/);
});
