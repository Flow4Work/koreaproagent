(() => {
  if (window.__KPA_BCWW_SALES_UI_V4__ || typeof state === 'undefined') return;
  window.__KPA_BCWW_SALES_UI_V4__ = true;

  const clean = (value = '', max = 260) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const safeLink = (value = '') => { try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  const blocked = new Set(['admin','support','help','security','careers','hr','jobs','legal','privacy','noreply','no-reply']);

  function contactTrust(contact = {}, lead = {}) {
    const email = clean(contact?.email, 260).toLowerCase();
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return '';
    const local = email.split('@')[0] || '';
    if (blocked.has(local) || contact?.qualified !== true || Number(contact?.score || 0) < 75) return '';
    const emailDomain = email.split('@')[1] || '';
    const companyDomain = typeof rootHost === 'function' ? rootHost(lead.domain || lead.url || '') : '';
    if (!companyDomain || !(emailDomain === companyDomain || emailDomain.endsWith(`.${companyDomain}`))) return '';
    if (contact?.emailStatus === 'valid') return 'smtp_valid';
    if (contact?.emailStatus === 'official_public' && contact?.officialSource === true && contact?.verificationMethod === 'official_public') {
      if (['info','contact','hello','team','office','press','media'].includes(local) && contact?.allowGeneric !== true) return '';
      return 'official_public';
    }
    return '';
  }

  function trusted(lead = {}) {
    const rows = [lead.contact, ...(Array.isArray(lead.contacts) ? lead.contacts : [])].filter(Boolean);
    return rows.map(contact => ({ contact, trust:contactTrust(contact, lead) }))
      .filter(row => row.trust)
      .sort((a,b) => Number(b.trust === 'smtp_valid') - Number(a.trust === 'smtp_valid') || Number(b.contact.score || 0) - Number(a.contact.score || 0))[0] || null;
  }

  const baseLeadReady = leadReady;
  leadReady = function bcwwSalesLeadReady(lead = {}) {
    if (lead?.campaign !== 'bcww') return baseLeadReady(lead);
    const allowedTier = lead?.bcww_participation_confirmed === true || ['channel','recurrence','prospect'].includes(lead?.bcww_outreach_tier);
    return Boolean(lead?.verified_company === true && lead?.team_origin === 'foreign' && allowedTier && trusted(lead) && clean(leadMessage(lead), 12000).length >= 120);
  };

  function leads() {
    return (state.leads || [])
      .filter(lead => lead?.campaign === 'bcww' && (lead?.bcww_participation_confirmed === true || lead?.bcww_sales_candidate === true))
      .sort((a,b) =>
        Number(state.selected.has(b.id)) - Number(state.selected.has(a.id)) ||
        Number(leadReady(b)) - Number(leadReady(a)) ||
        Number(b.bcww_participation_confirmed === true) - Number(a.bcww_participation_confirmed === true) ||
        Number(b.bcww_outreach_tier === 'channel') - Number(a.bcww_outreach_tier === 'channel') ||
        Number(b.bcww_outreach_tier === 'recurrence') - Number(a.bcww_outreach_tier === 'recurrence') ||
        Number(b.sales_priority || b.score || 0) - Number(a.sales_priority || a.score || 0)
      );
  }

  function tier(lead = {}) {
    if (lead.bcww_participation_confirmed === true) return 'direct';
    if (lead.bcww_outreach_tier === 'channel') return 'channel';
    if (lead.bcww_outreach_tier === 'recurrence') return 'recurrence';
    return 'prospect';
  }
  function tierLabel(lead = {}) {
    const t = tier(lead);
    if (t === 'direct') return '2026 참가 확인';
    if (t === 'channel') return '2026 공식 참가 채널';
    if (t === 'recurrence') return '2025 참가 · 2026 확인중';
    return '2026 접촉 후보 · 참가 미확정';
  }
  function status(lead = {}) {
    const t = trusted(lead);
    const base = tierLabel(lead);
    if (!t) return `${base} · 이메일 미확보`;
    return `${base} · ${t.trust === 'smtp_valid' ? '이메일 검증' : '공식 공개메일'}`;
  }
  function contactHtml(lead = {}) {
    const t = trusted(lead);
    if (!t) return `<strong>이메일 탐색 미완료</strong><small class="pending">${esc(tierLabel(lead))}</small>`;
    const c = t.contact;
    const name = clean(c.name || `${c.first_name || ''} ${c.last_name || ''}`, 120);
    const role = clean(c.title || lead.recommended_role || '담당자', 120);
    const proof = t.trust === 'official_public' ? '공식 사이트 공개' : '이메일 검증 완료';
    return `<strong>${esc(name || role)}</strong>${name && role && name !== role ? `<span>${esc(role)}</span>` : ''}<a href="mailto:${esc(c.email)}">${esc(c.email)}</a><small>${esc(proof)}</small>`;
  }
  function relationHtml(lead = {}) {
    const relation = clean(lead.evidence_reason || lead.signal || '', 120);
    return relation ? `<small class="pending">${esc(relation)}</small>` : '';
  }
  function selectedCount(rows = leads()) {
    const ids = new Set(rows.map(x => x.id));
    return [...state.selected].filter(id => ids.has(id)).length;
  }
  function bcwwOnlyStatusText() {
    const text = clean(state.statusText, 180);
    return /^BCWW(?:\b|\s|·|:)/i.test(text) ? text : '';
  }

  const baseSummary = renderSummary;
  renderSummary = function bcwwSalesSummary() {
    if (state.currentCampaign !== 'bcww') return baseSummary();
    const rows = leads();
    const direct = rows.filter(x => tier(x) === 'direct').length;
    const channel = rows.filter(x => tier(x) === 'channel').length;
    const recurrence = rows.filter(x => tier(x) === 'recurrence').length;
    const prospect = rows.filter(x => tier(x) === 'prospect').length;
    const ready = rows.filter(leadReady).length;
    const auto = state.auto ? `<span class="hunt-live">BCWW 자동사냥 ${remainingText()} 남음</span>` : '';
    const text = bcwwOnlyStatusText();
    const el = document.getElementById('summary');
    if (el) el.innerHTML = `<strong>BCWW 영업 후보 ${rows.length}개</strong><span>2026 직접 ${direct}</span><span>공식 채널 ${channel}</span><span>재참가 추적 ${recurrence}</span><span>접촉 후보 ${prospect}</span><span>이메일 확보 ${ready}</span><span>선택 ${selectedCount(rows)}</span>${auto}${text ? `<span>${esc(text)}</span>` : ''}`;
  };

  function bindRows() {
    document.querySelectorAll('.lead-check[data-bcww-sales="1"]').forEach(input => input.addEventListener('change', () => {
      if (input.checked) state.selected.add(input.dataset.id); else state.selected.delete(input.dataset.id);
      if (typeof saveState === 'function') saveState();
      renderSummary();
    }));
  }

  const baseRender = render;
  render = function bcwwSalesRender() {
    if (state.currentCampaign !== 'bcww') return baseRender();
    updateMainButton();
    const rows = leads();
    renderSummary();
    const content = document.getElementById('content');
    if (!content) return;
    if (!rows.length) {
      content.innerHTML = '<div class="empty"><strong>아직 BCWW 영업 후보가 없습니다.</strong><span>2026 직접 참가 확인 + 공식 해외 참가 채널 + 검증된 2025 재참가 후보 + 공식 공개 이메일이 있는 2026 접촉 후보를 함께 탐색합니다.</span></div>';
      return;
    }
    content.innerHTML = `<table class="lead-table bcww-table"><thead><tr><th></th><th>회사</th><th>담당자 / 이메일</th><th>상태</th><th>행동</th></tr></thead><tbody>${rows.map(lead => {
      const ready = leadReady(lead), website = safeLink(lead.url), mail = ready ? gmailUrl(lead) : '', checked = state.selected.has(lead.id) ? 'checked' : '';
      return `<tr class="data-row ${ready ? 'ready-row' : ''}">
        <td class="select-cell"><input class="lead-check" data-bcww-sales="1" type="checkbox" data-id="${esc(lead.id)}" ${checked} ${ready ? '' : 'disabled'}></td>
        <td class="company"><span class="campaign-badge">BCWW</span><strong>${esc(lead.company)}</strong>${website ? `<a href="${esc(website)}" target="_blank" rel="noopener noreferrer">${esc(lead.domain || '')}</a>` : `<span>${esc(lead.domain || '')}</span>`}${relationHtml(lead)}</td>
        <td class="contact">${contactHtml(lead)}</td>
        <td><span class="stage ${ready ? 'stage-ready' : ''}">${esc(status(lead))}</span></td>
        <td><div class="actions">${mail ? `<a class="mail-btn" href="${esc(mail)}">메일 준비하기</a>` : ''}</div></td>
      </tr>`;
    }).join('')}</tbody></table>`;
    bindRows();
  };

  // Clear stale KBW-only notices as soon as the BCWW view is activated.
  if (state.currentCampaign === 'bcww' && !/^BCWW(?:\b|\s|·|:)/i.test(clean(state.statusText, 180))) state.statusText = '';
  render();
})();
