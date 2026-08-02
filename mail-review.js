(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const IDS_KEY = 'kpa.mail.review.ids';
  const DRAFT_KEY = 'kpa.mail.review.drafts.v4';
  const SENT_PREFIX = 'kpa.gmail.sent.';
  const TEST_RECIPIENT_KEY = 'kpa.mail.test.recipient';
  const DEFAULT_TEST_RECIPIENT = 'treecox19@gmail.com';
  const TEMPLATES = window.KPA_MAIL_TEMPLATES;
  const $ = id => document.getElementById(id);
  const state = { items: [], sending: false, stop: false, gmail: null, timer: null, testIndex: -1 };

  const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const clean = (value = '', max = 12000) => String(value || '').replace(/\r/g, '').trim().slice(0, max);
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const validEmail = value => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean(value, 240));

  function companyName(lead = {}) {
    return clean(lead.company || lead.domain || 'Company', 100).replace(/\s+team$/i, '').trim() || 'Company';
  }
  function companyKey(lead = {}) { return clean(lead.domain || lead.url || lead.contact?.email || '', 500); }
  function contactName(contact = {}) { return clean(contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`, 120); }
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
    const company = companyName(item.lead);
    return {
      subject: typeof template.subject === 'function' ? template.subject(company) : template.subject,
      body: template.body(company),
      translation: template.translation(company)
    };
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
      const item = {
        id: lead.id, lead, contacts: list,
        contactIndex: Math.min(Number(draft.contactIndex || 0), Math.max(0, list.length - 1)),
        included: draft.included !== false,
        templateId: draft.templateId === 'A' ? 'A' : 'B',
        status: 'ready', error: '', countdown: ''
      };
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
    state.items.forEach(item => {
      drafts[item.id] = {
        contactIndex:item.contactIndex, included:item.included, templateId:item.templateId,
        to:item.to, subject:item.subject, body:item.body, translation:item.translation
      };
    });
    save(DRAFT_KEY, drafts);
  }
  function label(item) {
    return item.status === 'sent' ? '발송 완료' : item.status === 'sending' ? '발송 중' : item.status === 'failed' ? '발송 실패' : item.status === 'waiting' ? (item.countdown || '다음 발송 대기') : item.included ? '준비 완료' : '제외';
  }
  function summary() {
    const included = state.items.filter(x => x.included).length;
    const sent = state.items.filter(x => x.status === 'sent').length;
    const failed = state.items.filter(x => x.status === 'failed').length;
    $('reviewSummary').textContent = `${included}개 준비 · ${sent}개 발송${failed ? ` · ${failed}개 실패` : ''}`;
    $('sendAllBtn').disabled = state.sending || !state.items.some(x => x.included && x.status !== 'sent');
    $('testSendBtn').disabled = state.sending || !state.items.some(x => x.included);
    $('stopSendBtn').classList.toggle('hidden', !state.sending);
  }
  function contactOptions(item) {
    if (!item.contacts.length) return '<option>확인된 이메일 없음</option>';
    return item.contacts.map((contact, i) => `<option value="${i}" ${i === item.contactIndex ? 'selected' : ''}>${esc(`${contactName(contact) || contact.title || '담당자'} · ${contact.email}`)}</option>`).join('');
  }
  function render() {
    summary();
    if (!state.items.length) {
      $('mailCards').innerHTML = '<section class="mail-card"><div class="mail-card-body"><strong>준비할 후보가 없습니다.</strong></div></section>';
      return;
    }
    $('mailCards').innerHTML = state.items.map((item, index) => {
      const lead = item.lead;
      const source = /^https?:\/\//i.test(lead.source_url || '') ? lead.source_url : '';
      const company = companyName(lead);
      return `<article class="mail-card ${item.included ? 'selected' : 'excluded'}" data-index="${index}" tabindex="0" aria-pressed="${item.included}">
<header class="mail-card-header">
  <label class="include-toggle"><input type="checkbox" data-action="include" ${item.included ? 'checked' : ''}> 포함</label>
  <div class="company-line"><h2 title="${esc(company)}">${esc(company)}</h2><span class="company-meta">${esc(lead.domain || '')}${source ? ` · <a href="${esc(source)}" target="_blank" rel="noopener noreferrer">근거</a>` : ''}</span></div>
  <span class="send-state ${item.status}">${esc(label(item))}</span>
</header>
<div class="mail-card-body">
  <section class="mail-top-fields">
    <div class="field"><label>담당자</label><select data-action="contact">${contactOptions(item)}</select>${item.contacts.length ? '' : '<span class="error-text">수신 주소 없음</span>'}</div>
    <div class="field"><label>발송 주소</label><input data-action="to" value="${esc(item.to)}" placeholder="name@company.com"></div>
    <div class="field"><label>제목</label><input data-action="subject" value="${esc(item.subject)}"></div>
    <div class="field"><label>메일 유형</label><div class="template-switch"><button type="button" data-template="A" class="${item.templateId === 'A' ? 'active' : ''}">A · 신뢰형</button><button type="button" data-template="B" class="${item.templateId === 'B' ? 'active' : ''}">B · 문제해결형</button></div></div>
  </section>
  <section class="mail-editor-grid">
    <div class="field body-field"><label>영문 본문</label><textarea data-action="body">${esc(item.body)}</textarea></div>
    <div class="field translation-field"><label>한글 확인</label><textarea data-action="translation">${esc(item.translation)}</textarea></div>
  </section>
  ${(item.error || item.countdown) ? `<div class="card-messages">${item.error ? `<span class="error-text">${esc(item.error)}</span>` : ''}${item.countdown ? `<span class="countdown">${esc(item.countdown)}</span>` : ''}</div>` : ''}
</div></article>`;
    }).join('');
  }
  function eventItem(event) {
    const card = event.target.closest('.mail-card');
    return card ? state.items[Number(card.dataset.index)] : null;
  }
  function isInteractive(target) {
    return Boolean(target.closest('button,input,select,textarea,a,label,[contenteditable="true"]'));
  }
  function toggleCard(card, item) {
    if (!item || state.sending || item.status === 'sent') return;
    item.included = !item.included;
    persist();
    render();
  }

  $('mailCards').addEventListener('click', event => {
    const item = eventItem(event);
    if (!item) return;
    const templateButton = event.target.closest('[data-template]');
    if (templateButton && !state.sending) {
      applyTemplate(item, templateButton.dataset.template);
      persist(); render(); return;
    }
    if (!isInteractive(event.target)) toggleCard(event.target.closest('.mail-card'), item);
  });
  $('mailCards').addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && !isInteractive(event.target)) {
      event.preventDefault();
      toggleCard(event.target.closest('.mail-card'), eventItem(event));
    }
  });
  $('mailCards').addEventListener('change', event => {
    const item = eventItem(event);
    if (!item || state.sending) return;
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
    const item = eventItem(event);
    if (!item || state.sending) return;
    const action = event.target.dataset.action;
    if (['to','subject','body','translation'].includes(action)) item[action] = event.target.value;
    persist();
  });

  async function json(response) {
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }
  async function gmailStatus(force = false) {
    if (state.gmail && !force) return state.gmail;
    state.gmail = await json(await fetch(`/api/gmail?action=status&t=${Date.now()}`, { cache:'no-store', credentials:'same-origin' }));
    return state.gmail;
  }
  function connectGmail() { location.href = `/api/gmail?action=auth&return=${encodeURIComponent(location.pathname + location.search)}`; }
  function paintGmailStatus(status) {
    const button = $('gmailConnectBtn');
    const connected = Boolean(status?.connected);
    button.classList.toggle('connected', connected);
    button.textContent = connected ? 'Gmail 연결됨' : 'Gmail 연결 설정';
  }
  async function ensureGmail() {
    try {
      const status = await gmailStatus(true);
      paintGmailStatus(status);
      if (!status.configured) { alert('Google OAuth 설정이 필요합니다.'); return false; }
      if (!status.connected) { if (confirm('이 PC에서 Gmail을 연결할까요?')) connectGmail(); return false; }
      return true;
    } catch (error) { alert(`Gmail 상태 확인 실패: ${error.message}`); return false; }
  }
  $('gmailConnectBtn').addEventListener('click', async () => {
    const status = await gmailStatus(true).catch(() => null);
    if (status?.connected) { paintGmailStatus(status); return; }
    connectGmail();
  });

  function validate(item) {
    if (!validEmail(item.to)) return '받는 이메일 주소를 확인해주세요.';
    if (clean(item.subject, 240).length < 4) return '메일 제목이 너무 짧습니다.';
    if (clean(item.body).length < 60) return '메일 본문이 너무 짧습니다.';
    return '';
  }
  function htmlEmail(body) {
    const paragraphs = String(body || '').split(/\n{2,}/).map(part => part.trim()).filter(Boolean);
    const html = paragraphs.map(part => `<p style="margin:0 0 16px 0;">${esc(part).replace(/\n/g, '<br>')}</p>`).join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0;padding:0;background:#ffffff;"><tr><td align="left"><table role="presentation" width="580" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:580px;margin:0;"><tr><td style="box-sizing:border-box;padding:0 18px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111827;">${html}</td></tr></table></td></tr></table>`;
  }
  async function postEmail(to, subject, body, company = '') {
    const response = await fetch('/api/gmail', {
      method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', cache:'no-store',
      body:JSON.stringify({ to:to.trim(), subject:subject.trim(), body:body.trim(), html:htmlEmail(body), companyKey:clean(company, 500) })
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || data.code === 'GMAIL_RECONNECT_REQUIRED') throw new Error('Gmail 연결이 만료되었습니다.');
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }
  async function send(item) {
    const data = await postEmail(item.to, item.subject, item.body, companyKey(item.lead));
    localStorage.setItem(sentKey(item), new Date().toISOString());
    if (data.historySaved === false) item.error = data.historyWarning || '메일은 발송됐지만 발송 이력 저장에 실패했습니다.';
  }

  function openTestDialog() {
    const selected = state.items.map((item, index) => ({ item, index })).filter(x => x.item.included);
    if (!selected.length) { alert('테스트할 회사를 선택해주세요.'); return; }
    $('testCompany').innerHTML = selected.map(({item,index}) => `<option value="${index}">${esc(companyName(item.lead))} · ${esc(item.templateId)}</option>`).join('');
    state.testIndex = selected[0].index;
    $('testRecipient').value = localStorage.getItem(TEST_RECIPIENT_KEY) || DEFAULT_TEST_RECIPIENT;
    $('testMailContext').textContent = `${companyName(selected[0].item.lead)} · 제목 앞에 [TEST]가 붙습니다.`;
    $('testSendDialog').showModal();
  }
  $('testSendBtn').addEventListener('click', openTestDialog);
  $('testCompany').addEventListener('change', event => {
    state.testIndex = Number(event.target.value);
    const item = state.items[state.testIndex];
    $('testMailContext').textContent = `${companyName(item.lead)} · 제목 앞에 [TEST]가 붙습니다.`;
  });
  async function sendTest() {
    const item = state.items[state.testIndex];
    const to = clean($('testRecipient').value, 240);
    if (!item || !validEmail(to)) { alert('테스트 수신 주소를 확인해주세요.'); return; }
    item.error = validate(item);
    if (item.error) { render(); $('testSendDialog').close(); return; }
    if (!await ensureGmail()) return;
    const button = $('confirmTestSend');
    button.disabled = true; button.textContent = '발송 중…';
    try {
      await postEmail(to, `[TEST] ${item.subject}`, item.body, companyKey(item.lead));
      localStorage.setItem(TEST_RECIPIENT_KEY, to);
      $('testSendDialog').close();
      alert(`테스트 메일을 ${to}로 보냈습니다.`);
    } catch (error) { alert(`테스트 발송 실패: ${error.message || '알 수 없는 오류'}`); }
    finally { button.disabled = false; button.textContent = '테스트 발송'; }
  }
  $('confirmTestSend').addEventListener('click', sendTest);

  function wait(ms, next) {
    return new Promise(resolve => {
      const end = Date.now() + ms; next.status = 'waiting';
      const tick = () => {
        const seconds = Math.max(0, Math.ceil((end - Date.now()) / 1000));
        next.countdown = `다음 발송까지 ${Math.floor(seconds / 60)}분 ${seconds % 60}초`; render();
        if (state.stop || seconds <= 0) {
          clearInterval(state.timer); state.timer = null; next.countdown = '';
          if (next.status === 'waiting') next.status = 'ready'; resolve();
        }
      };
      tick(); state.timer = setInterval(tick, 1000);
    });
  }
  async function sendAll() {
    if (state.sending) return;
    const queue = state.items.filter(x => x.included && x.status !== 'sent');
    let invalid = false;
    queue.forEach(item => { item.error = validate(item); if (item.error) invalid = true; });
    if (invalid) { render(); alert('오류가 표시된 메일을 확인해주세요.'); return; }
    if (!await ensureGmail()) return;
    if (!confirm(`${queue.length}개의 실제 메일을 60~180초 간격으로 발송합니다. 진행할까요?`)) return;
    state.sending = true; state.stop = false; $('stopSendBtn').disabled = false; render();
    for (let i = 0; i < queue.length; i += 1) {
      if (state.stop) break;
      const item = queue[i]; item.status = 'sending'; item.error = ''; render();
      try { await send(item); item.status = 'sent'; }
      catch (error) { item.status = 'failed'; item.error = error.message || '발송 오류'; }
      persist(); render();
      if (queue[i + 1] && !state.stop) await wait(60_000 + Math.floor(Math.random() * 120_001), queue[i + 1]);
    }
    state.sending = false; state.stop = false; $('stopSendBtn').disabled = false; render();
  }
  $('sendAllBtn').addEventListener('click', sendAll);
  $('stopSendBtn').addEventListener('click', () => { state.stop = true; $('stopSendBtn').disabled = true; $('stopSendBtn').textContent = '중지 요청됨'; });
  window.addEventListener('beforeunload', event => { if (state.sending) { event.preventDefault(); event.returnValue = ''; } });

  build(); render();
  gmailStatus().then(paintGmailStatus).catch(() => paintGmailStatus(null));
})();
