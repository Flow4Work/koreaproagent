(() => {
  if (window.__KPA_FOUND_EMAIL_BULK_SELECT__) return;
  if (typeof state === 'undefined' || typeof saveState !== 'function' || typeof render !== 'function') return;
  window.__KPA_FOUND_EMAIL_BULK_SELECT__ = true;

  const LOCK_KEY = 'kpa.mail.found-select.lock.v1';
  const BUTTON_ID = 'foundEmailSelectBtn';
  let syncing = false;
  let scheduled = 0;

  const clean = (value = '', max = 260) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const validEmail = value => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean(value, 240));

  function currentCampaign() {
    return clean(state.currentCampaign || document.getElementById('campaignSelect')?.value || '', 80);
  }

  function lockedCampaign() {
    return clean(localStorage.getItem(LOCK_KEY) || '', 80);
  }

  function isLocked() {
    const campaign = currentCampaign();
    return Boolean(campaign && lockedCampaign() === campaign);
  }

  function contacts(lead = {}) {
    const rows = [lead.contact, ...(Array.isArray(lead.contacts) ? lead.contacts : [])].filter(Boolean);
    const seen = new Set();
    return rows.filter(contact => {
      const email = clean(contact?.email, 240).toLowerCase();
      if (!validEmail(email) || contact?.emailStatus === 'invalid' || contact?.outreachEligible === false || seen.has(email)) return false;
      seen.add(email);
      return true;
    });
  }

  function eligibleIds() {
    const campaign = currentCampaign();
    return new Set((state.leads || [])
      .filter(lead => lead?.campaign === campaign && contacts(lead).length > 0 && lead?.id)
      .map(lead => lead.id));
  }

  function campaignLeadIds() {
    const campaign = currentCampaign();
    return new Set((state.leads || []).filter(lead => lead?.campaign === campaign && lead?.id).map(lead => lead.id));
  }

  function ensureStyle() {
    if (document.getElementById('foundEmailSelectStyle')) return;
    const style = document.createElement('style');
    style.id = 'foundEmailSelectStyle';
    style.textContent = `
      #${BUTTON_ID}.locked{background:#eef4ff;border-color:#8eb5f7;color:#1457b8;opacity:1}
      #${BUTTON_ID}:disabled{cursor:not-allowed}
      .lead-check[data-mail-found-lock="1"]{cursor:not-allowed}
    `;
    document.head.appendChild(style);
  }

  function ensureButton() {
    const actions = document.querySelector('.toolbar-actions');
    if (!actions) return null;
    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.className = 'ghost found-email-select';
      button.addEventListener('click', () => {
        const ids = eligibleIds();
        if (!ids.size) {
          alert('현재 카테고리에 찾은 이메일이 없습니다.');
          return;
        }
        localStorage.setItem(LOCK_KEY, currentCampaign());
        state.selected.clear();
        ids.forEach(id => state.selected.add(id));
        saveState();
        render();
      });
      const prepare = document.getElementById('prepareSelectedBtn');
      const clear = document.getElementById('clearSelectionBtn');
      if (prepare) actions.insertBefore(button, prepare);
      else if (clear?.nextSibling) actions.insertBefore(button, clear.nextSibling);
      else actions.insertBefore(button, document.getElementById('runBtn'));
    }
    return button;
  }

  function paintButton() {
    const button = ensureButton();
    if (!button) return;
    const count = eligibleIds().size;
    const locked = isLocked();
    const text = locked ? `메일 찾은 곳 전체 선택 (${count}) · 잠금` : `메일 찾은 곳 전체 선택${count ? ` (${count})` : ''}`;
    const title = locked ? '선택 해제를 누르면 잠금이 풀립니다.' : '현재 카테고리에서 이메일이 확보된 회사를 모두 선택하고 잠급니다.';
    if (button.textContent !== text) button.textContent = text;
    button.classList.toggle('locked', locked);
    if (button.disabled !== locked) button.disabled = locked;
    if (button.title !== title) button.title = title;
  }

  function paintPrepareButton() {
    const button = document.getElementById('prepareSelectedBtn');
    if (!button) return;
    const count = state.selected.size;
    const text = count ? `선택한 메일 준비하기 (${count})` : '선택한 메일 준비하기';
    const disabled = count === 0;
    if (button.textContent !== text) button.textContent = text;
    if (button.disabled !== disabled) button.disabled = disabled;
  }

  function releaseDomLock() {
    document.querySelectorAll('.lead-check[data-mail-found-lock="1"]').forEach(input => {
      input.disabled = false;
      delete input.dataset.mailFoundLock;
      input.removeAttribute('title');
    });
  }

  function paintLockedRows(ids) {
    releaseDomLock();
    if (!isLocked()) return;
    document.querySelectorAll('tr.data-row').forEach(row => {
      const input = row.querySelector('.lead-check');
      const id = input?.dataset?.id || '';
      if (!input || !ids.has(id)) return;
      input.checked = true;
      input.disabled = true;
      input.dataset.mailFoundLock = '1';
      input.title = '메일 찾은 곳 전체 선택으로 잠금됨 · 선택 해제로 해제';
      row.classList.add('row-selected');
      row.setAttribute('aria-selected', 'true');
    });
  }

  function syncLock() {
    if (syncing) return;
    syncing = true;
    try {
      ensureStyle();
      ensureButton();
      if (!isLocked()) {
        releaseDomLock();
        paintButton();
        paintPrepareButton();
        return;
      }

      const eligible = eligibleIds();
      const campaignIds = campaignLeadIds();
      let changed = false;
      for (const id of campaignIds) {
        if (eligible.has(id)) {
          if (!state.selected.has(id)) { state.selected.add(id); changed = true; }
        } else if (state.selected.has(id)) {
          state.selected.delete(id); changed = true;
        }
      }
      if (changed) {
        saveState();
        render();
        return;
      }
      paintLockedRows(eligible);
      paintButton();
      paintPrepareButton();
    } finally {
      syncing = false;
    }
  }

  function scheduleSync() {
    clearTimeout(scheduled);
    scheduled = setTimeout(syncLock, 0);
  }

  document.getElementById('clearSelectionBtn')?.addEventListener('click', () => {
    localStorage.removeItem(LOCK_KEY);
    releaseDomLock();
  }, true);

  document.getElementById('campaignSelect')?.addEventListener('change', scheduleSync);

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  scheduleSync();
})();
