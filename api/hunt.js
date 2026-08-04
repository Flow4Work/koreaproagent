import { POST as baseHunt } from '../lib/hunt-core.js';
import { qualifyKbwLeads } from '../lib/kbw-qualification.js';

export async function POST(request) {
  let body = {};
  try { body = await request.clone().json(); } catch { /* base handler returns the request error */ }

  const response = await baseHunt(request);
  if (!response.ok || body.campaign !== 'kbw') return response;

  const data = await response.json();
  const qualified = qualifyKbwLeads(data?.leads || [], 12);

  return Response.json({
    ...data,
    leads:qualified.leads,
    strategy:{
      ...(data.strategy || {}),
      next_action:'A등급(행사·구매 신호)과 B등급(팀 참석 확정)만 담당자 이메일을 찾습니다.'
    },
    meta:{
      ...(data.meta || {}),
      kbw_participation_gate:true,
      kbw_merch_buyer_gate:true,
      kbw_grade_policy:'A/B-return-C-hold-v1',
      kbw_grade_counts:qualified.counts,
      returned:qualified.leads.length,
      filtered_speaker_only:qualified.counts.held_c,
      filtered_without_attendance:qualified.counts.excluded
    }
  }, {
    status:response.status,
    headers:{ 'Cache-Control':'no-store' }
  });
}
