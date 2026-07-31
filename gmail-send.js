(() => {
  const SENT_PREFIX = 'kpa.gmail.sent.';
  const TEST_EMAIL_KEY = 'kpa.gmail.testEmail';
  const TEST_MODE_KEY = 'kpa.gmail.testMode';
  let statusCache = null;

  function validEmail(value = '') {
    return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(value || '').trim());
  }

  function hash(value = '') {
    let h = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function payloadFromLink(anchor) {
    try {
      const url = new URL(anchor.href, location.origin);
      return {
        to: (url.searchParams.get('to') || '').trim(),
        subject: (url.searchParams.get('su') || '').trim(),
        body: url.searchParams.get('body') || ''
      };
    } catch {
      return { to:'', subject:'', body:'' };
    }
  }

  function sentKey(payload) {
    return `${SENT_PREFIX}${hash(`${payload.to}|${payload.subject}|${payload.body}`)}`;
  }

  function testConfig() {
    return {
      enabled: localStorage.getItem(TEST_MODE_KEY) === '1',
      email: (localStorage.getItem(TEST_EMAIL_KEY) || '').trim()
    };
  }

  function markSent(anchor, payload) {
    localStorage.setItem(sentKey(payload), new Date().toISOString());
    anchor.textContent = '발송 완료';
    anchor.classList.add('gmail-sent');
    anchor.setAttribute('aria-disabled', 'true');
  }

  function setButtonLabel(anchor) {
    if (!anchor || anchor.classList.contains('gmail-sent') || anchor.classList.contains('gmail-sending')) return;
    anchor.textContent = testConfig().enabled ? '테스트 발송' : '승인 및 발송';
  }

  function upgrade(anchor) {
    if (!anchor) return;
    if (anchor.dataset.gmailAutomation !== '1') {
      anchor.dataset.gmailAutomation = '1';
      anchor.removeAttribute('target');
      anchor.removeAttribute('rel');
      const payload = payloadFromLink(anchor);
      if (localStorage.getItem(sentKey(payload))) markSent(anchor, payload);
    }
    setButtonLabel(anchor);
  }

  function upgradeAll(root = document) {
    root.querySelectorAll?.('a.mail-btn').forEach(upgrade);
  }

  async function gmailStatus(force = false) {
    if (statusCache && !force) return statusCache;
    const response = await fetch(`/api/gmail?action=status&t=${Date.now()}`, { cache:'no-store', credentials:'same-origin' });
    statusCache = await response.json().catch(() => ({ configured:false, connected:false }));
    return statusCache;
  }

  function connectGmail() {
    const returnTo = `${location.pathname}${location.search}`;
    location.href = `/api/gmail?action=auth&return=${encodeURIComponent(returnTo)}`;
  }

  function showOAuthResult() {
    const url = new URL(location.href);
    const result = url.searchParams.get('gmail');
    if (!result) return;
    const messages = {
      connected: 'NYF Gmail 연결 완료. 이제 승인 및 발송을 누르면 실제 메일이 나갑니다.',
      wrong_account: 'business@notyourflavor.com 계정으로 로그인해주세요.',
      cancelled: 'Gmail 연결이 취소되었습니다.',
      refresh_token_missing: 'Gmail 장기 연결 토큰을 받지 못했습니다. 다시 연결해주세요.',
      state_error: 'Gmail 연결 요청이 만료되었습니다. 다시 시도해주세요.',
      code_error: 'Google 인증 코드를 받지 못했습니다.',
      oauth_error: 'Gmail 연결 중 오류가 발생했습니다.',
      not_configured: 'Google OAuth 설정이 아직 완료되지 않았습니다.'
    };
    if (messages[result]) alert(messages[result]);
    if (result === 'connected') statusCache = { configured:true, connected:true };
    url.searchParams.delete('gmail');
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  async function ensureConnected() {
    let status;
    try { status = await gmailStatus(); }
    catch { alert('Gmail 연결 상태를 확인하지 못했습니다.'); return null; }

    if (!status.configured) {
      alert('Google OAuth 설정이 아직 필요합니다. Client ID / Secret / Session Secret을 Vercel에 등록한 뒤 연결하면 됩니다.');
      return null;
    }
    if (!status.connected) {
      if (confirm('NYF Gmail을 먼저 연결할까요? 연결 후 다시 시도해주세요.')) connectGmail();
      return null;
    }
    return status;
  }

  async function postMail(payload) {
    const response = await fetch('/api/gmail', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      credentials:'same-origin',
      cache:'no-store',
      body:JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || data.code === 'GMAIL_RECONNECT_REQUIRED') {
      statusCache = { configured:true, connected:false };
      const error = new Error('Gmail 연결이 만료되었습니다.');
      error.code = 'GMAIL_RECONNECT_REQUIRED';
      throw error;
    }
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function refreshTestUi() {
    const config = testConfig();
    const button = document.getElementById('gmailTestBtn');
    const banner = document.getElementById('gmailTestBanner');
    const input = document.getElementById('gmailTestEmail');
    const toggle = document.getElementById('gmailTestModeToggle');
    if (input && document.activeElement !== input) input.value = config.email;
    if (toggle) toggle.checked = config.enabled;
    if (button) {
      button.textContent = config.enabled ? '🧪 테스트 ON' : '메일 테스트';
      button.classList.toggle('gmail-test-on', config.enabled);
    }
    if (banner) {
      banner.classList.toggle('hidden', !config.enabled);
      const emailNode = banner.querySelector('[data-test-email]');
      if (emailNode) emailNode.textContent = config.email || '테스트 이메일 미설정';
    }
    upgradeAll();
  }

  function setTestMode(enabled, email = '') {
    const normalized = String(email || '').trim();
    if (enabled && !validEmail(normalized)) {
      alert('테스트 받을 이메일 주소를 먼저 입력해주세요.');
      return false;
    }
    if (normalized) localStorage.setItem(TEST_EMAIL_KEY, normalized);
    if (enabled) localStorage.setItem(TEST_MODE_KEY, '1');
    else localStorage.removeItem(TEST_MODE_KEY);
    refreshTestUi();
    return true;
  }

  async function handleSend(anchor) {
    if (anchor.classList.contains('gmail-sent') || anchor.classList.contains('gmail-sending')) return;
    const originalPayload = payloadFromLink(anchor);
    if (!originalPayload.to || !originalPayload.subject || !originalPayload.body) {
      alert('발송할 메일 정보가 부족합니다.');
      return;
    }

    const status = await ensureConnected();
    if (!status) return;

    const config = testConfig();
    let payload = originalPayload;
    if (config.enabled) {
      if (!validEmail(config.email)) {
        alert('테스트 받을 이메일 주소가 올바르지 않습니다. 메일 테스트에서 다시 설정해주세요.');
        openTestPanel();
        return;
      }
      payload = { ...originalPayload, to:config.email };
    }

    const sender = status.sender?.email || 'business@notyourflavor.com';
    const question = config.enabled
      ? `테스트 모드입니다.\n\n원래 수신자: ${originalPayload.to}\n실제 수신자: ${config.email}\nFrom: NYF <${sender}>\n\n원래 업체에는 발송되지 않습니다. 테스트 메일을 보낼까요?`
      : `${payload.to} 으로 실제 메일을 발송합니다.\n\nFrom: NYF <${sender}>\n\n발송할까요?`;
    if (!confirm(question)) return;

    const originalText = anchor.textContent;
    anchor.textContent = config.enabled ? '테스트 발송 중…' : '발송 중…';
    anchor.setAttribute('aria-disabled', 'true');
    anchor.classList.add('gmail-sending');

    try {
      await postMail(payload);
      if (config.enabled) {
        anchor.textContent = '테스트 성공 ✓';
        setTimeout(() => {
          anchor.removeAttribute('aria-disabled');
          anchor.classList.remove('gmail-sending');
          setButtonLabel(anchor);
        }, 1800);
      } else {
        markSent(anchor, originalPayload);
      }
    } catch (error) {
      anchor.textContent = originalText || (config.enabled ? '테스트 발송' : '승인 및 발송');
      anchor.removeAttribute('aria-disabled');
      if (error.code === 'GMAIL_RECONNECT_REQUIRED') {
        if (confirm('Gmail 연결이 만료되었습니다. 다시 연결할까요?')) connectGmail();
        return;
      }
      alert(`메일 발송 실패: ${error.message || '알 수 없는 오류'}`);
    } finally {
      if (!config.enabled) anchor.classList.remove('gmail-sending');
    }
  }

  async function sendSmokeTest() {
    const input = document.getElementById('gmailTestEmail');
    const button = document.getElementById('gmailSmokeSend');
    const email = String(input?.value || '').trim();
    if (!validEmail(email)) {
      alert('테스트 받을 이메일 주소를 확인해주세요.');
      return;
    }
    localStorage.setItem(TEST_EMAIL_KEY, email);
    const status = await ensureConnected();
    if (!status) return;
    if (!confirm(`${email} 으로 NYF Gmail 연결 테스트 메일 1통을 보낼까요?`)) return;

    const previous = button?.textContent || '연결 테스트 1통 보내기';
    if (button) { button.disabled = true; button.textContent = '테스트 중…'; }
    try {
      await postMail({
        to: email,
        subject: 'NYF Gmail 연결 테스트',
        body: `KoreaProAgent Gmail 발송 테스트입니다.\n\nFrom: NYF <${status.sender?.email || 'business@notyourflavor.com'}>\n연결과 실제 Gmail API 발송이 정상입니다.`
      });
      alert(`${email} 으로 테스트 메일을 보냈습니다. 받은편지함과 NYF 보낸편지함을 확인해주세요.`);
    } catch (error) {
      if (error.code === 'GMAIL_RECONNECT_REQUIRED') {
        if (confirm('Gmail 연결이 만료되었습니다. 다시 연결할까요?')) connectGmail();
        return;
      }
      alert(`테스트 메일 실패: ${error.message || '알 수 없는 오류'}`);
    } finally {
      if (button) { button.disabled = false; button.textContent = previous; }
    }
  }

  function openTestPanel() {
    const panel = document.getElementById('gmailTestPanel');
    if (!panel) return;
    panel.classList.remove('hidden');
    refreshTestUi();
    gmailStatus(true).then(status => {
      const node = document.getElementById('gmailTestStatus');
      if (!node) return;
      if (!status.configured) node.textContent = 'Gmail 설정 필요';
      else if (!status.connected) node.textContent = 'Gmail 연결 필요';
      else node.textContent = `NYF 연결됨 · ${status.sender?.email || 'business@notyourflavor.com'}`;
    }).catch(() => {});
  }

  function closeTestPanel() {
    document.getElementById('gmailTestPanel')?.classList.add('hidden');
  }

  function installTestUi() {
    if (document.getElementById('gmailTestBtn')) return;
    const tools = document.querySelector('.topbar .tools');
    if (tools) {
      const button = document.createElement('button');
      button.id = 'gmailTestBtn';
      button.className = 'ghost';
      button.type = 'button';
      button.textContent = '메일 테스트';
      button.addEventListener('click', openTestPanel);
      tools.insertBefore(button, tools.querySelector('#settingsBtn') || null);
    }

    const shell = document.querySelector('.shell') || document.body;
    const banner = document.createElement('div');
    banner.id = 'gmailTestBanner';
    banner.className = 'gmail-test-banner hidden';
    banner.innerHTML = `<strong>🧪 TEST MODE</strong><span>모든 발송은 <b data-test-email></b> 로만 전송됩니다. 업체 주소에는 발송되지 않습니다.</span><button type="button" data-test-off>테스트 모드 끄기</button>`;
    const topbar = shell.querySelector('.topbar');
    if (topbar?.nextSibling) shell.insertBefore(banner, topbar.nextSibling);
    else shell.appendChild(banner);
    banner.querySelector('[data-test-off]')?.addEventListener('click', () => setTestMode(false));

    const panel = document.createElement('div');
    panel.id = 'gmailTestPanel';
    panel.className = 'gmail-test-panel hidden';
    panel.innerHTML = `
      <div class="gmail-test-card">
        <div class="gmail-test-head"><div><strong>메일 테스트</strong><small id="gmailTestStatus">Gmail 상태 확인 중…</small></div><button type="button" data-test-close>×</button></div>
        <label>테스트 받을 이메일<input id="gmailTestEmail" type="email" placeholder="내 이메일 주소" autocomplete="email"></label>
        <label class="gmail-test-toggle"><input id="gmailTestModeToggle" type="checkbox"><span><b>테스트 모드</b><small>ON이면 후보의 원래 업체 주소를 막고 위 테스트 이메일로만 발송합니다.</small></span></label>
        <div class="gmail-test-actions"><button type="button" id="gmailSmokeSend" class="ghost">연결 테스트 1통 보내기</button><button type="button" id="gmailTestSave" class="primary">저장</button></div>
      </div>`;
    document.body.appendChild(panel);

    panel.querySelector('[data-test-close]')?.addEventListener('click', closeTestPanel);
    panel.addEventListener('click', event => { if (event.target === panel) closeTestPanel(); });
    document.getElementById('gmailSmokeSend')?.addEventListener('click', sendSmokeTest);
    document.getElementById('gmailTestSave')?.addEventListener('click', () => {
      const email = String(document.getElementById('gmailTestEmail')?.value || '').trim();
      const enabled = Boolean(document.getElementById('gmailTestModeToggle')?.checked);
      if (!email || !validEmail(email)) { alert('테스트 받을 이메일 주소를 확인해주세요.'); return; }
      localStorage.setItem(TEST_EMAIL_KEY, email);
      if (!setTestMode(enabled, email)) return;
      closeTestPanel();
    });
    refreshTestUi();
  }

  document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a.mail-btn');
    if (!anchor) return;
    event.preventDefault();
    event.stopPropagation();
    handleSend(anchor);
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .mail-btn.gmail-sending { opacity:.7; pointer-events:none; }
    .mail-btn.gmail-sent { opacity:.65; pointer-events:none; filter:saturate(.4); }
    #gmailTestBtn.gmail-test-on { background:#fff3b0; border-color:#e6b800; color:#7a5a00; }
    .gmail-test-banner { display:flex; align-items:center; gap:12px; padding:10px 48px; background:#fff3b0; border-bottom:1px solid #ead267; font-size:13px; color:#5d4800; }
    .gmail-test-banner.hidden { display:none; }
    .gmail-test-banner span { flex:1; }
    .gmail-test-banner button { border:1px solid #b88d00; background:#fff9db; border-radius:8px; padding:6px 10px; cursor:pointer; }
    .gmail-test-panel { position:fixed; inset:0; z-index:10000; display:grid; place-items:center; background:rgba(17,24,39,.38); padding:20px; }
    .gmail-test-panel.hidden { display:none; }
    .gmail-test-card { width:min(520px,100%); background:#fff; border-radius:16px; box-shadow:0 24px 80px rgba(0,0,0,.24); padding:20px; display:grid; gap:16px; }
    .gmail-test-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
    .gmail-test-head > div { display:grid; gap:4px; }
    .gmail-test-head strong { font-size:18px; }
    .gmail-test-head small { color:#6b7280; }
    .gmail-test-head > button { border:0; background:transparent; font-size:26px; cursor:pointer; line-height:1; }
    .gmail-test-card > label:not(.gmail-test-toggle) { display:grid; gap:7px; font-size:13px; font-weight:700; }
    #gmailTestEmail { width:100%; box-sizing:border-box; border:1px solid #d1d5db; border-radius:10px; padding:11px 12px; font:inherit; }
    .gmail-test-toggle { display:flex; align-items:flex-start; gap:10px; padding:12px; border:1px solid #e5e7eb; border-radius:12px; cursor:pointer; }
    .gmail-test-toggle input { margin-top:3px; }
    .gmail-test-toggle span { display:grid; gap:3px; }
    .gmail-test-toggle small { color:#6b7280; font-weight:400; line-height:1.45; }
    .gmail-test-actions { display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
    @media (max-width:700px) { .gmail-test-banner { padding:10px 16px; align-items:flex-start; flex-wrap:wrap; } }
  `;
  document.head.appendChild(style);

  showOAuthResult();
  installTestUi();
  upgradeAll();
  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('a.mail-btn')) upgrade(node);
        upgradeAll(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });
})();
