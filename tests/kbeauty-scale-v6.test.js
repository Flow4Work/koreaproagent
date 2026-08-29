import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('../api/kbeauty.js', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../kbeauty-runtime-v5.js', import.meta.url), 'utf8');

test('K-Beauty scale target is 500 sendable contacts, not the legacy 20-lead gate', () => {
  assert.match(runtime, /TARGET_SENDABLE\s*=\s*500/);
  assert.match(runtime, /TARGET_VERIFIED\s*=\s*1200/);
  assert.doesNotMatch(runtime, /before\s*>?=\s*20/);
});

test('K-Beauty runtime keeps a persistent discovery queue and raises the state ceiling above 500', () => {
  assert.match(runtime, /MAX_STATE_LEADS\s*=\s*1800/);
  assert.match(runtime, /MAX_QUEUE\s*=\s*1800/);
  assert.match(runtime, /kpa\.kbeauty\.v6\.queue/);
  assert.match(runtime, /saveStateForScale/);
});

test('social attendance announcements are evidence sources instead of being globally blocked', () => {
  assert.match(api, /site:linkedin\.com/);
  assert.match(api, /site:x\.com/);
  assert.match(api, /SOCIAL_SOURCE/);
  assert.doesNotMatch(api, /exclude_domains:\[[^\]]*linkedin\.com/);
});

test('discovery rotates through Korea-visit beauty signals and verifies foreign official domains before UI insertion', () => {
  for (const source of ['kotra_buyer_2026','intercharm_2026','cosmobeauty_2026','incosmetics_2026','osong_2026','kbeauty_global_2026']) {
    assert.match(api, new RegExp(source));
  }
  assert.match(api, /body\.action==='verify_candidates'/);
  assert.match(api, /verifyForeignEntity/);
  assert.match(runtime, /action:'verify_candidates'/);
  assert.match(runtime, /mergeVerifiedLead/);
  assert.match(runtime, /KPA_COMPANY_IDENTITY_REFRESH/);
  assert.match(runtime, /identityReady/);
});

test('generic KOTRA recruitment is explicitly rejected and every extracted candidate must have a named company in source text', () => {
  assert.match(api, /Generic recruitment eligibility is NOT a lead/);
  assert.match(api, /textMatchesCompany\(company,row\.text\)/);
  assert.match(api, /if\(!company\|\|!key/);
});
