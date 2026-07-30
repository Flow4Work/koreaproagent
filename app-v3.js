const $ = id => document.getElementById(id);

const APP_VERSION = '20260730-quality-hunt-v3';
const LEADS_KEY = 'kpa.hunt.leads';
const SELECTED_KEY = 'kpa.hunt.selected';
const REJECTED_KEY = 'kpa.hunt.rejected';
const CYCLE_KEY = 'kpa.hunt.cycle';
const FIRST_RUN_KEY = 'kpa.hunt.firstRun';
const STOPPED_KEY = 'kpa.hunt.stopped';
const EXA_KEY = 'kpa.hunt.exaKey';
const JINA_KEY = 'kpa.hunt.jinaKey';
const BRAVE_KEY = 'kpa.hunt.braveKey';
const DART_KEY = 'kpa.hunt.dartKey';
const MAX_BUFFER = 250;
const AUTO_DURATION_MS = 15 * 60 * 1000;

const CAMPAIGNS = {
  kbw: { label:'KBW 단체복', icon:'👕', market:'해외→한국', message:'en' },
  apparel: { label:'국내 단체복', icon:'👕', market:'한국', message:'ko' },
  ax: { label:'AX PoC', icon:'🤖', market:'한국', message:'ko' },
  video: { label:'영상 제작', icon:'🎬', market:'한국', message:'ko' },
  dev: { label:'개발 Capacity', icon:'💻', market:'한국', message:'ko' }
};

function loadJson(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback; } catch { return fallback; } }
function clean(v = '', max = 260) { return String(v || '').replace(/\s+/g,' ').trim().slice(0,max); }
function escapeHtml(v = '') { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function safeUrl(v = '') { try { const u = new URL(v); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
function host(v = '') { try { return new URL(v).hostname.replace(/^www\./,'').toLowerCase(); } catch { return clean(v,120).toLowerCase(); } }
function rootHost(v = '') {
  const h = host(v); const p = h.split('.');
  if (p.length <= 2) return h;
  const three = p.slice(-3).join('.');
  if (/^(?:[^.]+\.)?(?:co|or|go|ac)\.kr$/.test(three)) return three;
  return p.slice(-2).join('.');
}

if (localStorage.getItem('kpa.hunt.version') !== APP_VERSION) {
  localStorage.removeItem(LEADS_KEY);
  localStorage.removeItem(SELECTED_KEY);
  localStorage.removeItem(CYCLE_KEY);
  localStorage.removeItem(FIRST_RUN_KEY);
  localStorage.removeItem(STOPPED_KEY);
  localStorage.setItem('kpa.hunt.version', APP_VERSION);
}

const state = {
  leads: loadJson(LEADS_KEY, []),
  selected: new Set(loadJson(SELECTED_KEY, [])),
  rejected: new Set(loadJson(REJECTED_KEY, [])),
  controllers: new Set(),
  cycle: Number(localStorage.getItem(CYCLE_KEY) || '0'),
  firstRun: localStorage.getItem(FIRST_RUN_KEY) === '1',
  stopped: localStorage.getItem(STOPPED_KEY) === '1',
  auto: false,
  manualRunning: false,
  autoUntil: 0,
  autoBaseline: { ready: 0, verified: 0 },
  currentCampaign: localStorage.getItem('kpa.hunt.campaign') || 'kbw',
  statusText: ''
};

function saveState() {
  state.leads = state.leads.slice(0, MAX_BUFFER);
  localStorage.setItem(LEADS_KEY, JSON.stringify(state.leads));
  localStorage.setItem(SELECTED_KEY, JSON.stringify([...state.selected]));
  localStorage.setItem(REJECTED_KEY, JSON.stringify([...state.rejected].slice(-500)));
  localStorage.setItem(CYCLE_KEY, String(state.cycle));
  localStorage.setItem('kpa.hunt.campaign', state.currentCampaign);
  if (state.stopped) localStorage.setItem(STOPPED_KEY,'1'); else localStorage.removeItem(STOPPED_KEY);
}

async function readJson(response) {
  const text = await response.text(); let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(`응답 형식 오류 (HTTP ${response.status})`); }
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function post(url, payload, timeout = 42000) {
  const controller = new AbortController(); state.controllers.add(controller);
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await readJson(await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), cache:'no-store', signal:controller.signal })); }
  catch (e) { if (e?.name === 'AbortError') throw new Error('요청을 중단했습니다.'); throw e; }
  finally { clearTimeout(timer); state.controllers.delete(controller); }
}

