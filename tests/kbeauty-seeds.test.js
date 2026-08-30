import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIntercharmList } from '../lib/kbeauty-seeds-2026.js';

test('extracts named companies from official InterCHARM profile links', () => {
  const html = `
    <a href="/eng/exhibitor/exhi_detail04.asp?idx=1">View Profile</a>
    <a href="/eng/exhibitor/exhi_detail04.asp?idx=1">AG Organica</a>
    <a href="/eng/exhibitor/exhi_detail04.asp?idx=2">Daxal Cosmetics Pvt Ltd</a>
    <a href="/eng/exhibitor/exhi_detail04.asp?idx=2">Daxal Cosmetics Pvt Ltd</a>
  `;
  const rows = parseIntercharmList(html, 'https://ick.intercharmkorea.com/eng/exhibitor/exhi_list02.asp');
  assert.deepEqual(rows.map(row => row.company), ['AG Organica', 'Daxal Cosmetics Pvt Ltd']);
  assert.equal(rows[0].tier, 'korea_beauty_event_2026');
  assert.equal(rows[0].curated_2026, true);
  assert.match(rows[0].source_url, /exhi_detail04\.asp/);
});

test('raw directory rows are not falsely marked as verified foreign companies', () => {
  const html = `<a href="/eng/exhibitor/exhi_detail04.asp?idx=3">Example Beauty Co., Ltd.</a>`;
  const [row] = parseIntercharmList(html);
  assert.equal(row.country, '');
  assert.equal(row.foreign_status, 'pending_official_domain_verification');
  assert.equal('verified_company' in row, false);
});
