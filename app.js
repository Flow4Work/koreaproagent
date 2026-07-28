const $ = (id) => document.getElementById(id);
const APP_VERSION = '20260728-4';
const RECENT_KEY = 'kpa.sales.recentCompanies';
const RUN_KEY = 'kpa.sales.runCount';
const PIPELINE_KEY = 'kpa.sales.pipeline';
const MAX_RECENT = 36;
const state = { salesData: null };

if (localStorage.getItem('kpa.app.version') !== APP_VERSION) {
  ['kpa.sales.result','kpa.sales.form'].forEach(k => localStorage.removeItem(k));
  localStorage.setItem('kpa.app.version', APP_VERSION);
}

const MORNING_TOPICS = [
  '개발자 도구·API·데이터 인프라 B2B SaaS','사이버보안·ID·컴플라이언스 B2B SaaS',
  'AI 고객지원·업무 자동화 B2B SaaS','B2B 핀테크·결제·재무 운영 소프트웨어',
  'CRM·세일즈·Revenue Intelligence SaaS','HR·채용·워크포스 B2B SaaS',
  '물류·공급망·구매관리 B2B 소프트웨어','클라우드·FinOps·DevOps 자동화 SaaS',
  '리테일·커머스 운영 B2B SaaS','마케팅 자동화·고객데이터 B2B SaaS'
];
const AFTERNOON_TOPICS = [
  '호텔·여행·프로퍼티 운영 B2B SaaS','기업용 생성형 AI·지식관리 소프트웨어',
  '협업·문서·워크플로 자동화 SaaS','기업용 영상·음성·커뮤니케이션 API',
  '데이터 분석·BI·관측성 B2B SaaS','법무·계약·RegTech B2B SaaS',
  '제조·현장 운영 소프트웨어 SaaS','이커머스 운영·물류 자동화 SaaS',
  '파트너·채널·세일즈 운영 B2B SaaS','AI 에이전트·백오피스 자동화 B2B SaaS'
];

function escapeHtml(v = '') { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function safeUrl(v = '') { try { const u = new URL(v); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
function host(v = '') { try { return new URL(v).hostname.replace(/^www\./, ''); } catch { return v; } }
function csvCell(v) { const s = Array.isArray(v) ? v.join(' | ') : String(v ?? ''); return `"${s.replace(/"/g, '""')}"`; }
function download(name, type, content) { const blob = new Blob([content], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function googleSearchUrl(q = '') { return `https://www.google.com/search?q=${encodeURIComponent(q)}`; }
function mailtoUrl(email, company, body) { if (!email) return ''; return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Korea market sample for ${company}`)}&body=${encodeURIComponent(body || '')}`; }
function roleKo(role = '') {
  const key = String(role).trim().toLowerCase();
  const map = { founder:'창업자','co-founder':'공동창업자',ceo:'대표','head of sales':'영업 책임자',sales:'영업 담당자',bd:'사업개발 담당자','business development':'사업개발 담당자',partnerships:'파트너십 담당자',growth:'성장 담당자',revenue:'매출 책임자',commercial:'사업 책임자','head of apac':'APAC 책임자','vp sales':'영업 부사장' };
  return map[key] || role || '영업 책임자';
}
async function copyText(text, btn) { await navigator.clipboard.writeText(text || ''); const old = btn.textContent; btn.textContent = '복사됨'; setTimeout(() => btn.textContent = old, 900); }

async function readJsonResponse(response) {
  const text = await response.text(); let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(`응답 형식 오류 (HTTP ${response.status})`); }
  if (!response.ok) throw new Error(`${data?.error || `HTTP ${response.status}`}${data?.hint ? ` · ${data.hint}` : ''}`);
  return data;
}
async function requestJson(url, payload, timeoutMs = 110000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), timeoutMs);
  try { return await readJsonResponse(await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), cache:'no-store', signal:c.signal })); }
  catch (e) { if (e?.name === 'AbortError') throw new Error('조사가 너무 오래 걸려 중단됐습니다.'); throw e; }
  finally { clearTimeout(t); }
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
function diagLine(name, ok, detail = '') { return `<div class="diag-row"><b class="${ok ? 'diag-ok' : 'diag-bad'}">${ok ? '✓' : '✕'}</b><span>${escapeHtml(name)}</span><small>${escapeHtml(detail)}</small></div>`; }
async function runDiagnostics() {
  const btn = $('diagBtn'), panel = $('diagPanel'); btn.disabled = true; btn.textContent = '확인 중'; panel.classList.remove('hidden');
  try {
    const h = await readJsonResponse(await fetch(`/api/health?t=${Date.now()}`, { cache:'no-store' }));
    panel.innerHTML = `<div class="diag-head"><strong>${h.groqConnected && h.tavilyConfigured ? '핵심 기능 정상' : '확인이 필요한 항목이 있습니다'}</strong><button id="diagClose" class="ghost small">닫기</button></div>${diagLine('회사 검색', h.tavilyConfigured, h.tavilyConfigured ? '사용 가능' : '설정 확인 필요')}${diagLine('후보 분석', h.groqConnected, h.groqConnected ? '사용 가능' : '인증 확인 필요')}${diagLine('담당자 찾기', h.hunterConfigured, h.hunterConfigured ? '사용 가능' : 'Hunter 설정 필요')}`;
    $('diagClose')?.addEventListener('click', () => panel.classList.add('hidden'));
  } catch (e) { panel.innerHTML = `<strong>상태 확인 실패</strong><p>${escapeHtml(e.message)}</p>`; }
  finally { btn.disabled = false; btn.textContent = '상태 확인'; }
}

