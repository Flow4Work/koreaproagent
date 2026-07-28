const $ = (id) => document.getElementById(id);
const APP_VERSION = '20260728-2';
const state = { workflow: 'sales', salesData: null, deliveryData: null, deliveryTab: 'prospects' };

if (localStorage.getItem('kpa.app.version') !== APP_VERSION) {
  ['kpa.sales.result','kpa.sales.form','kpa.delivery.result'].forEach(k => localStorage.removeItem(k));
  localStorage.setItem('kpa.app.version', APP_VERSION);
}

function escapeHtml(v = '') {
  return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function safeUrl(v = '') {
  try { const u = new URL(v); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
function host(v = '') {
  try { return new URL(v).hostname.replace(/^www\./, ''); } catch { return v; }
}
function csvCell(v) {
  const s = Array.isArray(v) ? v.join(' | ') : String(v ?? '');
  return `"${s.replace(/"/g, '""')}"`;
}
function download(name, type, content) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function googleSearchUrl(q = '') { return `https://www.google.com/search?q=${encodeURIComponent(q)}`; }
function roleKo(role = '') {
  const key = String(role).trim().toLowerCase();
  const map = {
    founder:'창업자', 'co-founder':'공동창업자', ceo:'대표',
    'head of sales':'영업 책임자', sales:'영업 담당자',
    bd:'사업개발 담당자', 'business development':'사업개발 담당자',
    partnerships:'파트너십 담당자', growth:'성장 담당자',
    revenue:'매출 책임자', commercial:'사업 책임자'
  };
  return map[key] || role || '영업 책임자';
}
function mailtoUrl(email, company, body) {
  if (!email) return '';
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Korea market sample for ${company}`)}&body=${encodeURIComponent(body || '')}`;
}
async function copyText(text, btn) {
  await navigator.clipboard.writeText(text || '');
  const old = btn.textContent;
  btn.textContent = '복사됨';
  setTimeout(() => btn.textContent = old, 900);
}

async function readJsonResponse(response) {
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(`응답 형식 오류 (HTTP ${response.status})`); }
  if (!response.ok) throw new Error(`${data?.error || `HTTP ${response.status}`}${data?.hint ? ` · ${data.hint}` : ''}`);
  return data;
}
async function requestJson(url, payload, timeoutMs = 110000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), timeoutMs);
  try {
    return await readJsonResponse(await fetch(url, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), cache:'no-store', signal:c.signal
    }));
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('조사가 너무 오래 걸려 중단됐습니다.');
    throw e;
  } finally { clearTimeout(t); }
}

async function checkHealth() {
  try {
    const d = await readJsonResponse(await fetch(`/api/health?t=${Date.now()}`, { cache:'no-store' }));
    const ok = Boolean(d.groqConnected && d.tavilyConfigured);
    $('apiStatus').className = `status ${ok ? 'ok' : 'bad'}`;
    $('apiStatus').innerHTML = `<span class="dot"></span><span>${ok ? '검색·분석 정상' : '연결 확인 필요'}</span>`;
    $('apiStatus').title = ok ? `검색·분석 정상${d.hunterConfigured ? ' · 담당자 찾기 준비됨' : ''}` : (d.error || '연결 실패');
    return ok;
  } catch {
    $('apiStatus').className = 'status bad';
    $('apiStatus').innerHTML = '<span class="dot"></span><span>연결 오류</span>';
    return false;
  }
}
function diagLine(name, ok, detail = '') {
  return `<div class="diag-row"><b class="${ok ? 'diag-ok' : 'diag-bad'}">${ok ? '✓' : '✕'}</b><span>${escapeHtml(name)}</span><small>${escapeHtml(detail)}</small></div>`;
}
async function runDiagnostics() {
  const btn = $('diagBtn'), panel = $('diagPanel');
  btn.disabled = true; btn.textContent = '확인 중'; panel.classList.remove('hidden');
  try {
    const h = await readJsonResponse(await fetch(`/api/health?t=${Date.now()}`, { cache:'no-store' }));
    panel.innerHTML = `<div class="diag-head"><strong>${h.groqConnected && h.tavilyConfigured ? '핵심 기능 정상' : '확인이 필요한 항목이 있습니다'}</strong><button id="diagClose" class="ghost small">닫기</button></div>${diagLine('회사 검색', h.tavilyConfigured, h.tavilyConfigured ? '사용 가능' : '설정 확인 필요')}${diagLine('후보 분석', h.groqConnected, h.groqConnected ? '사용 가능' : '인증 확인 필요')}${diagLine('담당자 찾기', h.hunterConfigured, h.hunterConfigured ? '사용 가능' : 'Hunter 설정 필요')}`;
    $('diagClose')?.addEventListener('click', () => panel.classList.add('hidden'));
  } catch (e) {
    panel.innerHTML = `<strong>상태 확인 실패</strong><p>${escapeHtml(e.message)}</p>`;
  } finally { btn.disabled = false; btn.textContent = '상태 확인'; }
}

