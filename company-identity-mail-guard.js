(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const IDS_KEY = 'kpa.mail.review.ids';
  const DRAFT_KEYS = ['kpa.mail.review.drafts.v5', 'kpa.mail.review.drafts.v4'];
  const GENERIC = new Set([
    'company','companies','corporation','corp','inc','incorporated','limited','ltd','llc','plc','gmbh','group','holding','holdings',
    'international','global','co','sa','sas','ag','bv','nv','pte','pty','llp','technology','technologies','healthcare','cosmetic','cosmetics',
    'beauty','pack','packing','packaging','package','plastic','plastics','plasticware','bottle','bottles','glass','crystal','industry','industrial',
    'manufacturing','manufacturer','factory','trade','trading','business','guangzhou','shenzhen','shanghai','beijing','ningbo','yuyao','dongguan',
    'china','korea','japan','usa','uk','germany','france','team'
  ]);

  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const clean = (value = '', max = 500) => String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

  function rootDomain(value = '') {
    let raw = clean(value, 500).toLowerCase();
    if (!raw) return '';
    if (raw.includes('@') && !raw.includes('://')) raw = raw.split('@').pop() || '';
    try { raw = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname; }
    catch { raw = raw.replace(/^https?:\/\//, '').split('/')[0].split(':')[0]; }
    return raw.replace(/^www\./, '').replace(/\.+$/, '');
  }

  function identityVerified(lead = {}) {
    const identity = lead.company_identity || {};
    return identity.status === 'verified'
      && Number(identity.confidence || 0) >= 0.85
      && Boolean(clean(identity.greeting_name || lead.greeting_name, 120))
      && Boolean(rootDomain(identity.domain || lead.domain))
      && /^https?:\/\//i.test(clean(identity.evidence_url || lead.identity_evidence_url, 600));
  }

  function domainStem(value = '') {
    const root = rootDomain(value);
    return clean(root.split('.')[0], 120).replace(/[^a-z0-9]+/gi, '').toLowerCase();
  }

  function words(value = '') {
    return clean(value, 220).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  }

  function safeShortBrand(lead = {}) {
    const identity = lead.company_identity || {};
    const current = clean(identity.greeting_name || lead.greeting_name || lead.company, 160);
    if (!identityVerified(lead) || !current) return current;
    if (words(current).length <= 2) return current;

    const stem = domainStem(identity.domain || lead.domain);
    if (!stem) return current;
    const raw = clean(lead.raw_company || identity.raw_name || lead.legal_name || current, 220);
    const significant = words(raw).filter(word => {
      const lower = word.toLowerCase();
      return lower.length >= 3 && !GENERIC.has(lower);
    });
    const matched = significant.filter(word => {
      const lower = word.toLowerCase().replace(/[^a-z0-9]/g, '');
      return lower.length >= 4 && (stem.includes(lower) || lower.includes(stem));
    });
    if (matched.length !== 1) return current;
    return matched[0];
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
      const verified = identityVerified(lead);
      if (verified) {
        const greeting = safeShortBrand(lead);
        if (greeting && greeting !== clean(lead.company, 160)) {
          lead.company = greeting;
          lead.greeting_name = greeting;
          if (lead.company_identity) lead.company_identity.greeting_name = greeting;
          leadsChanged = true;
        }
        if (lead.identity_ui_blocked) {
          delete lead.identity_ui_blocked;
          leadsChanged = true;
        }
        for (const drafts of Object.values(draftsByKey)) {
          const draft = drafts?.[lead.id];
          if (!draft) continue;
          if (draft.identityAutoExcluded === true) {
            draft.included = true;
            draft.selectedEmails = [];
            draft.to = '';
            delete draft.identityAutoExcluded;
            draftsChanged = true;
          }
          if (rewriteDraftGreeting(draft, greeting || clean(lead.company, 120))) draftsChanged = true;
        }
      } else {
        if (!lead.identity_ui_blocked || lead.contact_status !== 'identity_needs_review') {
          lead.identity_ui_blocked = true;
          lead.contact_status = 'identity_needs_review';
          leadsChanged = true;
        }
        for (const drafts of Object.values(draftsByKey)) {
          const draft = drafts?.[lead.id] || (drafts[lead.id] = {});
          if (draft.identityAutoExcluded !== true) {
            draft.identityAutoExcluded = true;
            draft.included = false;
            draftsChanged = true;
          }
        }
      }
    }

    if (leadsChanged) save(LEADS_KEY, leads);
    if (draftsChanged) for (const [key, drafts] of Object.entries(draftsByKey)) save(key, drafts);
  }

  applyGuard();
  document.addEventListener('kpa:company-identity-updated', applyGuard);
  window.addEventListener('storage', event => {
    if (event.key === LEADS_KEY) applyGuard();
  });
  setTimeout(applyGuard, 1200);
  setTimeout(applyGuard, 3500);
})();