function readRecent() { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter(Boolean).slice(0, MAX_RECENT) : []; } catch { return []; } }
function saveRecent(companies = []) {
  const merged = [...companies, ...readRecent()].map(v => String(v || '').trim()).filter(Boolean); const seen = new Set();
  localStorage.setItem(RECENT_KEY, JSON.stringify(merged.filter(name => { const key = name.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, MAX_RECENT)));
}
function readPipeline() { try { const v = JSON.parse(localStorage.getItem(PIPELINE_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function upsertPipeline(lead) {
  const rows = readPipeline(); const key = String(lead.company || '').toLowerCase(); const existing = rows.find(x => String(x.company || '').toLowerCase() === key);
  const record = { company:lead.company, url:lead.url, contact:lead.contact || null, outreach_en:lead.outreach_en || '', sample:lead.sample || null, status:existing?.status || 'ready', created_at:existing?.created_at || new Date().toISOString(), updated_at:new Date().toISOString() };
  const next = [record, ...rows.filter(x => String(x.company || '').toLowerCase() !== key)].slice(0, 60); localStorage.setItem(PIPELINE_KEY, JSON.stringify(next));
}
function setPipelineStatus(company, status) {
  const rows = readPipeline(); const key = String(company || '').toLowerCase();
  rows.forEach(x => { if (String(x.company || '').toLowerCase() === key) { x.status = status; x.updated_at = new Date().toISOString(); } });
  localStorage.setItem(PIPELINE_KEY, JSON.stringify(rows)); renderSales();
}
function pipelineStatus(company) { const key = String(company || '').toLowerCase(); return readPipeline().find(x => String(x.company || '').toLowerCase() === key)?.status || 'ready'; }

function daySeed(now) { const start = new Date(now.getFullYear(), 0, 0); return Math.floor((now - start) / 86400000); }
function pickFive(pool, seed) { const out = []; for (let i = 0; i < 5; i++) out.push(pool[(seed * 3 + i * 2) % pool.length]); return [...new Set(out)].slice(0, 5); }
function renderTopics() {
  const root = $('dailyTopics'), label = $('topicTimeLabel'), focus = $('salesFocus'); if (!root || !focus) return;
  const now = new Date(), afternoon = now.getHours() >= 14, pool = afternoon ? AFTERNOON_TOPICS : MORNING_TOPICS, topics = pickFive(pool, daySeed(now) + (afternoon ? 17 : 0));
  label.textContent = afternoon ? '오후 추천 · 14:00' : '오전 추천 · 09:00';
  root.innerHTML = topics.map((topic, i) => `<button type="button" class="topic-chip" data-topic-index="${i}">${topic}</button>`).join('');
  root.querySelectorAll('.topic-chip').forEach((btn, i) => btn.addEventListener('click', () => {
    const same = btn.classList.contains('active'); root.querySelectorAll('.topic-chip').forEach(x => x.classList.remove('active'));
    if (same) { focus.value = ''; return; }
    btn.classList.add('active'); focus.value = `${topics[i]}. 최근 1년 내 해외 확장·투자·영업 채용·파트너십 신호가 있고 한국 현지 영업조직이 아직 강하지 않은 회사.`;
  }));
}

function setSalesBusy(on, phase = 'discover') {
  $('salesRunBtn').disabled = on;
  $('salesRunBtn').querySelector('span').textContent = on ? (phase === 'pack' ? '메시지·한국 샘플 만드는 중…' : '살 가능성 있는 회사를 찾는 중…') : '보낼 후보 3곳 만들기';
  $('salesLoadingTitle').textContent = phase === 'pack' ? '회사별 메시지와 한국 샘플을 만들고 있습니다.' : '살 가능성이 높은 해외 회사를 찾고 있습니다.';
  $('salesLoadingText').textContent = phase === 'pack' ? '한국 잠재고객 3곳 검증 → 첫 메시지 맞춤화 → 잠재고객 저장' : '회사 검증 → 성장 신호 → 담당자·이메일 확인';
  $('salesLoading').classList.toggle('hidden', !on || Boolean(state.salesData?.leads?.length));
  if (on && !state.salesData?.leads?.length) { $('salesEmpty').classList.add('hidden'); $('salesError').classList.add('hidden'); $('salesResults').classList.add('hidden'); }
}
function salesError(msg) { $('salesLoading').classList.add('hidden'); $('salesResults').classList.add('hidden'); $('salesEmpty').classList.add('hidden'); $('salesError').textContent = msg; $('salesError').classList.remove('hidden'); }

function sampleProspects(sample) { return Array.isArray(sample?.prospects) ? sample.prospects.slice(0, 3) : []; }
function buildPackOutreach(lead, sample) {
  const first = String(lead?.contact?.name || '').trim().split(/\s+/)[0];
  const hello = first ? `Hi ${first},` : 'Hi,';
  const names = sampleProspects(sample).map(p => p.company).filter(Boolean);
  const product = String(sample?.client?.product || '').trim();
  const signal = String(lead?.signal_title || lead?.why_now || '').replace(/\s+/g, ' ').trim();
  const accountLine = names.length ? `I mapped 3 Korean accounts that look relevant for ${lead.company}: ${names.join(', ')}.` : `I mapped 3 Korean accounts that look relevant for ${lead.company}.`;
  const productLine = product ? `I took a quick look at ${product} and the Korea use case.` : `I took a quick look at ${lead.company}'s Korea use case.`;
  return `${hello}\n\nI noticed ${lead.company}'s recent move: ${signal}.\n\n${productLine} ${accountLine} For each, I have the likely buyer role and a current reason to approach them.\n\nHappy to send the sample over — no call needed. Would that be useful?`;
}
function sampleCopyText(lead) {
  const rows = sampleProspects(lead.sample);
  if (!rows.length) return '';
  return [`Korea account sample for ${lead.company}`, '', ...rows.flatMap((p, i) => [
    `${i + 1}. ${p.company}`,
    `Likely buyer: ${p.recommended_role || 'Business owner'}`,
    `Why it fits: ${p.why_fit || ''}`,
    `Current signal: ${p.buying_signal || ''}`,
    ''
  ])].join('\n').trim();
}
async function buildLeadPack(lead) {
  lead.sample_status = 'loading'; renderSales();
  try {
    const sample = await requestJson('/api/analyze', {
      clientUrl: lead.url,
      productHint: '',
      targetNotes: '이 제품을 실제로 구매할 가능성이 있는 한국 B2B 기업. 최근 채용·확장·도입·규제·운영 변화 등 공개 구매 신호가 있는 곳 우선.',
      seeds: '', count: 3
    }, 120000);
    lead.sample = sample; lead.sample_status = 'ready'; lead.outreach_en = buildPackOutreach(lead, sample); upsertPipeline(lead);
  } catch (e) {
    lead.sample_status = 'failed'; lead.sample_error = e.message || '한국 샘플 생성 실패'; upsertPipeline(lead);
  }
  localStorage.setItem('kpa.sales.result', JSON.stringify(state.salesData)); renderSales();
}

async function runSales() {
  const focus = $('salesFocus').value.trim(); localStorage.setItem('kpa.sales.form', JSON.stringify({ focus })); state.salesData = null; setSalesBusy(true, 'discover');
  try {
    if (!await checkHealth()) throw new Error('검색·분석 연결 상태를 먼저 확인해주세요.');
    const runCount = Number(localStorage.getItem(RUN_KEY) || '0') + 1; localStorage.setItem(RUN_KEY, String(runCount));
    const d = await requestJson('/api/discover-clients', { focus, excludeCompanies:readRecent(), searchVariant:`${new Date().toISOString().slice(0,10)}-${new Date().getHours() >= 14 ? 'pm' : 'am'}-${runCount}` });
    if (!d?.leads?.length) throw new Error('실제로 연락할 만한 후보를 찾지 못했습니다.');
    saveRecent(d.leads.map(x => x.company));
    state.salesData = { ...d, leads:d.leads.slice(0,3).map(x => ({ ...x, sample_status:'queued' })) };
    localStorage.setItem('kpa.sales.result', JSON.stringify(state.salesData)); renderSales(); setSalesBusy(true, 'pack');
    await Promise.allSettled(state.salesData.leads.map(lead => buildLeadPack(lead)));
  } catch (e) { state.salesData = null; salesError(e.message || '고객 발굴에 실패했습니다.'); }
  finally { setSalesBusy(false); if (state.salesData?.leads?.length) { $('salesLoading').classList.add('hidden'); $('salesResults').classList.remove('hidden'); } }
}

function evidenceLinks(lead) {
  const evidence = Array.isArray(lead?.evidence) && lead.evidence.length ? lead.evidence : (lead?.source_urls || []).map((url, i) => ({ title:`출처 ${i + 1}`, url }));
  return `<div class="source-links">${evidence.map((item, i) => { const url = safeUrl(item?.url); if (!url) return ''; const label = item?.title || host(url) || `출처 ${i + 1}`; return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(host(url))}</span></a>`; }).join('')}</div>`;
}
function contactHtml(lead) {
  const c = lead.contact; const q = lead.contact_search_query || `"${lead.company}" Head of Sales LinkedIn`;
  if (c?.email) return `<div class="ready-contact"><span>담당자</span><strong>${escapeHtml(c.name || '이름 확인 필요')}</strong><p>${escapeHtml(c.title || roleKo(lead.recommended_role))}</p><a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></div>`;
  return `<div class="ready-contact"><span>담당자</span><strong>${escapeHtml(roleKo(lead.recommended_role))}</strong><p>업무 이메일 추가 확인 필요</p><a href="${escapeHtml(googleSearchUrl(q))}" target="_blank" rel="noopener noreferrer">담당자 검색</a></div>`;
}
function sampleHtml(lead) {
  if (lead.sample_status === 'loading' || lead.sample_status === 'queued') return `<div class="sample-loading"><span class="mini-spinner"></span><strong>한국 샘플 만드는 중</strong><p>이 회사 제품을 살 가능성이 있는 한국 기업 3곳을 검증하고 있습니다.</p></div>`;
  const rows = sampleProspects(lead.sample);
  if (!rows.length) return `<div class="sample-failed"><strong>한국 샘플 확인 필요</strong><p>${escapeHtml(lead.sample_error || '근거가 충분한 한국 기업 3곳을 만들지 못했습니다.')}</p></div>`;
  return `<div class="sample-list">${rows.map((p, i) => `<div class="sample-row"><b>${i + 1}</b><div><strong>${escapeHtml(p.company)}</strong><span>${escapeHtml(roleKo(p.recommended_role))}</span><p>${escapeHtml(p.buying_signal || p.why_fit)}</p></div></div>`).join('')}</div>`;
}
function renderSales() {
  const d = state.salesData; if (!d) return;
  $('salesEmpty').classList.add('hidden'); $('salesError').classList.add('hidden'); $('salesResults').classList.remove('hidden'); $('salesCsv').disabled = false;
  const leads = d.leads || [], emailCount = leads.filter(x => x.contact?.email).length, sampleCount = leads.filter(x => sampleProspects(x.sample).length === 3).length, contacted = leads.filter(x => pipelineStatus(x.company) === 'contacted').length;
  $('salesSummary').innerHTML = `<span><b>${leads.length}곳</b> 잠재고객 등록</span><span><b>${emailCount}곳</b> 이메일 확보</span><span><b>${sampleCount}곳</b> 한국 샘플 준비</span>${contacted ? `<span><b>${contacted}곳</b> 연락 완료</span>` : ''}`;
  $('salesContent').innerHTML = `<div class="ready-list">${leads.map(lead => {
    const status = pipelineStatus(lead.company), canEmail = Boolean(lead.contact?.email), sampleReady = sampleProspects(lead.sample).length === 3;
    const primaryAction = canEmail ? `<a class="btn-primary" href="${escapeHtml(mailtoUrl(lead.contact.email, lead.company, lead.outreach_en))}">이메일 열기</a>` : `<a class="btn-primary" href="${escapeHtml(googleSearchUrl(lead.contact_search_query || `${lead.company} Head of Sales LinkedIn`))}" target="_blank" rel="noopener noreferrer">담당자 찾기</a>`;
    return `<article class="ready-card ${status === 'contacted' ? 'is-contacted' : ''}">
      <div class="ready-head"><div><div class="ready-badges"><span>${canEmail ? '이메일 확보' : '담당자 확인 필요'}</span><span>${sampleReady ? '한국 샘플 준비' : '샘플 생성 중'}</span></div><h3>${escapeHtml(lead.company)}</h3><a class="official-link" href="${escapeHtml(safeUrl(lead.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(host(lead.url))}</a></div><span class="pipeline-badge">${status === 'contacted' ? '연락 완료' : '보낼 준비'}</span></div>
      <div class="signal-line"><span>왜 지금</span><strong>${escapeHtml(lead.signal_title || lead.why_now)}</strong></div>
      <div class="pack-grid">
        ${contactHtml(lead)}
        <div class="message-box"><span>맞춤 첫 메시지</span><p>${escapeHtml(lead.outreach_en || '')}</p><button class="copy-message" data-company="${escapeHtml(lead.company)}">메시지 복사</button></div>
        <div class="sample-box"><div class="sample-title"><span>무료 한국 샘플</span>${sampleReady ? `<button class="copy-sample" data-company="${escapeHtml(lead.company)}">샘플 복사</button>` : ''}</div>${sampleHtml(lead)}</div>
      </div>
      <div class="ready-actions">${primaryAction}<button class="ghost mark-contacted" data-company="${escapeHtml(lead.company)}">${status === 'contacted' ? '연락 전으로 되돌리기' : '연락 완료 표시'}</button><details><summary>선정 근거</summary>${evidenceLinks(lead)}</details></div>
    </article>`;
  }).join('')}</div>`;
  document.querySelectorAll('.copy-message').forEach(btn => btn.addEventListener('click', () => { const lead = leads.find(x => x.company === btn.dataset.company); copyText(lead?.outreach_en || '', btn); }));
  document.querySelectorAll('.copy-sample').forEach(btn => btn.addEventListener('click', () => { const lead = leads.find(x => x.company === btn.dataset.company); copyText(sampleCopyText(lead), btn); }));
  document.querySelectorAll('.mark-contacted').forEach(btn => btn.addEventListener('click', () => { const lead = leads.find(x => x.company === btn.dataset.company); if (!lead) return; setPipelineStatus(lead.company, pipelineStatus(lead.company) === 'contacted' ? 'ready' : 'contacted'); }));
}
function exportSalesCsv() {
  const d = state.salesData; if (!d) return;
  const cols = ['company','url','signal_title','contact_name','contact_title','contact_email','outreach_en','korea_sample_1','korea_sample_2','korea_sample_3','status'];
  const rows = [cols.join(','), ...(d.leads || []).map(l => {
    const sample = sampleProspects(l.sample); const row = { company:l.company,url:l.url,signal_title:l.signal_title,contact_name:l.contact?.name || '',contact_title:l.contact?.title || '',contact_email:l.contact?.email || '',outreach_en:l.outreach_en || '',korea_sample_1:sample[0]?.company || '',korea_sample_2:sample[1]?.company || '',korea_sample_3:sample[2]?.company || '',status:pipelineStatus(l.company) };
    return cols.map(c => csvCell(row[c])).join(',');
  })];
  download(`korea-ready-prospects-${Date.now()}.csv`, 'text/csv;charset=utf-8', '\ufeff' + rows.join('\n'));
}

$('diagBtn').addEventListener('click', runDiagnostics);
$('salesRunBtn').addEventListener('click', runSales);
$('salesCsv').addEventListener('click', exportSalesCsv);
$('salesFocus').addEventListener('change', () => localStorage.setItem('kpa.sales.form', JSON.stringify({ focus:$('salesFocus').value })));
try { const f = JSON.parse(localStorage.getItem('kpa.sales.form') || '{}'); if (f.focus != null) $('salesFocus').value = f.focus; } catch {}
try { const d = JSON.parse(localStorage.getItem('kpa.sales.result') || 'null'); if (d?.leads?.length) { state.salesData = d; renderSales(); } } catch {}
renderTopics();
checkHealth();
