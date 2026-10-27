/* Return settlement EXP helper.
   Shows the chosen ship's current Rank/EXP, gives one EXP field per route point (the in-game
   voyage report lists EXP per sector), sums them into 本趟合計 EXP, and works out the Rank/EXP
   after return, carrying over level-ups. Every filled value stays editable. */
(function(){
'use strict';
const KEY='ff14_submarine_planner_v1';
const $=id=>document.getElementById(id);
const fmt=n=>Number(n||0).toLocaleString();
let rankXp=null,maxRank=145,baseXp={},lastAuto=null,projected=null;
function ship(){
 try{
  const raw=JSON.parse(FF14Data.readRaw(KEY)||'null')||{};
  const s=raw.ships?.[Number($('settle-ship').value)-1]||{};
  return {rank:Math.max(1,Number(s.rank)||1),exp:Math.max(0,Number(s.exp)||0)};
 }catch(e){return {rank:1,exp:0}}
}
function progressText(rank,exp){
 const need=rankXp?.[rank];
 if(!need||rank>=maxRank)return 'Rank '+rank+' · '+fmt(exp)+' EXP';
 return 'Rank '+rank+' · '+fmt(exp)+' / '+fmt(need)+' EXP（還差 '+fmt(Math.max(0,need-exp))+'）';
}
function after(rank,exp,gain){
 let r=rank,e=exp+gain;
 while(rankXp?.[r]&&r<maxRank&&e>=rankXp[r]){e-=rankXp[r];r++}
 return {rank:r,exp:e};
}
function routePoints(){
 const raw=$('settle-route').value,map=$('loot-map').value;
 if(!raw)return [];
 return raw.slice(raw.indexOf(' ')+1).split(' → ').filter(Boolean).map(letter=>({letter,xp:baseXp[map]?.[letter]}));
}
function renderPoints(){
 const host=$('settle-exp-points'),points=routePoints();
 const prev=[...host.querySelectorAll('input[data-point]')].map(i=>[i.dataset.point,i.value]);
 const key=points.map(p=>p.letter).join(',');
 if(host.dataset.route===key)return;
 host.dataset.route=key;
 if(!points.length){host.hidden=true;host.innerHTML='';sumPoints();return}
 host.hidden=false;
 host.innerHTML='<h3>各航點 EXP</h3><p class="hint">照遊戲內航行報告逐點填入，會自動加總並推算返航後 Rank。</p><div class="settle-exp-grid">'
  +points.map((p,i)=>'<label>'+(i+1)+'. '+p.letter+' 點<input type="number" min="0" step="1" inputmode="numeric" data-point="'+i+':'+p.letter+'"'
   +(Number.isFinite(p.xp)?' placeholder="基礎 '+fmt(p.xp)+'"':'')+'></label>').join('')
  +'</div><p class="settle-exp-total" id="settle-exp-total" aria-live="polite"></p>';
 for(const [k,v] of prev){const el=host.querySelector('input[data-point="'+k+'"]');if(el)el.value=v}
 host.querySelectorAll('input[data-point]').forEach(el=>el.addEventListener('input',sumPoints));
 sumPoints();
}
function sumPoints(){
 const inputs=[...$('settle-exp-points').querySelectorAll('input[data-point]')];
 const filled=inputs.filter(i=>i.value.trim()!=='');
 const total=filled.reduce((a,i)=>a+Math.max(0,Math.floor(Number(i.value)||0)),0);
 const out=$('settle-exp-total');
 if(out)out.textContent=filled.length?'合計 '+fmt(total)+' EXP（已填 '+filled.length+' / '+inputs.length+' 點）':'';
 if(filled.length||$('settle-gain').value===String(lastAuto)){
  $('settle-gain').value=filled.length?String(total):'';
  lastAuto=filled.length?total:null;
 }
 project();
}
function project(){
 const cur=ship(),raw=$('settle-gain').value.trim(),note=$('settle-after');
 $('settle-ship-progress').textContent='目前 '+progressText(cur.rank,cur.exp);
 const gain=Number(raw);
 if(!raw||!Number.isSafeInteger(gain)||gain<0){
  // Put back the current progress if the fields still hold an earlier projection.
  if(projected&&$('settle-rank').value===String(projected.rank)&&$('settle-exp').value===String(projected.exp)){
   $('settle-rank').value=String(cur.rank);$('settle-exp').value=String(cur.exp);
  }
  projected=null;note.textContent='';return;
 }
 const next=after(cur.rank,cur.exp,gain);projected=next;
 $('settle-rank').value=String(next.rank);$('settle-exp').value=String(next.exp);
 const ups=next.rank-cur.rank;
 note.textContent='返航後 '+progressText(next.rank,next.exp)+(ups?'，升 '+ups+' 級':'')+'。若與遊戲不同可直接修改。';
}
function reset(){
 const host=$('settle-exp-points');delete host.dataset.route;lastAuto=null;projected=null;
 queueMicrotask(()=>{renderPoints();project()});
}
function init(){
 const later=fn=>()=>queueMicrotask(fn);
 $('loot-route-input').addEventListener('input',later(renderPoints));
 $('loot-route-input').addEventListener('change',later(renderPoints));
 $('loot-map').addEventListener('change',later(renderPoints));
 $('settle-gain').addEventListener('input',()=>{lastAuto=null;project()});
 $('settle-ship').addEventListener('change',later(()=>{lastAuto=null;sumPoints()}));
 for(const name of ['submarine-settlement-saved','submarine-settlement-reset','submarine-data-imported'])window.addEventListener(name,reset);
 // Other changes (another tab, the fleet dialog) only refresh the shown progress; typed EXP stays.
 window.addEventListener('submarine-state-updated',later(()=>$('settle-ship-progress').textContent='目前 '+progressText(ship().rank,ship().exp)));
 project();
 fetch('submarine-route-data.json?v=20261022-seas2').then(r=>r.ok?r.json():null).then(data=>{
  if(!data)return;
  rankXp={};for(const r of data.ranks||[])rankXp[r.rank]=Number(r.xp)||0;
  maxRank=Math.max(1,...(data.ranks||[]).map(r=>Number(r.rank)||1));
  for(const p of data.sectors||[])(baseXp[String(p.map)]??={})[String(p.letter).toUpperCase()]=Number(p.xp);
  delete $('settle-exp-points').dataset.route;renderPoints();project();
 }).catch(()=>{});
}
init();
})();
