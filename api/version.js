const BUILD='outbound-v4';
const VERSION='2026.07.29-rc1';

export async function GET(){return Response.json({build:BUILD,version:VERSION,timestamp:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})}