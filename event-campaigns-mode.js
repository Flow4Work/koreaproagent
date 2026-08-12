(() => {
  if (typeof CAMPAIGNS === 'undefined' || typeof state === 'undefined') return;

  const EVENT_CAMPAIGNS = {
    wsce: {
      label:'WSCE 단체복', icon:'🌐', market:'해외→한국', message:'en', endpoint:'/api/wsce', short:'WSCE',
      confirmedKey:'wsce_confirmed', empty:'아직 확인된 WSCE 2026 해외 참가사가 없습니다.'
    },
    education_fair: {
      label:'International Education Fair 단체복', icon:'🎓', market:'해외→한국', message:'en', endpoint:'/api/education-fair', short:'Education Fair',
      confirmedKey:'education_fair_confirmed', empty:'아직 확인된 2026 International Education Fair 해외 참가기관이 없습니다.'
    }
  };

  for (const [id, config] of Object.entries(EVENT_CAMPAIGNS)) CAMPAIGNS[id] = { label:config.label, icon:config.icon, market:config.market, message:config.message };

  const cleanText = (value = '', max = 260) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const safeLink = (value = '') => {
    try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) ? url.href : ''; }
    catch { return ''; }
  };
  const isEventCampaign = id => Boolean(EVENT_CAMPAIGNS[id]);
  const selectionKey = id => `kpa.hunt.selected.${id}.v1`;
  const cycleKey = id => `kpa.hunt.cycle.${id}.v1`;

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  }

  function currentEventConfig() { return EVENT_CAMPAIGNS[state.currentCampaign] || null; }

  function strictEventContact(lead = {}) {
    const threshold = Math.max(75, Number(lead.contact_score_threshold) || 75);
    const rows = [lead.contact, ...(Array.isArray(lead.contacts) ? lead.contacts : [])].filter(Boolean);
    return rows.find(contact => {
      if (contact?.qualified !== true || contact?.emailStatus !== 'valid' || Number(contact?.score || 0) < threshold) return false;
      const email = String(contact?.email || '').trim().toLowerCase();
      if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return false;
      const emailDomain = email.split('@')[1] || '';
      const companyDomain = typeof rootHost === 'function' ? rootHost(lead.domain || lead.url || '') : '';
      return Boolean(companyDomain && (emailDomain === companyDomain || emailDomain.endsWith(`.${companyDomain}`)));
    }) || null;
  }

  const previousLeadLanguage = leadLanguage;
  leadLanguage = function internationalEventLeadLanguage(lead = {}) {
    if (isEventCampaign(lead?.campaign)) return 'en';
    return previousLeadLanguage(lead);
  };

  const previousLeadReady = leadReady;
  leadReady = function internationalEventLeadReady(lead = {}) {
    const config = EVENT_CAMPAIGNS[lead?.campaign];
    if (!config) return previousLeadReady(lead);
    return Boolean(
      lead?.verified_company === true &&
      lead?.[config.confirmedKey] === true &&
      lead?.team_origin === 'foreign' &&
      strictEventContact(lead) &&
      cleanText(leadMessage(lead), 12000).length >= 120
    );
  };

  const previousEnrichContact = enrichContact;
  enrichContact = async function internationalEventEnrichContact(lead) {
    await previousEnrichContact(lead);
    if (!isEventCampaign(lead?.campaign)) return;
    const current = state.leads.find(item => item.id === lead.id);
    if (!current) return;
    const strict = strictEventContact(current);
    if (strict) {
      if (current.contact?.email !== strict.email || current.contacts?.length !== 1) {
        patchLead(lead.id, { contact:strict, contacts:[strict], contact_status:'found', contact_failure_reason:'' });
      }
      return;
    }
    patchLead(lead.id, {
      contact:null,
      contacts:[],
      contact_status:'failed',
      contact_failure_reason:'qualified + valid + 회사 도메인 일치 이메일 미확보'
    });
  };

  function visibleEventLeads(id = state.currentCampaign) {
    return state.leads
      .filter(lead => lead?.campaign === id)
      .sort((a,b) =>
        Number(state.selected.has(b.id)) - Number(state.selected.has(a.id)) ||
        Number(leadReady(b)) - Number(leadReady(a)) ||
        Number(b.sales_priority || b.score || 0) - Number(a.sales_priority || a.score || 0)
      );
  }

  function persistCurrentSelection() {
    if (!isEventCampaign(state.currentCampaign)) return;
    const ids = new Set(visibleEventLeads().map(lead => lead.id));
    const selected = [...state.selected].filter(id => ids.has(id));
    localStorage.setItem(selectionKey(state.currentCampaign), JSON.stringify(selected));
  }

  function restoreEventSelection(id = state.currentCampaign) {
    if (!isEventCampaign(id)) return;
    const validIds = new Set(state.leads.filter(lead => lead?.campaign === id).map(lead => lead.id));
    const saved = readJson(selectionKey(id), []).filter(item => validIds.has(item));
    state.selected.clear();
    for (const item of saved) state.selected.add(item);
    saveState();
  }

  function eventSelectedCount(leads = visibleEventLeads()) {
    const ids = new Set(leads.map(lead => lead.id));
    return [...state.selected].filter(id => ids.has(id)).length;
  }

  function eventSummary(leads = visibleEventLeads()) {
    const config = currentEventConfig();
    const ready = leads.filter(leadReady).length;
    const selected = eventSelectedCount(leads);
    const auto = state.auto ? `<span class="hunt-live">자동사냥 ${remainingText()} 남음</span>` : '';
    $('summary').innerHTML = `<strong>${esc(config?.short || '행사')} 후보 ${leads.length}개</strong><span>발송 가능 ${ready}개</span><span>선택 ${selected}개</span>${auto}${state.statusText ? `<span>${esc(state.statusText)}</span>` : ''}`;
  }

  const previousRenderSummary = renderSummary;
  renderSummary = function internationalEventAwareSummary() {
    if (isEventCampaign(state.currentCampaign)) return eventSummary();
    const allLeads = state.leads;
    state.leads = allLeads.filter(lead => !isEventCampaign(lead?.campaign));
    try { return previousRenderSummary(); }
    finally { state.leads = allLeads; }
  };

  function eventStatus(lead = {}) {
    if (leadReady(lead)) return '발송 준비';
    if (lead.contact_status === 'searching') return '이메일 확인 중';
    if (lead.contact_status === 'failed') return '검증된 이메일 미확보';
    return '참가 확인';
  }

  function eventContactHtml(lead = {}) {
    const contact = strictEventContact(lead);
    if (!contact) {
      return `<strong>${esc(cleanText(lead.recommended_role || '담당자', 120))}</strong><small class="pending">${esc(eventStatus(lead))}</small>`;
    }
    const name = cleanText(contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`, 120);
    const role = cleanText(contact.title || lead.recommended_role || '담당자', 120);
    return `<strong>${esc(name || role)}</strong>${name && role && name !== role ? `<span>${esc(role)}</span>` : ''}<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>`;
  }

  function bindEventRows() {
    document.querySelectorAll('.lead-check[data-international-event="1"]').forEach(input => input.addEventListener('change', () => {
      if (input.checked) state.selected.add(input.dataset.id);
      else state.selected.delete(input.dataset.id);
      persistCurrentSelection();
      saveState();
      eventSummary();
    }));
  }

  const previousRender = render;
  render = function internationalEventAwareRender() {
    if (!isEventCampaign(state.currentCampaign)) {
      const allLeads = state.leads;
      state.leads = allLeads.filter(lead => !isEventCampaign(lead?.campaign));
      try { return previousRender(); }
      finally { state.leads = allLeads; }
    }

    updateMainButton();
    const config = currentEventConfig();
    const leads = visibleEventLeads();
    eventSummary(leads);

    if (!leads.length) {
      $('content').innerHTML = `<div class="empty"><strong>${esc(config.empty)}</strong><span>오늘 영업 준비를 누르면 2026 실제 참가 증거와 해외 본체 여부를 확인한 후보만 가져옵니다.</span></div>`;
      return;
    }

    $('content').innerHTML = `<table class="lead-table event-campaign-table"><thead><tr><th></th><th>회사</th><th>담당자 / 검증 이메일</th><th>상태</th><th>행동</th></tr></thead><tbody>${leads.map(lead => {
      const checked = state.selected.has(lead.id) ? 'checked' : '';
      const ready = leadReady(lead);
      const website = safeLink(lead.url);
      const mail = ready ? gmailUrl(lead) : '';
      return `<tr class="data-row ${ready ? 'ready-row' : ''}">
        <td class="select-cell"><input class="lead-check" data-international-event="1" type="checkbox" data-id="${esc(lead.id)}" ${checked} ${ready ? '' : 'disabled'}></td>
        <td class="company"><span class="campaign-badge">${esc(config.short)}</span><strong>${esc(lead.company)}</strong>${website ? `<a href="${esc(website)}" target="_blank" rel="noopener noreferrer">${esc(lead.domain || '')}</a>` : `<span>${esc(lead.domain || '')}</span>`}</td>
        <td class="contact">${eventContactHtml(lead)}</td>
        <td><span class="stage ${ready ? 'stage-ready' : ''}">${esc(eventStatus(lead))}</span></td>
        <td><div class="actions">${mail ? `<a class="mail-btn" href="${esc(mail)}">메일 준비하기</a>` : ''}</div></td>
      </tr>`;
    }).join('')}</tbody></table>`;

    bindEventRows();
  };

  function mergeEventLeads(incoming = [], campaignId = state.currentCampaign) {
    const existing = state.leads.filter(lead => lead?.campaign === campaignId);
    const byId = new Map(existing.map(lead => [lead.id || `${campaignId}:${lead.domain}`, lead]));
    const domains = new Set(existing.map(lead => String(lead.domain || '').toLowerCase()).filter(Boolean));
    const added = [];
    for (const raw of incoming) {
      if (raw?.campaign !== campaignId) continue;
      const domain = String(raw.domain || '').toLowerCase();
      const id = raw.id || `${campaignId}:${domain}`;
      if (!id || !domain || byId.has(id) || domains.has(domain)) continue;
      const lead = { ...raw, id, domain, contact_status:raw.contact_status || 'pending' };
      byId.set(id, lead);
      domains.add(domain);
      added.push(lead);
    }
    const other = state.leads.filter(lead => lead?.campaign !== campaignId);
    state.leads = [...other, ...[...byId.values()].slice(-80)].slice(-MAX_BUFFER);
    saveState();
    return added;
  }

  const previousMergeLeads = mergeLeads;
  mergeLeads = function isolatedOldCampaignMerge(incoming = []) {
    if (incoming.some(lead => isEventCampaign(lead?.campaign))) {
      const campaignId = incoming.find(lead => isEventCampaign(lead?.campaign))?.campaign || state.currentCampaign;
      return mergeEventLeads(incoming, campaignId);
    }
    const allLeads = state.leads;
    const eventLeads = allLeads.filter(lead => isEventCampaign(lead?.campaign));
    state.leads = allLeads.filter(lead => !isEventCampaign(lead?.campaign));
    try {
      const added = previousMergeLeads(incoming);
      const nonEventAfter = state.leads;
      state.leads = [...nonEventAfter, ...eventLeads].slice(-MAX_BUFFER);
      saveState();
      return added;
    } catch (error) {
      state.leads = allLeads;
      throw error;
    }
  };

  function nextEventCycle(id) {
    const next = Number(localStorage.getItem(cycleKey(id)) || '0') + 1;
    localStorage.setItem(cycleKey(id), String(next));
    return next;
  }

  const previousRunHuntCycle = runHuntCycle;
  runHuntCycle = async function internationalEventRunHuntCycle() {
    const config = currentEventConfig();
    if (!config) return previousRunHuntCycle();

    const cycle = nextEventCycle(state.currentCampaign);
    state.statusText = `${config.short} 2026 실제 해외 참가사 확인 중`;
    render();

    const excluded = state.leads
      .filter(lead => lead?.campaign === state.currentCampaign)
      .map(lead => lead.domain)
      .filter(Boolean)
      .slice(-500);
    const result = await post(config.endpoint, { cycle, excludeDomains:excluded, tools:toolKeys() }, 115000);
    const added = mergeEventLeads(result.leads || [], state.currentCampaign);
    const meta = result.meta || {};

    if (added.length) state.statusText = `${added.length}개 참가사 확인 · 이메일 검증 중`;
    else {
      const official = Number(meta.official_foreign_candidates || meta.official_current_participants || 0);
      const fallback = Number(meta.fallback_foreign_candidates || meta.fallback_official_domain_participants || 0);
      state.statusText = `신규 0개 · 공식 참가 ${official}개 · 보강 검증 ${fallback}개`;
    }
    render();

    if (added.length) await mapLimit(added.slice(0, 24), 4, enrichContact);
    state.statusText = added.length ? `${added.length}개 처리 완료` : state.statusText;
    render();
    return added.length;
  };

  function rebuildCampaignSelect() {
    const select = $('campaignSelect');
    if (!select) return;
    const fixed = ['kbw','bcww','wsce','education_fair'];
    const order = [...fixed, ...Object.keys(CAMPAIGNS).filter(id => !fixed.includes(id))];
    select.innerHTML = order.filter(id => CAMPAIGNS[id]).map(id => {
      const item = CAMPAIGNS[id];
      return `<option value="${esc(id)}">${esc(item.icon)} ${esc(item.label)} · ${esc(item.market)}</option>`;
    }).join('');
    if (!CAMPAIGNS[state.currentCampaign]) state.currentCampaign = 'kbw';
    select.value = state.currentCampaign;
  }

  rebuildCampaignSelect();

  const select = $('campaignSelect');
  if (select && select.dataset.internationalEventIsolation !== '1') {
    select.dataset.internationalEventIsolation = '1';
    select.addEventListener('change', () => {
      if (isEventCampaign(state.currentCampaign)) restoreEventSelection(state.currentCampaign);
      render();
    });
  }

  const clearButton = $('clearSelectionBtn');
  if (clearButton && clearButton.dataset.internationalEventIsolation !== '1') {
    clearButton.dataset.internationalEventIsolation = '1';
    clearButton.addEventListener('click', () => {
      if (!isEventCampaign(state.currentCampaign)) return;
      localStorage.setItem(selectionKey(state.currentCampaign), '[]');
      state.selected.clear();
      saveState();
      render();
    });
  }

  if (isEventCampaign(state.currentCampaign)) restoreEventSelection(state.currentCampaign);
  render();
})();
