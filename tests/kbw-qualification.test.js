import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyKbwLead, qualifyKbwLeads } from '../lib/kbw-qualification.js';

function lead(overrides = {}) {
  return {
    company:'Example Labs',
    source_title:'',
    signal:'',
    source_url:'https://example.com',
    quality_reasons:[],
    score:70,
    sales_priority:100,
    kbw_status_code:'',
    ...overrides
  };
}

test('A grade for confirmed KBW side-event host', () => {
  const result = qualifyKbwLead(lead({ signal:'Hosting a KBW 2026 side event in Seoul with a community meetup.' }));
  assert.equal(result.grade, 'A');
  assert.equal(result.qualified, true);
});

test('A grade for official sponsor with booth', () => {
  const result = qualifyKbwLead(lead({ source_title:'Official KBW 2026 sponsor and exhibitor booth announcement' }));
  assert.equal(result.grade, 'A');
});

test('B grade for explicit team attendance', () => {
  const result = qualifyKbwLead(lead({ signal:'Our team is attending KBW2026. Meet us in Seoul.' }));
  assert.equal(result.grade, 'B');
  assert.equal(result.qualified, true);
});

test('speaker-only company is held as C', () => {
  const result = qualifyKbwLead(lead({ company:'KAST', signal:'KAST founder is a confirmed speaker at Korea Blockchain Week 2026', kbw_status_code:'confirmed' }));
  assert.equal(result.grade, 'C');
  assert.equal(result.qualified, false);
});

test('funding and TGE without attendance are excluded', () => {
  const result = qualifyKbwLead(lead({ signal:'Raised a strategic round and plans a TGE and Korea expansion.' }));
  assert.equal(result.grade, 'D');
  assert.equal(result.code, 'momentum_without_attendance');
});

test('generic Korea activity without direct event attendance is excluded', () => {
  const result = qualifyKbwLead(lead({ signal:'Expanding community operations in Korea this year.' }));
  assert.equal(result.qualified, false);
});

test('only A and B are returned', () => {
  const result = qualifyKbwLeads([
    lead({ company:'A Co', signal:'Official sponsor with a booth at KBW 2026 in Seoul.' }),
    lead({ company:'B Co', signal:'Our team is attending KBW2026. Meet us in Seoul.' }),
    lead({ company:'C Co', signal:'Founder speaking at KBW 2026.', kbw_status_code:'confirmed' }),
    lead({ company:'D Co', signal:'Recent funding and mainnet launch.' })
  ]);
  assert.deepEqual(result.leads.map(row => row.company), ['A Co','B Co']);
  assert.equal(result.counts.held_c, 1);
  assert.equal(result.counts.excluded, 1);
});

test('A grade sorts before B grade', () => {
  const result = qualifyKbwLeads([
    lead({ company:'B Co', signal:'Our team is attending KBW2026. Meet us in Seoul.', sales_priority:999 }),
    lead({ company:'A Co', signal:'Hosting an official KBW 2026 side event in Seoul.', sales_priority:1 })
  ]);
  assert.equal(result.leads[0].company, 'A Co');
});
