(() => {
  if (typeof CAMPAIGNS === 'undefined' || typeof state === 'undefined') return;

  const EVENT_CAMPAIGNS = {
    wsce: {
      label:'WSCE 단체복', icon:'🌐', market:'해외→한국', message:'en', endpoint:'/api/wsce', short:'WSCE',
      confirmedKey:'wsce_confirmed', empty:'아직 확인된 WSCE 2026 해외 참가사가 없습니다.'
    },
    kbeauty: {
      label:'K-Beauty Expo 2026 단체복', icon:'💄', market:'해외→한국', message:'en', endpoint:'/api/kbeauty', short:'K-Beauty Expo',
      confirmedKey:'kbeauty_eligible', empty:'아직 확인된 K-Beauty Expo 해외 참가·재참가 후보가 없습니다.'
    },
    education_fair: {
      label:'International Education Fair 단체복', icon:'🎓', market:'해외→한국', message:'en', endpoint:'/api/education-fair', short:'Education Fair',
      confirmedKey:'education_fair_confirmed', empty:'아직 확인된 2026 International Education Fair 해외 참가기관이 없습니다.'
    }
  };

  for (const [id, config] of Object.entries(EVENT_CAMPAIGNS)) CAMPAIGNS[id] = { label:config.label, icon:config.icon, market:config.market, message:config.message };

  const cleanText = (value = '', max = 260) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const safeLink = (value = '') => { try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
  const isEventCampaign = id => Boolean(EVENT_CAMPAIGNS[id]);
  const selectionKey = id => `kpa.hunt.selected.${id}.v1`;
  const cycleKey = id => `kpa.hunt.cycle.${id}.v1`;
  const companyKey = value => cleanText(value,180).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();

  function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
  function currentEventConfig() { return EVENT_CAMPAIGNS[state.currentCampaign] || null; }

  function kbeautyIdentityReady(lead = {}) {
    if (lead?.campaign !== 'kbeauty') return true;
    const identity = lead?.company_identity || {};
    const companyDomain = typeof rootHost === 'function' ? rootHost(lead.domain || lead.url || '') : '';
    const identityDomain = typeof rootHost === 'function' ? rootHost(identity.domain || '') : '';
    return /^K-Beauty v6 evidence \+ official-domain foreign verification$/i.test(cleanText(lead?.verified_by,160))
      && identity?.status === 'verified'
      && Number(identity?.confidence || 0) >= 0.85
      && Boolean(cleanText(identity?.greeting_name,120))
      && Boolean(cleanText(identity?.evidence_url,600))
      && Boolean(companyDomain)
      && identityDomain === companyDomain;
  }

  function strictEventContact(lead = {}) {
    const threshold = Math.max(75, Number(lead.contact_score_threshold) || 75);
    const rows = [lead.contact, ...(Array.isArray(lead.contacts) ? lead.contacts : [])].filter(Boolean);
    return rows.find(contact => {
      const email = String(contact?.email || '').trim().toLowerCase();
      if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return false;
      const emailDomain = email.split('@')[1] || '';
      const companyDomain = typeof rootHost === 'function' ? rootHost(lead.domain || lead.url || '') : '';
      if (!companyDomain || !(emailDomain === companyDomain || emailDomain.endsWith(`.${companyDomain}`))) return false;

      if (lead?.campaign === 'kbeauty') {
        if (contact?.emailStatus === 'invalid') return false;
        if (contact?.emailStatus === 'valid') return true;
        const sources = Array.isArray(contact?.sources) ? contact.sources : [];
        const providers = Array.isArray(contact?.providers) ? contact.providers : String(contact?.provider || '').split('+');
        const officialSource = sources.some(source => { try { return typeof rootHost === 'function' && rootHost(source) === companyDomain; } catch { return false; } });
        const providerEvidence = providers.some(provider => /^(?:hunter|hunter_verify|jina|public_web|prospeo|apollo|tomba|official_site|official_recovery|nvidia_muse_glimmer|tavily)$/i.test(String(provider || '')));
        return officialSource || providerEvidence;
      }

      return contact?.qualified === true && contact?.emailStatus === 'valid' && Number(contact?.score || 0) >= threshold;
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
      kbeautyIdentityReady(lead) &&
      strictEventContact(lead) &&
      cleanText(leadMessage(lead), 12000).length >= 120
    );
  };

  const previousEnrichContact = enrichContact;
  enrichContact = async function internationalEventEnrichContact(lead) {
    if (lead?.campaign === 'kbeauty' && (!lead?.domain || !safeLink(lead?.url))) {
      patchLead(lead.id, { contact:null, contacts:[], contact_status:'website_pending', contact_failure_reason:'공식 사이트 확인 중' });
      return;
    }
    await previousEnrichContact(lead);
    if (!isEventCampaign(lead?.campaign)) return;
    const current = state.leads.find(item => item.id === lead.id);
    if (!current) return;
    const strict = strictEventContact(current);
    if (strict) {
      if (current.contact?.email !== strict.email || current.contacts?.length !== 1) patchLead(lead.id, { contact:strict, contacts:[strict], contact_status:'found', contact_failure_reason:'' });
      return;
    }
    patchLead(lead.id, {
      contact:null, contacts:[], contact_status:'failed',
      contact_failure_reason:lead?.campaign === 'kbeauty' ? '실제 발견 + 회사 도메인 일치 이메일 미확보' : 'qualified + valid + 회사 도메인 일치 이메일 미확보'
    });
  };

  function visibleEventLeads(id = state.currentCampaign) {
    return state.leads.filter(lead => lead?.campaign === id).sort((a,b) =>
      Number(state.selected.has(b.id)) - Number(state.selected.has(a.id)) ||
      Number(leadReady(b)) - Number(leadReady(a)) ||
      Number(b.kbeauty_confirmed === true) - Number(a.kbeauty_confirmed === true) ||
      Number(Boolean(b.domain)) - Number(Boolean(a.domain)) ||
      Number(b.sales_priority || b.score || 0) - Number(a.sales_priority || a.score || 0)
    );
  }

  async function fastKBeautyContacts() {
    const candidates = visibleEventLeads('kbeauty')
      .filter(lead => !strictEventContact(lead) && lead.fast_contact_done !== true)
      .slice(0, 60);
    if (!candidates.length) return { checked:0, found:0, resolved:0 };

    const tools = toolKeys();
    for (const lead of candidates) {
      const current = state.leads.find(item => item.id === lead.id);
      if (current) current.contact_status = 'searching';
    }
    saveState(); render();

    let response;
    try {
      response = await post('/api/find-contacts', {
        action:'kbeauty_fast',
        exaKey:tools.exaKey || '',
        items:candidates.map(lead => ({
          id:lead.id,
          company:lead.company,
          country:lead.team_origin_country || '',
          domain:lead.domain || '',
          url:lead.url || ''
        }))
      }, 65000);
    } catch {
      for (const lead of candidates) {
        const current = state.leads.find(item => item.id === lead.id);
        if (current) current.contact_status = current.domain ? 'pending' : 'website_pending';
      }
      saveState(); render();
      return { checked:candidates.length, found:0, resolved:0 };
    }

    let found = 0, resolved = 0;
    const rows = Array.isArray(response?.results) ? response.results : [];
    const byId = new Map(rows.map(row => [row.id,row]));
    for (const lead of candidates) {
      const current = state.leads.find(item => item.id === lead.id);
      if (!current) continue;
      const row = byId.get(lead.id);
      current.fast_contact_done = true;
      if (!row) {
        current.contact_status = current.domain ? 'failed' : 'website_pending';
        continue;
      }
      if (row.domain && !current.domain) {
        current.domain = row.domain;
        current.url = row.url || `https://${row.domain}/`;
        current.website_unresolved = false;
        resolved += 1;
      }
      const contacts = Array.isArray(row.contacts) ? row.contacts : [];
      if (contacts.length) {
        current.contact = contacts[0];
        current.contacts = contacts;
        current.contact_provider = 'multi_provider';
        current.contact_status = 'found';
        current.contact_failure_reason = '';
        found += 1;
      } else {
        current.contact_status = current.domain ? 'failed' : 'website_pending';
        current.contact_failure_reason = current.domain ? '병렬 검색 미확보' : '공식 사이트 확인 중';
      }
    }
    saveState(); render();
    return { checked:candidates.length, found, resolved };
  }

  function persistCurrentSelection() {
    if (!isEventCampaign(state.currentCampaign)) return;
    const ids = new Set(visibleEventLeads().map(lead => lead.id));
    localStorage.setItem(selectionKey(state.currentCampaign), JSON.stringify([...state.selected].filter(id => ids.has(id))));
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
    const auto = state.auto
      ? state.currentCampaign === 'kbeauty'
        ? `<span class="hunt-live">K-Beauty 계속 탐색 중</span>`
        : `<span class="hunt-live">자동사냥 ${remainingText()} 남음</span>`
      : '';
    const target = state.currentCampaign === 'kbeauty' ? `<span>목표 500</span>` : '';
    $('summary').innerHTML = `<strong>${esc(config?.short || '행사')} 후보 ${leads.length}개</strong>${target}<span>발송 가능 ${ready}개</span><span>선택 ${selected}개</span>${auto}${state.statusText ? `<span>${esc(state.statusText)}</span>` : ''}`;
  }

  const previousRenderSummary = renderSummary;
  renderSummary = function internationalEventAwareSummary() {
    if (isEventCampaign(state.currentCampaign)) return eventSummary();
    const allLeads = state.leads;
    state.leads = allLeads.filter(lead => !isEventCampaign(lead?.campaign));
    try { return previousRenderSummary(); } finally { state.leads = allLeads; }
  };

  function eventStatus(lead = {}) {
    if (leadReady(lead)) return '발송 준비';
    if (lead.campaign === 'kbeauty' && !kbeautyIdentityReady(lead)) return '회사·행사 검증 중';
    if (lead.contact_status === 'searching') return '이메일 확인 중';
    if (lead.contact_status === 'website_pending') return '공식 사이트 확인 중';
    if (lead.contact_status === 'failed') return '이메일 미확보';
    if (lead.campaign === 'kbeauty') return lead.kbeauty_confirmed ? '2026 참가 확인' : '2025 참가 · 2026 재참가 확인';
    return '참가 확인';
  }

  function eventContactHtml(lead = {}) {
    const contact = strictEventContact(lead);
    if (!contact) return `<strong>${esc(cleanText(lead.recommended_role || '담당자', 120))}</strong><small class="pending">${esc(eventStatus(lead))}</small>`;
    const name = cleanText(contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`, 120);
    const role = cleanText(contact.title || lead.recommended_role || '담당자', 120);
    return `<strong>${esc(name || role)}</strong>${name && role && name !== role ? `<span>${esc(role)}</span>` : ''}<span>${esc(contact.email)}</span>`;
  }

  function bindEventRows() {
    document.querySelectorAll('.lead-check[data-international-event="1"]').forEach(input => input.addEventListener('change', () => {
      if (input.checked) state.selected.add(input.dataset.id); else state.selected.delete(input.dataset.id);
      persistCurrentSelection(); saveState(); eventSummary();
    }));
  }

  const previousRender = render;
  render = function internationalEventAwareRender() {
    if (!isEventCampaign(state.currentCampaign)) {
      const allLeads = state.leads;
      state.leads = allLeads.filter(lead => !isEventCampaign(lead?.campaign));
      try { return previousRender(); } finally { state.leads = allLeads; }
    }

    updateMainButton();
    const config = currentEventConfig();
    const leads = visibleEventLeads();
    eventSummary(leads);

    if (!leads.length) {
      const copy = state.currentCampaign === 'kbeauty'
        ? '후보 찾기를 누르면 2026 확정 신호를 먼저 찾고, 부족하면 2025 실제 해외 참가사를 재참가 후보로 정확히 보강합니다.'
        : '오늘 영업 준비를 누르면 2026 실제 참가 증거와 해외 본체 여부를 확인한 후보만 가져옵니다.';
      $('content').innerHTML = `<div class="empty"><strong>${esc(config.empty)}</strong><span>${esc(copy)}</span></div>`;
      return;
    }

    $('content').innerHTML = `<table class="lead-table event-campaign-table"><thead><tr><th></th><th>회사</th><th>담당자 / 이메일</th><th>상태</th><th>행동</th></tr></thead><tbody>${leads.map(lead => {
      const checked = state.selected.has(lead.id) ? 'checked' : '';
      const ready = leadReady(lead);
      const website = safeLink(lead.url);
      const mail = ready ? gmailUrl(lead) : '';
      const tier = lead.campaign === 'kbeauty' ? `<small>${esc(lead.kbeauty_confirmed ? '2026 직접 신호' : '2025 실제 참가 → 2026 재참가 후보')}</small>` : '';
      const site = website
        ? `<a href="${esc(website)}" target="_blank" rel="noopener noreferrer">${esc(lead.domain || '')}</a>`
        : lead.campaign === 'kbeauty' ? `<span>공식 사이트 확인 중</span>` : `<span>${esc(lead.domain || '')}</span>`;
      return `<tr class="data-row ${ready ? 'ready-row' : ''}">
        <td class="select-cell"><input class="lead-check" data-international-event="1" type="checkbox" data-id="${esc(lead.id)}" ${checked} ${ready ? '' : 'disabled'}></td>
        <td class="company"><span class="campaign-badge">${esc(config.short)}</span><strong>${esc(lead.company)}</strong>${tier}${site}</td>
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
    const companies = new Set(existing.map(lead => companyKey(lead.company)).filter(Boolean));
    const added = [];
    for (const raw of incoming) {
      if (raw?.campaign !== campaignId) continue;
      const domain = String(raw.domain || '').toLowerCase();
      const ckey = companyKey(raw.company);
      const id = raw.id || `${campaignId}:${domain || ckey}`;
      if (!id || byId.has(id)) continue;
      if (domain && domains.has(domain)) continue;
      if (!domain && campaignId !== 'kbeauty') continue;
      if (!domain && ckey && companies.has(ckey)) continue;
      const lead = { ...raw, id, domain, contact_status:raw.contact_status || (domain ? 'pending' : 'website_pending') };
      byId.set(id, lead);
      if (domain) domains.add(domain);
      if (ckey) companies.add(ckey);
      added.push(lead);
    }
    const other = state.leads.filter(lead => lead?.campaign !== campaignId);
    state.leads = [...other, ...[...byId.values()].slice(-100)].slice(-MAX_BUFFER);
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
    } catch (error) { state.leads = allLeads; throw error; }
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
    const currentCount = visibleEventLeads().length;
    state.statusText = state.currentCampaign === 'kbeauty'
      ? `해외 후보 ${currentCount}/500 · 정확한 회사 확인 중`
      : `${config.short} 2026 실제 해외 참가사 확인 중`;
    render();

    const excluded = state.leads.filter(lead => lead?.campaign === state.currentCampaign).map(lead => lead.domain).filter(Boolean).slice(-500);
    const payload = { cycle, excludeDomains:excluded, tools:toolKeys() };
    if (state.currentCampaign === 'kbeauty') Object.assign(payload, { targetFloor:500, currentCount });
    const result = await post(config.endpoint, payload, 115000);
    const added = mergeEventLeads(result.leads || [], state.currentCampaign);
    const meta = result.meta || {};
    const total = visibleEventLeads().length;

    if (state.currentCampaign === 'kbeauty') {
      const confirmed = Number(meta.current_2026_candidates || 0);
      const repeats = Number(meta.repeat_2025_candidates || 0);
      const resolved = Number(meta.website_resolved || 0);
      const unresolved = Number(meta.website_unresolved || 0);
      state.statusText = `현재 ${total}/500 · 신규 ${added.length} · 2026 직접 ${confirmed} · 재참가 후보 ${repeats} · 사이트 ${resolved}확인/${unresolved}확인중`;
    } else if (added.length) state.statusText = `${added.length}개 참가사 확인 · 이메일 검증 중`;
    else {
      const official = Number(meta.official_foreign_candidates || meta.official_current_participants || 0);
      const fallback = Number(meta.fallback_foreign_candidates || meta.fallback_official_domain_participants || 0);
      state.statusText = `신규 0개 · 공식 참가 ${official}개 · 보강 검증 ${fallback}개`;
    }
    render();

    if (state.currentCampaign === 'kbeauty') {
      state.statusText = `해외 후보 ${visibleEventLeads().length}/500 · 병렬 사이트 확인 + 이메일 수집 중`;
      render();
      const fast = await fastKBeautyContacts();
      const slowFallback = visibleEventLeads('kbeauty')
        .filter(lead => lead.domain && safeLink(lead.url) && !strictEventContact(lead) && lead.contact_status === 'failed')
        .slice(0, 10);
      if (slowFallback.length) await mapLimit(slowFallback, 6, enrichContact);
      state.statusText = `해외 후보 ${visibleEventLeads().length}/500 · 빠른 이메일 ${fast.found}개 · 사이트 추가 확인 ${fast.resolved}개`;
    } else {
      if (added.length) await mapLimit(added.slice(0, 28), 4, enrichContact);
      if (added.length) state.statusText = `${added.length}개 처리 완료`;
    }
    render();
    return added.length;
  };

  function rebuildCampaignSelect() {
    const select = $('campaignSelect');
    if (!select) return;
    const fixed = ['kbw','bcww','kbeauty','wsce','education_fair'];
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
    select.addEventListener('change', () => { if (isEventCampaign(state.currentCampaign)) restoreEventSelection(state.currentCampaign); render(); });
  }

  const clearButton = $('clearSelectionBtn');
  if (clearButton && clearButton.dataset.internationalEventIsolation !== '1') {
    clearButton.dataset.internationalEventIsolation = '1';
    clearButton.addEventListener('click', () => {
      if (!isEventCampaign(state.currentCampaign)) return;
      localStorage.setItem(selectionKey(state.currentCampaign), '[]'); state.selected.clear(); saveState(); render();
    });
  }

  if (isEventCampaign(state.currentCampaign)) restoreEventSelection(state.currentCampaign);
  render();
})();