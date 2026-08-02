(() => {
  const HISTORY = '/api/gmail?action=sent-history';
  const originalFetch = window.fetch.bind(window);
  let cache = null, loading = false, toastTimer = 0;
  const $ = id => document.getElementById(id);
  const clean = (value = '', max = 300) => String(value || '').trim().slice(0, max);
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function domain(value = '') {
    let raw = clean(value, 500).toLowerCase();
    if (raw.includes('@') && !raw.includes('://')) raw = raw.split('@').pop() || '';
    try { raw = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname; }
    catch { raw = raw.split('/')[0].split(':')[0]; }
    return raw.replace(/^www\./, '').replace(/\.+$/, '');
  }
  function companyName(key = '') {
    let leads = [];
    try { leads = JSON.parse(localStorage.getItem('kpa.hunt.leads') || '[]'); } catch {}
    const target = domain(key);
    const lead = (Array.isArray(leads) ? leads : []).find(item => [item?.domain,item?.url,item?.contact?.email].some(value => domain(value) === target));
    return clean(lead?.company || lead?.domain || target, 120) || '회사';
  }
  function styles() {
    if ($('kpaHistoryStyles')) return;
    const style = document.createElement('style');
    style.id = 'kpaHistoryStyles';
    style.textContent = `
.kpa-history-btn{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border:1px solid #d7dce5;border-radius:10px;background:#fff;color:#273142;font:600 13px Inter,'Noto Sans KR',sans-serif;cursor:pointer;white-space:nowrap}.kpa-history-btn:hover{background:#f8fafc}.kpa-history-count{display:none;min-width:19px;height:19px;padding:0 5px;align-items:center;justify-content:center;border-radius:999px;background:#e9f8ef;color:#14804a;font-size:11px}.kpa-history-count.on{display:inline-flex}.kpa-history-bg{position:fixed;inset:0;z-index:9997;background:rgba(15,23,42,.24);opacity:0;pointer-events:none;transition:.18s}.kpa-history-panel{position:fixed;top:0;right:0;z-index:9998;width:min(380px,92vw);height:100vh;box-sizing:border-box;padding:20px;background:#fff;box-shadow:-12px 0 32px rgba(15,23,42,.14);transform:translateX(102%);transition:.2s;display:flex;flex-direction:column;font-family:Inter,'Noto Sans KR',sans-serif}.kpa-history-open .kpa-history-bg{opacity:1;pointer-events:auto}.kpa-history-open .kpa-history-panel{transform:none}.kpa-history-head{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:1px solid #e8ebf0}.kpa-history-head strong{font-size:17px}.kpa-history-close{width:34px;height:34px;border:0;border-radius:9px;background:#f3f5f8;font-size:22px;cursor:pointer}.kpa-history-note{margin:13px 0 8px;color:#6b7280;font-size:12px;line-height:1.55}.kpa-history-list{flex:1;min-height:0;overflow:auto}.kpa-history-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:14px 2px;border-bottom:1px solid #eef0f3}.kpa-history-name,.kpa-history-domain{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kpa-history-name{color:#1f2937;font-size:14px;font-weight:650}.kpa-history-domain{margin-top:4px;color:#8a94a3;font-size:11px}.kpa-history-date{color:#6b7280;font-size:11px;white-space:nowrap}.kpa-history-empty{margin:40px 0;text-align:center;color:#8a94a3;font-size:13px;line-height:1.6}.kpa-history-toast{position:fixed;right:22px;bottom:22px;z-index:10000;max-width:calc(100vw - 32px);padding:13px 16px;border:1px solid #d9e7de;border-radius:12px;background:#f6fcf8;box-shadow:0 10px 28px rgba(15,23,42,.13);color:#245a3b;font:600 13px/1.45 Inter,'Noto Sans KR',sans-serif;cursor:pointer;opacity:0;transform:translateY(12px);pointer-events:none;transition:.16s}.kpa-history-toast.on{opacity:1;transform:none;pointer-events:auto}.kpa-history-toast.warn{border-color:#f0d7a9;background:#fffaf0;color:#8a5a12}@media(max-width:720px){.kpa-history-panel{padding:17px}.kpa-history-toast{right:16px;bottom:16px}}`;
    document.head.appendChild(style);
  }
  function build() {
    if ($('kpaHistoryButton')) return;
    styles();
    const host = document.querySelector('.tools') || document.querySelector('.review-actions');
    if (!host) return;
    const button = document.createElement('button');
    button.id = 'kpaHistoryButton'; button.type = 'button'; button.className = 'kpa-history-btn';
    button.innerHTML = '발송 이력 <span class="kpa-history-count" id="kpaHistoryCount"></span>';
    host.classList.contains('review-actions') ? host.insertBefore(button, host.firstChild) : host.appendChild(button);
    document.body.insertAdjacentHTML('beforeend', `<div class="kpa-history-bg" id="kpaHistoryBg"></div><aside class="kpa-history-panel" id="kpaHistoryPanel" aria-hidden="true"><div class="kpa-history-head"><strong>발송 이력</strong><button class="kpa-history-close" id="kpaHistoryClose" type="button">×</button></div><p class="kpa-history-note">보낸 회사는 이후 후보에서 자동 제외됩니다.</p><div class="kpa-history-list" id="kpaHistoryList"><div class="kpa-history-empty">이력을 불러오는 중입니다.</div></div></aside><div class="kpa-history-toast" id="kpaHistoryToast"></div>`);
    button.onclick = open; $('kpaHistoryBg').onclick = close; $('kpaHistoryClose').onclick = close; $('kpaHistoryToast').onclick = open;
    document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  }
  function count(total = 0) {
    const badge = $('kpaHistoryCount'); if (!badge) return;
    const value = Math.max(0, Number(total) || 0); badge.textContent = value > 99 ? '99+' : value; badge.classList.toggle('on', value > 0);
  }
  function dateText(value = '') {
    const date = new Date(value); if (Number.isNaN(date.getTime())) return '';
    const today = date.toDateString() === new Date().toDateString();
    return new Intl.DateTimeFormat('ko-KR', today ? {hour:'2-digit',minute:'2-digit'} : {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);
  }
  function render(data = {}) {
    const list = $('kpaHistoryList'); if (!list) return;
    const items = Array.isArray(data.items) ? data.items : []; count(data.total ?? items.length);
    list.innerHTML = items.length ? items.map(item => `<div class="kpa-history-row"><div><span class="kpa-history-name">${esc(item.name || item.domain || '회사')}</span><span class="kpa-history-domain">${esc(item.domain || '')}</span></div><time class="kpa-history-date">${esc(dateText(item.sentAt))}</time></div>`).join('') : '<div class="kpa-history-empty">아직 저장된 발송 이력이 없습니다.</div>';
  }
  async function load(force = false) {
    if (loading) return cache; if (cache && !force) return cache; loading = true;
    try {
      const response = await originalFetch(`${HISTORY}&t=${Date.now()}`, {cache:'no-store',credentials:'same-origin'});
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      cache = data; render(data); return data;
    } finally { loading = false; }
  }
  async function open() {
    build(); document.documentElement.classList.add('kpa-history-open'); $('kpaHistoryPanel')?.setAttribute('aria-hidden','false');
    try { await load(true); } catch (error) { if ($('kpaHistoryList')) $('kpaHistoryList').innerHTML = `<div class="kpa-history-empty">${esc(error.message || '이력을 불러오지 못했습니다.')}</div>`; }
  }
  function close() { document.documentElement.classList.remove('kpa-history-open'); $('kpaHistoryPanel')?.setAttribute('aria-hidden','true'); }
  function toast(message, warn = false) {
    build(); const node = $('kpaHistoryToast'); if (!node || !message) return; clearTimeout(toastTimer);
    node.textContent = `${message} · 이력 보기`; node.classList.toggle('warn', warn); node.classList.add('on');
    toastTimer = setTimeout(() => node.classList.remove('on'), 4500);
  }
  function notifySuppressed(value = 0) { const n = Math.max(0, Number(value) || 0); if (n) toast(`보낸 회사 ${n}곳을 후보에서 제외했습니다`); }
  function notifySent(name = '', saved = true) { cache = null; toast(saved ? `${clean(name,120) || '회사'} 발송 완료, 다음 후보부터 제외됩니다` : '메일은 발송됐지만 이력 저장을 확인해주세요', !saved); if (saved) load(true).catch(() => {}); }
  function isSend(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || ''; const method = String(init.method || input?.method || 'GET').toUpperCase();
    try { const parsed = new URL(url, location.origin); return method === 'POST' && parsed.origin === location.origin && parsed.pathname === '/api/gmail' && !parsed.searchParams.get('action'); } catch { return false; }
  }
  window.fetch = async (input, init = {}) => {
    let next = init, payload = null;
    if (isSend(input, init) && typeof init.body === 'string') try { payload = JSON.parse(init.body); if (payload?.companyKey && !payload.companyName) { payload.companyName = companyName(payload.companyKey); next = {...init,body:JSON.stringify(payload)}; } } catch {}
    const response = await originalFetch(input, next);
    if (payload && response.ok) response.clone().json().then(data => { if (data?.ok && !data?.testMode) notifySent(data.companyName || payload.companyName || payload.companyKey, data.historySaved !== false); }).catch(() => {});
    return response;
  };
  window.KPASentHistory = {open, refresh:() => load(true), notifySent, notifySuppressed};
  const ready = () => { build(); load().catch(() => {}); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', ready) : ready();
})();
