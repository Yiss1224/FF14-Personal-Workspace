/* Ledger insights: six-month salvage valuation trend and measured route efficiency.
   Read-only; values use the same price lookup as the monthly ledger (estimates, not sales). */
(function(){
'use strict';
const KEY='ff14_submarine_planner_v1';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const details=$('ledger-details'),trend=$('ledger-trend'),table=$('route-efficiency');
if(!details||!trend||!table)return;
function read(){try{return JSON.parse(FF14Data.readRaw(KEY)||'null')||{}}catch(e){return {}}}
function unitPrice(name,s){
 const found=window.SubmarinePrices?.lookup(name)?.price;
 if(typeof found==='number'&&Number.isFinite(found))return found;
 const manual=Number(s.lootPrices?.[name]);
 return Number.isFinite(manual)?manual:null;
}
function lootValue(log,s){
 let value=0,missing=0;
 for(const x of log.loot||[]){const p=unitPrice(x.name,s);if(p===null)missing++;else value+=p*(Number(x.qty)||0)}
 return {value,missing};
}
const compact=n=>n>=1e6?(Math.round(n/1e5)/10)+'M':n>=1e3?Math.round(n/1e3)+'k':String(Math.round(n));

/* ---------- monthly valuation trend (single series, bar per month) ---------- */
function months(){
 const d=new Date(),out=[];
 for(let k=5;k>=0;k--){const m=new Date(d.getFullYear(),d.getMonth()-k,1);out.push(m.getFullYear()+'-'+String(m.getMonth()+1).padStart(2,'0'))}
 return out;
}
function renderTrend(s){
 const logs=Array.isArray(s.logs)?s.logs:[],keys=months();
 const rows=keys.map(key=>{
  const here=logs.filter(l=>String(l.date||'').startsWith(key));
  let value=0,missing=0;for(const l of here){const v=lootValue(l,s);value+=v.value;missing+=v.missing}
  return {key,value,trips:here.length,missing};
 });
 const max=Math.max(...rows.map(r=>r.value));
 if(!max){trend.innerHTML='<p class="hint">近 6 個月還沒有已估價的打撈物；返航結算登記掉落物並查價後，這裡會出現每月估值。</p>';return}
 const W=600,H=190,top=22,bottom=30,left=8,gap=600/rows.length,bw=Math.min(46,gap*.5),plot=H-top-bottom;
 const latest=rows.length-1,peak=rows.findIndex(r=>r.value===max);
 const bars=rows.map((r,i)=>{
  const h=r.value?Math.max(3,r.value/max*plot):0,x=left+i*gap+(gap-bw)/2,y=H-bottom-h;
  const tip=r.key+'：'+r.value.toLocaleString()+' Gil · '+r.trips+' 趟'+(r.missing?' · '+r.missing+' 筆未查價':'');
  const path=h?'M'+x+','+(H-bottom)+'V'+(y+4)+'Q'+x+','+y+' '+(x+4)+','+y+'H'+(x+bw-4)+'Q'+(x+bw)+','+y+' '+(x+bw)+','+(y+4)+'V'+(H-bottom)+'Z':'';
  const labelled=(i===latest||i===peak)&&r.value;
  return '<g class="trend-bar" data-tip="'+esc(tip)+'" tabindex="0" role="listitem" aria-label="'+esc(tip)+'">'
   +'<rect class="trend-hit" x="'+(left+i*gap)+'" y="'+top+'" width="'+gap+'" height="'+(plot+bottom)+'"></rect>'
   +(path?'<path class="trend-mark" d="'+path+'"></path>':'')
   +(labelled?'<text class="trend-value" x="'+(x+bw/2)+'" y="'+(y-6)+'" text-anchor="middle">'+compact(r.value)+'</text>':'')
   +'<text class="trend-axis" x="'+(x+bw/2)+'" y="'+(H-10)+'" text-anchor="middle">'+Number(r.key.slice(5))+' 月</text></g>';
 }).join('');
 trend.innerHTML='<div class="trend-chart"><svg viewBox="0 0 '+W+' '+H+'" role="list" aria-label="近 6 個月每月打撈估值（Gil）">'
  +'<line class="trend-base" x1="0" x2="'+W+'" y1="'+(H-bottom)+'" y2="'+(H-bottom)+'"></line>'+bars+'</svg><div class="trend-tip" hidden></div></div>'
  +'<p class="hint">估值依目前單價計算，非實際售出收入；明細見上方月份表。</p>';
 const tip=trend.querySelector('.trend-tip'),box=trend.querySelector('.trend-chart');
 trend.querySelectorAll('.trend-bar').forEach(g=>{
  const show=()=>{
   const r=g.getBoundingClientRect(),b=box.getBoundingClientRect();
   tip.textContent=g.dataset.tip;tip.hidden=false;
   tip.style.left=Math.max(70,Math.min(b.width-70,r.left-b.left+r.width/2))+'px';
   g.classList.add('is-hover');
  };
  const hide=()=>{tip.hidden=true;g.classList.remove('is-hover')};
  g.addEventListener('mouseenter',show);g.addEventListener('focus',show);
  g.addEventListener('mouseleave',hide);g.addEventListener('blur',hide);
 });
}

/* ---------- measured route efficiency ---------- */
function renderRoutes(s){
 const logs=(Array.isArray(s.logs)?s.logs:[]).filter(l=>String(l.route||'').trim());
 const groups=new Map();
 for(const l of logs){
  const key=String(l.route).trim().replace(/\s+/g,' ');
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(l);
 }
 const rows=[...groups].map(([route,list])=>{
  const withExp=list.filter(l=>Number(l.exp)>0),timed=withExp.filter(l=>Number(l.durationSeconds)>0);
  const expPerTrip=withExp.length?withExp.reduce((a,l)=>a+Number(l.exp),0)/withExp.length:null;
  const hours=timed.reduce((a,l)=>a+Number(l.durationSeconds)/3600,0);
  const expPerHour=hours?timed.reduce((a,l)=>a+Number(l.exp),0)/hours:null;
  const valued=list.filter(l=>(l.loot||[]).length);
  const gil=valued.length?valued.reduce((a,l)=>a+lootValue(l,s).value,0)/valued.length:null;
  const fuel=list.reduce((a,l)=>a+(Number(l.fuel)||0),0)/list.length;
  const last=list.map(l=>String(l.date||'')).sort().at(-1)||'';
  return {route,trips:list.length,expPerTrip,expPerHour,timed:timed.length,gil,fuel,last};
 }).sort((a,b)=>b.trips-a.trips||(b.expPerHour||0)-(a.expPerHour||0)).slice(0,15);
 if(!rows.length){table.innerHTML='<p class="hint">還沒有含航線的出航紀錄。</p>';return}
 const best=Math.max(...rows.map(r=>r.expPerHour||0));
 const fmt=n=>n===null?'—':Math.round(n).toLocaleString();
 table.innerHTML='<table class="route-efficiency-table"><thead><tr><th>航線</th><th>趟數</th><th>平均 EXP／趟</th><th>EXP／小時</th><th>平均估值／趟</th><th>平均燃料</th><th>最近一趟</th></tr></thead><tbody>'
  +rows.map(r=>'<tr><td>'+esc(r.route)+'</td><td>'+r.trips+'</td><td>'+fmt(r.expPerTrip)+'</td><td>'
   +(r.expPerHour===null?'—':(r.expPerHour===best&&rows.length>1?'<strong>'+fmt(r.expPerHour)+'</strong> <span class="route-best">最高</span>':fmt(r.expPerHour))+'<small> ('+r.timed+' 趟)</small>')
   +'</td><td>'+(r.gil===null?'—':fmt(r.gil)+' Gil')+'</td><td>'+(Math.round(r.fuel*10)/10)+'</td><td>'+esc(r.last)+'</td></tr>').join('')
  +'</tbody></table><p class="hint">EXP 取自結算時填寫的「本趟 EXP」；EXP／小時只計入用「確認出航」記錄了航行時間的趟次。</p>';
}
function render(){if(!details.open)return;const s=read();renderTrend(s);renderRoutes(s)}
details.addEventListener('toggle',render);
['submarine-settlement-saved','submarine-data-imported','submarine-prices-updated','submarine-state-updated'].forEach(name=>window.addEventListener(name,render));
window.addEventListener('storage',e=>{if(e.key===KEY||e.key===null)render()});
render();
})();
