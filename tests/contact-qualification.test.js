import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyContact, qualifyContacts, summarizeContactFailure } from '../lib/contact-qualification.js';

test('blocks customer-support mailboxes even when publicly listed', () => {
  const result = qualifyContact({ email:'support@example.com', provider:'public_web' }, ['Partnerships Lead']);
  assert.equal(result.sendable, false);
  assert.equal(result.code, 'blocked_service_mailbox');
});

test('allows official partnerships mailbox for a partnerships target', () => {
  const result = qualifyContact({ email:'partnerships@example.com', provider:'public_web' }, ['Partnerships Lead']);
  assert.equal(result.sendable, true);
  assert.equal(result.code, 'qualified_role_mailbox');
});

test('does not allow a media mailbox for an events target', () => {
  const result = qualifyContact({ email:'media@example.com', provider:'public_web' }, ['Events Lead']);
  assert.equal(result.sendable, false);
  assert.equal(result.code, 'generic_role_mismatch');
});

test('allows media mailbox when media is the requested role', () => {
  const result = qualifyContact({ email:'media@example.com', provider:'public_web' }, ['Media Lead']);
  assert.equal(result.sendable, true);
});

test('allows a verified personal email with a matching GTM title', () => {
  const result = qualifyContact({
    email:'alex@example.com',
    emailStatus:'valid',
    title:'Head of Events',
    provider:'apollo',
    decisionMaker:true
  }, ['Events Lead']);
  assert.equal(result.sendable, true);
  assert.equal(result.code, 'qualified_personal_contact');
});

test('blocks an unverified personal email', () => {
  const result = qualifyContact({
    email:'alex@example.com',
    emailStatus:'unknown',
    title:'Head of Events',
    provider:'tomba'
  }, ['Events Lead']);
  assert.equal(result.sendable, false);
  assert.equal(result.code, 'unverified_personal_email');
});

test('ranks a verified person above a generic role mailbox', () => {
  const result = qualifyContacts([
    { email:'events@example.com', provider:'public_web', score:300 },
    { email:'alex@example.com', emailStatus:'valid', title:'Head of Events', provider:'apollo', score:100, decisionMaker:true }
  ], ['Events Lead']);
  assert.equal(result.sendable[0].email, 'alex@example.com');
});

test('returns a useful failure reason for service-only results', () => {
  const fallback = qualifyContacts([{ email:'support@example.com', provider:'public_web' }], ['Events Lead']).fallback;
  const result = summarizeContactFailure(fallback, []);
  assert.equal(result.code, 'only_service_mailboxes');
});
