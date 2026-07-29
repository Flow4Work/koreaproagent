const $ = (id) => document.getElementById(id);
const APP_VERSION = '20260729-sendready-v1';
const RECENT_KEY = 'kpa.v3.recent';
const RESULT_KEY = 'kpa.v3.result';
const RUN_KEY = 'kpa.v3.run';
const MAX_RECENT = 100;
const DISCOVER_LIMIT = 6;
const CONTACT_LIMIT = 5;
const READY_LIMIT = 3;
const state = { data: null, busy: false, runToken: 0 };

function escapeHtml(v = '') { return String(v).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
function safeUrl(v = '') { try { const u = new URL(v); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
function host(v = '') { try { return new URL(v).hostname.replace(/^www\./, ''); } catch { return v; } }
function clean(v = '', max = 220) { return String(v || '').replace(/\s+/g, ' ').trim().slice(0, max); }
function hasHangul(v = '') { return /[\u3131-\u318E\uAC00-\uD7A3]/.test(String(v || '')); }
function english(v = '', max = 260) { const x = clean(v, max); return x && !hasHangul(x) ? x : ''; }
function roleKo(role = '') { const k = String(role).toLowerCase(); if (k.includes('partnership')) return '파트너십 책임자'; if (k.includes('business development')) return '사업개발 책임자'; if (k.includes('sales')) return '영업 책임자'; if (k.includes('growth')) return '성장 책임자'; if (k.includes('apac') || k.includes('asia')) return 'APAC 책임자'; if (k.includes('founder')) return '창업자'; if (k.includes('ceo')) return '대표'; return role || 'GTM 책임자'; }
function readRecent() { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.slice(0, MAX_RECENT) : []; } catch { return []; } }
function saveRecent(names = []) { const seen = new Set(); const merged = [...names, ...readRecent()].map(String).map(x => x.trim()).filter(Boolean).filter(x => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); localStorage.setItem(RECENT_KEY, JSON.stringify(merged.slice(0, MAX_RECENT))); }
async function readJson(r) { const text = await r.text(); let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(`응답 형식 오류 (HTTP ${r.status})`); } if (!r.ok) throw new Error(`${data.error || `HTTP ${r.status}`}${data.hint ? ` · ${data.hint}` : ''}`); return data; }
async function post(url, payload, timeout = 110000) { const c = new AbortController(), t = setTimeout(() => c.abort(), timeout); try { return await readJson(await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload), cache:'no-store', signal:c.signal })); } catch (e) { if (e?.name === 'AbortError') throw new Error('처리가 지연되어 이 단계만 중단했습니다.'); throw e; } finally { clearTimeout(t); } }

async function health() { try { const d = await readJson(await fetch(`/api/health?t=${Date.now()}`, { cache:'no-store' })); const ok = Boolean(d.aiConnected && d.tavilyConfigured); $('apiStatus').className = `status ${ok ? 'ok' : 'bad'}`; $('apiStatus').innerHTML = `<span class="dot"></span><span>${ok ? '정상' : '확인 필요'}</span>`; return ok; } catch { $('apiStatus').className = 'status bad'; $('apiStatus').innerHTML = '<span class="dot"></span><span>오류</span>'; return false; } }
async function diagnostics() { const panel = $('diagPanel'); panel.classList.remove('hidden'); panel.innerHTML = '<div class="diag">확인 중…</div>'; try { const h = await readJson(await fetch(`/api/health?t=${Date.now()}`, { cache:'no-store' })); const line = (name, ok, detail) => `<div class="diag-row"><b class="${ok ? 'diag-ok' : 'diag-bad'}">${ok ? '✓' : '✕'}</b><span>${escapeHtml(name)} · ${escapeHtml(detail)}</span></div>`; panel.innerHTML = `<div class="diag">${line('웹 검색', h.tavilyConfigured, h.tavilyConfigured ? '정상' : '설정 필요')}${line('AI 분석', h.aiConnected, h.aiModel || '연결 필요')}${line('연락처 탐색', true, '공개 웹/연결된 공급자')}</div>`; } catch (e) { panel.innerHTML = `<div class="diag">${escapeHtml(e.message)}</div>`; } }
function setBusy(on, text = '') { state.busy = on; $('runBtn').disabled = on; $('runBtn').textContent = on ? (text || '준비 중…') : '오늘 영업 준비'; }
function showLoading(title, sub) { $('content').innerHTML = `<div class="loading"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(sub)}</span></div>`; $('summary').innerHTML = ''; }
function showError(msg) { $('content').innerHTML = `<div class="error">${escapeHtml(msg)}</div>`; $('summary').innerHTML = ''; }

