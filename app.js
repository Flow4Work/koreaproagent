const $ = (id) => document.getElementById(id);
const state = { workflow: 'sales', salesData: null, salesTab: 'leads', deliveryData: null, deliveryTab: 'prospects' };

function escapeHtml(v='') { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function safeUrl(v='') { try { const u = new URL(v); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
function host(v='') { try { return new URL(v).hostname.replace(/^www\./,''); } catch { return v; } }
function metric(label,value){return `<div class="metric"><span>${escapeHtml(label)}</span><strong title="${escapeHtml(value)}">${escapeHtml(value||'-')}</strong></div>`}
function sourceLinks(urls=[]){return `<div class="source-links">${urls.map((u,i)=>{const s=safeUrl(u);return s?`<a href="${escapeHtml(s)}" target="_blank" rel="noopener noreferrer">근거 ${i+1}</a>`:''}).join('')}</div>`}
function csvCell(v){const s=Array.isArray(v)?v.join(' | '):String(v??'');return `"${s.replace(/"/g,'""')}"`;}
function download(name,type,content){const blob=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

async function checkHealth(){
  try{
    const r=await fetch('/api/health'); const d=await r.json();
    $('apiStatus').className=`status ${d.groqConfigured?'ok':'bad'}`;
    $('apiStatus').innerHTML=`<span class="dot"></span><span>${d.groqConfigured?'Groq 연결됨':'API 키 필요'}</span>`;
  }catch{$('apiStatus').className='status bad';$('apiStatus').innerHTML='<span class="dot"></span><span>API 확인 실패</span>'}
}

function setWorkflow(name){
  state.workflow=name;
  $('salesWorkspace').classList.toggle('hidden',name!=='sales');
  $('deliveryWorkspace').classList.toggle('hidden',name!=='delivery');
  document.querySelectorAll('.workflow-btn').forEach(b=>b.classList.toggle('active',b.dataset.workflow===name));
  localStorage.setItem('kpa.workflow',name);
}

document.querySelectorAll('.workflow-btn').forEach(b=>b.addEventListener('click',()=>setWorkflow(b.dataset.workflow)));

// -------------------------
// Agent 01: Find our clients
// -------------------------
function setSalesBusy(on){
  $('salesRunBtn').disabled=on;
  $('salesRunBtn').querySelector('span').textContent=on?'구매후보 조사 중':'돈 될 고객 자동 발굴';
  $('salesEmpty').classList.toggle('hidden',on||!!state.salesData);
  $('salesLoading').classList.toggle('hidden',!on);
  $('salesError').classList.add('hidden');
  if(on)$('salesResults').classList.add('hidden');
}

function salesError(msg){
  $('salesLoading').classList.add('hidden');$('salesEmpty').classList.add('hidden');$('salesResults').classList.add('hidden');
  $('salesError').textContent=msg;$('salesError').classList.remove('hidden');$('salesRunBtn').disabled=false;$('salesRunBtn').querySelector('span').textContent='돈 될 고객 자동 발굴';
}

async function runSales(){
  localStorage.setItem('kpa.sales.form',JSON.stringify({focus:$('salesFocus').value,count:$('salesCount').value,mode:$('salesMode').value}));
  setSalesBusy(true);
  try{
    const r=await fetch('/api/find-clients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({focus:$('salesFocus').value,count:Number($('salesCount').value),mode:$('salesMode').value})});
    const d=await r.json(); if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
    state.salesData=d; state.salesTab='leads'; localStorage.setItem('kpa.sales.result',JSON.stringify(d)); renderSales();
  }catch(e){state.salesData=null;salesError(e.message||'고객 발굴에 실패했습니다.');}
  finally{setSalesBusy(false);if(state.salesData)$('salesResults').classList.remove('hidden');}
}

function renderSales(){
  const d=state.salesData;if(!d)return;
  $('salesEmpty').classList.add('hidden');$('salesLoading').classList.add('hidden');$('salesError').classList.add('hidden');$('salesResults').classList.remove('hidden');
  $('salesCsv').disabled=false;$('salesJson').disabled=false;
  const top=d.leads?.[0];
  $('salesSummary').innerHTML=metric('OFFER',d.offer?.name||'Korea Pipeline Pilot')+metric('BUYER LEADS',`${d.leads?.length||0}개`)+metric('TOP SCORE',top?`${top.fit_score}/100`:'-')+metric('PRICE',`${Number(d.offer?.suggested_price_krw||390000).toLocaleString('ko-KR')}원`);
  document.querySelectorAll('[data-sales-tab]').forEach(b=>b.classList.toggle('active',b.dataset.salesTab===state.salesTab));
  renderSalesTab();
}

function sampleTargets(targets=[]){
  if(!targets.length)return '<p class="muted-mini">검증 가능한 한국 샘플을 찾지 못했습니다.</p>';
  return `<div class="sample-targets">${targets.map(t=>`<div><strong>${escapeHtml(t.company)}</strong>${safeUrl(t.url)?`<a href="${escapeHtml(safeUrl(t.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(host(t.url))}</a>`:''}<p>${escapeHtml(t.reason)}</p>${sourceLinks(t.source_urls)}</div>`).join('')}</div>`;
}

function renderSalesTab(){
  const d=state.salesData;if(!d)return;const root=$('salesContent');
  if(state.salesTab==='leads'){
    root.innerHTML=`<div class="buyer-list">${d.leads.map(l=>`<article class="buyer-card"><div class="buyer-head"><div><span class="rank">#${l.rank} · ${escapeHtml(l.country||'')}</span><h3>${escapeHtml(l.company)}</h3>${safeUrl(l.url)?`<a href="${escapeHtml(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(host(l.url))}</a>`:''}</div><span class="score big-score">${l.fit_score}</span></div><div class="buyer-grid"><div><b>왜 우리 고객인가</b><p>${escapeHtml(l.why_buy_our_service)}</p></div><div><b>왜 지금인가</b><p>${escapeHtml(l.why_now)}</p>${sourceLinks(l.source_urls)}</div></div><div class="korea-sample"><b>무료로 먼저 보여줄 한국 고객 샘플</b><p>${escapeHtml(l.korea_opportunity)}</p>${sampleTargets(l.sample_korean_targets)}</div><div class="buyer-contact"><span>${escapeHtml(l.decision_maker_name||l.recommended_role||'담당 역할 조사 필요')}</span><small>${escapeHtml(l.decision_maker_title||l.contact_search_query||'')}</small>${safeUrl(l.decision_maker_profile_url)?`<a href="${escapeHtml(safeUrl(l.decision_maker_profile_url))}" target="_blank" rel="noopener noreferrer">공개 프로필</a>`:''}</div>${l.warning?`<p class="warning-text">${escapeHtml(l.warning)}</p>`:''}</article>`).join('')}</div>`;
  } else if(state.salesTab==='messages'){
    root.innerHTML=`<div class="cards">${d.leads.map(l=>`<article class="message-card"><div class="top"><div><span class="rank">#${l.rank}</span><h3>${escapeHtml(l.company)}</h3></div><button class="copy sales-copy" data-rank="${l.rank}">영문 복사</button></div><p class="message-text">${escapeHtml(l.outreach_en)}</p><details><summary>한국어 뜻</summary><p class="message-text">${escapeHtml(l.outreach_ko)}</p></details></article>`).join('')}</div>`;
    root.querySelectorAll('.sales-copy').forEach(btn=>btn.addEventListener('click',async()=>{const l=d.leads.find(x=>x.rank===Number(btn.dataset.rank));await navigator.clipboard.writeText(l?.outreach_en||'');const old=btn.textContent;btn.textContent='복사됨';setTimeout(()=>btn.textContent=old,900)}));
  } else {
    const s=d.strategy||{};
    root.innerHTML=`<div class="cards"><article class="strategy-card money-card"><h3>무엇을 파나</h3><p>${escapeHtml(d.offer?.promise||'해외 SaaS가 한국팀을 고용하기 전에 한국 영업기회를 빠르게 검증하는 Pipeline Pilot')}</p><strong>${Number(d.offer?.suggested_price_krw||390000).toLocaleString('ko-KR')}원 Pilot</strong></article><article class="strategy-card"><h3>먼저 노릴 고객군</h3><p>${escapeHtml(s.best_segment)}</p></article><article class="strategy-card"><h3>피치</h3><p>${escapeHtml(s.pitch)}</p></article><article class="strategy-card"><h3>오늘 할 일</h3><p>${escapeHtml(s.daily_action)}</p></article><article class="strategy-card"><h3>다음 행동</h3><p>${escapeHtml(s.next_action)}</p></article></div>`;
  }
}

function exportSalesCsv(){
  const d=state.salesData;if(!d)return;
  const cols=['rank','company','url','country','category','fit_score','why_buy_our_service','why_now','source_urls','decision_maker_name','decision_maker_title','decision_maker_profile_url','recommended_role','contact_search_query','korea_opportunity','sample_korean_targets','outreach_en','outreach_ko','confidence','warning'];
  const rows=[cols.join(','),...d.leads.map(l=>cols.map(c=>c==='sample_korean_targets'?csvCell((l.sample_korean_targets||[]).map(t=>`${t.company}: ${t.reason}`)):csvCell(l[c])).join(','))];
  download(`korea-pilot-buyers-${Date.now()}.csv`,'text/csv;charset=utf-8','\ufeff'+rows.join('\n'));
}

// -------------------------
// Agent 02: Delivery
// -------------------------
const deliveryFields=['clientUrl','productHint','targetNotes','seeds','count','mode'];
function saveDeliveryForm(){const v={};deliveryFields.forEach(id=>v[id]=$(id).value);localStorage.setItem('kpa.delivery.form',JSON.stringify(v));}
function setDeliveryBusy(on){$('runBtn').disabled=on;$('runBtn').querySelector('span').textContent=on?'Korea Pipeline 생성 중':'Korea Pipeline 생성';$('emptyState').classList.toggle('hidden',on||!!state.deliveryData);$('loadingState').classList.toggle('hidden',!on);$('errorState').classList.add('hidden');if(on)$('results').classList.add('hidden');}
function showDeliveryError(msg){$('loadingState').classList.add('hidden');$('emptyState').classList.add('hidden');$('results').classList.add('hidden');$('errorState').textContent=msg;$('errorState').classList.remove('hidden');$('runBtn').disabled=false;$('runBtn').querySelector('span').textContent='Korea Pipeline 생성';}

async function runDelivery(){
  const clientUrl=$('clientUrl').value.trim();if(!clientUrl){showDeliveryError('고객 SaaS URL을 입력하세요.');return;}
  saveDeliveryForm();setDeliveryBusy(true);
  const payload={clientUrl,productHint:$('productHint').value,targetNotes:$('targetNotes').value,seeds:$('seeds').value,count:Number($('count').value),mode:$('mode').value};
  try{
    const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const d=await r.json();if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
    state.deliveryData=d;state.deliveryTab='prospects';localStorage.setItem('kpa.delivery.result',JSON.stringify(d));renderDelivery();
  }catch(e){state.deliveryData=null;showDeliveryError(e.message||'분석에 실패했습니다.');}
  finally{setDeliveryBusy(false);if(state.deliveryData)$('results').classList.remove('hidden');}
}

function renderDelivery(){
  const d=state.deliveryData;if(!d)return;
  $('emptyState').classList.add('hidden');$('loadingState').classList.add('hidden');$('errorState').classList.add('hidden');$('results').classList.remove('hidden');$('exportCsv').disabled=false;$('exportJson').disabled=false;
  const top=d.prospects?.[0];$('summaryGrid').innerHTML=metric('CLIENT',d.client?.name||host(d.client?.url))+metric('PROSPECTS',`${d.prospects.length}개`)+metric('TOP SCORE',top?`${top.fit_score}/100`:'-')+metric('MODEL',d.meta?.model||'-');
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.deliveryTab));renderDeliveryTab();
}

function renderDeliveryTab(){
  const d=state.deliveryData;if(!d)return;const root=$('tabContent');
  if(state.deliveryTab==='prospects'){
    root.innerHTML=`<div style="overflow:auto"><table class="prospect-table"><thead><tr><th>#</th><th>기업</th><th>점수</th><th>왜 적합한가</th><th>구매 신호</th><th>근거</th><th>신뢰</th></tr></thead><tbody>${d.prospects.map(p=>`<tr><td>${p.rank}</td><td class="company-cell"><strong>${escapeHtml(p.company)}</strong>${safeUrl(p.url)?`<a target="_blank" rel="noopener noreferrer" href="${escapeHtml(safeUrl(p.url))}">${escapeHtml(host(p.url))}</a>`:''}</td><td><span class="score">${p.fit_score}</span></td><td>${escapeHtml(p.why_fit)}</td><td>${escapeHtml(p.buying_signal)}${p.signal_date?`<br><small>${escapeHtml(p.signal_date)}</small>`:''}</td><td>${sourceLinks(p.source_urls)}</td><td><span class="confidence ${escapeHtml(p.confidence)}">${escapeHtml(p.confidence)}</span>${p.warning?`<div class="warning-text">${escapeHtml(p.warning)}</div>`:''}</td></tr>`).join('')}</tbody></table></div>`;
  } else if(state.deliveryTab==='contacts'){
    root.innerHTML=`<div class="cards">${d.prospects.map(p=>`<article class="contact-card"><div class="top"><div><span class="rank">#${p.rank} · ${escapeHtml(p.company)}</span><h3>${escapeHtml(p.contact_name||p.recommended_role||'담당 직책 확인 필요')}</h3><span class="pill">${escapeHtml(p.contact_name?(p.contact_title||'공개 프로필'):'추천 직책')}</span></div>${safeUrl(p.contact_profile_url)?`<a class="ghost small" href="${escapeHtml(safeUrl(p.contact_profile_url))}" target="_blank" rel="noopener noreferrer">프로필</a>`:''}</div><p><b>검색 쿼리:</b> ${escapeHtml(p.contact_search_query||`${p.company} ${p.recommended_role}`)}</p></article>`).join('')}</div>`;
  } else if(state.deliveryTab==='messages'){
    root.innerHTML=`<div class="cards">${d.prospects.map(p=>`<article class="message-card"><div class="top"><div><span class="rank">#${p.rank}</span><h3>${escapeHtml(p.company)}</h3></div><button class="copy delivery-copy" data-rank="${p.rank}">한국어 복사</button></div><p><b>접근 포인트:</b> ${escapeHtml(p.sales_angle)}</p><p class="message-text">${escapeHtml(p.message_ko)}</p><p class="message-text">${escapeHtml(p.message_en)}</p></article>`).join('')}</div>`;
    root.querySelectorAll('.delivery-copy').forEach(btn=>btn.addEventListener('click',async()=>{const p=d.prospects.find(x=>x.rank===Number(btn.dataset.rank));await navigator.clipboard.writeText(p?.message_ko||'');const old=btn.textContent;btn.textContent='복사됨';setTimeout(()=>btn.textContent=old,900)}));
  } else {
    const s=d.strategy||{};root.innerHTML=`<div class="cards"><article class="strategy-card"><h3>ICP</h3><p>${escapeHtml(d.icp?.summary)}</p><div class="source-links">${(d.icp?.industries||[]).map(x=>`<span class="pill">${escapeHtml(x)}</span>`).join('')}</div></article><article class="strategy-card"><h3>첫 공략 세그먼트</h3><p>${escapeHtml(s.first_segment)}</p></article><article class="strategy-card"><h3>핵심 제안</h3><p>${escapeHtml(s.core_offer)}</p></article><article class="strategy-card"><h3>아웃바운드 순서</h3><div class="sequence">${(s.outreach_sequence||[]).map((x,i)=>`<div><b>${i+1}</b><span>${escapeHtml(x)}</span></div>`).join('')}</div></article><article class="strategy-card"><h3>다음 행동</h3><p>${escapeHtml(s.next_action)}</p></article></div>`;
  }
}

function exportDeliveryCsv(){const d=state.deliveryData;if(!d)return;const cols=['rank','company','url','industry','fit_score','why_fit','buying_signal','signal_date','source_urls','contact_name','contact_title','contact_profile_url','recommended_role','contact_search_query','sales_angle','message_ko','message_en','confidence','warning'];const rows=[cols.join(','),...d.prospects.map(p=>cols.map(c=>csvCell(p[c])).join(','))];download(`korea-prospect-pack-${Date.now()}.csv`,'text/csv;charset=utf-8','\ufeff'+rows.join('\n'));}

// Events
$('salesRunBtn').addEventListener('click',runSales);$('salesCsv').addEventListener('click',exportSalesCsv);$('salesJson').addEventListener('click',()=>state.salesData&&download(`korea-pilot-buyers-${Date.now()}.json`,'application/json',JSON.stringify(state.salesData,null,2)));
$('salesDemo').addEventListener('click',()=>{$('salesFocus').value='Seed~Series B B2B SaaS/AI. 최근 투자, APAC·일본·싱가포르 확장, 파트너십/세일즈 채용 신호가 있고 아직 한국 영업조직이 강하지 않은 회사 우선. 한국 기업에 명확한 B2B 사용처가 있어야 함.';$('salesCount').value='5';localStorage.setItem('kpa.sales.form',JSON.stringify({focus:$('salesFocus').value,count:'5',mode:$('salesMode').value}));});
document.querySelectorAll('[data-sales-tab]').forEach(b=>b.addEventListener('click',()=>{state.salesTab=b.dataset.salesTab;renderSales();}));

$('runBtn').addEventListener('click',runDelivery);$('exportCsv').addEventListener('click',exportDeliveryCsv);$('exportJson').addEventListener('click',()=>state.deliveryData&&download(`korea-prospect-pack-${Date.now()}.json`,'application/json',JSON.stringify(state.deliveryData,null,2)));
$('fillDemo').addEventListener('click',()=>{$('clientUrl').value='https://www.intercom.com';$('productHint').value='AI 기반 고객지원/헬프데스크 SaaS';$('targetNotes').value='한국 이커머스, 마켓플레이스, 앱 서비스 중 고객 문의량이 크거나 해외 확장 신호가 있는 기업 우선';$('count').value='5';saveDeliveryForm();});
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{state.deliveryTab=b.dataset.tab;renderDelivery();}));
deliveryFields.forEach(id=>$(id).addEventListener('change',saveDeliveryForm));

// Restore
try{const f=JSON.parse(localStorage.getItem('kpa.sales.form')||'{}');if(f.focus!=null)$('salesFocus').value=f.focus;if(f.count)$('salesCount').value=f.count;if(f.mode)$('salesMode').value=f.mode;}catch{}
try{const f=JSON.parse(localStorage.getItem('kpa.delivery.form')||'{}');deliveryFields.forEach(id=>{if(f[id]!=null)$(id).value=f[id]});}catch{}
try{const d=JSON.parse(localStorage.getItem('kpa.sales.result')||'null');if(d?.leads?.length){state.salesData=d;renderSales();}}catch{}
try{const d=JSON.parse(localStorage.getItem('kpa.delivery.result')||'null');if(d?.prospects?.length){state.deliveryData=d;renderDelivery();}}catch{}
setWorkflow(localStorage.getItem('kpa.workflow')==='delivery'?'delivery':'sales');
checkHealth();