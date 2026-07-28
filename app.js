const $ = (id) => document.getElementById(id);

const APP_VERSION = '20260728-nohunter-partials-v1';
const RECENT_KEY = 'kpa.sales.recentCompanies';
const RUN_KEY = 'kpa.sales.runCount';
const RESULT_KEY = 'kpa.sales.result';
const MAX_RECENT = 100;
const TARGET_READY = 8;
const MAX_DISCOVERY_ROUNDS = 5;
const SAMPLE_CONCURRENCY = 2;

const state = {
  salesData: null,
  stats: { discovered: 0, email: 0, sample: 0, ready: 0 }
};

if (localStorage.getItem('kpa.app.version') !== APP_VERSION) {
  localStorage.removeItem(RESULT_KEY);
  localStorage.setItem('kpa.app.version', APP_VERSION);
}

function escapeHtml(v = '') {
  return String(v).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}
function safeUrl(v = '') {
  try { const u = new URL(v); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
function host(v = '') {
  try { return new URL(v).hostname.replace(/^www\./, ''); } catch { return v; }
}
function cleanLine(v = '', max = 170) {
  return String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function roleKo(role = '') {
  const key = String(role).trim().toLowerCase();
  const map = {
    founder:'창업자', 'co-founder':'공동창업자', ceo:'대표',
    'head of sales':'영업 책임자', sales:'영업 담당자', 'vp sales':'영업 부사장',
    bd:'사업개발 담당자', 'business development':'사업개발 담당자',
    partnerships:'파트너십 담당자', growth:'성장 담당자', revenue:'매출 책임자',
    commercial:'사업 책임자', 'head of apac':'APAC 책임자'
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
async function requestJson(url, payload, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await readJsonResponse(await fetch(url, {
      method: 'POST', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload), cache:'no-store', signal:controller.signal
    }));
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('조사가 너무 오래 걸려 중단됐습니다.');
    throw e;
  } finally { clearTimeout(timer); }
}

function setStats(next = {}) {
  state.stats = { ...state.stats, ...next };
  if ($('statDiscovered')) $('statDiscovered').textContent = String(state.stats.discovered || 0);
  if ($('statEmail')) $('statEmail').textContent = String(state.stats.email || 0);
  if ($('statSample')) $('statSample').textContent = String(state.stats.sample || 0);
  if ($('statReady')) $('statReady').textContent = String(state.stats.ready || 0);
}
function resetStats() {
  state.stats = { discovered: 0, email: 0, sample: 0, ready: 0 };
  setStats({});
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
    const ok = Boolean(d.groqConnected && d.tavilyConfigured && d.contactDiscoveryConfigured);
    $('apiStatus').className = `status ${ok ? 'ok' : 'bad'}`;
    $('apiStatus').innerHTML = `<span class="dot"></span><span>${ok ? '영업 엔진 정상' : '연결 확인 필요'}</span>`;
    $('apiStatus').title = ok ? '검색·분석·연락처 탐색 사용 가능' : '검색·AI 설정을 확인하세요.';
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
    const ok = Boolean(h.groqConnected && h.tavilyConfigured && h.contactDiscoveryConfigured);
    panel.innerHTML = `<div class="diag-head"><strong>${ok ? '영업 엔진 준비 완료' : '확인이 필요한 항목이 있습니다'}</strong><button id="diagClose" class="ghost small">닫기</button></div>${diagLine('회사 검색', h.tavilyConfigured, h.tavilyConfigured ? '정상' : 'Tavily 확인')}${diagLine('후보 분석', h.groqConnected, h.groqConnected ? '정상' : 'AI 연결 확인')}${diagLine('연락처 탐색', h.contactDiscoveryConfigured, providerSummary(h.contactProviders || {}))}`;
    $('diagClose')?.addEventListener('click', () => panel.classList.add('hidden'));
  } catch (e) {
    panel.innerHTML = `<strong>상태 확인 실패</strong><p>${escapeHtml(e.message)}</p>`;
  } finally { btn.disabled = false; btn.textContent = '상태 확인'; }
}

function readRecent() {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(value) ? value.filter(Boolean).slice(0, MAX_RECENT) : [];
  } catch { return []; }
}
function saveRecent(companies = []) {
  const merged = [...companies, ...readRecent()].map(v => String(v || '').trim()).filter(Boolean);
  const seen = new Set();
  localStorage.setItem(RECENT_KEY, JSON.stringify(merged.filter(name => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_RECENT)));
}

function setBusy(on) {
  $('salesRunBtn').disabled = on;
  if ($('sendAllBtn')) $('sendAllBtn').disabled = on || !state.salesData?.leads?.some(x => x?.contact?.email);
  $('salesLoading').classList.toggle('hidden', !on);
  if (on) {
    $('salesEmpty').classList.add('hidden');
    $('salesError').classList.add('hidden');
    $('salesResults').classList.add('hidden');
  }
  $('salesRunBtn').querySelector('span').textContent = on ? '영업 준비 중…' : '오늘 영업 준비';
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

function sampleProspects(sample) {
  return Array.isArray(sample?.prospects) ? sample.prospects.slice(0, 3) : [];
}
function buildOutreach(lead, sample) {
  const first = String(lead?.contact?.name || '').trim().split(/\s+/)[0];
  const hello = first ? `Hi ${first},` : 'Hi,';
  const signal = cleanLine(lead?.signal_title || lead?.why_now, 180);
  const accounts = sampleProspects(sample);
  if (!accounts.length) return lead.outreach_en || `${hello}\n\nI noticed ${lead.company}'s recent move: ${signal}.\n\nI work on small Korea market tests for overseas B2B software companies. Worth seeing a small Korea sample before adding local headcount?`;
  const accountLines = accounts.map((p, i) => `${i + 1}. ${p.company} — ${p.recommended_role || 'buyer'}: ${cleanLine(p.buying_signal || p.why_fit, 150)}`).join('\n');
  return `${hello}\n\nI noticed ${lead.company}'s recent move: ${signal}.\n\nI mapped ${accounts.length} Korean accounts I would test first for ${lead.company}:\n\n${accountLines}\n\nI picked these from current public signals rather than a generic company list. I can run a small Korea market test around these accounts before you add local headcount.\n\nOpen to a small Korea pilot?`;
}
function gmailComposeUrl(lead) {
  const email = lead?.contact?.email;
  if (!email) return '';
  const n = sampleProspects(lead.sample).length;
  const subject = n ? `${n} Korea accounts worth testing for ${lead.company}` : `Korea market test for ${lead.company}`;
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(lead.outreach_en || buildOutreach(lead, lead.sample))}`;
}
async function buildLeadPack(lead) {
  const sample = await requestJson('/api/analyze', {
    clientUrl: lead.url,
    productHint: lead.product_summary || '',
    targetNotes: '이 제품을 실제로 구매할 가능성이 있는 한국 B2B 기업. 최근 채용·확장·도입·규제·운영 변화 등 공개 구매 신호가 있는 곳 우선.',
    seeds: '', count: 3
  }, 120000);
  const prospects = sampleProspects(sample);
  if (!prospects.length) throw new Error('한국 잠재고객 검증 결과 없음');
  return { ...lead, sample, sample_status: 'ready', outreach_en: buildOutreach(lead, sample) };
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = { status:'fulfilled', value:await worker(items[index], index) }; }
      catch (reason) { results[index] = { status:'rejected', reason, item:items[index] }; }
    }
  }
  await Promise.all(Array.from({ length:Math.min(limit, items.length) }, () => runWorker()));
  return results;
}

async function discoverLeads() {
  const runCount = Number(localStorage.getItem(RUN_KEY) || '0') + 1;
  localStorage.setItem(RUN_KEY, String(runCount));
  const collected = [];
  const seen = new Set();
  const excludes = readRecent();

  for (let round = 1; round <= MAX_DISCOVERY_ROUNDS && collected.filter(x => x?.contact?.email).length < TARGET_READY; round++) {
    setLoading(`해외 SaaS 탐색 ${round}/${MAX_DISCOVERY_ROUNDS}`, `성장 신호·한국 조직 공백·연락처를 확인 중입니다. 이메일이 없어도 검증 후보는 남깁니다.`);
    const d = await requestJson('/api/discover-clients', {
      focus: '',
      excludeCompanies: [...excludes, ...Array.from(seen)].slice(0, MAX_RECENT),
      searchVariant: `${new Date().toISOString().slice(0,10)}-${runCount}-${round}`
    });
    const leads = Array.isArray(d?.leads) ? d.leads : [];
    setStats({ discovered: state.stats.discovered + leads.length });
    saveRecent(leads.map(x => x.company));

    for (const lead of leads) {
      const key = String(lead?.company || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      collected.push({ ...lead, sample_status: lead?.contact?.email ? 'sample_pending' : 'contact_missing' });
    }
    setStats({ email: collected.filter(x => x?.contact?.email).length });
  }
  return collected.slice(0, 16);
}

async function runSales() {
  state.salesData = null;
  resetStats();
  setBusy(true);
  try {
    if (!await checkHealth()) throw new Error('회사 검색·분석·연락처 탐색 연결 상태를 확인해주세요.');

    const leads = await discoverLeads();
    if (!leads.length) throw new Error('이번 실행에서 검증 기준을 통과한 회사가 0곳이었습니다. 빈 결과 대신 다음 실행에서 다른 업종 묶음을 자동 탐색합니다.');

    const withEmail = leads.filter(lead => lead?.contact?.email).slice(0, TARGET_READY);
    let sampleDone = 0;
    const packed = await mapConcurrent(withEmail, SAMPLE_CONCURRENCY, async (lead) => {
      const pack = await buildLeadPack(lead);
      sampleDone += 1;
      setStats({ sample: sampleDone, ready: sampleDone });
      setLoading('맞춤 영업 메일 생성', `${sampleDone}/${withEmail.length} 완료 · 실패한 샘플도 후보에서 사라지지 않습니다.`);
      return pack;
    });

    const packedByCompany = new Map();
    for (const result of packed) {
      const source = result?.status === 'fulfilled' ? result.value : result?.item;
      if (!source?.company) continue;
      if (result.status === 'fulfilled') packedByCompany.set(source.company.toLowerCase(), result.value);
      else packedByCompany.set(source.company.toLowerCase(), { ...source, sample_status:'sample_failed', sample_error:cleanLine(result?.reason?.message || '샘플 생성 실패', 120), outreach_en:buildOutreach(source, null) });
    }

    const finalLeads = leads.map(lead => packedByCompany.get(String(lead.company).toLowerCase()) || lead).sort((a, b) => {
      const rank = { ready:3, sample_failed:2, sample_pending:2, contact_missing:1 };
      return (rank[b.sample_status] || 0) - (rank[a.sample_status] || 0) || (Number(b.priority_score) || 0) - (Number(a.priority_score) || 0);
    });
    const readyCount = finalLeads.filter(x => x.sample_status === 'ready').length;
    const emailCount = finalLeads.filter(x => x?.contact?.email).length;

    state.salesData = {
      generated_at: new Date().toISOString(),
      leads: finalLeads,
      meta: { discovered: state.stats.discovered, email_found: emailCount, ready: readyCount, target: TARGET_READY }
    };
    setStats({ email: emailCount, sample: readyCount, ready: readyCount });
    localStorage.setItem(RESULT_KEY, JSON.stringify(state.salesData));
    renderSales();
  } catch (e) {
    state.salesData = null;
    showError(e.message || '오늘 영업 준비에 실패했습니다.');
  } finally {
    setBusy(false);
    if (state.salesData?.leads?.length) {
      $('salesLoading').classList.add('hidden');
      $('salesResults').classList.remove('hidden');
    }
  }
}

function statusText(lead) {
  if (lead.sample_status === 'ready') return '발송 준비';
  if (lead.sample_status === 'sample_failed') return '샘플 미완성';
  if (lead?.contact?.email) return '이메일 확보';
  return '연락처 미확보';
}
function renderSales() {
  const d = state.salesData;
  if (!d?.leads?.length) return;
  const leads = d.leads;
  const sendable = leads.filter(x => x?.contact?.email);
  const ready = leads.filter(x => x.sample_status === 'ready').length;

  $('salesEmpty').classList.add('hidden');
  $('salesError').classList.add('hidden');
  $('salesLoading').classList.add('hidden');
  $('salesResults').classList.remove('hidden');
  setStats({
    discovered: Number(d.meta?.discovered || leads.length),
    email: Number(d.meta?.email_found || sendable.length),
    sample: ready,
    ready
  });

  if ($('sendAllBtn')) {
    $('sendAllBtn').disabled = !sendable.length;
    $('sendAllBtn').textContent = sendable.length ? `이메일 있는 ${sendable.length}개 열기` : '열 수 있는 메일 없음';
  }
  $('salesSummary').innerHTML = `<strong>발송 준비 ${ready}개 · 검토 후보 ${leads.length}개</strong><span>샘플 생성이나 이메일 확보가 덜 끝나도 검증된 회사와 근거를 숨기지 않습니다.</span>`;

  $('salesContent').innerHTML = `<div class="outbox-table">${leads.map((lead, index) => {
    const c = lead.contact || {};
    const accounts = sampleProspects(lead.sample);
    const mail = gmailComposeUrl(lead);
    return `<article class="outbox-row">
      <div class="outbox-index">${index + 1}</div>
      <div class="outbox-company"><strong>${escapeHtml(lead.company)}</strong>${safeUrl(lead.url) ? `<a href="${escapeHtml(safeUrl(lead.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(host(lead.url))}</a>` : ''}<small>${escapeHtml(statusText(lead))}</small></div>
      <div class="outbox-contact"><strong>${escapeHtml(c.name || roleKo(lead.recommended_role))}</strong><span>${escapeHtml(c.title || roleKo(lead.recommended_role))}</span>${c.email ? `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : `<small>이메일 미확보 · 후보 유지</small>`}</div>
      <div class="outbox-accounts">${accounts.length ? accounts.map((p, i) => `<span><b>${i + 1}</b>${escapeHtml(p.company)}</span>`).join('') : `<span>${escapeHtml(lead.sample_error || lead.why_now || '샘플 미완성')}</span>`}</div>
      ${mail ? `<a class="send-one" href="${escapeHtml(mail)}" target="_blank" rel="noopener noreferrer">메일 열기</a>` : `<span class="send-one" aria-disabled="true">대기</span>`}
      ${c.email ? `<details class="outbox-mail"><summary>메일 내용</summary><pre>${escapeHtml(lead.outreach_en || buildOutreach(lead, lead.sample))}</pre></details>` : ''}
    </article>`;
  }).join('')}</div>`;
}

function sendAll() {
  const leads = (state.salesData?.leads || []).filter(x => x?.contact?.email);
  if (!leads.length) return;
  leads.forEach(lead => window.open(gmailComposeUrl(lead), '_blank', 'noopener,noreferrer'));
  const btn = $('sendAllBtn');
  if (!btn) return;
  const old = btn.textContent;
  btn.textContent = `${leads.length}개 Gmail 작성창 요청됨`;
  setTimeout(() => { btn.textContent = old; }, 1800);
}

$('diagBtn')?.addEventListener('click', runDiagnostics);
$('salesRunBtn')?.addEventListener('click', runSales);
$('sendAllBtn')?.addEventListener('click', sendAll);

try {
  const saved = JSON.parse(localStorage.getItem(RESULT_KEY) || 'null');
  if (saved?.leads?.length) { state.salesData = saved; renderSales(); }
  else resetStats();
} catch { resetStats(); }
checkHealth();
