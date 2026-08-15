(() => {
  if (window.__KPA_BCWW_MAIL_REVIEW_V2__) return;
  window.__KPA_BCWW_MAIL_REVIEW_V2__ = true;

  const LEADS_KEY = 'kpa.hunt.leads';
  const IDS_KEY = 'kpa.mail.review.ids';
  const DRAFT_KEY = 'kpa.mail.review.drafts.v5';
  const corrected = new Set();

  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const clean = (value = '', max = 12000) => String(value || '').replace(/\r/g, '').trim().slice(0, max);
  const validEmail = value => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean(value, 240));

  function reviewLeads() {
    const ids = new Set(load(IDS_KEY, []).filter(Boolean));
    return load(LEADS_KEY, []).filter(lead => ids.has(lead.id) && lead.campaign === 'bcww');
  }

  function strictEmail(lead = {}) {
    const threshold = Math.max(75, Number(lead.contact_score_threshold) || 75);
    const rows = [lead.contact, ...(Array.isArray(lead.contacts) ? lead.contacts : [])].filter(Boolean);
    const domain = clean(lead.domain, 240).toLowerCase().replace(/^www\./, '');
    const contact = rows.find(item => {
      const email = clean(item?.email, 240).toLowerCase();
      const emailDomain = email.split('@')[1] || '';
      return validEmail(email)
        && item?.qualified === true
        && item?.emailStatus === 'valid'
        && Number(item?.score || 0) >= threshold
        && domain
        && (emailDomain === domain || emailDomain.endsWith(`.${domain}`));
    });
    return clean(contact?.email, 240).toLowerCase();
  }

  function seedDrafts() {
    const leads = reviewLeads();
    if (!leads.length) return false;
    const drafts = load(DRAFT_KEY, {});
    let changed = false;

    for (const lead of leads) {
      const email = strictEmail(lead);
      if (!email || corrected.has(lead.id)) continue;
      const current = drafts[lead.id] || {};
      drafts[lead.id] = {
        ...current,
        selectedEmails: [email],
        to: email,
        included: current.included !== false,
        templateId: current.templateId === 'A' ? 'A' : 'B'
      };
      corrected.add(lead.id);
      changed = true;
    }

    if (changed) save(DRAFT_KEY, drafts);
    return changed;
  }

  function hideKbwOnlyControls() {
    if (!reviewLeads().length) return;
    document.getElementById('kbwPackageBtn')?.remove();
  }

  function enforceVerifiedRecipientFields() {
    const leads = reviewLeads();
    if (!leads.length) return;
    document.querySelectorAll('.mail-card').forEach(card => {
      const companyName = card.querySelector('.company-line h2')?.textContent?.trim() || '';
      const lead = leads.find(item => clean(item.company, 120) === companyName);
      if (!lead) return;
      const email = strictEmail(lead);
      if (!email) return;

      const to = card.querySelector('[data-action="to"]');
      if (to && to.value !== email) {
        to.value = email;
        to.dispatchEvent(new Event('input', { bubbles: true }));
      }

      const select = card.querySelector('[data-action="contacts"]');
      if (select) {
        [...select.options].forEach(option => { option.selected = option.value === email; });
      }
    });
  }

  let scheduled = false;
  function sync() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      seedDrafts();
      hideKbwOnlyControls();
      enforceVerifiedRecipientFields();
    });
  }

  if (!reviewLeads().length) return;
  seedDrafts();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
  new MutationObserver(sync).observe(document.documentElement, { childList: true, subtree: true });
})();