function abortAll() { for (const c of state.controllers) { try { c.abort(); } catch {} } state.controllers.clear(); }
function campaign() { return CAMPAIGNS[state.currentCampaign] || CAMPAIGNS.kbw; }
function toolKeys() {
  return {
    exaKey:localStorage.getItem(EXA_KEY) || '',
    jinaKey:localStorage.getItem(JINA_KEY) || '',
    braveKey:localStorage.getItem(BRAVE_KEY) || '',
    dartKey:localStorage.getItem(DART_KEY) || ''
  };
}

async function health() {
  try {
    const h = await readJson(await fetch(`/api/health?t=${Date.now()}`, { cache:'no-store' }));
    const ok = Boolean(h.tavilyConfigured);
    $('apiStatus').className = `status ${ok ? 'ok' : 'bad'}`;
    $('apiStatus').innerHTML = `<span class="dot"></span><span>${ok ? '검색 연결됨' : '확인 필요'}</span>`;
    return ok;
  } catch { $('apiStatus').className = 'status bad'; $('apiStatus').innerHTML = '<span class="dot"></span><span>오류</span>'; return false; }
}

async function diagnostics() {
  const panel = $('diagPanel'); panel.classList.remove('hidden'); panel.innerHTML = '<div class="diag">확인 중…</div>';
  try {
    const h = await readJson(await fetch(`/api/health?t=${Date.now()}`, { cache:'no-store' }));
    const line = (name, ok, detail) => `<div class="diag-row"><b class="${ok ? 'diag-ok' : 'diag-bad'}">${ok ? '✓' : '·'}</b><span>${escapeHtml(name)} · ${escapeHtml(detail)}</span></div>`;
    const exa = Boolean(localStorage.getItem(EXA_KEY));
    panel.innerHTML = `<div class="diag">${line('기본 검색', h.tavilyConfigured, h.tavilyConfigured ? 'Tavily 연결됨' : '설정 필요')}${line('Exa 보강', exa, exa ? '구매 신호 후보 부족 시 보강 검색' : '키 입력 시 활성화')}${line('Jina 검증', Boolean(localStorage.getItem(JINA_KEY)), localStorage.getItem(JINA_KEY) ? '기사/행사에서 실제 회사 도메인 확인' : '키 입력 시 활성화')}${line('Brave 보강', Boolean(localStorage.getItem(BRAVE_KEY)), localStorage.getItem(BRAVE_KEY) ? '후보 부족 시만 사용' : '키 입력 시 활성화')}${line('OpenDART', Boolean(localStorage.getItem(DART_KEY)), localStorage.getItem(DART_KEY) ? 'AX 최근 공시 신호 사용' : '키 입력 시 활성화')}${line('제외 학습', state.rejected.size > 0, `${state.rejected.size}개 도메인 재탐색 차단`)}</div>`;
  } catch (e) { panel.innerHTML = `<div class="diag">${escapeHtml(e.message)}</div>`; }
}

