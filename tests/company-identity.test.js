import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractIdentityCandidates,
  stripLegalSuffix,
  chooseBrand,
  rawCompanyMatch,
  domainLooksRelated,
  rootDomain
} from '../lib/company-identity.js';

test('prefers the public Bulgarian Rose brand over the PLC legal name', () => {
  const html = `<html><head>
    <script type="application/ld+json">{"@type":"Organization","name":"Bulgarian Rose Plc","alternateName":"Bulgarian Rose","legalName":"Bulgarian Rose Plc"}</script>
    <meta property="og:site_name" content="Bulgarian Rose">
  </head><body>Bulgarian Rose Plc official cosmetics website</body></html>`;
  const candidates = extractIdentityCandidates(html);
  const best = chooseBrand(candidates, 'Bulgarian ROSE PLC', 'bulgarianrose.bg');
  assert.equal(best.value, 'Bulgarian Rose');
  assert.equal(stripLegalSuffix('Bulgarian ROSE PLC'), 'Bulgarian ROSE');
  assert.equal(rawCompanyMatch('Bulgarian ROSE PLC', 'Official website of Bulgarian Rose Plc'), true);
});

test('removes legal suffixes without changing the actual brand words', () => {
  assert.equal(stripLegalSuffix('PTN Healthcare GmbH'), 'PTN Healthcare');
  assert.equal(stripLegalSuffix('GUANGZHOU MENOL PLASTIC CO.,LTD'), 'GUANGZHOU MENOL PLASTIC');
  assert.equal(stripLegalSuffix('Example Pte. Ltd.'), 'Example');
});

test('preserves official spacing and capitalization from site metadata', () => {
  const cosmeticHtml = '<meta property="og:site_name" content="CosmeticBusiness"><title>CosmeticBusiness</title>';
  const cosmetic = chooseBrand(extractIdentityCandidates(cosmeticHtml), 'Cosmetic Business', 'cosmetic-business.com');
  assert.equal(cosmetic.value, 'CosmeticBusiness');

  const machineHtml = '<meta property="og:site_name" content="MachineU"><title>MachineU - Home</title>';
  const machine = chooseBrand(extractIdentityCandidates(machineHtml), 'Machineu', 'machineu.com');
  assert.equal(machine.value, 'MachineU');
});

test('can select a public brand from an official page even when legal name is longer', () => {
  const html = `<html><head><meta property="og:site_name" content="QIYU PACK"></head>
    <body><h1>Guangzhou Qiyu Packaging Products Co., Ltd.</h1><img class="header-logo" alt="QIYU PACK"></body></html>`;
  const best = chooseBrand(extractIdentityCandidates(html), 'Gzqiyu', 'gzqiyu.com');
  assert.equal(best.value, 'QIYU PACK');
  assert.equal(domainLooksRelated('Gzqiyu', 'gzqiyu.com'), true);
});

test('does not treat a generic glass portal as proof of a different legal company', () => {
  const portalText = 'China Glass Network - glass prices, suppliers, products and industry news';
  assert.equal(rawCompanyMatch('GUANGZHOU JINGHUA CRYSTAL GLASS CO.,LTD', portalText), false);
  assert.equal(rootDomain('https://www.glass.com.cn/'), 'glass.com.cn');
});
