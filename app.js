const $ = (id) => document.getElementById(id);
const APP_VERSION = '20260728-5';
const RECENT_KEY = 'kpa.sales.recentCompanies';
const RUN_KEY = 'kpa.sales.runCount';
const MAX_RECENT = 36;
const state = { salesData: null };

if (localStorage.getItem('kpa.app.version') !== APP_VERSION) {
  ['kpa.sales.result'].forEach(k => localStorage.removeItem(k));
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

function escapeHtml(v = '') {
  return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function safeUrl(v = '') {
  try { const u = new URL(v); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
function host(v = '') {
  try { return new URL(v).hostname.replace(/^www\./, ''); } catch { return v; }
}
function roleKo(role = '') {
  const key = String(role).trim().toLowerCase();
  const map = {
    founder:'창업자','co-founder':'공동창업자',ceo:'대표','head of sales':'영업 책임자',sales:'영업 담당자',
    bd:'사업개발 담당자','business development':'사업개발 담당자',partnerships:'파트너십 담당자',growth:'성장 담당자',
    revenue:'매출 책임자',commercial:'사업 책임자','head of apac':'APAC 책임자','vp sales':'영업 부사장'
  };
  return map[key] || role || '영업 책임자';
}
function cleanLine(v = '', max = 150) {
  return String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function readJsonResponse(response) {
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(`응답 형식 오류 (HTTP ${response.status})`); }
  if (!response.ok) throw new Error(`${data?.error || `HTTP ${response.status}`}${data?.hint ? ` · ${data.hint}` : ''}`);
  return data;
}
async function requestJson(url, payload, timeoutMs = 120000) {
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
    const ok = Boolean(d.groqConnected && d.tavilyConfigured && d.hunterConfigured);
    $('apiStatus').className = `status ${ok ? 'ok' : 'bad'}`;
    $('apiStatus').innerHTML = `<span class="dot"></span><span>${ok ? '발굴·이메일 정상' : '연결 확인 필요'}</span>`;
    $('apiStatus').title = ok ? '회사 검색·분석·담당자 이메일 탐색 사용 가능' : 'Groq, Tavily, Hunter 설정을 확인하세요.';
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
    panel.innerHTML = `<div class="diag-head"><strong>${h.groqConnected && h.tavilyConfigured && h.hunterConfigured ? '보낼 메일 생성 준비 완료' : '확인이 필요한 항목이 있습니다'}</strong><button id="diagClose" class="ghost small">닫기</button></div>${diagLine('회사 검색', h.tavilyConfigured, h.tavilyConfigured ? '정상' : 'Tavily 확인')}${diagLine('후보 분석', h.groqConnected, h.groqConnected ? '정상' : 'Groq 확인')}${diagLine('담당자 이메일', h.hunterConfigured, h.hunterConfigured ? '정상' : 'Hunter 확인')}`;
    $('diagClose')?.addEventListener('click', () => panel.classList.add('hidden'));
  } catch (e) {
    panel.innerHTML = `<strong>상태 확인 실패</strong><p>${escapeHtml(e.message)}</p>`;
  } finally { btn.disabled = false; btn.textContent = '상태 확인'; }
}

function readRecent() {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter(Boolean).slice(0, MAX_RECENT) : []; }
  catch { return []; }
}
function saveRecent(companies = []) {
  const merged = [...companies, ...readRecent()].map(v => String(v || '').trim()).filter(Boolean);
  const seen = new Set();
  const unique = merged.filter(name => { const key = name.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(unique));
}
function daySeed(now) {
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000);
}
function pickFive(pool, seed) {
  const out = [];
  for (let i = 0; i < 5; i++) out.push(pool[(seed * 3 + i * 2) % pool.length]);
  return [...new Set(out)].slice(0, 5);
}
function renderTopics() {
  const root = $('dailyTopics'), label = $('topicTimeLabel'), focus = $('salesFocus');
  if (!root || !focus) return;
  const now = new Date(), afternoon = now.getHours() >= 14;
  const pool = afternoon ? AFTERNOON_TOPICS : MORNING_TOPICS;
  const topics = pickFive(pool, daySeed(now) + (afternoon ? 17 : 0));
  label.textContent = afternoon ? '오후 추천 · 14:00' : '오전 추천 · 09:00';
  root.innerHTML = topics.map((topic, i) => `<button type="button" class="topic-chip" data-topic-index="${i}">${topic}</button>`).join('');
  root.querySelectorAll('.topic-chip').forEach((btn, i) => btn.addEventListener('click', () => {
    const same = btn.classList.contains('active');
    root.querySelectorAll('.topic-chip').forEach(x => x.classList.remove('active'));
    if (same) { focus.value = ''; return; }
    btn.classList.add('active');
    focus.value = `${topics[i]}. 최근 1년 내 해외 확장·투자·영업 채용·파트너십 신호가 있고 한국 현지 영업조직이 아직 강하지 않은 회사.`;
  }));
}

function setSalesBusy(on, phase = 'discover') {
  $('salesRunBtn').disabled = on;
  $('salesRunBtn').querySelector('span').textContent = on ? (phase === 'pack' ? '한국 샘플·메일 만드는 중…' : '회사·담당자 이메일 찾는 중…') : '3곳 만들기';
  $('salesLoadingTitle').textContent = phase === 'pack' ? '회사별 한국 샘플과 메일을 만들고 있습니다.' : '업무 이메일까지 확인할 회사를 찾고 있습니다.';
  $('salesLoadingText').textContent = phase === 'pack' ? '한국 잠재고객 3곳 검증 → 메일 본문에 삽입' : '회사 검증 → GTM 담당자 → 업무 이메일';
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

function sampleProspects(sample) {
  return Array.isArray(sample?.prospects) ? sample.prospects.slice(0, 3) : [];
}
function buildPackOutreach(lead, sample) {
  const first = String(lead?.contact?.name || '').trim().split(/\s+/)[0];
  const hello = first ? `Hi ${first},` : 'Hi,';
  const signal = cleanLine(lead?.signal_title || lead?.why_now, 170);
  const accounts = sampleProspects(sample);
  const accountLines = accounts.map((p, i) => {
    const buyer = p.recommended_role || 'business owner';
    const reason = cleanLine(p.buying_signal || p.why_fit, 150);
    return `${i + 1}. ${p.company} — ${buyer}${reason ? `: ${reason}` : ''}`;
  }).join('\n');
  return `${hello}\n\nI noticed ${lead.company}'s recent move: ${signal}.\n\nI mapped 3 Korean accounts I would test first for ${lead.company}:\n\n${accountLines}\n\nThese are based on current public signals, not a generic company list. If this direction looks useful, I can run a small Korea market test: verify the right buyers, localize the outreach, and test demand before you add local headcount.\n\nOpen to trying this as a small Korea pilot?`;
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
    seeds: '', count: 3
  }, 120000);
  const prospects = sampleProspects(sample);
  if (prospects.length !== 3) throw new Error(`${lead.company}: 한국 잠재고객 3곳을 검증하지 못했습니다.`);
  return { ...lead, sample, outreach_en:buildPackOutreach(lead, sample) };
}

async function runSales() {
  const focus = $('salesFocus').value.trim();
  state.salesData = null;
  setSalesBusy(true, 'discover');
  try {
    if (!await checkHealth()) throw new Error('회사 검색·분석·담당자 이메일 연결 상태를 확인해주세요.');
    const runCount = Number(localStorage.getItem(RUN_KEY) || '0') + 1;
    localStorage.setItem(RUN_KEY, String(runCount));
    const d = await requestJson('/api/discover-clients', {
      focus,
      excludeCompanies:readRecent(),
      searchVariant:`${new Date().toISOString().slice(0,10)}-${new Date().getHours() >= 14 ? 'pm' : 'am'}-${runCount}`
    });
    if (!d?.leads?.length) throw new Error('업무 이메일까지 확인된 연락 후보를 찾지 못했습니다.');
    saveRecent(d.leads.map(x => x.company));
    setSalesBusy(true, 'pack');
    const packed = await Promise.allSettled(d.leads.slice(0, 3).map(buildLeadPack));
    const ready = packed.filter(x => x.status === 'fulfilled').map(x => x.value).filter(x => x.contact?.email && sampleProspects(x.sample).length === 3);
    if (!ready.length) throw new Error('담당자 이메일은 찾았지만 한국 샘플까지 완성된 회사가 없었습니다. 다시 실행해주세요.');
    state.salesData = { ...d, leads:ready };
    localStorage.setItem('kpa.sales.result', JSON.stringify(state.salesData));
    renderSales();
  } catch (e) {
    state.salesData = null;
    salesError(e.message || '오늘 보낼 메일 생성에 실패했습니다.');
  } finally {
    setSalesBusy(false);
    if (state.salesData?.leads?.length) {
      $('salesLoading').classList.add('hidden');
      $('salesResults').classList.remove('hidden');
    }
  }
}

function renderSales() {
  const d = state.salesData;
  if (!d) return;
  $('salesEmpty').classList.add('hidden');
  $('salesError').classList.add('hidden');
  $('salesLoading').classList.add('hidden');
  $('salesResults').classList.remove('hidden');
  const leads = (d.leads || []).filter(x => x.contact?.email && sampleProspects(x.sample).length === 3);
  $('salesSummary').innerHTML = `<span><b>${leads.length}곳</b> 메일 준비 완료</span><span>각 메일에 한국 잠재고객 3곳 포함</span>`;
  $('sendAllBtn').disabled = !leads.length;
  $('sendAllBtn').textContent = `${leads.length}곳 메일 보내기`;
  $('salesContent').innerHTML = `<div class="send-list">${leads.map(lead => {
    const c = lead.contact;
    const accounts = sampleProspects(lead.sample);
    return `<article class="send-card">
      <div class="send-head">
        <div><h3>${escapeHtml(lead.company)}</h3><a class="official-link" href="${escapeHtml(safeUrl(lead.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(host(lead.url))}</a></div>
        <a class="send-one" href="${escapeHtml(gmailComposeUrl(lead))}" target="_blank" rel="noopener noreferrer">메일 보내기</a>
      </div>
      <div class="recipient"><span>To</span><strong>${escapeHtml(c.name || roleKo(lead.recommended_role))}</strong><span>${escapeHtml(c.title || roleKo(lead.recommended_role))}</span><a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></div>
      <div class="mail-preview"><span>보낼 메일</span><pre>${escapeHtml(lead.outreach_en || '')}</pre></div>
      <div class="included-accounts"><span>메일에 포함된 한국 3곳</span>${accounts.map((p, i) => `<div><b>${i + 1}</b><strong>${escapeHtml(p.company)}</strong><small>${escapeHtml(roleKo(p.recommended_role))}</small></div>`).join('')}</div>
    </article>`;
  }).join('')}</div>`;
}

function sendAll() {
  const leads = (state.salesData?.leads || []).filter(x => x.contact?.email && sampleProspects(x.sample).length === 3);
  if (!leads.length) return;
  leads.forEach(lead => window.open(gmailComposeUrl(lead), '_blank', 'noopener,noreferrer'));
  const btn = $('sendAllBtn');
  const old = btn.textContent;
  btn.textContent = `Gmail ${leads.length}개 열림`;
  setTimeout(() => { btn.textContent = old; }, 1400);
}

$('diagBtn').addEventListener('click', runDiagnostics);
$('salesRunBtn').addEventListener('click', runSales);
$('sendAllBtn').addEventListener('click', sendAll);
try {
  const d = JSON.parse(localStorage.getItem('kpa.sales.result') || 'null');
  if (d?.leads?.length) { state.salesData = d; renderSales(); }
} catch {}
renderTopics();
checkHealth();
