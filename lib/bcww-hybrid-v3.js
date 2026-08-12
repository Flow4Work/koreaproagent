import { POST as hybridPost } from './bcww-hybrid-v2.js';

const BAD_SOURCE = /(10times\.com|shown\s+interest|interested\s+attendees?|followers?|users?\s+who\s+have\s+shown\s+interest|registration\s+(?:is\s+)?(?:now\s+)?open|applications?\s+(?:are\s+)?open|apply\s+(?:now|here|by)|application\s+deadline|call\s+for\s+(?:exhibitors?|applications?|entries)|exhibitor\s+registration|참가기업\s*모집|부스\s*참가기업\s*모집|모집\s*공고|신청\s*(?:기간|방법)|접수\s*기간|出展.*募集|募集.*出展|応募|招募|报名|報名)/i;

export function finalBcwwLeadEligible(lead = {}) {
  if (lead?.campaign !== 'bcww' || lead?.bcww_participation_confirmed !== true || lead?.team_origin !== 'foreign') return false;
  const evidence = `${lead?.source_title || ''} ${lead?.source_url || ''} ${lead?.evidence_reason || ''} ${(lead?.evidence_urls || []).join(' ')}`;
  return !BAD_SOURCE.test(evidence);
}

export async function POST(request) {
  const response = await hybridPost(request);
  const text = await response.text();
  if (!response.ok) return new Response(text, { status:response.status, headers:{ 'Content-Type':'application/json', 'Cache-Control':'no-store' } });
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { return new Response(text, { status:response.status, headers:{ 'Content-Type':'application/json', 'Cache-Control':'no-store' } }); }
  const before = Array.isArray(data.leads) ? data.leads : [];
  const leads = before.filter(finalBcwwLeadEligible);
  return Response.json({
    ...data,
    leads,
    meta:{ ...(data.meta || {}), returned:leads.length, final_gate_rejected:before.length - leads.length, final_gate:'foreign + confirmed participation + no interest/recruitment source' }
  }, { headers:{ 'Cache-Control':'no-store' } });
}