function setWorkflow(name) {
  state.workflow = name;
  $('salesWorkspace').classList.toggle('hidden', name !== 'sales');
  $('deliveryWorkspace').classList.toggle('hidden', name !== 'delivery');
  document.querySelectorAll('.workflow-btn').forEach(b => b.classList.toggle('active', b.dataset.workflow === name));
  localStorage.setItem('kpa.workflow', name);
}
document.querySelectorAll('.workflow-btn').forEach(b => b.addEventListener('click', () => setWorkflow(b.dataset.workflow)));

function setSalesBusy(on) {
  $('salesRunBtn').disabled = on;
  $('salesRunBtn').querySelector('span').textContent = on ? '해외 회사와 담당자를 찾는 중…' : '오늘 연락할 회사 찾기';
  $('salesLoading').classList.toggle('hidden', !on);
  if (on) {
    $('salesEmpty').classList.add('hidden');
    $('salesError').classList.add('hidden');
    $('salesResults').classList.add('hidden');
  }
}
function salesError(msg) {
  $('salesLoading').classList.add('hidden');
  $('salesResults').classList.add('hidden');
  $('salesEmpty').classList.add('hidden');
  $('salesError').textContent = msg;
  $('salesError').classList.remove('hidden');
}
async function runSales() {
  const focus = $('salesFocus').value.trim();
  localStorage.setItem('kpa.sales.form', JSON.stringify({ focus }));
  state.salesData = null;
  setSalesBusy(true);
  try {
    if (!await checkHealth()) throw new Error('검색·분석 연결 상태를 먼저 확인해주세요.');
    const d = await requestJson('/api/discover-clients', { focus });
    if (!d?.leads?.length) throw new Error('실제로 연락할 만한 후보를 찾지 못했습니다.');
    state.salesData = d;
    localStorage.setItem('kpa.sales.result', JSON.stringify(d));
    renderSales();
  } catch (e) {
    salesError(e.message || '고객 발굴에 실패했습니다.');
  } finally {
    setSalesBusy(false);
    if (state.salesData?.leads?.length) $('salesResults').classList.remove('hidden');
  }
}

