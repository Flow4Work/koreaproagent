(() => {
  const IDS_KEY = 'kpa.mail.review.ids';
  const LEADS_KEY = 'kpa.hunt.leads';
  const DRAFT_KEYS = ['kpa.mail.review.drafts.v5', 'kpa.mail.review.drafts.v4'];
  const USER_SELECTION_KEY = 'kpa.mail.review.user-selection.v1';
  const SCHEMA_KEY = 'kpa.mail.review.selection-contract';
  const SCHEMA = 'user-only-v1';

  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

  function orderedReviewIds() {
    const ids = load(IDS_KEY, []);
    const leads = load(LEADS_KEY, []);
    const existing = new Set((Array.isArray(leads) ? leads : []).map(lead => lead?.id).filter(Boolean));
    return (Array.isArray(ids) ? ids : []).filter(id => existing.has(id));
  }

  function restoreSelectionContract() {
    if (localStorage.getItem(SCHEMA_KEY) !== SCHEMA) {
      // One-time cleanup: previous validation code wrote unchecked states that were not chosen by the user.
      localStorage.removeItem(USER_SELECTION_KEY);
      localStorage.setItem(SCHEMA_KEY, SCHEMA);
    }

    const ids = orderedReviewIds();
    if (!ids.length) return;
    const userSelection = load(USER_SELECTION_KEY, {});

    for (const key of DRAFT_KEYS) {
      const drafts = load(key, {});
      if (!drafts || typeof drafts !== 'object') continue;
      let changed = false;

      for (const id of ids) {
        const draft = drafts[id];
        if (!draft || typeof draft !== 'object') continue;
        const included = hasOwn(userSelection, id) ? userSelection[id] !== false : true;
        if (draft.included !== included) {
          draft.included = included;
          changed = true;
        }
        if (hasOwn(draft, 'identityAutoExcluded')) {
          delete draft.identityAutoExcluded;
          changed = true;
        }
      }

      if (changed) save(key, drafts);
    }
  }

  function rememberSelection(index, included) {
    const id = orderedReviewIds()[Number(index)];
    if (!id) return;
    const userSelection = load(USER_SELECTION_KEY, {});
    userSelection[id] = Boolean(included);
    save(USER_SELECTION_KEY, userSelection);
  }

  function rememberRenderedCard(index) {
    queueMicrotask(() => {
      const checkbox = document.querySelector(`.mail-card[data-index="${Number(index)}"] input[data-action="include"]`);
      if (checkbox) rememberSelection(index, checkbox.checked);
    });
  }

  restoreSelectionContract();

  // Only a user's explicit include/exclude action is allowed to persist an unchecked company.
  document.addEventListener('change', event => {
    const checkbox = event.target?.closest?.('input[data-action="include"]');
    if (!checkbox) return;
    const card = checkbox.closest('.mail-card');
    if (!card) return;
    rememberSelection(card.dataset.index, checkbox.checked);
  });

  document.addEventListener('click', event => {
    if (event.target?.closest?.('button,input,select,textarea,a,label,[contenteditable="true"]')) return;
    const card = event.target?.closest?.('.mail-card');
    if (card) rememberRenderedCard(card.dataset.index);
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target?.closest?.('button,input,select,textarea,a,label,[contenteditable="true"]')) return;
    const card = event.target?.closest?.('.mail-card');
    if (card) rememberRenderedCard(card.dataset.index);
  });
})();
