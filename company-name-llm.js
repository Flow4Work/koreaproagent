(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const DRAFT_KEY = 'kpa.mail.review.drafts.v5';
  const VERSION = 'v1';

  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const clean = (value = '', max = 300) => String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

  async function verifyNames() {
    const leads = load(LEADS_KEY, []);
    if (!Array.isArray(leads) || !leads.length) return;

    const targets = leads.filter(lead => lead?.company && lead.company_name_ai_version !== VERSION).map(lead => ({
      id: lead.id,
      company: lead.company,
      domain: lead.domain,
      source_title: lead.source_title,
      source_url: lead.source_url
    }));
    if (!targets.length) return;

    let response;
    try {
      response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ action: 'company_names', items: targets })
      });
    } catch { return; }

    if (!response.ok) return;
    const data = await response.json().catch(() => ({}));
    const names = new Map((Array.isArray(data.names) ? data.names : []).map(row => [clean(row?.id, 160), clean(row?.name, 80)]));
    if (!names.size) return;

    const drafts = load(DRAFT_KEY, {});
    let changed = false;

    leads.forEach(lead => {
      if (!lead?.id || lead.company_name_ai_version === VERSION) return;
      const nextName = names.get(clean(lead.id, 160));
      if (!nextName) return;

      const oldName = clean(lead.company, 160);
      lead.company_name_ai_version = VERSION;
      if (nextName === oldName) return;

      lead.company = nextName;
      changed = true;

      const draft = drafts[lead.id];
      if (!draft) return;
      if (typeof draft.body === 'string') draft.body = draft.body.replace(/^Hi [^\n]+ team,/i, `Hi ${nextName} team,`);
      if (typeof draft.translation === 'string') draft.translation = draft.translation.replace(/^안녕하세요,\s*[^\n]+\s*팀\./, `안녕하세요, ${nextName} 팀.`);
    });

    save(LEADS_KEY, leads);
    save(DRAFT_KEY, drafts);
    if (changed) location.reload();
  }

  verifyNames();
})();
