(() => {
  if (window.__KPA_KBEAUTY_SEED_FEEDER__) return;
  window.__KPA_KBEAUTY_SEED_FEEDER__ = true;

  const QUEUE_KEY = 'kpa.kbeauty.v6.queue';
  const META_KEY = 'kpa.kbeauty.seed2026.meta';
  const MAX_QUEUE = 1800;
  const TARGET = 500;
  const RETRY_MS = 3 * 60 * 1000;
  let busy = false;

  const clean = (value = '', max = 300) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const companyKey = value => clean(value, 180).toLowerCase()
    .replace(/\b(?:inc|llc|ltd|limited|corp|corporation|company|co|gmbh|plc)\b/giu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ').trim();
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };

  function existingKeys() {
    const keys = new Set();
    for (const row of read(QUEUE_KEY, [])) {
      const key = companyKey(row?.company);
      if (key) keys.add(key);
    }
    try {
      for (const lead of (typeof state !== 'undefined' && Array.isArray(state.leads) ? state.leads : [])) {
        if (lead?.campaign !== 'kbeauty') continue;
        const key = companyKey(lead?.company);
        if (key) keys.add(key);
      }
    } catch {}
    return keys;
  }

  function mergeQueue(incoming = []) {
    const current = read(QUEUE_KEY, []);
    const seen = existingKeys();
    const added = [];
    for (const raw of Array.isArray(incoming) ? incoming : []) {
      const company = clean(raw?.company, 180);
      const key = companyKey(company);
      if (!company || !key || seen.has(key)) continue;
      seen.add(key);
      added.push({
        ...raw,
        company,
        id: clean(raw?.id, 180) || `kbeauty-seed:${key.replace(/\s+/g, '-').slice(0, 110)}`,
        curated_2026: true,
        kbeauty_v6_domain_attempts: 0,
        kbeauty_v6_retry_at: 0
      });
      if (current.length + added.length >= MAX_QUEUE) break;
    }
    if (added.length) localStorage.setItem(QUEUE_KEY, JSON.stringify([...added, ...current].slice(0, MAX_QUEUE)));
    return added.length;
  }

  async function feed() {
    if (busy) return;
    try {
      if (typeof state !== 'undefined' && state.currentCampaign !== 'kbeauty') return;
    } catch { return; }

    const meta = read(META_KEY, {});
    if (Number(meta?.returned || 0) >= TARGET && Date.now() - Number(meta?.at || 0) < 12 * 60 * 60 * 1000) return;
    if (Number(meta?.lastAttempt || 0) && Date.now() - Number(meta.lastAttempt) < RETRY_MS) return;

    busy = true;
    localStorage.setItem(META_KEY, JSON.stringify({ ...meta, lastAttempt: Date.now() }));
    try {
      const response = await fetch('/api/kbeauty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ action: 'seed_2026', limit: TARGET })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data?.candidates)) throw new Error(data?.error || `HTTP ${response.status}`);
      const added = mergeQueue(data.candidates);
      const nextMeta = {
        at: Date.now(),
        lastAttempt: Date.now(),
        returned: data.candidates.length,
        added,
        source: data?.meta?.official_2026_source || 'official_2026_sources'
      };
      localStorage.setItem(META_KEY, JSON.stringify(nextMeta));
      if (added && typeof render === 'function') render();
    } catch (error) {
      localStorage.setItem(META_KEY, JSON.stringify({ ...read(META_KEY, {}), lastAttempt: Date.now(), error: clean(error?.message || error, 180) }));
    } finally {
      busy = false;
    }
  }

  const start = () => {
    feed();
    setInterval(feed, 60 * 1000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
