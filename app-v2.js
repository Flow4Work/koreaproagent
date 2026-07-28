const $ = (id) => document.getElementById(id);

const APP_VERSION = '20260728-signal-v2';
const RECENT_KEY = 'kpa.v2.recentCompanies';
const RESULT_KEY = 'kpa.v2.result';
const RUN_KEY = 'kpa.v2.runCount';
const TARGET_READY = 3;
const MAX_ROUNDS = 5;
const MAX_RECENT = 100;
const state = { data: null, reviewed: 0, verified: 0, rounds: 0 };

if (localStorage.getItem('kpa.v2.version') !== APP_VERSION) {
  localStorage.removeItem(RESULT_KEY);
  localStorage.setItem('kpa.v2.version', APP_VERSION);
}

function escapeHtml(v = '') {
  return String(v).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}
function safeUrl(v = '') {
  try { const u = new URL(v); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
function host(v = '') { try { return new URL(v).hostname.replace(/^www\./, ''); } catch { return v; } }
function cleanLine(v = '', max = 180) { return String(v || '').replace(/\s+/g, ' ').trim().slice(0, max); }
function roleKo(role = '') {
  const key = String(role).trim().toLowerCase();
  const map = {
    founder:'창업자', 'co-founder':'공동창업자', ceo:'대표', 'head of sales':'영업 책임자',
    'vp sales':'영업 부사장', sales:'영업 담당자', 'business development':'사업개발',
    partnerships:'파트너십', growth:'성장 담당', revenue:'매출 책임자', commercial:'사업 책임자',
    'head of apac':'APAC 책임자'
  };
  return map[key] || role || '영업 책임자';
}
function readRecent() {
  try {
    const rows = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(rows) ? rows.filter(Boolean).slice(0, MAX_RECENT) : [];
  } catch { return []; }
}
function saveRecent(companies = []) {
  const merged = [...companies, ...readRecent()].map(x => String(x || '').trim()).filter(Boolean);
  const seen = new Set();
  localStorage.setItem(RECENT_KEY, JSON.stringify(merged.filter(x => {
    const k = x.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, MAX_RECENT)));
}

async function readJsonResponse(response) {
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`응답 형식 오류 (HTTP ${response.status})`); }
  if (!response.ok) throw new Error(`${data?.error || `HTTP ${response.status}`}${data?.hint ? ` · ${data.hint}` : ''}`);
  return data;
}
async function requestJson(url, payload, timeoutMs = 150000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload), cache:'no-store', signal:controller.signal
    });
    return await readJsonResponse(response);
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('검증 시간이 너무 길어 중단됐습니다.');
    throw e;
  } finally { clearTimeout(timer); }
}

async function checkHealth() {
  try {
    const d = await readJsonResponse(await fetch(`/api/health?t=${Date.now()}`, { cache:'no-store' }));
    const ok = Boolean(d.aiConnected && d.tavilyConfigured && d.hunterConfigured);
    $('apiStatus').className = `status ${ok ? 'ok' : 'bad'}`;
    $('apiStatus').innerHTML = `<span class="dot"></span><span>${ok ? '엔진 정상' : '연결 확인 필요'}</span>`;
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
    const ok = Boolean(h.aiConnected && h.tavilyConfigured && h.hunterConfigured);
    panel.innerHTML = `<div class="diag-head"><strong>${ok ? '영업 엔진 준비 완료' : '확인이 필요합니다'}</strong><button id="diagClose" class="ghost small">닫기</button></div>${diagLine('웹 검색', h.tavilyConfigured, h.tavilyConfigured ? 'Tavily 정상' : 'Tavily 확인')}${diagLine('AI 검증', h.aiConnected, h.aiConnected ? `${h.aiModel || 'DeepSeek'} 정상` : 'OpenCode Zen 확인')}${diagLine('업무 이메일', h.hunterConfigured, h.hunterConfigured ? 'Hunter 정상' : 'Hunter 확인')}`;
    $('diagClose')?.addEventListener('click', () => panel.classList.add('hidden'));
  } catch (e) {
    panel.innerHTML = `<strong>상태 확인 실패</strong><p>${escapeHtml(e.message)}</p>`;
  } finally { btn.disabled = false; btn.textContent = '상태 확인'; }
}

function setBusy(on) {
  $('salesRunBtn').disabled = on;
  $('salesRunBtn').querySelector('span').textContent = on ? '검증 중…' : '오늘 연락할 3곳 찾기';
  $('salesLoading').classList.toggle('hidden', !on);
  if (on) {
    $('salesEmpty').classList.add('hidden');
    $('salesError').classList.add('hidden');
    $('salesResults').classList.add('hidden');
  }
}
function setLoading(title, text) {
  $('salesLoadingTitle').textContent = title;
  $('salesLoadingText').textContent = text;
}
function showError(message) {
  $('salesLoading').classList.add('hidden');
  $('salesResults').classList.add('hidden');
  $('salesEmpty').classList.add('hidden');
  $('salesError').textContent = message;
  $('salesError').classList.remove('hidden');
}

