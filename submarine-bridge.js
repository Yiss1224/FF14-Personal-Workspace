/* Bridge overview: next-return countdown, fuel forecast, fleet cards, tab title/favicon status and
   settlement prefill from the recorded voyage. Reads fleet data; only fills form fields the user still confirms. */
(function(){
'use strict';
const KEY='ff14_submarine_planner_v1';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CLASS=['','鯊','雲鯨','鯨','腔棘魚','希爾德里昂'];
const SHIP_COLORS=['#e8b04a','#5bbfae','#e07a5f','#a493e6'];
const MAP_IDS=Object.fromEntries(Object.entries(window.SubmarineMapNames||{1:'溺沒海',2:'灰海',3:'翠浪海',4:'塞壬海',5:'紫礁海',6:'南蒼茫洋',7:'北洋'}).map(([id,name])=>[name,Number(id)]));
const BASE_TITLE=document.title;
let rankXp=null;

function read(){try{return JSON.parse(FF14Data.readRaw(KEY)||'null')||{}}catch(e){return {}}}
function fleet(s){return [0,1,2,3].map(i=>({registered:i===0,rank:1,exp:0,name:'',...(s.ships?.[i]||{})}))}
function label(i,ship){const name=typeof ship?.name==='string'?ship.name.trim():'';return '潛水艇 '+(i+1)+(name?' · '+name:'')}
function buildOf(ship){const code=String(ship.currentBuild||'');return /^[1-5]{4}$/.test(code)?code:((Number(ship.rank)||1)<15?'1111':'1121')}
// Same status rules as the harbor tooltip.
function voyage(ship,now){
 const v=ship.voyage,dep=Number(v?.departedAt),eta=Number(v?.etaAt);
 const valid=Boolean(ship.voyaging&&v&&Number.isFinite(dep)&&dep>0&&Number.isFinite(eta)&&eta>dep);
 const ratio=valid?Math.max(0,Math.min(1,(now-dep)/(eta-dep))):0;
 const status=!ship.registered&&!ship.voyaging?'unregistered':!ship.voyaging?'idle':!valid?'untimed':ratio>=1?'awaiting':ratio>.5?'returning':'exploring';
 return {valid,dep,eta,ratio,status,route:valid&&typeof v.route==='string'?v.route.trim():''};
}
const STATUS_TEXT={unregistered:'泊位未啟用',idle:'停泊待命',untimed:'航行中・未記錄時間',exploring:'探索中',returning:'返航中',awaiting:'已返航・待結算'};
function remaining(ms){
 const minutes=Math.max(0,Math.ceil(ms/60000)),d=Math.floor(minutes/1440),h=Math.floor(minutes%1440/60),m=minutes%60;
 return (d?d+' 天 ':'')+(d||h?h+' 小時 ':'')+m+' 分';
}
function clock(ms){return new Date(ms).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}
function localDate(ms){const d=new Date(ms);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}

/* ---------- fuel forecast ---------- */
// Average daily fuel use over the last 7 days of logs (shorter if the history is shorter).
function fuelForecast(s){
 const logs=Array.isArray(s.logs)?s.logs:[],today=new Date(localDate(Date.now())+'T00:00:00').getTime(),DAY=86400000;
 const recent=logs.filter(l=>{const t=Date.parse(String(l.date||'')+'T00:00:00');return Number.isFinite(t)&&t>today-7*DAY&&t<=today});
 const used=recent.reduce((a,l)=>a+(Number(l.fuel)||0),0);
 if(!used)return null;
 const first=Math.min(...recent.map(l=>Date.parse(l.date+'T00:00:00')));
 const span=Math.max(1,Math.min(7,Math.round((today-first)/DAY)+1));
 const perDay=used/span,stock=Math.max(0,Number(s.fuel??1600)||0);
 return {perDay,days:Math.floor(stock/perDay),span};
}

/* ---------- overview metrics, title and favicon ---------- */
function renderOverview(s,list,now){
 const infos=list.map(x=>voyage(x,now));
 const awaiting=infos.map((v,i)=>v.status==='awaiting'?i:-1).filter(i=>i>=0);
 const sailing=infos.map((v,i)=>({v,i})).filter(x=>x.v.status==='exploring'||x.v.status==='returning').sort((a,b)=>a.v.eta-b.v.eta);
 const card=$('ui-next-return-card'),value=$('ui-next-return'),note=$('ui-next-return-note');
 if(card){
  card.classList.toggle('is-alert',awaiting.length>0);
  card.dataset.ship=awaiting.length?String(awaiting[0]):'';
  if(awaiting.length){
   value.textContent=awaiting.length+' 艘待結算';
   note.textContent=awaiting.map(i=>label(i,list[i])).join('、')+'，點此前往結算';
  }else if(sailing.length){
   const next=sailing[0];
   value.textContent=remaining(next.v.eta-now);
   note.textContent=label(next.i,list[next.i])+' · '+clock(next.v.eta)+' 返航';
  }else{
   value.textContent='—';
   note.textContent='目前沒有記錄時間的航程';
  }
 }
 const fuelNote=$('ui-fuel-note'),forecast=fuelForecast(s);
 if(fuelNote){
  const metric=fuelNote.closest('.ops-metric');
  if(forecast){
   fuelNote.textContent='約可撐 '+forecast.days+' 天（近 '+forecast.span+' 天平均 '+(Math.round(forecast.perDay*10)/10)+' 罐／天）';
   metric?.classList.toggle('is-warn',forecast.days<7);
  }else{fuelNote.textContent='現有庫存（罐）；有返航結算後估算可撐天數';metric?.classList.remove('is-warn')}
 }
 // Tab title and favicon: settle-ready count first, otherwise the next return countdown.
 if(awaiting.length)document.title='⚓'+awaiting.length+' 待結算 · '+BASE_TITLE;
 else if(sailing.length){
  const ms=Math.max(0,sailing[0].v.eta-now),mins=Math.ceil(ms/60000),h=Math.floor(mins/60),m=mins%60;
  document.title='('+(h>=24?Math.floor(h/24)+'天'+(h%24)+'時':h+':'+String(m).padStart(2,'0'))+') '+BASE_TITLE;
 }else document.title=BASE_TITLE;
 setFavicon(awaiting.length);
}
let faviconKey=null;
function setFavicon(count){
 if(faviconKey===count)return;faviconKey=count;
 let link=document.getElementById('sub-favicon');
 if(!link){link=document.createElement('link');link.id='sub-favicon';link.rel='icon';document.head.appendChild(link)}
 const badge=count?'<circle cx="47" cy="17" r="16" fill="#d9573b" stroke="#fff" stroke-width="3"/><text x="47" y="23" font-size="20" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#fff">'+count+'</text>':'';
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#143b53"/><text x="30" y="46" font-size="38" text-anchor="middle">⚓</text>'+badge+'</svg>';
 link.href='data:image/svg+xml,'+encodeURIComponent(svg);
}

/* ---------- fleet cards ---------- */
function partsText(build){return ['船體','船尾','船首','艦橋'].map((slot,k)=>slot+' '+CLASS[build[k]]).join('・')}
function renderCards(list,now){
 const host=$('fleet-cards');if(!host)return;
 host.innerHTML=list.map((ship,i)=>{
  const v=voyage(ship,now),rank=Math.max(1,Number(ship.rank)||1),exp=Math.max(0,Number(ship.exp)||0),build=buildOf(ship);
  const need=rankXp?.[rank],pct=need?Math.max(0,Math.min(100,exp/need*100)):null;
  if(v.status==='unregistered')
   return '<article class="fleet-card is-empty" style="--ship-color:'+SHIP_COLORS[i]+'"><div class="fleet-card-head"><span class="fleet-card-dot"></span><h3>'+esc(label(i,ship))+'</h3><span class="fleet-chip">'+STATUS_TEXT.unregistered+'</span></div><p class="hint">在管理視窗勾選「已登記」後即會出現在派船計算。</p></article>';
  const timed=v.status==='exploring'||v.status==='returning'||v.status==='awaiting';
  const actions=v.status==='awaiting'?'<button type="button" class="primary-action" data-card-settle="'+i+'">前往結算</button>'
   :v.status==='idle'?'<button type="button" data-card-plan>前往派船計算</button>':'';
  return '<article class="fleet-card is-'+v.status+'" style="--ship-color:'+SHIP_COLORS[i]+'" data-fleet-card="'+i+'">'
   +'<div class="fleet-card-head"><span class="fleet-card-dot"></span><h3>'+esc(label(i,ship))+'</h3><span class="fleet-chip">'+esc(STATUS_TEXT[v.status])+'</span></div>'
   +'<div class="fleet-card-rank"><strong>Rank '+rank+'</strong><span>'+(need?exp.toLocaleString()+' / '+need.toLocaleString()+' EXP':exp.toLocaleString()+' EXP')+'</span></div>'
   +(pct!==null?'<div class="fleet-bar" role="img" aria-label="本 Rank 經驗 '+Math.round(pct)+'%"><span style="width:'+pct.toFixed(1)+'%"></span></div>':'')
   +'<p class="fleet-card-build"><strong>'+esc(build)+'</strong> '+esc(partsText(build))+'</p>'
   +(timed?'<div class="fleet-voyage"><div class="fleet-voyage-route">'+esc(v.route||'航線未記錄')+'</div>'
     +'<div class="fleet-bar is-voyage" role="progressbar" aria-label="航程進度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(v.ratio*100)+'"><span style="width:'+(v.ratio*100).toFixed(1)+'%"></span><i style="left:50%"></i></div>'
     +'<div class="fleet-voyage-phases"><span>出發</span><span>探索</span><span>返航</span></div>'
     +'<p class="fleet-voyage-eta">'+(v.status==='awaiting'?'已於 '+esc(clock(v.eta))+' 返航':'剩餘 '+esc(remaining(v.eta-now))+' · '+esc(clock(v.eta))+' 返航')+'</p></div>'
    :v.status==='untimed'?'<p class="hint">已標記航行中，但沒有出航時間；返航後直接結算即可。</p>':'')
   +(actions?'<div class="fleet-card-actions">'+actions+'</div>':'')
   +'</article>';
 }).join('');
}

/* ---------- settlement prefill ---------- */
// "溺沒海 O → J" → {map:1,letters:['O','J']}; routes that cross maps are not parsed.
function parseRoute(text){
 const parts=String(text||'').split('→').map(x=>x.trim()).filter(Boolean);
 let map=null;const letters=[];
 for(const part of parts){
  const m=part.match(/^(\S+)\s+([A-Z]{1,2})$/);
  if(m){if(!MAP_IDS[m[1]]||(map&&MAP_IDS[m[1]]!==map))return null;map=MAP_IDS[m[1]];letters.push(m[2])}
  else if(/^[A-Z]{1,2}$/.test(part))letters.push(part);
  else return null;
 }
 return map&&letters.length?{map,letters}:null;
}
function prefill(i){
 const ship=fleet(read())[i],v=ship?.voyage,note=$('settle-prefill-note');
 if(note){note.hidden=true;note.textContent=''}
 if(!ship||!ship.voyaging||!v)return false;
 const eta=Number(v.etaAt),filled=[];
 if(Number.isFinite(eta)&&eta>0){$('settle-date').value=localDate(Math.min(eta,Date.now()));filled.push('返航日期')}
 const route=parseRoute(v.route);
 if(route){
  $('loot-map').value=String(route.map);
  $('loot-route-input').value=route.letters.join(',');
  $('loot-route-input').dispatchEvent(new Event('input',{bubbles:true}));
  filled.push('航線','燃料');
 }else if(Number(v.fuelEstimate)>0){$('settle-fuel').value=String(Number(v.fuelEstimate));filled.push('燃料')}
 if(note&&filled.length){
  note.textContent='已依出航紀錄預填'+filled.join('、')+'（'+(v.route||'航線未記錄')+'）。請確認後填入各航點 EXP 與掉落物。';
  note.hidden=false;
 }
 return filled.length>0;
}
function goToSettlement(i){
 const select=$('settle-ship');if(!select)return;
 select.value=String(i+1);
 select.dispatchEvent(new Event('change',{bubbles:true}));
 const panel=$('return-settlement');
 panel?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 setTimeout(()=>(document.querySelector('#settle-exp-points:not([hidden]) input')||$('settle-rank'))?.focus({preventScroll:true}),350);
}

/* ---------- wiring ---------- */
function render(){
 const s=read(),list=fleet(s),now=Date.now();
 renderOverview(s,list,now);renderCards(list,now);
}
function init(){
 const cards=$('fleet-cards');
 cards?.addEventListener('click',e=>{
  const settle=e.target.closest('[data-card-settle]');
  if(settle){goToSettlement(Number(settle.dataset.cardSettle));return}
  if(e.target.closest('[data-card-plan]'))$('calculator-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
 });
 $('ui-next-return-card')?.addEventListener('click',e=>{
  const i=$('ui-next-return-card').dataset.ship;
  if(i!==''&&i!==undefined){e.preventDefault();goToSettlement(Number(i))}
 });
 // Runs after the settlement module's own change handler has cleared the form.
 $('settle-ship')?.addEventListener('change',()=>prefill(Number($('settle-ship').value)-1));
 ['submarine-state-updated','submarine-build-state-updated','submarine-settlement-saved','submarine-data-imported','submarine-voyage-started']
  .forEach(name=>window.addEventListener(name,render));
 window.addEventListener('submarine-settlement-saved',()=>{const n=$('settle-prefill-note');if(n)n.hidden=true});
 window.addEventListener('storage',e=>{if(e.key===KEY||e.key===null)render()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
 setInterval(render,30000);
 render();
 // On load, prefill if the selected ship has already returned.
 const selected=Number($('settle-ship')?.value)-1;
 if(selected>=0&&voyage(fleet(read())[selected],Date.now()).status==='awaiting')prefill(selected);
 fetch('submarine-route-data.json?v=20261022-seas2').then(r=>r.ok?r.json():null).then(data=>{
  if(!data)return;rankXp={};for(const r of data.ranks||[])rankXp[r.rank]=Number(r.xp)||0;render();
 }).catch(()=>{});
}
window.SubmarineBridge={goToSettlement,parseRoute};
init();
})();
