const $ = (id) => document.getElementById(id);
const APP_VERSION = '20260727-6';
const state = { workflow: 'sales', salesData: null, salesTab: 'leads', deliveryData: null, deliveryTab: 'prospects' };

if (localStorage.getItem('kpa.app.version') !== APP_VERSION) {
  localStorage.removeItem('kpa.sales.result');
  localStorage.removeItem('kpa.delivery.result');
  localStorage.setItem('kpa.app.version', APP_VERSION);
}

function escapeHtml(v='') { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function safeUrl(v='') { try { const u = new URL(v); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
function host(v='') { try { return new URL(v).hostname.replace(/^www\./,''); } catch { return v; } }
function metric(label,value){return `<div class="metric"><span>${escapeHtml(label)}</span><strong title="${escapeHtml(value)}">${escapeHtml(value||'-')}</strong></div>`}
function sourceLinks(urls=[]){return `<div class="source-links">${urls.map((u,i)=>{const s=safeUrl(u);return s?`<a href="${escapeHtml(s)}" target="_blank" rel="noopener noreferrer">근거 ${i+1}</a>`:''}).join('')}</div>`}
function csvCell(v){const s=Array.isArray(v)?v.join(' | '):String(v??'');return `"${s.replace(/"/g,'""')}"`;}
function download(name,type,content){const blob=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function googleSearchUrl(q=''){return `https://www.google.com/search?q=${encodeURIComponent(q)}`;}

async function copyText(text, btn){
  await navigator.clipboard.writeText(text || '');
  const old=btn.textContent; btn.textContent='복사됨'; setTimeout(()=>btn.textContent=old,900);
}

async function readJsonResponse(response) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; }
  catch { const e=new Error(`API 응답 형식 오류 (HTTP ${response.status})`); e.status=response.status; throw e; }
  if (!response.ok) { const e=new Error(`${data?.error || data?.message || `HTTP ${response.status}`}${data?.hint ? ` · ${data.hint}` : ''}`); e.status=response.status; e.data=data; throw e; }
  return data;
}

async function requestJson(url, payload, timeoutMs = 45000) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await readJsonResponse(await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',signal:controller.signal})); }
  catch(error){ if(error?.name==='AbortError'){const e=new Error(`조사가 ${Math.round(timeoutMs/1000)}초를 넘어 중단됐습니다.`);e.status=504;throw e;} throw error; }
  finally{clearTimeout(timer)}
}

async function checkHealth(){
  try{
    const d=await readJsonResponse(await fetch(`/api/health?t=${Date.now()}`,{cache:'no-store'}));
    const ok=Boolean(d.groqConnected); $('apiStatus').className=`status ${ok?'ok':'bad'}`; $('apiStatus').title=ok?'Groq 인증 정상':(d.error||'Groq 연결 실패'); $('apiStatus').innerHTML=`<span class="dot"></span><span>${ok?'Groq 정상':'Groq 오류'}</span>`; return ok;
  }catch(error){$('apiStatus').className='status bad';$('apiStatus').title=error.message;$('apiStatus').innerHTML='<span class="dot"></span><span>API 오류</span>';return false;}
}

function diagLine(name, check){const ok=check?.ok===true, skipped=check?.skipped===true;const mark=skipped?'–':ok?'✓':'✕';const cls=skipped?'':ok?'diag-ok':'diag-bad';const detail=[check?.status?`HTTP ${check.status}`:'',check?.duration_ms?`${check.duration_ms}ms`:'',check?.rate?.remaining_tokens?`잔여 토큰 ${check.rate.remaining_tokens}`:''].filter(Boolean).join(' · ');return `<div class="diag-row"><b class="${cls}">${mark}</b><span>${escapeHtml(name)}</span><small>${escapeHtml(detail||check?.message||'')}</small></div>`}
async function runDiagnostics(){const btn=$('diagBtn'),panel=$('diagPanel');btn.disabled=true;btn.textContent='확인 중';panel.classList.remove('hidden');panel.innerHTML='<strong>Groq 연결과 실제 웹 검색을 확인합니다.</strong>';try{const r=await fetch(`/api/diagnostics?search=1&t=${Date.now()}`,{cache:'no-store'});const d=JSON.parse(await r.text());const c=d.checks||{};panel.innerHTML=`<div class="diag-head"><strong>${d.ok?'정상':'문제 발견'}</strong><button id="diagClose" class="ghost small">닫기</button></div>${diagLine('환경변수',c.env)}${diagLine('인증',c.auth)}${diagLine('웹 검색',c.search)}`;$('diagClose')?.addEventListener('click',()=>panel.classList.add('hidden'));}catch(e){panel.innerHTML=`<div class="diag-head"><strong>진단 실패</strong><button id="diagClose" class="ghost small">닫기</button></div><p>${escapeHtml(e.message)}</p>`;$('diagClose')?.addEventListener('click',()=>panel.classList.add('hidden'));}finally{btn.disabled=false;btn.textContent='진단';}}

function setWorkflow(name){state.workflow=name;$('salesWorkspace').classList.toggle('hidden',name!=='sales');$('deliveryWorkspace').classList.toggle('hidden',name!=='delivery');document.querySelectorAll('.workflow-btn').forEach(b=>b.classList.toggle('active',b.dataset.workflow===name));localStorage.setItem('kpa.workflow',name)}
document.querySelectorAll('.workflow-btn').forEach(b=>b.addEventListener('click',()=>setWorkflow(b.dataset.workflow)));

function setSalesBusy(on){$('salesRunBtn').disabled=on;$('salesRunBtn').querySelector('span').textContent=on?'조사 중…':'해외 고객 찾기';if(on){$('salesEmpty').classList.add('hidden');$('salesError').classList.add('hidden');$('salesLoading').classList.remove('hidden');}else $('salesLoading').classList.add('hidden')}
function setSalesProgress(title,text){const h=$('salesLoading')?.querySelector('h3'),p=$('salesLoading')?.querySelector('p');if(h)h.textContent=title;if(p)p.textContent=text}
function salesError(msg){$('salesLoading').classList.add('hidden');$('salesEmpty').classList.add('hidden');$('salesResults').classList.add('hidden');$('salesError').textContent=msg;$('salesError').classList.remove('hidden');$('salesRunBtn').disabled=false;$('salesRunBtn').querySelector('span').textContent='해외 고객 찾기'}

async function runSales(){
  const focus=$('salesFocus').value,count=Math.min(5,Number($('salesCount').value)||3),mode=$('salesMode').value;
  localStorage.setItem('kpa.sales.form',JSON.stringify({focus,count:String(count),mode})); state.salesData=null; $('salesResults').classList.add('hidden'); setSalesBusy(true);
  try{
    if(!await checkHealth())throw new Error('Groq 연결 오류입니다. 우측 상단 진단을 눌러 확인하세요.');
    setSalesProgress('1/2 연락할 해외 SaaS를 찾는 중','최근 투자·APAC 확장·채용 등 실제 신호가 있는 회사를 찾습니다.');
    const discovery=await requestJson('/api/discover-clients',{focus,count,mode},42000); const candidates=Array.isArray(discovery?.candidates)?discovery.candidates:[]; if(!candidates.length)throw new Error('조건에 맞는 회사를 찾지 못했습니다.');
    state.salesData={offer:{name:'Korea Pipeline Pilot',promise:'한국 진출 전, 한국 잠재고객과 접촉 이유를 검증해 주는 파일럿',suggested_price_krw:390000},leads:[],strategy:{best_segment:discovery?.strategy?.best_segment||'',pitch:discovery?.strategy?.pitch||'',next_action:''},meta:{model:discovery?.meta?.model||'groq/compound-mini',stage:'enrichment',failures:[],rate_limited:false}};
    for(let i=0;i<candidates.length;i++){
      const c=candidates[i]; if(i>0)await sleep(900); setSalesProgress(`2/2 ${i+1}/${candidates.length} · ${c.company}`,'왜 지금 연락할지와 한국 고객 샘플을 확인합니다.');
      try{const enriched=await requestJson('/api/enrich-client',{candidate:c,mode},45000);const lead={...(enriched?.lead||{}),rank:state.salesData.leads.length+1,_meta:enriched?.meta||{}};state.salesData.leads.push(lead);state.salesData.leads.sort((a,b)=>(b.fit_score||0)-(a.fit_score||0));state.salesData.leads.forEach((x,idx)=>x.rank=idx+1);state.salesData.meta.model=enriched?.meta?.model||state.salesData.meta.model;localStorage.setItem('kpa.sales.result',JSON.stringify(state.salesData));renderSales(true);}catch(error){state.salesData.meta.failures.push(`${c.company}: ${error.message}`);if(error?.status===429){state.salesData.meta.rate_limited=true;break;}}
    }
    if(!state.salesData.leads.length)throw new Error(`상세 조사에 실패했습니다. ${state.salesData.meta.failures.join(' | ')}`);
    state.salesData.meta.stage=state.salesData.meta.rate_limited?'partial':'complete'; localStorage.setItem('kpa.sales.result',JSON.stringify(state.salesData)); renderSales();
  }catch(e){state.salesData=null;salesError(e.message||'고객 발굴에 실패했습니다.')} finally{setSalesBusy(false);if(state.salesData?.leads?.length)$('salesResults').classList.remove('hidden')}
}

function renderSales(keepLoading=false){
  const d=state.salesData;if(!d)return;$('salesEmpty').classList.add('hidden');$('salesError').classList.add('hidden');$('salesResults').classList.remove('hidden');if(!keepLoading)$('salesLoading').classList.add('hidden');$('salesCsv').disabled=!d.leads?.length;
  const top=d.leads?.[0];$('salesSummary').innerHTML=metric('찾은 회사',`${d.leads?.length||0}곳`)+metric('1위 점수',top?`${top.fit_score}/100`:'-')+metric('조사 방식',d.meta?.model?.includes('mini')?'빠른 조사':'정밀 조사');
  $('salesNext').innerHTML=top?`<div><strong>다음: ${escapeHtml(top.company)}에 먼저 연락</strong><p>담당자를 찾고, 준비된 영문 메일을 복사해 보내세요. 첫 메일에는 서비스 링크를 넣지 않는 것을 권장합니다.</p></div><button class="primary small" id="topMailBtn">영업문 보기</button>`:'';
  $('topMailBtn')?.addEventListener('click',()=>{state.salesTab='messages';renderSales();}); document.querySelectorAll('[data-sales-tab]').forEach(b=>b.classList.toggle('active',b.dataset.salesTab===state.salesTab)); renderSalesTab();
}

function sampleTargets(targets=[]){if(!targets.length)return '<p class="muted-mini">확인 가능한 한국 샘플을 찾지 못했습니다.</p>';return `<div class="sample-targets">${targets.map(t=>`<div><strong>${escapeHtml(t.company)}</strong>${safeUrl(t.url)?`<a href="${escapeHtml(safeUrl(t.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(host(t.url))}</a>`:''}<p>${escapeHtml(t.reason)}</p>${sourceLinks(t.source_urls)}</div>`).join('')}</div>`}

function renderSalesTab(){
  const d=state.salesData;if(!d)return;const root=$('salesContent');
  if(state.salesTab==='leads'){
    root.innerHTML=`<div class="buyer-list">${d.leads.map(l=>{const q=l.contact_search_query||`${l.company} ${l.recommended_role||'Head of Sales'}`;return `<article class="buyer-card"><div class="buyer-head"><div><span class="rank">#${l.rank} · ${escapeHtml(l.country||'')}</span><h3>${escapeHtml(l.company)}</h3>${safeUrl(l.url)?`<a href="${escapeHtml(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(host(l.url))}</a>`:''}</div><span class="score big-score">${l.fit_score}</span></div><p class="buyer-summary">${escapeHtml(l.why_buy_our_service)}</p><div class="buyer-grid"><div><b>왜 지금 연락?</b><p>${escapeHtml(l.why_now)}</p>${sourceLinks(l.source_urls)}</div><div><b>누구에게?</b><p>${escapeHtml(l.decision_maker_name||l.recommended_role||'영업/사업개발 책임자')}</p><small>${escapeHtml(l.decision_maker_title||'')}</small></div></div><div class="korea-sample"><b>무료로 보여줄 한국 고객 샘플</b><p>${escapeHtml(l.korea_opportunity)}</p>${sampleTargets(l.sample_korean_targets)}</div><div class="buyer-actions"><button class="main-action lead-mail" data-rank="${l.rank}">영업문 보기</button><button class="lead-copy" data-rank="${l.rank}">영업문 복사</button><a href="${escapeHtml(googleSearchUrl(q))}" target="_blank" rel="noopener noreferrer">담당자 찾기</a>${safeUrl(l.url)?`<a href="${escapeHtml(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">회사 열기</a>`:''}</div>${l.warning?`<p class="warning-text">주의: ${escapeHtml(l.warning)}</p>`:''}</article>`}).join('')}</div>`;
    root.querySelectorAll('.lead-mail').forEach(btn=>btn.addEventListener('click',()=>{state.salesTab='messages';renderSales();setTimeout(()=>document.querySelector(`[data-message-rank="${btn.dataset.rank}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}),30)}));
    root.querySelectorAll('.lead-copy').forEach(btn=>btn.addEventListener('click',()=>{const l=d.leads.find(x=>x.rank===Number(btn.dataset.rank));copyText(l?.outreach_en||'',btn)}));
  }else if(state.salesTab==='messages'){
    root.innerHTML=`<div class="cards">${d.leads.map(l=>`<article class="message-card" data-message-rank="${l.rank}"><div class="top"><div><span class="rank">#${l.rank}</span><h3>${escapeHtml(l.company)}</h3></div><button class="copy sales-copy" data-rank="${l.rank}">영문 복사</button></div><p class="subject">받는 사람: ${escapeHtml(l.decision_maker_name||l.recommended_role||'영업/사업개발 책임자')}</p><p class="message-text">${escapeHtml(l.outreach_en)}</p><details><summary>한국어로 확인</summary><p class="message-text">${escapeHtml(l.outreach_ko)}</p></details></article>`).join('')}</div>`;
    root.querySelectorAll('.sales-copy').forEach(btn=>btn.addEventListener('click',()=>{const l=d.leads.find(x=>x.rank===Number(btn.dataset.rank));copyText(l?.outreach_en||'',btn)}));
  }else{
    const top=d.leads?.[0],failures=d.meta?.failures||[];root.innerHTML=`<div class="action-steps"><div class="action-step"><b>1</b><div><strong>${escapeHtml(top?.company||'1위 회사')} 담당자 찾기</strong><span>후보 카드의 ‘담당자 찾기’를 눌러 Founder, Head of Sales, Growth, Partnerships 중 실제 담당자를 확인합니다.</span></div></div><div class="action-step"><b>2</b><div><strong>영문 메일 발송</strong><span>‘보낼 메일’에서 복사해 하루 10~20곳 정도 직접 테스트합니다. 첫 메일에는 링크보다 한국 고객 샘플을 먼저 제안합니다.</span></div></div><div class="action-step"><b>3</b><div><strong>답장 온 회사에 샘플 전달</strong><span>관심 답장이 오면 한국 고객 샘플 3곳을 보여주고 390,000원 Pilot을 제안합니다.</span></div></div></div>${failures.length?`<p class="warning-text">일부 조사 실패: ${escapeHtml(failures.join(' / '))}</p>`:''}`;
  }
}

function exportSalesCsv(){const d=state.salesData;if(!d)return;const cols=['rank','company','url','country','category','fit_score','why_buy_our_service','why_now','source_urls','decision_maker_name','decision_maker_title','recommended_role','contact_search_query','korea_opportunity','outreach_en','outreach_ko','confidence','warning'];const rows=[cols.join(','),...d.leads.map(l=>cols.map(c=>csvCell(l[c])).join(','))];download(`korea-sales-leads-${Date.now()}.csv`,'text/csv;charset=utf-8','\ufeff'+rows.join('\n'))}

const deliveryFields=['clientUrl','productHint','targetNotes','seeds','count','mode'];
function saveDeliveryForm(){const v={};deliveryFields.forEach(id=>v[id]=$(id).value);localStorage.setItem('kpa.delivery.form',JSON.stringify(v))}
function setDeliveryBusy(on){$('runBtn').disabled=on;$('runBtn').querySelector('span').textContent=on?'만드는 중…':'납품 자료 만들기';$('emptyState').classList.toggle('hidden',on||!!state.deliveryData);$('loadingState').classList.toggle('hidden',!on);$('errorState').classList.add('hidden');if(on)$('results').classList.add('hidden')}
function showDeliveryError(msg){$('loadingState').classList.add('hidden');$('emptyState').classList.add('hidden');$('results').classList.add('hidden');$('errorState').textContent=msg;$('errorState').classList.remove('hidden');$('runBtn').disabled=false;$('runBtn').querySelector('span').textContent='납품 자료 만들기'}
async function runDelivery(){const clientUrl=$('clientUrl').value.trim();if(!clientUrl){showDeliveryError('고객 SaaS URL을 입력하세요.');return;}saveDeliveryForm();setDeliveryBusy(true);const payload={clientUrl,productHint:$('productHint').value,targetNotes:$('targetNotes').value,seeds:$('seeds').value,count:Number($('count').value),mode:$('mode').value};try{if(!await checkHealth())throw new Error('Groq 연결 오류입니다.');const d=await requestJson('/api/analyze',payload,52000);state.deliveryData=d;state.deliveryTab='prospects';localStorage.setItem('kpa.delivery.result',JSON.stringify(d));renderDelivery();}catch(e){state.deliveryData=null;showDeliveryError(e.message||'분석에 실패했습니다.')}finally{setDeliveryBusy(false);if(state.deliveryData)$('results').classList.remove('hidden')}}
function renderDelivery(){const d=state.deliveryData;if(!d)return;$('emptyState').classList.add('hidden');$('loadingState').classList.add('hidden');$('errorState').classList.add('hidden');$('results').classList.remove('hidden');$('exportCsv').disabled=false;const top=d.prospects?.[0];$('summaryGrid').innerHTML=metric('고객',d.client?.name||host(d.client?.url))+metric('한국 후보',`${d.prospects?.length||0}곳`)+metric('1위 점수',top?`${top.fit_score}/100`:'-');document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.deliveryTab));renderDeliveryTab()}
function renderDeliveryTab(){const d=state.deliveryData;if(!d)return;const root=$('tabContent');if(state.deliveryTab==='prospects')root.innerHTML=`<div style="overflow:auto"><table class="prospect-table"><thead><tr><th>#</th><th>기업</th><th>점수</th><th>적합 이유</th><th>구매 신호</th><th>근거</th></tr></thead><tbody>${(d.prospects||[]).map(p=>`<tr><td>${p.rank}</td><td class="company-cell"><strong>${escapeHtml(p.company)}</strong>${safeUrl(p.url)?`<a target="_blank" rel="noopener noreferrer" href="${escapeHtml(safeUrl(p.url))}">${escapeHtml(host(p.url))}</a>`:''}</td><td><span class="score">${p.fit_score}</span></td><td>${escapeHtml(p.why_fit)}</td><td>${escapeHtml(p.buying_signal)}</td><td>${sourceLinks(p.source_urls)}</td></tr>`).join('')}</tbody></table></div>`;else if(state.deliveryTab==='contacts')root.innerHTML=`<div class="cards">${(d.prospects||[]).map(p=>`<article class="contact-card"><div class="top"><div><span class="rank">#${p.rank} · ${escapeHtml(p.company)}</span><h3>${escapeHtml(p.contact_name||p.recommended_role||'담당 직책 확인 필요')}</h3></div></div><p>${escapeHtml(p.contact_search_query||'')}</p></article>`).join('')}</div>`;else if(state.deliveryTab==='messages'){root.innerHTML=`<div class="cards">${(d.prospects||[]).map(p=>`<article class="message-card"><div class="top"><div><span class="rank">#${p.rank}</span><h3>${escapeHtml(p.company)}</h3></div><button class="copy delivery-copy" data-rank="${p.rank}">복사</button></div><p class="message-text">${escapeHtml(p.message_ko||p.message_en)}</p></article>`).join('')}</div>`;root.querySelectorAll('.delivery-copy').forEach(btn=>btn.addEventListener('click',()=>{const p=d.prospects.find(x=>x.rank===Number(btn.dataset.rank));copyText(p?.message_ko||p?.message_en||'',btn)}));}else{const s=d.strategy||{};root.innerHTML=`<div class="action-steps"><div class="action-step"><b>1</b><div><strong>상위 후보 검수</strong><span>${escapeHtml(s.first_segment||'점수가 높은 기업부터 근거를 확인합니다.')}</span></div></div><div class="action-step"><b>2</b><div><strong>고객에게 납품</strong><span>${escapeHtml(s.core_offer||'CSV와 메시지를 정리해 전달합니다.')}</span></div></div><div class="action-step"><b>3</b><div><strong>다음 영업</strong><span>${escapeHtml(s.next_action||'반응 데이터를 받고 월 운영 계약을 제안합니다.')}</span></div></div></div>`}}
function exportDeliveryCsv(){const d=state.deliveryData;if(!d)return;const cols=['rank','company','url','industry','fit_score','why_fit','buying_signal','source_urls','contact_name','contact_title','recommended_role','contact_search_query','sales_angle','message_ko','message_en'];const rows=[cols.join(','),...(d.prospects||[]).map(p=>cols.map(c=>csvCell(p[c])).join(','))];download(`korea-prospect-pack-${Date.now()}.csv`,'text/csv;charset=utf-8','\ufeff'+rows.join('\n'))}

$('diagBtn').addEventListener('click',runDiagnostics);$('salesRunBtn').addEventListener('click',runSales);$('salesCsv').addEventListener('click',exportSalesCsv);$('salesDemo').addEventListener('click',()=>{$('salesFocus').value='Seed~Series B B2B SaaS/AI. 최근 투자 또는 APAC·일본·싱가포르 확장 신호가 있고, 한국 영업 조직이 아직 크지 않으며 한국 B2B 고객에게 명확한 사용처가 있는 회사.';$('salesCount').value='3';$('salesMode').value='fast';});document.querySelectorAll('[data-sales-tab]').forEach(b=>b.addEventListener('click',()=>{state.salesTab=b.dataset.salesTab;renderSales()}));$('runBtn').addEventListener('click',runDelivery);$('exportCsv').addEventListener('click',exportDeliveryCsv);$('fillDemo').addEventListener('click',()=>{$('clientUrl').value='https://www.intercom.com';$('productHint').value='AI 고객지원 자동화 SaaS';$('targetNotes').value='한국 이커머스 중 고객 문의량이 많거나 CS 채용이 늘어난 회사';$('count').value='5';$('mode').value='fast';saveDeliveryForm()});document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{state.deliveryTab=b.dataset.tab;renderDelivery()}));deliveryFields.forEach(id=>$(id).addEventListener('change',saveDeliveryForm));
try{const f=JSON.parse(localStorage.getItem('kpa.sales.form')||'{}');if(f.focus!=null)$('salesFocus').value=f.focus;if(f.count)$('salesCount').value=f.count;if(f.mode)$('salesMode').value=f.mode}catch{}
try{const f=JSON.parse(localStorage.getItem('kpa.delivery.form')||'{}');deliveryFields.forEach(id=>{if(f[id]!=null)$(id).value=f[id]})}catch{}
try{const d=JSON.parse(localStorage.getItem('kpa.sales.result')||'null');if(d?.leads?.length){state.salesData=d;renderSales()}}catch{}
try{const d=JSON.parse(localStorage.getItem('kpa.delivery.result')||'null');if(d?.prospects?.length){state.deliveryData=d;renderDelivery()}}catch{}
setWorkflow(localStorage.getItem('kpa.workflow')==='delivery'?'delivery':'sales');checkHealth();
