/* Harbor animation; read-only view of real, locally recorded departure timestamps. */
(function(){
'use strict';
const KEY='ff14_submarine_planner_v1';
const dock=document.getElementById('mini-harbor');
if(!dock)return;
const fleetEl=dock.querySelector('#harbor-fleet');
const ticker=dock.querySelector('#harbor-clock');
const fold=dock.querySelector('#harbor-fold');
let open=true;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}}
function fmt(ts){return new Date(ts).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}
function render(){
 const state=read(),ships=Array.isArray(state.ships)?state.ships:[];
 const now=Date.now(),active=ships.filter(x=>x?.voyaging&&Number.isFinite(Number(x?.voyage?.etaAt))).length;
 ticker.textContent=active?'航行中 '+active+' 艘':'港口待命';
 const boats=Array.from({length:4},(_,i)=>{
  const ship=ships[i]||{},v=ship.voyage,started=ship.voyaging&&v&&Number.isFinite(Number(v.departedAt))&&Number.isFinite(Number(v.etaAt))&&v.etaAt>v.departedAt;
  const fraction=started?Math.max(0,Math.min(1,(now-v.departedAt)/(v.etaAt-v.departedAt))):0;
  const progress=started?(fraction<=.5?fraction*2:(1-fraction)*2):0;
  const x=6+progress*81;
  const arrived=started&&fraction>=1;
  const label=ship.name?.trim()?ship.name.trim():'潛水艇 '+(i+1);
  const status=!ship.registered?'尚未登記':ship.voyaging?(started?(arrived?'預計已返航 · 待結算':'預計 '+fmt(v.etaAt)+' 返航'):'航行中 · 未記錄時間'):'停泊中';
  const dir=started&&fraction>.5?' return':'';
  return '<div class="harbor-lane"><div class="harbor-lane-title"><strong>'+esc(label)+'</strong><small>'+esc(status)+'</small></div>'+
   '<div class="harbor-waterway"><span class="harbor-pier" aria-hidden="true"></span><span class="harbor-finish" aria-hidden="true">⚑</span>'+
   '<span class="harbor-boat'+dir+(started&&!arrived?' sailing':'')+'" style="left:'+x.toFixed(2)+'%" aria-hidden="true"><span class="harbor-tower"></span><span class="harbor-hull"></span></span></div></div>';
 }).join('');
 fleetEl.innerHTML=boats;
}
fold.addEventListener('click',()=>{
 open=!open;dock.classList.toggle('harbor-collapsed',!open);
 fold.setAttribute('aria-expanded',String(open));fold.textContent=open?'收合 ▾':'展開 ▴';
});
['submarine-state-updated','submarine-build-state-updated','submarine-settlement-saved','submarine-data-imported','submarine-voyage-started'].forEach(e=>window.addEventListener(e,render));
window.addEventListener('storage',e=>{if(e.key===KEY)render()});
render();window.setInterval(()=>{if(!document.hidden&&open)render()},60000);
})();
