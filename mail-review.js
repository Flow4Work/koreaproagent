(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const IDS_KEY = 'kpa.mail.review.ids';
  const DRAFT_KEY = 'kpa.mail.review.drafts.v2';
  const SENT_PREFIX = 'kpa.gmail.sent.';
  const TEMPLATES = window.KPA_MAIL_TEMPLATES;
  const $ = id => document.getElementById(id);
  const state = { items: [], sending: false, stop: false, gmail: null, timer: null };

  const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const clean = (value = '', max = 12000) => String(value || '').replace(/\r/g, '').trim().slice(0, max);
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const validEmail = value => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean(value, 240));

  function contactName(contact = {}) { return clean(contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`, 120); }
  function firstName(contact = {}, lead = {}) {
    return clean(contact.first_name, 60) || contactName(contact).split(/\s+/)[0] || `${clean(lead.company, 80) || 'Company'} team`;
  }
  function contacts(lead = {}) {
    const seen = new Set();
    return [lead.contact, ...(lead.contacts || [])].filter(Boolean).filter(contact => {
      const email = clean(contact.email, 240).toLowerCase();
      if (!validEmail(email) || seen.has(email)) return false;
      seen.add(email); return true;
    }).slice(0, 4);
  }
  function hash(value = '') {
    let h = 2166136261;
    for (let i = 0; i < value.length; i += 1) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  const sentKey = item => `${SENT_PREFIX}${hash(`${item.to}|${item.subject}|${item.body}`)}`;

  function templateData(templateId, item) {
    const template = TEMPLATES[templateId] || TEMPLATES.B;
    const contact = item.contacts[item.contactIndex] || {};
    const name = firstName(contact, item.lead);
    return { subject: template.subject, body: template.body(name), translation: template.translation(name) };
  }
  function applyTemplate(item, templateId) {
    item.templateId = templateId;
    Object.assign(item, templateData(templateId, item));
    if (item.status !== 'sent') item.status = 'ready';
    item.error = '';
  }
  function build() {
    const leads = load(LEADS_KEY, []);
    const ids = load(IDS_KEY, []);
    const drafts = load(DRAFT_KEY, {});
    const byId = new Map(leads.map(lead => [lead.id, lead]));
    state.items = ids.map(id => byId.get(id)).filter(Boolean).map(lead => {
      const list = contacts(lead);
      const draft = drafts[lead.id] || {};
      const item = { id: lead.id, lead, contacts: list, contactIndex: Math.min(Number(draft.contactIndex || 0), Math.max(0, list.length - 1)), included: draft.included !== false, templateId: draft.templateId === 'A' ? 'A' : 'B', status: 'ready', error: '', countdown: '' };
      const defaults = templateData(item.templateId, item);
      item.to = clean(draft.to || list[item.contactIndex]?.email, 240);
      item.subject = clean(draft.subject || defaults.subject, 240);
      item.body = clean(draft.body || defaults.body);
      item.translation = clean(draft.translation || defaults.translation);
      if (localStorage.getItem(sentKey(item))) item.status = 'sent';
      return item;
    });
  }
  function persist() {
    const drafts = {};
    state.items.forEach(item => { drafts[item.id] = { contactIndex:item.contactIndex, included:item.included, templateId:item.templateId, to:item.to, subject:item.subject, body:item.body, translation:item.translation }; });
    save(DRAFT_KEY, drafts);
  }
  function label(item) {
    return item.status === 'sent' ? '발송 완료' : item.status === 'sending' ? '발송 중' : item.status === 'failed' ? '발송 실패' : item.status === 'waiting' ? (item.countdown || '다음 발송 대기') : item.included ? '준비 완료' : '이번 발송 제외';
  }
  function summary() {
    const included = state.items.filter(x => x.included).length;
    const sent = state.items.filter(x => x.status === 'sent').length;
    const failed = state.items.filter(x => x.status === 'failed').length;
    $('reviewSummary').textContent = `준비 ${included}개 · 발송 완료 ${sent}개${failed ? ` · 실패 ${failed}개` : ''}`;
    $('sendAllBtn').disabled = state.sending || !state.items.some(x => x.included && x.status !== 'sent');
    $('applyAllA').disabled = state.sending; $('applyAllB').disabled = state.sending;
    $('stopSendBtn').classList.toggle('hidden', !state.sending);
  }
  function contactOptions(item) {
    if (!item.contacts.length) return '<option>확인된 이메일 없음</option>';
    return item.contacts.map((contact, i) => `<option value="${i}" ${i === item.contactIndex ? 'selected' : ''}>${esc(`${contactName(contact) || contact.title || '담당자'} · ${contact.email}`)}</option>`).join('');
  }
  function render() {
    summary();
    if (!state.items.length) { $('mailCards').innerHTML = '<section class="mail-card"><div class="mail-card-body"><strong>준비할 후보가 없습니다.</strong><a href="/">후보 목록으로 돌아가기</a></div></section>'; return; }
    $('mailCards').innerHTML = state.items.map((item, index) => {
      const lead = item.lead;
      const source = /^https?:\/\//i.test(lead.source_url || '') ? lead.source_url : '';
      return `<article class="mail-card ${item.included ? '' : 'excluded'}" data-index="${index}">
<header class="mail-card-header"><label class="include-toggle"><input type="checkbox" data-action="include" ${item.included ? 'checked' : ''}> 발송 포함</label><div><h2>${esc(lead.company || lead.domain || '회사명 미확인')}</h2><div class="company-meta">${esc(lead.domain || '')}${source ? ` · <a href="${esc(source)}" target="_blank" rel="noopener noreferrer">근거 보기</a>` : ''}</div></div><span class="send-state ${item.status}">${esc(label(item))}</span></header>
<div class="mail-card-body"><section class="mail-settings">
<div class="field"><label>받는 담당자와 메일 주소</label><select data-action="contact">${contactOptions(item)}</select>${item.contacts.length ? '' : '<span class="error-text">확인된 수신 주소가 없습니다.</span>'}</div>
<div class="field"><label>실제 발송 주소</label><input data-action="to" value="${esc(item.to)}" placeholder="name@company.com"></div>
<div class="field"><label>메일 유형</label><div class="template-switch"><button type="button" data-template="A" class="${item.templateId === 'A' ? 'active' : ''}">A · 신뢰 설명형</button><button type="button" data-template="B" class="${item.templateId === 'B' ? 'active' : ''}">B · 압축 영업형</button></div></div>
<div class="fact-note">TGE·투자·파트너십·KBW 참가 여부는 본문에 자동으로 넣지 않습니다. 개인화 근거가 없어도 후보와 이메일은 유지하고 A/B 기본형으로 발송합니다.</div>${item.error ? `<div class="error-text">${esc(item.error)}</div>` : ''}${item.countdown ? `<div class="countdown">${esc(item.countdown)}</div>` : ''}</section>
<section class="mail-editor"><div class="field"><label>제목</label><input data-action="subject" value="${esc(item.subject)}"></div><div class="field body-field"><label>영문 본문 · 직접 수정 가능</label><textarea data-action="body">${esc(item.body)}</textarea></div><div class="field translation-field"><label>한글 해석 · 검토용</label><textarea data-action="translation">${esc(item.translation)}</textarea></div></section></div></article>`;
    }).join('');
  }
  function eventItem(event) { const card = event.target.closest('.mail-card'); return card ? state.items[Number(card.dataset.index)] : null; }

  $('mailCards').addEventListener('click', event => {
    const button = event.target.closest('[data-template]');
    if (!button || state.sending) return;
    const item = eventItem(event); if (!item) return;
    applyTemplate(item, button.dataset.template); persist(); render();
  });
  $('mailCards').addEventListener('change', event => {
    const item = eventItem(event); if (!item || state.sending) return;
    const action = event.target.dataset.action;
    if (action === 'include') item.included = event.target.checked;
    if (action === 'contact') {
      item.contactIndex = Number(event.target.value || 0);
      item.to = clean(item.contacts[item.contactIndex]?.email, 240);
      applyTemplate(item, item.templateId);
    }
    persist(); render();
  });
  $('mailCards').addEventListener('input', event => {
    const item = eventItem(event); if (!item || state.sending) return;
    const action = event.target.dataset.action;
    if (['to','subject','body','translation'].includes(action)) item[action] = event.target.value;
    persist();
  });
  function applyAll(id) { state.items.filter(x => x.included && x.status !== 'sent').forEach(x => applyTemplate(x, id)); persist(); render(); }
  $('applyAllA').addEventListener('click', () => applyAll('A'));
  $('applyAllB').addEventListener('click', () => applyAll('B'));

  async function json(response) { const text = await response.text(); let data = {}; try { data = text ? JSON.parse(text) : {}; } catch {} if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`); return data; }
  async function gmailStatus(force = false) {
    if (state.gmail && !force) return state.gmail;
    state.gmail = await json(await fetch(`/api/email/status?t=${Date.now()}`, { cache:'no-store', credentials:'same-origin' }));
    return state.gmail;
  }
  function connectGmail() { location.href = `/api/email/auth-start?return=${encodeURIComponent(location.pathname + location.search)}`; }
  async function ensureGmail() {
    try {
      const status = await gmailStatus(true);
      if (!status.configured) { alert('Google OAuth 설정이 필요합니다.'); return false; }
      if (!status.connected) { if (confirm('NYF Gmail을 연결할까요?')) connectGmail(); return false; }
      $('gmailConnectBtn').textContent = `${status.sender?.email || 'NYF Gmail'} 연결됨`; return true;
    } catch (error) { alert(`Gmail 상태 확인 실패: ${error.message}`); return false; }
  }
  $('gmailConnectBtn').addEventListener('click', ensureGmail);

  function validate(item) {
    if (!validEmail(item.to)) return '받는 이메일 주소를 확인해주세요.';
    if (clean(item.subject, 240).length < 4) return '메일 제목이 너무 짧습니다.';
    if (clean(item.body).length < 80) return '메일 본문이 너무 짧습니다.';
    return '';
  }
  async function send(item) {
    const response = await fetch('/api/email/send', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', cache:'no-store', body:JSON.stringify({to:item.to.trim(), subject:item.subject.trim(), body:item.body.trim()}) });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || data.code === 'GMAIL_RECONNECT_REQUIRED') throw new Error('Gmail 연결이 만료되었습니다.');
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    localStorage.setItem(sentKey(item), new Date().toISOString());
  }
  function wait(ms, next) {
    return new Promise(resolve => {
      const end = Date.now() + ms; next.status = 'waiting';
      const tick = () => {
        const seconds = Math.max(0, Math.ceil((end - Date.now()) / 1000));
        next.countdown = `다음 발송까지 ${Math.floor(seconds / 60)}분 ${seconds % 60}초`; render();
        if (state.stop || seconds <= 0) { clearInterval(state.timer); state.timer = null; next.countdown = ''; if (next.status === 'waiting') next.status = 'ready'; resolve(); }
      };
      tick(); state.timer = setInterval(tick, 1000);
    });
  }
  async function sendAll() {
    if (state.sending) return;
    const queue = state.items.filter(x => x.included && x.status !== 'sent');
    let invalid = false; queue.forEach(item => { item.error = validate(item); if (item.error) invalid = true; });
    if (invalid) { render(); alert('오류가 표시된 메일을 확인해주세요.'); return; }
    if (!await ensureGmail()) return;
    if (!confirm(`${queue.length}개의 실제 메일을 60~180초 간격으로 발송합니다. 진행할까요?`)) return;
    state.sending = true; state.stop = false; $('stopSendBtn').disabled = false; $('stopSendBtn').textContent = '발송 중지'; render();
    for (let i = 0; i < queue.length; i += 1) {
      if (state.stop) break;
      const item = queue[i]; item.status = 'sending'; item.error = ''; render();
      try { await send(item); item.status = 'sent'; } catch (error) { item.status = 'failed'; item.error = error.message || '발송 오류'; }
      persist(); render();
      if (queue[i + 1] && !state.stop) await wait(60_000 + Math.floor(Math.random() * 120_001), queue[i + 1]);
    }
    state.sending = false; state.stop = false; $('stopSendBtn').disabled = false; $('stopSendBtn').textContent = '발송 중지'; render();
  }
  $('sendAllBtn').addEventListener('click', sendAll);
  $('stopSendBtn').addEventListener('click', () => { state.stop = true; $('stopSendBtn').disabled = true; $('stopSendBtn').textContent = '중지 요청됨'; });
  window.addEventListener('beforeunload', event => { if (state.sending) { event.preventDefault(); event.returnValue = ''; } });

  build(); render();
  gmailStatus().then(status => { $('gmailConnectBtn').textContent = status.connected ? `${status.sender?.email || 'NYF Gmail'} 연결됨` : 'Gmail 연결'; }).catch(() => {});
})();
