const clean = (value = '', max = 1000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

const EVENT_CONTEXT = /(kbw|korea blockchain week|seoul|서울|side event|meetup|conference|summit|hackathon|builder house|forum|dinner|brunch|행사|밋업|컨퍼런스|해커톤|포럼|디너|브런치)/i;
const GRADE_A = /(host(?:ed|ing)? by|co[- ]?host|organizer|organizing|official sponsor|sponsor(?:ing)?|official partner|community partner|media partner|booth|exhibit(?:or|ing)?|side event|activation|hackathon host|meetup host|주최|공동주최|스폰서|후원|공식 파트너|부스|전시|사이드 이벤트)/i;
const GRADE_B = /(attend(?:ing|ance)?|participat(?:e|ing|ion)|heading to seoul|coming to seoul|team (?:is|will be) in seoul|meet us at|see you (?:at|in) (?:kbw|seoul)|joining (?:kbw|korea blockchain week)|confirmed attendance|참가|참여|서울 방문|방한|팀.*서울)/i;
const SPEAKER_ONLY = /(speaker|speaking|panelist|fireside chat|keynote|연사|패널|발표)/i;

function evidenceText(lead = {}) {
  return [
    lead.signal,
    lead.source_title,
    lead.kbw_status,
    lead.kbw_status_code,
    lead.verified_by,
    ...(Array.isArray(lead.quality_reasons) ? lead.quality_reasons : []),
    ...(Array.isArray(lead.evidence) ? lead.evidence.map(item => item?.text || item?.title || '') : [])
  ].filter(Boolean).join(' ');
}

export function attendanceGrade(lead = {}) {
  const text = clean(evidenceText(lead), 6000);
  const eventContext = EVENT_CONTEXT.test(text) || lead.kbw_status_code === 'confirmed';
  if (eventContext && GRADE_A.test(text)) {
    return { code: 'A', label: '직접 운영·후원', contactEligible: true, reason: '주최·공동주최·스폰서·부스·사이드 이벤트 근거' };
  }
  if (eventContext && GRADE_B.test(text)) {
    return { code: 'B', label: '공식 참석', contactEligible: true, reason: '회사·팀의 KBW 또는 서울 참석 근거' };
  }
  if (eventContext && SPEAKER_ONLY.test(text)) {
    return { code: 'C', label: '연사만 확인', contactEligible: false, reason: '개별 연사 외 회사 참석 근거 부족' };
  }
  return { code: 'D', label: '관심 신호', contactEligible: false, reason: '투자·출시·한국 관심만 있고 직접 참석 근거 없음' };
}

function unique(values = [], limit = 20) {
  return [...new Set(values.filter(Boolean).map(value => clean(value, 500)))].slice(0, limit);
}

export function mergeEvidence(leads = []) {
  const byDomain = new Map();
  for (const lead of leads) {
    const domain = clean(lead?.domain, 240).toLowerCase();
    if (!domain) continue;
    const existing = byDomain.get(domain);
    const evidence = {
      title: clean(lead.source_title, 260),
      url: clean(lead.source_url, 500),
      text: clean(lead.signal, 500),
      published_date: clean(lead.published_date, 80),
      verified_by: clean(lead.verified_by, 120)
    };
    if (!existing) {
      byDomain.set(domain, {
        ...lead,
        evidence: [evidence],
        quality_reasons: unique(lead.quality_reasons || []),
        tool_signals: unique(lead.tool_signals || [])
      });
      continue;
    }
    const currentPriority = Number(existing.sales_priority || existing.score || 0);
    const incomingPriority = Number(lead.sales_priority || lead.score || 0);
    const best = incomingPriority > currentPriority ? { ...existing, ...lead } : existing;
    byDomain.set(domain, {
      ...best,
      score: Math.max(Number(existing.score) || 0, Number(lead.score) || 0),
      sales_priority: Math.max(currentPriority, incomingPriority),
      win_score: Math.max(Number(existing.win_score) || 0, Number(lead.win_score) || 0),
      evidence: [...(existing.evidence || []), evidence]
        .filter((item, index, rows) => item.url && rows.findIndex(other => other.url === item.url) === index)
        .slice(0, 8),
      quality_reasons: unique([...(existing.quality_reasons || []), ...(lead.quality_reasons || [])]),
      tool_signals: unique([...(existing.tool_signals || []), ...(lead.tool_signals || [])])
    });
  }
  return [...byDomain.values()];
}
