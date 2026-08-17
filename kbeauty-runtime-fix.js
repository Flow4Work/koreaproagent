(() => {
  if (window.__KPA_KBEAUTY_RUNTIME_FIX__) return;
  if (typeof state === 'undefined' || typeof render !== 'function' || typeof runHuntCycle !== 'function' || typeof post !== 'function') return;
  window.__KPA_KBEAUTY_RUNTIME_FIX__ = true;

  const clean = (value='', max=260) => String(value || '').replace(/\s+/g,' ').trim().slice(0,max);
  const esc = value => String(value || '').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const companyKey = value => clean(value,180).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const badCompany = /^(?:marketing\s*\/\s*events?|공식\s*사이트\s*확인\s*중|담당자|unknown|n\/a|null|undefined|-+)$/i;
  const validCompany = lead => {
    const name = clean(lead?.company,180);
    return Boolean(name && name.length >= 2 && !badCompany.test(name));
  };
  const emailFor = lead => {
    const rows=[lead?.contact,...(Array.isArray(lead?.contacts)?lead.contacts:[])].filter(Boolean);
    const companyDomain=typeof rootHost==='function'?rootHost(lead?.domain||lead?.url||''):'';
    return rows.find(contact=>{
      const email=clean(contact?.email,240).toLowerCase();
      if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return false;
      if(contact?.emailStatus==='invalid') return false;
      const domain=email.split('@')[1]||'';
      return companyDomain && (domain===companyDomain || domain.endsWith(`.${companyDomain}`));
    }) || null;
  };

  function scoreLead(lead={}) {
    return Number(Boolean(emailFor(lead)))*100 + Number(Boolean(lead.domain))*20 + Number(lead.kbeauty_confirmed===true)*5 + Number(clean(lead.company,180).length>2);
  }

  function sanitizeKBeautyState() {
    const allK=(state.leads||[]).filter(lead=>lead?.campaign==='kbeauty');
    const other=(state.leads||[]).filter(lead=>lead?.campaign!=='kbeauty');
    const candidates=allK.filter(validCompany);
    const byCompany=new Map();
    for(const lead of candidates){
      delete lead.fast_contact_done;
      const key=companyKey(lead.company);
      if(!key) continue;
      const previous=byCompany.get(key);
      if(!previous || scoreLead(lead)>scoreLead(previous)) byCompany.set(key,lead);
    }
    const byDomain=new Map(), noDomain=[];
    for(const lead of byCompany.values()){
      const domain=typeof rootHost==='function'?rootHost(lead.domain||lead.url||''):clean(lead.domain,200).toLowerCase();
      if(!domain){noDomain.push(lead);continue;}
      const previous=byDomain.get(domain);
      if(!previous || scoreLead(lead)>scoreLead(previous)) byDomain.set(domain,lead);
    }
    const cleaned=[...byDomain.values(),...noDomain];
    const validIds=new Set(cleaned.map(lead=>lead.id).filter(Boolean));
    for(const id of [...state.selected]){
      const lead=(state.leads||[]).find(item=>item.id===id);
      if(lead?.campaign==='kbeauty'&&!validIds.has(id)) state.selected.delete(id);
    }
    const changed=cleaned.length!==allK.length;
    state.leads=[...other,...cleaned].slice(-MAX_BUFFER);
    if(changed) saveState();
    return cleaned;
  }

  function resetLegacyContactFailuresOnce(){
    const key='kpa.kbeauty.contact-strategy.v3';
    if(localStorage.getItem(key)==='1') return;
    for(const lead of (state.leads||[])){
      if(lead?.campaign!=='kbeauty'||emailFor(lead)) continue;
      lead.kbeauty_contact_attempts=0;
      lead.kbeauty_retry_at=0;
      lead.contact_diagnostics=[];
      if(lead.contact_status==='failed') lead.contact_status=lead.domain?'pending':'website_pending';
      lead.contact_failure_reason='';
    }
    localStorage.setItem(key,'1');
    saveState();
  }

  function kbeautyLeads(){ return (state.leads||[]).filter(lead=>lead?.campaign==='kbeauty'&&validCompany(lead)); }
  function counts(){
    const leads=kbeautyLeads();
    return {
      leads,total:leads.length,emails:leads.filter(emailFor).length,
      direct:leads.filter(lead=>lead.kbeauty_confirmed===true).length,
      repeats:leads.filter(lead=>lead.kbeauty_repeat_prospect===true||lead.attendance_tier==='2025_repeat_prospect').length,
      sites:leads.filter(lead=>clean(lead.domain,200)).length
    };
  }

  function statusForLead(lead){
    if(emailFor(lead)) return '이메일 확보';
    if(lead.contact_status==='searching') return lead.domain?'이메일 찾는 중':'공식 사이트 찾는 중';
    if(!lead.domain) return '공식 사이트 미확보';
    if(Number(lead.kbeauty_contact_attempts||0)>=4) return '이메일 미확보';
    return '이메일 확인 대기';
  }

  function fixUi(){
    if(state.currentCampaign!=='kbeauty') return;
    const c=counts();
    const selected=[...state.selected].filter(id=>c.leads.some(lead=>lead.id===id)).length;
    const live=state.auto?'<span class="hunt-live">K-Beauty 신규 후보 + 이메일 탐색 중</span>':'';
    const status=clean(window.__kbeautyRuntimeStatus||'',220);
    const html=`<strong>K-Beauty 후보 ${c.total}개</strong><span>이메일 ${c.emails}개</span><span>2026 직접 ${c.direct}개</span><span>2025 재참가 ${c.repeats}개</span><span>사이트 ${c.sites}/${c.total}</span><span>선택 ${selected}개</span>${live}${status?`<span>${esc(status)}</span>`:''}`;
    const summary=document.getElementById('summary');
    if(summary&&summary.innerHTML!==html) summary.innerHTML=html;

    document.querySelectorAll('tr.data-row').forEach(row=>{
      const id=row.querySelector('.lead-check')?.dataset?.id;
      const lead=c.leads.find(item=>item.id===id);
      if(!lead) return;
      const contact=emailFor(lead);
      const cell=row.querySelector('.contact');
      if(cell&&!contact) {
        cell.innerHTML=`<small class="pending">${esc(statusForLead(lead))}</small>`;
      } else if(cell&&contact) {
        const actualName=clean(contact.name||`${contact.first_name||''} ${contact.last_name||''}`,120);
        const actualTitle=clean(contact.title||'',120);
        if(!actualName&&!actualTitle) cell.innerHTML=`<strong>회사 이메일</strong><span>${esc(contact.email)}</span>`;
      }
      const company=row.querySelector('.company strong');
      if(company&&!clean(company.textContent,180)) row.remove();
    });
    summary?.querySelector('.hunt-found')?.remove();
  }

  function chunk(items,size){
    const out=[];
    for(let i=0;i<items.length;i+=size) out.push(items.slice(i,i+size));
    return out;
  }

  function providerFailure(diagnostics=[]){
    return (Array.isArray(diagnostics)?diagnostics:[]).find(item=>
      item && item.ok===false && item.error && !['not_configured','no_match','no_email','no_domain_match'].includes(item.error)
    ) || null;
  }

  async function runFastContacts(){
    const now=Date.now();
    const candidates=kbeautyLeads().filter(lead=>{
      if(emailFor(lead)) return false;
      const attempts=Number(lead.kbeauty_contact_attempts||0);
      const retryAt=Number(lead.kbeauty_retry_at||0);
      return attempts<4 && retryAt<=now;
    }).sort((a,b)=>Number(a.kbeauty_contact_attempts||0)-Number(b.kbeauty_contact_attempts||0) || Number(Boolean(b.domain))-Number(Boolean(a.domain))).slice(0,30);
    if(!candidates.length) return {checked:0,found:0,resolved:0,failedBatches:0};

    const tools=typeof toolKeys==='function'?toolKeys():{};
    const batches=chunk(candidates,5);
    let checked=0,found=0,resolved=0,failedBatches=0;

    for(let index=0;index<batches.length;index+=1){
      const batch=batches[index];
      for(const lead of batch) lead.contact_status='searching';
      window.__kbeautyRuntimeStatus=`이메일 탐색 ${index+1}/${batches.length} · ${Math.min((index+1)*5,candidates.length)}/${candidates.length}`;
      saveState();render();fixUi();

      let response;
      try{
        response=await post('/api/find-contacts',{action:'kbeauty_fast',exaKey:tools.exaKey||'',items:batch.map(lead=>({id:lead.id,company:lead.company,country:lead.team_origin_country||'',domain:lead.domain||'',url:lead.url||''}))},60000);
      }catch(error){
        failedBatches+=1;
        for(const lead of batch){
          const current=(state.leads||[]).find(item=>item.id===lead.id); if(!current) continue;
          current.contact_status=current.domain?'pending':'website_pending';
          current.contact_failure_reason='연락처 검색 요청 실패';
          current.kbeauty_retry_at=Date.now()+45000;
        }
        saveState();render();fixUi();
        continue;
      }

      const rows=new Map((Array.isArray(response?.results)?response.results:[]).map(row=>[row.id,row]));
      for(const lead of batch){
        const current=(state.leads||[]).find(item=>item.id===lead.id); if(!current) continue;
        checked+=1;
        current.kbeauty_contact_attempts=Number(current.kbeauty_contact_attempts||0)+1;
        const row=rows.get(lead.id);
        current.contact_diagnostics=Array.isArray(row?.diagnostics)?row.diagnostics:[];
        if(row?.domain&&!current.domain){current.domain=row.domain;current.url=row.url||`https://${row.domain}/`;current.website_unresolved=false;resolved+=1;}
        const contacts=Array.isArray(row?.contacts)?row.contacts:[];
        if(contacts.length){
          current.contact=contacts[0];current.contacts=contacts;current.contact_provider=contacts[0]?.provider||'official_site';current.contact_status='found';current.contact_failure_reason='';current.kbeauty_retry_at=0;found+=1;
        }else{
          const providerProblem=providerFailure(current.contact_diagnostics);
          current.contact_status=current.domain?'failed':'website_pending';
          current.contact_failure_reason=providerProblem
            ? `${clean(providerProblem.provider,40)} ${clean(providerProblem.error,80)}`
            : current.domain?'실제 회사 이메일 미확보':'공식 사이트 미확보';
          current.kbeauty_retry_at=Date.now()+(providerProblem?60*1000:current.domain?5*60*1000:90*1000);
        }
      }
      sanitizeKBeautyState();saveState();render();fixUi();
    }
    return {checked,found,resolved,failedBatches};
  }

  async function huntFreshCandidates(c){
    const cycleKey='kpa.hunt.cycle.kbeauty.v2';
    const lastKey='kpa.hunt.last.kbeauty.v2';
    const last=Number(localStorage.getItem(lastKey)||'0');
    const age=Date.now()-last;
    if(c.total>=60 && last && age<5*60*1000) return {added:0,passes:0,lastReturned:0,throttled:true};
    if(c.total>=30 && last && age<90*1000) return {added:0,passes:0,lastReturned:0,throttled:true};
    let stored=Number(localStorage.getItem(cycleKey)||'0');
    let cycle=Math.max(stored,Math.floor(c.total/32));
    let added=0,passes=0,lastReturned=0;
    while(passes<3 && added<20){
      cycle+=1; passes+=1;
      localStorage.setItem(cycleKey,String(cycle));
      const before=counts().total;
      window.__kbeautyRuntimeStatus=`새 후보 탐색 중 · ${passes}차`;fixUi();
      const result=await post('/api/kbeauty',{
        cycle,targetFloor:20,currentCount:before,
        excludeDomains:counts().leads.map(lead=>lead.domain).filter(Boolean).slice(-500),
        tools:typeof toolKeys==='function'?toolKeys():{}
      },115000);
      lastReturned=Array.isArray(result?.leads)?result.leads.length:0;
      localStorage.setItem(lastKey,String(Date.now()));
      if(typeof mergeLeads==='function') mergeLeads(result.leads||[]);
      sanitizeKBeautyState();
      const after=counts().total;
      added+=Math.max(0,after-before);
      if(lastReturned===0) break;
      if(after===before && passes>=2) break;
    }
    return {added,passes,lastReturned};
  }

  const previousRun=runHuntCycle;
  runHuntCycle=async function kbeautyFocusedRun(){
    if(state.currentCampaign!=='kbeauty') return previousRun();
    sanitizeKBeautyState();
    resetLegacyContactFailuresOnce();
    let c=counts();

    let hunt={added:0,passes:0,lastReturned:0};
    try{
      hunt=await huntFreshCandidates(c);
    }catch(error){
      window.__kbeautyRuntimeStatus='신규 후보 탐색 일부 실패 · 기존 후보 이메일 계속 확인';fixUi();
    }

    c=counts();
    window.__kbeautyRuntimeStatus=`후보 ${c.total} · 신규 +${hunt.added} · 이메일 탐색 중`;fixUi();
    let fast={checked:0,found:0,resolved:0,failedBatches:0};
    try{fast=await runFastContacts();}catch(error){window.__kbeautyRuntimeStatus=`신규 +${hunt.added} · 연락처 이번 회차 일부 실패`;fixUi();return hunt.added;}
    c=counts();
    const batchFailure=fast.failedBatches?` · 실패 배치 ${fast.failedBatches}`:'';
    window.__kbeautyRuntimeStatus=`실제 신규 +${hunt.added} · 이번 이메일 +${fast.found} · 사이트 +${fast.resolved} · 총 후보 ${c.total}${batchFailure}`;
    fixUi();
    return hunt.added;
  };

  const previousRender=render;
  render=function kbeautyCleanRender(){
    if(state.currentCampaign==='kbeauty') sanitizeKBeautyState();
    const result=previousRender();
    if(state.currentCampaign==='kbeauty') fixUi();
    return result;
  };

  sanitizeKBeautyState();
  resetLegacyContactFailuresOnce();
  if(state.currentCampaign==='kbeauty') render();
})();
