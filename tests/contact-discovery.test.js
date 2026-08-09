import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearContactCache,
  contactProviderStatus,
  findContacts,
  normalizeContacts
} from '../lib/contact-discovery-v2.js';
import { findContacts as findExhaustiveContacts } from '../lib/contact-discovery-exhaustive.js';

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('직무가 맞는 유효 개인 이메일은 75점 이상으로 통과한다', () => {
  const contacts = normalizeContacts([{
    first_name: 'Alex',
    last_name: 'Kim',
    title: 'Events Director',
    email: 'alex@example.com',
    confidence: 'valid',
    provider: 'hunter',
    sources: ['hunter.io']
  }], 'Events Lead', ['Events Lead', 'Partnerships Lead'], 'example.com');
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].qualified, true);
  assert.ok(contacts[0].score >= 75);
});

test('검증된 역할 대표메일은 개인 이메일이 없을 때 통과한다', () => {
  const contacts = normalizeContacts([{
    email: 'events@example.com',
    confidence: 'valid',
    provider: 'hunter',
    sources: ['hunter.io']
  }], 'Events Lead', ['Events Lead'], 'example.com');
  assert.equal(contacts[0].qualified, true);
  assert.ok(contacts[0].score >= 75);
});

test('accept-all 이메일은 점수가 높아도 자동 발송 가능으로 올리지 않는다', () => {
  const contacts = normalizeContacts([{
    first_name: 'Alex',
    last_name: 'Kim',
    title: 'Events Director',
    email: 'alex@example.com',
    confidence: 'accept_all',
    provider: 'hunter',
    sources: ['hunter.io', 'https://example.com/team']
  }], 'Events Lead', ['Events Lead'], 'example.com');
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].emailStatus, 'accept_all');
  assert.equal(contacts[0].qualified, false);
});

test('지원메일과 invalid 이메일은 최종 담당자로 통과하지 않는다', () => {
  const contacts = normalizeContacts([
    { email: 'support@example.com', confidence: 'valid', provider: 'hunter', sources: ['hunter.io'] },
    { email: 'bad@example.com', confidence: 'invalid', provider: 'hunter', sources: ['hunter.io'] }
  ], 'Events Lead', ['Events Lead'], 'example.com');
  assert.equal(contacts.some(contact => contact.email === 'bad@example.com'), false);
  assert.equal(contacts.find(contact => contact.email === 'support@example.com')?.qualified, false);
});

