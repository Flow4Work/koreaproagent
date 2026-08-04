(() => {
  const MATCH_ENDPOINT = '/api/gmail?action=sent-companies';
  const DOMAIN_ENDPOINT = '/api/sent-domains';
  const SEEN_DOMAINS_KEY = 'kpa.hunt.seenDomains.v1';
  const SENT_DOMAINS_CACHE_KEY = 'kpa.hunt.sentDomains.v1';
  const SENT_DOMAINS_CACHE_TTL = 5 * 60 * 1000;
  const MAX_SEEN_DOMAINS = 2000;

  function clean(value = '', max = 500) {
    return String(value || '').trim().slice(0, max);
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

  if (typeof diagnostics === 'function' && typeof $ === 'function') {
    diagnostics = async function enhancedDiagnostics() {
      const panel = $('diagPanel');
      panel.classList.remove('hidden');
      panel.innerHTML = '<div class="diag">확인 중…</div>';
      try {
        const health = await requestJson(`/api/health?t=${Date.now()}`);
        const providers = health.contactProviders || {};
        const line = (name, ok, detail) => `<div class="diag-row"><b class="${ok ? 'diag-ok' : 'diag-bad'}">${ok ? '✓' : '·'}</b><span>${escapeHtml(name)} · ${escapeHtml(detail)}</span></div>`;
        panel.innerHTML = `<div class="diag">${line('기본 검색', health.tavilyConfigured, health.tavilyConfigured ? 'Tavily 연결됨' : '설정 필요')}${line('페이지 분석', providers.jina, providers.jina ? 'Jina 환경변수 연결됨' : '미연결')}${line('메일 검색·검증', providers.hunter, providers.hunter ? 'Hunter 연결됨' : '미연결')}${line('Prospeo', providers.prospeo, providers.prospeo ? '연결됨' : '미연결')}${line('Apollo', providers.apollo, providers.apollo ? '연결됨' : '미연결')}${line('Tomba', providers.tomba, providers.tomba ? '연결됨' : '미연결')}${line('노출 제외', seenDomains().size > 0, `${seenDomains().size}개 도메인 재검색 차단`)}</div>`;
        const note = $('searchSettingsNote');
        if (note) {
          const active = ['Tavily', providers.jina ? 'Jina' : '', providers.hunter ? 'Hunter' : '', providers.prospeo ? 'Prospeo' : '', providers.apollo ? 'Apollo' : '', providers.tomba ? 'Tomba' : ''].filter(Boolean);
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
      const result = await originalPost('/api/hunt-v2', requestPayload, timeout);
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
        const result = await post('/api/contact', {
          url: lead.url,
          recommendedRole: lead.recommended_role,
          roleTargets: lead.role_targets || []
        }, 42000);
        const primary = result.contact || null;
        patchLead(lead.id, {
          contact: primary,
          contacts: result.contacts || [],
          contact_provider: result.provider || null,
          contact_provider_status: result.provider_status || {},
          contact_attempts: result.attempts || [],
          contact_score_threshold: result.score_threshold || 75,
          contact_failure_reason: result.failure_reason || '',
          contact_status: primary?.email ? 'found' : 'failed'
        });
      } catch (error) {
        if (!state.auto && /중단/.test(error?.message || '')) return;
        patchLead(lead.id, { contact_status: 'failed', contact_failure_reason: clean(error?.message || '이메일 수집 실패', 180) });
      }
    };
  }

  function injectStyle() {
    if (document.getElementById('contactQualityMetaStyle')) return;
    const style = document.createElement('style');
    style.id = 'contactQualityMetaStyle';
    style.textContent = `
      .contact-quality-meta{display:block;margin-top:6px;font-size:11px;line-height:1.35;color:#64748b}
      .contact-quality-meta.good{color:#16794b;font-weight:600}
      .contact-quality-meta.bad{color:#9a5b13}
    `;
    document.head.appendChild(style);
  }

  function decorateContactStatus() {
    injectStyle();
    if (typeof state === 'undefined' || !Array.isArray(state.leads)) return;
    document.querySelectorAll('tr.data-row').forEach(row => {
      const id = row.querySelector('.lead-check')?.dataset?.id;
      const lead = state.leads.find(item => item.id === id);
      const cell = row.querySelector('.contact');
      if (!lead || !cell) return;
      cell.querySelector('.contact-quality-meta')?.remove();
      const meta = document.createElement('small');
      const primary = lead.contact;
      if (primary?.qualified) {
        meta.className = 'contact-quality-meta good';
        meta.textContent = `적합도 ${Number(primary.score) || 0}점 · ${clean(primary.provider || lead.contact_provider || '수집 경로', 80)}`;
      } else if (lead.contact_status === 'failed') {
        meta.className = 'contact-quality-meta bad';
        meta.textContent = clean(lead.contact_failure_reason || '적합한 담당자 이메일 미확보', 180);
      } else {
        return;
      }
      cell.appendChild(meta);
    });
  }

  if (typeof render === 'function') {
    const originalRender = render;
    render = function renderWithContactDiagnostics() {
      originalRender();
      decorateContactStatus();
    };
  }

  seedSeenDomains();
  removeExistingSentLeads().catch(error => {
    console.error('sent-company startup filter failed', error);
    try {
      state.statusText = '발송 이력 확인 실패';
      if (typeof renderSummary === 'function') renderSummary();
    } catch { /* UI is optional */ }
  });
})();
