(() => {
  const summary = document.getElementById('summary');
  if (!summary) return;

  function enhanceAutoSummary() {
    if (typeof state !== 'undefined' && ['bcww','kbeauty','wsce','education_fair'].includes(state.currentCampaign)) return;
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
  script.src = '/bcww-mode-v2.js?v=20260813-bcww-sales-v4';
  script.dataset.bcwwMode = '1';
  script.addEventListener('load', () => {
    if (document.querySelector('script[data-bcww-sales-ui]')) return;
    const sales = document.createElement('script');
    sales.src = '/bcww-sales-ui-v4.js?v=20260813-bcww-sales-v4';
    sales.dataset.bcwwSalesUi = '1';
    document.head.appendChild(sales);
  }, { once:true });
  document.head.appendChild(script);
})();

(() => {
  if (document.querySelector('script[data-international-event-mode]')) return;
  let attempts = 0;
  const load = () => {
    if (document.querySelector('script[data-international-event-mode]')) return;
    if (typeof CAMPAIGNS !== 'undefined') {
      const script = document.createElement('script');
      script.src = '/event-campaigns-mode.js?v=20260831-kbeauty-stable-gate-v5';
      script.dataset.internationalEventMode = '1';
      document.head.appendChild(script);
      return;
    }
    attempts += 1;
    if (attempts < 120) setTimeout(load, 10);
  };
  load();
})();

(() => {
  if (document.querySelector('script[data-wsce-contact-guard]')) return;
  let attempts = 0;
  const load = () => {
    if (document.querySelector('script[data-wsce-contact-guard]')) return;
    if (typeof CAMPAIGNS !== 'undefined' && CAMPAIGNS.wsce && document.querySelector('script[data-international-event-mode]')) {
      const script = document.createElement('script');
      script.src = '/wsce-live-contact-guard.js?v=20260813-wsce-live-v1';
      script.dataset.wsceContactGuard = '1';
      document.head.appendChild(script);
      return;
    }
    attempts += 1;
    if (attempts < 160) setTimeout(load, 50);
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
      script.src = '/campaign-run-controller.js?v=20260831-kbeauty-button-contract-v9';
      script.dataset.campaignRunController = '1';
      document.head.appendChild(script);
      return;
    }
    attempts += 1;
    if (attempts < 160) setTimeout(load, 50);
  };
  load();
})();

(() => {
  // One deterministic K-Beauty runtime loader. Do not load the legacy v4 wrapper anywhere.
  if (document.querySelector('script[data-kbeauty-runtime-v5]')) return;
  let attempts = 0;
  const load = () => {
    if (document.querySelector('script[data-kbeauty-runtime-v5]')) return;
    if (window.__KPA_CAMPAIGN_RUN_CONTROLLER__ && document.querySelector('script[data-international-event-mode]')) {
      const script = document.createElement('script');
      script.src = '/kbeauty-runtime-v5.js?v=20260831-additive-union-v10';
      script.dataset.kbeautyRuntimeV5 = '1';
      document.head.appendChild(script);
      return;
    }
    attempts += 1;
    if (attempts < 240) setTimeout(load, 25);
  };
  load();
})();

(() => {
  if (document.querySelector('script[data-kbeauty-seed-feeder]')) return;
  const script = document.createElement('script');
  script.src = '/kbeauty-seed-feeder.js?v=20260831-seed-union-v5-additive';
  script.dataset.kbeautySeedFeeder = '1';
  document.head.appendChild(script);
})();

(() => {
  if (window.__KPA_PLAIN_EMAIL_GUARD__) return;
  window.__KPA_PLAIN_EMAIL_GUARD__ = true;

  const replaceMailto = (root = document) => {
    const links = [];
    if (root?.nodeType === 1 && root.matches?.('a[href^="mailto:"]')) links.push(root);
    root?.querySelectorAll?.('a[href^="mailto:"]').forEach(link => links.push(link));

    for (const link of links) {
      if (!link?.parentNode) continue;
      const text = String(link.textContent || '').trim();
      const span = document.createElement('span');
      span.textContent = text;
      span.className = link.className || '';
      span.dataset.plainEmail = '1';
      span.title = text;
      link.replaceWith(span);
    }
  };

  document.addEventListener('click', event => {
    const link = event.target?.closest?.('a[href^="mailto:"]');
    if (!link) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    replaceMailto(link);
  }, true);

  const start = () => {
    replaceMailto(document);
    const root = document.body || document.documentElement;
    if (!root) return;
    new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes || []) replaceMailto(node);
      }
    }).observe(root, { childList:true, subtree:true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();

(() => {
  if (window.__KPA_HIDE_KBW__) return;
  window.__KPA_HIDE_KBW__ = true;

  const enforce = () => {
    const select = document.getElementById('campaignSelect');
    if (!select) return;

    select.querySelectorAll('option[value="kbw"]').forEach(option => option.remove());

    if (typeof state !== 'undefined' && state.currentCampaign === 'kbw') {
      const next = (typeof CAMPAIGNS !== 'undefined' && CAMPAIGNS.bcww)
        ? 'bcww'
        : (typeof CAMPAIGNS !== 'undefined' && CAMPAIGNS.kbeauty)
          ? 'kbeauty'
          : select.querySelector('option:not([value="kbw"])')?.value || '';
      if (!next) return;
      state.currentCampaign = next;
      select.value = next;
      localStorage.setItem('kpa.hunt.campaign', next);
      state.selected?.clear?.();
      if (typeof saveState === 'function') saveState();
      if (typeof render === 'function') render();
    }
  };

  const start = () => {
    const select = document.getElementById('campaignSelect');
    if (!select) return;
    enforce();
    new MutationObserver(enforce).observe(select, { childList:true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();