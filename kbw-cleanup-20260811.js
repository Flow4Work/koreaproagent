(() => {
  const BLOCKED = new Set(['sooho.io', 'bitmex.com']);
  const startedAt = Date.now();
  let timer = null;

  const normalize = (value = '') => String(value || '').trim().toLowerCase().replace(/^www\./, '');

  function applyCleanup() {
    if (typeof state === 'undefined' || !Array.isArray(state.leads) || !(state.rejected instanceof Set)) return false;

    const before = state.leads.length;
    state.leads = state.leads.filter((lead) => !BLOCKED.has(normalize(lead?.domain)));

    for (const domain of BLOCKED) state.rejected.add(domain);

    if (state.selected instanceof Set) {
      const survivingIds = new Set(state.leads.map((lead) => lead?.id).filter(Boolean));
      for (const id of [...state.selected]) {
        if (!survivingIds.has(id)) state.selected.delete(id);
      }
    }

    if (typeof saveState === 'function') saveState();
    if (typeof render === 'function') render();

    window.KBWCleanup20260811 = {
      blocked: [...BLOCKED],
      removed: before - state.leads.length,
      appliedAt: new Date().toISOString()
    };
    return true;
  }

  function tick() {
    if (applyCleanup() || Date.now() - startedAt > 15000) {
      if (timer) clearInterval(timer);
      timer = null;
    }
  }

  timer = setInterval(tick, 100);
  tick();
})();