function sampleProspects(sample) { return Array.isArray(sample?.prospects) ? sample.prospects.slice(0, 3) : []; }
function buildOutreach(lead, sample) {
  const first = String(lead?.contact?.name || '').trim().split(/\s+/)[0];
  const hello = first ? `Hi ${first},` : 'Hi,';
  const signal = cleanLine(lead?.why_now || lead?.signal_title, 180);
  const accounts = sampleProspects(sample);
  const lines = accounts.map((p, i) => `${i + 1}. ${p.company} — ${p.recommended_role || 'buyer'}: ${cleanLine(p.buying_signal || p.why_fit, 145)}`).join('\n');
  return `${hello}\n\nI noticed ${lead.company}'s recent move: ${signal}.\n\nI mapped ${accounts.length} Korean accounts I would test first:\n\n${lines}\n\nThese are based on current public buying signals, not a generic company list. I can verify the buyers, localize the outreach, and run a small Korea demand test before you commit local headcount.\n\nWorth a quick Korea pilot?`;
}
function gmailComposeUrl(lead) {
  const email = lead?.contact?.email;
  if (!email) return '';
  const n = sampleProspects(lead.sample).length;
  const subject = `${n} Korea accounts worth testing for ${lead.company}`;
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(lead.outreach_en || '')}`;
}
async function buildLeadPack(lead) {
  const sample = await requestJson('/api/analyze-v2', {
    clientUrl: lead.url,
    productHint: lead.product_summary || '',
    targetNotes: `유명 대기업을 기본값으로 넣지 말고, ${lead.product_summary || '이 제품'}을 실제로 살 이유가 있는 한국 B2B 기업. 최근 12개월 내 채용·확장·신사업·도입·전환·규제 등 직접 구매 신호가 확인되는 회사만.`
  });
  const prospects = sampleProspects(sample);
  if (prospects.length < 2) throw new Error('강한 한국 잠재고객이 2곳 미만');
  return { ...lead, sample, outreach_en: buildOutreach(lead, sample) };
}

async function runSales() {
  state.data = null; state.reviewed = 0; state.verified = 0; state.rounds = 0;
  setBusy(true);
  try {
    if (!await checkHealth()) throw new Error('검색·AI·Hunter 연결 상태를 확인해주세요.');
    const runCount = Number(localStorage.getItem(RUN_KEY) || '0') + 1;
    localStorage.setItem(RUN_KEY, String(runCount));
    const accepted = [];
    const seen = new Set();
    const baseExcludes = readRecent();

    for (let round = 1; round <= MAX_ROUNDS && accepted.length < TARGET_READY; round++) {
      state.rounds = round;
      setLoading(`좋은 회사만 거르는 중 · ${round}/${MAX_ROUNDS}`, `${accepted.length}/${TARGET_READY}곳 통과 · APAC 확장 → 한국 조직 공백 → GTM 담당자 이메일 순으로 확인합니다.`);
      const d = await requestJson('/api/discover-v2', {
        focus: '',
        excludeCompanies: [...baseExcludes, ...Array.from(seen)].slice(0, MAX_RECENT),
        searchVariant: `${new Date().toISOString().slice(0,10)}-${runCount}-${round}`
      });
      state.reviewed += Number(d?.meta?.considered || 0);
      state.verified += Number(d?.meta?.verified || 0);
      const leads = Array.isArray(d?.leads) ? d.leads : [];
      saveRecent(leads.map(x => x.company));

      for (const lead of leads) {
        const key = String(lead?.company || '').trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        if (!lead?.contact?.email) continue;
        setLoading(`한국 고객 샘플 검증 · ${accepted.length + 1}/${TARGET_READY}`, `${lead.company}: 유명 회사 채우기 없이 실제 구매 신호가 있는 한국 계정을 찾고 있습니다.`);
        try {
          const packed = await buildLeadPack(lead);
          accepted.push(packed);
        } catch {}
        if (accepted.length >= TARGET_READY) break;
      }
    }

    if (!accepted.length) throw new Error('기준을 낮추지 않고 검증했더니 이번 실행에서는 연락할 만한 회사가 없었습니다. 한 번 더 실행하면 다른 탐색군을 봅니다.');
    state.data = {
      generated_at: new Date().toISOString(),
      leads: accepted.slice(0, TARGET_READY),
      meta: { reviewed: state.reviewed, verified: state.verified, rounds: state.rounds }
    };
    localStorage.setItem(RESULT_KEY, JSON.stringify(state.data));
    renderSales();
  } catch (e) {
    showError(e.message || '영업 후보 검증에 실패했습니다.');
  } finally {
    setBusy(false);
    if (state.data?.leads?.length) $('salesResults').classList.remove('hidden');
  }
}

function sourceLinks(evidence = []) {
  return (Array.isArray(evidence) ? evidence : []).slice(0, 3).map((e, i) => {
    const url = safeUrl(e?.url);
    if (!url) return '';
    const label = e?.date ? `근거 ${i + 1} · ${e.date}` : `근거 ${i + 1}`;
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  }).join('');
}
function renderSales() {
  const d = state.data;
  const leads = Array.isArray(d?.leads) ? d.leads : [];
  if (!leads.length) return;
  $('salesEmpty').classList.add('hidden');
  $('salesError').classList.add('hidden');
  $('salesLoading').classList.add('hidden');
  $('salesResults').classList.remove('hidden');

  const reviewed = Number(d.meta?.reviewed || leads.length);
  const verified = Number(d.meta?.verified || leads.length);
  $('salesSummary').innerHTML = `<strong>오늘 연락할 ${leads.length}곳</strong><span>${reviewed || leads.length}개 후보를 훑고, 신호·한국 공백·담당자 검증을 통과한 회사만 남겼습니다.</span><small>검증 회사 ${verified}</small>`;

  $('salesContent').innerHTML = `<div class="lead-stack">${leads.map((lead, index) => {
    const c = lead.contact || {};
    const accounts = sampleProspects(lead.sample);
    const score = Math.max(0, Math.min(100, Number(lead.priority_score) || 0));
    const official = safeUrl(lead.url);
    return `<article class="lead-card">
      <div class="lead-top">
        <div class="lead-title">
          <div class="lead-rank">0${index + 1}</div>
          <div>
            <div class="lead-name-row"><h3>${escapeHtml(lead.company)}</h3><span class="fit-badge">${score} · CONTACT NOW</span></div>
            <p>${escapeHtml(lead.product_summary || 'B2B software')}</p>
            ${official ? `<a class="company-link" href="${escapeHtml(official)}" target="_blank" rel="noopener noreferrer">${escapeHtml(host(official))} ↗</a>` : ''}
          </div>
        </div>
        <a class="mail-primary" href="${escapeHtml(gmailComposeUrl(lead))}" target="_blank" rel="noopener noreferrer">메일 열기</a>
      </div>

      <div class="reason-grid">
        <section><span>WHY NOW</span><strong>${escapeHtml(lead.why_now || lead.signal_title || '')}</strong>${lead.signal_date ? `<small>${escapeHtml(lead.signal_date)}</small>` : ''}</section>
        <section><span>KOREA GAP</span><strong>${escapeHtml(lead.korea_gap || '')}</strong></section>
      </div>

      <div class="contact-line">
        <span>CONTACT</span>
        <strong>${escapeHtml(c.name || roleKo(lead.recommended_role))}</strong>
        <em>${escapeHtml(c.title || roleKo(lead.recommended_role))}</em>
        <a href="mailto:${escapeHtml(c.email || '')}">${escapeHtml(c.email || '')}</a>
        ${c.confidence ? `<small>Hunter ${escapeHtml(c.confidence)}%</small>` : ''}
      </div>

      <div class="account-block">
        <div class="section-label"><span>KOREA TEST ACCOUNTS</span><small>공개 구매 신호가 확인된 ${accounts.length}곳</small></div>
        <div class="account-list">${accounts.map((p, i) => `<div class="account-row">
          <b>${i + 1}</b>
          <div><strong>${escapeHtml(p.company)}</strong><p>${escapeHtml(cleanLine(p.buying_signal || p.why_fit, 190))}</p></div>
          <span>${escapeHtml(p.fit_score || '')}${p.fit_score ? '점' : ''}</span>
        </div>`).join('')}</div>
      </div>

      <div class="evidence-row"><span>EVIDENCE</span>${sourceLinks(lead.evidence)}</div>
      <details class="mail-preview"><summary>보낼 메일 미리보기</summary><pre>${escapeHtml(lead.outreach_en || '')}</pre></details>
    </article>`;
  }).join('')}</div>`;
}

$('diagBtn').addEventListener('click', runDiagnostics);
$('salesRunBtn').addEventListener('click', runSales);

try {
  const saved = JSON.parse(localStorage.getItem(RESULT_KEY) || 'null');
  if (saved?.leads?.length) { state.data = saved; renderSales(); }
} catch {}
checkHealth();