function evidenceLinks(lead) {
  const evidence = Array.isArray(lead?.evidence) && lead.evidence.length
    ? lead.evidence
    : (lead?.source_urls || []).map((url, i) => ({ title:`출처 ${i + 1}`, url }));
  return `<div class="source-links">${evidence.map((item, i) => {
    const url = safeUrl(item?.url);
    if (!url) return '';
    const label = item?.title || host(url) || `출처 ${i + 1}`;
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(host(url))}</span></a>`;
  }).join('')}</div>`;
}
function contactBlock(lead) {
  const c = lead.contact;
  const q = lead.contact_search_query || `"${lead.company}" Founder Head of Sales LinkedIn`;
  if (c?.email) {
    const confidence = c.confidence ? ` · 신뢰도 ${c.confidence}%` : '';
    return `<div class="contact-card-main"><div class="contact-meta"><span class="contact-found">담당자 찾음</span><strong>${escapeHtml(c.name || '이름 확인 필요')}</strong><p>${escapeHtml(c.title || roleKo(lead.recommended_role))}</p><a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a><small>Hunter 검색${escapeHtml(confidence)}</small></div><div class="contact-actions"><a class="btn-primary" href="${escapeHtml(mailtoUrl(c.email, lead.company, lead.outreach_en))}">이메일 작성</a><button class="copy-mail" data-rank="${lead.rank}">영문 메시지 복사</button>${safeUrl(c.linkedin_url) ? `<a href="${escapeHtml(safeUrl(c.linkedin_url))}" target="_blank" rel="noopener noreferrer">LinkedIn</a>` : ''}</div></div>`;
  }
  return `<div class="contact-card-main"><div class="contact-meta"><span class="contact-missing">담당자 추가 확인</span><strong>${escapeHtml(roleKo(lead.recommended_role))}</strong><p>자동 검색에서 이메일을 찾지 못했습니다. 회사명과 직책으로 바로 확인하세요.</p></div><div class="contact-actions"><a class="btn-primary" href="${escapeHtml(googleSearchUrl(q))}" target="_blank" rel="noopener noreferrer">담당자 검색</a><button class="copy-mail" data-rank="${lead.rank}">영문 메시지 복사</button></div></div>`;
}
function renderSales() {
  const d = state.salesData;
  if (!d) return;
  $('salesEmpty').classList.add('hidden');
  $('salesError').classList.add('hidden');
  $('salesLoading').classList.add('hidden');
  $('salesResults').classList.remove('hidden');
  $('salesCsv').disabled = false;

  const top = d.leads[0];
  const topContact = top.contact;
  const topAction = topContact?.email
    ? `<a class="btn-primary" href="${escapeHtml(mailtoUrl(topContact.email, top.company, top.outreach_en))}">1위 회사에 이메일 쓰기</a>`
    : `<a class="btn-primary" href="${escapeHtml(googleSearchUrl(top.contact_search_query || `${top.company} Head of Sales LinkedIn`))}" target="_blank" rel="noopener noreferrer">1위 회사 담당자 찾기</a>`;

  $('salesNext').innerHTML = `<div class="next-copy"><span class="eyebadge">오늘 할 일</span><div><strong>${escapeHtml(top.company)}부터 연락하세요.</strong><p>최근 성장 신호 확인 → 담당자 확인 → 한국 잠재고객 3곳 무료 샘플 제안</p></div></div><div class="next-actions">${topAction}<button class="copy-mail" data-rank="${top.rank}">메시지 복사</button></div>`;

  const contactCount = d.leads.filter(x => x.contact?.email).length;
  $('salesSummary').innerHTML = `<span><b>${d.leads.length}곳</b> 연락 후보</span><span><b>${contactCount}명</b> 이메일 확보</span><span>회사별 최신 근거 확인</span>`;

  $('salesContent').innerHTML = `<div class="candidate-list">${d.leads.map(lead => `<article class="candidate-card"><div class="candidate-head"><div><div class="rank-line"><span>${lead.rank}순위</span><span>${lead.contact?.email ? '담당자 확보' : '담당자 확인 필요'}</span></div><h3>${escapeHtml(lead.company)}</h3><a class="official-link" href="${escapeHtml(safeUrl(lead.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(host(lead.url))}</a></div><div class="priority-note">한국 진출 테스트 후보</div></div><div class="signal-box"><span>왜 지금?</span><strong>${escapeHtml(lead.signal_title || lead.why_now)}</strong></div><div class="reason-grid"><div><span>왜 이 회사인가</span><p>${escapeHtml(lead.why_buy_our_service)}</p></div><div><span>우리가 제안할 것</span><p>${escapeHtml(lead.korea_opportunity)}</p></div></div><div class="evidence-section"><span class="section-label">확인한 근거</span>${evidenceLinks(lead)}</div>${contactBlock(lead)}<details class="message-preview"><summary>보낼 영문 메시지 미리보기</summary><p>${escapeHtml(lead.outreach_en || '')}</p></details></article>`).join('')}</div>`;

  document.querySelectorAll('.copy-mail').forEach(btn => btn.addEventListener('click', () => {
    const lead = d.leads.find(x => x.rank === Number(btn.dataset.rank));
    copyText(lead?.outreach_en || '', btn);
  }));
}
function exportSalesCsv() {
  const d = state.salesData;
  if (!d) return;
  const cols = ['rank','company','url','signal_title','why_buy_our_service','source_urls','recommended_role','contact_name','contact_title','contact_email','contact_confidence','outreach_en'];
  const rows = [cols.join(','), ...d.leads.map(l => {
    const row = {
      ...l,
      contact_name:l.contact?.name || '',
      contact_title:l.contact?.title || '',
      contact_email:l.contact?.email || '',
      contact_confidence:l.contact?.confidence || ''
    };
    return cols.map(c => csvCell(row[c])).join(',');
  })];
  download(`korea-sales-leads-${Date.now()}.csv`, 'text/csv;charset=utf-8', '\ufeff' + rows.join('\n'));
}

const deliveryFields = ['clientUrl','productHint','targetNotes','seeds'];
function saveDeliveryForm() {
  const v = {};
  deliveryFields.forEach(id => v[id] = $(id).value);
  localStorage.setItem('kpa.delivery.form', JSON.stringify(v));
}
function setDeliveryBusy(on) {
  $('runBtn').disabled = on;
  $('runBtn').querySelector('span').textContent = on ? '한국 시장 조사 중…' : '한국 잠재고객 3곳 만들기';
  $('loadingState').classList.toggle('hidden', !on);
  if (on) {
    $('emptyState').classList.add('hidden');
    $('errorState').classList.add('hidden');
    $('results').classList.add('hidden');
  }
}
function showDeliveryError(msg) {
  $('loadingState').classList.add('hidden');
  $('emptyState').classList.add('hidden');
  $('results').classList.add('hidden');
  $('errorState').textContent = msg;
  $('errorState').classList.remove('hidden');
}
async function runDelivery() {
  const clientUrl = $('clientUrl').value.trim();
  if (!clientUrl) { showDeliveryError('고객 서비스 주소를 입력하세요.'); return; }
  saveDeliveryForm();
  setDeliveryBusy(true);
  try {
    if (!await checkHealth()) throw new Error('검색·분석 연결 상태를 먼저 확인해주세요.');
    const d = await requestJson('/api/analyze', {
      clientUrl,
      productHint:$('productHint').value,
      targetNotes:$('targetNotes').value,
      seeds:$('seeds').value,
      count:3
    });
    state.deliveryData = d;
    state.deliveryTab = 'prospects';
    localStorage.setItem('kpa.delivery.result', JSON.stringify(d));
    renderDelivery();
  } catch (e) {
    state.deliveryData = null;
    showDeliveryError(e.message || '분석에 실패했습니다.');
  } finally {
    setDeliveryBusy(false);
    if (state.deliveryData) $('results').classList.remove('hidden');
  }
}
function metric(label, value) { return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '-')}</strong></div>`; }
function renderDelivery() {
  const d = state.deliveryData;
  if (!d) return;
  $('emptyState').classList.add('hidden'); $('loadingState').classList.add('hidden'); $('errorState').classList.add('hidden'); $('results').classList.remove('hidden'); $('exportCsv').disabled = false;
  const top = d.prospects?.[0];
  $('summaryGrid').innerHTML = metric('고객', d.client?.name || host(d.client?.url)) + metric('한국 후보', `${d.prospects?.length || 0}곳`) + metric('1위 적합도', top ? `${top.fit_score}/100` : '-');
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === state.deliveryTab));
  renderDeliveryTab();
}
function renderDeliveryTab() {
  const d = state.deliveryData;
  if (!d) return;
  const root = $('tabContent');
  if (state.deliveryTab === 'prospects') {
    root.innerHTML = `<div class="table-wrap"><table class="prospect-table"><thead><tr><th>#</th><th>기업</th><th>적합도</th><th>적합 이유</th><th>구매 신호</th><th>출처</th></tr></thead><tbody>${(d.prospects || []).map(p => `<tr><td>${p.rank}</td><td class="company-cell"><strong>${escapeHtml(p.company)}</strong>${safeUrl(p.url) ? `<a target="_blank" rel="noopener noreferrer" href="${escapeHtml(safeUrl(p.url))}">${escapeHtml(host(p.url))}</a>` : ''}</td><td><span class="score">${p.fit_score}</span></td><td>${escapeHtml(p.why_fit)}</td><td>${escapeHtml(p.buying_signal)}</td><td>${evidenceLinks(p)}</td></tr>`).join('')}</tbody></table></div>`;
  } else if (state.deliveryTab === 'contacts') {
    root.innerHTML = `<div class="cards">${(d.prospects || []).map(p => { const q = p.contact_search_query || `${p.company} ${p.recommended_role || 'Head'} LinkedIn`; return `<article class="contact-card"><div class="top"><div><span class="rank">${p.rank}순위 · ${escapeHtml(p.company)}</span><h3>${escapeHtml(roleKo(p.recommended_role) || '담당 직책 확인 필요')}</h3></div><a class="ghost small" href="${escapeHtml(googleSearchUrl(q))}" target="_blank" rel="noopener noreferrer">담당자 확인</a></div><p>${escapeHtml(q)}</p></article>`; }).join('')}</div>`;
  } else if (state.deliveryTab === 'messages') {
    root.innerHTML = `<div class="cards">${(d.prospects || []).map(p => `<article class="message-card"><div class="top"><div><span class="rank">${p.rank}순위</span><h3>${escapeHtml(p.company)}</h3></div><button class="copy delivery-copy" data-rank="${p.rank}">복사</button></div><p class="message-text">${escapeHtml(p.message_ko || p.message_en)}</p></article>`).join('')}</div>`;
    root.querySelectorAll('.delivery-copy').forEach(btn => btn.addEventListener('click', () => { const p = d.prospects.find(x => x.rank === Number(btn.dataset.rank)); copyText(p?.message_ko || p?.message_en || '', btn); }));
  } else {
    const s = d.strategy || {};
    root.innerHTML = `<div class="action-steps"><div class="action-step"><b>1</b><div><strong>상위 후보 근거 확인</strong><span>${escapeHtml(s.first_segment || '점수가 높은 기업부터 확인합니다.')}</span></div></div><div class="action-step"><b>2</b><div><strong>고객에게 샘플 전달</strong><span>${escapeHtml(s.core_offer || '한국 후보와 메시지를 고객에게 전달합니다.')}</span></div></div><div class="action-step"><b>3</b><div><strong>운영 계약 제안</strong><span>${escapeHtml(s.next_action || '반응 데이터를 바탕으로 월 운영을 제안합니다.')}</span></div></div></div>`;
  }
}
function exportDeliveryCsv() {
  const d = state.deliveryData;
  if (!d) return;
  const cols = ['rank','company','url','industry','fit_score','why_fit','buying_signal','source_urls','recommended_role','contact_search_query','sales_angle','message_ko','message_en'];
  const rows = [cols.join(','), ...(d.prospects || []).map(p => cols.map(c => csvCell(p[c])).join(','))];
  download(`korea-prospect-pack-${Date.now()}.csv`, 'text/csv;charset=utf-8', '\ufeff' + rows.join('\n'));
}

