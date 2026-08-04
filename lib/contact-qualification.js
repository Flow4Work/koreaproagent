const ALWAYS_BLOCKED_LOCAL_PARTS = new Set([
  'abuse','billing','care','careers','concierge','customer','customerservice','customer-service',
  'donotreply','help','hr','jobs','legal','no-reply','noreply','postmaster','privacy','security','support'
]);

const GENERIC_ROLE_GROUPS = {
  events: ['event','events'],
  operations: ['operations','ops'],
  partnerships: ['bd','bizdev','business','businessdevelopment','partner','partners','partnership','partnerships'],
  community: ['community'],
  marketing: ['growth','marketing'],
  sales: ['commercial','revenue','sales'],
  media: ['content','media','press']
};

const UNSPECIFIC_GENERIC_LOCAL_PARTS = new Set(['contact','hello','info','office','team']);
const ALL_ROLE_LOCAL_PARTS = new Set(Object.values(GENERIC_ROLE_GROUPS).flat());
const GTM_TITLE = /(founder|co-founder|ceo|chief executive|president|vp|vice president|head of|director|country manager|general manager|business development|partnership|growth|sales|revenue|commercial|go-to-market|gtm|operations|events|community|marketing|content|media)/i;

function clean(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function localPart(email = '') {
  return clean(email, 240).toLowerCase().split('@')[0] || '';
}

function normalizedStatus(contact = {}) {
  const status = clean(contact.emailStatus || contact.confidence || contact.status || '', 80).toLowerCase();
  if (['verified','valid','deliverable'].includes(status)) return 'valid';
  if (status.includes('accept')) return 'accept_all';
  return 'unknown';
}

function roleGroups(roles = []) {
  const text = roles.map(role => clean(role, 120)).join(' ').toLowerCase();
  const groups = new Set();
  if (/(event|행사)/.test(text)) groups.add('events');
  if (/(operation|ops|운영)/.test(text)) groups.add('operations');
  if (/(partner|partnership|business development|bizdev|\bbd\b|제휴|사업개발)/.test(text)) groups.add('partnerships');
  if (/(community|커뮤니티)/.test(text)) groups.add('community');
  if (/(marketing|growth|마케팅|그로스)/.test(text)) groups.add('marketing');
  if (/(sales|revenue|commercial|영업)/.test(text)) groups.add('sales');
  if (/(media|content|video|press|홍보|콘텐츠|영상)/.test(text)) groups.add('media');
  return groups;
}

function allowedGenericLocalParts(roles = []) {
  const allowed = new Set();
  for (const group of roleGroups(roles)) {
    for (const value of GENERIC_ROLE_GROUPS[group] || []) allowed.add(value);
  }
  return allowed;
}

function titleMatchesRoles(title = '', roles = []) {
  const value = clean(title, 240).toLowerCase();
  if (!value) return false;
  for (const role of roles) {
    const normalized = clean(role, 120).toLowerCase();
    if (!normalized) continue;
    const keywords = normalized.split(/[^a-z0-9가-힣]+/).filter(word => word.length >= 3 && !['lead','head','director','manager'].includes(word));
    if (keywords.some(keyword => value.includes(keyword))) return true;
  }
  return false;
}

function isOfficialPublicContact(contact = {}) {
  if (clean(contact.provider, 80).toLowerCase() === 'public_web') return true;
  return (Array.isArray(contact.sources) ? contact.sources : []).some(source => /^https?:\/\//i.test(String(source || '')));
}

export function qualifyContact(contact = {}, roles = []) {
  const email = clean(contact.email, 240).toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) {
    return { sendable:false, code:'invalid_email', reason:'이메일 형식 오류', score:0 };
  }

  const local = localPart(email);
  if (ALWAYS_BLOCKED_LOCAL_PARTS.has(local)) {
    return { sendable:false, code:'blocked_service_mailbox', reason:'고객지원·법무·시스템 대표메일', score:0 };
  }

  const status = normalizedStatus(contact);
  const officialPublic = isOfficialPublicContact(contact);
  const allowedGeneric = allowedGenericLocalParts(roles);
  const genericRole = ALL_ROLE_LOCAL_PARTS.has(local);
  const unspecificGeneric = UNSPECIFIC_GENERIC_LOCAL_PARTS.has(local);

  if (genericRole || unspecificGeneric) {
    if (unspecificGeneric) {
      return { sendable:false, code:'unspecific_generic_mailbox', reason:'담당 부서가 불명확한 대표메일', score:15 };
    }
    if (!allowedGeneric.has(local)) {
      return { sendable:false, code:'generic_role_mismatch', reason:'요청한 담당 직무와 다른 대표메일', score:20 };
    }
    if (!officialPublic && status !== 'valid') {
      return { sendable:false, code:'unverified_generic_mailbox', reason:'검증되지 않은 부서 대표메일', score:25 };
    }
    return {
      sendable:true,
      code:'qualified_role_mailbox',
      reason:'공식 직무 대표메일',
      score:120 + (status === 'valid' ? 15 : 0)
    };
  }

  if (!officialPublic && status !== 'valid') {
    return { sendable:false, code:'unverified_personal_email', reason:'개인 이메일 검증 상태 불충분', score:30 };
  }

  const title = clean(contact.title, 240);
  const roleMatched = titleMatchesRoles(title, roles);
  const decisionMaker = Boolean(contact.decisionMaker || contact.decision_maker);
  if (!roleMatched && !decisionMaker && !GTM_TITLE.test(title)) {
    return { sendable:false, code:'personal_role_unconfirmed', reason:'담당 직무를 확인하지 못한 개인 이메일', score:35 };
  }

  return {
    sendable:true,
    code:'qualified_personal_contact',
    reason:'검증된 관련 담당자 이메일',
    score:150 + (roleMatched ? 30 : 0) + (decisionMaker ? 15 : 0) + (status === 'valid' ? 15 : 0)
  };
}

export function qualifyContacts(contacts = [], roles = [], limit = 4) {
  const sendable = [];
  const fallback = [];

  for (const contact of Array.isArray(contacts) ? contacts : []) {
    const qualification = qualifyContact(contact, roles);
    const row = {
      ...contact,
      sendable:qualification.sendable,
      qualificationCode:qualification.code,
      qualificationReason:qualification.reason,
      qualificationScore:qualification.score
    };
    if (qualification.sendable) sendable.push(row);
    else fallback.push(row);
  }

  const sortRows = (a, b) =>
    Number(b.qualificationScore || 0) - Number(a.qualificationScore || 0) ||
    Number(b.score || 0) - Number(a.score || 0);

  sendable.sort(sortRows);
  fallback.sort(sortRows);
  return { sendable:sendable.slice(0, limit), fallback:fallback.slice(0, limit) };
}

export function summarizeContactFailure(fallback = [], attempts = []) {
  const codes = new Set((Array.isArray(fallback) ? fallback : []).map(row => row.qualificationCode));
  if (codes.has('blocked_service_mailbox')) {
    return { code:'only_service_mailboxes', reason:'고객지원·법무 등 부적합 대표메일만 확인했습니다.' };
  }
  if (codes.has('unverified_personal_email') || codes.has('unverified_generic_mailbox')) {
    return { code:'email_unverified', reason:'관련 담당자 후보는 있으나 검증된 이메일을 확보하지 못했습니다.' };
  }
  if (codes.has('personal_role_unconfirmed') || codes.has('generic_role_mismatch') || codes.has('unspecific_generic_mailbox')) {
    return { code:'role_unconfirmed', reason:'이메일은 찾았지만 실제 담당 직무를 확인하지 못했습니다.' };
  }
  if ((Array.isArray(attempts) ? attempts : []).some(attempt => attempt.status === 'error')) {
    return { code:'provider_error', reason:'연락처 공급자 오류 또는 사용량 제한으로 탐색을 완료하지 못했습니다.' };
  }
  return { code:'no_contact', reason:'적합한 담당자 이메일을 찾지 못했습니다.' };
}
