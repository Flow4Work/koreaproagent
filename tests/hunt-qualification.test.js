import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceGrade, mergeEvidence } from '../lib/hunt-qualification.js';

test('주최·스폰서·사이드 이벤트는 A등급이다', () => {
  const grade = attendanceGrade({ signal: 'Official sponsor and co-host of a KBW side event in Seoul' });
  assert.equal(grade.code, 'A');
  assert.equal(grade.contactEligible, true);
});

test('회사 공식 참석 발표는 B등급이다', () => {
  const grade = attendanceGrade({ signal: 'Our team is attending KBW and heading to Seoul' });
  assert.equal(grade.code, 'B');
  assert.equal(grade.contactEligible, true);
});

test('연사만 확인되면 C등급이며 이메일 탐색 대상이 아니다', () => {
  const grade = attendanceGrade({ signal: 'Our CEO is a speaker at Korea Blockchain Week' });
  assert.equal(grade.code, 'C');
  assert.equal(grade.contactEligible, false);
});

test('투자·출시 신호만 있으면 D등급이다', () => {
  const grade = attendanceGrade({ signal: 'The protocol raised a seed round and plans a mainnet launch' });
  assert.equal(grade.code, 'D');
  assert.equal(grade.contactEligible, false);
});

test('동일 도메인의 근거와 도구 출처를 합친다', () => {
  const merged = mergeEvidence([
    { domain: 'example.com', score: 70, source_url: 'https://a.test/1', source_title: 'A', signal: 'KBW sponsor', quality_reasons: ['sponsor'], tool_signals: ['Tavily'] },
    { domain: 'example.com', score: 80, source_url: 'https://b.test/2', source_title: 'B', signal: 'heading to Seoul', quality_reasons: ['attendance'], tool_signals: ['Jina'] }
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].score, 80);
  assert.equal(merged[0].evidence.length, 2);
  assert.deepEqual(new Set(merged[0].tool_signals), new Set(['Tavily', 'Jina']));
});
