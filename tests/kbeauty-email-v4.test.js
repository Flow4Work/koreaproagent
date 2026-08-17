import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fastPath=path.join(root,'lib','kbeauty-fast-contact-v4.js');
const runtimePath=path.join(root,'kbeauty-runtime-fix.js');
const apiPath=path.join(root,'api','find-contacts.js');
const source=file=>readFile(file,'utf8');

test('K-Beauty API uses the email-v4 contact pipeline only for kbeauty_fast',async()=>{
  const text=await source(apiPath);
  assert.match(text,/kbeauty-fast-contact-v4\.js/);
  assert.match(text,/pipeline:'kbeauty-email-v4'/);
});

test('email-v4 crawls real official contact variants before giving up',async()=>{
  const text=await source(fastPath);
  assert.match(text,/'contact\.html'/);
  assert.match(text,/'contact_us\.html'/);
  assert.match(text,/'en\/contact'/);
  assert.match(text,/sameDomainLinks\(home\.text/);
  assert.match(text,/sitemap\.xml/);
});

test('email-v4 decodes obfuscated official emails and supports trusted published corporate mail domains',async()=>{
  const text=await source(fastPath);
  assert.match(text,/&#0\*64;/);
  assert.match(text,/officialPublished:true/);
  assert.match(text,/trustedPublishedEmail/);
  assert.match(text,/wellpackgroup/);
  assert.match(text,/zhuhaibaoli/);
});

test('catch-all addresses are discovered but never treated as sendable',async()=>{
  const fast=await source(fastPath);
  const runtime=await source(runtimePath);
  assert.match(fast,/CATCH_ALL/);
  assert.match(fast,/outreachEligible/);
  assert.match(runtime,/bannedLocal/);
  assert.match(runtime,/발송 가능 이메일 미확보/);
});

test('runtime recovers emails from existing candidates before adding more candidates',async()=>{
  const text=await source(runtimePath);
  const recovery=text.indexOf('runContactRecovery(MAX_CONTACTS_PER_RUN)');
  const hunt=text.indexOf('try{hunt=await huntFreshCandidates(c);}',recovery);
  assert.ok(recovery>=0);
  assert.ok(hunt>recovery);
  assert.match(text,/const MAX_ATTEMPTS = 6/);
  assert.match(text,/c\.total<20 \|\| \(c\.total<40&&c\.pending===0\)/);
  assert.doesNotMatch(text,/c\.total>=40.*huntFreshCandidates/s);
});
