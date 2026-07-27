const $ = (id) => document.getElementById(id);
const state = { data: null, activeTab: 'prospects' };

const fields = ['clientUrl','productHint','targetNotes','seeds','count','mode'];

function escapeHtml(v='') { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function safeUrl(v='') { try { const u = new URL(v); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
function host(v='') { try { return new URL(v).hostname.replace(/^www\./,''); } catch { return v; } }

async function checkHealth(){
  try{
    const r = await fetch('/api/health'); const d = await r.json();
    $('apiStatus').className = `status ${d.groqConfigured ? 'ok':'bad'}`;
    $('apiStatus').innerHTML = `<span class="dot"></span><span>${d.groqConfigured ? 'Groq 연결됨':'API 키 필요'}</span>`;
  }catch{$('apiStatus').className='status bad';$('apiStatus').innerHTML='<span class="dot"></span><span>API 확인 실패</span>'}
}

function saveForm(){ const v={}; fields.forEach(id=>v[id]=$(id).value); localStorage.setItem('kpa.form',JSON.stringify(v)); }
function loadForm(){ try{const v=JSON.parse(localStorage.getItem('kpa.form')||'{}');fields.forEach(id=>{if(v[id]!=null)$(id).value=v[id]})}catch{} }
function saveResult(){ if(state.data)localStorage.setItem('kpa.result',JSON.stringify(state.data)); }
function loadResult(){ try{const d=JSON.parse(localStorage.getItem('kpa.result')||'null');if(d?.prospects?.length){state.data=d;renderResults();}}catch{} }

function setBusy(on){
  $('runBtn').disabled=on;
  $('runBtn').querySelector('span').textContent=on?'리서치 진행 중':'한국 잠재고객 분석';
  $('emptyState').classList.toggle('hidden',on||!!state.data);
  $('loadingState').classList.toggle('hidden',!on);
  $('errorState').classList.add('hidden');
  if(on)$('results').classList.add('hidden');
}

async function run(){
  const clientUrl=$('clientUrl').value.trim();
  if(!clientUrl){showError('고객 SaaS URL을 입력하세요.');return;}
  saveForm(); setBusy(true);
  const payload={clientUrl,productHint:$('productHint').value,targetNotes:$('targetNotes').value,seeds:$('seeds').value,count:Number($('count').value),mode:$('mode').value};
  try{
    const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const d=await r.json(); if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
    state.data=d; state.activeTab='prospects'; saveResult(); renderResults();
  }catch(e){state.data=null;showError(e.message||'분석에 실패했습니다.');}
  finally{setBusy(false); if(state.data)$('results').classList.remove('hidden');}
}

function showError(msg){$('loadingState').classList.add('hidden');$('emptyState').classList.add('hidden');$('results').classList.add('hidden');$('errorState').textContent=msg;$('errorState').classList.remove('hidden');$('runBtn').disabled=false;$('runBtn').querySelector('span').textContent='한국 잠재고객 분석';}

function metric(label,value){return `<div class="metric"><span>${escapeHtml(label)}</span><strong title="${escapeHtml(value)}">${escapeHtml(value||'-')}</strong></div>`}
function sourceLinks(urls=[]){return `<div class="source-links">${urls.map((u,i)=>{const s=safeUrl(u);return s?`<a href="${escapeHtml(s)}" target="_blank" rel="noopener noreferrer">근거 ${i+1}</a>`:''}).join('')}</div>`}

function renderResults(){
  const d=state.data;if(!d)return;
  $('emptyState').classList.add('hidden');$('loadingState').classList.add('hidden');$('errorState').classList.add('hidden');$('results').classList.remove('hidden');
  $('exportCsv').disabled=false;$('exportJson').disabled=false;
  const top=d.prospects?.[0];
  $('summaryGrid').innerHTML=metric('CLIENT',d.client?.name||host(d.client?.url))+metric('PROSPECTS',`${d.prospects.length}개`)+metric('TOP SCORE',top?`${top.fit_score}/100`:'-')+metric('MODEL',d.meta?.model||'-');
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.activeTab));
  renderTab();
}

function renderTab(){
  const d=state.data;if(!d)return;
  const root=$('tabContent');
  if(state.activeTab==='prospects'){
    root.innerHTML=`<div style="overflow:auto"><table class="prospect-table"><thead><tr><th>#</th><th>기업</th><th>점수</th><th>왜 적합한가</th><th>구매 신호</th><th>근거</th><th>신뢰</th></tr></thead><tbody>${d.prospects.map(p=>`<tr><td>${p.rank}</td><td class="company-cell"><strong>${escapeHtml(p.company)}</strong>${safeUrl(p.url)?`<a target="_blank" rel="noopener noreferrer" href="${escapeHtml(safeUrl(p.url))}">${escapeHtml(host(p.url))}</a>`:''}</td><td><span class="score">${p.fit_score}</span></td><td>${escapeHtml(p.why_fit)}</td><td>${escapeHtml(p.buying_signal)}${p.signal_date?`<br><small>${escapeHtml(p.signal_date)}</small>`:''}</td><td>${sourceLinks(p.source_urls)}</td><td><span class="confidence ${escapeHtml(p.confidence)}">${escapeHtml(p.confidence)}</span>${p.warning?`<div style="margin-top:5px;color:#b45309;font-size:9px">${escapeHtml(p.warning)}</div>`:''}</td></tr>`).join('')}</tbody></table></div>`;
  } else if(state.activeTab==='contacts'){
    root.innerHTML=`<div class="cards">${d.prospects.map(p=>`<article class="contact-card"><div class="top"><div><span class="rank">#${p.rank} · ${escapeHtml(p.company)}</span><h3>${escapeHtml(p.contact_name || p.recommended_role || '담당 직책 확인 필요')}</h3><span class="pill">${escapeHtml(p.contact_name ? (p.contact_title||'공개 프로필') : '추천 직책')}</span></div>${safeUrl(p.contact_profile_url)?`<a class="ghost small" href="${escapeHtml(safeUrl(p.contact_profile_url))}" target="_blank" rel="noopener noreferrer">프로필</a>`:''}</div><p>${p.contact_name?'공개 출처에서 확인된 담당자 후보입니다.':'공개적으로 검증된 개인을 찾지 못해 직책 기준으로 제공합니다.'}</p><p><b>검색 쿼리:</b> ${escapeHtml(p.contact_search_query||`${p.company} ${p.recommended_role}`)}</p></article>`).join('')}</div>`;
  } else if(state.activeTab==='messages'){
    root.innerHTML=`<div class="cards">${d.prospects.map(p=>`<article class="message-card"><div class="top"><div><span class="rank">#${p.rank}</span><h3>${escapeHtml(p.company)}</h3></div><button class="copy" data-copy="${p.rank}">한국어 복사</button></div><p><b>접근 포인트:</b> ${escapeHtml(p.sales_angle)}</p><p class="message-text">${escapeHtml(p.message_ko)}</p><p class="message-text">${escapeHtml(p.message_en)}</p></article>`).join('')}</div>`;
    root.querySelectorAll('[data-copy]').forEach(btn=>btn.addEventListener('click',async()=>{const p=d.prospects.find(x=>x.rank===Number(btn.dataset.copy));await navigator.clipboard.writeText(p?.message_ko||'');const old=btn.textContent;btn.textContent='복사됨';setTimeout(()=>btn.textContent=old,900)}));
  } else {
    const s=d.strategy||{};
    root.innerHTML=`<div class="cards"><article class="strategy-card"><h3>ICP</h3><p>${escapeHtml(d.icp?.summary)}</p><div class="source-links">${(d.icp?.industries||[]).map(x=>`<span class="pill">${escapeHtml(x)}</span>`).join('')}</div></article><article class="strategy-card"><h3>첫 공략 세그먼트</h3><p>${escapeHtml(s.first_segment)}</p></article><article class="strategy-card"><h3>핵심 제안</h3><p>${escapeHtml(s.core_offer)}</p></article><article class="strategy-card"><h3>아웃바운드 순서</h3><div class="sequence">${(s.outreach_sequence||[]).map((x,i)=>`<div><b>${i+1}</b><span>${escapeHtml(x)}</span></div>`).join('')}</div></article><article class="strategy-card"><h3>다음 행동</h3><p>${escapeHtml(s.next_action)}</p>${d.research_notes?.length?`<ul class="notes">${d.research_notes.map(n=>`<li>${escapeHtml(n)}</li>`).join('')}</ul>`:''}</article></div>`;
  }
}

function csvCell(v){const s=Array.isArray(v)?v.join(' | '):String(v??'');return `"${s.replace(/"/g,'""')}"`;}
function exportCsv(){const d=state.data;if(!d)return;const cols=['rank','company','url','industry','fit_score','why_fit','buying_signal','signal_date','source_urls','contact_name','contact_title','contact_profile_url','recommended_role','contact_search_query','sales_angle','message_ko','message_en','confidence','warning'];const rows=[cols.join(','),...d.prospects.map(p=>cols.map(c=>csvCell(p[c])).join(','))];download(`korea-prospect-pack-${Date.now()}.csv`,'text/csv;charset=utf-8','\ufeff'+rows.join('\n'));}
function exportJson(){if(!state.data)return;download(`korea-prospect-pack-${Date.now()}.json`,'application/json',JSON.stringify(state.data,null,2));}
function download(name,type,content){const blob=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{state.activeTab=b.dataset.tab;renderResults();}));
$('runBtn').addEventListener('click',run);$('exportCsv').addEventListener('click',exportCsv);$('exportJson').addEventListener('click',exportJson);
$('fillDemo').addEventListener('click',()=>{$('clientUrl').value='https://www.intercom.com';$('productHint').value='AI 기반 고객지원/헬프데스크 SaaS';$('targetNotes').value='한국 이커머스, 마켓플레이스, 앱 서비스 중 고객 문의량이 크거나 해외 확장 신호가 있는 기업 우선';$('count').value='5';saveForm();});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')run();});
fields.forEach(id=>$(id).addEventListener('change',saveForm));
loadForm();checkHealth();loadResult();
