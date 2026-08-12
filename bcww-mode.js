(() => {
  if (typeof CAMPAIGNS === 'undefined' || typeof state === 'undefined') return;

  CAMPAIGNS.bcww = { label:'BCWW 단체복', icon:'📺', market:'해외→한국', message:'en' };

  const cleanText = (value = '', max = 260) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const safeLink = (value = '') => {
    try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) ? url.href : ''; }
    catch { return ''; }
  };

  function strictBcwwContact(lead = {}) {
    const threshold = Math.max(75, Number(lead.contact_score_threshold) || 75);
    const rows = [lead.contact, ...(Array.isArray(lead.contacts) ? lead.contacts : [])].filter(Boolean);
    return rows.find(contact =>
      contact?.qualified === true &&
      contact?.emailStatus === 'valid' &&
      Number(contact?.score || 0) >= threshold &&
      /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(contact?.email || '')) &&
      (() => {
        const emailDomain = String(contact.email).toLowerCase().split('@')[1] || '';
        const companyDomain = typeof rootHost === 'function' ? rootHost(lead.domain || lead.url || '') : '';
        return Boolean(companyDomain && (emailDomain === companyDomain || emailDomain.endsWith(`.${companyDomain}`)));
      })()
    ) || null;
  }

  const originalLeadLanguage = leadLanguage;
  leadLanguage = function bcwwLeadLanguage(lead = {}) {
    if (lead?.campaign === 'bcww') return 'en';
    return originalLeadLanguage(lead);
  };

  const originalLeadReady = leadReady;
  leadReady = function bcwwLeadReady(lead = {}) {
    if (lead?.campaign !== 'bcww') return originalLeadReady(lead);
    const contact = strictBcwwContact(lead);
    return Boolean(
      lead?.verified_company &&
      lead?.bcww_confirmed === true &&
      lead?.team_origin === 'foreign' &&
      contact &&
      cleanText(leadMessage(lead), 12000).length >= 120
    );
  };

  const originalEnrichContact = enrichContact;
  enrichContact = async function bcwwEnrichContact(lead) {
    await originalEnrichContact(lead);
    if (lead?.campaign !== 'bcww') return;
    const current = state.leads.find(item => item.id === lead.id);
    if (!current) return;
    const strict = strictBcwwContact(current);
    if (strict) {
      if (current.contact?.email !== strict.email && typeof patchLead === 'function') {
        patchLead(lead.id, { contact: strict, contact_status: 'found' });
      }
      return;
    }
    if (typeof patchLead === 'function') {
      patchLead(lead.id, {
        contact: null,
        contact_status: 'failed',
        contact_failure_reason: '검증된 이메일 미확보'
      });
    }
  };

  function bcwwVisibleLeads() {
    return state.leads
      .filter(lead => lead?.campaign === 'bcww')
      .sort((a, b) =>
        Number(state.selected.has(b.id)) - Number(state.selected.has(a.id)) ||
        Number(leadReady(b)) - Number(leadReady(a))
      );
  }

  function bcwwSelectedCount(leads = bcwwVisibleLeads()) {
    const ids = new Set(leads.map(lead => lead.id));
    return [...state.selected].filter(id => ids.has(id)).length;
  }

  function bcwwSummary(leads = bcwwVisibleLeads()) {
    const ready = leads.filter(leadReady).length;
    const selected = bcwwSelectedCount(leads);
    const auto = state.auto ? `<span class="hunt-live">자동사냥 ${remainingText()} 남음</span>` : '';
    $('summary').innerHTML = `<strong>BCWW 후보 ${leads.length}개</strong><span>발송 가능 ${ready}개</span><span>선택 ${selected}개</span>${auto}${state.statusText ? `<span>${esc(state.statusText)}</span>` : ''}`;
  }

  function bcwwStatus(lead = {}) {
    if (leadReady(lead)) return '발송 준비';
    if (lead.contact_status === 'searching') return '이메일 확인 중';
    if (lead.contact_status === 'failed') return '검증된 이메일 미확보';
    return '참가 확인';
  }

  function bcwwContactHtml(lead = {}) {
    const contact = strictBcwwContact(lead);
    if (!contact) {
      return `<strong>${esc(cleanText(lead.recommended_role || 'Events / Marketing', 120))}</strong><small class="pending">${esc(bcwwStatus(lead))}</small>`;
    }
    const name = cleanText(contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`, 120);
    const role = cleanText(contact.title || lead.recommended_role || '담당자', 120);
    return `<strong>${esc(name || role)}</strong>${name && role && name !== role ? `<span>${esc(role)}</span>` : ''}<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>`;
  }

  function bindBcwwRows() {
    document.querySelectorAll('.lead-check[data-bcww="1"]').forEach(input => input.addEventListener('change', () => {
      if (input.checked) state.selected.add(input.dataset.id);
      else state.selected.delete(input.dataset.id);
      saveState();
      bcwwSummary();
    }));
  }

  const originalRender = render;
  render = function bcwwAwareRender() {
    if (state.currentCampaign !== 'bcww') {
      const allLeads = state.leads;
      state.leads = allLeads.filter(lead => lead?.campaign !== 'bcww');
      try { return originalRender(); }
      finally { state.leads = allLeads; }
    }

    updateMainButton();
    const leads = bcwwVisibleLeads();
    bcwwSummary(leads);

    if (!leads.length) {
      $('content').innerHTML = '<div class="empty"><strong>아직 확인된 BCWW 2026 해외 참가사가 없습니다.</strong><span>오늘 영업 준비를 누르면 2026년 직접 참가 증거가 있는 해외 회사만 찾습니다.</span></div>';
      return;
    }

    $('content').innerHTML = `<table class="lead-table bcww-table"><thead><tr><th></th><th>회사</th><th>담당자 / 이메일</th><th>상태</th><th>행동</th></tr></thead><tbody>${leads.map(lead => {
      const checked = state.selected.has(lead.id) ? 'checked' : '';
      const ready = leadReady(lead);
      const website = safeLink(lead.url);
      const mail = ready ? gmailUrl(lead) : '';
      return `<tr class="data-row ${ready ? 'ready-row' : ''}">
        <td class="select-cell"><input class="lead-check" data-bcww="1" type="checkbox" data-id="${esc(lead.id)}" ${checked} ${ready ? '' : 'disabled'}></td>
        <td class="company"><span class="campaign-badge">BCWW</span><strong>${esc(lead.company)}</strong>${website ? `<a href="${esc(website)}" target="_blank" rel="noopener noreferrer">${esc(lead.domain || '')}</a>` : `<span>${esc(lead.domain || '')}</span>`}</td>
        <td class="contact">${bcwwContactHtml(lead)}</td>
        <td><span class="stage ${ready ? 'stage-ready' : ''}">${esc(bcwwStatus(lead))}</span></td>
        <td><div class="actions">${mail ? `<a class="mail-btn" href="${esc(mail)}">메일 준비하기</a>` : ''}</div></td>
      </tr>`;
    }).join('')}</tbody></table>`;

    bindBcwwRows();
  };

  const originalRunHuntCycle = runHuntCycle;
  runHuntCycle = async function bcwwRunHuntCycle() {
    if (state.currentCampaign !== 'bcww') return originalRunHuntCycle();

    state.cycle += 1;
    saveState();
    state.statusText = 'BCWW 2026 해외 참가사 확인 중';
    render();

    const excluded = [...state.leads.map(lead => lead.domain).filter(Boolean), ...state.rejected].slice(-500);
    const result = await post('/api/bcww', {
      cycle: state.cycle,
      excludeDomains: excluded,
      tools: toolKeys()
    }, 52000);

    const added = mergeLeads(result.leads || []);
    state.statusText = added.length ? `${added.length}개 직접 참가 확인 · 이메일 검증 중` : '새로 확인된 해외 참가사 없음';
    render();

    if (added.length) await mapLimit(added.slice(0, 10), 3, enrichContact);
    state.statusText = added.length ? `${added.length}개 처리 완료` : '';
    render();
    return added.length;
  };

  function rebuildCampaignSelect() {
    const select = $('campaignSelect');
    if (!select) return;
    const order = ['kbw', 'bcww', ...Object.keys(CAMPAIGNS).filter(id => !['kbw','bcww'].includes(id))];
    select.innerHTML = order.map(id => {
      const item = CAMPAIGNS[id];
      return `<option value="${esc(id)}">${esc(item.icon)} ${esc(item.label)} · ${esc(item.market)}</option>`;
    }).join('');
    if (!CAMPAIGNS[state.currentCampaign]) state.currentCampaign = 'kbw';
    select.value = state.currentCampaign;
  }

  rebuildCampaignSelect();

  const select = $('campaignSelect');
  if (select && select.dataset.bcwwSelectionIsolation !== '1') {
    select.dataset.bcwwSelectionIsolation = '1';
    select.addEventListener('change', () => {
      state.selected.clear();
      saveState();
      render();
    });
  }

  render();
})();
