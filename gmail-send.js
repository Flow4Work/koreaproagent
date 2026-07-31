(() => {
  const SENT_PREFIX = 'kpa.gmail.sent.';
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

  function markSent(anchor, payload) {
    localStorage.setItem(sentKey(payload), new Date().toISOString());
    anchor.textContent = '발송 완료';
    anchor.classList.add('gmail-sent');
    anchor.setAttribute('aria-disabled', 'true');
  }

  function upgrade(anchor) {
    if (!anchor || anchor.dataset.gmailAutomation === '1') return;
    anchor.dataset.gmailAutomation = '1';
    anchor.removeAttribute('target');
    anchor.removeAttribute('rel');
    const payload = payloadFromLink(anchor);
    if (localStorage.getItem(sentKey(payload))) markSent(anchor, payload);
    else anchor.textContent = '승인 및 발송';
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

  async function handleSend(anchor) {
    if (anchor.classList.contains('gmail-sent')) return;
    const payload = payloadFromLink(anchor);
    if (!payload.to || !payload.subject || !payload.body) {
      alert('발송할 메일 정보가 부족합니다.');
      return;
    }

    let status;
    try { status = await gmailStatus(); }
    catch { alert('Gmail 연결 상태를 확인하지 못했습니다.'); return; }

    if (!status.configured) {
      alert('Google OAuth 설정이 아직 필요합니다. Client ID / Secret / Session Secret을 Vercel에 등록한 뒤 연결하면 됩니다.');
      return;
    }
    if (!status.connected) {
      if (confirm('NYF Gmail을 먼저 연결할까요? 연결 후 다시 승인 및 발송을 눌러주세요.')) connectGmail();
      return;
    }

    const sender = status.sender?.email || 'business@notyourflavor.com';
    if (!confirm(`${payload.to} 으로 실제 메일을 발송합니다.\n\nFrom: NYF <${sender}>\n\n발송할까요?`)) return;

    const originalText = anchor.textContent;
    anchor.textContent = '발송 중…';
    anchor.setAttribute('aria-disabled', 'true');
    anchor.classList.add('gmail-sending');

    try {
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
        anchor.textContent = 'Gmail 다시 연결';
        anchor.removeAttribute('aria-disabled');
        anchor.classList.remove('gmail-sending');
        if (confirm('Gmail 연결이 만료되었습니다. 다시 연결할까요?')) connectGmail();
        return;
      }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      markSent(anchor, payload);
    } catch (error) {
      anchor.textContent = originalText || '승인 및 발송';
      anchor.removeAttribute('aria-disabled');
      alert(`메일 발송 실패: ${error.message || '알 수 없는 오류'}`);
    } finally {
      anchor.classList.remove('gmail-sending');
    }
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
  `;
  document.head.appendChild(style);

  showOAuthResult();
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
