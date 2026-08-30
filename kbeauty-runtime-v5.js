(() => {
  window.__KPA_KBEAUTY_RUNTIME_V4__ = true;
  if (window.__KPA_KBEAUTY_RUNTIME_V6_LOADING__) return;
  window.__KPA_KBEAUTY_RUNTIME_V6_LOADING__ = true;

  const TARGET_SENDABLE = 500;
  const TARGET_VERIFIED = 1200;
  const MAX_PROSPECTS = 1800;
  const MAX_STATE_LEADS = 1800;
  const MAX_QUEUE = 1800;
  const DOMAIN_PER_RUN = 18;
  const CONTACT_PER_RUN = 18;
  const DISCOVERY_QUEUE_FLOOR = 80;
  const MAX_DOMAIN_ATTEMPTS = 3;
  const MAX_CONTACT_ATTEMPTS = 4;
  const QUEUE_KEY = 'kpa.kbeauty.v6.queue';
  const DISCOVERY_CYCLE_KEY = 'kpa.kbeauty.v6.discoveryCycle';
  const REJECTED_COMPANY_KEY = 'kpa.kbeauty.v6.rejectedCompanies';
  const MIGRATION_KEY = 'kpa.kbeauty.runtime-v6.0-migrated';
  const SENT_CACHE_KEY = 'kpa.hunt.sentDomains.v1';
  const SENT_REFRESH_KEY = 'kpa.kbeauty.v6.sentRefreshAt';
  const DELETED_KEY = 'kpa.hunt.deletedDomains.v1';
  const SEEN_KEY = 'kpa.hunt.seenDomains.v1';
  const JUNK_LOCAL = /^(?:security|privacy|legal|billing|careers|jobs|hr|noreply|no-reply|abuse|postmaster|webmaster|mailer-daemon)$/i;
  const EVIDENCE_PROVIDER = /^(?:hunter|hunter_verify|jina|public_web|prospeo|apollo|tomba|official_site|official_recovery|nvidia_muse_glimmer|tavily)$/i;

  const clean = (value = '', max = 300) => String(value || '').replace(/\s+/g,' ').trim().slice(0,max);
  const companyKey = value => clean(value,180).toLowerCase().replace(/\b(?:inc|llc|ltd|limited|corp|corporation|company|co|gmbh|plc)\b/giu,' ').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
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
  const readJson = (key,fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };

  function installScaledSaveState() {
    if (saveState?.__kbeautyV6Scaled) return;
    const scaled = function saveStateForScale() {
      if (!Array.isArray(state.leads)) state.leads = [];
      if (state.leads.length > MAX_STATE_LEADS) state.leads = state.leads.slice(0,MAX_STATE_LEADS);
      localStorage.setItem('kpa.hunt.leads', JSON.stringify(state.leads));
      localStorage.setItem('kpa.hunt.selected', JSON.stringify([...state.selected]));
      localStorage.setItem('kpa.hunt.rejected', JSON.stringify([...state.rejected].slice(-2000)));
      localStorage.setItem('kpa.hunt.cycle', String(state.cycle || 0));
      localStorage.setItem('kpa.hunt.campaign', state.currentCampaign || 'kbeauty');
      if (state.stopped) localStorage.setItem('kpa.hunt.stopped','1'); else localStorage.removeItem('kpa.hunt.stopped');
    };
    scaled.__kbeautyV6Scaled = true;
    saveState = scaled;
  }

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
      else map.set(email,{...old,...row,email,sources:[...new Set([...(old.sources||[]),...(row.sources||[])])],providers:[...new Set([...(old.providers||[]),...(row.providers||[])])]});
    }
    return [...map.values()];
  }

  function acceptedContact(lead = {}) {
    return allContacts(lead).find(contact => contactAccepted(lead,contact)) || null;
  }

  function identityReady(lead = {}) {
    const identity=lead?.company_identity || {};
    const identityDomain=rootHost(identity?.domain || '');
    const leadDomain=rootHost(lead?.domain || lead?.url || '');
    return identity?.status==='verified' && Number(identity?.confidence||0)>=0.85
      && Boolean(clean(identity?.greeting_name,120)) && Boolean(clean(identity?.evidence_url,600))
      && Boolean(identityDomain) && identityDomain===leadDomain;
  }

  function mergeContacts(lead, incoming = []) {
    const rows = [...allContacts(lead),...(Array.isArray(incoming)?incoming:[])];
    const map = new Map();
    for (const row of rows) {
      const email = clean(row?.email,240).toLowerCase();
      if (!email) continue;
      const old = map.get(email);
      if (!old) map.set(email,{...row,email});
      else map.set(email,{...old,...row,email,sources:[...new Set([...(old.sources||[]),...(row.sources||[])])],providers:[...new Set([...(old.providers||[]),...(row.providers||[])])]});
    }
    lead.discovered_contacts = [...map.values()].slice(0,12);
    const accepted = lead.discovered_contacts.filter(contact => contactAccepted(lead,contact));
    lead.contacts = accepted.slice(0,6);
    lead.contact = lead.contacts[0] || null;
    if (lead.contact) {
      lead.contact_status = 'found';
      lead.contact_failure_reason = '';
      lead.kbeauty_v6_retry_at = 0;
    }
  }

  function leads() { return (state.leads || []).filter(validLead); }
  function queue() { return (readJson(QUEUE_KEY,[]) || []).filter(item => clean(item?.company,180)); }
  function rejectedCompanies() { return new Set((readJson(REJECTED_COMPANY_KEY,[]) || []).map(companyKey).filter(Boolean)); }
  function saveQueue(rows) { localStorage.setItem(QUEUE_KEY,JSON.stringify((Array.isArray(rows)?rows:[]).slice(0,MAX_QUEUE))); }
  function saveRejected(set) { localStorage.setItem(REJECTED_COMPANY_KEY,JSON.stringify([...set].slice(-2000))); }

  function counts() {
    const rows=leads(), q=queue();
    return {
      rows,total:rows.length,verified:rows.filter(identityReady).length,queue:q.length,sites:rows.filter(lead=>rootHost(lead.domain||lead.url||'')).length,
      sendable:rows.filter(lead=>identityReady(lead)&&Boolean(acceptedContact(lead))).length,
      contactPending:rows.filter(lead=>identityReady(lead)&&rootHost(lead.domain||lead.url||'')&&!acceptedContact(lead)&&Number(lead.kbeauty_v6_contact_attempts||0)<MAX_CONTACT_ATTEMPTS).length
    };
  }

  function parseSentCache() {
    const cached=readJson(SENT_CACHE_KEY,{});
    return Array.isArray(cached?.domains)?cached.domains:[];
  }

  function blockedDomains() {
    const values=[
      ...state.leads.map(lead=>lead.domain||lead.url||lead.contact?.email||''),
      ...state.rejected,
      ...(readJson(DELETED_KEY,[])||[]),
      ...(readJson(SEEN_KEY,[])||[]),
      ...parseSentCache()
    ];
    return new Set(values.map(rootHost).filter(Boolean));
  }

  async function refreshSentDomains() {
    const last=Number(localStorage.getItem(SENT_REFRESH_KEY)||0);
    if(Date.now()-last<5*60*1000) return;
    localStorage.setItem(SENT_REFRESH_KEY,String(Date.now()));
    try{
      const response=await fetch('/api/gmail?action=sent-domains',{method:'POST',cache:'no-store',credentials:'same-origin'});
      const data=await response.json().catch(()=>({}));
      if(response.ok&&Array.isArray(data?.domains)) localStorage.setItem(SENT_CACHE_KEY,JSON.stringify({savedAt:Date.now(),domains:data.domains.map(rootHost).filter(Boolean)}));
    }catch{}
  }

  function saveRender(status = '') {
    if (status) state.statusText = status;
    if (typeof saveState === 'function') saveState();
    if (typeof render === 'function') render();
  }

  function migrateOnce() {
    installScaledSaveState();
    if (localStorage.getItem(MIGRATION_KEY) === '1') return;
    for (const lead of leads()) {
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

  function existingCompanyKeys() {
    return new Set([...leads().map(lead=>companyKey(lead.company)),...queue().map(item=>companyKey(item.company)),...rejectedCompanies()].filter(Boolean));
  }

  function mergeQueue(incoming=[]) {
    const rows=queue(), seen=existingCompanyKeys(), added=[];
    for(const raw of Array.isArray(incoming)?incoming:[]) {
      const company=clean(raw?.company,180),key=companyKey(company);
      if(!company||!key||seen.has(key)) continue;
      seen.add(key);
      const item={...raw,company,kbeauty_v6_domain_attempts:0,kbeauty_v6_retry_at:0};
      rows.unshift(item); added.push(item);
      if(rows.length>=MAX_QUEUE) break;
    }
    saveQueue(rows);
    return added;
  }

  async function discoverMore() {
    const c=counts();
    if(c.sendable>=TARGET_SENDABLE) return {added:0,lane:'target_reached'};
    if(c.total+c.queue>=MAX_PROSPECTS) return {added:0,lane:'prospect_cap'};
    if(c.queue>=DISCOVERY_QUEUE_FLOOR) return {added:0,lane:'queue_backlog'};
    const cycle=Number(localStorage.getItem(DISCOVERY_CYCLE_KEY)||0)+1;
    localStorage.setItem(DISCOVERY_CYCLE_KEY,String(cycle));
    const blocked=[...blockedDomains()].slice(-1600);
    const excludeCompanies=[...new Set([...leads().map(lead=>lead.company),...queue().map(item=>item.company),...rejectedCompanies()])].slice(-1800);
    try{
      const result=await post('/api/kbeauty',{cycle,targetFloor:TARGET_VERIFIED,currentCount:c.verified,excludeDomains:blocked,excludeCompanies},76000);
      const added=mergeQueue(result?.candidates||[]);
      return {added:added.length,lane:clean(result?.meta?.lane,80),searched:Number(result?.meta?.search_results)||0,extracted:Number(result?.meta?.extracted)||0};
    }catch(error){
      return {added:0,lane:'error',error:clean(error?.message||'후보 검색 실패',160)};
    }
  }

  function messageFor(candidate,company) {
    if(candidate.tier==='current_kbeauty_2026') return `Hi,\n\nI saw that ${company} is connected to K-Beauty Expo Korea 2026 this October.\n\nHave you already sorted branded staff shirts or team wear for your Korea team?\n\nWe produce custom apparel locally in Korea and can deliver directly to KINTEX or your hotel, so your team does not need to ship boxes internationally.\n\nIf it is still open, I can send a few simple options with pricing and turnaround.`;
    if(candidate.tier==='kotra_selected_2026') return `Hi,\n\nI saw that ${company} is connected to a 2026 KOTRA buyer or delegation program around Korea's beauty industry.\n\nIf your team is coming to Korea this autumn, have you already sorted branded staff shirts or team wear? We produce locally in Korea and can deliver directly to your hotel or venue.\n\nIf useful, I can send a few simple options with pricing and turnaround.`;
    if(candidate.tier==='korea_beauty_upcoming_2026') return `Hi,\n\nI saw that ${company} is connected to an upcoming 2026 beauty event in Korea.\n\nIf your team is traveling to Korea this autumn, have you already sorted branded staff shirts or team wear? We produce locally in Korea and can deliver directly to your hotel or venue.\n\nIf useful, I can send a few simple options with pricing and turnaround.`;
    if(candidate.tier==='korea_beauty_event_2026') return `Hi,\n\nI saw that ${company} has already been active at a 2026 beauty-industry event in Korea. Are you planning another Korea trip for K-Beauty Expo Korea this October?\n\nIf yes, we produce branded staff shirts and team wear locally in Korea and can deliver directly to KINTEX or your hotel.\n\nIf useful, I can send a few simple options with pricing and turnaround.`;
    if(candidate.tier==='kbeauty_global_2026') return `Hi,\n\nI saw that ${company} has been active in a K-Beauty Expo event this year. Are you planning to be in Korea for the October show as well?\n\nIf yes, we produce branded staff shirts and team wear locally in Korea and can deliver directly to KINTEX or your hotel.\n\nIf useful, I can send a few simple options with pricing and turnaround.`;
    return `Hi,\n\nI saw that ${company} exhibited at K-Beauty Expo Korea last year. Are you coming back for the 2026 show this October?\n\nIf yes, have you already sorted branded staff shirts or team wear for your Korea team? We produce custom apparel locally in Korea and can deliver directly to KINTEX or your hotel.\n\nIf useful, I can send a few simple options with pricing and turnaround.`;
  }

  function makeLead(candidate,verified) {
    const company=clean(candidate.company,180),domain=rootHost(verified.domain),score=Math.max(70,Number(candidate.score)||70);
    const confirmed=candidate.tier==='current_kbeauty_2026';
    const signal=clean(candidate.signal||candidate.evidence_text||'',320) || (confirmed?'2026 K-Beauty Expo 직접 참가 신호':'한국 방문 가능성이 높은 뷰티 행사 신호');
    return {
      id:`kbeauty:${domain}`,campaign:'kbeauty',campaign_label:'K-Beauty Expo Korea 2026 단체복',company,domain,url:`https://${domain}/`,
      source_url:clean(candidate.source_url,600),source_title:clean(candidate.source_title,300),source_date:clean(candidate.source_date,80),
      score,sales_priority:score,verified_company:true,kbeauty_eligible:true,kbeauty_confirmed:confirmed,
      kbeauty_repeat_prospect:candidate.tier==='repeat_2025',attendance_tier:clean(candidate.tier,80),evidence_type:clean(candidate.evidence_type,80),
      team_origin:'foreign',team_origin_country:clean(verified.country||candidate.country,100),outreach_language:'en',signal,
      quality_reasons:[signal,'공식 회사 도메인 검증','해외 법인 확인'],verified_by:'K-Beauty v6 evidence + official-domain foreign verification',
      recommended_role:'Marketing / Events',role_targets:['Marketing Director','Brand Manager','Events Manager','International Sales','Export Manager','Partnerships','Founder','CEO'],
      offer:'한국 현지 단체복 제작 · KINTEX/호텔/행사장 직접 납품',reply_question:'한국 방문 시 단체복 준비 여부 확인',
      subject:confirmed?'Quick question about your K-Beauty Expo Korea team':'Quick question about your next Korea beauty event',
      message_en:messageFor(candidate,company),message_ko:'',contact:null,contacts:[],contact_status:'pending'
    };
  }

  function mergeVerifiedLead(candidate,verified) {
    const domain=rootHost(verified?.domain||''),key=companyKey(candidate?.company);
    if(!domain||!key||blockedDomains().has(domain)) return false;
    const existing=state.leads.some(lead=>rootHost(lead.domain||lead.url||'')===domain||companyKey(lead.company)===key);
    if(existing) return false;
    state.leads.unshift(makeLead(candidate,verified));
    if(state.leads.length>MAX_STATE_LEADS) state.leads=state.leads.slice(0,MAX_STATE_LEADS);
    return true;
  }

  async function resolveQueueBatch() {
    const now=Date.now(), rows=queue();
    const batch=rows.filter(item=>Number(item.kbeauty_v6_domain_attempts||0)<MAX_DOMAIN_ATTEMPTS&&Number(item.kbeauty_v6_retry_at||0)<=now).slice(0,DOMAIN_PER_RUN);
    if(!batch.length) return {checked:0,resolved:0,verified:0};
    const tools=typeof toolKeys==='function'?toolKeys():{};
    let domainResponse=null;
    try{
      domainResponse=await post('/api/find-contacts',{action:'kbeauty_domains',exaKey:tools.exaKey||'',items:batch.map(item=>({id:item.id,company:item.company,country:item.country||'',domain:'',url:''}))},62000);
    }catch{}
    const byId=new Map((Array.isArray(domainResponse?.results)?domainResponse.results:[]).map(row=>[row.id,row]));
    const resolved=[];
    for(const item of batch){
      item.kbeauty_v6_domain_attempts=Number(item.kbeauty_v6_domain_attempts||0)+1;
      const row=byId.get(item.id);
      if(row?.domain) resolved.push({...item,domain:row.domain,url:row.url||`https://${row.domain}/`});
      else item.kbeauty_v6_retry_at=Date.now()+30000;
    }

    let verifiedResponse={results:[]};
    if(resolved.length){
      try{
        verifiedResponse=await post('/api/kbeauty',{action:'verify_candidates',excludeDomains:[...blockedDomains()].slice(-1600),items:resolved.map(item=>({
          id:item.id,company:item.company,country:item.country||'',domain:item.domain,url:item.url,evidence_text:item.evidence_text||'',tier:item.tier,score:item.score
        }))},62000);
      }catch{}
    }
    const verifiedById=new Map((Array.isArray(verifiedResponse?.results)?verifiedResponse.results:[]).map(row=>[row.id,row]));
    const resolvedIds=new Set(resolved.map(item=>item.id));
    const rejected=rejectedCompanies();
    let verifiedCount=0;
    const remaining=[];
    for(const item of rows){
      if(!batch.some(b=>b.id===item.id)){ remaining.push(item); continue; }
      const verified=verifiedById.get(item.id);
      if(verified&&mergeVerifiedLead(item,verified)){ verifiedCount+=1; continue; }
      if(resolvedIds.has(item.id)) { rejected.add(companyKey(item.company)); continue; }
      if(Number(item.kbeauty_v6_domain_attempts||0)>=MAX_DOMAIN_ATTEMPTS) { rejected.add(companyKey(item.company)); continue; }
      remaining.push(item);
    }
    saveRejected(rejected); saveQueue(remaining); saveRender();
    if(verifiedCount&&typeof globalThis.KPA_COMPANY_IDENTITY_REFRESH==='function'){
      try{await globalThis.KPA_COMPANY_IDENTITY_REFRESH();}catch{}
    }
    return {checked:batch.length,resolved:resolved.length,verified:verifiedCount};
  }

  async function mapLimit(items,limit,worker) {
    const list=Array.isArray(items)?items:[]; let cursor=0;
    async function runner(){ while(cursor<list.length){ const i=cursor++; try{await worker(list[i],i);}catch{} } }
    await Promise.all(Array.from({length:Math.min(limit,list.length)},runner));
  }

  async function recoverContacts(limit=CONTACT_PER_RUN) {
    const now=Date.now();
    const candidates=leads().filter(lead=>identityReady(lead)&&rootHost(lead.domain||lead.url||'')&&!acceptedContact(lead)
      &&Number(lead.kbeauty_v6_contact_attempts||0)<MAX_CONTACT_ATTEMPTS&&Number(lead.kbeauty_v6_retry_at||0)<=now)
      .sort((a,b)=>Number(b.score||0)-Number(a.score||0)||Number(a.kbeauty_v6_contact_attempts||0)-Number(b.kbeauty_v6_contact_attempts||0)).slice(0,limit);
    if(!candidates.length) return {checked:0,found:0};
    const tools=typeof toolKeys==='function'?toolKeys():{}; let found=0;
    await mapLimit(candidates,4,async lead=>{
      const current=(state.leads||[]).find(item=>item.id===lead.id); if(!current)return;
      current.contact_status='searching'; current.kbeauty_v6_contact_attempts=Number(current.kbeauty_v6_contact_attempts||0)+1;
      try{
        const response=await post('/api/find-contacts',{action:'kbeauty_fast',exaKey:tools.exaKey||'',items:[{id:current.id,company:current.company,country:current.team_origin_country||'',domain:rootHost(current.domain||current.url||''),url:current.url}]},76000);
        const row=Array.isArray(response?.results)?response.results[0]:null;
        current.contact_diagnostics=Array.isArray(row?.diagnostics)?row.diagnostics:[];
        current.contact_provider_status=response?.meta?.provider_status||{};
        mergeContacts(current,row?.contacts||[]);
        if(acceptedContact(current)) found+=1;
        else{
          current.contact_status='failed';
          current.contact_failure_reason='공식/검색 근거에서 실제 회사 이메일 미확보';
          current.kbeauty_v6_retry_at=Date.now()+45000;
        }
      }catch(error){
        current.contact_status='pending'; current.contact_failure_reason=clean(error?.message||'이메일 검색 요청 실패',160); current.kbeauty_v6_retry_at=Date.now()+30000;
      }
    });
    saveRender(); return {checked:candidates.length,found};
  }

  async function runKBeautyV6() {
    migrateOnce(); await refreshSentDomains();
    let c=counts();
    saveRender(`K-Beauty v6 · 발송 가능 ${c.sendable}/${TARGET_SENDABLE} · Identity 검증 ${c.verified}/${TARGET_VERIFIED} · 적재 ${c.total} · 대기 ${c.queue}`);
    const discovery=await discoverMore();
    const resolved=await resolveQueueBatch();
    const contacts=await recoverContacts(CONTACT_PER_RUN);
    c=counts();
    state.statusText=`K-Beauty v6 · 발송 가능 ${c.sendable}/${TARGET_SENDABLE} · Identity 검증 ${c.verified}/${TARGET_VERIFIED} · 적재 ${c.total} · 대기 ${c.queue} · 이번 회차 후보 +${discovery.added} / 해외검증 +${resolved.verified} / 이메일 +${contacts.found}`;
    if(discovery.error) state.statusText+=` · 검색 오류 ${discovery.error}`;
    if(c.sendable>=TARGET_SENDABLE) state.statusText=`K-Beauty v6 목표 달성 · 발송 가능 ${c.sendable}/${TARGET_SENDABLE} · Identity 검증 ${c.verified}`;
    else if(c.total+c.queue>=MAX_PROSPECTS&&!c.contactPending&&resolved.checked===0) state.statusText=`K-Beauty v6 · 후보 풀 ${MAX_PROSPECTS}개 소진 · 발송 가능 ${c.sendable}/${TARGET_SENDABLE} · 추가 source 확장 필요`;
    saveRender();
    return discovery.added+resolved.verified;
  }

  function install() {
    if (window.__KPA_KBEAUTY_RUNTIME_V6__) return true;
    if (typeof state==='undefined'||typeof runHuntCycle!=='function'||typeof post!=='function'||typeof render!=='function'||typeof saveState!=='function'
      ||typeof CAMPAIGNS==='undefined'||!CAMPAIGNS.kbeauty||!window.__KPA_CAMPAIGN_RUN_CONTROLLER__) return false;
    installScaledSaveState();
    window.__KPA_KBEAUTY_RUNTIME_V5__=true;
    window.__KPA_KBEAUTY_RUNTIME_V6__=true;
    const previousRun=runHuntCycle;
    const owner=async function kbeautyScaleOwnerV6(){ if(state.currentCampaign!=='kbeauty') return previousRun(); return runKBeautyV6(); };
    runHuntCycle=owner;
    const guard=setInterval(()=>{if(runHuntCycle!==owner)runHuntCycle=owner;},50);
    setTimeout(()=>clearInterval(guard),8000);
    migrateOnce(); saveRender(); return true;
  }

  let attempts=0;
  const timer=setInterval(()=>{attempts+=1;if(install()||attempts>=300)clearInterval(timer);},40);
})();
