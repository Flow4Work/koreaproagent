import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fastPath=path.join(root,'lib','kbeauty-fast-contact-v4.js');
const recoveryPath=path.join(root,'lib','kbeauty-nvidia-recovery.js');
const runtimePath=path.join(root,'kbeauty-runtime-fix.js');
const apiPath=path.join(root,'api','find-contacts.js');
const indexPath=path.join(root,'index.html');
const source=file=>readFile(file,'utf8');

test('K-Beauty API keeps email-v4 and adds evidence-bound NVIDIA recovery only for kbeauty_fast',async()=>{
  const text=await source(apiPath);
  assert.match(text,/kbeauty-fast-contact-v4\.js/);
  assert.match(text,/kbeauty-nvidia-recovery\.js/);
  assert.match(text,/recoverKBeautyContactRows/);
  assert.match(text,/pipeline:'kbeauty-email-v4\+nvidia-recovery'/);
});

test('NVIDIA recovery is optional, evidence-bound, and never guesses addresses',async()=>{
  const text=await source(recoveryPath);
  assert.match(text,/process\.env\.NVIDIA_API_KEY/);
  assert.match(text,/integrate\.api\.nvidia\.com\/v1\/chat\/completions/);
  assert.match(text,/meta\/muse-glimmer-30b/);
  assert.match(text,/Never invent or infer an email pattern/);
  assert.match(text,/evidenceContainsEmail/);
  assert.match(text,/officialPublished: true/);
  assert.match(text,/BANNED_LOCAL/);
});

test('recovery directly crawls official pages including the IMS Packaging contact route before LLM fallback',async()=>{
  const text=await source(recoveryPath);
  assert.match(text,/'about\/9\.html'/);
  assert.match(text,/directContactsFromEvidence/);
  assert.match(text,/if \(direct\.length\)/);
  assert.ok(text.indexOf('if (direct.length)') < text.indexOf('const nvidia = await nvidiaExtract'));
});

test('K-Beauty page forces the current email-v4 runtime and reopens stale failures once',async()=>{
  const text=await source(indexPath);
  assert.match(text,/kpa\.kbeauty\.runtime-v4\.1-reset/);
  assert.match(text,/localStorage\.removeItem\('kpa\.kbeauty\.email-priority\.v4'\)/);
  assert.match(text,/kbeauty-runtime-fix\.js\?v=20260819-kbeauty-email-v4-1/);
  assert.doesNotMatch(text,/kbeauty-runtime-fix\.js\?v=20260817-contact-pipeline-v3/);
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
  const recovery=await source(recoveryPath);
  const runtime=await source(runtimePath);
  assert.match(fast,/CATCH_ALL/);
  assert.match(fast,/outreachEligible/);
  assert.match(recovery,/BANNED_LOCAL/);
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
