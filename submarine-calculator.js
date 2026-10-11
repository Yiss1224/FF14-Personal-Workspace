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
// 每日可以收船、再次派船的實際時間窗口（台灣瀏覽器當地時間）。
const DAY=86400;
function clockMinutes(id,fallback){
 const str=document.getElementById(id)?.value;
 if(typeof str!=='string'||!(/^\d{1,2}:\d{2}$/.test(str)))return fallback;
 const [h,m]=str.split(':').map(Number);
 return h>=0&&h<24&&m>=0&&m<60?h*60+m:fallback;
}
function windowSettings(){
 const start=clockMinutes('pickup-start',19*60),end=clockMinutes('pickup-end',22*60);
 const valid=end>start;
 const from=valid?start:19*60,to=valid?end:22*60;
 const departure=clockMinutes('calc-departure-time',from);
 return {start:from,end:to,departure:Math.min(to,Math.max(from,departure)),valid,
   departureInside:departure>=from&&departure<=to};
}
function pickupTiming(voyageSeconds){
 const {start,end,departure}=windowSettings();
 const depart=departure*60,arrival=depart+voyageSeconds;
 const day=Math.floor(arrival/DAY),time=arrival-day*DAY;
 const earliest=start*60,latest=end*60;
 const pickup=time<earliest?day*DAY+earliest:
   time<=latest?arrival:(day+1)*DAY+earliest;
 return {elapsed:pickup-depart,waiting:pickup-arrival,day:Math.floor(pickup/DAY),
   clock:pickup%DAY};
}
function pickupElapsed(voyageSeconds,daily){
 return daily?pickupTiming(voyageSeconds).elapsed:voyageSeconds;
}
function fmtClock(seconds){
 const secs=((Math.round(seconds)%DAY)+DAY)%DAY;
 return String(Math.floor(secs/3600)).padStart(2,'0')+':'
   +String(Math.floor((secs%3600)/60)).padStart(2,'0');
}
function pickupLabel(voyageSeconds){
 const p=pickupTiming(voyageSeconds);
 const dayText=p.day===1?'明天':p.day===2?'後天':'第 '+p.day+' 天';
 return dayText+' '+fmtClock(p.clock);
}
function efficiency(route,daily){return route.actualXp/pickupElapsed(route.time,daily)}

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function state(){
 const base={fuel:1600,repair:300,parts:{'1111':4,'0020':4,'3004':4,'0003':0},ships:Array.from({length:4},(_,i)=>({registered:i===0,rank:1,exp:0})),unlocks:{},logs:[],activeSectorMap:1};
 try{
  const saved=JSON.parse(localStorage.getItem(KEY)||'null')||{};
  return {...base,...saved,parts:{...base.parts,...(saved.parts||{})},ships:base.ships.map((ship,i)=>({...ship,...(saved.ships?.[i]||{})})),unlocks:saved.unlocks||{},logs:Array.isArray(saved.logs)?saved.logs:[]};
 }catch{return base}
}
function persist(mutator){const s=state();mutator(s);localStorage.setItem(KEY,JSON.stringify(s));window.dispatchEvent(new Event('submarine-build-state-updated'))}
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
   const quick=r=>r.xp/pickupElapsed(r.time,daily);
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
  const score=xp/pickupElapsed(r.time,daily);
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

