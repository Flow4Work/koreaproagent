(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const SELECTED_KEY = 'kpa.hunt.selected';
  const REVIEW_IDS_KEY = 'kpa.mail.review.ids';
  const IDENTITY_VERSION = '20260830-email-domain-identity-v5';

  function loadJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function safeKbwOffer(lead) {
    if (!lead || lead.campaign !== 'kbw') return lead;
    return {
      ...lead,
      offer: 'KBW 기간 서울 방문 시 팀웨어·스태프웨어·커스텀 의류를 서울 현지에서 제작·납품'
    };
  }

  function sanitizeStoredLeads() {
    const leads = loadJson(LEADS_KEY, []);
    if (!Array.isArray(leads) || !leads.length) return;
    let changed = false;
    const next = leads.map(lead => {
      const sanitized = safeKbwOffer(lead);
      if (sanitized.offer !== lead.offer) changed = true;
      return sanitized;
    });
    if (changed) saveJson(LEADS_KEY, next);
  }

  function selectedIds() {
    return loadJson(SELECTED_KEY, []).filter(Boolean);
  }

  function verifiedIdentity(lead = {}) {
    const identity = lead?.company_identity;
    return Boolean(identity
      && identity.identity_version === IDENTITY_VERSION
      && identity.status === 'verified'
      && Number(identity.confidence || 0) >= 0.85
      && String(identity.greeting_name || '').trim());
  }

  async function ensureCompanyIdentities(ids) {
    const refresh = globalThis.KPA_COMPANY_IDENTITY_REFRESH;
    if (typeof refresh !== 'function') throw new Error('회사명 확인 기능을 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.');
    await refresh(ids, { force: true });

    const byId = new Map(loadJson(LEADS_KEY, []).map(lead => [lead.id, lead]));
    const unresolved = ids.map(id => byId.get(id)).filter(lead => lead && !verifiedIdentity(lead));
    if (unresolved.length) {
      const names = unresolved.slice(0, 5).map(lead => lead.raw_company || lead.company || lead.domain || '회사').join(', ');
      const more = unresolved.length > 5 ? ` 외 ${unresolved.length - 5}곳` : '';
      throw new Error(`수신 이메일 도메인으로 회사명을 확정하지 못한 곳이 ${unresolved.length}곳 있습니다: ${names}${more}`);
    }
  }

  async function openReview(ids, trigger = null) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) {
      alert('먼저 메일을 준비할 후보를 선택해주세요.');
      return;
    }

    const originalText = trigger?.textContent || '';
    if (trigger) {
      trigger.disabled = true;
      trigger.textContent = '회사명 확인 중…';
    }

    try {
      await ensureCompanyIdentities(unique);
      saveJson(REVIEW_IDS_KEY, unique);
      location.href = '/mail-review.html';
    } catch (error) {
      alert(error?.message || '회사명 확인에 실패했습니다.');
      if (trigger) {
        trigger.disabled = false;
        trigger.textContent = originalText;
      }
    }
  }

  function rowLeadId(anchor) {
    return anchor.closest('tr.data-row')?.querySelector('.lead-check')?.dataset?.id || '';
  }

  function ensureBulkButton() {
    const actions = document.querySelector('.toolbar-actions');
    if (!actions || document.getElementById('prepareSelectedBtn')) return;
    const button = document.createElement('button');
    button.id = 'prepareSelectedBtn';
    button.type = 'button';
    button.className = 'primary mail-prepare-bulk';
    button.textContent = '선택한 메일 준비하기';
    button.addEventListener('click', () => openReview(selectedIds(), button));
    actions.insertBefore(button, document.getElementById('runBtn'));
  }

  function prepareMailButton(anchor) {
    if (!anchor) return;
    if (anchor.textContent !== '메일 준비하기') anchor.textContent = '메일 준비하기';
    if (anchor.hasAttribute('target')) anchor.removeAttribute('target');
    if (anchor.hasAttribute('rel')) anchor.removeAttribute('rel');
    if (anchor.getAttribute('href') !== '/mail-review.html') anchor.setAttribute('href', '/mail-review.html');
    if (anchor.dataset.mailPrepare !== '1') anchor.dataset.mailPrepare = '1';
  }

  function syncMailButtons(root = document) {
    if (root.matches?.('a.mail-btn')) prepareMailButton(root);
    root.querySelectorAll?.('a.mail-btn').forEach(prepareMailButton);
  }

  function ensureRowSelectionStyle() {
    if (document.getElementById('kpaRowSelectionStyle')) return;
    const style = document.createElement('style');
    style.id = 'kpaRowSelectionStyle';
    style.textContent = `
      .lead-table tbody tr.data-row.row-selectable {
        cursor: pointer;
        transition: background .14s ease, box-shadow .14s ease;
      }
      .lead-table tbody tr.data-row.row-selected {
        background: #f1f6ff !important;
        box-shadow: inset 3px 0 0 #3182f6;
      }
      .lead-table tbody tr.data-row.row-selected:hover {
        background: #eaf2ff !important;
      }
    `;
    document.head.appendChild(style);
  }

  function syncRowSelection(root = document) {
    const rows = [];
    if (root.matches?.('tr.data-row')) rows.push(root);
    root.querySelectorAll?.('tr.data-row').forEach(row => rows.push(row));
    rows.forEach(row => {
      const checkbox = row.querySelector('.lead-check');
      if (!checkbox) return;
      row.classList.add('row-selectable');
      row.classList.toggle('row-selected', checkbox.checked);
      row.setAttribute('aria-selected', String(checkbox.checked));
    });
  }

  function isInteractiveTarget(target) {
    return Boolean(target.closest?.('a, button, input, select, textarea, label, [role="button"], [contenteditable="true"]'));
  }

  function updateBulkButton() {
    const button = document.getElementById('prepareSelectedBtn');
    if (!button || button.textContent === '회사명 확인 중…') return;
    const count = selectedIds().length;
    const nextText = count ? `선택한 메일 준비하기 (${count})` : '선택한 메일 준비하기';
    const nextDisabled = count === 0;
    if (button.textContent !== nextText) button.textContent = nextText;
    if (button.disabled !== nextDisabled) button.disabled = nextDisabled;
  }

  document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a.mail-btn');
    if (!anchor) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = rowLeadId(anchor);
    if (id) openReview([id], anchor);
  }, true);

  document.addEventListener('click', event => {
    const row = event.target.closest?.('tr.data-row');
    if (!row || isInteractiveTarget(event.target)) return;
    const checkbox = row.querySelector('.lead-check');
    if (!checkbox || checkbox.disabled) return;
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    syncRowSelection(row);
  });

  document.addEventListener('change', event => {
    if (!event.target.matches?.('.lead-check')) return;
    const row = event.target.closest('tr.data-row');
    setTimeout(() => {
      updateBulkButton();
      if (row?.isConnected) syncRowSelection(row);
      else syncRowSelection();
    }, 0);
  });

  sanitizeStoredLeads();
  try {
    if (typeof mergeLeads === 'function') {
      const originalMergeLeads = mergeLeads;
      mergeLeads = incoming => originalMergeLeads((incoming || []).map(safeKbwOffer));
    }
  } catch { /* app merge hook is optional */ }
  try {
    if (typeof state !== 'undefined' && Array.isArray(state.leads)) {
      state.leads = state.leads.map(safeKbwOffer);
      if (typeof saveState === 'function') saveState();
      if (typeof render === 'function') render();
    }
  } catch { /* app state is optional on this page */ }
  ensureBulkButton();
  syncMailButtons();
  ensureRowSelectionStyle();
  syncRowSelection();
  updateBulkButton();

  const observer = new MutationObserver(records => {
    ensureBulkButton();
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        syncMailButtons(node);
        syncRowSelection(node);
      }
    }
    syncRowSelection();
    updateBulkButton();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (!document.querySelector('script[data-kpa-found-select]')) {
    const script = document.createElement('script');
    script.src = '/mail-found-select.js?v=20260817-email-found-lock-v1';
    script.dataset.kpaFoundSelect = '1';
    document.head.appendChild(script);
  }
})();
