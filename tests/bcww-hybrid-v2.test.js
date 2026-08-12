import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeParticipationEvidence } from '../lib/bcww-hybrid-v2.js';

test('company-owned BCWW Sep 14-16 Seoul calendar is B grade even without adjacent year', () => {
  assert.equal(gradeParticipationEvidence('Upcoming Events 2026: BCWW – Sep 14-16, Seoul, Korea', { companyOwned:true }), 'B');
});

test('explicit BCWW 2026 stand is A grade', () => {
  assert.equal(gradeParticipationEvidence('We are at BCWW 2026 in Seoul. Meet us at Stand #B101.', { companyOwned:true }), 'A');
});

test('interest/follower directory is rejected', () => {
  assert.equal(gradeParticipationEvidence('BCWW 2026 users who have shown interest for this Event include Example Media.', { companyOwned:false }), '');
});

test('recruitment-only notice is rejected', () => {
  assert.equal(gradeParticipationEvidence('BCWW 2026 exhibitor applications are open. Apply now before the application deadline.', { companyOwned:false }), '');
});
