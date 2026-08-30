(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const IDS_KEY = 'kpa.mail.review.ids';
  const DRAFT_KEYS = ['kpa.mail.review.drafts.v5', 'kpa.mail.review.drafts.v4'];
  const VERSION = '20260830-company-identity-v3';

  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const clean = (value = '', max = 500) => String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

  function verified(lead = {}) {
    const identity = lead.company_identity || {};
    return identity.identity_version === VERSION
      && identity.status === 'verified'
      && Number(identity.confidence || 0) >= 0.85
      && Boolean(clean(identity.greeting_name, 120))
      && /^https?:\/\//i.test(clean(identity.evidence_url, 600));
  }

  function allowedContacts(lead = {}) {
    const allowed = globalThis.KPA_COMPANY_CONTACT_ALLOWED;
    const identity = lead.company_identity || {};
    const rows = [
      lead.contact,
      ...(Array.isArray(lead.contacts) ? lead.contacts : []),
      ...(Array.isArray(lead.contact_candidates) ? lead.contact_candidates : [])
    ].filter(Boolean);
    const map = new Map();
    for (const contact of rows) {
      const email = clean(contact?.email, 240).toLowerCase();
      if (!email || map.has(email)) continue;
      const ok = typeof allowed === 'function' ? allowed(contact, identity) : contact?.send_allowed === true;
      if (ok) map.set(email, { ...contact, send_allowed: true });
    }
    return [...map.values()];
  }

  function rewriteDraftGreeting(draft, greeting) {
    if (!draft || !greeting) return false;
    let changed = false;
    if (typeof draft.body === 'string') {
      const next = draft.body.replace(/^Hi[^\n]*,\s*/i, `Hi ${greeting} team,\n\n`);
      if (next !== draft.body) { draft.body = next; changed = true; }
    }
    if (typeof draft.translation === 'string') {
      const next = draft.translation.replace(/^안녕하세요[^\n]*[.!]?\s*/, `안녕하세요, ${greeting} 팀.\n\n`);
      if (next !== draft.translation) { draft.translation = next; changed = true; }
    }
    return changed;
  }

  function applyGuard() {
    const leads = load(LEADS_KEY, []);
    const ids = new Set(load(IDS_KEY, []));
    if (!Array.isArray(leads) || !ids.size) return;
    const draftsByKey = Object.fromEntries(DRAFT_KEYS.map(key => [key, load(key, {})]));
    let leadsChanged = false;
    let draftsChanged = false;

    for (const lead of leads) {
      if (!lead?.id || !ids.has(lead.id)) continue;
      const isVerified = verified(lead);
      const greeting = isVerified ? clean(lead.company_identity?.greeting_name, 120) : '';
      const sendable = isVerified ? allowedContacts(lead) : [];

      if (isVerified) {
        if (greeting && lead.company !== greeting) {
          lead.company = greeting;
          lead.greeting_name = greeting;
          lead.brand_name = clean(lead.company_identity?.brand_name || greeting, 160);
          leadsChanged = true;
        }
        if (lead.identity_ui_blocked) {
          delete lead.identity_ui_blocked;
          leadsChanged = true;
        }
        if (JSON.stringify(lead.contacts || []) !== JSON.stringify(sendable)) {
          lead.contacts = sendable;
          lead.contact = sendable.find(contact => contact.qualified) || sendable[0] || null;
          leadsChanged = true;
        }

        for (const drafts of Object.values(draftsByKey)) {
          const draft = drafts?.[lead.id];
          if (!draft) continue;
          if (rewriteDraftGreeting(draft, greeting)) draftsChanged = true;

          const allowedEmails = new Set(sendable.map(contact => clean(contact.email, 240).toLowerCase()));
          const currentSelected = Array.isArray(draft.selectedEmails)
            ? draft.selectedEmails.map(email => clean(email, 240).toLowerCase()).filter(Boolean)
            : [];
          const retained = currentSelected.filter(email => allowedEmails.has(email));
          const nextSelected = retained.length ? retained : [...allowedEmails].slice(0, 4);
          if (JSON.stringify(currentSelected) !== JSON.stringify(nextSelected)) {
            draft.selectedEmails = nextSelected;
            draft.to = nextSelected.join(', ');
            draftsChanged = true;
          }

          if (draft.identityAutoExcluded === true && sendable.length) {
            draft.included = true;
            delete draft.identityAutoExcluded;
            draftsChanged = true;
          }
          if (!sendable.length && draft.identityAutoExcluded !== true) {
            draft.identityAutoExcluded = true;
            draft.included = false;
            draftsChanged = true;
          }
        }
      } else {
        if (!lead.identity_ui_blocked) {
          lead.identity_ui_blocked = true;
          leadsChanged = true;
        }
        for (const drafts of Object.values(draftsByKey)) {
          const draft = drafts?.[lead.id] || (drafts[lead.id] = {});
          if (draft.identityAutoExcluded !== true || draft.included !== false) {
            draft.identityAutoExcluded = true;
            draft.included = false;
            draftsChanged = true;
          }
        }
      }
    }

    if (leadsChanged) save(LEADS_KEY, leads);
    if (draftsChanged) {
      for (const [key, drafts] of Object.entries(draftsByKey)) save(key, drafts);
    }
  }

  applyGuard();
  document.addEventListener('kpa:company-identity-updated', () => setTimeout(applyGuard, 0));
  window.addEventListener('storage', event => {
    if (event.key === LEADS_KEY) applyGuard();
  });
  setTimeout(applyGuard, 900);
  setTimeout(applyGuard, 2500);
})();
