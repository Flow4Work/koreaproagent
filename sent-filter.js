(() => {
  const MATCH_ENDPOINT = '/api/gmail?action=sent-companies';
  const DOMAIN_ENDPOINT = '/api/gmail?action=sent-domains';
  const SEEN_DOMAINS_KEY = 'kpa.hunt.seenDomains.v1';
  const SENT_DOMAINS_CACHE_KEY = 'kpa.hunt.sentDomains.v1';
  const SENT_DOMAINS_CACHE_TTL = 5 * 60 * 1000;
  const MAX_SEEN_DOMAINS = 2000;
  const REVERIFY_BUTTON_ID = 'reverifyCandidatesBtn';
  const REVERIFY_BATCH_SIZE = 4;
  let recoveryRunning = false;
  let recoveryStopRequested = false;

  function clean(value = '', max = 500) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function normalizeDomain(value = '') {
    let raw = clean(value, 500).toLowerCase();
    if (!raw) return '';
    if (raw.includes('@') && !raw.includes('://')) raw = raw.split('@').pop() || '';
    try {
      const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
      raw = url.hostname;
    } catch {
      raw = raw.split('/')[0].split(':')[0];
    }
    raw = raw.replace(/^www\./, '').replace(/\.+$/, '');
    if (!raw.includes('.') || !/^[a-z0-9.-]+$/i.test(raw)) return '';
    const parts = raw.split('.').filter(Boolean);
    if (parts.length <= 2) return raw;
    const secondLevel = new Set(['ac','co','com','edu','go','gov','ne','net','or','org']);
    const depth = parts.at(-1)?.length === 2 && secondLevel.has(parts.at(-2)) ? 3 : 2;
    return parts.slice(-depth).join('.');
  }

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  }

  function companyKey(lead = {}) {
    return lead.domain || lead.url || lead.contact?.email || lead.company || '';
  }

  function leadId(lead = {}, index = 0) {
    return lead.id || `${lead.campaign || 'lead'}:${lead.domain || lead.company || index}`;
  }

  function seenDomains() {
    return new Set((readJson(SEEN_DOMAINS_KEY, []) || []).map(normalizeDomain).filter(Boolean));
  }

  function rememberDomains(leads = []) {
    const seen = seenDomains();
    for (const lead of leads) {
      const domain = normalizeDomain(companyKey(lead));
      if (domain) seen.add(domain);
    }
    const values = [...seen].slice(-MAX_SEEN_DOMAINS);
    localStorage.setItem(SEEN_DOMAINS_KEY, JSON.stringify(values));
    return values;
  }

  function seedSeenDomains() {
    try {
      if (typeof state !== 'undefined' && Array.isArray(state.leads)) rememberDomains(state.leads);
    } catch { /* state is optional during startup */ }
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function sentIdsFor(leads = []) {
    const items = leads.map((lead, index) => ({ id: leadId(lead, index), key: companyKey(lead) }));
    const data = await requestJson(MATCH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    return new Set(Array.isArray(data.sentIds) ? data.sentIds : []);
  }

  async function sentDomainList(force = false) {
    const cached = readJson(SENT_DOMAINS_CACHE_KEY, null);
    if (!force && cached?.savedAt && Date.now() - Number(cached.savedAt) < SENT_DOMAINS_CACHE_TTL && Array.isArray(cached.domains)) {
      return cached.domains.map(normalizeDomain).filter(Boolean);
    }
    const data = await requestJson(DOMAIN_ENDPOINT, { method: 'POST' });
    const domains = [...new Set((Array.isArray(data.domains) ? data.domains : []).map(normalizeDomain).filter(Boolean))];
    localStorage.setItem(SENT_DOMAINS_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), domains }));
    return domains;
  }

  function notifySuppressed(count = 0) {
    window.KPASentHistory?.notifySuppressed?.(count);
  }

  async function removeExistingSentLeads() {
    if (typeof state === 'undefined' || !Array.isArray(state.leads) || !state.leads.length) return;
    const [sentIds, domains] = await Promise.all([
      sentIdsFor(state.leads),
      sentDomainList().catch(() => [])
    ]);
    const sentDomains = new Set(domains);
    const before = state.leads.length;
    state.leads = state.leads.filter((lead, index) => {
      const id = leadId(lead, index);
      const domain = normalizeDomain(companyKey(lead));
      const remove = sentIds.has(id) || (domain && sentDomains.has(domain));
      if (remove) state.selected?.delete?.(id);
      return !remove;
    });
    const removed = before - state.leads.length;
    if (!removed) return;
    if (typeof saveState === 'function') saveState();
    if (typeof render === 'function') render();
    notifySuppressed(removed);
  }

  function mergeExclusions(payload = {}, sent = []) {
    return [...new Set([
      ...(Array.isArray(payload.excludeDomains) ? payload.excludeDomains : []),
      ...seenDomains(),
      ...sent
    ].map(normalizeDomain).filter(Boolean))].slice(-500);
  }

  function leadContacts(lead = {}) {
    const rows = [lead.contact, ...(Array.isArray(lead.contacts) ? lead.contacts : [])].filter(Boolean);
    const seen = new Set();
    return rows.filter(contact => {
      const key = clean(contact?.email || contact?.linkedinUrl || contact?.name, 240).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 12);
  }

  function recoveryCandidates() {
    if (typeof state === 'undefined' || !Array.isArray(state.leads)) return [];
    return state.leads.filter(lead => {
      if (!lead?.verified_company || !lead?.url || lead.contact_status === 'searching') return false;
      if (typeof leadReady === 'function' && leadReady(lead)) return false;
      return true;
    });
  }

  function applyContactResult(id, result = {}) {
    if (typeof patchLead !== 'function') return;
    const primary = result.contact || null;
    patchLead(id, {
      contact: primary,
      contacts: result.contacts || [],
      contact_provider: result.provider || null,
      contact_provider_status: result.provider_status || {},
      contact_attempts: result.attempts || [],
      contact_score_threshold: result.score_threshold || 75,
      contact_failure_type: result.failure_type || '',
      contact_failure_reason: result.failure_reason || '',
      contact_verification_summary: result.verification_summary || {},
      contact_last_verified_at: new Date().toISOString(),
      contact_status: primary?.email ? 'found' : 'failed'
    });
  }

  if (typeof diagnostics === 'function' && typeof $ === 'function') {
    diagnostics = async function enhancedDiagnostics() {
      const panel = $('diagPanel');
      panel.classList.remove('hidden');
      panel.innerHTML = '<div class="diag">확인 중…</div>';
      try {
        const health = await requestJson(`/api/health?t=${Date.now()}`);
        const providers = health.contactProviders || {};
        const line = (name, ok, detail) => `<div class="diag-row"><b class="${ok ? 'diag-ok' : 'diag-bad'}">${ok ? '✓' : '·'}</b><span>${escapeHtml(name)} · ${escapeHtml(detail)}</span></div>`;
        panel.innerHTML = `<div class="diag">${line('기본 검색', health.tavilyConfigured, health.tavilyConfigured ? 'Tavily 연결됨' : '설정 필요')}${line('공식 웹 탐색', providers.publicWeb, providers.publicWeb ? '메일·mailto·숨김 이메일·사이트맵 탐색' : '미연결')}${line('페이지 분석', providers.jina, providers.jina ? 'Jina 환경변수 연결됨' : '미연결')}${line('메일 검색·검증', providers.hunter, providers.hunter ? 'Hunter 검색·SMTP 검증 연결됨' : '미연결')}${line('Prospeo', providers.prospeo, providers.prospeo ? '전체 공급자 탐색에 포함' : '미연결')}${line('Apollo', providers.apollo, providers.apollo ? '전체 공급자 탐색에 포함' : '미연결')}${line('Tomba', providers.tomba, providers.tomba ? '전체 공급자 탐색에 포함' : '미연결')}${line('재검증 대기', recoveryCandidates().length > 0, `${recoveryCandidates().length}개 후보`)}</div>`;
        const note = $('searchSettingsNote');
        if (note) {
          const active = ['Tavily','공식 웹',providers.jina ? 'Jina' : '',providers.hunter ? 'Hunter' : '',providers.prospeo ? 'Prospeo' : '',providers.apollo ? 'Apollo' : '',providers.tomba ? 'Tomba' : ''].filter(Boolean);
          note.textContent = `${active.join(' + ')} 활성`;
        }
      } catch (error) {
        panel.innerHTML = `<div class="diag">${escapeHtml(clean(error?.message || '상태 확인 실패', 180))}</div>`;
      }
    };
  }

  if (typeof post === 'function') {
    const originalPost = post;
    post = async function filteredPost(url, payload, timeout) {
      if (url !== '/api/hunt') return originalPost(url, payload, timeout);
      const sent = await sentDomainList().catch(() => []);
      const requestPayload = {
        ...(payload || {}),
        excludeDomains: mergeExclusions(payload, sent)
      };
      const result = await originalPost('/api/contact', { ...requestPayload, action: 'hunt_v2' }, timeout);
      if (!Array.isArray(result?.leads) || !result.leads.length) return result;

      const sentSet = new Set(sent);
      const sentIds = await sentIdsFor(result.leads).catch(() => new Set());
      const before = result.leads.length;
      result.leads = result.leads.filter((lead, index) => {
        const domain = normalizeDomain(companyKey(lead));
        return !sentIds.has(leadId(lead, index)) && !(domain && sentSet.has(domain));
      });
      const suppressed = before - result.leads.length;
      if (suppressed) {
        result.meta = { ...(result.meta || {}), sent_suppressed: suppressed };
        notifySuppressed(suppressed);
      }
      rememberDomains(result.leads);
      return result;
    };
  }

  if (typeof enrichContact === 'function' && typeof patchLead === 'function') {
    enrichContact = async function enrichContactWithDiagnostics(lead) {
      patchLead(lead.id, { contact_status: 'searching', contact_failure_reason: '' });
      try {
        const existingContacts = leadContacts(lead);
        const result = await post('/api/contact', {
          url: lead.url,
          company: lead.company,
          campaign: lead.campaign,
          signal: lead.signal,
          recommendedRole: lead.recommended_role,
          roleTargets: lead.role_targets || [],
          existingContacts,
          forceVerify: existingContacts.length > 0,
          verifyLimit: existingContacts.length > 0 ? 12 : 8
        }, 70000);
        applyContactResult(lead.id, result);
      } catch (error) {
        if (!state.auto && /중단/.test(error?.message || '')) return;
        patchLead(lead.id, {
          contact_status: 'failed',
          contact_failure_type: 'request_error',
          contact_failure_reason: clean(error?.message || '이메일 수집 실패', 180)
        });
      }
    };
  }

  async function reverifyCandidates() {
    const button = document.getElementById(REVERIFY_BUTTON_ID);
    if (recoveryRunning) {
      recoveryStopRequested = true;
      if (button) button.textContent = '중단 요청됨';
      return;
    }
    const candidates = recoveryCandidates();
    if (!candidates.length) {
      if (typeof state !== 'undefined') state.statusText = '재검증할 후보 없음';
      if (typeof renderSummary === 'function') renderSummary();
      return;
    }

    recoveryRunning = true;
    recoveryStopRequested = false;
    let processed = 0;
    let qualified = 0;
    if (button) {
      button.disabled = false;
      button.textContent = '재검증 중단';
    }

    try {
      for (let index = 0; index < candidates.length; index += REVERIFY_BATCH_SIZE) {
        if (recoveryStopRequested) break;
        const batch = candidates.slice(index, index + REVERIFY_BATCH_SIZE);
        for (const lead of batch) patchLead(lead.id, { contact_status: 'searching', contact_failure_reason: '' });
        if (typeof state !== 'undefined') state.statusText = `검증 후보 재검증 ${processed}/${candidates.length}`;
        if (typeof renderSummary === 'function') renderSummary();

        const response = await post('/api/contact', {
          action: 'reverify_batch',
          items: batch.map(lead => ({
            id: lead.id,
            url: lead.url,
            company: lead.company,
            campaign: lead.campaign,
            signal: lead.signal,
            recommendedRole: lead.recommended_role,
            roleTargets: lead.role_targets || [],
            existingContacts: leadContacts(lead),
            verifyLimit: 12
          }))
        }, 90000);

        for (const result of response.results || []) {
          applyContactResult(result.id, result);
          if (result.contact?.qualified) qualified += 1;
          processed += 1;
        }
        if (typeof state !== 'undefined') state.statusText = `재검증 ${processed}/${candidates.length} · 발송 가능 +${qualified}`;
        if (typeof renderSummary === 'function') renderSummary();
      }
    } catch (error) {
      if (typeof state !== 'undefined') state.statusText = `재검증 중단 · ${clean(error?.message || '요청 실패', 120)}`;
    } finally {
      recoveryRunning = false;
      const stopped = recoveryStopRequested;
      recoveryStopRequested = false;
      if (typeof state !== 'undefined' && !String(state.statusText || '').includes('중단 ·')) {
        state.statusText = stopped
          ? `재검증 수동 중단 · ${processed}개 처리 · 발송 가능 +${qualified}`
          : `재검증 완료 · ${processed}개 처리 · 발송 가능 +${qualified}`;
      }
      if (typeof saveState === 'function') saveState();
      if (typeof render === 'function') render();
    }
  }

  function injectStyle() {
    if (document.getElementById('contactQualityMetaStyle')) return;
    const style = document.createElement('style');
    style.id = 'contactQualityMetaStyle';
    style.textContent = `
      .contact-quality-meta{display:block;margin-top:6px;font-size:11px;line-height:1.35;color:#64748b}
      .contact-quality-meta.good{color:#16794b;font-weight:600}
      .contact-quality-meta.bad{color:#9a5b13}
      #${REVERIFY_BUTTON_ID}{white-space:nowrap}
      #${REVERIFY_BUTTON_ID}[data-count="0"]{opacity:.55}
    `;
    document.head.appendChild(style);
  }

  function updateRecoveryButton() {
    const button = document.getElementById(REVERIFY_BUTTON_ID);
    if (!button) return;
    const count = recoveryCandidates().length;
    button.dataset.count = String(count);
    if (!recoveryRunning) {
      button.disabled = count === 0;
      button.textContent = count ? `검증 후보 재검증 ${count}` : '재검증 후보 없음';
    }
  }

  function injectRecoveryButton() {
    if (document.getElementById(REVERIFY_BUTTON_ID)) return updateRecoveryButton();
    const actions = document.querySelector('.toolbar-actions');
    if (!actions) return;
    const button = document.createElement('button');
    button.id = REVERIFY_BUTTON_ID;
    button.type = 'button';
    button.className = 'ghost';
    button.addEventListener('click', reverifyCandidates);
    const clearButton = document.getElementById('clearSelectionBtn');
    if (clearButton) actions.insertBefore(button, clearButton);
    else actions.appendChild(button);
    updateRecoveryButton();
  }

  function decorateContactStatus() {
    injectStyle();
    injectRecoveryButton();
    if (typeof state === 'undefined' || !Array.isArray(state.leads)) return;
    document.querySelectorAll('tr.data-row').forEach(row => {
      const id = row.querySelector('.lead-check')?.dataset?.id;
      const lead = state.leads.find(item => item.id === id);
      const cell = row.querySelector('.contact');
      if (!lead || !cell) return;
      cell.querySelector('.contact-quality-meta')?.remove();
      const meta = document.createElement('small');
      const primary = lead.contact;
      const summary = lead.contact_verification_summary || {};
      if (primary?.qualified) {
        meta.className = 'contact-quality-meta good';
        meta.textContent = `적합도 ${Number(primary.score) || 0}점 · ${clean(primary.provider || lead.contact_provider || '수집 경로', 80)}`;
      } else if (lead.contact_status === 'failed') {
        meta.className = 'contact-quality-meta bad';
        const suffix = Number(summary.accept_all) ? ` · accept-all ${summary.accept_all}` : Number(summary.unknown) ? ` · 미확정 ${summary.unknown}` : '';
        meta.textContent = `${clean(lead.contact_failure_reason || '적합한 담당자 이메일 미확보', 160)}${suffix}`;
      } else {
        return;
      }
      cell.appendChild(meta);
    });
    updateRecoveryButton();
  }

  if (typeof render === 'function') {
    const originalRender = render;
    render = function renderWithContactDiagnostics() {
      originalRender();
      decorateContactStatus();
    };
  }

  seedSeenDomains();
  injectStyle();
  injectRecoveryButton();
  removeExistingSentLeads().catch(error => {
    console.error('sent-company startup filter failed', error);
    try {
      state.statusText = '발송 이력 확인 실패';
      if (typeof renderSummary === 'function') renderSummary();
    } catch { /* UI is optional */ }
  });
})();
