(() => {
  if (window.__KPA_KBEAUTY_RUNTIME_V4__) return;
  if (typeof state === 'undefined' || typeof render !== 'function' || typeof runHuntCycle !== 'function' || typeof post !== 'function') return;
  window.__KPA_KBEAUTY_RUNTIME_V4__ = true;

  const MAX_ATTEMPTS = 6;
  const TARGET_SENDABLE = 20;
  const MAX_CONTACTS_PER_RUN = 50;
  const clean = (value='', max=260) => String(value || '').replace(/\s+/g,' ').trim().slice(0,max);
  const esc = value => String(value || '').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const companyKey = value => clean(value,180).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const bannedLocal = /^(?:info|hello|contact|office|team|admin|general|inquiry|enquiry|business|support|help|service|cs|security|privacy|legal|billing|careers|jobs|hr|noreply|no-reply|abuse|postmaster|webmaster|mailer-daemon)$/i;
  const badCompany = /^(?:marketing\s*\/\s*events?|공식\s*사이트\s*확인\s*중|담당자|unknown|n\/a|null|undefined|-+)$/i;

  const host = value => {
    if (typeof rootHost === 'function') return rootHost(value || '');
    let raw=clean(value,500).toLowerCase();
    if(!raw)return'';
    if(raw.includes('@')&&!raw.includes('://'))raw=raw.split('@').pop()||'';
    try{raw=new URL(raw.includes('://')?raw:`https://${raw}`).hostname;}catch{raw=raw.split('/')[0].split(':')[0];}
    raw=raw.replace(/^www\./,'').replace(/\.+$/,'');
    const parts=raw.split('.').filter(Boolean);if(parts.length<=2)return raw;
    const second=new Set(['ac','co','com','edu','go','gov','ne','net','or','org']);
    const depth=parts.at(-1)?.length===2&&second.has(parts.at(-2))?3:2;
    return parts.slice(-depth).join('.');
  };

  const validCompany = lead => {
    const name=clean(lead?.company,180);
    return Boolean(name&&name.length>=2&&!badCompany.test(name));
  };

  const validEmail = email => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean(email,240));
  const localPart = email => clean(email,240).toLowerCase().split('@')[0] || '';

  function contactEligible(lead,contact){
    const email=clean(contact?.email,240).toLowerCase();
    if(!validEmail(email)||contact?.emailStatus==='invalid'||contact?.outreachEligible===false||bannedLocal.test(localPart(email))) return false;
    const companyDomain=host(lead?.domain||lead?.url||'');
    const mailDomain=host(email);
    if(!companyDomain||!mailDomain) return false;
    if(mailDomain===companyDomain) return true;
    if(contact?.officialPublished===true && host(contact?.sourceDomain||'')===companyDomain) return true;
    return false;
  }

  function allContacts(lead={}){
    const rows=[lead.contact,...(Array.isArray(lead.contacts)?lead.contacts:[]),...(Array.isArray(lead.discovered_contacts)?lead.discovered_contacts:[])].filter(Boolean);
    const seen=new Set();
    return rows.filter(row=>{const email=clean(row?.email,240).toLowerCase();if(!email||seen.has(email))return false;seen.add(email);return true;});
  }

  function sendableFor(lead={}){
    return allContacts(lead).find(contact=>contactEligible(lead,contact)) || null;
  }

  function normalizeLeadContacts(lead={}){
    const discovered=allContacts(lead);
    const eligible=discovered.filter(contact=>contactEligible(lead,contact));
    lead.discovered_contacts=discovered.slice(0,12);
    lead.contacts=eligible.slice(0,6);
    lead.contact=lead.contacts[0] || null;
    if(lead.contact){lead.contact_status='found';lead.contact_failure_reason='';lead.kbeauty_retry_at=0;}
    return lead;
  }

  function scoreLead(lead={}){
    return Number(Boolean(sendableFor(lead)))*100 + Number(Boolean(host(lead.domain||lead.url||'')))*20 + Number(lead.kbeauty_confirmed===true)*5 + Number(clean(lead.company,180).length>2);
  }

  function sanitizeKBeautyState(){
    const allK=(state.leads||[]).filter(lead=>lead?.campaign==='kbeauty');
    const other=(state.leads||[]).filter(lead=>lead?.campaign!=='kbeauty');
    const byCompany=new Map();
    for(const lead of allK.filter(validCompany)){
      normalizeLeadContacts(lead);
      delete lead.fast_contact_done;
      const key=companyKey(lead.company);if(!key)continue;
      const previous=byCompany.get(key);
      if(!previous||scoreLead(lead)>scoreLead(previous))byCompany.set(key,lead);
    }
    const byDomain=new Map(),noDomain=[];
    for(const lead of byCompany.values()){
      const domain=host(lead.domain||lead.url||'');
      if(!domain){noDomain.push(lead);continue;}
      const previous=byDomain.get(domain);
      if(!previous||scoreLead(lead)>scoreLead(previous))byDomain.set(domain,lead);
    }
    const cleaned=[...byDomain.values(),...noDomain];
    const validIds=new Set(cleaned.map(lead=>lead.id).filter(Boolean));
    for(const id of [...state.selected]){
      const lead=(state.leads||[]).find(item=>item.id===id);
      if(lead?.campaign==='kbeauty'&&!validIds.has(id))state.selected.delete(id);
    }
    const changed=cleaned.length!==allK.length;
    const maxBuffer=typeof MAX_BUFFER==='number'?MAX_BUFFER:1000;
    state.leads=[...other,...cleaned].slice(-maxBuffer);
    if(changed&&typeof saveState==='function')saveState();
    return cleaned;
  }

  function kbeautyLeads(){return(state.leads||[]).filter(lead=>lead?.campaign==='kbeauty'&&validCompany(lead));}
  function counts(){
    const leads=kbeautyLeads();
    return{
      leads,total:leads.length,sendable:leads.filter(sendableFor).length,
      direct:leads.filter(lead=>lead.kbeauty_confirmed===true).length,
      repeats:leads.filter(lead=>lead.kbeauty_repeat_prospect===true||lead.attendance_tier==='2025_repeat_prospect').length,
      sites:leads.filter(lead=>host(lead.domain||lead.url||'')).length,
      pending:leads.filter(lead=>!sendableFor(lead)&&Number(lead.kbeauty_contact_attempts||0)<MAX_ATTEMPTS).length
    };
  }

  function statusForLead(lead){
    if(sendableFor(lead))return'발송 가능 이메일 확보';
    if(lead.contact_status==='searching')return host(lead.domain||lead.url||'')?'회사 이메일 찾는 중':'공식 사이트 찾는 중';
    if(!host(lead.domain||lead.url||''))return'공식 사이트 미확보';
    if(Number(lead.kbeauty_contact_attempts||0)>=MAX_ATTEMPTS)return'발송 가능 이메일 미확보';
    return'회사 이메일 확인 대기';
  }

  function fixUi(){
    if(state.currentCampaign!=='kbeauty')return;
    const c=counts();
    const selected=[...state.selected].filter(id=>c.leads.some(lead=>lead.id===id)).length;
    const live=state.auto?'<span class="hunt-live">기존 후보 이메일 우선 탐색 중</span>':'';
    const status=clean(window.__kbeautyRuntimeStatus||'',220);
    const html=`<strong>K-Beauty 후보 ${c.total}개</strong><span>발송 가능 ${c.sendable}개</span><span>2026 직접 ${c.direct}개</span><span>2025 재참가 ${c.repeats}개</span><span>사이트 ${c.sites}/${c.total}</span><span>선택 ${selected}개</span>${live}${status?`<span>${esc(status)}</span>`:''}`;
    const summary=document.getElementById('summary');
    if(summary&&summary.innerHTML!==html)summary.innerHTML=html;

    document.querySelectorAll('tr.data-row').forEach(row=>{
      const id=row.querySelector('.lead-check')?.dataset?.id;
      const lead=c.leads.find(item=>item.id===id);if(!lead)return;
      const contact=sendableFor(lead),cell=row.querySelector('.contact');
      if(cell&&!contact)cell.innerHTML=`<small class="pending">${esc(statusForLead(lead))}</small>`;
      else if(cell&&contact){
        const actualName=clean(contact.name||`${contact.first_name||''} ${contact.last_name||''}`,120),actualTitle=clean(contact.title||'',120);
        if(!actualName&&!actualTitle)cell.innerHTML=`<strong>회사 이메일</strong><span>${esc(contact.email)}</span>`;
      }
      const company=row.querySelector('.company strong');if(company&&!clean(company.textContent,180))row.remove();
    });
    summary?.querySelector('.hunt-found')?.remove();
  }

  function resetLegacyFailuresOnce(){
    const key='kpa.kbeauty.email-priority.v4';
    if(localStorage.getItem(key)==='1')return;
    for(const lead of kbeautyLeads()){
      normalizeLeadContacts(lead);
      if(sendableFor(lead))continue;
      lead.kbeauty_contact_attempts=0;
      lead.kbeauty_retry_at=0;
      lead.contact_diagnostics=[];
      lead.contact_status=host(lead.domain||lead.url||'')?'pending':'website_pending';
      lead.contact_failure_reason='';
    }
    localStorage.setItem(key,'1');
    if(typeof saveState==='function')saveState();
  }

  function chunk(items,size){const out=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out;}
  function providerFailure(diagnostics=[]){
    return(Array.isArray(diagnostics)?diagnostics:[]).find(item=>item&&item.ok===false&&item.error&&!['not_configured','no_match','no_email','no_domain_match'].includes(item.error))||null;
  }

  function mergeDiscovered(current,raw=[]){
    const rows=[...allContacts(current),...(Array.isArray(raw)?raw:[])];
    const seen=new Set();
    current.discovered_contacts=rows.filter(row=>{const email=clean(row?.email,240).toLowerCase();if(!email||seen.has(email))return false;seen.add(email);return true;}).slice(0,12);
    normalizeLeadContacts(current);
  }

  async function runContactRecovery(limit=MAX_CONTACTS_PER_RUN){
    const now=Date.now();
    const candidates=kbeautyLeads().filter(lead=>{
      normalizeLeadContacts(lead);
      if(sendableFor(lead))return false;
      return Number(lead.kbeauty_contact_attempts||0)<MAX_ATTEMPTS&&Number(lead.kbeauty_retry_at||0)<=now;
    }).sort((a,b)=>Number(Boolean(host(b.domain||b.url||'')))-Number(Boolean(host(a.domain||a.url||'')))||Number(a.kbeauty_contact_attempts||0)-Number(b.kbeauty_contact_attempts||0)).slice(0,limit);
    if(!candidates.length)return{checked:0,found:0,resolved:0,failedBatches:0};

    const tools=typeof toolKeys==='function'?toolKeys():{};
    const batches=chunk(candidates,5);
    let checked=0,found=0,resolved=0,failedBatches=0;
    for(let index=0;index<batches.length;index+=1){
      const batch=batches[index];
      for(const lead of batch)lead.contact_status='searching';
      window.__kbeautyRuntimeStatus=`기존 후보 이메일 회수 ${index+1}/${batches.length} · ${Math.min((index+1)*5,candidates.length)}/${candidates.length}`;
      if(typeof saveState==='function')saveState();render();fixUi();
      let response;
      try{
        response=await post('/api/find-contacts',{action:'kbeauty_fast',exaKey:tools.exaKey||'',items:batch.map(lead=>({id:lead.id,company:lead.company,country:lead.team_origin_country||'',domain:lead.domain||'',url:lead.url||''}))},75000);
      }catch(error){
        failedBatches+=1;
        for(const lead of batch){
          const current=(state.leads||[]).find(item=>item.id===lead.id);if(!current)continue;
          current.contact_status=host(current.domain||current.url||'')?'pending':'website_pending';
          current.contact_failure_reason='연락처 검색 요청 실패';current.kbeauty_retry_at=Date.now()+30000;
        }
        if(typeof saveState==='function')saveState();render();fixUi();continue;
      }
      const rows=new Map((Array.isArray(response?.results)?response.results:[]).map(row=>[row.id,row]));
      for(const lead of batch){
        const current=(state.leads||[]).find(item=>item.id===lead.id);if(!current)continue;
        checked+=1;current.kbeauty_contact_attempts=Number(current.kbeauty_contact_attempts||0)+1;
        const row=rows.get(lead.id);current.contact_diagnostics=Array.isArray(row?.diagnostics)?row.diagnostics:[];
        if(row?.domain&&!host(current.domain||current.url||'')){current.domain=row.domain;current.url=row.url||`https://${row.domain}/`;current.website_unresolved=false;resolved+=1;}
        mergeDiscovered(current,row?.contacts||[]);
        const contact=sendableFor(current);
        if(contact){
          current.contact=contact;current.contacts=allContacts(current).filter(item=>contactEligible(current,item)).slice(0,6);current.contact_status='found';current.contact_failure_reason='';current.kbeauty_retry_at=0;found+=1;
        }else{
          current.contact=null;current.contacts=[];
          const providerProblem=providerFailure(current.contact_diagnostics),hasSite=Boolean(host(current.domain||current.url||''));
          current.contact_status=hasSite?'failed':'website_pending';
          current.contact_failure_reason=providerProblem?`${clean(providerProblem.provider,40)} ${clean(providerProblem.error,80)}`:hasSite?'발송 가능한 실제 회사 이메일 미확보':'공식 사이트 미확보';
          current.kbeauty_retry_at=Date.now()+(providerProblem?45000:hasSite?90000:45000);
        }
      }
      sanitizeKBeautyState();if(typeof saveState==='function')saveState();render();fixUi();
    }
    return{checked,found,resolved,failedBatches};
  }

  async function huntFreshCandidates(c){
    const cycleKey='kpa.hunt.cycle.kbeauty.v4';
    const cycle=Number(localStorage.getItem(cycleKey)||'0')+1;localStorage.setItem(cycleKey,String(cycle));
    window.__kbeautyRuntimeStatus='발송 가능한 기존 후보가 부족해 새 후보 1회 탐색 중';fixUi();
    const before=c.total;
    const result=await post('/api/kbeauty',{cycle,targetFloor:TARGET_SENDABLE,currentCount:before,excludeDomains:c.leads.map(lead=>lead.domain).filter(Boolean).slice(-500),tools:typeof toolKeys==='function'?toolKeys():{}},115000);
    if(typeof mergeLeads==='function')mergeLeads(result?.leads||[]);
    sanitizeKBeautyState();
    return{added:Math.max(0,counts().total-before),returned:Array.isArray(result?.leads)?result.leads.length:0};
  }

  const previousRun=runHuntCycle;
  runHuntCycle=async function kbeautyEmailFirstRun(){
    if(state.currentCampaign!=='kbeauty')return previousRun();
    sanitizeKBeautyState();resetLegacyFailuresOnce();
    let c=counts();
    window.__kbeautyRuntimeStatus=`기존 ${c.total}개부터 이메일 회수 · 발송 가능 ${c.sendable}/${TARGET_SENDABLE}`;render();fixUi();

    let first={checked:0,found:0,resolved:0,failedBatches:0};
    try{first=await runContactRecovery(MAX_CONTACTS_PER_RUN);}catch{window.__kbeautyRuntimeStatus='기존 후보 이메일 회수 일부 실패';render();fixUi();}
    sanitizeKBeautyState();c=counts();

    let hunt={added:0,returned:0};
    const mayAdd=c.sendable<TARGET_SENDABLE && (c.total<20 || (c.total<40&&c.pending===0));
    if(mayAdd){
      try{hunt=await huntFreshCandidates(c);}catch{window.__kbeautyRuntimeStatus='새 후보 탐색 실패 · 기존 후보 이메일은 유지';render();fixUi();}
      if(hunt.added>0){try{const second=await runContactRecovery(30);first.found+=second.found;first.resolved+=second.resolved;first.checked+=second.checked;first.failedBatches+=second.failedBatches;}catch{}}
    }

    sanitizeKBeautyState();c=counts();
    const failure=first.failedBatches?` · 실패 배치 ${first.failedBatches}`:'';
    window.__kbeautyRuntimeStatus=`발송 가능 ${c.sendable}/${TARGET_SENDABLE} · 이번 이메일 +${first.found} · 사이트 +${first.resolved} · 신규 후보 +${hunt.added}${failure}`;
    if(typeof saveState==='function')saveState();render();fixUi();
    return hunt.added;
  };

  const previousRender=render;
  render=function kbeautyCleanRender(){
    if(state.currentCampaign==='kbeauty')sanitizeKBeautyState();
    const result=previousRender();
    if(state.currentCampaign==='kbeauty')fixUi();
    return result;
  };

  sanitizeKBeautyState();resetLegacyFailuresOnce();
  if(state.currentCampaign==='kbeauty')render();
})();
