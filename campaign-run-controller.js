(() => {
  if (typeof state === 'undefined' || typeof runHuntCycle !== 'function' || window.__KPA_CAMPAIGN_RUN_CONTROLLER__) return;
  window.__KPA_CAMPAIGN_RUN_CONTROLLER__ = true;

  const SPECIAL = {
    bcww:{ short:'BCWW', endpoint:'/api/bcww', copy:'BCWW 2026 전용 검색 · 실제 참가 근거 → 해외 회사 → valid 회사 이메일 순서로 검증합니다.' },
    wsce:{ short:'WSCE', endpoint:'/api/wsce', copy:'WSCE 2026 전용 검색 · 공식 참가사/직접 참가 증거 → 해외 본체 → valid 회사 이메일 순서로 검증합니다.' },
    education_fair:{ short:'Education Fair', endpoint:'/api/education-fair', copy:'International Education Fair 2026 전용 검색 · 실제 참가기관 → 해외 본체 → valid 이메일 순서로 검증합니다.' }
  };
  const isSpecial = id => Boolean(SPECIAL[id]);
  const key = (kind,id) => `kpa.hunt.${kind}.${id}.v2`;
  const get = (kind,id) => localStorage.getItem(key(kind,id)) === '1';
  const set = (kind,id,on) => on ? localStorage.setItem(key(kind,id),'1') : localStorage.removeItem(key(kind,id));
  const count = id => (state.leads || []).filter(x => x?.campaign === id).length;
  window.__kpaCampaignMeta ||= {};

  const basePost = post;
  post = async (url,payload,timeout) => {
    const result = await basePost(url,payload,timeout);
    const id = Object.keys(SPECIAL).find(k => SPECIAL[k].endpoint === url);
    if (id) window.__kpaCampaignMeta[id] = { ...(result?.meta || {}), cycle:Number(payload?.cycle)||0, returned:Array.isArray(result?.leads)?result.leads.length:Number(result?.meta?.returned)||0 };
    return result;
  };

  const baseButton = updateMainButton;
  updateMainButton = function() {
    const id=state.currentCampaign;
    if(!isSpecial(id)) return baseButton();
    const b=document.getElementById('runBtn'); if(!b)return;
    const s=SPECIAL[id].short; b.classList.remove('auto-ready','hunting'); b.disabled=false;
    if(state.auto && state.autoCampaign===id){b.textContent=`${s} 자동사냥 중지`;b.classList.add('hunting');return;}
    if(state.manualRunning){b.textContent=`${s} 찾는 중…`;b.disabled=true;return;}
    if(get('stopped',id)){b.textContent=`${s} 새로 찾기`;return;}
    if(get('firstRun',id)){b.textContent=`${s} 자동사냥`;b.classList.add('auto-ready');return;}
    b.textContent=`${s} 후보 찾기`;
  };

  function status(id){
    const m=window.__kpaCampaignMeta[id]||{}, s=SPECIAL[id].short;
    if(id==='wsce') return `${s} 전용 ${Number(m.cycle)||1}회차 · 공식 상세 ${Number(m.official_detail_rows)||0}/${Number(m.official_detail_links_total)||Number(m.official_detail_rows)||0} (${Number(m.official_detail_batch_slot)||1}/${Number(m.official_detail_batch_slots)||1}구간) · 회사명 ${Number(m.official_named_rows)||0} · 해외 본체 ${Number(m.official_foreign_candidates)||0} · 출신국 미확인 ${Number(m.official_origin_unresolved)||0} · 웹 보강 ${Number(m.fallback_foreign_candidates)||0} · 신규 ${Number(m.returned)||0}`;
    if(id==='bcww') return `${s} 전용 ${Number(m.cycle)||1}회차 · 참가 검증 ${Number(m.evidence_verified_companies)||0} · 이메일 탐색 ${Number(m.contact_attempted)||0} · valid ${Number(m.contact_ready)||0} · 미확보 ${Number(m.contact_unresolved)||0}`;
    return `${s} 전용 ${Number(m.cycle)||1}회차 · 신규 ${Number(m.returned)||0}`;
  }
  function refresh(){
    const id=state.currentCampaign, sub=document.querySelector('.toolbar-title small');
    if(sub) sub.textContent=isSpecial(id)?SPECIAL[id].copy:'구매 신호와 실제 담당자를 찾고, 상대가 부담 없이 답할 수 있는 첫 메일까지 만듭니다.';
    updateMainButton();
    if(!isSpecial(id)) return;
    const summary=document.getElementById('summary'), live=summary?.querySelector('.hunt-live'); if(!summary)return;
    if(!live){summary.querySelector('.hunt-found')?.remove();return;}
    const time=live.textContent.match(/(\d+:\d{2})/)?.[1] || (typeof remainingText==='function'?remainingText():'00:00');
    const liveText=`${SPECIAL[id].short} 자동사냥 종료까지 ${time} 남음`; if(live.textContent!==liveText) live.textContent=liveText;
    let found=summary.querySelector('.hunt-found'); if(!found){found=document.createElement('strong');found.className='hunt-found';live.after(found);}
    const base=state.__campaignAutoBaseline?.id===id?Number(state.__campaignAutoBaseline.count)||0:count(id);
    const foundText=`+ ${Math.max(0,count(id)-base)}개 찾음`; if(found.textContent!==foundText) found.textContent=foundText;
  }
  const renderMeta=id=>{if(window.__kpaCampaignMeta[id]){state.statusText=status(id);render();}};
  const wait=()=>new Promise(resolve=>{const ms=4500+Math.random()*4500,at=Date.now(),t=setInterval(()=>{if(!state.auto||Date.now()-at>=ms){clearInterval(t);resolve();}},250);});
  function stop(id,msg){state.auto=false;state.autoCampaign='';state.autoUntil=0;abortAll();set('stopped',id,true);state.statusText=msg||`${SPECIAL[id].short} 자동사냥 중지 · 현재 결과 유지`;saveState();render();refresh();}

  async function once(id){
    if(state.manualRunning||state.auto||state.currentCampaign!==id)return;
    set('stopped',id,false);state.manualRunning=true;state.statusText=`${SPECIAL[id].short} 전용 검색 시작`;render();
    try{await runHuntCycle();set('firstRun',id,true);renderMeta(id);}catch(e){state.statusText=String(e?.message||`${SPECIAL[id].short} 검색 실패`).slice(0,140);}
    finally{state.manualRunning=false;saveState();render();refresh();}
  }
  async function auto(id){
    if(state.auto||state.manualRunning||state.currentCampaign!==id)return;
    set('stopped',id,false);state.auto=true;state.autoCampaign=id;state.autoUntil=Date.now()+15*60*1000;state.__campaignAutoBaseline={id,count:count(id)};state.statusText=`${SPECIAL[id].short} 전용 자동사냥 시작`;saveState();render();refresh();
    while(state.auto&&state.autoCampaign===id&&state.currentCampaign===id&&Date.now()<state.autoUntil){
      try{await runHuntCycle();set('firstRun',id,true);renderMeta(id);}catch(e){if(!state.auto)break;state.statusText=`${SPECIAL[id].short} 이번 회차 실패 · ${String(e?.message||'').slice(0,100)}`;render();}
      if(!state.auto||state.currentCampaign!==id||Date.now()>=state.autoUntil)break; await wait();
    }
    if(state.auto&&state.autoCampaign===id){state.auto=false;state.autoCampaign='';state.autoUntil=0;set('stopped',id,true);state.statusText=`${SPECIAL[id].short} 자동사냥 완료 · 신규 ${Math.max(0,count(id)-Number(state.__campaignAutoBaseline?.count||0))}개 · 완전 정지`;saveState();render();}
    refresh();
  }

  window.addEventListener('click',e=>{
    if(!e.target?.closest?.('#runBtn'))return; const id=state.currentCampaign;if(!isSpecial(id))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(state.auto&&state.autoCampaign===id)return stop(id);
    if(state.auto&&state.autoCampaign&&state.autoCampaign!==id)stop(state.autoCampaign,'캠페인 전환으로 이전 자동사냥 중지');
    if(get('stopped',id)||!get('firstRun',id)) return void once(id); return void auto(id);
  },true);
  document.getElementById('campaignSelect')?.addEventListener('change',e=>{const running=state.autoCampaign;if(state.auto&&running&&running!==e.target.value&&isSpecial(running))stop(running,`${SPECIAL[running].short} 자동사냥 중지 · 캠페인 전환`);setTimeout(refresh,0);},true);
  const summary=document.getElementById('summary'); if(summary)new MutationObserver(()=>requestAnimationFrame(refresh)).observe(summary,{childList:true,subtree:true,characterData:true});
  refresh();
})();