function triggerEn(lead) {
  const direct = english(lead?.signal_title_en, 220);
  if (direct) return direct;
  const evidence = Array.isArray(lead?.evidence) ? lead.evidence : [];
  for (const row of evidence) { const title = english(row?.title, 220); if (title) return title; }
  return '';
}
function normalizedProspects(lead) {
  const rows = Array.isArray(lead?.sample?.prospects) ? lead.sample.prospects : [];
  return rows.map(p => {
    const company = english(p?.company_en, 120) || english(p?.company, 120);
    const role = english(p?.recommended_role_en, 120) || english(p?.recommended_role, 120);
    const signal = english(p?.buying_signal_en, 220);
    const fit = english(p?.why_fit_en, 220) || english(p?.sales_angle_en, 220);
    const reason = signal || fit;
    const sourceUrls = Array.isArray(p?.source_urls) ? p.source_urls.filter(safeUrl).slice(0, 2) : [];
    return { ...p, company_en: company, recommended_role_en: role, reason_en: reason, evidence_urls: sourceUrls, signal_kind: signal ? 'signal' : 'fit' };
  }).filter(p => p.company_en && p.recommended_role_en && p.reason_en && p.evidence_urls.length).slice(0, 3);
}
function subjectFor(lead) { const n = normalizedProspects(lead).length; return n ? `${n} Korea accounts worth testing for ${english(lead.company, 100) || 'your team'}` : ''; }
function buildOutreach(lead) {
  const email = lead?.contact?.email;
  const company = english(lead?.company, 120);
  const trigger = triggerEn(lead);
  const accounts = normalizedProspects(lead);
  if (!email || !company || !trigger || !accounts.length) return '';
  const first = english(String(lead?.contact?.name || '').trim().split(/\s+/)[0], 50);
  const hello = first ? `Hi ${first},` : 'Hi,';
  const lines = accounts.map((p, i) => `${i + 1}. ${p.company_en} — ${p.recommended_role_en}: ${p.reason_en}`).join('\n');
  const body = `${hello}\n\nI noticed this recent move at ${company}: ${trigger}.\n\nI mapped ${accounts.length} Korean account${accounts.length > 1 ? 's' : ''} I would test first:\n\n${lines}\n\nThese are evidence-backed fit or buying-signal candidates, not a generic company list. I can verify the buyers, localize the outreach, and run a small Korea market test before you add local headcount.\n\nOpen to a quick Korea pilot?`;
  return hasHangul(body) ? '' : body;
}
function mailReady(lead) { return Boolean(lead?.contact?.email && triggerEn(lead) && normalizedProspects(lead).length && buildOutreach(lead)); }
function gmailUrl(lead) { const to = lead?.contact?.email, subject = subjectFor(lead), body = buildOutreach(lead); if (!to || !subject || !body || hasHangul(`${subject}${body}`)) return ''; return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; }
function evidenceLinks(lead) { return (Array.isArray(lead?.evidence) ? lead.evidence : []).slice(0, 3).map((e, i) => { const u = safeUrl(e?.url); return u ? `<a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">근거 ${i + 1}</a>` : ''; }).join(''); }
function stageText(lead) { if (mailReady(lead)) return '발송 준비 완료'; if (lead.sample_status === 'failed') return '한국 후보 검증 실패'; if (lead.sample_status === 'pending') return '한국 후보 검증 중'; if (lead.contact_status === 'failed') return '담당자 미확보'; if (lead.contact_status === 'pending') return '담당자 탐색 중'; if (!triggerEn(lead)) return '영문 근거 부족'; return '보류'; }