test('공개 페이지와 Hunter의 동일 이메일 근거를 합쳐 점수화한다', async () => {
  const previousFetch = globalThis.fetch;
  const previousHunter = process.env.HUNTER_API_KEY;
  const previousJina = process.env.JINA_API_KEY;
  const previousProspeo = process.env.PROSPEO_API_KEY;
  const previousApollo = process.env.APOLLO_API_KEY;
  const previousTomba = process.env.TOMBA_API_KEY;
  const previousTombaSecret = process.env.TOMBA_API_SECRET;
  process.env.HUNTER_API_KEY = 'hunter-test-key';
  delete process.env.JINA_API_KEY;
  delete process.env.PROSPEO_API_KEY;
  delete process.env.APOLLO_API_KEY;
  delete process.env.TOMBA_API_KEY;
  delete process.env.TOMBA_API_SECRET;
  clearContactCache();

  globalThis.fetch = async urlValue => {
    const url = String(urlValue);
    if (url.startsWith('https://api.hunter.io/v2/domain-search')) {
      return new Response(JSON.stringify({ data: { emails: [{
        value: 'events@example.com',
        type: 'generic',
        confidence: 96,
        verification: { status: 'valid' },
        sources: [{ uri: 'https://example.com/contact' }]
      }] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.startsWith('https://api.hunter.io/v2/email-verifier')) {
      return new Response(JSON.stringify({ data: { status: 'valid', score: 96, mx_records: true, smtp_check: true } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
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
    const contact = result.emails.find(item => item.email === 'events@example.com');
    assert.equal(result.qualifiedCount, 1);
    assert.equal(contact?.qualified, true);
    assert.ok(contact?.providers.includes('public_web'));
    assert.ok(contact?.providers.includes('hunter'));
    assert.ok(contact?.sources.length >= 2);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv('HUNTER_API_KEY', previousHunter);
    restoreEnv('JINA_API_KEY', previousJina);
    restoreEnv('PROSPEO_API_KEY', previousProspeo);
    restoreEnv('APOLLO_API_KEY', previousApollo);
    restoreEnv('TOMBA_API_KEY', previousTomba);
    restoreEnv('TOMBA_API_SECRET', previousTombaSecret);
    clearContactCache();
  }
});

test('기존 unknown 이메일을 Hunter 재검증으로 발송 가능 상태로 복구한다', async () => {
  const previousFetch = globalThis.fetch;
  const previousHunter = process.env.HUNTER_API_KEY;
  const previousJina = process.env.JINA_API_KEY;
  const previousProspeo = process.env.PROSPEO_API_KEY;
  const previousApollo = process.env.APOLLO_API_KEY;
  const previousTomba = process.env.TOMBA_API_KEY;
  const previousTombaSecret = process.env.TOMBA_API_SECRET;
  process.env.HUNTER_API_KEY = 'hunter-test-key';
  delete process.env.JINA_API_KEY;
  delete process.env.PROSPEO_API_KEY;
  delete process.env.APOLLO_API_KEY;
  delete process.env.TOMBA_API_KEY;
  delete process.env.TOMBA_API_SECRET;
  clearContactCache();
  let verifierCalls = 0;

  globalThis.fetch = async urlValue => {
    const url = String(urlValue);
    if (url.startsWith('https://api.hunter.io/v2/domain-search')) {
      return new Response(JSON.stringify({ data: { emails: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.startsWith('https://api.hunter.io/v2/email-verifier')) {
      verifierCalls += 1;
      return new Response(JSON.stringify({ data: {
        status: 'valid', score: 98, mx_records: true, smtp_check: true, accept_all: false, still_on_page: true
      } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('', { status: 200, headers: { 'content-type': 'text/html' } });
  };

  try {
    const result = await findContacts('example.com', {
      recommendedRole: 'Events Lead',
      roleTargets: ['Events Lead'],
      seedContacts: [{ email: 'events@example.com', confidence: 'unknown', provider: 'existing' }],
      forceRefresh: true,
      verifyLimit: 12,
      maxContacts: 4
    });
    assert.equal(verifierCalls, 1);
    assert.equal(result.qualifiedCount, 1);
    assert.equal(result.emails[0]?.email, 'events@example.com');
    assert.equal(result.emails[0]?.emailStatus, 'valid');
    assert.equal(result.emails[0]?.qualified, true);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv('HUNTER_API_KEY', previousHunter);
    restoreEnv('JINA_API_KEY', previousJina);
    restoreEnv('PROSPEO_API_KEY', previousProspeo);
    restoreEnv('APOLLO_API_KEY', previousApollo);
    restoreEnv('TOMBA_API_KEY', previousTomba);
    restoreEnv('TOMBA_API_SECRET', previousTombaSecret);
    clearContactCache();
  }
});

test('공개 이메일이 이미 있어도 설정된 연락처 공급자를 모두 실행한다', async () => {
  const previousFetch = globalThis.fetch;
  const previousProspeo = process.env.PROSPEO_API_KEY;
  const previousApollo = process.env.APOLLO_API_KEY;
  const previousTomba = process.env.TOMBA_API_KEY;
  const previousTombaSecret = process.env.TOMBA_API_SECRET;
  process.env.PROSPEO_API_KEY = 'prospeo-test-key';
  process.env.APOLLO_API_KEY = 'apollo-test-key';
  process.env.TOMBA_API_KEY = 'tomba-test-key';
  process.env.TOMBA_API_SECRET = 'tomba-test-secret';
  const calls = [];

  globalThis.fetch = async (urlValue) => {
    const url = String(urlValue);
    calls.push(url);
    if (url.startsWith('https://api.prospeo.io/search-person')) {
      return new Response(JSON.stringify({ results: [{ person: { person_id: 'p1', current_job_title: 'Events Director' } }] }), { status: 200 });
    }
    if (url.startsWith('https://api.prospeo.io/enrich-person')) {
      return new Response(JSON.stringify({ person: { full_name: 'Pro Speo', current_job_title: 'Events Director', email: { email: 'prospeo@example.com', status: 'valid' } } }), { status: 200 });
    }
    if (url.startsWith('https://api.apollo.io/api/v1/mixed_people/api_search')) {
      return new Response(JSON.stringify({ people: [{ first_name: 'Apo', last_name: 'Llo', title: 'Partnerships Director' }] }), { status: 200 });
    }
    if (url.startsWith('https://api.apollo.io/api/v1/people/match')) {
      return new Response(JSON.stringify({ person: { name: 'Apo Llo', title: 'Partnerships Director', email: 'apollo@example.com', email_status: 'verified' } }), { status: 200 });
    }
    if (url.startsWith('https://api.tomba.io/v1/domain-search')) {
      return new Response(JSON.stringify({ data: { emails: [{ email: 'tomba@example.com', position: 'Community Director', verification: { status: 'valid' }, score: 90 }] } }), { status: 200 });
    }
    if (url === 'https://example.com/') {
      return new Response('<a href="/contact">Contact</a> events@example.com partnerships@example.com', { status: 200 });
    }
    return new Response('events@example.com', { status: 200 });
  };

  try {
    const result = await findExhaustiveContacts('example.com', {
      recommendedRole: 'Events Lead',
      roleTargets: ['Partnerships Lead'],
      maxContacts: 20
    });
    assert.ok(calls.some(url => url.startsWith('https://api.prospeo.io/search-person')));
    assert.ok(calls.some(url => url.startsWith('https://api.apollo.io/api/v1/mixed_people/api_search')));
    assert.ok(calls.some(url => url.startsWith('https://api.tomba.io/v1/domain-search')));
    assert.ok(result.emails.some(contact => contact.email === 'prospeo@example.com'));
    assert.ok(result.emails.some(contact => contact.email === 'apollo@example.com'));
    assert.ok(result.emails.some(contact => contact.email === 'tomba@example.com'));
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv('PROSPEO_API_KEY', previousProspeo);
    restoreEnv('APOLLO_API_KEY', previousApollo);
    restoreEnv('TOMBA_API_KEY', previousTomba);
    restoreEnv('TOMBA_API_SECRET', previousTombaSecret);
  }
});

test('공급자 상태에 Jina와 Hunter가 포함된다', () => {
  const previousHunter = process.env.HUNTER_API_KEY;
  const previousJina = process.env.JINA_API_KEY;
  process.env.HUNTER_API_KEY = 'hunter-test-key';
  process.env.JINA_API_KEY = 'jina-test-key';
  try {
    const status = contactProviderStatus();
    assert.equal(status.hunter, true);
    assert.equal(status.jina, true);
    assert.equal(status.publicWeb, true);
  } finally {
    restoreEnv('HUNTER_API_KEY', previousHunter);
    restoreEnv('JINA_API_KEY', previousJina);
  }
});
