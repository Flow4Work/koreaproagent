import test from 'node:test';
import assert from 'node:assert/strict';
import { bcwwRowEligible, bcwwRowRelevant } from '../api/bcww.js';

test('BCWW discovery keeps broad current-event rows for AI classification', () => {
  assert.equal(bcwwRowRelevant({
    title: 'BCWW 2026 Japan delegation update',
    content: 'A new overseas program will be held in Seoul.'
  }), true);
});

test('BCWW direct evidence accepts exhibitor and pitch signals', () => {
  assert.equal(bcwwRowEligible({
    title: 'Studio Alpha exhibiting at BCWW 2026',
    content: 'Meet us at booth A12 in Seoul.'
  }), true);
  assert.equal(bcwwRowEligible({
    title: 'BCWW 2026',
    content: 'Studio Alpha will pitch at BCWW this September.'
  }), true);
});

test('BCWW generic recruitment pages are not direct participant evidence', () => {
  assert.equal(bcwwRowEligible({
    title: 'BCWW 2026 exhibitor registration now open',
    content: 'Apply now. Application deadline Friday.'
  }), false);
});

test('BCWW interest and follower directories are never participant evidence', () => {
  assert.equal(bcwwRowEligible({
    title: 'BCWW 2026 interested attendees',
    content: 'Users who have shown interest for this event include Example Media.'
  }), false);
  assert.equal(bcwwRowRelevant({
    title: 'BCWW 2026 visitors',
    url: 'https://10times.com/broadcast-worldwide-seoul/visitors',
    content: 'Followers and interested attendees.'
  }), false);
});

test('BCWW 2025-only rows are rejected', () => {
  assert.equal(bcwwRowRelevant({
    title: 'BCWW 2025 exhibitors',
    content: 'See the 2025 roster.'
  }), false);
});
