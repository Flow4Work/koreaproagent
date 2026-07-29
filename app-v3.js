const $ = (id) => document.getElementById(id);

const APP_VERSION = '20260730-revenue-hunt-v1';
const LEADS_KEY = 'kpa.hunt.leads';
const SELECTED_KEY = 'kpa.hunt.selected';
const CYCLE_KEY = 'kpa.hunt.cycle';
const FIRST_RUN_KEY = 'kpa.hunt.firstRun';
const EXA_KEY = 'kpa.hunt.exaKey';
const MAX_BUFFER = 250;
const AUTO_DURATION_MS = 15 * 60 * 1000;

const CAMPAIGNS = {
  kbw: { label: 'KBW 단체복', icon: '👕', market: '해외→한국', message: 'en' },
  apparel: { label: '국내 단체복', icon: '👕', market: '한국', message: 'ko' },
  ax: { label: 'AX PoC', icon: '🤖', market: '한국', message: 'ko' },
  video: { label: '영상 제작', icon: '🎬', market: '한국+해외', message: 'ko' },
  dev: { label: '개발 Capacity', icon: '💻', market: '한국', message: 'ko' }
};

const state = {
  leads: loadJson(LEADS_KEY, []),
  selected: new Set(loadJson(SELECTED_KEY, [])),
  controllers: new Set(),
  cycle: Number(localStorage.getItem(CYCLE_KEY) || '0'),
  firstRun: localStorage.getItem(FIRST_RUN_KEY) === '1',
  auto: false,
  manualRunning: false,
  autoUntil: 0,
  currentCampaign: localStorage.getItem('kpa.hunt.campaign') || 'kbw',
  statusText: ''
};

function loadJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch { return fallback; }
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}

function clean(value = '', max = 260) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function safeUrl(value = '') {
  try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}

function host(value = '') {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return clean(value, 120); }
}

function saveState() {
  state.leads = state.leads.slice(0, MAX_BUFFER);
  localStorage.setItem(LEADS_KEY, JSON.stringify(state.leads));
  localStorage.setItem(SELECTED_KEY, JSON.stringify([...state.selected]));
  localStorage.setItem(CYCLE_KEY, String(state.cycle));
  localStorage.setItem('kpa.hunt.campaign', state.currentCampaign);
}

async function readJson(response) {
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`응답 형식 오류 (HTTP ${response.status})`); }
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function post(url, payload, timeout = 30000) {
  const controller = new AbortController();
  state.controllers.add(controller);
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await readJson(await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: controller.signal
    }));
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('요청을 중단했습니다.');
    throw error;
  } finally {
    clearTimeout(timer);
    state.controllers.delete(controller);
  }
}

function abortAll() {
  for (const controller of state.controllers) {
    try { controller.abort(); } catch {}
  }
  state.controllers.clear();
}

async function health() {
  try {
    const h = await readJson(await fetch(`/api/health?t=${Date.now()}`, { cache:'no-store' }));
    const ok = Boolean(h.tavilyConfigured);
    $('apiStatus').className = `status ${ok ? 'ok' : 'bad'}`;
    $('apiStatus').innerHTML = `<span class="dot"></span><span>${ok ? '검색 연결됨' : '확인 필요'}</span>`;
    return ok;
  } catch {
    $('apiStatus').className = 'status bad';
    $('apiStatus').innerHTML = '<span class="dot"></span><span>오류</span>';
    return false;
  }
}

async function diagnostics() {
  const panel = $('diagPanel');
  panel.classList.remove('hidden');
  panel.innerHTML = '<div class="diag">확인 중…</div>';
  try {
    const h = await readJson(await fetch(`/api/health?t=${Date.now()}`, { cache:'no-store' }));
    const line = (name, ok, detail) => `<div class="diag-row"><b class="${ok ? 'diag-ok' : 'diag-bad'}">${ok ? '✓' : '✕'}</b><span>${escapeHtml(name)} · ${escapeHtml(detail)}</span></div>`;
    panel.innerHTML = `<div class="diag">${line('웹 검색', h.tavilyConfigured, h.tavilyConfigured ? 'Tavily 연결됨' : '설정 필요')}${line('AI', h.inferenceSmokeOk, h.inferenceSmokeModel || '현재 빠른 사냥은 AI 없이도 진행')}${line('연락처', h.contactDiscoveryConfigured || true, '공개 웹 + 연결된 공급자')}${line('Exa', Boolean(localStorage.getItem(EXA_KEY)), localStorage.getItem(EXA_KEY) ? '키 저장됨 · 아직 검색에는 미사용' : '연결 전')}</div>`;
  } catch (error) {
    panel.innerHTML = `<div class="diag">${escapeHtml(error.message)}</div>`;
  }
}

