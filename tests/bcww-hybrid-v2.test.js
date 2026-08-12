import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeParticipationEvidence } from '../lib/bcww-hybrid-v2.js';
import { finalBcwwLeadEligible } from '../lib/bcww-hybrid-v3.js';

test('company-owned BCWW Sep 14-16 Seoul calendar is B grade', () => {
  assert.equal(gradeParticipationEvidence('Upcoming Events 2026: BCWW – Sep 14-16, Seoul, Korea', { companyOwned:true }), 'B');
});

test('explicit BCWW 2026 stand is A grade', () => {
  assert.equal(gradeParticipationEvidence('We are at BCWW 2026 in Seoul. Meet us at Stand #B101.', { companyOwned:true }), 'A');
});

test('final gate rejects 10times interest/follower rows', () => {
  assert.equal(finalBcwwLeadEligible({ campaign:'bcww', bcww_participation_confirmed:true, team_origin:'foreign', source_title:'BCWW interested attendees', source_url:'https://10times.com/broadcast-worldwide-seoul/visitors' }), false);
});

test('final gate rejects exhibitor recruitment notices', () => {
  assert.equal(finalBcwwLeadEligible({ campaign:'bcww', bcww_participation_confirmed:true, team_origin:'foreign', source_title:'BCWW 2026 exhibitor registration now open', source_url:'https://example.com/call' }), false);
});

test('final gate keeps company-owned event evidence', () => {
  assert.equal(finalBcwwLeadEligible({ campaign:'bcww', bcww_participation_confirmed:true, team_origin:'foreign', source_title:'Upcoming Events', source_url:'https://media.example.com/events', evidence_reason:'company_calendar' }), true);
});
