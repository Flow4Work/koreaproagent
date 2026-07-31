(() => {
  const SENT_PREFIX = 'kpa.gmail.sent.';
  const TEST_MODE_KEY = 'kpa.gmail.testMode';
  const TEST_EMAIL = 'treecox19@gmail.com';
  let statusCache = null;

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

  function testMode() {
    return localStorage.getItem(TEST_MODE_KEY) === '1';
  }

  function setTestMode(enabled) {
    if (enabled) localStorage.setItem(TEST_MODE_KEY, '1');
    else localStorage.removeItem(TEST_MODE_KEY);
    refreshTestUi();
  }

  function markSent(anchor, payload) {
    localStorage.setItem(sentKey(payload), new Date().toISOString());
    anchor.textContent = '발송 완료';
    anchor.classList.add('gmail-sent');
    anchor.setAttribute('aria-disabled', 'true');
  }

  function setButtonLabel(anchor) {
    if (!anchor || anchor.classList.contains('gmail-sent') || anchor.classList.contains('gmail-sending')) return;
    anchor.textContent = '승인 및 발송';
  }

  function addMailPreviewMeta(anchor) {
    const row = anchor.closest('tr.data-row');
    const detailRow = row?.nextElementSibling;
    const preview = detailRow?.querySelector('.mail-preview');
    if (!preview) return;

    const payload = payloadFromLink(anchor);
    if (!payload.to || !payload.subject) return;

    let meta = preview.querySelector('.gmail-preview-meta');
    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'gmail-preview-meta';
      const pre = preview.querySelector('pre');
      preview.insertBefore(meta, pre || null);
    }
    meta.innerHTML = `<div><b>To</b><span>${escapeHtml(payload.to)}</span></div><div><b>Subject</b><span>${escapeHtml(payload.subject)}</span></div>`;
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[char]));
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
    addMailPreviewMeta(anchor);
  }

  function upgradeAll(root = document) {
    root.querySelectorAll?.('a.mail-btn').forEach(upgrade);
  }

  async function gmailStatus(force = false) {
    if (statusCache && !force) return statusCache;
    const response = await fetch(`/api/gmail?action=status&t=${Date.now()}`, {
      cache:'no-store', credentials:'same-origin'
    });
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
      connected: 'NYF Gmail 연결 완료.',
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
    try {
      status = await gmailStatus();
    } catch {
      alert('Gmail 연결 상태를 확인하지 못했습니다.');
      return null;
    }

    if (!status.configured) {
      alert('Google OAuth 설정이 아직 필요합니다.');
      return null;
    }
    if (!status.connected) {
      if (confirm('NYF Gmail을 먼저 연결할까요?')) connectGmail();
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
    const enabled = testMode();
    const button = document.getElementById('gmailTestBtn');
    const banner = document.getElementById('gmailTestBanner');

    if (button) {
      button.textContent = enabled ? '🧪 TEST MODE ON' : '테스트 모드';
      button.classList.toggle('gmail-test-on', enabled);
      button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }
    if (banner) banner.classList.toggle('hidden', !enabled);
    upgradeAll();
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

    const enabled = testMode();
    const sender = status.sender?.email || 'business@notyourflavor.com';
    const question = enabled
      ? `🧪 TEST MODE\n\n화면의 원래 수신자: ${originalPayload.to}\n실제 발송: ${TEST_EMAIL}\nFrom: NYF <${sender}>\n\n제목과 본문은 화면에 보이는 그대로 전송됩니다.\n원래 업체에는 발송되지 않습니다. 계속할까요?`
      : `${originalPayload.to} 으로 실제 메일을 발송합니다.\n\nFrom: NYF <${sender}>\n\n발송할까요?`;

    if (!confirm(question)) return;

    const originalText = anchor.textContent;
    anchor.textContent = '발송 중…';
    anchor.setAttribute('aria-disabled', 'true');
    anchor.classList.add('gmail-sending');

    try {
      const result = await postMail({ ...originalPayload, testMode:enabled });
      if (enabled) {
        anchor.textContent = '테스트 완료 ✓';
        setTimeout(() => {
          anchor.removeAttribute('aria-disabled');
          anchor.classList.remove('gmail-sending');
          setButtonLabel(anchor);
        }, 1800);
      } else {
        markSent(anchor, originalPayload);
      }
      return result;
    } catch (error) {
      anchor.textContent = originalText || '승인 및 발송';
      anchor.removeAttribute('aria-disabled');
      anchor.classList.remove('gmail-sending');
      if (error.code === 'GMAIL_RECONNECT_REQUIRED') {
        if (confirm('Gmail 연결이 만료되었습니다. 다시 연결할까요?')) connectGmail();
        return;
      }
      alert(`메일 발송 실패: ${error.message || '알 수 없는 오류'}`);
    }
  }

  function installTestUi() {
    if (document.getElementById('gmailTestBtn')) return;

    localStorage.removeItem('kpa.gmail.testEmail');

    const tools = document.querySelector('.topbar .tools');
    if (tools) {
      const button = document.createElement('button');
      button.id = 'gmailTestBtn';
      button.className = 'ghost';
      button.type = 'button';
      button.addEventListener('click', () => setTestMode(!testMode()));
      tools.insertBefore(button, tools.querySelector('#settingsBtn') || null);
    }

    const shell = document.querySelector('.shell') || document.body;
    const banner = document.createElement('div');
    banner.id = 'gmailTestBanner';
    banner.className = 'gmail-test-banner hidden';
    banner.innerHTML = `<strong>🧪 TEST MODE</strong><span>사냥·후보·담당자·제목·본문은 실서비스와 동일합니다. 승인 발송만 <b>${TEST_EMAIL}</b> 로 강제 전송됩니다.</span>`;
    const topbar = shell.querySelector('.topbar');
    if (topbar?.nextSibling) shell.insertBefore(banner, topbar.nextSibling);
    else shell.appendChild(banner);

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
    .gmail-preview-meta { display:grid; gap:6px; margin:8px 0 12px; padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; background:#fafafa; font-size:12px; }
    .gmail-preview-meta > div { display:grid; grid-template-columns:58px 1fr; gap:8px; min-width:0; }
    .gmail-preview-meta b { color:#6b7280; }
    .gmail-preview-meta span { overflow-wrap:anywhere; }
    @media (max-width:700px) { .gmail-test-banner { padding:10px 16px; align-items:flex-start; } }
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
