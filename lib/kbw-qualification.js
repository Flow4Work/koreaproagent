const STRONG_BUYER_SIGNAL = /(side\s*event|co-?host|host(?:ing)?|organizer|organizing|official\s+sponsor|sponsor(?:ing)?|booth|exhibit(?:or|ing)?|activation|hackathon|builder\s*house|developer\s*summit|demo\s*day|community\s*event|meetup|brunch|forum|dinner|party|afterparty|reception|staff|merch|shirt|hoodie|사이드\s*이벤트|공동\s*주최|주최|공식\s*스폰서|스폰서|후원|부스|전시|해커톤|빌더\s*하우스|데모데이|밋업|커뮤니티\s*행사|브런치|포럼|디너|파티|스태프|굿즈|단체복)/i;
const EXPLICIT_TEAM_ATTENDANCE = /(our\s+team|the\s+team|team\s+(?:is\s+)?(?:attending|joining|heading|coming)|meet\s+us|see\s+you\s+in\s+seoul|heading\s+to\s+seoul|we(?:'re|\s+are)\s+(?:attending|joining|coming)|company\s+delegation|multiple\s+(?:team\s+members|speakers|executives)|팀\s*(?:참석|방문|참가)|서울에서\s*만나요|서울로\s*갑니다|임직원\s*[2-9]|복수\s*연사)/i;
const SPEAKER_ONLY_SIGNAL = /(speaker|speaking|panelist|fireside\s+chat|keynote|연사|패널|키노트)/i;
const KBW_CONTEXT = /(kbw\s*2026|kbw2026|korea\s+blockchain\s+week(?:\s*2026)?)/i;
const SEOUL_EVENT_CONTEXT = /((seoul|korea|서울|한국).{0,100}(event|meetup|conference|summit|forum|hackathon|side\s*event|행사|밋업|컨퍼런스|서밋|포럼|해커톤))|((event|meetup|conference|summit|forum|hackathon|side\s*event|행사|밋업|컨퍼런스|서밋|포럼|해커톤).{0,100}(seoul|korea|서울|한국))/i;
const NON_PARTICIPATION_SIGNAL = /(funding|raised|investment|tge|token\s+generation|mainnet|testnet|airdrop|listing|partnership|expansion|community\s+growth|투자|펀딩|메인넷|테스트넷|에어드롭|상장|파트너십|확장)/i;

function clean(value = '', max = 5000) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function evidenceText(lead = {}) {
  return clean([
    lead.company,
    lead.source_title,
    lead.signal,
    lead.source_url,
    lead.opportunity_lane,
    lead.kbw_status,
    lead.kbw_status_code,
    ...(Array.isArray(lead.quality_reasons) ? lead.quality_reasons : []),
    ...(Array.isArray(lead.tool_signals) ? lead.tool_signals : [])
  ].filter(Boolean).join(' '));
}

function directKbwContext(text = '') {
  return KBW_CONTEXT.test(text) || SEOUL_EVENT_CONTEXT.test(text);
}

export function qualifyKbwLead(lead = {}) {
  const text = evidenceText(lead);
  const hasContext = directKbwContext(text);
  const buyerSignal = STRONG_BUYER_SIGNAL.test(text);
  const teamAttendance = EXPLICIT_TEAM_ATTENDANCE.test(text);
  const speakerSignal = SPEAKER_ONLY_SIGNAL.test(text);
  const baseConfirmed = lead.kbw_status_code === 'confirmed';

  if (hasContext && buyerSignal) {
    return {
      qualified:true,
      grade:'A',
      code:'confirmed_merch_buyer',
      label:'A등급 · 구매 신호 강함',
      score:95,
      reason:'KBW·서울 행사 참여와 부스·주최·스폰서·사이드 이벤트 등 실제 굿즈 구매 신호가 함께 확인됐습니다.'
    };
  }

  if (hasContext && teamAttendance) {
    return {
      qualified:true,
      grade:'B',
      code:'confirmed_team_attendance',
      label:'B등급 · 팀 참석 확정',
      score:78,
      reason:'회사 또는 팀 단위의 KBW·서울 참석 신호가 직접 확인됐습니다.'
    };
  }

  if (hasContext && (speakerSignal || baseConfirmed)) {
    return {
      qualified:false,
      grade:'C',
      code:'speaker_only_hold',
      label:'C등급 · 연사만 확인',
      score:45,
      reason:'연사 참석은 확인됐지만 팀 방문·부스·사이드 이벤트·굿즈 구매 신호는 확인되지 않았습니다.'
    };
  }

  if (NON_PARTICIPATION_SIGNAL.test(text)) {
    return {
      qualified:false,
      grade:'D',
      code:'momentum_without_attendance',
      label:'제외 · 참석 근거 없음',
      score:15,
      reason:'투자·출시·한국 확장 신호만 있고 KBW 참석 근거가 없습니다.'
    };
  }

  return {
    qualified:false,
    grade:'D',
    code:'attendance_unconfirmed',
    label:'제외 · 참석 미확인',
    score:0,
    reason:'KBW 또는 서울 행사 참석을 직접 뒷받침하는 근거가 없습니다.'
  };
}

export function qualifyKbwLeads(leads = [], limit = 12) {
  const qualified = [];
  const held = [];
  const excluded = [];

  for (const lead of Array.isArray(leads) ? leads : []) {
    const qualification = qualifyKbwLead(lead);
    const row = {
      ...lead,
      kbw_grade:qualification.grade,
      kbw_grade_code:qualification.code,
      kbw_grade_reason:qualification.reason,
      win_label:qualification.label,
      win_score:qualification.score,
      sales_priority:Number(lead.sales_priority || lead.score || 0) + qualification.score,
      quality_reasons:[
        ...(Array.isArray(lead.quality_reasons) ? lead.quality_reasons : []),
        qualification.label,
        qualification.reason
      ].filter(Boolean)
    };

    if (qualification.qualified) qualified.push(row);
    else if (qualification.grade === 'C') held.push(row);
    else excluded.push(row);
  }

  qualified.sort((a, b) =>
    (a.kbw_grade === 'A' ? -1 : 1) - (b.kbw_grade === 'A' ? -1 : 1) ||
    Number(b.sales_priority || 0) - Number(a.sales_priority || 0)
  );

  return {
    leads:qualified.slice(0, Math.max(1, Number(limit) || 12)),
    held,
    excluded,
    counts:{
      qualified:qualified.length,
      grade_a:qualified.filter(row => row.kbw_grade === 'A').length,
      grade_b:qualified.filter(row => row.kbw_grade === 'B').length,
      held_c:held.length,
      excluded:excluded.length
    }
  };
}
