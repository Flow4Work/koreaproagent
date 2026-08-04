(() => {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = function routedFetch(input, init = {}) {
    const rawUrl = typeof input === 'string' ? input : input?.url || '';
    if (rawUrl === '/api/sent-domains') {
      return nativeFetch('/api/gmail?action=sent-domains', init);
    }
    if (rawUrl === '/api/hunt-v2') {
      let body = {};
      try { body = JSON.parse(init?.body || '{}'); }
      catch { body = {}; }
      return nativeFetch('/api/contact', {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
        body: JSON.stringify({ ...body, action: 'hunt_v2' })
      });
    }
    return nativeFetch(input, init);
  };
})();
