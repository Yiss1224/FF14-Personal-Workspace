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
 auto:{label:'自動擇優（可換裝）'},
 '1111':{label:'1111（鯊級起步）',min:1,cost:20,speed:110,range:70},
 '1121':{label:'1121（基礎練等）',min:15,cost:24,speed:120,range:75},
 '1123':{label:'1123（高航程練等）',min:25,cost:31,speed:120,range:100},
 '3123':{label:'3123（特定開圖航線）',min:25,cost:38,speed:135,range:75},
 '3124':{label:'3124（金策配置）',min:35,cost:40,speed:150,range:15}
};
const buildPieces={
 '1111':['1111:0','1111:1','1111:2','1111:3'],
 '1121':['1111:0','1111:1','0020:2','1111:3'],
 '1123':['1111:0','1111:1','0020:2','0003:3'],
 '3123':['3004:0','1111:1','0020:2','0003:3'],
 '3124':['3004:0','1111:1','0020:2','3004:3']
};
const partNames=['船體','船尾','船首','艦橋'],classNames={1:'鯊級',2:'雲鯨級',3:'鯨級',4:'腔棘魚級'};
function validBuild(key,rank){const b=builds[key],rec=rankRec(rank);return Boolean(b&&b.min&&rec&&rank>=b.min&&rec.cap>=b.cost)}
function stock(s){
 const result={};
 for(const k of ['1111','0020','3004','0003'])for(const slot of [0,1,2,3])result[k+':'+slot]=Math.max(0,Number(s.parts?.[k])||0);
 return result;
}
function allocate(build,used,total){
 const result={...used};for(const piece of buildPieces[build]||[])result[piece]=(result[piece]||0)+1;
 return Object.keys(result).every(piece=>result[piece]<=(total[piece]||0))?result:null;
}
function installed(ship){return builds[ship.currentBuild]?.min?ship.currentBuild:(shipRank(ship)<15?'1111':'1121')}
function changes(from,to){return [...to].flatMap((code,i)=>code===from[i]?[]:[partNames[i]+'：'+classNames[from[i]]+' → '+classNames[code]]).join('；')}
function cycleDays(sec){return Math.max(1,Math.ceil(sec/86400))}
function efficiency(route,daily){return route.actualXp/(daily?cycleDays(route.time)*86400:route.time)}

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function state(){
 const base={fuel:1600,repair:300,parts:{'1111':4,'0020':4,'3004':4},ships:Array.from({length:4},(_,i)=>({registered:i===0,rank:1,exp:0})),unlocks:{},logs:[]};
 try{
  const saved=JSON.parse(localStorage.getItem(KEY)||'null')||{};
  return {...base,...saved,parts:{...base.parts,...(saved.parts||{})},ships:base.ships.map((ship,i)=>({...ship,...(saved.ships?.[i]||{})})),unlocks:saved.unlocks||{},logs:Array.isArray(saved.logs)?saved.logs:[]};
 }catch{return base}
}
function persist(mutator){const s=state();mutator(s);localStorage.setItem(KEY,JSON.stringify(s))}
let data=null;
function rankRec(rank){return data.ranks.find(x=>x.rank===rank)||data.ranks.filter(x=>x.rank<=rank).at(-1)}
function shipRank(ship){return Math.max(1,Number(ship.rank)||1)}
function buildStats(build,rank){
 const b=builds[build]?.min?builds[build]:builds['1111'],rec=rankRec(rank)||{};
 return {speed:b.speed+(rec.v||0),range:b.range+(rec.d||0)};
}
function sectorUnlockKey(id){return 'sector-'+id}
function renderBuilds(){
 const ships=state().ships||[];
 $('ship-builds').innerHTML=ships.map((ship,i)=>{
  const rank=shipRank(ship),pref=ship.build||'auto',current=installed(ship);
  return '<div class="build-row"><label>潛水艇 '+(i+1)+'（Rank '+rank+'）· 推薦模式<select data-build="'+i+'">'
   +Object.entries(builds).map(([k,b])=>'<option value="'+k+'" '+(k===pref?'selected':'')+'>'+esc(b.label)+'</option>').join('')+'</select></label>'
   +'<label>目前實際配置<select data-installed="'+i+'">'+Object.entries(builds).filter(([k,b])=>b.min).map(([k,b])=>'<option value="'+k+'" '+(k===current?'selected':'')+'>'+esc(b.label)+'</option>').join('')+'</select></label>'
   +'<label class="build-check"><input type="checkbox" data-voyaging="'+i+'" '+(ship.voyaging?'checked':'')+'>航行中（鎖定配件）</label>'
   +'<small>自動比較 1111 / 1121 / 1123 / 3123，依實際庫存、等級及部件容量過濾。</small></div>'
 }).join('');
 for(const [attr,field] of [['build','build'],['installed','currentBuild']]){
  $('ship-builds').querySelectorAll('[data-'+attr+']').forEach(el=>el.onchange=()=>{
   persist(s=>{s.ships[Number(el.dataset[attr])][field]=el.value});calculate();
  });
 }
 $('ship-builds').querySelectorAll('[data-voyaging]').forEach(el=>el.onchange=()=>{
  persist(s=>{s.ships[Number(el.dataset.voyaging)].voyaging=el.checked});calculate();
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
function bestRoutes(available,ship,buildKey,maxHours,s,requiredId=null,beamLimit=180){
 const rank=shipRank(ship);if(!validBuild(buildKey,rank))return [];
 const stats=buildStats(buildKey,rank),daily=Boolean($('daily-pickup')?.checked);
 let results=[];
 // The three seas have different home ports, so search separately.
 for(const [map,home] of [[1,0],[2,31],[3,52]]){
  const eligible=available.filter(p=>p.map===map&&p.rank<=rank);
  if(!eligible.length||(requiredId!==null&&!eligible.some(p=>p.id===requiredId)))continue;
  let beam=[{path:[],prev:home,range:0,time:43200,fuel:0,xp:0,used:new Set()}];
  for(let depth=0;depth<5;depth++){
   const next=[];
   for(const cur of beam)for(const p of eligible){
    if(cur.used.has(p.id))continue;
    const edge=p.to[String(cur.prev)];if(!edge)continue;
    const nr=cur.range+edge[0]+p.sr;if(nr>stats.range)continue;
    const nt=cur.time+travelSeconds(edge[1],stats.speed)+surveySeconds(p,stats.speed);
    if(nt>maxHours*3600)continue;
    next.push({path:cur.path.concat(p),prev:p.id,range:nr,time:nt,fuel:cur.fuel+p.fuel,
      xp:cur.xp+p.xp,used:new Set([...cur.used,p.id])});
   }
   const quick=r=>r.xp/(daily?cycleDays(r.time)*86400:r.time);
   next.sort((a,b)=>quick(b)-quick(a)||b.xp-a.xp);
   beam=next.slice(0,beamLimit);
   results.push(...(requiredId===null?beam:next.filter(x=>x.path.some(p=>p.id===requiredId)).slice(0,beamLimit)));
   if(!beam.length)break;
  }
 }
 const routes=new Map();
 for(const r of results){
  if(requiredId!==null&&!r.path.some(p=>p.id===requiredId))continue;
  const label=makeLabel(r.path),observed=measuredExp(r.path,s),xp=observed||r.xp;
  const score=xp/(daily?cycleDays(r.time)*86400:r.time);
  if(!routes.has(label)||routes.get(label).score<score)routes.set(label,{...r,actualXp:xp,usedExp:Boolean(observed),score,build:buildKey});
 }
 return [...routes.values()].sort((a,b)=>b.score-a.score).slice(0,3);
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
 const s=state(),ships=s.ships||[],open=unlockedSectors(s,145),
  hours=Number($('calc-hours').value)||48,target=Math.max(2,Math.min(90,Number($('calc-target-rank').value)||85)),
  daily=Boolean($('daily-pickup')?.checked),total=stock(s);
 const registered=ships.map((ship,i)=>({...ship,index:i})).filter(x=>x.registered);
 const progress=nextMapProgress(open);
 if(!registered.length){$('calc-result').innerHTML='<span class="calc-warning">目前沒有已登記潛艇。</span>';return}
 // Cache the route searches for each ship's rank and build in this calculation.
 const routeCache=new Map();
 function getRoutes(ship,key,required){
  const cacheKey=[shipRank(ship),key,required||0,hours,daily].join(':');
  if(!routeCache.has(cacheKey))routeCache.set(cacheKey,bestRoutes(open,ship,key,hours,s,required||null,required?350:180));
  return routeCache.get(cacheKey);
 }
 function options(ship){
  if(ship.voyaging)return [installed(ship)];
  return ship.build&&ship.build!=='auto'?[ship.build]:['1111','1121','1123','3123'];
 }
 const plans=registered.map(ship=>{
  const opts=options(ship).filter(key=>validBuild(key,shipRank(ship)));
  const routeOptions=opts.map(key=>({key,routes:getRoutes(ship,key,null),
   gate:progress?.step&&progress.parent?getRoutes(ship,key,progress.parent.id)[0]||null:null}));
  return {ship,rank:shipRank(ship),routeOptions,canOpen:routeOptions.some(o=>o.gate)};
 });
 const openers=progress?.step&&progress.parent?plans.filter(p=>p.canOpen)
   .sort((a,b)=>b.rank-a.rank||a.ship.index-b.ship.index).slice(0,2).map(p=>p.ship.index):[];
 // Reserve the parts already installed on sailing ships before distributing spare parts.
 let used={};
 for(const p of plans.filter(x=>x.ship.voyaging)){
  used=allocate(installed(p.ship),used,total)||used;
 }
 const allocationErrors=[];
 const chosenByShip=new Map();
 const sorted=[...plans].sort((a,b)=>
   Number(openers.includes(b.ship.index))-Number(openers.includes(a.ship.index))||b.rank-a.rank||a.ship.index-b.ship.index);
 for(const p of sorted){
  const opening=openers.includes(p.ship.index),current=installed(p.ship);
  const candidates=p.routeOptions.map(o=>({key:o.key,
    route:opening?o.gate:o.routes[0],alternates:o.routes})).filter(o=>o.route);
  candidates.sort((a,b)=>{
   if(opening){const turns=cycleDays(a.route.time)-cycleDays(b.route.time);if(turns)return turns}
   return efficiency(b.route,daily)-efficiency(a.route,daily)
      ||Number(b.key===current)-Number(a.key===current);
  });
  const feasible=candidates.find(x=>p.ship.voyaging?x.key===current:Boolean(allocate(x.key,used,total)));
  if(!feasible){allocationErrors.push(p.ship.index+1);continue}
  if(!p.ship.voyaging)used=allocate(feasible.key,used,total);
  chosenByShip.set(p.ship.index,{...feasible,opening});
 }
 let fuel=0,html=[];
 for(const p of plans){
  const ship=p.ship,rank=p.rank,pick=chosenByShip.get(ship.index),current=installed(ship);
  if(!pick){html.push('<article class="route-card"><h3>潛水艇 '+(ship.index+1)+'（Rank '+rank+'）</h3><p class="calc-warning">沒有符合 Rank、時間、配件數量與目前選擇模式的路線。請檢查 0003 庫存、已裝配配置及已開航點。</p></article>');continue}
  const {key,route,alternates,opening}=pick,stats=buildStats(key,rank);
  const remaining=remainingToTarget(ship,target),runs=remaining?Math.ceil(remaining/Math.max(1,route.actualXp)):0;
  fuel+=route.fuel;
  const title=(opening?'開圖兼練等：':'升等優先：')+makeLabel(route.path);
  const swapNeeded=current!==key&&!ship.voyaging;
  const swapText=swapNeeded?'<div class="switch-advice"><strong>本趟建議換裝：'+esc(current)+' → '+esc(key)+'</strong><span>'+esc(changes(current,key))+'</span><button type="button" data-apply-build="'+ship.index+'" data-new-build="'+key+'">已在遊戲換裝，更新紀錄</button></div>'
     :'<div class="route-meta">本趟使用 '+esc(key)+'；'+(ship.voyaging?'目前標記航行中，僅以已安裝配件估算。':'不用換裝。')+'</div>';
  html.push('<article class="route-card"><h3>潛水艇 '+(ship.index+1)+'：'+esc(title)+'</h3>'
   +'<div class="route-meta">Rank '+rank+' · 建議配置 <strong>'+esc(key)+'</strong> · 速度 '+stats.speed+' / 航程 '+stats.range+'</div>'
   +swapText
   +'<div class="route-kpis"><span>'+route.actualXp.toLocaleString()+' EXP/趟'+(route.usedExp?'（實測）':'（基礎值）')+'</span><span>'+fmtTime(route.time)+'</span>'
   +'<span>'+route.fuel+' 罐燃料</span><span>航程 '+route.range+'</span>'
   +(daily?'<span>佔用 '+cycleDays(route.time)+' 次每日收船間隔</span>':'')+'</div>'
   +'<div class="route-meta">到 Rank '+target+' 尚需 '+remaining.toLocaleString()+' EXP；依本趟路線約 '+runs+' 趟（不含後續升級及開圖變化）。</div>'
   +(opening?'<div class="route-meta">本艇負責嘗試解鎖 '+esc(maps[progress.step.map]+' '+progress.step.letter)+'；實際成功後請更新海圖。</div>':'')
   +(!opening?alternates.filter(x=>makeLabel(x.path)!==makeLabel(route.path)).slice(0,2).map(x=>'<div class="route-meta">同配置其他路線：'+esc(makeLabel(x.path))+' · '+x.actualXp.toLocaleString()+' EXP / '+fmtTime(x.time)+'</div>').join(''):'')
   +'</article>');
 }
 const progressNote=progress?.step?'<p class="hint">下一張海圖目標：'+esc(maps[progress.target.map]+' '+progress.target.letter)+'。'
   +'優先探索 '+esc(progress.parent?maps[progress.parent.map]+' '+progress.parent.letter:'尚無已開前置航點')
   +'；由符合條件的最高 Rank 最多兩艘協助開圖，其餘優先練等。</p>':'<p class="hint">目前下一張海圖的前置鏈已完成，船隊專注練等。</p>';
 $('calc-result').innerHTML=progressNote+html.join('')+'<p class="hint">本輪預估燃料 '+fuel+' 罐／庫存 '+(Number(s.fuel)||0)+' 罐。'
  +(daily?'每天固定收一次：以完整 24 小時收船週期排序；超過 24 小時的航次算兩天，即使實際只多幾分鐘。':'依實際 EXP／小時排序。')
  +' 建議換裝只更新計畫，不會直接更改遊戲配件。海圖每次成功開點後請手動標示。</p>'
  +(allocationErrors.length?'<p class="calc-warning">潛艇 '+allocationErrors.join('、')+' 因庫存／航程限制無法配出建議方案。</p>':'')
  +(registered.some(x=>shipRank(x)>80)?'<p class="hint calc-warning">目前航點資料只涵蓋海圖 1–3、Rank 80 以下的海域；高 Rank 建議為已知海域的暫估。</p>':'');
 $('calc-result').querySelectorAll('[data-apply-build]').forEach(btn=>btn.onclick=()=>{
  const i=Number(btn.dataset.applyBuild),newBuild=btn.dataset.newBuild;
  if(!builds[newBuild]||state().ships[i].voyaging)return;
  persist(st=>{st.ships[i].currentBuild=newBuild});renderBuilds();calculate();
 });
}

async function init(){
 try{
  const res=await fetch('submarine-route-data.json');if(!res.ok)throw new Error('route data '+res.status);
  data=await res.json();
  renderBuilds();renderSectors();
  $('calc-routes').onclick=calculate;
  $('calc-hours').onchange=calculate;
  $('calc-target-rank').onchange=calculate;
  window.addEventListener('storage',()=>{renderBuilds();renderSectors();calculate()});
  window.addEventListener('submarine-state-updated',()=>{renderBuilds();calculate()});
  calculate();
 }catch(e){$('calc-result').textContent='海域資料載入失敗：'+e.message}
}
init();
})();