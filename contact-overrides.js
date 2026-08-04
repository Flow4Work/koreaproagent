(() => {
  const SUPABASE_URL = 'https://lumhnwhnuxfbghbuhhas.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_KRwgoo9SP-fCrYxLHYQ2hg_jtxx0lmR';
  const TABLE = 'kpa_contact_overrides';
  const LEADS_KEY = 'kpa.hunt.leads';
  const RELOAD_KEY = 'kpa.contact-overrides.signature.v2';
  const originalFetch = window.fetch.bind(window);

  function clean(value = '', max = 500) {
    return String(value || '').trim().slice(0, max);
  }

  function rootDomain(value = '') {
    let host = clean(value, 500).toLowerCase();
    try {
      host = new URL(host.includes('://') ? host : `https://${host}`).hostname;
    } catch {
      host = host.split('/')[0].split(':')[0];
    }
    host = host.replace(/^www\./, '').replace(/\.+$/, '');
    const parts = host.split('.').filter(Boolean);
    if (parts.length <= 2) return host;
    const commonSecond = new Set(['ac', 'co', 'com', 'edu', 'go', 'gov', 'ne', 'net', 'or', 'org']);
    const depth = parts.at(-1)?.length === 2 && commonSecond.has(parts.at(-2)) ? 3 : 2;
    return parts.slice(-depth).join('.');
  }

  function contactType(email = '') {
    const local = clean(email, 240).toLowerCase().split('@')[0] || '';
    return ['contact', 'hello', 'info', 'support', 'staking', 'events', 'partners', 'partnerships', 'business', 'sales', 'team'].includes(local)
      ? 'generic'
      : 'personal';
  }

  function shapeContact(row = {}) {
    const email = clean(row.email, 240).toLowerCase();
    const sources = [clean(row.source_url, 500)].filter(Boolean);
    return {
      name: clean(row.contact_name, 180),
      title: clean(row.title, 200) || 'Business Contact',
      email,
      emailStatus: clean(row.email_status, 40) || 'valid',
      type: contactType(email),
      sources,
      providers: ['manual_db', 'official_web'],
      provider: 'manual_db+official_web',
      score: 98,
      scoreBreakdown: { validation: 30, role: 28, identity: 20, domain: 10, evidence: 10, penalty: 0, total: 98 },
      qualified: true,
      verifiedOverride: true,
      verified_override: true,
      trustedCrossDomain: row.trusted_cross_domain === true,
      lookupDomain: rootDomain(row.lookup_domain),
      verifiedAt: clean(row.verified_at, 80),
      sourceLabel: clean(row.source_label, 240)
    };
  }

  async function loadRows() {
    const select = 'lookup_domain,email,contact_name,title,email_status,source_url,source_label,trusted_cross_domain,verified_at';
    const response = await originalFetch(`${SUPABASE_URL}/rest/v1/${TABLE}?select=${encodeURIComponent(select)}&active=eq.true`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: 'application/json'
      },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`contact_override_http_${response.status}`);
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  }

  const rowsPromise = loadRows().catch(error => {
    console.warn('verified contact DB unavailable', String(error?.message || error).slice(0, 160));
    return [];
  });

  async function contactsFor(value = '') {
    const domain = rootDomain(value);
    if (!domain) return [];
    const rows = await rowsPromise;
    return rows
      .filter(row => rootDomain(row.lookup_domain) === domain)
      .map(shapeContact)
      .filter(contact => contact.email)
      .slice(0, 4);
  }

  window.fetch = async function kpaFetch(input, init = {}) {
    const requestUrl = typeof input === 'string' ? input : input?.url || '';
    const method = clean(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET', 12).toUpperCase();
    if (method === 'POST' && /\/api\/contact(?:\?|$)/.test(requestUrl)) {
      try {
        const rawBody = typeof init?.body === 'string' ? init.body : '';
        const body = rawBody ? JSON.parse(rawBody) : {};
        if (!body.action && body.url) {
          const contacts = await contactsFor(body.url);
          if (contacts.length) {
            return new Response(JSON.stringify({
              contact: contacts[0],
              contacts,
              provider: 'manual_db+official_web',
              provider_status: { manual_db: true, official_web: true },
              attempts: [{ provider: 'manual_db', status: 'found', count: contacts.length }],
              qualified_count: contacts.length,
              score_threshold: 75,
              contact_status: 'qualified',
              failure_reason: null,
              stop_reason: 'verified_contact_override_found',
              cache_hit: false,
              target_contacts: 1
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
            });
          }
        }
      } catch {}
    }
    return originalFetch(input, init);
  };

  function overrideSignature(leads = []) {
    return leads
      .filter(lead => lead?.contact?.verifiedOverride === true)
      .map(lead => `${clean(lead.id, 220)}:${rootDomain(lead.domain || '')}:${clean(lead.contact?.email, 240).toLowerCase()}`)
      .sort()
      .join('|');
  }

  async function hydrateStoredLeads() {
    let leads = [];
    try { leads = JSON.parse(localStorage.getItem(LEADS_KEY) || '[]'); } catch { return; }
    if (!Array.isArray(leads) || !leads.length) return;

    let changed = false;
    for (const lead of leads) {
      const lookupValue = lead?.original_domain || lead?.url || lead?.domain || '';
      const contacts = await contactsFor(lookupValue);
      if (!contacts.length) continue;

      const primary = contacts[0];
      const currentEmail = clean(lead?.contact?.email, 240).toLowerCase();
      const emailDomain = rootDomain(primary.email.split('@')[1] || '');
      const currentDomain = rootDomain(lead?.domain || '');
      const lookupDomain = rootDomain(lookupValue);
      const normalizeToOrganizer = primary.trustedCrossDomain && emailDomain && emailDomain !== currentDomain;
      const alreadyHydrated = currentEmail === primary.email
        && lead?.contact?.verifiedOverride === true
        && (!normalizeToOrganizer || currentDomain === emailDomain);
      if (alreadyHydrated) continue;

      if (primary.trustedCrossDomain && lookupDomain && !lead.original_domain) lead.original_domain = lookupDomain;
      if (normalizeToOrganizer) lead.domain = emailDomain;
      lead.contact = primary;
      lead.contacts = contacts;
      lead.contact_provider = 'manual_db+official_web';
      lead.contact_status = 'found';
      changed = true;
    }

    if (!changed) return;
    localStorage.setItem(LEADS_KEY, JSON.stringify(leads));
    const signature = overrideSignature(leads);
    if (signature && sessionStorage.getItem(RELOAD_KEY) !== signature) {
      sessionStorage.setItem(RELOAD_KEY, signature);
      location.reload();
    }
  }

  hydrateStoredLeads().catch(() => {});
  setInterval(() => hydrateStoredLeads().catch(() => {}), 3000);
})();
