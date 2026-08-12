(() => {
  if (typeof CAMPAIGNS === 'undefined' || typeof state === 'undefined') return;

  CAMPAIGNS.bcww = { label:'BCWW 단체복', icon:'📺', market:'해외→한국', message:'en' };

  const cleanText = (value = '', max = 260) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const safeLink = (value = '') => {
    try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) ? url.href : ''; }
    catch { return ''; }
  };
  const blockedMailboxes = new Set(['admin','contact','hello','info','office','team','support','help','security','press','media','careers','hr','jobs','legal','privacy']);

  function strictBcwwContact(lead = {}) {
    const threshold = Math.max(75, Number(lead.contact_score_threshold) || 75);
    const rows = [lead.contact, ...(Array.isArray(lead.contacts) ? lead.contacts : [])].filter(Boolean);
    return rows.find(contact => {
      const email = String(contact?.email || '').trim().toLowerCase();
      const local = email.split('@')[0] || '';
      if (blockedMailboxes.has(local)) return false;
      if (contact?.qualified !== true || contact?.emailStatus !== 'valid' || Number(contact?.score || 0) < threshold) return false;
      if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return false;
      const emailDomain = email.split('@')[1] || '';
      const companyDomain = typeof rootHost === 'function' ? rootHost(lead.domain || lead.url || '') : '';
      return Boolean(companyDomain && (emailDomain === companyDomain || emailDomain.endsWith(`.${companyDomain}`)));
    }) || null;
  }

  // Remove stale BCWW rows created by the old interest/follower fallback.
  const verifiedIds = new Set(state.leads
    .filter(lead => lead?.campaign !== 'bcww' || lead?.bcww_participation_confirmed === true)
    .map(lead => lead.id));
  state.leads = state.leads.filter(lead => lead?.campaign !== 'bcww' || lead?.bcww_participation_confirmed === true);
  state.selected = new Set([...state.selected].filter(id => verifiedIds.has(id)));
  if (typeof saveState === 'function') saveState();

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
      lead?.verified_company === true &&
      lead?.bcww_participation_confirmed === true &&
      lead?.team_origin === 'foreign' &&
      contact &&
      cleanText(leadMessage(lead), 12000).length >= 120
    );
  };

  const originalEnrichContact = enrichContact;
  enrichContact = async function bcwwEnrichContact(lead) {
    if (lead?.campaign !== 'bcww') return originalEnrichContact(lead);

    const before = state.leads.find(item => item.id === lead.id) || lead;
    const alreadyStrict = strictBcwwContact(before);
    if (alreadyStrict) {
      if (before.contact?.email !== alreadyStrict.email || (before.contacts || []).length !== 1) {
        patchLead(lead.id, { contact:alreadyStrict, contacts:[alreadyStrict], contact_status:'found' });
      }
      return;
    }

    await originalEnrichContact(lead);
    const current = state.leads.find(item => item.id === lead.id);
    if (!current) return;
    const strict = strictBcwwContact(current);
    if (strict) {
      patchLead(lead.id, { contact:strict, contacts:[strict], contact_status:'found', contact_failure_reason:'' });
      return;
    }
    patchLead(lead.id, {
      contact:null,
      contacts:[],
      contact_status:'failed',
      contact_failure_reason:'검증된 이메일 미확보'
    });
  };

  function bcwwVisibleLeads() {
    return state.leads
      .filter(lead => lead?.campaign === 'bcww' && lead?.bcww_participation_confirmed === true)
      .sort((a, b) =>
        Number(state.selected.has(b.id)) - Number(state.selected.has(a.id)) ||
        Number(leadReady(b)) - Number(leadReady(a)) ||
        Number(b.sales_priority || b.score || 0) - Number(a.sales_priority || a.score || 0)
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
    $('summary').innerHTML = `<strong>BCWW 검증 후보 ${leads.length}개</strong><span>발송 가능 ${ready}개</span><span>선택 ${selected}개</span><span>제외 ${state.rejected.size}개</span>${auto}${state.statusText ? `<span>${esc(state.statusText)}</span>` : ''}`;
  }

  const originalRenderSummary = renderSummary;
  renderSummary = function bcwwAwareSummary() {
    if (state.currentCampaign === 'bcww') return bcwwSummary();
    return originalRenderSummary();
  };

  function bcwwStatus(lead = {}) {
    if (leadReady(lead)) return '발송 준비';
    if (lead.contact_status === 'searching') return '이메일 검증 중';
    if (lead.contact_status === 'failed') return '검증된 이메일 미확보';
    if (lead.bcww_participation_confirmed === true) return '참가 검증 완료';
    return '참가 근거 미확인';
  }

  function bcwwContactHtml(lead = {}) {
    const contact = strictBcwwContact(lead);
    if (!contact) {
      const text = lead.contact_status === 'searching' ? '검증된 이메일 확인 중' : '검증된 이메일 미확보';
      return `<strong>${esc(text)}</strong><small class="pending">${esc(bcwwStatus(lead))}</small>`;
    }
    const name = cleanText(contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`, 120);
    const role = cleanText(contact.title || '담당자', 120);
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
      $('content').innerHTML = '<div class="empty"><strong>아직 발송 가능한 BCWW 2026 해외 참가사가 없습니다.</strong><span>참가 근거 + 공식 회사 도메인 + 실제 valid 이메일까지 검증된 회사만 표시합니다.</span></div>';
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
    state.statusText = 'BCWW 2026 참가 근거·회사·이메일 교차 검증 중';
    render();

    const excluded = [
      ...state.leads.filter(lead => lead?.campaign === 'bcww').map(lead => lead.domain).filter(Boolean),
      ...state.rejected
    ].slice(-500);
    const result = await post('/api/bcww', {
      cycle:state.cycle,
      excludeDomains:excluded,
      tools:toolKeys()
    }, 118000);

    const added = mergeLeads(result.leads || []);
    const meta = result.meta || {};
    if (added.length) {
      state.statusText = `${added.length}개 추가 · 참가+valid 이메일 검증 완료`;
    } else {
      const evidence = Number(meta.evidence_verified_companies || 0);
      const attempted = Number(meta.contact_attempted || 0);
      const unresolved = Number(meta.contact_unresolved || 0);
      state.statusText = `신규 0개 · 참가 검증 ${evidence}개 · 이메일 탐색 ${attempted}개 · 미확보 ${unresolved}개`;
    }
    render();

    const needsContact = added.filter(lead => !strictBcwwContact(lead));
    if (needsContact.length) await mapLimit(needsContact.slice(0, 12), 3, enrichContact);
    state.statusText = added.length ? `${added.length}개 처리 완료` : state.statusText;
    render();
    return added.length;
  };

  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  }

  function seedBcwwDrafts(ids = []) {
    const draftKey = 'kpa.mail.review.drafts.v5';
    const drafts = loadJson(draftKey, {});
    let changed = false;
    for (const id of [...new Set(ids.filter(Boolean))]) {
      const lead = state.leads.find(item => item.id === id && item.campaign === 'bcww');
      if (!lead || !leadReady(lead)) continue;
      const contact = strictBcwwContact(lead);
      if (!contact) continue;
      drafts[id] = {
        ...(drafts[id] || {}),
        selectedEmails:[contact.email],
        included:true,
        templateId:'B',
        to:contact.email,
        subject:lead.subject || `Quick question about ${lead.company} at BCWW 2026`,
        body:lead.message_en || leadMessage(lead),
        translation:lead.message_ko || ''
      };
      changed = true;
    }
    if (changed) localStorage.setItem(draftKey, JSON.stringify(drafts));
  }

  window.addEventListener('click', event => {
    const mail = event.target.closest?.('a.mail-btn');
    if (mail) {
      const id = mail.closest('tr.data-row')?.querySelector('.lead-check')?.dataset?.id || '';
      if (id) seedBcwwDrafts([id]);
      return;
    }
    if (event.target.closest?.('#prepareSelectedBtn')) seedBcwwDrafts([...state.selected]);
  }, true);

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