function render() {
  const leads = state.data?.leads || [];
  if (!leads.length) { $('content').innerHTML = '<div class="empty"><strong>아직 결과가 없습니다.</strong><span>오늘 영업 준비를 눌러 실제로 보낼 수 있는 메일을 만듭니다.</span></div>'; $('summary').innerHTML = ''; return; }
  const ready = leads.filter(mailReady).slice(0, READY_LIMIT);
  const contacts = leads.filter(x => x.contact?.email).length;
  $('summary').innerHTML = `<strong>지금 보낼 수 있는 메일 ${ready.length}개</strong><span>담당자 ${contacts}개 확보</span><span>최대 ${READY_LIMIT}개만 발송 준비</span>`;
  const ordered = [...ready, ...leads.filter(x => !mailReady(x))];
  $('content').innerHTML = `<table class="lead-table"><thead><tr><th>#</th><th>회사</th><th>왜 지금</th><th>담당자</th><th>한국 타깃</th><th>다음 행동</th></tr></thead><tbody>${ordered.map((lead, i) => {
    const c = lead.contact || {}, accounts = normalizedProspects(lead), mail = gmailUrl(lead), detailId = `detail-${i}`;
    return `<tr class="data-row"><td class="rank">${i + 1}</td><td class="company"><strong>${escapeHtml(lead.company)}</strong>${lead.url ? `<a href="${escapeHtml(safeUrl(lead.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(host(lead.url))}</a>` : ''}<p>${escapeHtml(lead.product_summary || '')}</p></td><td class="signal"><strong>${escapeHtml(triggerEn(lead) || lead.why_now || '검증 중')}</strong><small>${escapeHtml(stageText(lead))}</small></td><td class="contact">${c.email ? `<strong>${escapeHtml(c.name || roleKo(lead.recommended_role))}</strong><span>${escapeHtml(c.title || roleKo(lead.recommended_role))}</span><a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : `<strong>${escapeHtml(roleKo(lead.recommended_role))}</strong><small class="pending">${escapeHtml(stageText(lead))}</small>`}</td><td>${accounts.length ? `<div class="sample-badges">${accounts.map(p => `<span class="sample-badge">${escapeHtml(p.company_en)}</span>`).join('')}</div>` : `<span class="sample-state">${escapeHtml(lead.sample_status === 'failed' ? '근거 있는 한국 후보 없음' : '대기')}</span>`}</td><td><div class="actions">${mail ? `<a class="mail-btn" href="${escapeHtml(mail)}" target="_blank" rel="noopener noreferrer">Gmail에서 열기</a>` : ''}<button class="detail-btn" data-detail="${detailId}">상세</button></div></td></tr><tr class="detail-row"><td colspan="6"><div class="detail" id="${detailId}"><section><h4>판단 근거</h4><p>${escapeHtml(lead.korea_opportunity || lead.korea_gap || lead.why_now || '')}</p></section><section><h4>출처</h4><div class="evidence">${evidenceLinks(lead)}</div></section>${accounts.length ? `<section><h4>한국 테스트 계정</h4><p>${accounts.map((p, idx) => `${idx + 1}. ${p.company_en} · ${p.recommended_role_en} · ${p.reason_en}`).map(escapeHtml).join('<br>')}</p></section>` : ''}${mail ? `<section class="mail-preview"><h4>실제로 보낼 영문 메일</h4><pre>${escapeHtml(buildOutreach(lead))}</pre></section>` : ''}</div></td></tr>`;
  }).join('')}</tbody></table>`;
  document.querySelectorAll('[data-detail]').forEach(btn => btn.addEventListener('click', () => $(btn.dataset.detail)?.classList.toggle('open')));
}

function updateLead(index, patch, token) { if (token !== state.runToken || !state.data?.leads?.[index]) return; state.data.leads[index] = { ...state.data.leads[index], ...patch }; localStorage.setItem(RESULT_KEY, JSON.stringify(state.data)); render(); }
async function enrichContact(lead, index, token) { try { const d = await post('/api/contact', { url:lead.url, recommendedRole:lead.recommended_role }, 40000); updateLead(index, { contact:d.contact || null, contacts:d.contacts || [], contact_provider:d.provider || null, contact_status:d.contact?.email ? 'found' : 'failed' }, token); } catch { updateLead(index, { contact_status:'failed' }, token); } }
async function enrichSample(lead, index, token) { updateLead(index, { sample_status:'pending' }, token); try { const sample = await post('/api/analyze-v2', { clientUrl:lead.url, productHint:lead.product_summary || '', targetNotes:'Only Korean B2B companies that plausibly fit this product. Prefer explicit recent public buying/fit evidence. Do not pad the list.' }, 75000); updateLead(index, { sample, sample_status:'ready' }, token); } catch { updateLead(index, { sample_status:'failed' }, token); } }

async function run() {
  const token = ++state.runToken;
  setBusy(true, '후보 찾는 중…');
  showLoading('오늘 실제로 보낼 회사를 찾는 중입니다.', '후보 → 담당자 → 근거 있는 한국 타깃 순으로 필요한 호출만 실행합니다.');
  try {
    if (!await health()) throw new Error('검색 또는 AI 연결 상태를 확인해주세요.');
    const runNo = Number(localStorage.getItem(RUN_KEY) || '0') + 1;
    localStorage.setItem(RUN_KEY, String(runNo));
    const d = await post('/api/discover-v2', { focus:'', excludeCompanies:readRecent(), searchVariant:`${new Date().toISOString().slice(0,10)}-${runNo}` }, 80000);
    if (token !== state.runToken) return;
    const leads = (Array.isArray(d?.leads) ? d.leads : []).slice(0, DISCOVER_LIMIT).map(x => ({ ...x, contact:null, contacts:[], contact_status:'pending', sample:null, sample_status:'idle' }));
    if (!leads.length) throw new Error('이번 탐색에서는 기준을 통과한 회사가 없습니다.');
    state.data = { generated_at:new Date().toISOString(), leads, meta:d.meta || {} };
    saveRecent(leads.map(x => x.company));
    localStorage.setItem(RESULT_KEY, JSON.stringify(state.data));
    render();

    setBusy(true, '담당자 찾는 중…');
    await Promise.allSettled(leads.slice(0, CONTACT_LIMIT).map((lead, i) => enrichContact(lead, i, token)));
    if (token !== state.runToken) return;

    const candidates = state.data.leads.map((lead, index) => ({ lead, index })).filter(x => x.lead.contact?.email && triggerEn(x.lead)).slice(0, READY_LIMIT);
    if (candidates.length) {
      setBusy(true, '한국 타깃 검증 중…');
      await Promise.allSettled(candidates.map(({ lead, index }) => enrichSample(lead, index, token)));
    }
    if (token === state.runToken) { setBusy(false); render(); }
  } catch (e) {
    if (token === state.runToken) { if (state.data?.leads?.length) { setBusy(false); render(); } else { showError(e.message || '영업 준비에 실패했습니다.'); setBusy(false); } }
  }
}

$('runBtn').addEventListener('click', run);
$('diagBtn').addEventListener('click', () => { $('diagPanel').classList.toggle('hidden'); if (!$('diagPanel').classList.contains('hidden')) diagnostics(); });
if (localStorage.getItem('kpa.v3.version') !== APP_VERSION) { localStorage.removeItem(RESULT_KEY); localStorage.setItem('kpa.v3.version', APP_VERSION); }
try { const saved = JSON.parse(localStorage.getItem(RESULT_KEY) || 'null'); if (saved?.leads?.length) { state.data = saved; render(); } else render(); } catch { render(); }
health();
