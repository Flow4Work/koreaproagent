import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearContactCache,
  contactProviderStatus,
  findContacts,
  normalizeContacts
} from '../lib/contact-discovery-v2.js';

test('직무가 맞는 유효 개인 이메일은 75점 이상으로 통과한다', () => {
  const contacts = normalizeContacts([{
    first_name: 'Alex',
    last_name: 'Kim',
    title: 'Events Director',
    email: 'alex@example.com',
    confidence: 'valid',
    provider: 'public_web',
    sources: ['https://example.com/team']
  }], 'Events Lead', ['Events Lead', 'Partnerships Lead'], 'example.com');
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].qualified, true);
  assert.ok(contacts[0].score >= 75);
});

test('검증된 역할 대표메일은 개인 이메일이 없을 때 통과한다', () => {
  const contacts = normalizeContacts([{
    email: 'events@example.com',
    confidence: 'valid',
    provider: 'public_web',
    sources: ['https://example.com/contact']
  }], 'Events Lead', ['Events Lead'], 'example.com');
  assert.equal(contacts[0].qualified, true);
  assert.ok(contacts[0].score >= 75);
});

test('지원메일과 invalid 이메일은 최종 담당자로 통과하지 않는다', () => {
  const contacts = normalizeContacts([
    { email: 'support@example.com', confidence: 'valid', provider: 'public_web', sources: ['https://example.com/contact'] },
    { email: 'bad@example.com', confidence: 'invalid', provider: 'public_web', sources: ['https://example.com/contact'] }
  ], 'Events Lead', ['Events Lead'], 'example.com');
  assert.equal(contacts.some(contact => contact.email === 'bad@example.com'), false);
  assert.equal(contacts.find(contact => contact.email === 'support@example.com')?.qualified, false);
});

test('Hunter 환경변수가 있어도 Hunter API를 절대 호출하지 않는다', async () => {
  const previousFetch = globalThis.fetch;
  const previousHunter = process.env.HUNTER_API_KEY;
  const previousJina = process.env.JINA_API_KEY;
  process.env.HUNTER_API_KEY = 'hunter-test-key';
  delete process.env.JINA_API_KEY;
  clearContactCache();
  const requested = [];

  globalThis.fetch = async urlValue => {
    const url = String(urlValue);
    requested.push(url);
    if (url === 'https://example.com/') {
      return new Response('<a href="/contact">Contact</a> events@example.com', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (url.startsWith('https://example.com/')) {
      return new Response('events@example.com', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    return new Response('', { status: 404, headers: { 'content-type': 'text/plain' } });
  };

  try {
    const result = await findContacts('https://example.com', {
      recommendedRole: 'Events Lead',
      roleTargets: ['Events Lead'],
      minQualified: 1,
      maxContacts: 4
    });
    assert.equal(requested.some(url => url.includes('api.hunter.io')), false);
    assert.equal(result.providerStatus.hunter, false);
    assert.ok(result.attempts.some(row => row.provider === 'hunter' && row.reason === 'disabled'));
    assert.ok(result.emails.some(item => item.email === 'events@example.com'));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousHunter === undefined) delete process.env.HUNTER_API_KEY; else process.env.HUNTER_API_KEY = previousHunter;
    if (previousJina === undefined) delete process.env.JINA_API_KEY; else process.env.JINA_API_KEY = previousJina;
    clearContactCache();
  }
});

test('공급자 상태에서 Hunter는 키 존재 여부와 무관하게 정지 상태다', () => {
  const previousHunter = process.env.HUNTER_API_KEY;
  const previousJina = process.env.JINA_API_KEY;
  process.env.HUNTER_API_KEY = 'hunter-test-key';
  process.env.JINA_API_KEY = 'jina-test-key';
  try {
    const status = contactProviderStatus();
    assert.equal(status.hunter, false);
    assert.equal(status.jina, true);
    assert.equal(status.publicWeb, true);
  } finally {
    if (previousHunter === undefined) delete process.env.HUNTER_API_KEY; else process.env.HUNTER_API_KEY = previousHunter;
    if (previousJina === undefined) delete process.env.JINA_API_KEY; else process.env.JINA_API_KEY = previousJina;
  }
});
