(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const IDS_KEY = 'kpa.mail.review.ids';

  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  };

  const ids = new Set(load(IDS_KEY, []).filter(Boolean));
  const selected = load(LEADS_KEY, []).filter(lead => lead?.id && ids.has(lead.id));
  if (!selected.length || selected.some(lead => lead?.campaign !== 'kbw')) return;

  const script = document.createElement('script');
  script.src = '/kbw-package-email.js?v=20260806-kbw-package-email-v1';
  script.async = false;
  document.head.appendChild(script);
})();
