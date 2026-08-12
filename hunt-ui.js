(() => {
  const summary = document.getElementById('summary');
  if (!summary) return;

  function enhanceAutoSummary() {
    if (typeof state !== 'undefined' && ['bcww','wsce','education_fair'].includes(state.currentCampaign)) return;
    const live = summary.querySelector('.hunt-live');
    if (!live) {
      summary.classList.remove('auto-live-summary');
      summary.querySelector('.hunt-found')?.remove();
      return;
    }

    summary.classList.add('auto-live-summary');

    const time = live.textContent.match(/(\d+:\d{2})/)?.[1] || '00:00';
    const liveText = `자동사냥 종료까지 ${time} 남음`;
    if (live.textContent !== liveText) live.textContent = liveText;

    const verified = [...summary.children].find(el => el.textContent.trim().startsWith('검증 후보'));
    const deltaText = verified?.querySelector('.summary-delta')?.textContent || '';
    const foundCount = Number.parseInt(deltaText.replace(/\D/g, ''), 10) || 0;

    let found = summary.querySelector('.hunt-found');
    if (!found) {
      found = document.createElement('strong');
      found.className = 'hunt-found';
      live.after(found);
    }

    const foundText = `+ ${foundCount}개 찾음!!`;
    if (found.textContent !== foundText) found.textContent = foundText;
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceAutoSummary();
    });
  });

  observer.observe(summary, { childList: true, subtree: true, characterData: true });
  enhanceAutoSummary();
})();

(() => {
  if (document.querySelector('script[data-bcww-mode]')) return;
  const script = document.createElement('script');
  script.src = '/bcww-mode-v2.js?v=20260813-bcww-hybrid-email-v2';
  script.dataset.bcwwMode = '1';
  document.head.appendChild(script);
})();

(() => {
  if (document.querySelector('script[data-international-event-mode]')) return;
  let attempts = 0;
  const load = () => {
    if (document.querySelector('script[data-international-event-mode]')) return;
    if (typeof CAMPAIGNS !== 'undefined' && CAMPAIGNS.bcww) {
      const script = document.createElement('script');
      script.src = '/event-campaigns-mode.js?v=20260812-international-events-v1';
      script.dataset.internationalEventMode = '1';
      document.head.appendChild(script);
      return;
    }
    attempts += 1;
    if (attempts < 120) setTimeout(load, 50);
  };
  load();
})();

(() => {
  if (document.querySelector('script[data-campaign-run-controller]')) return;
  let attempts = 0;
  const load = () => {
    if (document.querySelector('script[data-campaign-run-controller]')) return;
    if (typeof CAMPAIGNS !== 'undefined' && CAMPAIGNS.bcww && CAMPAIGNS.wsce && document.querySelector('script[data-international-event-mode]')) {
      const script = document.createElement('script');
      script.src = '/campaign-run-controller.js?v=20260813-campaign-routing-v1';
      script.dataset.campaignRunController = '1';
      document.head.appendChild(script);
      return;
    }
    attempts += 1;
    if (attempts < 160) setTimeout(load, 50);
  };
  load();
})();
