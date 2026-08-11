(() => {
  const DELETED_KEY = 'kpa.hunt.deletedDomains.v1';
  const MAX_DELETED = 2000;

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

  function readDeleted() {
    try {
      const values = JSON.parse(localStorage.getItem(DELETED_KEY) || '[]');
      return new Set((Array.isArray(values) ? values : []).map(normalizeDomain).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function writeDeleted(domains) {
    localStorage.setItem(DELETED_KEY, JSON.stringify([...domains].slice(-MAX_DELETED)));
  }

  function removeDeletedFromState() {
    if (typeof state === 'undefined' || !Array.isArray(state.leads)) return false;
    const deleted = readDeleted();
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

  function deleteLead(id) {
    if (typeof state === 'undefined' || !Array.isArray(state.leads)) return;
    const lead = state.leads.find(item => item.id === id);
    if (!lead) return;
    const domain = leadDomain(lead);
    if (!domain) return;

    const deleted = readDeleted();
    deleted.add(domain);
    writeDeleted(deleted);

    const removedIds = state.leads
      .filter(item => leadDomain(item) === domain)
      .map(item => item.id)
      .filter(Boolean);
    state.leads = state.leads.filter(item => leadDomain(item) !== domain);
    for (const removedId of removedIds) state.selected?.delete?.(removedId);
    if (typeof saveState === 'function') saveState();
    if (typeof render === 'function') render();
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
      const reject = actions.querySelector('[data-reject]');
      if (reject) reject.insertAdjacentElement('afterend', button);
      else actions.appendChild(button);
    }
  }

  if (typeof post === 'function') {
    const originalPost = post;
    post = async function postWithPermanentDeletes(url, payload, timeout) {
      if (url !== '/api/hunt') return originalPost(url, payload, timeout);
      const deleted = [...readDeleted()];
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

  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-delete-lead]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    deleteLead(button.dataset.deleteLead || '');
  }, true);

  const initialize = () => {
    const changed = removeDeletedFromState();
    if (changed && typeof render === 'function') render();
    decorateDeleteButtons();
    const content = document.getElementById('content');
    if (!content) return;
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1) decorateDeleteButtons(node);
        }
      }
      decorateDeleteButtons(content);
    }).observe(content, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();