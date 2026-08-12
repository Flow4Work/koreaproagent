(() => {
  if (typeof CAMPAIGNS === 'undefined' || typeof state === 'undefined') return;

  CAMPAIGNS.bcww = { label:'BCWW 단체복', icon:'📺', market:'해외→한국', message:'en' };

  const cleanText = (value = '', max = 260) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const safeLink = (value = '') => { try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
  const BLOCKED = new Set(['admin','contact','hello','info','office','team','support','help','security','press','media','careers','hr','jobs','legal','privacy','noreply','no-reply']);
  const SELECT_KEY = 'kpa.hunt.selected.bcww.v2';
  const CYCLE_KEY = 'kpa.hunt.cycle.bcww.v2';

  function contactTrust(contact = {}, lead = {}) {
    const email = cleanText(contact?.email, 260).toLowerCase();
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return '';
    const local = email.split('@')[0] || '';
    if (BLOCKED.has(local) || contact?.qualified !== true || Number(contact?.score || 0) < 75) return '';
    const emailDomain = email.split('@')[1] || '';
    const companyDomain = typeof rootHost === 'function' ? rootHost(lead.domain || lead.url || '') : '';
    if (!companyDomain || !(emailDomain === companyDomain || emailDomain.endsWith(`.${companyDomain}`))) return '';
    if (contact?.emailStatus === 'valid') return 'smtp_valid';
    if (contact?.emailStatus === 'official_public' && contact?.officialSource === true && contact?.verificationMethod === 'official_public') return 'official_public';
    return '';
  }

  function trustedBcwwContact(lead = {}) {
    const rows = [lead.contact, ...(Array.isArray(lead.contacts) ? lead.contacts : [])].filter(Boolean);
    return rows
      .map(contact => ({ contact, trust:contactTrust(contact, lead) }))
      .filter(row => row.trust)
      .sort((a,b) => Number(b.trust === 'smtp_valid') - Number(a.trust === 'smtp_valid') || Number(b.contact.score || 0) - Number(a.contact.score || 0))[0] || null;
  }

  // Old BCWW interest/follower fallbacks must never survive into the new mode.
  const keepIds = new Set((state.leads || []).filter(lead => lead?.campaign !== 'bcww' || lead?.bcww_participation_confirmed === true).map(lead => lead.id));
  state.leads = (state.leads || []).filter(lead => lead?.campaign !== 'bcww' || lead?.bcww_participation_confirmed === true);
  state.selected = new Set([...state.selected].filter(id => keepIds.has(id)));
  if (typeof saveState === 'function') saveState();

  const baseLeadLanguage = leadLanguage;
  leadLanguage = function bcwwLeadLanguage(lead = {}) {
    return lead?.campaign === 'bcww' ? 'en' : baseLeadLanguage(lead);
  };

  const baseLeadReady = leadReady;
  leadReady = function bcwwLeadReady(lead = {}) {
    if (lead?.campaign !== 'bcww') return baseLeadReady(lead);
    return Boolean(
      lead?.verified_company === true &&
      lead?.bcww_participation_confirmed === true &&
      lead?.team_origin === 'foreign' &&
      trustedBcwwContact(lead) &&
      cleanText(leadMessage(lead), 12000).length >= 120
    );
  };

  const baseEnrichContact = enrichContact;
  enrichContact = async function bcwwEnrichContact(lead) {
    if (lead?.campaign !== 'bcww') return baseEnrichContact(lead);
    const before = state.leads.find(item => item.id === lead.id) || lead;
    const existing = trustedBcwwContact(before);
    if (existing) {
      if (typeof patchLead === 'function') patchLead(lead.id, { contact:existing.contact, contacts:[existing.contact], contact_status:'found', contact_failure_reason:'' });
      return;
    }
    await baseEnrichContact(lead);
    const current = state.leads.find(item => item.id === lead.id);
    if (!current) return;
    const after = trustedBcwwContact(current);
    if (after) {
      if (typeof patchLead === 'function') patchLead(lead.id, { contact:after.contact, contacts:[after.contact], contact_status:'found', contact_failure_reason:'' });
      return;
    }
    // Keep the verified company visible even when email enrichment fails.
    if (typeof patchLead === 'function') patchLead(lead.id, { contact:null, contacts:[], contact_status:'failed', contact_failure_reason:'이메일 탐색 미완료' });
  };

  function bcwwLeads() {
    return (state.leads || []).filter(lead => lead?.campaign === 'bcww' && lead?.bcww_participation_confirmed === true)
      .sort((a,b) => Number(state.selected.has(b.id)) - Number(state.selected.has(a.id)) || Number(leadReady(b)) - Number(leadReady(a)) || Number(b.sales_priority || b.score || 0) - Number(a.sales_priority || a.score || 0));
  }

  function selectedCount(leads = bcwwLeads()) { const ids = new Set(leads.map(lead => lead.id)); return [...state.selected].filter(id => ids.has(id)).length; }
  function saveSelection() { localStorage.setItem(SELECT_KEY, JSON.stringify([...state.selected].filter(id => bcwwLeads().some(lead => lead.id === id)))); }
  function restoreSelection() {
    let saved = []; try { saved = JSON.parse(localStorage.getItem(SELECT_KEY) || '[]'); } catch {}
    const ids = new Set(bcwwLeads().map(lead => lead.id)); state.selected.clear(); for (const id of saved) if (ids.has(id)) state.selected.add(id); saveState();
  }

  function summary(leads = bcwwLeads()) {
    const ready = leads.filter(leadReady).length;
    const auto = state.auto ? `<span class="hunt-live">자동사냥 ${remainingText()} 남음</span>` : '';
    $('summary').innerHTML = `<strong>BCWW 참가 확인 ${leads.length}개</strong><span>이메일 확보 ${ready}개</span><span>선택 ${selectedCount(leads)}개</span><span>제외 ${state.rejected.size}개</span>${auto}${state.statusText ? `<span>${esc(state.statusText)}</span>` : ''}`;
  }

  const baseSummary = renderSummary;
  renderSummary = function bcwwSummary() { return state.currentCampaign === 'bcww' ? summary() : baseSummary(); };

  function status(lead = {}) {
    const trusted = trustedBcwwContact(lead);
    if (trusted?.trust === 'smtp_valid') return '발송 준비 · 이메일 검증';
    if (trusted?.trust === 'official_public') return '발송 준비 · 공식 공개메일';
    if (lead.contact_status === 'searching') return '이메일 탐색 중';
    if (lead.contact_status === 'failed') return '참가 확인 · 이메일 미확보';
    return '참가 확인';
  }

  function contactHtml(lead = {}) {
    const trusted = trustedBcwwContact(lead);
    if (!trusted) return `<strong>이메일 탐색 미완료</strong><small class="pending">${esc(status(lead))}</small>`;
    const contact = trusted.contact;
    const name = cleanText(contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`, 120);
    const role = cleanText(contact.title || lead.recommended_role || '담당자', 120);
    const proof = trusted.trust === 'official_public' ? '공식 사이트 공개' : '이메일 검증 완료';
    return `<strong>${esc(name || role)}</strong>${name && role && name !== role ? `<span>${esc(role)}</span>` : ''}<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a><small>${esc(proof)}</small>`;
  }

  function bindRows() {
    document.querySelectorAll('.lead-check[data-bcww="1"]').forEach(input => input.addEventListener('change', () => {
      if (input.checked) state.selected.add(input.dataset.id); else state.selected.delete(input.dataset.id);
      saveSelection(); saveState(); summary();
    }));
  }

  const baseRender = render;
  render = function bcwwRender() {
    if (state.currentCampaign !== 'bcww') {
      const all = state.leads; state.leads = all.filter(lead => lead?.campaign !== 'bcww');
      try { return baseRender(); } finally { state.leads = all; }
    }
    updateMainButton();
    const leads = bcwwLeads(); summary(leads);
    if (!leads.length) {
      $('content').innerHTML = '<div class="empty"><strong>아직 확인된 BCWW 2026 해외 참가사가 없습니다.</strong><span>확정 Seed와 웹/RSS/API 검색을 함께 돌려 참가 근거부터 찾습니다. 이메일이 없어도 참가 확인 회사는 사라지지 않습니다.</span></div>';
      return;
    }
    $('content').innerHTML = `<table class="lead-table bcww-table"><thead><tr><th></th><th>회사</th><th>담당자 / 이메일</th><th>상태</th><th>행동</th></tr></thead><tbody>${leads.map(lead => {
      const ready = leadReady(lead), website = safeLink(lead.url), mail = ready ? gmailUrl(lead) : '', checked = state.selected.has(lead.id) ? 'checked' : '';
      return `<tr class="data-row ${ready ? 'ready-row' : ''}"><td class="select-cell"><input class="lead-check" data-bcww="1" type="checkbox" data-id="${esc(lead.id)}" ${checked} ${ready ? '' : 'disabled'}></td><td class="company"><span class="campaign-badge">BCWW</span><strong>${esc(lead.company)}</strong>${website ? `<a href="${esc(website)}" target="_blank" rel="noopener noreferrer">${esc(lead.domain || '')}</a>` : `<span>${esc(lead.domain || '')}</span>`}</td><td class="contact">${contactHtml(lead)}</td><td><span class="stage ${ready ? 'stage-ready' : ''}">${esc(status(lead))}</span></td><td><div class="actions">${mail ? `<a class="mail-btn" href="${esc(mail)}">메일 준비하기</a>` : ''}</div></td></tr>`;
    }).join('')}</tbody></table>`;
    bindRows();
  };

  function mergeBcww(incoming = []) {
    const existing = (state.leads || []).filter(lead => lead?.campaign === 'bcww');
    const byDomain = new Map(existing.map(lead => [String(lead.domain || '').toLowerCase(), lead]));
    const added = [];
    for (const raw of incoming) {
      if (raw?.campaign !== 'bcww') continue;
      const domain = String(raw.domain || '').toLowerCase();
      if (!domain || state.rejected.has(domain)) continue;
      const current = byDomain.get(domain);
      if (!current) { byDomain.set(domain, raw); added.push(raw); continue; }
      // Enrichment is allowed to improve the same verified participant on later cycles.
      const currentReady = Boolean(trustedBcwwContact(current));
      const nextReady = Boolean(trustedBcwwContact(raw));
      if (!currentReady && nextReady) byDomain.set(domain, { ...current, ...raw });
    }
    const other = state.leads.filter(lead => lead?.campaign !== 'bcww');
    state.leads = [...other, ...[...byDomain.values()].slice(-80)].slice(-MAX_BUFFER); saveState(); return added;
  }

  function nextCycle() { const next = Number(localStorage.getItem(CYCLE_KEY) || '0') + 1; localStorage.setItem(CYCLE_KEY, String(next)); return next; }

  const baseRunHuntCycle = runHuntCycle;
  runHuntCycle = async function bcwwRunHuntCycle() {
    if (state.currentCampaign !== 'bcww') return baseRunHuntCycle();
    const cycle = nextCycle(); state.statusText = 'BCWW Seed + 신규 참가사 + 공식 이메일 탐색 중'; render();
    const excluded = [...state.leads.filter(lead => lead?.campaign === 'bcww').map(lead => lead.domain).filter(Boolean), ...state.rejected].slice(-500);
    const result = await post('/api/bcww', { cycle, excludeDomains:excluded, tools:toolKeys() }, 118000);
    const added = mergeBcww(result.leads || []); const meta = result.meta || {};
    state.statusText = added.length
      ? `${added.length}개 신규 참가사 · 이메일 ${Number(meta.contact_ready || 0)}개 확보`
      : `신규 0개 · 참가 확인 ${Number(meta.evidence_verified_companies || 0)}개 · 이메일 ${Number(meta.contact_ready || 0)}개 · 미확보 ${Number(meta.contact_unresolved || 0)}개`;
    render();
    // API already performs the richer contact pass. Only retry verified companies that still have no trusted address.
    const needs = added.filter(lead => !trustedBcwwContact(lead));
    if (needs.length) await mapLimit(needs.slice(0,8), 3, enrichContact);
    render(); return added.length;
  };

  function loadJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
  function seedDrafts(ids = []) {
    const draftKey = 'kpa.mail.review.drafts.v5'; const drafts = loadJson(draftKey, {}); let changed = false;
    for (const id of [...new Set(ids.filter(Boolean))]) {
      const lead = state.leads.find(item => item.id === id && item.campaign === 'bcww'); const trusted = lead ? trustedBcwwContact(lead) : null;
      if (!lead || !leadReady(lead) || !trusted) continue;
      drafts[id] = { ...(drafts[id] || {}), selectedEmails:[trusted.contact.email], included:true, templateId:'B', to:trusted.contact.email, subject:lead.subject || `Quick question about ${lead.company} at BCWW 2026`, body:lead.message_en || leadMessage(lead), translation:lead.message_ko || '' }; changed = true;
    }
    if (changed) localStorage.setItem(draftKey, JSON.stringify(drafts));
  }
  window.addEventListener('click', event => {
    const mail = event.target.closest?.('a.mail-btn'); if (mail) { const id = mail.closest('tr.data-row')?.querySelector('.lead-check')?.dataset?.id || ''; if (id) seedDrafts([id]); return; }
    if (event.target.closest?.('#prepareSelectedBtn')) seedDrafts([...state.selected]);
  }, true);

  function rebuildCampaignSelect() {
    const select = $('campaignSelect'); if (!select) return;
    const order = ['kbw','bcww',...Object.keys(CAMPAIGNS).filter(id => !['kbw','bcww'].includes(id))];
    select.innerHTML = order.filter(id => CAMPAIGNS[id]).map(id => { const item = CAMPAIGNS[id]; return `<option value="${esc(id)}">${esc(item.icon)} ${esc(item.label)} · ${esc(item.market)}</option>`; }).join('');
    if (!CAMPAIGNS[state.currentCampaign]) state.currentCampaign = 'kbw'; select.value = state.currentCampaign;
  }
  rebuildCampaignSelect();
  const select = $('campaignSelect');
  if (select && select.dataset.bcwwHybridSelection !== '1') {
    select.dataset.bcwwHybridSelection = '1'; select.addEventListener('change', () => { if (state.currentCampaign === 'bcww') restoreSelection(); else state.selected.clear(); saveState(); render(); });
  }
  render();
})();
