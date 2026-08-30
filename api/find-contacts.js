import { contactDiscoveryConfigured as hunterConfigured, findContacts, normalizeContacts } from '../lib/contact-discovery.js';
import { findKBeautyContactsFast } from '../lib/kbeauty-fast-contact-v4.js';
import { findKBeautyAdditiveContacts, mergeKBeautyContactRows } from '../lib/kbeauty-additive-contact.js';
import { nvidiaKBeautyConfigured, recoverKBeautyContactRows } from '../lib/kbeauty-nvidia-recovery.js';
import { prospeoConfigured, recoverKBeautyContactsWithProspeo } from '../lib/kbeauty-prospeo-recovery.js';
import { resolveKBeautyDomainsV5 } from '../lib/kbeauty-domain-resolver-v5.js';

function clean(v, max = 200) { return typeof v === 'string' ? v.trim().slice(0, max) : '' }

function providerSummary(results=[]) {
  const summary={};
  for(const row of Array.isArray(results)?results:[]){
    for(const item of Array.isArray(row?.diagnostics)?row.diagnostics:[]){
      const provider=clean(item?.provider,40)||'unknown';
      const stage=clean(item?.stage,60)||'request';
      const key=`${provider}:${stage}`;
      if(!summary[key]) summary[key]={provider,stage,ok:0,failed:0,statuses:{},errors:{}};
      const bucket=summary[key];
      if(item?.ok) bucket.ok+=1; else bucket.failed+=1;
      const status=String(Number(item?.status)||0);
      bucket.statuses[status]=(bucket.statuses[status]||0)+1;
      const error=clean(item?.error,80);
      if(error) bucket.errors[error]=(bucket.errors[error]||0)+1;
    }
  }
  return Object.values(summary);
}

export async function POST(request) {
  let body = {};
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid request format' }, { status: 400 }) }

  if (body.action === 'kbeauty_domains') {
    try {
      const results = await resolveKBeautyDomainsV5(body.items || [], clean(body.exaKey, 5000));
      return Response.json({
        results,
        meta:{batch_size:Array.isArray(body.items)?Math.min(body.items.length,18):0,pipeline:'kbeauty-domain-v5'}
      }, { headers:{'Cache-Control':'no-store'} });
    } catch (e) {
      console.error('[kbeauty_domains] fatal', clean(e?.message || e, 400));
      return Response.json({ results: [], error: clean(e?.message || e, 400) }, { status:502 });
    }
  }

  // K-Beauty providers add to one shared result pool. Broad search/crawl runs together,
  // then NVIDIA and Prospeo recover the remaining misses in parallel instead of gating each other.
  if (body.action === 'kbeauty_fast') {
    try {
      const items = body.items || [];
      const exaKey = clean(body.exaKey, 5000);
      const [baseResults, additiveResults] = await Promise.all([
        findKBeautyContactsFast(items, exaKey),
        findKBeautyAdditiveContacts(items, exaKey)
      ]);
      const unionResults = mergeKBeautyContactRows(baseResults, additiveResults);
      const [nvidiaResults, prospeoResults] = await Promise.all([
        recoverKBeautyContactRows(unionResults, items),
        recoverKBeautyContactsWithProspeo(unionResults)
      ]);
      const withNvidia = mergeKBeautyContactRows(unionResults, nvidiaResults);
      const results = mergeKBeautyContactRows(withNvidia, prospeoResults);
      const providers=providerSummary(results);
      const hardFailures=providers.filter(row=>row.failed>0 && !Object.keys(row.errors||{}).every(error=>['not_configured','no_match','no_email','no_domain_match','missing_domain','no_person_match','no_verified_email','temporarily_disabled'].includes(error)));
      if(hardFailures.length) console.warn('[kbeauty_fast] provider failures', JSON.stringify(hardFailures));
      return Response.json({
        results,
        hunterConfigured:Boolean(process.env.HUNTER_API_KEY),
        nvidiaConfigured:nvidiaKBeautyConfigured(),
        prospeoConfigured:prospeoConfigured(),
        meta:{batch_size:Array.isArray(items)?Math.min(items.length,6):0,provider_status:providers,pipeline:'kbeauty-email-additive-union+nvidia+prospeo-parallel-recovery'}
      }, { headers:{'Cache-Control':'no-store'} });
    } catch (e) {
      console.error('[kbeauty_fast] fatal', clean(e?.message || e, 400));
      return Response.json({ results: [], error: clean(e?.message || e, 400) }, { status:502 });
    }
  }

  if (!hunterConfigured()) return Response.json({ error: 'HUNTER_API_KEY is missing', hunterConfigured: false }, { status: 503 });
  const company = clean(body.company, 120), domain = clean(body.domain, 200), recommendedRole = clean(body.recommendedRole, 80);
  if (!company || !domain) return Response.json({ error: 'company and domain are required' }, { status: 400 });
  try {
    const result = await findContacts(domain, { maxContacts: 10, includeFilters: true });
    const emails = result?.emails || [];
    const contacts = normalizeContacts(emails, recommendedRole);
    if (!contacts.length) return Response.json({ contacts: [], reason: 'no_verified_contact', company, domain });
    return Response.json({ contacts, company, domain });
  } catch (e) {
    return Response.json({ contacts: [], reason: 'no_verified_contact', error: e.message, company, domain }, { status: e.status || 502 });
  }
}
