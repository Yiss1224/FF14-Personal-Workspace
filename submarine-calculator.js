(function(){
'use strict';
const KEY='ff14_submarine_planner_v1';
const maps={1:'溺沒海',2:'灰海',3:'翠浪海'};
const mapImages={1:'https://i.imgur.com/Paa93VG.png',2:'https://i.imgur.com/bAReiKQ.png',3:'https://i.imgur.com/Y545lQE.png'};
const mapPositions={
1:{A:[36.7,88.2],B:[32.9,75.3],C:[42.2,69.7],D:[23.6,83.7],E:[37.5,61.1],F:[48.5,85.8],G:[19.8,79.1],H:[7.6,83.7],I:[22.1,67.4],J:[51.2,60.3],K:[31.4,55.5],L:[14.2,57.3],M:[5.7,64.2],N:[45.1,54.7],O:[36.6,52.2],P:[17,38.2],Q:[6.8,35.6],R:[9.5,54.7],S:[18.9,24.5],T:[8.9,20],U:[27.1,34.4],V:[31.9,23.7],W:[41.1,35.9],X:[51.5,36.1],Y:[12.7,10.2],Z:[24,10.4],AA:[47.5,22.6],AB:[43.1,10.4],AC:[53,10.2],AD:[34,10.2]},
2:{A:[16.6,74.9],B:[8.7,83.5],C:[16.7,57.1],D:[26.1,69.8],E:[34,76.1],F:[11.9,41.6],G:[21,44.4],H:[19.4,33.2],I:[29.1,58.6],J:[27.4,43.7],K:[6.8,28.7],L:[26.1,22.1],M:[47.2,57.6],N:[49.2,43.9],O:[45,69],P:[32.6,20.6],Q:[41.7,87.3],R:[45.7,14],S:[38.8,37.1],T:[10,15]},
3:{A:[12,46.2],B:[14.3,70.3],C:[15.4,28.7],D:[6.3,20.3],E:[27.2,9.1],F:[13,11.2],G:[38.7,24.9],H:[39.6,8.9],I:[47.5,18.5],J:[41.3,40.1],K:[49.5,8.6],L:[50.5,30.2],M:[38,65]}
};
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
 const s=state(),map=Math.max(1,Math.min(3,Number(s.activeSectorMap)||1));
 const items=data.sectors.filter(x=>x.map===map);
 const opened=items.filter(p=>{const d=map===1&&(p.letter==='A'||p.letter==='B');return Boolean(s.unlocks?.[sectorUnlockKey(p.id)]??d)}).length;
 const tabs=[1,2,3].map(m=>'<button type="button" class="map-tab '+(m===map?'active':'')+'" data-map-tab="'+m+'" aria-pressed="'+(m===map)+'">'+maps[m]+'</button>').join('');
 const points=items.map(p=>{
  const d=map===1&&(p.letter==='A'||p.letter==='B'),on=Boolean(s.unlocks?.[sectorUnlockKey(p.id)]??d),xy=mapPositions[map][p.letter]||[50,50],label=maps[map]+' '+p.letter;
  return '<button type="button" class="map-point '+(on?'is-open':'is-closed')+'" style="left:'+xy[0]+'%;top:'+xy[1]+'%" data-sector="'+p.id+'" aria-pressed="'+on+'" aria-label="'+esc(label+'，Rank '+p.rank+'，'+(on?'已開啟':'未開啟')+'；點擊切換')+'" title="'+esc(label+' · Rank '+p.rank+' · '+(on?'已開啟':'未開啟')+'（點擊切換）')+'">'+esc(p.letter)+'</button>'
 }).join('');
 $('sector-unlocks').innerHTML='<div class="map-tabs" role="tablist" aria-label="海圖">'+tabs+'</div><div class="map-heading"><strong>'+maps[map]+'</strong><span>'+opened+' / '+items.length+' 個海域已開</span><small>點海圖上的圓點切換狀態</small></div><div class="map-stage"><img src="'+mapImages[map]+'" alt="'+maps[map]+'潛水艇海域地圖" loading="lazy" referrerpolicy="no-referrer"><div class="map-points">'+points+'</div></div><div class="map-legend"><span><i class="legend-dot is-open"></i>已開啟</span><span><i class="legend-dot is-closed"></i>未開啟</span><small>玩家整理圖，來源：<a href="https://forum.square-enix.com/ffxiv/threads/357591-Submersible-Information-Thread" target="_blank" rel="noreferrer">FFXIV 官方論壇潛水艇資訊串</a></small></div>';
 $('sector-unlocks').querySelectorAll('[data-map-tab]').forEach(el=>el.onclick=()=>{persist(s=>{s.activeSectorMap=Number(el.dataset.mapTab)});renderSectors()});
 $('sector-unlocks').querySelectorAll('[data-sector]').forEach(el=>el.onclick=()=>{
  const id=Number(el.dataset.sector),p=data.sectors.find(x=>x.id===id),d=p.map===1&&(p.letter==='A'||p.letter==='B'),was=Boolean(state().unlocks?.[sectorUnlockKey(id)]??d);
  persist(s=>{s.unlocks=s.unlocks||{};s.unlocks[sectorUnlockKey(id)]=!was});renderSectors();calculate()
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
function nextMapProgress(open){
 const openIds=new Set(open.map(p=>p.id));
 const target=[2,3].map(m=>data.sectors.find(p=>p.map===m&&p.letter==='A')).find(p=>p&&!openIds.has(p.id));
 if(!target)return null;
 const reverse=[],seen=new Set();let cursor=target;
 while(cursor&&!openIds.has(cursor.id)&&!seen.has(cursor.id)){
  seen.add(cursor.id);reverse.push(cursor);
  cursor=cursor.unlockedBy?data.sectors.find(p=>p.id===cursor.unlockedBy):null;
 }
 if(!cursor||!openIds.has(cursor.id))return {target,chain:null,step:null,parent:null};
 reverse.reverse();
 const step=reverse[0],parent=step&&data.sectors.find(p=>p.id===step.unlockedBy);
 return {target,chain:reverse,step,parent:parent&&openIds.has(parent.id)?parent:null};
}
function calculate(){
 if(!data)return;
 const s=state(),ships=s.ships||[],open=unlockedSectors(s,145),hours=Number($('calc-hours').value)||48,target=Math.max(2,Math.min(90,Number($('calc-target-rank').value)||85));
 const registered=ships.map((ship,i)=>({...ship,index:i})).filter(x=>x.registered);
 const progress=nextMapProgress(open);
 if(!registered.length){$('calc-result').innerHTML='<span class="calc-warning">目前沒有勾選已登記的潛水艇。</span>';return}
 let totalFuel=0,totalRuns=0,allCards=[];
 for(const ship of registered){
  const rank=shipRank(ship),key=ship.build||'auto';
  const routes=bestRoutes(open,ship,key,hours,s);
  if(!routes.length){allCards.push('<article class="route-card"><h3>潛水艇 '+(ship.index+1)+'（Rank '+rank+'）</h3><div class="route-meta">目前勾選的海域、等級、零件航程與時間上限內找不到可行航線。請確認 A/B 已開、海域勾選完整，或提高時間上限／改配件。</div></article>');continue}
  const expBest=routes[0];
  let gateRoute=null,gateReason='';
  if(progress?.step&&progress.parent){
   if(progress.parent.rank<=rank){
    gateRoute=bestRoutes(open,ship,key,hours,s,progress.parent.id,500)[0]||null;
    if(!gateRoute)gateReason='目前配件航程／回航時間無法到達前置點 '+maps[progress.parent.map]+' '+progress.parent.letter;
   }else gateReason='前置點 '+maps[progress.parent.map]+' '+progress.parent.letter+' 需 Rank '+progress.parent.rank+'，目前 Rank '+rank;
  }else if(progress?.step)gateReason='前置鏈中間有未標記為已開的點，請先在海圖上更新開放狀態。';
  const chosen=gateRoute||expBest,opening=Boolean(gateRoute),remaining=remainingToTarget(ship,target),runs=remaining?Math.ceil(remaining/Math.max(1,chosen.actualXp)):0;
  totalFuel+=chosen.fuel;totalRuns+=runs;
  const routeTitle=opening?'開圖優先：'+makeLabel(chosen.path):makeLabel(chosen.path);
  const targetText=progress?.step?'<div class="route-meta"><strong>下一張海圖前置：</strong>目標 '+maps[progress.target.map]+' '+progress.target.letter+'（Rank '+progress.target.rank+'）；目前先探索 '+maps[progress.parent?.map||progress.step.map]+' '+(progress.parent?.letter||'—')+'，推進至 '+maps[progress.step.map]+' '+progress.step.letter+'。'+(gateReason?' '+esc(gateReason):'')+'</div>':'';
  const alternate=opening&&makeLabel(expBest.path)!==makeLabel(chosen.path)?'<div class="route-meta">純升等最快：'+esc(makeLabel(expBest.path))+' · '+expBest.actualXp.toLocaleString()+' EXP / '+fmtTime(expBest.time)+' / '+expBest.fuel+' 燃料</div>':'';
  allCards.push('<article class="route-card"><h3>潛水艇 '+(ship.index+1)+'：'+esc(routeTitle)+'</h3><div class="route-meta">Rank '+rank+' · 配置 '+esc(key==='auto'?(rank<15?'1111':'1121'):key)+' · 速度 '+buildStats(key==='auto'?(rank<15?'1111':'1121'):key,rank).speed+' / 航程 '+buildStats(key==='auto'?(rank<15?'1111':'1121'):key,rank).range+'</div>'+targetText+'<div class="route-kpis"><span>'+chosen.actualXp.toLocaleString()+' EXP/趟'+(chosen.usedExp?'（實測平均）':'（基礎值）')+'</span><span>'+fmtTime(chosen.time)+'</span><span>'+chosen.fuel+' 罐燃料</span><span>航程 '+chosen.range+'</span><span>'+((chosen.actualXp/chosen.time)*3600).toLocaleString(undefined,{maximumFractionDigits:0})+' EXP/小時</span></div><div class="route-meta">到 Rank '+target+'：還需約 '+remaining.toLocaleString()+' EXP，按此刻推薦航線估 '+runs+' 趟（未計升級後路線改善及追加探索）。</div>'+alternate+(!opening?routes.slice(1).map(r=>'<div class="route-meta">替代：'+esc(makeLabel(r.path))+' · '+r.actualXp.toLocaleString()+' EXP / '+fmtTime(r.time)+' / '+r.fuel+' 燃料</div>').join(''):'')+'</article>');
 }
 const progressNote=progress?.step?'<p class="hint">下一張海圖目標：'+maps[progress.target.map]+' '+progress.target.letter+'。前置點依序：'+(progress.chain?esc(makeLabel(progress.chain)):'路線資料缺少前置鏈')+'。每次實際開出一點後，更新海圖狀態，推薦會接著推進下一個前置點。</p>':'<p class="hint">目前計算資料未包含下一張海圖的前置路線；升等推薦會以已開海域為準。</p>';
 $('calc-result').innerHTML=progressNote+allCards.join()+'<p class="hint">本輪推薦合計約 '+totalFuel+' 罐燃料；目前庫存 '+(Number(s.fuel)||0)+' 罐。各船以目前 Rank／配置獨立求解，路線最多 5 個停靠點。優先開圖的航線已計入本趟 EXP；地圖每更新一個已開點，下一輪推薦會前進到後續開圖步驟。</p>'+(registered.some(x=>shipRank(x)>80)?'<p class="hint calc-warning">目前 route 資料只到海圖 3、Rank 80 的海域。Rank 81 以上會用已開且等級符合的最高資料點計算，請視為暫估。</p>':'');
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