function leadMessage(lead) {
  const cfg = CAMPAIGNS[lead.campaign] || CAMPAIGNS.kbw;
  return cfg.message === 'en' ? (lead.message_en || '') : (lead.message_ko || lead.message_en || '');
}
function usableEmail(lead) {
  const email = clean(lead?.contact?.email, 220).toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return false;
  if (/u00[0-9a-f]{2}|\\u00|&(?:gt|lt|amp);|[<>]/i.test(email)) return false;
  const emailDomain = email.split('@')[1] || '';
  const companyDomain = rootHost(lead?.domain || lead?.url || '');
  return Boolean(companyDomain && (emailDomain === companyDomain || emailDomain.endsWith(`.${companyDomain}`)));
}
function leadReady(lead) {
  return Boolean(lead?.verified_company && Number(lead?.score || 0) >= 70 && usableEmail(lead) && leadMessage(lead).length >= 120);
}
function gmailUrl(lead) {
  const email = lead?.contact?.email, subject = clean(lead.subject,180), body = leadMessage(lead);
  if (!leadReady(lead) || !email || !subject || !body) return '';
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function stageText(lead) {
  if (leadReady(lead)) return '발송 준비';
  if (lead?.contact?.email && !usableEmail(lead)) return '이메일 검증 필요';
  if (lead.contact_status === 'searching') return '이메일 찾는 중';
  if (lead.contact_status === 'failed') return '이메일 미확보';
  return lead.verified_company ? '검증 후보' : '후보';
}
function remainingText() {
  if (!state.auto || !state.autoUntil) return '';
  const left = Math.max(0,state.autoUntil-Date.now());
  return `${Math.floor(left/60000)}:${String(Math.floor((left%60000)/1000)).padStart(2,'0')}`;
}
function currentCounts() { return { ready: state.leads.filter(leadReady).length, verified: state.leads.filter(x => x.verified_company).length }; }
function deltaHtml(value) { return value > 0 ? `<b class="summary-delta">+${value}</b>` : ''; }

function updateMainButton() {
  const b = $('runBtn'); b.classList.remove('auto-ready','hunting'); b.disabled = false;
  if (state.auto) { b.textContent = '진정시키기'; b.classList.add('hunting'); return; }
  if (state.manualRunning) { b.textContent = state.firstRun ? '새로 찾는 중…' : '첫 사냥 중…'; b.disabled = true; return; }
  if (state.stopped) { b.textContent = '새로찾기'; return; }
  if (state.firstRun) { b.textContent = '자동사냥'; b.classList.add('auto-ready'); return; }
  b.textContent = '오늘 영업 준비';
}

function renderSummary() {
  const counts = currentCounts(); const selected = state.selected.size; const showDelta = state.auto;
  const readyDelta = showDelta ? Math.max(0, counts.ready - state.autoBaseline.ready) : 0;
  const verifiedDelta = showDelta ? Math.max(0, counts.verified - state.autoBaseline.verified) : 0;
  const auto = state.auto ? `<span class="hunt-live">자동사냥 ${remainingText()} 남음</span>` : '';
  $('summary').innerHTML = `<strong>발송 가능 ${counts.ready}개${deltaHtml(readyDelta)}</strong><span>검증 후보 ${counts.verified}개${deltaHtml(verifiedDelta)}</span><span>선택 ${selected}개</span><span>제외 ${state.rejected.size}개</span>${auto}${state.statusText ? `<span>${escapeHtml(state.statusText)}</span>` : ''}`;
}

function smallBadges(values = []) { return [...new Set(values.filter(Boolean))].slice(0,4).map(x => `<span class="quality-badge">${escapeHtml(clean(x,42))}</span>`).join(''); }

function render() {
  renderSummary(); updateMainButton();
  const leads = [...state.leads].sort((a,b) => Number(state.selected.has(b.id))-Number(state.selected.has(a.id)) || Number(leadReady(b))-Number(leadReady(a)) || (b.score||0)-(a.score||0));
  if (!leads.length) { $('content').innerHTML = '<div class="empty"><strong>아직 잡힌 후보가 없습니다.</strong><span>캠페인을 고르고 오늘 영업 준비를 눌러 시작합니다.</span></div>'; return; }

  $('content').innerHTML = `<table class="lead-table"><thead><tr><th></th><th>캠페인 / 회사</th><th>왜 지금</th><th>담당자 / 이메일</th><th>제안</th><th>상태</th><th>행동</th></tr></thead><tbody>${leads.map((lead,i) => {
    const c = lead.contact || {}, source = safeUrl(lead.source_url), mail = gmailUrl(lead), checked = state.selected.has(lead.id) ? 'checked' : '', detailId = `detail-${i}`;
    const quality = smallBadges([...(lead.quality_reasons || []), ...(lead.tool_signals || [])]);
    const role = clean(c.title || lead.recommended_role || '담당자', 120); const person = clean(c.name || '', 120);
    const contactBlock = c.email ? `<strong>${escapeHtml(person || role)}</strong>${person && role && person !== role ? `<span>${escapeHtml(role)}</span>` : ''}<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : `<strong>${escapeHtml(role)}</strong><small class="pending">${escapeHtml(stageText(lead))}</small>`;
    return `<tr class="data-row ${leadReady(lead) ? 'ready-row' : ''}"><td class="select-cell"><input class="lead-check" type="checkbox" data-id="${escapeHtml(lead.id)}" ${checked}></td><td class="company"><span class="campaign-badge">${escapeHtml(lead.campaign_label || lead.campaign)}</span><strong>${escapeHtml(lead.company)}</strong><a href="${escapeHtml(safeUrl(lead.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(lead.domain || host(lead.url))}</a><p>적합도 ${Number(lead.score)||0} · ${escapeHtml(lead.verified_by || '검증')}</p><div class="quality-badges">${quality}</div></td><td class="signal"><strong>${escapeHtml(clean(lead.signal,300))}</strong>${source ? `<a class="source-link" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">근거 보기</a>` : ''}</td><td class="contact">${contactBlock}</td><td class="offer"><strong>${escapeHtml(clean(lead.offer,220))}</strong></td><td><span class="stage ${leadReady(lead) ? 'stage-ready' : ''}">${escapeHtml(stageText(lead))}</span></td><td><div class="actions">${mail ? `<a class="mail-btn" href="${escapeHtml(mail)}" target="_blank" rel="noopener noreferrer">Gmail</a>` : ''}<button class="detail-btn" data-detail="${detailId}">상세</button><button class="reject-btn" data-reject="${escapeHtml(lead.id)}">제외</button></div></td></tr><tr class="detail-row"><td colspan="7"><div class="detail" id="${detailId}"><section><h4>왜 통과했나</h4><p>${escapeHtml((lead.quality_reasons || []).join(' · ') || lead.verified_by || '')}</p></section><section><h4>맞춤 제안</h4><p>${escapeHtml(lead.offer || '')}</p></section><section class="mail-preview"><h4>보낼 메시지</h4><pre>${escapeHtml(leadMessage(lead))}</pre></section></div></td></tr>`;
  }).join('')}</tbody></table>`;

  document.querySelectorAll('.lead-check').forEach(input => input.addEventListener('change', () => { if (input.checked) state.selected.add(input.dataset.id); else state.selected.delete(input.dataset.id); saveState(); renderSummary(); }));
  document.querySelectorAll('[data-detail]').forEach(b => b.addEventListener('click', () => $(b.dataset.detail)?.classList.toggle('open')));
  document.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', () => { const id = b.dataset.reject; const lead = state.leads.find(x => x.id === id); if (!lead) return; if (lead.domain) state.rejected.add(String(lead.domain).toLowerCase()); state.selected.delete(id); state.leads = state.leads.filter(x => x.id !== id); saveState(); render(); }));
}

function mergeLeads(incoming = []) {
  const byId = new Map(state.leads.map(x => [x.id || `${x.campaign}:${x.domain}`,x])); const domains = new Set(state.leads.map(x => String(x.domain || '').toLowerCase()).filter(Boolean)); const added = [];
  for (const raw of incoming) { const domain = String(raw.domain || '').toLowerCase(); const id = raw.id || `${raw.campaign}:${domain}`; if (!id || !domain || byId.has(id) || domains.has(domain) || state.rejected.has(domain)) continue; const lead = {...raw,id,domain,contact_status:raw.contact_status||'pending'}; byId.set(id,lead); domains.add(domain); added.push(lead); }
  state.leads = [...byId.values()].slice(-MAX_BUFFER).reverse(); saveState(); return added;
}
function patchLead(id, patch) { const i = state.leads.findIndex(x => x.id === id); if (i < 0) return; state.leads[i] = {...state.leads[i],...patch}; saveState(); render(); }

async function enrichContact(lead) {
  patchLead(lead.id,{contact_status:'searching'});
  try { const r = await post('/api/contact',{url:lead.url,recommendedRole:lead.recommended_role},26000); patchLead(lead.id,{contact:r.contact||null,contacts:r.contacts||[],contact_provider:r.provider||null,contact_status:r.contact?.email?'found':'failed'}); }
  catch (e) { if (!state.auto && /중단/.test(e.message)) return; patchLead(lead.id,{contact_status:'failed'}); }
}
async function mapLimit(items, limit, worker) { let cursor=0; async function run(){ while(cursor<items.length){ const i=cursor++; await worker(items[i],i); } } await Promise.all(Array.from({length:Math.min(limit,items.length)},run)); }

async function runHuntCycle() {
  state.cycle += 1; saveState(); state.statusText = `${campaign().label} 의미 있는 후보 찾는 중`; renderSummary();
  const excluded = [...state.leads.map(x=>x.domain).filter(Boolean), ...state.rejected].slice(-500);
  const result = await post('/api/hunt',{campaign:state.currentCampaign,cycle:state.cycle,excludeDomains:excluded,tools:toolKeys()},42000);
  const added = mergeLeads(result.leads || []);
  const used = [result.meta?.exa_used?'Exa':'',result.meta?.jina_used?'Jina':'',result.meta?.brave_used?'Brave':'',result.meta?.opendart_used?'DART':''].filter(Boolean).join('+');
  state.statusText = added.length ? `${added.length}개 검증 통과${used ? ` · ${used}` : ''} · 이메일 확인 중` : '필수 신호를 통과한 새 후보 없음'; render();
  if (added.length) await mapLimit(added.slice(0,10),4,enrichContact);
  state.statusText = added.length ? `${added.length}개 처리 완료` : ''; render(); return added.length;
}

async function manualHunt() {
  if (state.manualRunning || state.auto) return; state.stopped = false; saveState(); state.manualRunning = true; updateMainButton();
  try { if (!await health()) throw new Error('검색 엔진 연결 상태를 확인해주세요.'); await runHuntCycle(); state.firstRun = true; localStorage.setItem(FIRST_RUN_KEY,'1'); }
  catch (e) { state.statusText = e.message || '사냥 실패'; }
  finally { state.manualRunning=false; render(); }
}
function waitRandom() { const ms=5000+Math.floor(Math.random()*7000); return new Promise(resolve => { const started=Date.now(); const t=setInterval(()=>{ if(!state.auto || Date.now()-started>=ms){clearInterval(t);resolve();}},250); }); }
async function startAutoHunt() {
  if(state.auto)return; state.stopped=false; const counts=currentCounts(); state.autoBaseline={ready:counts.ready,verified:counts.verified}; state.auto=true; state.autoUntil=Date.now()+AUTO_DURATION_MS; state.statusText='15분 자동사냥 시작'; saveState(); render();
  while(state.auto&&Date.now()<state.autoUntil){ try{await runHuntCycle();}catch(e){if(!state.auto)break;state.statusText=`이번 회차 실패 · ${clean(e.message,100)}`;renderSummary();} if(!state.auto||Date.now()>=state.autoUntil)break; await waitRandom(); }
  if(state.auto){ state.auto=false; state.autoUntil=0; state.stopped=true; state.statusText='15분 자동사냥 완료 · 완전 정지'; saveState(); render(); }
}
function stopAutoHunt(){ state.auto=false; state.autoUntil=0; state.stopped=true; abortAll(); state.statusText='자동사냥 중지 · 현재 결과 유지'; saveState(); render(); }
function handleRunButton(){ if(state.auto)return stopAutoHunt(); if(state.stopped){ state.statusText='새 검색 시작'; return manualHunt(); } if(state.firstRun)return startAutoHunt(); return manualHunt(); }

function populateCampaigns(){ $('campaignSelect').innerHTML=Object.entries(CAMPAIGNS).map(([id,c])=>`<option value="${id}">${c.icon} ${c.label} · ${c.market}</option>`).join(''); $('campaignSelect').value=CAMPAIGNS[state.currentCampaign]?state.currentCampaign:'kbw'; $('campaignSelect').addEventListener('change',e=>{state.currentCampaign=e.target.value;saveState();state.statusText=`${campaign().label} 모드`;render();}); }
function setupSettings(){
  const fields=[[EXA_KEY,'exaKey'],[JINA_KEY,'jinaKey'],[BRAVE_KEY,'braveKey'],[DART_KEY,'dartKey']]; for(const [key,id] of fields) $(id).value=localStorage.getItem(key)||'';
  const note=()=>{const active=[];if(localStorage.getItem(EXA_KEY))active.push('Exa');if(localStorage.getItem(JINA_KEY))active.push('Jina');if(localStorage.getItem(BRAVE_KEY))active.push('Brave');if(localStorage.getItem(DART_KEY))active.push('OpenDART');$('searchSettingsNote').textContent=active.length?`Tavily + ${active.join(' + ')} 활성`:'Tavily만 사용';};
  $('saveSearchSettings').addEventListener('click',()=>{for(const [key,id] of fields){const v=$(id).value.trim();if(v)localStorage.setItem(key,v);else localStorage.removeItem(key);}note();diagnostics();}); note();
}

$('runBtn').addEventListener('click',handleRunButton);
$('diagBtn').addEventListener('click',()=>{$('diagPanel').classList.toggle('hidden');if(!$('diagPanel').classList.contains('hidden'))diagnostics();});
$('settingsBtn').addEventListener('click',()=>{$('settingsPanel').classList.toggle('hidden');});
$('clearSelectionBtn').addEventListener('click',()=>{state.selected.clear();saveState();render();});
populateCampaigns();setupSettings();render();health();setInterval(()=>{if(state.auto)renderSummary();},1000);