$('diagBtn').addEventListener('click', runDiagnostics);
$('salesRunBtn').addEventListener('click', runSales);
$('salesCsv').addEventListener('click', exportSalesCsv);
$('salesDemo').addEventListener('click', () => {
  $('salesFocus').value = '최근 1년 안에 일본·싱가포르·APAC 확장, 투자 또는 해외 영업 채용 신호가 있는 중소형 B2B SaaS·AI 회사. 소비자 앱·하드웨어·대기업은 제외.';
});
$('runBtn').addEventListener('click', runDelivery);
$('exportCsv').addEventListener('click', exportDeliveryCsv);
$('fillDemo').addEventListener('click', () => {
  $('clientUrl').value = 'https://www.intercom.com';
  $('productHint').value = 'AI 고객지원 자동화 서비스';
  $('targetNotes').value = '한국 이커머스 중 고객 문의량이 많거나 고객지원 채용이 늘어난 회사';
  saveDeliveryForm();
});
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { state.deliveryTab = b.dataset.tab; renderDelivery(); }));
deliveryFields.forEach(id => $(id).addEventListener('change', saveDeliveryForm));
try { const f = JSON.parse(localStorage.getItem('kpa.sales.form') || '{}'); if (f.focus != null) $('salesFocus').value = f.focus; } catch {}
try { const f = JSON.parse(localStorage.getItem('kpa.delivery.form') || '{}'); deliveryFields.forEach(id => { if (f[id] != null) $(id).value = f[id]; }); } catch {}
try { const d = JSON.parse(localStorage.getItem('kpa.sales.result') || 'null'); if (d?.leads?.length) { state.salesData = d; renderSales(); } } catch {}
try { const d = JSON.parse(localStorage.getItem('kpa.delivery.result') || 'null'); if (d?.prospects?.length) { state.deliveryData = d; renderDelivery(); } } catch {}
setWorkflow(localStorage.getItem('kpa.workflow') === 'delivery' ? 'delivery' : 'sales');
checkHealth();
