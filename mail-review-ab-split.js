(() => {
  if (window.__KPA_MAIL_AB_SPLIT__) return;
  window.__KPA_MAIL_AB_SPLIT__ = true;

  const BUTTON_ID = 'mailAbSplitBtn';

  function ensureButton() {
    const actions = document.querySelector('.review-actions');
    if (!actions) return null;
    let button = document.getElementById(BUTTON_ID);
    if (button) return button;

    button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = 'kpa-history-btn ab-split-btn';
    button.textContent = 'A/B 반반';
    button.title = '첫 번째 메일부터 A, B, A, B 순서로 자동 적용합니다.';
    button.addEventListener('click', () => {
      const total = document.querySelectorAll('#mailCards .mail-card').length;
      if (!total) {
        alert('적용할 메일이 없습니다.');
        return;
      }

      button.disabled = true;
      button.textContent = 'A/B 적용 중…';
      try {
        for (let index = 0; index < total; index += 1) {
          const cards = document.querySelectorAll('#mailCards .mail-card');
          const card = cards[index];
          if (!card) continue;
          const template = index % 2 === 0 ? 'A' : 'B';
          card.querySelector(`[data-template="${template}"]`)?.click();
        }
        button.textContent = 'A/B 반반 ✓';
        setTimeout(() => {
          if (button.isConnected) button.textContent = 'A/B 반반';
        }, 1100);
      } finally {
        button.disabled = false;
      }
    });

    const history = document.getElementById('kpaHistoryButton');
    if (history) history.insertAdjacentElement('afterend', button);
    else actions.insertBefore(button, document.getElementById('gmailConnectBtn') || actions.firstChild);
    return button;
  }

  function placeNextToHistory() {
    const button = ensureButton();
    const history = document.getElementById('kpaHistoryButton');
    if (button && history && history.nextElementSibling !== button) history.insertAdjacentElement('afterend', button);
  }

  const ready = () => {
    placeNextToHistory();
    new MutationObserver(placeNextToHistory).observe(document.querySelector('.review-actions') || document.body, { childList: true });
  };

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', ready) : ready();
})();
