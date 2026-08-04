export async function POST() {
  return Response.json({ ok: true, diagnostic: 'hunt-v2-route' }, { headers: { 'Cache-Control': 'no-store' } });
}
