const $ = (id) => document.getElementById(id);

const APP_VERSION = '20260728-nohunter-partials-v1';
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

function providerSummary(providers = {}) {
  const active = [];
  if (providers.publicWeb) active.push('공식 웹');
  if (providers.prospeo) active.push('Prospeo');
  if (providers.apollo) active.push('Apollo');
  if (providers.tomba) active.push('Tomba');
  return active.join(' → ') || '공식 웹';
}

async function checkHealth() {
  try {
    const d = await readJsonResponse(await fetch(`/api/health?t=${Date.now()}`, { cache:'no-store' }));
    const ok = Boolean(d.aiConnected && d.tavilyConfigured && d.contactDiscoveryConfigured);
    $('apiStatus').className = `status ${ok ? 'ok' : 'bad'}`;
    $('apiStatus').innerHTML = `<span class="dot"></span><span>${ok ? '영업 엔진 정상' : '연결 확인 필요'}</span>`;
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
    const ok = Boolean(h.aiConnected && h.tavilyConfigured && h.contactDiscoveryConfigured);
    panel.innerHTML = `<div class="diag-head"><strong>${ok ? '영업 엔진 준비 완료' : '확인이 필요합니다'}</strong><button id="diagClose" class="ghost small">닫기</button></div>${diagLine('웹 검색', h.tavilyConfigured, h.tavilyConfigured ? 'Tavily 정상' : 'Tavily 확인')}${diagLine('AI 검증', h.aiConnected, h.aiConnected ? `${h.aiModel || 'AI'} 정상` : 'AI 연결 확인')}${diagLine('연락처 탐색', h.contactDiscoveryConfigured, providerSummary(h.contactProviders || {}))}`;
    $('diagClose')?.addEventListener('click', () => panel.classList.add('hidden'));
  } catch (e) {
    panel.innerHTML = `<strong>상태 확인 실패</strong><p>${escapeHtml(e.message)}</p>`;
  } finally { btn.disabled = false; btn.textContent = '상태 확인'; }
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
  if (!accounts.length) return lead.outreach_en || `${hello}\n\nI noticed ${lead.company}'s recent move: ${signal}.\n\nI work on small Korea market tests for overseas B2B software companies. Worth seeing a Korea sample before adding local headcount?`;
  const lines = accounts.map((p, i) => `${i + 1}. ${p.company} — ${p.recommended_role || 'buyer'}: ${cleanLine(p.buying_signal || p.why_fit, 145)}`).join('\n');
  return `${hello}\n\nI noticed ${lead.company}'s recent move: ${signal}.\n\nI mapped ${accounts.length} Korean accounts I would test first:\n\n${lines}\n\nThese are based on current public buying signals, not a generic company list. I can verify the buyers, localize the outreach, and run a small Korea demand test before you commit local headcount.\n\nWorth a quick Korea pilot?`;
}
function gmailComposeUrl(lead) {
  const email = lead?.contact?.email;
  if (!email) return '';
  const n = sampleProspects(lead.sample).length;
  const subject = n ? `${n} Korea accounts worth testing for ${lead.company}` : `Korea market test for ${lead.company}`;
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(lead.outreach_en || '')}`;
}
async function buildLeadPack(lead) {
  const sample = await requestJson('/api/analyze-v2', {
    clientUrl: lead.url,
    productHint: lead.product_summary || '',
    targetNotes: `유명 대기업을 기본값으로 넣지 말고, ${lead.product_summary || '이 제품'}을 실제로 살 이유가 있는 한국 B2B 기업. 최근 12개월 내 채용·확장·신사업·도입·전환·규제 등 직접 구매 신호가 확인되는 회사만.`
  });
  const prospects = sampleProspects(sample);
  if (!prospects.length) throw new Error('한국 잠재고객 검증 결과 없음');
  return { ...lead, sample, sample_status: 'ready', outreach_en: buildOutreach(lead, sample) };
}

async function runSales() {
  state.data = null; state.reviewed = 0; state.verified = 0; state.rounds = 0;
  setBusy(true);
  try {
    if (!await checkHealth()) throw new Error('검색·AI·연락처 탐색 연결 상태를 확인해주세요.');
    const runCount = Number(localStorage.getItem(RUN_KEY) || '0') + 1;
    localStorage.setItem(RUN_KEY, String(runCount));
    const allLeads = [];
    const seen = new Set();
    const baseExcludes = readRecent();

    for (let round = 1; round <= MAX_ROUNDS && allLeads.filter(x => x.sample_status === 'ready').length < TARGET_READY; round++) {
      state.rounds = round;
      const readyCount = allLeads.filter(x => x.sample_status === 'ready').length;
      setLoading(`좋은 회사만 거르는 중 · ${round}/${MAX_ROUNDS}`, `${readyCount}/${TARGET_READY}곳 발송 준비 · 결과가 덜 완성돼도 후보와 근거는 버리지 않습니다.`);
      const d = await requestJson('/api/discover-v2', {
        focus: '',
        excludeCompanies: [...baseExcludes, ...Array.from(seen)].slice(0, MAX_RECENT),
        searchVariant: `${new Date().toISOString().slice(0,10)}-${runCount}-${round}`
      });
      state.reviewed += Number(d?.meta?.search?.search_results || d?.meta?.returned_count || 0);
      const leads = Array.isArray(d?.leads) ? d.leads : [];
      state.verified += leads.length;
      saveRecent(leads.map(x => x.company));

      for (const lead of leads) {
        const key = String(lead?.company || '').trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        let stored = { ...lead, sample_status: lead?.contact?.email ? 'sample_pending' : 'contact_missing' };
        allLeads.push(stored);

        if (!lead?.contact?.email) continue;
        setLoading(`한국 고객 샘플 검증 · ${readyCount + 1}/${TARGET_READY}`, `${lead.company}: 샘플이 실패해도 회사·담당자·근거는 화면에 남깁니다.`);
        try {
          const packed = await buildLeadPack(lead);
          const index = allLeads.findIndex(x => String(x.company).toLowerCase() === key);
          if (index >= 0) allLeads[index] = packed;
        } catch (e) {
          const index = allLeads.findIndex(x => String(x.company).toLowerCase() === key);
          if (index >= 0) allLeads[index] = { ...lead, sample_status: 'sample_failed', sample_error: cleanLine(e?.message || '샘플 생성 실패', 120), outreach_en: buildOutreach(lead, null) };
        }

        if (allLeads.filter(x => x.sample_status === 'ready').length >= TARGET_READY) break;
      }
    }

    if (!allLeads.length) {
      throw new Error('이번 탐색에서는 검증 기준을 통과한 회사가 0곳이었습니다. 빈 화면으로 끝내지 않고 다음 실행에서 다른 업종 묶음을 자동 탐색합니다.');
    }

    const ordered = allLeads.sort((a, b) => {
      const statusRank = { ready: 3, sample_failed: 2, sample_pending: 2, contact_missing: 1 };
      return (statusRank[b.sample_status] || 0) - (statusRank[a.sample_status] || 0) || (Number(b.priority_score) || 0) - (Number(a.priority_score) || 0);
    });
    state.data = {
      generated_at: new Date().toISOString(),
      leads: ordered.slice(0, 8),
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
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">근거 ${i + 1}</a>`;
  }).join('');
}
function statusInfo(lead) {
  if (lead.sample_status === 'ready') return { label: '발송 준비', note: '한국 샘플 포함' };
  if (lead.sample_status === 'sample_failed') return { label: '샘플 미완성', note: lead.sample_error || '담당자 이메일은 확보됨' };
  if (lead?.contact?.email) return { label: '이메일 확보', note: '샘플 생성 대기' };
  return { label: '연락처 미확보', note: `추천 직책: ${roleKo(lead.recommended_role)}` };
}
function renderSales() {
  const d = state.data;
  const leads = Array.isArray(d?.leads) ? d.leads : [];
  if (!leads.length) return;
  $('salesEmpty').classList.add('hidden');
  $('salesError').classList.add('hidden');
  $('salesLoading').classList.add('hidden');
  $('salesResults').classList.remove('hidden');

  const ready = leads.filter(x => x.sample_status === 'ready').length;
  const email = leads.filter(x => x?.contact?.email).length;
  $('salesSummary').innerHTML = `<strong>발송 준비 ${ready}곳 · 검토 후보 ${leads.length}곳</strong><span>샘플이나 이메일이 덜 완성돼도 검증된 회사와 근거는 숨기지 않습니다.</span><small>이메일 확보 ${email} · 검증 후보 ${Number(d.meta?.verified || leads.length)}</small>`;

  $('salesContent').innerHTML = `<div class="lead-stack">${leads.map((lead, index) => {
    const c = lead.contact || {};
    const accounts = sampleProspects(lead.sample);
    const score = Math.max(0, Math.min(100, Number(lead.priority_score) || 0));
    const official = safeUrl(lead.url);
    const status = statusInfo(lead);
    const mailUrl = gmailComposeUrl(lead);
    return `<article class="lead-card">
      <div class="lead-top">
        <div class="lead-title">
          <div class="lead-rank">0${index + 1}</div>
          <div>
            <div class="lead-name-row"><h3>${escapeHtml(lead.company)}</h3><span class="fit-badge">${score} · ${escapeHtml(status.label)}</span></div>
            <p>${escapeHtml(lead.product_summary || 'B2B software')}</p>
            ${official ? `<a class="company-link" href="${escapeHtml(official)}" target="_blank" rel="noopener noreferrer">${escapeHtml(host(official))} ↗</a>` : ''}
          </div>
        </div>
        ${mailUrl ? `<a class="mail-primary" href="${escapeHtml(mailUrl)}" target="_blank" rel="noopener noreferrer">메일 열기</a>` : `<span class="mail-primary" aria-disabled="true">${escapeHtml(status.label)}</span>`}
      </div>
      <div class="reason-grid">
        <section><span>WHY NOW</span><strong>${escapeHtml(lead.why_now || lead.signal_title || '')}</strong></section>
        <section><span>STATUS</span><strong>${escapeHtml(status.note)}</strong></section>
      </div>
      <div class="contact-line">
        <span>CONTACT</span>
        <strong>${escapeHtml(c.name || roleKo(lead.recommended_role))}</strong>
        <em>${escapeHtml(c.title || roleKo(lead.recommended_role))}</em>
        ${c.email ? `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : `<small>이메일 미확보 · 후보는 유지</small>`}
      </div>
      <div class="account-block">
        <div class="section-label"><span>KOREA TEST ACCOUNTS</span><small>${accounts.length ? `공개 구매 신호가 확인된 ${accounts.length}곳` : '샘플이 없어도 회사 후보는 유지'}</small></div>
        ${accounts.length ? `<div class="account-list">${accounts.map((p, i) => `<div class="account-row"><b>${i + 1}</b><div><strong>${escapeHtml(p.company)}</strong><p>${escapeHtml(cleanLine(p.buying_signal || p.why_fit, 190))}</p></div><span>${escapeHtml(p.fit_score || '')}${p.fit_score ? '점' : ''}</span></div>`).join('')}</div>` : `<p>${escapeHtml(lead.korea_opportunity || '한국 시장 테스트 후보로 유지합니다.')}</p>`}
      </div>
      <div class="evidence-row"><span>EVIDENCE</span>${sourceLinks(lead.evidence)}</div>
      ${c.email ? `<details class="mail-preview"><summary>보낼 메일 미리보기</summary><pre>${escapeHtml(lead.outreach_en || buildOutreach(lead, lead.sample))}</pre></details>` : ''}
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
