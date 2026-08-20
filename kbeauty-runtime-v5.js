(() => {
  // The legacy v4 runtime and event-mode K-Beauty recovery both wrapped runHuntCycle.
  // Block any later v4 execution; v5 installs after the event campaign/controller layers exist.
  window.__KPA_KBEAUTY_RUNTIME_V4__ = true;
  if (window.__KPA_KBEAUTY_RUNTIME_V5_LOADING__) return;
  window.__KPA_KBEAUTY_RUNTIME_V5_LOADING__ = true;

  const TARGET_SENDABLE = 20;
  const MAX_DOMAIN_ATTEMPTS = 3;
  const MAX_CONTACT_ATTEMPTS = 3;
  const MAX_DEEP_ATTEMPTS = 1;
  const DOMAIN_PER_CYCLE = 18;
  const CONTACT_PER_PASS = 12;
  const DEEP_PER_CYCLE = 2;
  const PRIORITY_DOMAINS = new Set(['imspackaging.com','ajmal.com','groupe-gilbert.fr','bulgarianrose.bg','ptn-healthcare.de','moririn.co.jp','alibaba.com','cnwellpack.com','zhuhaibaoli.com']);
  const JUNK_LOCAL = /^(?:security|privacy|legal|billing|careers|jobs|hr|noreply|no-reply|abuse|postmaster|webmaster|mailer-daemon)$/i;
  const EVIDENCE_PROVIDER = /^(?:hunter|hunter_verify|jina|public_web|prospeo|apollo|tomba|official_site|official_recovery|nvidia_muse_glimmer|tavily)$/i;
  const MIGRATION_KEY = 'kpa.kbeauty.runtime-v5.1-reset';

  const clean = (value = '', max = 300) => String(value || '').replace(/\s+/g,' ').trim().slice(0,max);
  const companyKey = value => clean(value,180).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const rootHost = value => {
    let raw = clean(value,500).toLowerCase();
    if (!raw) return '';
    if (raw.includes('@') && !raw.includes('://')) raw = raw.split('@').pop() || '';
    try { raw = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname; }
    catch { raw = raw.split('/')[0].split(':')[0]; }
    raw = raw.replace(/^www\./,'').replace(/\.+$/,'');
    const parts = raw.split('.').filter(Boolean);
    if (parts.length <= 2) return raw;
    const second = new Set(['ac','co','com','edu','go','gov','ne','net','or','org']);
    const depth = parts.at(-1)?.length === 2 && second.has(parts.at(-2)) ? 3 : 2;
    return parts.slice(-depth).join('.');
  };
  const validEmail = email => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean(email,240));
  const localPart = email => clean(email,240).toLowerCase().split('@')[0] || '';

  function validLead(lead = {}) {
    const company = clean(lead?.company,180);
    return lead?.campaign === 'kbeauty' && company.length >= 2 && !/^(?:marketing\s*\/\s*events?|공식\s*사이트\s*확인\s*중|담당자|unknown|n\/a|null|undefined|-+)$/i.test(company);
  }

  function providers(contact = {}) {
    return [...new Set([
      ...(Array.isArray(contact?.providers) ? contact.providers : []),
      ...String(contact?.provider || '').split('+')
    ].map(value => clean(value,60)).filter(Boolean))];
  }

  function sources(contact = {}) {
    return (Array.isArray(contact?.sources) ? contact.sources : [])
      .map(source => typeof source === 'string' ? source : source?.url || source?.uri || '')
      .map(value => clean(value,500)).filter(Boolean);
  }

  function contactAccepted(lead = {}, contact = {}) {
    const email = clean(contact?.email,240).toLowerCase();
    if (!validEmail(email) || contact?.emailStatus === 'invalid' || JUNK_LOCAL.test(localPart(email))) return false;
    const companyDomain = rootHost(lead?.domain || lead?.url || '');
    const emailDomain = rootHost(email);
    if (!companyDomain || !emailDomain || emailDomain !== companyDomain) return false;
    if (contact?.emailStatus === 'valid') return true;
    if (contact?.officialPublished === true && rootHost(contact?.sourceDomain || companyDomain) === companyDomain) return true;
    if (sources(contact).some(source => rootHost(source) === companyDomain)) return true;
    return providers(contact).some(provider => EVIDENCE_PROVIDER.test(provider));
  }

  function allContacts(lead = {}) {
    const rows = [lead?.contact,...(Array.isArray(lead?.contacts)?lead.contacts:[]),...(Array.isArray(lead?.discovered_contacts)?lead.discovered_contacts:[])].filter(Boolean);
    const map = new Map();
    for (const row of rows) {
      const email = clean(row?.email,240).toLowerCase();
      if (!email) continue;
      const old = map.get(email);
      if (!old) map.set(email,{...row,email});
      else map.set(email,{
        ...old,...row,email,
        sources:[...new Set([...(old.sources||[]),...(row.sources||[])])],
        providers:[...new Set([...(old.providers||[]),...(row.providers||[])])]
      });
    }
    return [...map.values()];
  }

  function acceptedContact(lead = {}) {
    return allContacts(lead).find(contact => contactAccepted(lead,contact)) || null;
  }

  function mergeContacts(lead, incoming = []) {
    const rows = [...allContacts(lead),...(Array.isArray(incoming)?incoming:[])];
    const map = new Map();
    for (const row of rows) {
      const email = clean(row?.email,240).toLowerCase();
      if (!email) continue;
      const old = map.get(email);
      if (!old) map.set(email,{...row,email});
      else map.set(email,{
        ...old,...row,email,
        sources:[...new Set([...(old.sources||[]),...(row.sources||[])])],
        providers:[...new Set([...(old.providers||[]),...(row.providers||[])])]
      });
    }
    lead.discovered_contacts = [...map.values()].slice(0,12);
    const accepted = lead.discovered_contacts.filter(contact => contactAccepted(lead,contact));
    lead.contacts = accepted.slice(0,6);
    lead.contact = lead.contacts[0] || null;
    if (lead.contact) {
      lead.contact_status = 'found';
      lead.contact_failure_reason = '';
      lead.kbeauty_v5_retry_at = 0;
    }
  }

  function leads() {
    return (state.leads || []).filter(validLead);
  }

  function counts() {
    const rows = leads();
    return {
      rows,
      total:rows.length,
      sites:rows.filter(lead => rootHost(lead.domain || lead.url || '')).length,
      sendable:rows.filter(lead => Boolean(acceptedContact(lead))).length,
      domainPending:rows.filter(lead => !rootHost(lead.domain || lead.url || '') && Number(lead.kbeauty_v5_domain_attempts || 0) < MAX_DOMAIN_ATTEMPTS).length,
      contactPending:rows.filter(lead => rootHost(lead.domain || lead.url || '') && !acceptedContact(lead) && Number(lead.kbeauty_v5_contact_attempts || 0) < MAX_CONTACT_ATTEMPTS).length
    };
  }

  function saveRender(status = '') {
    if (status) state.statusText = status;
    if (typeof saveState === 'function') saveState();
    if (typeof render === 'function') render();
  }

  function migrateOnce() {
    if (localStorage.getItem(MIGRATION_KEY) === '1') return;
    for (const lead of leads()) {
      delete lead.fast_contact_done;
      delete lead.kbeauty_v5_domain_attempts;
      delete lead.kbeauty_v5_contact_attempts;
      delete lead.kbeauty_v5_deep_attempts;
      delete lead.kbeauty_v5_retry_at;
      if (!acceptedContact(lead)) {
        lead.contact_status = rootHost(lead.domain || lead.url || '') ? 'pending' : 'website_pending';
        lead.contact_failure_reason = '';
      }
    }
    localStorage.setItem(MIGRATION_KEY,'1');
    saveRender();
  }

  async function mapLimit(items,limit,worker) {
    const list = Array.isArray(items)?items:[];
    let cursor = 0;
    async function runner() {
      while (cursor < list.length) {
        const index = cursor++;
        try { await worker(list[index],index); } catch {}
      }
    }
    await Promise.all(Array.from({length:Math.min(limit,list.length)},runner));
  }

  function prioritySort(a,b) {
    const ad = rootHost(a.domain || a.url || ''), bd = rootHost(b.domain || b.url || '');
    return Number(PRIORITY_DOMAINS.has(bd)) - Number(PRIORITY_DOMAINS.has(ad))
      || Number(a.kbeauty_v5_contact_attempts || 0) - Number(b.kbeauty_v5_contact_attempts || 0)
      || companyKey(a.company).localeCompare(companyKey(b.company));
  }

  async function recoverKnownDomains(limit = CONTACT_PER_PASS) {
    const now = Date.now();
    const candidates = leads()
      .filter(lead => rootHost(lead.domain || lead.url || '') && !acceptedContact(lead)
        && Number(lead.kbeauty_v5_contact_attempts || 0) < MAX_CONTACT_ATTEMPTS
        && Number(lead.kbeauty_v5_retry_at || 0) <= now)
      .sort(prioritySort).slice(0,limit);
    if (!candidates.length) return {checked:0,found:0};

    let found = 0;
    await mapLimit(candidates,4,async lead => {
      const current = (state.leads || []).find(item => item.id === lead.id);
      if (!current) return;
      current.contact_status = 'searching';
      current.kbeauty_v5_contact_attempts = Number(current.kbeauty_v5_contact_attempts || 0) + 1;
      if (typeof render === 'function') render();
      try {
        const response = await post('/api/contact',{
          url:`https://${rootHost(current.domain || current.url || '')}/`,
          recommendedRole:current.recommended_role || 'Marketing / Events',
          roleTargets:Array.isArray(current.role_targets)?current.role_targets:[]
        },36000);
        current.contact_diagnostics = Array.isArray(response?.attempts) ? response.attempts : [];
        current.contact_provider_status = response?.provider_status || {};
        mergeContacts(current,response?.contacts || []);
        if (acceptedContact(current)) found += 1;
        else {
          current.contact_status = 'failed';
          current.contact_failure_reason = clean(response?.failure_reason || response?.stop_reason || '공개/연결 공급자에서 회사 이메일 미확보',160);
          current.kbeauty_v5_retry_at = Date.now() + 30000;
        }
      } catch (error) {
        current.contact_status = 'pending';
        current.contact_failure_reason = clean(error?.message || '이메일 검색 요청 실패',160);
        current.kbeauty_v5_retry_at = Date.now() + 20000;
      }
    });
    saveRender();
    return {checked:candidates.length,found};
  }

  function chunk(items,size) {
    const out = [];
    for (let i=0;i<items.length;i+=size) out.push(items.slice(i,i+size));
    return out;
  }

  async function resolveMissingDomains(limit = DOMAIN_PER_CYCLE) {
    const now = Date.now();
    const candidates = leads()
      .filter(lead => !rootHost(lead.domain || lead.url || '')
        && Number(lead.kbeauty_v5_domain_attempts || 0) < MAX_DOMAIN_ATTEMPTS
        && Number(lead.kbeauty_v5_retry_at || 0) <= now)
      .sort((a,b)=>Number(a.kbeauty_v5_domain_attempts||0)-Number(b.kbeauty_v5_domain_attempts||0))
      .slice(0,limit);
    if (!candidates.length) return {checked:0,resolved:0};

    const tools = typeof toolKeys === 'function' ? toolKeys() : {};
    let resolved = 0, checked = 0;
    const batches = chunk(candidates,6);
    for (let i=0;i<batches.length;i+=1) {
      const batch = batches[i];
      for (const lead of batch) {
        const current = (state.leads || []).find(item => item.id === lead.id);
        if (current) current.contact_status = 'searching';
      }
      saveRender(`K-Beauty v5 · 공식 사이트 확인 ${i+1}/${batches.length} · 이메일 ${counts().sendable}/${TARGET_SENDABLE}`);
      let response = null;
      try {
        response = await post('/api/find-contacts',{
          action:'kbeauty_domains',
          exaKey:tools.exaKey || '',
          items:batch.map(lead => ({id:lead.id,company:lead.company,country:lead.team_origin_country||'',domain:lead.domain||'',url:lead.url||''}))
        },40000);
      } catch {}
      const byId = new Map((Array.isArray(response?.results)?response.results:[]).map(row => [row.id,row]));
      for (const lead of batch) {
        const current = (state.leads || []).find(item => item.id === lead.id);
        if (!current) continue;
        checked += 1;
        current.kbeauty_v5_domain_attempts = Number(current.kbeauty_v5_domain_attempts || 0) + 1;
        const row = byId.get(lead.id);
        current.domain_diagnostics = Array.isArray(row?.diagnostics)?row.diagnostics:[];
        if (row?.domain) {
          current.domain = row.domain;
          current.url = row.url || `https://${row.domain}/`;
          current.website_unresolved = false;
          current.contact_status = 'pending';
          current.contact_failure_reason = '';
          current.kbeauty_v5_retry_at = 0;
          resolved += 1;
        } else {
          current.contact_status = 'website_pending';
          current.contact_failure_reason = '공식 회사 도메인 미확보';
          current.kbeauty_v5_retry_at = Date.now() + 30000;
        }
      }
      saveRender();
    }
    return {checked,resolved};
  }

  async function deepFallback(limit = DEEP_PER_CYCLE) {
    const candidates = leads()
      .filter(lead => rootHost(lead.domain || lead.url || '') && !acceptedContact(lead)
        && Number(lead.kbeauty_v5_contact_attempts || 0) >= 1
        && Number(lead.kbeauty_v5_deep_attempts || 0) < MAX_DEEP_ATTEMPTS)
      .sort(prioritySort).slice(0,limit);
    if (!candidates.length) return {checked:0,found:0};
    const tools = typeof toolKeys === 'function' ? toolKeys() : {};
    let found = 0;
    await mapLimit(candidates,2,async lead => {
      const current = (state.leads || []).find(item => item.id === lead.id);
      if (!current) return;
      current.kbeauty_v5_deep_attempts = Number(current.kbeauty_v5_deep_attempts || 0) + 1;
      try {
        const response = await post('/api/find-contacts',{
          action:'kbeauty_fast',exaKey:tools.exaKey||'',
          items:[{id:current.id,company:current.company,country:current.team_origin_country||'',domain:current.domain||'',url:current.url||''}]
        },70000);
        const row = Array.isArray(response?.results) ? response.results[0] : null;
        if (row?.domain && !rootHost(current.domain || current.url || '')) {
          current.domain = row.domain; current.url = row.url || `https://${row.domain}/`;
        }
        mergeContacts(current,row?.contacts || []);
        if (acceptedContact(current)) found += 1;
      } catch {}
    });
    saveRender();
    return {checked:candidates.length,found};
  }

  async function seedIfNeeded() {
    const before = counts().total;
    if (before >= 20) return {added:0};
    const tools = typeof toolKeys === 'function' ? toolKeys() : {};
    try {
      const result = await post('/api/kbeauty',{
        cycle:Number(localStorage.getItem('kpa.hunt.cycle.kbeauty.v5')||'0')+1,
        targetFloor:20,currentCount:before,
        excludeDomains:leads().map(lead=>lead.domain).filter(Boolean).slice(-500),tools
      },100000);
      localStorage.setItem('kpa.hunt.cycle.kbeauty.v5',String(Number(localStorage.getItem('kpa.hunt.cycle.kbeauty.v5')||'0')+1));
      const added = typeof mergeLeads === 'function' ? mergeLeads(result?.leads || []) : [];
      return {added:Array.isArray(added)?added.length:0};
    } catch { return {added:0}; }
  }

  async function runKBeautyV5() {
    migrateOnce();
    let c = counts();
    saveRender(`K-Beauty v5 · 후보 ${c.total} · 사이트 ${c.sites}/${c.total} · 이메일 ${c.sendable}/${TARGET_SENDABLE}`);

    const seed = await seedIfNeeded();
    const first = await recoverKnownDomains(CONTACT_PER_PASS);
    const domains = await resolveMissingDomains(DOMAIN_PER_CYCLE);
    const second = domains.resolved ? await recoverKnownDomains(8) : {checked:0,found:0};
    const deep = await deepFallback(DEEP_PER_CYCLE);

    c = counts();
    const found = first.found + second.found + deep.found;
    state.statusText = `K-Beauty v5 · 이메일 +${found} · 사이트 +${domains.resolved} · 발송 가능 ${c.sendable}/${TARGET_SENDABLE} · 사이트 ${c.sites}/${c.total}`;

    const didWork = seed.added + first.checked + domains.checked + second.checked + deep.checked;
    if (!didWork && c.sendable < TARGET_SENDABLE) {
      state.statusText = `K-Beauty v5 · 현재 후보의 검색 경로 소진 · 발송 가능 ${c.sendable}/${TARGET_SENDABLE} · 사이트 ${c.sites}/${c.total}`;
      if (state.auto && state.autoCampaign === 'kbeauty') {
        state.auto = false;
        state.autoCampaign = '';
        state.autoUntil = 0;
      }
    }
    saveRender();
    return seed.added;
  }

  function install() {
    if (window.__KPA_KBEAUTY_RUNTIME_V5__) return true;
    if (typeof state === 'undefined' || typeof runHuntCycle !== 'function' || typeof post !== 'function'
      || typeof render !== 'function' || typeof saveState !== 'function' || typeof CAMPAIGNS === 'undefined'
      || !CAMPAIGNS.kbeauty || !window.__KPA_CAMPAIGN_RUN_CONTROLLER__) return false;

    window.__KPA_KBEAUTY_RUNTIME_V5__ = true;
    const previousRun = runHuntCycle;
    const owner = async function kbeautySingleOwnerV5() {
      if (state.currentCampaign !== 'kbeauty') return previousRun();
      return runKBeautyV5();
    };
    runHuntCycle = owner;

    // Reassert briefly so a late legacy runtime script cannot wrap K-Beauty again.
    const guard = setInterval(() => { if (runHuntCycle !== owner) runHuntCycle = owner; },50);
    setTimeout(() => clearInterval(guard),8000);

    migrateOnce();
    if (/^KBW 해외 신규 후보/.test(clean(state.statusText,200))) state.statusText = '';
    saveRender();
    return true;
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 300) clearInterval(timer);
  },40);
})();
