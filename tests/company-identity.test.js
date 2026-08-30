import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractIdentityCandidates,
  stripLegalSuffix,
  chooseBrand,
  rootDomain,
  IDENTITY_VERSION
} from '../lib/company-identity.js';

test('prefers the public Bulgarian Rose brand over the PLC legal name', () => {
  const html = `<html><head>
    <script type="application/ld+json">{"@type":"Organization","name":"Bulgarian Rose Plc","alternateName":"Bulgarian Rose","legalName":"Bulgarian Rose Plc"}</script>
    <meta property="og:site_name" content="Bulgarian Rose">
  </head><body>Bulgarian Rose Plc official cosmetics website</body></html>`;
  const best = chooseBrand(extractIdentityCandidates(html));
  assert.equal(best.value, 'Bulgarian Rose');
  assert.equal(stripLegalSuffix('Bulgarian ROSE PLC'), 'Bulgarian ROSE');
});

test('removes legal suffixes without changing the actual brand words', () => {
  assert.equal(stripLegalSuffix('PTN Healthcare GmbH'), 'PTN Healthcare');
  assert.equal(stripLegalSuffix('GUANGZHOU MENOL PLASTIC CO.,LTD'), 'GUANGZHOU MENOL PLASTIC');
  assert.equal(stripLegalSuffix('Example Pte. Ltd.'), 'Example');
});

test('preserves official spacing and capitalization from site metadata', () => {
  const cosmeticHtml = '<meta property="og:site_name" content="CosmeticBusiness"><title>CosmeticBusiness</title>';
  assert.equal(chooseBrand(extractIdentityCandidates(cosmeticHtml)).value, 'CosmeticBusiness');

  const machineHtml = '<meta property="og:site_name" content="MachineU"><title>MachineU - Home</title>';
  assert.equal(chooseBrand(extractIdentityCandidates(machineHtml)).value, 'MachineU');
});

test('logo wrappers are never treated as the company name', () => {
  const canvas = '<meta property="og:site_name" content="Canvas Logo"><img class="header-logo" alt="Canvas Logo">';
  assert.equal(chooseBrand(extractIdentityCandidates(canvas)).value, 'Canvas');

  const bare = '<img class="header-logo" alt="logo"><title>logo</title>';
  assert.equal(chooseBrand(extractIdentityCandidates(bare)), null);
});

test('long official page descriptors collapse to the public brand', () => {
  const html = '<meta property="og:site_name" content="CHIME Beauty — 台灣美妝包裝專家｜GRS・FSC・ISO 認證代工廠">';
  assert.equal(chooseBrand(extractIdentityCandidates(html)).value, 'CHIME Beauty');
});

test('handles multi-label domains and exposes the v5 identity schema', () => {
  assert.equal(rootDomain('person@sub.example.co.kr'), 'example.co.kr');
  assert.equal(IDENTITY_VERSION, '20260830-email-domain-identity-v5');
});
