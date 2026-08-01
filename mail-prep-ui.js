(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const SELECTED_KEY = 'kpa.hunt.selected';
  const REVIEW_IDS_KEY = 'kpa.mail.review.ids';

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

  function openReview(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) {
      alert('먼저 메일을 준비할 후보를 선택해주세요.');
      return;
    }
    saveJson(REVIEW_IDS_KEY, unique);
    location.href = '/mail-review.html';
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
    button.addEventListener('click', () => openReview(selectedIds()));
    actions.insertBefore(button, document.getElementById('runBtn'));
  }

  function syncMailButtons(root = document) {
    root.querySelectorAll?.('a.mail-btn').forEach(anchor => {
      anchor.textContent = '메일 준비하기';
      anchor.removeAttribute('target');
      anchor.removeAttribute('rel');
      anchor.setAttribute('href', '/mail-review.html');
      anchor.dataset.mailPrepare = '1';
    });
  }

  function updateBulkButton() {
    const button = document.getElementById('prepareSelectedBtn');
    if (!button) return;
    const count = selectedIds().length;
    button.disabled = count === 0;
    button.textContent = count ? `선택한 메일 준비하기 (${count})` : '선택한 메일 준비하기';
  }

  document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a.mail-btn');
    if (!anchor) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = rowLeadId(anchor);
    if (id) openReview([id]);
  }, true);

  document.addEventListener('change', event => {
    if (event.target.matches?.('.lead-check')) setTimeout(updateBulkButton, 0);
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
  updateBulkButton();

  const observer = new MutationObserver(records => {
    ensureBulkButton();
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('a.mail-btn')) syncMailButtons(node.parentElement || document);
        else syncMailButtons(node);
      }
    }
    updateBulkButton();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