function campaign() {
  return CAMPAIGNS[state.currentCampaign] || CAMPAIGNS.kbw;
}

function leadReady(lead) {
  return Boolean(lead?.contact?.email && (lead.message_ko || lead.message_en));
}

function leadMessage(lead) {
  const cfg = CAMPAIGNS[lead.campaign] || CAMPAIGNS.kbw;
  return cfg.message === 'en' ? (lead.message_en || lead.message_ko || '') : (lead.message_ko || lead.message_en || '');
}

function gmailUrl(lead) {
  const email = lead?.contact?.email;
  const subject = clean(lead.subject, 180);
  const body = leadMessage(lead);
  if (!email || !subject || !body) return '';
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function stageText(lead) {
  if (leadReady(lead)) return '발송 준비';
  if (lead.contact_status === 'searching') return '이메일 찾는 중';
  if (lead.contact_status === 'failed') return '이메일 미확보';
  return '후보 발견';
}

function remainingText() {
  if (!state.auto || !state.autoUntil) return '';
  const left = Math.max(0, state.autoUntil - Date.now());
  const min = Math.floor(left / 60000);
  const sec = Math.floor((left % 60000) / 1000);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function updateMainButton() {
  const button = $('runBtn');
  button.classList.remove('auto-ready', 'hunting');
  button.disabled = false;

  if (state.auto) {
    button.textContent = '진정시키기';
    button.classList.add('hunting');
    return;
  }
  if (state.manualRunning) {
    button.textContent = '첫 사냥 중…';
    button.disabled = true;
    return;
  }
  if (state.firstRun) {
    button.textContent = '자동사냥';
    button.classList.add('auto-ready');
    return;
  }
  button.textContent = '오늘 영업 준비';
}

function renderSummary() {
  const ready = state.leads.filter(leadReady).length;
  const contacts = state.leads.filter(x => x.contact?.email).length;
  const selected = state.selected.size;
  const auto = state.auto ? `<span class="hunt-live">자동사냥 ${remainingText()} 남음</span>` : '';
  $('summary').innerHTML = `<strong>발송 가능 ${ready}개</strong><span>후보 ${state.leads.length}개</span><span>이메일 ${contacts}개</span><span>선택 ${selected}개</span>${auto}${state.statusText ? `<span>${escapeHtml(state.statusText)}</span>` : ''}`;
}

function render() {
  renderSummary();
  updateMainButton();
  const leads = [...state.leads].sort((a, b) => {
    const sel = Number(state.selected.has(b.id)) - Number(state.selected.has(a.id));
    if (sel) return sel;
    const ready = Number(leadReady(b)) - Number(leadReady(a));
    if (ready) return ready;
    return (b.score || 0) - (a.score || 0);
  });

  if (!leads.length) {
    $('content').innerHTML = '<div class="empty"><strong>아직 잡힌 후보가 없습니다.</strong><span>캠페인을 고르고 오늘 영업 준비를 눌러 시작합니다.</span></div>';
    return;
  }

  $('content').innerHTML = `<table class="lead-table"><thead><tr><th></th><th>캠페인 / 회사</th><th>왜 지금</th><th>담당자 / 이메일</th><th>제안</th><th>상태</th><th>행동</th></tr></thead><tbody>${leads.map((lead, index) => {
    const c = lead.contact || {};
    const source = safeUrl(lead.source_url);
    const mail = gmailUrl(lead);
    const checked = state.selected.has(lead.id) ? 'checked' : '';
    const detailId = `detail-${index}`;
    return `<tr class="data-row ${leadReady(lead) ? 'ready-row' : ''}">
      <td class="select-cell"><input class="lead-check" type="checkbox" data-id="${escapeHtml(lead.id)}" ${checked}></td>
      <td class="company"><span class="campaign-badge">${escapeHtml(lead.campaign_label || lead.campaign)}</span><strong>${escapeHtml(lead.company)}</strong><a href="${escapeHtml(safeUrl(lead.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(lead.domain || host(lead.url))}</a><p>적합도 ${Number(lead.score) || 0}</p></td>
      <td class="signal"><strong>${escapeHtml(clean(lead.signal, 240))}</strong>${source ? `<a class="source-link" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">근거 보기</a>` : ''}</td>
      <td class="contact">${c.email ? `<strong>${escapeHtml(c.name || lead.recommended_role || '담당자')}</strong><span>${escapeHtml(c.title || lead.recommended_role || '')}</span><a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : `<strong>${escapeHtml(lead.recommended_role || '담당자')}</strong><small class="pending">${escapeHtml(stageText(lead))}</small>`}</td>
      <td class="offer"><strong>${escapeHtml(clean(lead.offer, 180))}</strong></td>
      <td><span class="stage ${leadReady(lead) ? 'stage-ready' : ''}">${escapeHtml(stageText(lead))}</span></td>
      <td><div class="actions">${mail ? `<a class="mail-btn" href="${escapeHtml(mail)}" target="_blank" rel="noopener noreferrer">Gmail</a>` : ''}<button class="detail-btn" data-detail="${detailId}">상세</button></div></td>
    </tr>
    <tr class="detail-row"><td colspan="7"><div class="detail" id="${detailId}"><section><h4>맞춤 제안</h4><p>${escapeHtml(lead.offer || '')}</p></section><section><h4>보낼 메시지</h4><pre>${escapeHtml(leadMessage(lead))}</pre></section></div></td></tr>`;
  }).join('')}</tbody></table>`;

  document.querySelectorAll('.lead-check').forEach(input => input.addEventListener('change', () => {
    const id = input.dataset.id;
    if (input.checked) state.selected.add(id); else state.selected.delete(id);
    saveState();
    renderSummary();
  }));

  document.querySelectorAll('[data-detail]').forEach(button => button.addEventListener('click', () => {
    $(button.dataset.detail)?.classList.toggle('open');
  }));
}

function mergeLeads(incoming = []) {
  const byId = new Map(state.leads.map(lead => [lead.id || `${lead.campaign}:${lead.domain}`, lead]));
  const added = [];
  for (const raw of incoming) {
    const id = raw.id || `${raw.campaign}:${raw.domain}`;
    if (!id || byId.has(id)) continue;
    const lead = { ...raw, id, contact_status: raw.contact_status || 'pending' };
    byId.set(id, lead);
    added.push(lead);
  }
  state.leads = [...byId.values()].slice(-MAX_BUFFER).reverse();
  saveState();
  return added;
}

function patchLead(id, patch) {
  const index = state.leads.findIndex(lead => lead.id === id);
  if (index < 0) return;
  state.leads[index] = { ...state.leads[index], ...patch };
  saveState();
  render();
}

async function enrichContact(lead) {
  patchLead(lead.id, { contact_status:'searching' });
  try {
    const result = await post('/api/contact', { url: lead.url, recommendedRole: lead.recommended_role }, 26000);
    patchLead(lead.id, {
      contact: result.contact || null,
      contacts: result.contacts || [],
      contact_provider: result.provider || null,
      contact_status: result.contact?.email ? 'found' : 'failed'
    });
  } catch (error) {
    if (!state.auto && /중단/.test(error.message)) return;
    patchLead(lead.id, { contact_status:'failed' });
  }
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

async function runHuntCycle() {
  state.cycle += 1;
  saveState();
  state.statusText = `${campaign().label} 후보 찾는 중`;
  renderSummary();

  const excludeDomains = state.leads.map(lead => lead.domain).filter(Boolean).slice(0, 180);
  const result = await post('/api/hunt', {
    campaign: state.currentCampaign,
    cycle: state.cycle,
    excludeDomains
  }, 22000);

  const added = mergeLeads(result.leads || []);
  state.statusText = added.length ? `${added.length}개 발견 · 이메일 확인 중` : '새 후보 없음 · 다음 검색에서 다시 시도';
  render();

  if (added.length) await mapLimit(added.slice(0, 10), 4, enrichContact);
  state.statusText = added.length ? `${added.length}개 처리 완료` : '';
  render();
  return added.length;
}

async function manualHunt() {
  if (state.manualRunning || state.auto) return;
  state.manualRunning = true;
  updateMainButton();
  try {
    if (!await health()) throw new Error('검색 엔진 연결 상태를 확인해주세요.');
    await runHuntCycle();
    state.firstRun = true;
    localStorage.setItem(FIRST_RUN_KEY, '1');
  } catch (error) {
    state.statusText = error.message || '사냥 실패';
  } finally {
    state.manualRunning = false;
    render();
  }
}

function waitRandom() {
  const ms = 5000 + Math.floor(Math.random() * 7000);
  return new Promise(resolve => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (!state.auto || Date.now() - started >= ms) {
        clearInterval(timer);
        resolve();
      }
    }, 250);
  });
}

async function startAutoHunt() {
  if (state.auto) return;
  state.auto = true;
  state.autoUntil = Date.now() + AUTO_DURATION_MS;
  state.statusText = '15분 자동사냥 시작';
  render();

  while (state.auto && Date.now() < state.autoUntil) {
    try { await runHuntCycle(); }
    catch (error) {
      if (!state.auto) break;
      state.statusText = `이번 회차 실패 · ${clean(error.message, 100)}`;
      renderSummary();
    }
    if (!state.auto || Date.now() >= state.autoUntil) break;
    await waitRandom();
  }

  if (state.auto) {
    state.auto = false;
    state.statusText = '15분 자동사냥 완료';
    render();
  }
}

function stopAutoHunt() {
  state.auto = false;
  state.autoUntil = 0;
  abortAll();
  state.statusText = '자동사냥 중지 · 현재 결과 유지';
  render();
}

function handleRunButton() {
  if (state.auto) return stopAutoHunt();
  if (state.firstRun) return startAutoHunt();
  return manualHunt();
}

function populateCampaigns() {
  $('campaignSelect').innerHTML = Object.entries(CAMPAIGNS).map(([id, c]) => `<option value="${id}">${c.icon} ${c.label} · ${c.market}</option>`).join('');
  $('campaignSelect').value = CAMPAIGNS[state.currentCampaign] ? state.currentCampaign : 'kbw';
  $('campaignSelect').addEventListener('change', event => {
    state.currentCampaign = event.target.value;
    saveState();
    state.statusText = `${campaign().label} 모드`;
    render();
  });
}

function setupSettings() {
  const input = $('exaKey');
  input.value = localStorage.getItem(EXA_KEY) || '';
  $('saveSearchSettings').addEventListener('click', () => {
    const key = input.value.trim();
    if (key) localStorage.setItem(EXA_KEY, key); else localStorage.removeItem(EXA_KEY);
    $('searchSettingsNote').textContent = key ? 'Exa 키 저장됨 · 아직 검색 호출에는 사용하지 않음' : 'Exa 연결 전';
    diagnostics();
  });
  $('searchSettingsNote').textContent = input.value ? 'Exa 키 저장됨 · 아직 검색 호출에는 사용하지 않음' : 'Exa 연결 전';
}

$('runBtn').addEventListener('click', handleRunButton);
$('diagBtn').addEventListener('click', () => {
  $('diagPanel').classList.toggle('hidden');
  if (!$('diagPanel').classList.contains('hidden')) diagnostics();
});
$('settingsBtn').addEventListener('click', () => $('settingsPanel').classList.toggle('hidden'));
$('clearSelectionBtn').addEventListener('click', () => {
  state.selected.clear();
  saveState();
  render();
});

if (localStorage.getItem('kpa.hunt.version') !== APP_VERSION) {
  localStorage.setItem('kpa.hunt.version', APP_VERSION);
}

populateCampaigns();
setupSettings();
render();
health();
setInterval(() => { if (state.auto) renderSummary(); }, 1000);
