const $ = (id) => document.getElementById(id);

const APP_VERSION = '20260728-6';
const RECENT_KEY = 'kpa.sales.recentCompanies';
const RUN_KEY = 'kpa.sales.runCount';
const RESULT_KEY = 'kpa.sales.result';
const MAX_RECENT = 80;
const TARGET_READY = 8;
const MAX_DISCOVERY_ROUNDS = 4;
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
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: controller.signal
    }));
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('조사가 너무 오래 걸려 중단됐습니다.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function setStats(next = {}) {
  state.stats = { ...state.stats, ...next };
  $('statDiscovered').textContent = String(state.stats.discovered || 0);
  $('statEmail').textContent = String(state.stats.email || 0);
  $('statSample').textContent = String(state.stats.sample || 0);
  $('statReady').textContent = String(state.stats.ready || 0);
}
function resetStats() {
  state.stats = { discovered: 0, email: 0, sample: 0, ready: 0 };
  setStats({});
}

async function checkHealth() {
  try {
    const d = await readJsonResponse(await fetch(`/api/health?t=${Date.now()}`, { cache:'no-store' }));
    const ok = Boolean(d.groqConnected && d.tavilyConfigured && d.hunterConfigured);
    $('apiStatus').className = `status ${ok ? 'ok' : 'bad'}`;
    $('apiStatus').innerHTML = `<span class="dot"></span><span>${ok ? '영업 엔진 정상' : '연결 확인 필요'}</span>`;
    $('apiStatus').title = ok ? '검색·분석·담당자 이메일 탐색 사용 가능' : 'Groq, Tavily, Hunter 설정을 확인하세요.';
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
  btn.disabled = true;
  btn.textContent = '확인 중';
  panel.classList.remove('hidden');
  try {
    const h = await readJsonResponse(await fetch(`/api/health?t=${Date.now()}`, { cache:'no-store' }));
    const ok = Boolean(h.groqConnected && h.tavilyConfigured && h.hunterConfigured);
    panel.innerHTML = `<div class="diag-head"><strong>${ok ? '영업 엔진 준비 완료' : '확인이 필요한 항목이 있습니다'}</strong><button id="diagClose" class="ghost small">닫기</button></div>${diagLine('회사 검색', h.tavilyConfigured, h.tavilyConfigured ? '정상' : 'Tavily 확인')}${diagLine('후보 분석', h.groqConnected, h.groqConnected ? '정상' : 'Groq 확인')}${diagLine('담당자 이메일', h.hunterConfigured, h.hunterConfigured ? '정상' : 'Hunter 확인')}`;
    $('diagClose')?.addEventListener('click', () => panel.classList.add('hidden'));
  } catch (e) {
    panel.innerHTML = `<strong>상태 확인 실패</strong><p>${escapeHtml(e.message)}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '상태 확인';
  }
}

function readRecent() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter(Boolean).slice(0, MAX_RECENT) : [];
  } catch { return []; }
}
function saveRecent(companies = []) {
  const merged = [...companies, ...readRecent()].map(v => String(v || '').trim()).filter(Boolean);
  const seen = new Set();
  const unique = merged.filter(name => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(unique));
}

function setBusy(on) {
  $('salesRunBtn').disabled = on;
  $('sendAllBtn').disabled = on || !state.salesData?.leads?.length;
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
  const accountLines = accounts.map((p, i) => {
    const buyer = p.recommended_role || 'business owner';
    const reason = cleanLine(p.buying_signal || p.why_fit, 150);
    return `${i + 1}. ${p.company} — ${buyer}${reason ? `: ${reason}` : ''}`;
  }).join('\n');

  return `${hello}\n\nI noticed ${lead.company}'s recent move: ${signal}.\n\nI mapped 3 Korean accounts I would test first for ${lead.company}:\n\n${accountLines}\n\nI picked these from current public signals rather than a generic company list. I can run a small Korea market test around these accounts — verify the buyers, localize the outreach, and test demand before you add local headcount.\n\nOpen to a small Korea pilot?`;
}
function gmailComposeUrl(lead) {
  const email = lead?.contact?.email;
  if (!email) return '';
  const subject = `3 Korea accounts worth testing for ${lead.company}`;
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(lead.outreach_en || '')}`;
}
async function buildLeadPack(lead) {
  const sample = await requestJson('/api/analyze', {
    clientUrl: lead.url,
    productHint: '',
    targetNotes: '이 제품을 실제로 구매할 가능성이 있는 한국 B2B 기업. 최근 채용·확장·도입·규제·운영 변화 등 공개 구매 신호가 있는 곳 우선.',
    seeds: '',
    count: 3
  }, 120000);
  const prospects = sampleProspects(sample);
  if (prospects.length !== 3) throw new Error('한국 잠재고객 3곳 검증 실패');
  return { ...lead, sample, outreach_en: buildOutreach(lead, sample) };
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = { status:'fulfilled', value:await worker(items[index], index) }; }
      catch (reason) { results[index] = { status:'rejected', reason }; }
    }
  }
  await Promise.all(Array.from({ length:Math.min(limit, items.length) }, () => runWorker()));
  return results;
}

async function discoverEmailLeads() {
  const runCount = Number(localStorage.getItem(RUN_KEY) || '0') + 1;
  localStorage.setItem(RUN_KEY, String(runCount));
  const collected = [];
  const seen = new Set();
  const excludes = readRecent();

  for (let round = 1; round <= MAX_DISCOVERY_ROUNDS && collected.length < TARGET_READY; round++) {
    setLoading(`해외 SaaS 탐색 ${round}/${MAX_DISCOVERY_ROUNDS}`, `최근 성장 신호를 확인하고 실제 영업 담당자 이메일을 찾는 중 · ${collected.length}곳 확보`);
    const d = await requestJson('/api/discover-clients', {
      focus: '',
      excludeCompanies: [...excludes, ...Array.from(seen)].slice(0, 80),
      searchVariant: `${new Date().toISOString().slice(0,10)}-${runCount}-${round}`
    });
    const leads = Array.isArray(d?.leads) ? d.leads : [];
    setStats({ discovered: state.stats.discovered + leads.length });
    saveRecent(leads.map(x => x.company));

    for (const lead of leads) {
      const key = String(lead?.company || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (lead?.contact?.email) collected.push(lead);
      if (collected.length >= TARGET_READY) break;
    }
    setStats({ email: collected.length });
  }

  return collected.slice(0, TARGET_READY);
}

async function runSales() {
  state.salesData = null;
  resetStats();
  setBusy(true);
  try {
    if (!await checkHealth()) throw new Error('회사 검색·분석·담당자 이메일 연결 상태를 확인해주세요.');

    const emailLeads = await discoverEmailLeads();
    if (!emailLeads.length) throw new Error('이번 탐색에서 실제 업무 이메일이 확인된 후보를 찾지 못했습니다. 다시 실행해주세요.');

    let sampleDone = 0;
    setLoading('한국 잠재고객 샘플 생성', `확보한 ${emailLeads.length}곳을 대상으로 회사별 한국 잠재고객 3곳을 검증합니다.`);
    const packed = await mapConcurrent(emailLeads, SAMPLE_CONCURRENCY, async (lead) => {
      const pack = await buildLeadPack(lead);
      sampleDone += 1;
      setStats({ sample: sampleDone, ready: sampleDone });
      setLoading('맞춤 영업 메일 생성', `${sampleDone}/${emailLeads.length} 완료 · 한국 기업 3곳을 각 메일 본문에 넣고 있습니다.`);
      return pack;
    });

    const ready = packed
      .filter(x => x?.status === 'fulfilled')
      .map(x => x.value)
      .filter(x => x?.contact?.email && sampleProspects(x.sample).length === 3);

    if (!ready.length) throw new Error('담당자 이메일은 확보했지만 한국 샘플까지 완성된 메일이 없습니다.');

    state.salesData = {
      generated_at: new Date().toISOString(),
      leads: ready,
      meta: {
        discovered: state.stats.discovered,
        email_found: emailLeads.length,
        ready: ready.length,
        target: TARGET_READY
      }
    };
    setStats({ ready: ready.length, sample: ready.length });
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

function renderSales() {
  const d = state.salesData;
  if (!d?.leads?.length) return;
  const leads = d.leads.filter(x => x?.contact?.email && sampleProspects(x.sample).length === 3);

  $('salesEmpty').classList.add('hidden');
  $('salesError').classList.add('hidden');
  $('salesLoading').classList.add('hidden');
  $('salesResults').classList.remove('hidden');
  setStats({
    discovered: Number(d.meta?.discovered || leads.length),
    email: Number(d.meta?.email_found || leads.length),
    sample: leads.length,
    ready: leads.length
  });

  $('sendAllBtn').disabled = !leads.length;
  $('sendAllBtn').textContent = `준비된 ${leads.length}개 메일 열기`;
  $('salesSummary').innerHTML = `<strong>${leads.length}개 발송 준비 완료</strong><span>모든 메일에 해당 SaaS가 한국에서 먼저 공략할 기업 3곳이 포함되어 있습니다.</span>`;

  $('salesContent').innerHTML = `<div class="outbox-table">${leads.map((lead, index) => {
    const c = lead.contact;
    const accounts = sampleProspects(lead.sample);
    return `<article class="outbox-row">
      <div class="outbox-index">${index + 1}</div>
      <div class="outbox-company">
        <strong>${escapeHtml(lead.company)}</strong>
        <a href="${escapeHtml(safeUrl(lead.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(host(lead.url))}</a>
      </div>
      <div class="outbox-contact">
        <strong>${escapeHtml(c.name || roleKo(lead.recommended_role))}</strong>
        <span>${escapeHtml(c.title || roleKo(lead.recommended_role))}</span>
        <a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>
      </div>
      <div class="outbox-accounts">${accounts.map((p, i) => `<span><b>${i + 1}</b>${escapeHtml(p.company)}</span>`).join('')}</div>
      <a class="send-one" href="${escapeHtml(gmailComposeUrl(lead))}" target="_blank" rel="noopener noreferrer">메일 열기</a>
      <details class="outbox-mail"><summary>메일 내용</summary><pre>${escapeHtml(lead.outreach_en || '')}</pre></details>
    </article>`;
  }).join('')}</div>`;
}

function sendAll() {
  const leads = (state.salesData?.leads || []).filter(x => x?.contact?.email && sampleProspects(x.sample).length === 3);
  if (!leads.length) return;
  leads.forEach(lead => window.open(gmailComposeUrl(lead), '_blank', 'noopener,noreferrer'));
  const btn = $('sendAllBtn');
  const old = btn.textContent;
  btn.textContent = `${leads.length}개 Gmail 작성창 요청됨`;
  setTimeout(() => { btn.textContent = old; }, 1800);
}

$('diagBtn').addEventListener('click', runDiagnostics);
$('salesRunBtn').addEventListener('click', runSales);
$('sendAllBtn').addEventListener('click', sendAll);

try {
  const d = JSON.parse(localStorage.getItem(RESULT_KEY) || 'null');
  if (d?.leads?.length) {
    state.salesData = d;
    renderSales();
  } else {
    resetStats();
  }
} catch {
  resetStats();
}
checkHealth();