// 只分配「現在可派船」的配件；航行中的已裝配配件先保留。
// 目標是增加全艦隊的 OJ 營運船日，並降低最後一艘畢業拖延。
// 這是逐趟啟發式排程，非已證明的全航程最優解。
function selectFleetAllocation(plans, fixedUsage, availableStock, targetRank, daily){
 const requested=plans.filter(p=>!p.ship.voyaging&&p.rank<targetRank);
 // 仍然替其他可派船計算；單艘沒有可行航線不應拖垮整個船隊。
 const missing=requested.filter(p=>!p.choices.length).map(p=>p.ship.index+1);
 const ready=requested.filter(p=>p.choices.length);
 if(!ready.length)return {chosen:new Map(),missing,
  reason:missing.length?'潛艇 '+missing.join('、')+' 找不到可行航線，請檢查海圖／Rank／回航上限。':null};
 let best=null;
 const decisions=new Map();
 function evaluate(usage,gateCount,gateTurns){
  const entries=[...decisions.values()];
  if(!entries.length)return;
  const etas=entries.map(({plan,option})=>estimatedFinishDays(plan,option,targetRank,daily));
  const sum=etas.reduce((a,b)=>a+b,0);
  const fleetBottleneck=Math.max(0,...etas);
  const switching=entries.filter(({plan,option})=>installed(plan.ship)!==option.key).length;
  // 開圖優先：先保證盡可能多艘合格開圖船探索，再降低其派船週期。
  // 剩下的以可提前投入 OJ 的船日＋全艦隊完成日期評分。
  const objective=sum+fleetBottleneck*0.6+switching*0.002;
  const val={gateCount,gateTurns,objective,entries:entries.map(x=>({plan:x.plan,option:x.option}))};
  if(!best||val.gateCount>best.gateCount||
     (val.gateCount===best.gateCount&&val.gateTurns<best.gateTurns)||
     (val.gateCount===best.gateCount&&val.gateTurns===best.gateTurns&&val.objective<best.objective))best=val;
 }
 function walk(i,usage,count,turns){
  if(i>=ready.length){evaluate(usage,count,turns);return}
  const p=ready[i];
  for(const option of p.choices){
   const updated=allocate(option.key,usage,availableStock);
   if(!updated)continue;
   decisions.set(p.ship.index,{plan:p,option});
   walk(i+1,updated,count+Number(option.opening),turns+(option.opening?pickupElapsed(option.route.time,daily):0));
   decisions.delete(p.ship.index);
  }
 }
 walk(0,fixedUsage,0,0);
 if(!best)return {chosen:new Map(),missing:ready.map(p=>p.ship.index+1),reason:'實際零件庫存不足，無法讓所有返航船同時配裝出航'};
 return {chosen:new Map(best.entries.map(x=>[x.plan.ship.index,x.option])),missing,best,reason:missing.length?'潛艇 '+missing.join('、')+' 找不到可行航線，其他船仍正常推薦。':null};
}
function estimatedFinishDays(plan,option,targetRank,daily){
 const rem=remainingToTarget(plan.ship,targetRank);
 if(rem<=0)return 0;
 const turns=pickupElapsed(option.route.time,daily)/DAY;
 // 本 Rank 之後的 EXP/日還會因新航點而上升；只用目前同海圖
 // 可找到的最快路線估算，並設保守底線，避免低 Rank 被誤判要幾百天。
 const bestKnown=Math.max(0,...plan.choices.map(x=>x.route.actualXp/
        (pickupElapsed(x.route.time,daily)/DAY)));
 const rank=plan.rank;
 const baseline=rank<25?170000:rank<50?340000:rank<70?750000:1300000;
 const futureRate=Math.max(baseline,bestKnown);
 return turns+Math.max(0,rem-option.route.actualXp)/futureRate;
}
function calculate(){
 if(!data)return;
 const s=state(),ships=s.ships||[],open=unlockedSectors(s,145),
  hours=Number($('calc-hours').value)||48,target=Math.max(2,Math.min(90,Number($('calc-target-rank').value)||85)),
  daily=Boolean($('daily-pickup')?.checked),total=stock(s),available0003=Math.max(0,Number(s.parts?.['0003'])||0);
 const w=windowSettings();
 if(daily&&!w.valid){$('calc-result').innerHTML='<p class="calc-warning">收船窗口結束時間必須晚於開始時間，且在同一天內。</p>';return}
 if(daily&&!w.departureInside){$('calc-result').innerHTML='<p class="calc-warning">預計本次派船時間應在收船窗口內；請調整時間後再計算。</p>';return}
 const registered=ships.map((ship,i)=>({...ship,index:i})).filter(x=>x.registered);
 const progress=nextMapProgress(open);
 if(!registered.length){$('calc-result').innerHTML='<span class="calc-warning">目前沒有已登記潛艇。</span>';return}
 // 同一天相同 Rank／配置／目標的計算只搜尋一次。
 const cache=new Map();
 function getRoutes(ship,key,required){
  const k=[shipRank(ship),key,required||0,hours,daily].join(':');
  if(!cache.has(k))cache.set(k,bestRoutes(open,ship,key,hours,s,required||null,required?350:180));
  return cache.get(k);
 }
 function options(ship){
  if(ship.voyaging)return [installed(ship)];
  return ship.build&&ship.build!=='auto'?[ship.build]:['1111','1121','1123','3123'];
 }
 let fixedUsage={},reserved0003=0,stockConflict='';
 for(const ship of registered.filter(x=>x.voyaging||shipRank(x)>=target)){
  const current=installed(ship);
  const next=allocate(current,fixedUsage,total);
  if(!next){stockConflict='航行中或已畢業但尚未拆下的配件超過庫存，請檢查各船「實際配置」與零件數量。';break}
  fixedUsage=next;
  if(['1123','3123'].includes(current))reserved0003++;
 }
 if(stockConflict){
  $('calc-result').innerHTML='<p class="calc-warning">'+esc(stockConflict)+'</p>';return;
 }
 const ready=registered.filter(x=>!x.voyaging&&shipRank(x)<target);
 const plans=ready.map(ship=>{
  const rank=shipRank(ship);
  const routeOptions=options(ship).filter(key=>validBuild(key,rank))
   .map(key=>({key,normal:getRoutes(ship,key,null),
    gate:progress?.parent&&progress.step?getRoutes(ship,key,progress.parent.id):[]}));
  return {ship,rank,routeOptions,canOpen:routeOptions.some(o=>o.gate.length>0),choices:[]};
 });
 // 延續開圖原則：符合條件的最高 Rank，最多兩艘；但由整隊配置評分決定是否使用 0003。
 const openers=progress?.step&&progress.parent?plans.filter(p=>p.canOpen)
  .sort((a,b)=>b.rank-a.rank||a.ship.index-b.ship.index).slice(0,2).map(p=>p.ship.index):[];
 for(const p of plans){
  const designated=openers.includes(p.ship.index);
  for(const b of p.routeOptions){
   if(designated&&b.gate.length){
    for(const route of b.gate.slice(0,2))p.choices.push({key:b.key,route,alternates:b.normal,opening:true});
   }else if(b.normal.length){
    p.choices.push({key:b.key,route:b.normal[0],alternates:b.normal,opening:false});
   }
  }
 }
 const allocation=selectFleetAllocation(plans,fixedUsage,total,target,daily);
 const selected=allocation.chosen;
 let fuel=0,html=[];
 for(const ship of registered){
  const rank=shipRank(ship),current=installed(ship);
  if(ship.voyaging){
   html.push('<article class="route-card"><h3>潛水艇 '+(ship.index+1)+'（Rank '+rank+'）</h3>'
    +'<div class="route-meta">航行中，'+esc(current)+' 配件已占用'
    +(builds[current]&&['1123','3123'].includes(current)?'（包含 0003 ×1）':'')
    +'。無法在返航前轉移配件；下次收船後取消「航行中」再計算。</div></article>');
   continue;
  }
  if(rank>=target){
   const holding=['1123','3123'].includes(current);
   html.push('<article class="route-card"><h3>潛水艇 '+(ship.index+1)+'：已達 Rank '+target+'</h3>'
    +'<div class="route-meta">已達練等目標；建議換成 3124 跑 O → J。'
    +(holding?'目前 '+esc(current)+' 上的 0003 還是已安裝狀態，暫時不會借給別艘。':'')
    +(current==='3124'?' 已登記為 3124，無需換裝。':' 請先在遊戲內換裝，再確認釋出配件。')
    +'</div>'
    +(current!=='3124'?'<div class="switch-advice"><strong>建議換裝：'+esc(current)+' → 3124</strong><span>'
      +esc(changes(current,'3124'))+'</span><button type="button" data-apply-build="'+ship.index
      +'" data-new-build="3124">已換成 3124，更新紀錄</button></div>':'')
    +'</article>');
   continue;
  }
    const p=plans.find(x=>x.ship.index===ship.index),choice=selected.get(ship.index);
  if(!choice){
   html.push('<article class="route-card"><h3>潛水艇 '+(ship.index+1)+'（Rank '+rank+'）</h3>'
    +'<p class="calc-warning">找不到符合庫存的完整船隊配置。'+esc(allocation.reason||'請檢查配件與可跑航點')+'</p></article>');
   continue;
  }
  const {key,route,opening,alternates}=choice,stats=buildStats(key,rank),remaining=remainingToTarget(ship,target);
  const turns=pickupElapsed(route.time,daily)/DAY;
  const runs=remaining?Math.ceil(remaining/Math.max(1,route.actualXp)):0;
  const previous=getRoutes(ship,current,opening&&progress?.parent?progress.parent.id:null)[0]||null;
  const deltaRate=previous?Math.round(((route.actualXp/turns)/
       (previous.actualXp/(pickupElapsed(previous.time,daily)/DAY))-1)*100):null;
  const reason=opening
   ?'優先完成必要開圖，避免全隊受前置航點阻塞。'
   :['1123','3123'].includes(key)
    ?'本輪比較後，將有限 0003 分配給此艇有利於整隊盡早完成練等。'
    :'保留 0003 給其他潛艇，整隊預估營運船日較有利。';
  const switching=current!==key;
  const swapText=switching
    ?'<div class="switch-advice"><strong>本趟建議換裝：'+esc(current)+' → '+esc(key)+'</strong>'
       +'<span>'+esc(changes(current,key))+'</span><small>'+esc(reason)+'</small>'
       +'<button type="button" data-apply-build="'+ship.index+'" data-new-build="'+key+'">已在遊戲換裝，更新紀錄</button></div>'
    :'<div class="route-meta">本趟使用 '+esc(key)+'，不用換裝。'+esc(reason)+'</div>';
  fuel+=route.fuel;
  html.push('<article class="route-card"><h3>潛水艇 '+(ship.index+1)+'：'+(opening?'開圖兼練等：':'升等優先：')+esc(makeLabel(route.path))+'</h3>'
   +'<div class="route-meta">Rank '+rank+' · 建議配置 <strong>'+esc(key)+'</strong> · 速度 '+stats.speed+' / 航程 '+stats.range+'</div>'
   +swapText
   +'<div class="route-kpis"><span>'+route.actualXp.toLocaleString()+' EXP/趟'+(route.usedExp?'（實測）':'（基礎值）')+'</span>'
   +'<span>'+fmtTime(route.time)+'</span><span>'+route.fuel+' 罐燃料</span><span>航程 '+route.range+'</span>'
   +(daily?'<span>最早收船：'+esc(pickupLabel(route.time))+'</span>':'')
   +(deltaRate!==null?'<span>相較目前配置 '+(deltaRate>=0?'+':'')+deltaRate+'% EXP／收船週期</span>':'')+'</div>'
   +'<div class="route-meta">至 Rank '+target+' 尚需 '+remaining.toLocaleString()+' EXP；若一直跑這條約 '+runs+' 趟（升級與開圖後會改變）。</div>'
   +(opening?'<div class="route-meta">本輪探索 '+esc(maps[progress.step.map]+' '+progress.step.letter)+' 的前置點；成功開圖後請點地圖更新。</div>':'')
   +'</article>');
 }
 const premiumAssigned=[...selected.values()].filter(c=>['1123','3123'].includes(c.key)).length;
 const free0003=Math.max(0,available0003-reserved0003-premiumAssigned);
 const header='<div class="route-meta"><strong>0003 智慧分配：</strong>持有 '+available0003+' 套；航行中／已畢業未拆配件占用 '+reserved0003
  +' 套；本輪派船分配 '+premiumAssigned+' 套；暫時未使用 '+free0003+' 套。'
  +' 本次比較最多四艘的可行組合，考慮剩餘 EXP、畢業瓶頸及必要開圖。</div>';
 const progressNote=progress?.step
  ?'<p class="hint">下一張海圖目標：'+esc(maps[progress.target.map]+' '+progress.target.letter)
   +'；優先探索 '+esc(progress.parent?maps[progress.parent.map]+' '+progress.parent.letter:'尚未開出的前置點')
   +'。最多兩艘合格船負責開圖，其他船優先練等。</p>'
  :'<p class="hint">下一張海圖前置已完成，返航的船會以練等／OJ 營運為目標分配。</p>';
 const warning=allocation.reason?'<p class="calc-warning">'+esc(allocation.reason)+'</p>':'';
 $('calc-result').innerHTML=header+progressNote+warning+html.join('')
  +'<p class="hint">本輪建議消耗約 '+fuel+' 罐燃料（庫存 '+(Number(s.fuel)||0)+'）。'
  +(daily?'每天可收／派船窗口 '+fmtClock(windowSettings().start*60)+'～'+fmtClock(windowSettings().end*60)+'；考慮實際預計出航時間與下一次可收船時間。':'以 EXP／實際時間比較。')
  +' 智慧分配屬逐趟前瞻估算，不是保證全球最短畢業日；實際開圖 RNG、EXP 獎勵及未來航點變化仍會改變最佳選擇。</p>'
  +(registered.some(x=>shipRank(x)>80)?'<p class="hint calc-warning">航線資料目前只到海圖 3、Rank 80 的海域；Rank 81 以上使用現有海域預估。</p>':'');
 $('calc-result').querySelectorAll('[data-apply-build]').forEach(btn=>btn.onclick=()=>{
  const i=Number(btn.dataset.applyBuild),next=btn.dataset.newBuild;
  if(!builds[next]||state().ships[i].voyaging)return;
  persist(st=>{st.ships[i].currentBuild=next});renderBuilds();calculate();
 });
}
const defaultPlannerSettings={
 maxHours:48,targetRank:85,dailyPickup:true,pickupStart:'19:00',
 pickupEnd:'22:00',departureTime:'19:00',manualDeparture:false
};
function validClock(value,fallback){
 return typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value)?value:fallback;
}
function plannerControls(settings){
 const s={...defaultPlannerSettings,...(settings||{})};
 $('calc-hours').value=[24,36,48].includes(Number(s.maxHours))?String(s.maxHours):'48';
 $('calc-target-rank').value=Number.isInteger(Number(s.targetRank))&&Number(s.targetRank)>=2&&Number(s.targetRank)<=90?String(s.targetRank):'85';
 $('daily-pickup').checked=s.dailyPickup!==false;
 $('pickup-start').value=validClock(s.pickupStart,'19:00');
 $('pickup-end').value=validClock(s.pickupEnd,'22:00');
 $('calc-departure-time').value=validClock(s.departureTime,'19:00');
 return s.manualDeparture===true;
}
function savePlannerSettings(manualDeparture){
 const snapshot={
  maxHours:Number($('calc-hours').value),targetRank:Number($('calc-target-rank').value),
  dailyPickup:!!$('daily-pickup').checked,pickupStart:$('pickup-start').value,
  pickupEnd:$('pickup-end').value,departureTime:$('calc-departure-time').value,
  manualDeparture:!!manualDeparture
 };
 persist(s=>{s.plannerSettings={...(s.plannerSettings||{}),...snapshot}});
}
async function init(){
 try{
  const res=await fetch('submarine-route-data.json');if(!res.ok)throw new Error('route data '+res.status);
  data=await res.json();
  renderBuilds();renderSectors();
  let manuallySelectedDeparture=plannerControls(state().plannerSettings);
  function refreshDepartureClock(){
   if(manuallySelectedDeparture)return;
   const now=new Date(),minute=now.getHours()*60+now.getMinutes(),w=windowSettings();
   $('calc-departure-time').value=minute>=w.start&&minute<=w.end
    ?String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0')
    :fmtClock(w.start*60);
  }
  function updatePlanner(){savePlannerSettings(manuallySelectedDeparture);calculate()}
  $('calc-routes').onclick=()=>{refreshDepartureClock();updatePlanner()};
  ['calc-hours','calc-target-rank','daily-pickup','pickup-start','pickup-end'].forEach(id=>{
   const ctrl=$(id);if(ctrl)ctrl.onchange=updatePlanner;
  });
  $('calc-departure-time').onchange=()=>{manuallySelectedDeparture=true;updatePlanner()};
  // 匯出前把目前表單值一併寫回 JSON；匯入完整備份後再套用時間與偏好。
  window.addEventListener('submarine-export-requested',()=>savePlannerSettings(manuallySelectedDeparture));
  window.addEventListener('submarine-data-imported',()=>{
   manuallySelectedDeparture=plannerControls(state().plannerSettings);
   renderBuilds();renderSectors();calculate();
  });
  refreshDepartureClock();
  window.addEventListener('storage',()=>{
   manuallySelectedDeparture=plannerControls(state().plannerSettings);
   refreshDepartureClock();renderBuilds();renderSectors();calculate();
  });
  window.addEventListener('submarine-state-updated',()=>{renderBuilds();renderSectors();calculate()});
  calculate();
 }catch(e){$('calc-result').textContent='海域資料載入失敗：'+e.message}
}
init();
})();