(function(){
'use strict';
const KEY='ff14_submarine_planner_v1';
const maps={1:'溺沒海',2:'灰海',3:'翠浪海'};
const builds={
 auto:{label:'自動練等配置',min:1},
 '1111':{label:'1111（鯊鯊全套）',min:1,speed:110,range:70},
 '1121':{label:'1121（練等混搭）',min:15,speed:120,range:75},
 '3124':{label:'3124（金策混搭）',min:35,speed:150,range:15}
};
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function state(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}}
function persist(mutator){const s=state();mutator(s);localStorage.setItem(KEY,JSON.stringify(s))}
let data=null;
function rankRec(rank){return data.ranks.find(x=>x.rank===rank)||data.ranks.filter(x=>x.rank<=rank).at(-1)}
function shipRank(ship){return Math.max(1,Number(ship.rank)||1)}
function buildStats(build,rank){
 const b=builds[build]||builds.auto,rec=rankRec(rank)||{};
 const base=build==='3124'?builds['3124']:build==='1111'?builds['1111']:builds['1121'];
 return {speed:base.speed+(rec.v||0),range:base.range+(rec.d||0)};
}
function sectorUnlockKey(id){return 'sector-'+id}
function renderBuilds(){
 const s=state(),ships=s.ships||[];
 $('ship-builds').innerHTML=ships.map((ship,i)=>{
  const r=shipRank(ship),v=ship.build||'auto';
  return '<div class="build-row"><label>潛水艇 '+(i+1)+'（Rank '+r+'）<select data-build="'+i+'">'+Object.entries(builds).map(([k,b])=>'<option value="'+k+'" '+(k===v?'selected':'')+'>'+esc(b.label)+'</option>').join('')+'</select></label><small>自動：Rank 1–14 用 1111，Rank 15 起用 1121；3124 留給金策。</small></div>'
 }).join('');
 $('ship-builds').querySelectorAll('[data-build]').forEach(el=>el.onchange=()=>{
  persist(s=>{s.ships=s.ships||[];s.ships[Number(el.dataset.build)].build=el.value});
  calculate();
 });
}
function renderSectors(){
 const s=state();s.unlocks=s.unlocks||{};
 $('sector-unlocks').innerHTML=[1,2,3].map(map=>{
  const items=data.sectors.filter(x=>x.map===map);
  return '<div class="sector-map"><h3>'+maps[map]+'</h3><div class="sector-list">'+items.map(point=>{
   const isDefault=(map===1&&(point.letter==='A'||point.letter==='B'));
   const checked=Boolean(s.unlocks[sectorUnlockKey(point.id)]??isDefault);
   return '<label class="sector-check"><input type="checkbox" data-sector="'+point.id+'" '+(checked?'checked':'')+'>'+point.letter+' <small>R'+point.rank+'</small></label>'
  }).join('')+'</div></div>'
 }).join('');
 $('sector-unlocks').querySelectorAll('[data-sector]').forEach(el=>el.onchange=()=>{
  persist(s=>{s.unlocks=s.unlocks||{};s.unlocks[sectorUnlockKey(el.dataset.sector)]=el.checked});
  calculate();
 });
}
function unlockedSectors(s,rank){
 return data.sectors.filter(p=>{
  const defaultOpen=p.map===1&&(p.letter==='A'||p.letter==='B');
  return p.rank<=rank&&Boolean(s.unlocks?.[sectorUnlockKey(p.id)]??defaultOpen)
 });
}
function makeLabel(path){return path.map((p,i)=>i===0||p.map!==path[i-1].map?(maps[p.map]||('海圖'+p.map))+' '+p.letter:p.letter).join(' → ')}
function travelSeconds(distance,speed){
 const scaled=distance/40;
 return Math.floor(scaled*3990/speed*60/100);
}
function surveySeconds(point,speed){
 const surveyMinutes=point.sd/60;
 return Math.floor(surveyMinutes*7000/speed*60/100);
}
function routeMetrics(path,speed,buildRange){
 let range=0,time=43200,fuel=0,xp=0,prev=0;
 for(const p of path){
  const edge=p.to[String(prev)];
  if(!edge)return null;
  range+=edge[0]+p.sr;
  time+=travelSeconds(edge[1],speed)+surveySeconds(p,speed);
  fuel+=p.fuel;xp+=p.xp;prev=p.id;
 }
 if(range>buildRange)return null;
 return {range,time,fuel,xp};
}
function measuredExp(path,s){
 const route=makeLabel(path),shortRoute=path.map(p=>p.letter).join(' → ');
 const matches=(s.logs||[]).filter(x=>[route,shortRoute].includes(String(x.route||'').trim().replace(/\s+/g,' '))&&Number(x.exp)>0);
 if(!matches.length)return null;
 return matches.reduce((a,x)=>a+Number(x.exp),0)/matches.length;
}
function bestRoutes(available,ship,buildKey,maxHours,s,requiredId=null,beamLimit=1000){
 const rank=shipRank(ship),build=builds[buildKey]||builds.auto,actualKey=buildKey==='auto'?(rank<15?'1111':'1121'):buildKey;
 if(rank<builds[actualKey].min)return [];
 const stats=buildStats(actualKey,rank),hours=maxHours,eligible=available.filter(p=>p.rank<=rank);
 const byId=new Map(eligible.map(p=>[p.id,p]));
 let beam=[{path:[],prev:0,range:0,time:43200,fuel:0,xp:0,used:new Set()}],results=[];
 const width=beamLimit;
 for(let depth=0;depth<5;depth++){
  const next=[];
  for(const cur of beam){
   const candidates=cur.prev===0?eligible.filter(p=>p.to['0']):eligible.filter(p=>cur.prev!==p.id&&byId.has(p.id)&&byId.get(p.id).to[String(cur.prev)]);
   for(const p of candidates){
    if(cur.used.has(p.id))continue;
    const edge=p.to[String(cur.prev)];if(!edge)continue;
    const nr=cur.range+edge[0]+p.sr;if(nr>stats.range)continue;
    const nt=cur.time+travelSeconds(edge[1],stats.speed)+surveySeconds(p,stats.speed);
    if(nt>hours*3600)continue;
    const nf=cur.fuel+p.fuel;
    const path=cur.path.concat(p),nx=cur.xp+p.xp;
    const route={path,prev:p.id,range:nr,time:nt,fuel:nf,xp:nx,used:new Set([...cur.used,p.id])};
    next.push(route);
   }
  }
  next.sort((a,b)=>(b.xp/b.time)-(a.xp/a.time)||(b.xp-a.xp));
  beam=next.slice(0,width);
  const picked=requiredId===null?beam:next.filter(r=>r.path.some(p=>p.id===requiredId)).slice(0,width);
  results.push(...picked);
  if(!beam.length)break;
 }
 const bestByLabel=new Map();
 for(const r of results){
  if(requiredId!==null&&!r.path.some(p=>p.id===requiredId))continue;
  const label=makeLabel(r.path),observed=measuredExp(r.path,s);
  const xp=observed||r.xp,score=xp/r.time;
  const prior=bestByLabel.get(label);
  if(!prior||score>prior.score)bestByLabel.set(label,{...r,usedExp:Boolean(observed),actualXp:xp,score});
 }
 return [...bestByLabel.values()].sort((a,b)=>b.score-a.score).slice(0,3);
}
function cumulativeTo(rank){
 let n=0;
 for(const r of data.ranks)if(r.rank<rank)n+=r.xp;
 return n;
}
function remainingToTarget(ship,target){
 const rank=shipRank(ship),exp=Math.max(0,Number(ship.exp)||0);
 if(rank>=target)return 0;
 return Math.max(0,cumulativeTo(target)-cumulativeTo(rank)-exp);
}
function fmtTime(sec){
 const h=Math.floor(sec/3600),m=Math.round((sec%3600)/60);
 return h+' 小時 '+m+' 分';
}
function evaluateUnlocks(registered,open,hours,target,probability,s){
 const candidates=[];
 for(const ship of registered){
  const rank=shipRank(ship),key=ship.build||'auto',current=bestRoutes(open,ship,key,hours,s,null,500)[0];
  if(!current)continue;
  const remaining=remainingToTarget(ship,target);
  if(remaining<=0)continue;
  const parents=new Set(open.map(p=>p.id));
  const frontier=data.sectors.filter(p=>p.rank<=rank&&!open.some(x=>x.id===p.id)&&parents.has(p.unlockedBy));
  for(const point of frontier){
   const parent=open.find(p=>p.id===point.unlockedBy);
   if(!parent)continue;
   const hunt=bestRoutes(open,ship,key,hours,s,parent.id,350)[0];
   if(!hunt)continue;
   const expanded=open.concat(point);
   const after=bestRoutes(expanded,ship,key,hours,s,null,500)[0];
   if(!after||makeLabel(after.path)===makeLabel(current.path))continue;
   const p=Math.max(0.01,Math.min(1,probability));
   const expectedAttempts=1/p;
   const remainingAfterHunt=Math.max(0,remaining-expectedAttempts*hunt.actualXp);
   const newTrips=Math.ceil(remainingAfterHunt/Math.max(1,after.actualXp));
   const oldTrips=Math.ceil(remaining/Math.max(1,current.actualXp));
   const oldHours=oldTrips*current.time/3600;
   const projectedHours=expectedAttempts*hunt.time/3600+newTrips*after.time/3600;
   const saved=oldHours-projectedHours;
   const expectedFuel=expectedAttempts*hunt.fuel+newTrips*after.fuel;
   candidates.push({ship:ship.index+1,rank,point,parent,oldHours,projectedHours,saved,expectedFuel,route:after,hunt});
  }
 }
 return candidates.sort((a,b)=>b.saved-a.saved).slice(0,8);
}
function calculate(){
 if(!data)return;
 const s=state(),ships=s.ships||[],open=unlockedSectors(s,145),hours=Number($('calc-hours').value)||48,target=Math.max(2,Math.min(90,Number($('calc-target-rank').value)||85));
 const registered=ships.map((ship,i)=>({...ship,index:i})).filter(x=>x.registered);
 const chance=Number($('unlock-chance')?.value)||0.25;
 if(!registered.length){$('calc-result').innerHTML='<span class="calc-warning">目前沒有勾選已登記的潛水艇。</span>';return}
 let totalFuel=0,totalRuns=0,allCards=[];
 for(const ship of registered){
  const rank=shipRank(ship),key=ship.build||'auto';
  const routes=bestRoutes(open,ship,key,hours,s);
  if(!routes.length){allCards.push('<article class="route-card"><h3>潛水艇 '+(ship.index+1)+'（Rank '+rank+'）</h3><div class="route-meta">目前勾選的海域、等級、零件航程與時間上限內找不到可行航線。請確認 A/B 已開、海域勾選完整，或提高時間上限／改配件。</div></article>');continue}
  const best=routes[0],left=remainingToTarget(ship,target),runs=left?Math.ceil(left/best.actualXp):0;
  totalFuel+=best.fuel;totalRuns+=runs;
  allCards.push('<article class="route-card"><h3>潛水艇 '+(ship.index+1)+'：'+esc(makeLabel(best.path))+'</h3><div class="route-meta">Rank '+rank+' · 配置 '+esc(key==='auto'?(rank<15?'1111':'1121'):key)+' · 速度 '+buildStats(key==='auto'?(rank<15?'1111':'1121'):key,rank).speed+' / 航程 '+buildStats(key==='auto'?(rank<15?'1111':'1121'):key,rank).range+'</div><div class="route-kpis"><span>'+best.actualXp.toLocaleString()+' EXP/趟'+(best.usedExp?'（實測平均）':'（基礎值）')+'</span><span>'+fmtTime(best.time)+'</span><span>'+best.fuel+' 罐燃料</span><span>航程 '+best.range+'</span><span>'+((best.actualXp/best.time)*3600).toLocaleString(undefined,{maximumFractionDigits:0})+' EXP/小時</span></div><div class="route-meta">到 Rank '+target+'：還需約 '+left.toLocaleString()+' EXP，按此刻航線估 '+runs+' 趟（未計升級後路線改善及追加探索）。</div>'+routes.slice(1).map(r=>'<div class="route-meta">替代：'+esc(makeLabel(r.path))+' · '+r.actualXp.toLocaleString()+' EXP / '+fmtTime(r.time)+' / '+r.fuel+' 燃料</div>').join('')+'</article>');
 }
 $('calc-result').innerHTML=allCards.join('')+'<p class="hint">本輪推薦合計約 '+totalFuel+' 罐燃料；目前庫存 '+(Number(s.fuel)||0)+' 罐。各船以目前 Rank／配置獨立求解，路線最多 5 個停靠點。趟數以當前這條航線固定不變作估算，實際上升級、發現新海域及隨機追加探索都會改變結果。</p>'+(registered.some(x=>shipRank(x)>80)?'<p class="hint calc-warning">目前 route 資料只到海圖 3、Rank 80 的海域。Rank 81 以上會用已開且等級符合的最高資料點計算，請視為暫估。</p>':'');
 const investments=evaluateUnlocks(registered,open,hours,target,chance,s);
 $('unlock-eval').innerHTML=investments.length?investments.map(x=>'<article class="route-card"><h3>'+(x.saved>0?'值得評估開啟':'目前不建議優先開')+'：'+maps[x.point.map]+' '+x.point.letter+'（前置 '+maps[x.parent.map]+' '+x.parent.letter+'）</h3><div class="route-meta">潛水艇 '+x.ship+' · Rank '+x.rank+' · 假設發現率 '+Math.round(chance*100)+'%（期望探索 '+(1/chance).toFixed(1)+' 次）</div><div class="route-kpis"><span>目前到 Rank '+target+' 約 '+x.oldHours.toFixed(1)+' 小時</span><span>先開點再練約 '+x.projectedHours.toFixed(1)+' 小時</span><span>'+(x.saved>=0?'省':'多花')+' '+Math.abs(x.saved).toFixed(1)+' 小時</span><span>預估燃料 '+Math.ceil(x.expectedFuel)+' 罐</span></div><div class="route-meta">開點派船候選：'+esc(makeLabel(x.hunt.path))+'；開出後效率線：'+esc(makeLabel(x.route.path))+'</div></article>').join('')+'<p class="hint">只評估目前可嘗試開出的下一層海域；已把探索前置點途中取得的 EXP 計入。發現率是你的情境輸入，不是遊戲保證值。期望次數會是平均值，實際可能一次開出，也可能多跑數次。</p>':'<span class="calc-warning">目前沒有能立即嘗試、且會改變練等最佳路線的下一個海域。先照上方推薦練等，或確認已開海域勾選完整。</span>';
}
async function init(){
 try{
  const res=await fetch('submarine-route-data.json');if(!res.ok)throw new Error('route data '+res.status);
  data=await res.json();
  renderBuilds();renderSectors();
  $('calc-routes').onclick=calculate;
  $('calc-hours').onchange=calculate;
  $('calc-target-rank').onchange=calculate;
  $('unlock-chance').onchange=calculate;
  window.addEventListener('storage',()=>{renderBuilds();renderSectors();calculate()});
  window.addEventListener('submarine-state-updated',()=>{renderBuilds();calculate()});
  calculate();
 }catch(e){$('calc-result').textContent='海域資料載入失敗：'+e.message}
}
init();
})();