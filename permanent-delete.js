(() => {
  const DELETED_KEY = 'kpa.hunt.deletedDomains.v1';
  const REMOTE_ENDPOINT = '/api/deleted';
  const MAX_DELETED = 2000;
  let remoteDeleted = new Set();
  let remoteLoaded = false;
  let remoteLoading = null;

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

  function leadDomain(lead = {}) {
    return normalizeDomain(lead.domain || lead.url || lead.contact?.email || '');
  }

  function readLocalDeleted() {
    try {
      const values = JSON.parse(localStorage.getItem(DELETED_KEY) || '[]');
      return new Set((Array.isArray(values) ? values : []).map(normalizeDomain).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function writeLocalDeleted(domains) {
    localStorage.setItem(DELETED_KEY, JSON.stringify([...domains].slice(-MAX_DELETED)));
  }

  function allDeleted() {
    return new Set([...readLocalDeleted(), ...remoteDeleted]);
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function loadRemoteDeleted() {
    if (remoteLoaded) return remoteDeleted;
    if (remoteLoading) return remoteLoading;
    remoteLoading = (async () => {
      const data = await requestJson(`${REMOTE_ENDPOINT}?t=${Date.now()}`);
      remoteDeleted = new Set((Array.isArray(data.domains) ? data.domains : []).map(normalizeDomain).filter(Boolean));
      remoteLoaded = true;

      const merged = allDeleted();
      writeLocalDeleted(merged);

      const localOnly = [...readLocalDeleted()].filter(domain => !remoteDeleted.has(domain));
      for (let index = 0; index < localOnly.length; index += 200) {
        const batch = localOnly.slice(index, index + 200);
        if (!batch.length) continue;
        const synced = await requestJson(REMOTE_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: batch.map(domain => ({ key: domain, name: domain })) })
        }).catch(() => null);
        if (synced?.ok) batch.forEach(domain => remoteDeleted.add(domain));
      }
      return remoteDeleted;
    })().finally(() => { remoteLoading = null; });
    return remoteLoading;
  }

  async function ensureRemoteLoaded() {
    try { await loadRemoteDeleted(); }
    catch (error) { console.error('deleted-company remote load failed', error); }
    return allDeleted();
  }

  function removeDeletedFromState() {
    if (typeof state === 'undefined' || !Array.isArray(state.leads)) return false;
    const deleted = allDeleted();
    if (!deleted.size) return false;
    const removedIds = [];
    const next = state.leads.filter(lead => {
      const remove = deleted.has(leadDomain(lead));
      if (remove && lead?.id) removedIds.push(lead.id);
      return !remove;
    });
    if (next.length === state.leads.length) return false;
    state.leads = next;
    for (const id of removedIds) state.selected?.delete?.(id);
    if (typeof saveState === 'function') saveState();
    return true;
  }

  async function deleteLead(id, button = null) {
    if (typeof state === 'undefined' || !Array.isArray(state.leads)) return;
    const lead = state.leads.find(item => item.id === id);
    if (!lead) return;
    const domain = leadDomain(lead);
    if (!domain) return;

    const originalText = button?.textContent || '삭제';
    if (button) {
      button.disabled = true;
      button.textContent = '삭제 중';
    }

    try {
      await requestJson(REMOTE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyKey: domain,
          companyName: clean(lead.company || domain, 120)
        })
      });

      remoteDeleted.add(domain);
      remoteLoaded = true;
      const deleted = allDeleted();
      deleted.add(domain);
      writeLocalDeleted(deleted);

      const removedIds = state.leads
        .filter(item => leadDomain(item) === domain)
        .map(item => item.id)
        .filter(Boolean);
      state.leads = state.leads.filter(item => leadDomain(item) !== domain);
      for (const removedId of removedIds) state.selected?.delete?.(removedId);
      if (typeof saveState === 'function') saveState();
      if (typeof render === 'function') render();
    } catch (error) {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
      alert(`삭제 이력을 저장하지 못했습니다. 다시 시도해주세요.\n${clean(error?.message || '', 120)}`);
    }
  }

  function decorateDeleteButtons(root = document) {
    const rows = [];
    if (root.matches?.('tr.data-row')) rows.push(root);
    root.querySelectorAll?.('tr.data-row').forEach(row => rows.push(row));
    for (const row of rows) {
      if (row.querySelector('[data-delete-lead]')) continue;
      const id = row.querySelector('.lead-check')?.dataset?.id;
      const actions = row.querySelector('.actions');
      if (!id || !actions) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'reject-btn permanent-delete-btn';
      button.dataset.deleteLead = id;
      button.textContent = '삭제';
      actions.appendChild(button);
    }
  }

  if (typeof post === 'function') {
    const originalPost = post;
    post = async function postWithPermanentDeletes(url, payload, timeout) {
      if (url !== '/api/hunt' && url !== '/api/bcww') return originalPost(url, payload, timeout);
      const deleted = [...await ensureRemoteLoaded()];
      const excludeDomains = [...new Set([
        ...(Array.isArray(payload?.excludeDomains) ? payload.excludeDomains : []),
        ...deleted
      ].map(normalizeDomain).filter(Boolean))].slice(-500);
      const result = await originalPost(url, { ...(payload || {}), excludeDomains }, timeout);
      if (Array.isArray(result?.leads) && deleted.length) {
        const blocked = new Set(deleted);
        result.leads = result.leads.filter(lead => !blocked.has(leadDomain(lead)));
      }
      return result;
    };
  }

  window.addEventListener('click', event => {
    const button = event.target.closest?.('[data-delete-lead]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    deleteLead(button.dataset.deleteLead || '', button);
  }, true);

  const initialize = async () => {
    await ensureRemoteLoaded();
    const changed = removeDeletedFromState();
    if (changed && typeof render === 'function') render();
    decorateDeleteButtons();

    const content = document.getElementById('content');
    if (!content) return;
    new MutationObserver(() => decorateDeleteButtons(content))
      .observe(content, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
