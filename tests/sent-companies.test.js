import test from 'node:test';
import assert from 'node:assert/strict';
import {
  companyHash,
  decryptCompanyMetadata,
  encryptCompanyMetadata,
  normalizeCompanyKey
} from '../lib/sent-companies.js';

test('회사 키는 이메일·URL·서브도메인을 같은 루트 도메인으로 정규화한다', () => {
  assert.equal(normalizeCompanyKey('https://www.events.example.com/path'), 'example.com');
  assert.equal(normalizeCompanyKey('hello@example.com'), 'example.com');
  assert.equal(normalizeCompanyKey('https://team.example.co.kr/path'), 'example.co.kr');
});

test('발송 회사 메타데이터는 암호화 후 복원된다', () => {
  const secret = 'test-secret-value';
  const encrypted = encryptCompanyMetadata({ name: 'Example', domain: 'www.example.com' }, secret);
  assert.notEqual(encrypted.includes('Example'), true);
  assert.deepEqual(decryptCompanyMetadata(encrypted, secret), { name: 'Example', domain: 'example.com' });
});

test('같은 회사 키는 동일한 HMAC을 만든다', () => {
  const secret = 'test-secret-value';
  assert.equal(companyHash('www.example.com', secret), companyHash('https://example.com/team', secret));
});
