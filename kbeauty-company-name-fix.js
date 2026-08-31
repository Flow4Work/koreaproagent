(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const IDS_KEY = 'kpa.mail.review.ids';
  const DRAFT_KEYS = ['kpa.mail.review.drafts.v5', 'kpa.mail.review.drafts.v4'];

  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const clean = (value = '', max = 160) => String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const badPageName = value => /(?:^|\b)(?:logo|logoimg|canvas\s+logo|official\s+(?:home\s?page|website|site))(?:$|\b)|공식\s*홈페이지|공식\s*웹사이트/i.test(clean(value));
  const marketingTitle = value => /(?:全球|industry\s+(?:leader|pioneer)|official\s+(?:home\s?page|website|site))/i.test(clean(value));

  function fallbackFromDomain(lead = {}) {
    const helper = globalThis.KPA_COMPANY_NAMES;
    const domain = clean(lead?.company_identity?.domain || lead?.domain || lead?.url, 500);
    const value = clean(helper?.brandFromDomain?.(domain), 100);
    return value && helper?.validCompanyName?.(value) ? value : '';
  }

  function repairedName(lead = {}) {
    const current = clean(lead.company || lead.greeting_name || lead.raw_company, 100).replace(/\s+team$/i, '').trim();
    if (!current) return fallbackFromDomain(lead);
    if (badPageName(current)) return fallbackFromDomain(lead) || current.replace(/\b(?:canvas\s+)?logo(?:img)?\b/ig, '').replace(/공식\s*홈페이지|공식\s*웹사이트/ig, '').trim();

    const parts = current.split(/\s*[|—–]\s*/).map(value => clean(value, 100)).filter(Boolean);
    if (parts.length > 1 && marketingTitle(parts.slice(1).join(' '))) return fallbackFromDomain(lead) || parts[0];
    return current;
  }

  function rewriteDraft(draft, name) {
    if (!draft || !name) return false;
    let changed = false;
    if (typeof draft.body === 'string') {
      const next = draft.body.replace(/^Hi[^\n]*,\s*/i, `Hi ${name} team,\n\n`);
      if (next !== draft.body) { draft.body = next; changed = true; }
    }
    if (typeof draft.translation === 'string') {
      const next = draft.translation.replace(/^안녕하세요[^\n]*[.!]?\s*/, `안녕하세요, ${name} 팀.\n\n`);
      if (next !== draft.translation) { draft.translation = next; changed = true; }
    }
    return changed;
  }

  const ids = new Set(load(IDS_KEY, []).filter(Boolean));
  const leads = load(LEADS_KEY, []);
  const draftsByKey = Object.fromEntries(DRAFT_KEYS.map(key => [key, load(key, {})]));
  let leadsChanged = false;
  let draftsChanged = false;

  for (const lead of Array.isArray(leads) ? leads : []) {
    if (!lead?.id || !ids.has(lead.id) || lead?.campaign !== 'kbeauty') continue;
    const current = clean(lead.company || lead.greeting_name || lead.raw_company, 100).replace(/\s+team$/i, '').trim();
    const next = repairedName(lead);
    if (!next || next === current) continue;
    lead.company = next;
    lead.greeting_name = next;
    lead.company_name_source = 'kbeauty-mail-display-guard-v1';
    leadsChanged = true;
    for (const drafts of Object.values(draftsByKey)) if (rewriteDraft(drafts?.[lead.id], next)) draftsChanged = true;
  }

  if (leadsChanged) save(LEADS_KEY, leads);
  if (draftsChanged) for (const [key, drafts] of Object.entries(draftsByKey)) save(key, drafts);
})();
