(() => {
  if (window.__KPA_KBEAUTY_RUNTIME_FIX__) return;
  if (typeof state === 'undefined' || typeof render !== 'function' || typeof runHuntCycle !== 'function' || typeof post !== 'function') return;
  window.__KPA_KBEAUTY_RUNTIME_FIX__ = true;

  const clean = (value='', max=260) => String(value || '').replace(/\s+/g,' ').trim().slice(0,max);
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
    if(Number(lead.kbeauty_contact_attempts||0)>=3) return '이메일 미확보';
    return '이메일 확인 대기';
  }

  function fixUi(){
    if(state.currentCampaign!=='kbeauty') return;
    const c=counts();
    const selected=[...state.selected].filter(id=>c.leads.some(lead=>lead.id===id)).length;
    const live=state.auto?'<span class="hunt-live">K-Beauty 이메일 우선 탐색 중</span>':'';
    const status=clean(window.__kbeautyRuntimeStatus||'',220);
    const safeStatus=status.replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
    const html=`<strong>K-Beauty 후보 ${c.total}개</strong><span>이메일 ${c.emails}개</span><span>2026 직접 ${c.direct}개</span><span>2025 재참가 ${c.repeats}개</span><span>사이트 ${c.sites}/${c.total}</span><span>선택 ${selected}개</span>${live}${status?`<span>${safeStatus}</span>`:''}`;
    const summary=document.getElementById('summary');
    if(summary&&summary.innerHTML!==html) summary.innerHTML=html;

    document.querySelectorAll('tr.data-row').forEach(row=>{
      const id=row.querySelector('.lead-check')?.dataset?.id;
      const lead=c.leads.find(item=>item.id===id);
      if(!lead) return;
      const contact=emailFor(lead);
      const cell=row.querySelector('.contact');
      if(cell&&!contact) cell.innerHTML=`<small class="pending">${statusForLead(lead)}</small>`;
      const company=row.querySelector('.company strong');
      if(company&&!clean(company.textContent,180)) row.remove();
    });
    summary?.querySelector('.hunt-found')?.remove();
  }

  async function runFastContacts(){
    const now=Date.now();
    const candidates=kbeautyLeads().filter(lead=>{
      if(emailFor(lead)) return false;
      const attempts=Number(lead.kbeauty_contact_attempts||0);
      const retryAt=Number(lead.kbeauty_retry_at||0);
      return attempts<3 && retryAt<=now;
    }).sort((a,b)=>Number(Boolean(b.domain))-Number(Boolean(a.domain)) || Number(a.kbeauty_contact_attempts||0)-Number(b.kbeauty_contact_attempts||0)).slice(0,70);
    if(!candidates.length) return {checked:0,found:0,resolved:0};

    for(const lead of candidates) lead.contact_status='searching';
    saveState(); render();
    const tools=typeof toolKeys==='function'?toolKeys():{};
    let response;
    try{
      response=await post('/api/find-contacts',{action:'kbeauty_fast',exaKey:tools.exaKey||'',items:candidates.map(lead=>({id:lead.id,company:lead.company,country:lead.team_origin_country||'',domain:lead.domain||'',url:lead.url||''}))},110000);
    }catch(error){
      for(const lead of candidates){lead.contact_status=lead.domain?'pending':'website_pending';lead.kbeauty_retry_at=Date.now()+60000;}
      saveState();render();throw error;
    }

    const rows=new Map((Array.isArray(response?.results)?response.results:[]).map(row=>[row.id,row]));
    let found=0,resolved=0;
    for(const lead of candidates){
      const current=(state.leads||[]).find(item=>item.id===lead.id); if(!current) continue;
      current.kbeauty_contact_attempts=Number(current.kbeauty_contact_attempts||0)+1;
      const row=rows.get(lead.id);
      if(row?.domain&&!current.domain){current.domain=row.domain;current.url=row.url||`https://${row.domain}/`;current.website_unresolved=false;resolved+=1;}
      const contacts=Array.isArray(row?.contacts)?row.contacts:[];
      if(contacts.length){
        current.contact=contacts[0];current.contacts=contacts;current.contact_provider=contacts[0]?.provider||'hunter';current.contact_status='found';current.contact_failure_reason='';current.kbeauty_retry_at=0;found+=1;
      }else{
        current.contact_status=current.domain?'failed':'website_pending';
        current.contact_failure_reason=current.domain?'실제 회사 이메일 미확보':'공식 사이트 미확보';
        current.kbeauty_retry_at=Date.now()+(current.domain?10*60*1000:3*60*1000);
      }
    }
    sanitizeKBeautyState();saveState();render();
    return {checked:candidates.length,found,resolved};
  }

  const previousRun=runHuntCycle;
  runHuntCycle=async function kbeautyFocusedRun(){
    if(state.currentCampaign!=='kbeauty') return previousRun();
    sanitizeKBeautyState();
    let c=counts(),actualAdded=0;

    if(c.total<20){
      const cycleKey='kpa.hunt.cycle.kbeauty.v1';
      const cycle=Number(localStorage.getItem(cycleKey)||'0')+1; localStorage.setItem(cycleKey,String(cycle));
      const before=c.total;
      window.__kbeautyRuntimeStatus='후보 20개 확보 중';fixUi();
      const result=await post('/api/kbeauty',{cycle,targetFloor:20,currentCount:c.total,excludeDomains:c.leads.map(lead=>lead.domain).filter(Boolean).slice(-500),tools:typeof toolKeys==='function'?toolKeys():{}},115000);
      if(typeof mergeLeads==='function') mergeLeads(result.leads||[]);
      sanitizeKBeautyState();c=counts();actualAdded=Math.max(0,c.total-before);
    }

    window.__kbeautyRuntimeStatus=`후보 ${c.total} · 이메일 ${c.emails} · 기존 후보 연락처부터 확인 중`;fixUi();
    let fast={checked:0,found:0,resolved:0};
    try{fast=await runFastContacts();}catch(error){window.__kbeautyRuntimeStatus='연락처 이번 회차 실패 · 다음 회차 재시도';fixUi();return actualAdded;}
    c=counts();
    window.__kbeautyRuntimeStatus=fast.checked?`실제 신규 +${actualAdded} · 이번 이메일 +${fast.found} · 사이트 +${fast.resolved}`:`후보 ${c.total} · 이메일 ${c.emails} · 재시도 대기 중`;
    fixUi();
    return actualAdded;
  };

  const previousRender=render;
  render=function kbeautyCleanRender(){
    if(state.currentCampaign==='kbeauty') sanitizeKBeautyState();
    const result=previousRender();
    if(state.currentCampaign==='kbeauty') fixUi();
    return result;
  };

  sanitizeKBeautyState();
  if(state.currentCampaign==='kbeauty') render();
})();
