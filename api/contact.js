import { findContacts, normalizeContacts } from '../lib/contact-discovery.js';

const GTM_TITLE=/(founder|co-founder|ceo|chief executive|president|vp|vice president|head of|director|country manager|general manager|business development|partnership|alliances|growth|sales|revenue|commercial|go-to-market|gtm|apac|asia|international)/i;
const WRONG_FUNCTION=/(legal|general counsel|engineering|developer|product manager|product designer|research|scientist|accounting|finance manager|hr manager|people operations|customer support)/i;

function clean(value,max=500){return typeof value==='string'?value.trim().slice(0,max):''}
function safeError(value=''){return String(value).replace(/[A-Za-z0-9_-]{32,}/g,'[key]').slice(0,500)}
function actionable(contact={}){const title=clean(contact.title,220);return Boolean(contact.email&&title&&GTM_TITLE.test(title)&&!WRONG_FUNCTION.test(title))}

export async function POST(request){let body={};try{body=await request.json()}catch{return Response.json({error:'요청 형식이 잘못됐습니다.'},{status:400})}const url=clean(body.url,500);const recommendedRole=clean(body.recommendedRole,120)||'Head of Sales';if(!url)return Response.json({error:'회사 URL이 필요합니다.'},{status:400});try{const result=await findContacts(url,{maxContacts:10,recommendedRole});const normalized=normalizeContacts(result?.emails||[],recommendedRole);const contacts=normalized.filter(actionable).slice(0,3);return Response.json({contact:contacts[0]||null,contacts,provider:result?.provider||null,attempts:result?.attempts||[],rejected_count:Math.max(0,normalized.length-contacts.length),rule:'GTM decision-maker title + real email required'},{headers:{'Cache-Control':'no-store'}})}catch(error){return Response.json({error:safeError(error?.message||error)},{status:502})}}