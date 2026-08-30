(() => {
  if (window.__KPA_KBEAUTY_SEED_FEEDER__) return;
  window.__KPA_KBEAUTY_SEED_FEEDER__ = true;

  const QUEUE_KEY = 'kpa.kbeauty.v6.queue';
  const META_KEY = 'kpa.kbeauty.seed2026.union-v3.meta';
  const MAX_QUEUE = 1800;
  const TARGET = 500;
  const RETRY_MS = 3 * 60 * 1000;
  let busy = false;
  let activeController = null;

  const clean = (value = '', max = 300) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const companyKey = value => clean(value, 180).toLowerCase()
    .replace(/\b(?:inc|llc|ltd|limited|corp|corporation|company|co|gmbh|plc)\b/giu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ').trim();
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
  const kbeautyRunning = () => {
    try { return typeof state !== 'undefined' && state.currentCampaign === 'kbeauty' && state.auto === true && state.autoCampaign === 'kbeauty'; }
    catch { return false; }
  };

  function foreignPriority(row = {}) {
    const country = clean(row?.country, 80).toLowerCase();
    const company = clean(row?.company, 180);
    const domain = clean(row?.domain, 180).toLowerCase();
    if (country && !/(?:korea|south korea|republic of korea|대한민국|한국)/i.test(country)) return 100;
    if (/[가-힣]/.test(company)) return 0;
    if (/\.(?:kr|co\.kr)$/i.test(domain)) return 0;
    if (/(?:pvt\.?\s*ltd|sdn\s*bhd|gmbh|b\.v\.|s\.a\.|s\.l\.|llc|llp|pty\s*ltd|pte\.?\s*ltd)/i.test(company)) return 90;
    if (/(?:guangzhou|shanghai|shenzhen|zhejiang|ningbo|dongguan|suzhou|anhui|jiangsu|jiangxi|jinhua|yuyao|zhuhai|foshan|hangzhou)/i.test(company)) return 88;
    if (domain && !domain.endsWith('.kr')) return 82;
    return 30;
  }

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
    const ranked = [...(Array.isArray(incoming) ? incoming : [])]
      .sort((a, b) => foreignPriority(b) - foreignPriority(a) || Number(b?.score || 0) - Number(a?.score || 0));
    for (const raw of ranked) {
      const company = clean(raw?.company, 180);
      const key = companyKey(company);
      if (!company || !key || seen.has(key)) continue;
      seen.add(key);
      added.push({
        ...raw,
        company,
        foreign_priority: foreignPriority(raw),
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

  function stopFeeder() {
    try { activeController?.abort(); } catch {}
    activeController = null;
    busy = false;
  }
  window.KPA_KBEAUTY_SEED_FEEDER_STOP = stopFeeder;

  async function feed() {
    // Button contract is owned only by campaign-run-controller.js:
    // 후보 찾기 -> 진정시키기 -> 후보 찾기.
    // This feeder must never run or alter UI while K-Beauty auto hunt is calm.
    if (busy || !kbeautyRunning()) return;

    const meta = read(META_KEY, {});
    if (Number(meta?.returned || 0) >= TARGET && Date.now() - Number(meta?.at || 0) < 12 * 60 * 60 * 1000) return;
    if (Number(meta?.lastAttempt || 0) && Date.now() - Number(meta.lastAttempt) < RETRY_MS) return;

    busy = true;
    activeController = new AbortController();
    localStorage.setItem(META_KEY, JSON.stringify({ ...meta, lastAttempt: Date.now() }));
    try {
      const response = await fetch('/api/kbeauty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: activeController.signal,
        body: JSON.stringify({ action: 'seed_2026', limit: TARGET })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data?.candidates)) throw new Error(data?.error || `HTTP ${response.status}`);
      if (!kbeautyRunning()) return;
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
      if (error?.name !== 'AbortError') {
        localStorage.setItem(META_KEY, JSON.stringify({ ...read(META_KEY, {}), lastAttempt: Date.now(), error: clean(error?.message || error, 180) }));
      }
    } finally {
      activeController = null;
      busy = false;
    }
  }

  const start = () => {
    setInterval(feed, 1000);

    // If the user clicks 진정시키기, abort even an in-flight seed request.
    document.addEventListener('click', event => {
      if (!event.target?.closest?.('#runBtn')) return;
      setTimeout(() => { if (!kbeautyRunning()) stopFeeder(); }, 0);
    }, true);
    document.getElementById('campaignSelect')?.addEventListener('change', () => {
      setTimeout(() => { if (!kbeautyRunning()) stopFeeder(); }, 0);
    }, true);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
