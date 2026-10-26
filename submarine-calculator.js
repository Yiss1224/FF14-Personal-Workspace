(function(){
'use strict';
const KEY='ff14_submarine_planner_v1';
const maps=window.SubmarineMapNames||{1:'溺沒海',2:'灰海',3:'翠浪海',4:'塞壬海',5:'紫礁海',6:'南蒼茫洋',7:'北洋'};
// Home port (start point) of each sea in the game's SubmarineExploration sheet.
const mapHomes={1:0,2:31,3:52,4:73,5:94,6:115,7:136};
const mapImage=m=>'submarine-maps/sea-'+m+'.jpg';
// Image size (width/height) of each chart, and point centres in percent measured on those images.
const mapAspect={1:820/801,2:686/680,3:684/683,4:683/686,5:1,6:1,7:1};
const mapPositions={
1:{A:[64.3,88.3],B:[57.5,74.6],C:[74,69.9],D:[40.5,85.7],E:[65.3,61.4],F:[84.6,85.3],G:[27.5,76.1],H:[13.5,84.6],I:[38.8,66.2],J:[89.5,60.3],K:[52.3,55.5],L:[27.5,57.1],M:[10.8,63.2],N:[79.7,55.5],O:[63,49.6],P:[28.6,35],Q:[12.4,35.9],R:[17,53.2],S:[33.4,23.7],T:[13.5,19.3],U:[47.3,32.2],V:[56.1,22],W:[70.9,37.6],X:[89.5,33.5],Y:[23.4,9.2],Z:[43.2,11.4],AA:[82.3,20.7],AB:[75.1,9.3],AC:[89,11],AD:[60.6,10.2]},
2:{A:[29.2,75.7],B:[15.5,84.3],C:[28.9,57.9],D:[45.1,70.1],E:[60,77.7],F:[21.1,42],G:[36.7,47.6],H:[34.2,33.6],I:[51.2,60.8],J:[47.9,43.9],K:[11.9,28.9],L:[45,22.3],M:[82.6,58.5],N:[85.9,45.7],O:[77.6,69.3],P:[58.2,21.1],Q:[73.3,88.3],R:[80.2,12.9],S:[68.1,29.3],T:[17.6,15.1]},
3:{A:[20.5,46.4],B:[24.6,70.6],C:[27,29],D:[10.7,19.6],E:[47.5,10.8],F:[22.7,11],G:[68.1,25.3],H:[68.7,9.1],I:[83.5,18.9],J:[71.9,40],K:[86.4,8.9],L:[88.7,30.7],M:[66.5,64.4],N:[63.2,80.5],O:[93.7,19.2],P:[48.5,89.5],Q:[89,45.5],R:[73.5,77.2],S:[85.2,61.9],T:[83.8,88.9]},
4:{A:[21.2,75.6],B:[43.7,70.8],C:[34.2,52],D:[45.6,25.7],E:[61.6,56.2],F:[67.9,65.4],G:[7.4,41.2],H:[35.1,13],I:[57.9,18.7],J:[75,55.9],K:[80.7,42.9],L:[62.2,81.3],M:[13.4,13.3],N:[54.4,6.9],O:[89.5,38.4],P:[49.4,90],Q:[88.4,12.3],R:[68.2,29.8],S:[92.3,65.4],T:[71.7,89.3]},
5:{A:[18.4,88],B:[20,73.7],C:[49.2,77],D:[9.8,53.4],E:[53.7,91.6],F:[36.4,55.5],G:[73.3,82],H:[88.8,91.8],I:[18.6,42.1],J:[52.8,47.7],K:[65.5,70.5],L:[55.3,33.5],M:[80,60.7],N:[69.5,26.2],O:[73.1,46.7],P:[6.9,12.8],Q:[34.8,34],R:[90.3,36.8],S:[79.7,7.5],T:[49.2,9.4]},
6:{A:[82.6,17.9],B:[67.4,40.9],C:[61.6,19.9],D:[89.9,49.5],E:[45.4,9.5],F:[48,43.8],G:[37.8,25.9],H:[30.4,37.7],I:[49.9,62],J:[10.9,11.2],K:[10,31.9],L:[70.9,77],M:[33.5,67.3],N:[21.6,65.7],O:[90,91.1],P:[10,51],Q:[46.9,82.1],R:[20.9,77.6],S:[50.9,92.1],T:[10,91.1]},
7:{A:[87,87.2],B:[89,58.6],C:[80.1,78.4],D:[71.9,64.6],E:[83.9,37.5],F:[54.3,65.3],G:[46.9,44.3],H:[34.6,58.6],I:[64.1,32.4],J:[49.1,16.9],K:[38.8,82.1],L:[65.2,17.2],M:[32.9,40.2]}
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
function legacyPartStock(parts){
 const result={};for(let cls=1;cls<=5;cls++)for(let slot=0;slot<4;slot++)result[cls+':'+slot]=0;
 for(let slot=0;slot<4;slot++)result['1:'+slot]=Math.max(0,Number(parts?.['1111'])||0);
 result['2:2']=Math.max(0,Number(parts?.['0020'])||0);
 result['3:0']=Math.max(0,Number(parts?.['3004'])||0);
 result['4:3']=Math.max(0,Number(parts?.['3004'])||0);
 result['3:3']=Math.max(0,Number(parts?.['0003'])||0);
 return result;
}
function stock(s){
 const matrix={...legacyPartStock(s.parts),...(s.partStock||{})},result={};
 for(const k of ['1111','0020','3004','0003'])for(const slot of [0,1,2,3])result[k+':'+slot]=0;
 for(let slot=0;slot<4;slot++)result['1111:'+slot]=Math.max(0,Number(matrix['1:'+slot])||0);
 result['0020:2']=Math.max(0,Number(matrix['2:2'])||0);
 result['3004:0']=Math.max(0,Number(matrix['3:0'])||0);
 result['3004:3']=Math.max(0,Number(matrix['4:3'])||0);
 result['0003:3']=Math.max(0,Number(matrix['3:3'])||0);
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
// 同一次同步計算期間，收船窗口欄位不會改變；以快照避免排序比較時反覆讀取 DOM。
let windowSnapshot=null;
function withWindowSnapshot(run){
 if(windowSnapshot)return run();
 windowSnapshot=windowSettings();
 try{return run()}finally{windowSnapshot=null}
}
function windowSettings(){
 if(windowSnapshot)return windowSnapshot;
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
 const base={fuel:1600,repair:300,parts:{'1111':4,'0020':4,'3004':4,'0003':0},partStock:legacyPartStock({'1111':4,'0020':4,'3004':4,'0003':0}),ships:Array.from({length:4},(_,i)=>({registered:i===0,rank:1,exp:0,name:''})),unlocks:{},logs:[],activeSectorMap:1};
 try{
  const saved=JSON.parse(FF14Data.readRaw(KEY)||'null')||{};
  const parts={...base.parts,...(saved.parts||{})};
  return {...base,...saved,parts,partStock:{...legacyPartStock(parts),...(saved.partStock||{})},ships:base.ships.map((ship,i)=>({...ship,...(saved.ships?.[i]||{})})),unlocks:saved.unlocks||{},logs:Array.isArray(saved.logs)?saved.logs:[]};
 }catch{return base}
}
function persist(mutator){const s=state();mutator(s);FF14Data.writeRaw(KEY,JSON.stringify(s));window.dispatchEvent(new Event('submarine-build-state-updated'))}
let data=null,lootData=[],pendingItemDeparture=null;
function maxRank(){return data?.ranks?.at(-1)?.rank||90}
function rankRec(rank){return data.ranks.find(x=>x.rank===rank)||data.ranks.filter(x=>x.rank<=rank).at(-1)}
function shipRank(ship){return Math.max(1,Number(ship.rank)||1)}
function shipLabel(index,ship){
 const name=typeof ship?.name==='string'?ship.name.trim():'';
 return '潛水艇 '+(index+1)+(name?' · '+name:'');
}
function buildStats(build,rank){
 const b=builds[build]?.min?builds[build]:builds['1111'],rec=rankRec(rank)||{};
 return {speed:b.speed+(rec.v||0),range:b.range+(rec.d||0)};
}
function sectorUnlockKey(id){return 'sector-'+id}
const dialogs=()=>window.SubDialog||{confirm:o=>Promise.resolve(window.confirm(o.message||o)),alert:o=>{window.alert(o.message||o);return Promise.resolve(true)},toast:()=>({close(){}})};
const fmtEta=ms=>new Date(ms).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
// Records a departure, then offers a short undo that restores the ship's previous voyage fields.
function recordDeparture(i,route,routeText,key){
 const now=Date.now(),duration=Math.round(Number(route.time)),before=state().ships?.[i]||{};
 const previous={voyaging:before.voyaging,voyage:before.voyage};
 let started=false;
 persist(st=>{
  const target=st.ships?.[i];if(!target||target.voyaging)return;
  target.voyaging=true;
  target.voyage={departedAt:now,etaAt:now+duration*1000,durationSeconds:duration,route:routeText,build:key,fuelEstimate:Number(route.fuel)||0};
  started=true;
 });
 if(!started)return;
 window.dispatchEvent(new CustomEvent('submarine-voyage-started',{detail:{index:i}}));
 dialogs().toast(shipLabel(i,before)+' 已出航，預計 '+fmtEta(now+duration*1000)+' 返航。',{tone:'success',action:{label:'復原出航',run(){
  let undone=false;
  persist(st=>{
   const target=st.ships?.[i];
   if(!target||Number(target.voyage?.departedAt)!==now)return;
   target.voyaging=previous.voyaging;
   if(previous.voyage)target.voyage=previous.voyage;else delete target.voyage;
   undone=true;
  });
  if(undone){dialogs().toast('已復原：'+shipLabel(i,before)+' 回到出航前狀態。');renderBuilds();calculate()}
  else dialogs().toast('這趟航程已在其他地方變更，未復原。',{tone:'error'});
 }}});
}
// Updates the recorded build, with an undo back to the previous one.
function recordBuildChange(i,next){
 const prev=state().ships?.[i]?.currentBuild;
 let changed=false;
 persist(st=>{const ship=st.ships?.[i];if(!ship||ship.voyaging)return;ship.currentBuild=next;changed=true});
 if(!changed)return;
 dialogs().toast(shipLabel(i,state().ships[i])+' 的配置已更新為 '+next+'。',{action:{label:'復原',run(){
  persist(st=>{const ship=st.ships?.[i];if(!ship||ship.voyaging||ship.currentBuild!==next)return;if(prev===undefined)delete ship.currentBuild;else ship.currentBuild=prev});
  renderBuilds();calculate();
 }}});
}
function stepBar(steps){
 return '<ol class="depart-steps" aria-label="出航步驟">'+steps.map((x,n)=>'<li class="'+(x.done?'is-done':x.current?'is-current':'')+'"'+(x.current?' aria-current="step"':'')+'><span>'+(x.done?'✓':n+1)+'</span>'+esc(x.label)+'</li>').join('')+'</ol>';
}
function renderBuilds(){
 const ships=state().ships||[];
 $('ship-builds').innerHTML=ships.map((ship,i)=>{
  const rank=shipRank(ship),pref=ship.build||'auto',current=installed(ship);
  return '<div class="build-row"><label>'+esc(shipLabel(i,ship))+'（Rank '+rank+'）· 推薦模式<select data-build="'+i+'">'
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
  persist(s=>{
   const ship=s.ships[Number(el.dataset.voyaging)];
   // 手動標記出航時，不沿用已過預計返航時間的上一趟航程；舊資料改存 lastVoyage，不刪除。
   if(el.checked&&!ship.voyaging&&ship.voyage&&!(Number(ship.voyage.etaAt)>Date.now())){ship.lastVoyage=ship.voyage;delete ship.voyage}
   ship.voyaging=el.checked;
  });calculate();
 });
}

function sectorName(map,letter){return window.SubmarineSectorNames?.[map]?.[letter]||''}
const pointAt=(map,letter)=>mapPositions[map]?.[letter]||[50,50];
// 海圖清單、各海圖入口與母港都從航線資料推得；日後遊戲新增海圖時，
// 只要補上航線資料（與名稱、底圖、點位），開圖與搜尋就會自動延伸。
function seaName(map){return maps[map]||('海圖'+map)}
function seaIds(){return [...new Set(data.sectors.map(p=>p.map))].sort((a,b)=>a-b)}
function seaHome(map){return mapHomes[map]??Math.min(...data.sectors.filter(p=>p.map===map).map(p=>p.id))-1}
function seaEntry(map){
 const mapOf=id=>data.sectors.find(p=>p.id===id)?.map;
 return data.sectors.find(p=>p.map===map&&p.unlockedBy&&mapOf(p.unlockedBy)!==map)
  ||data.sectors.find(p=>p.map===map&&p.letter==='A');
}
// Hover or keyboard focus on a map point shows its code and Chinese name beside the point.
function bindMapTips(host){
 const tip=host.querySelector('.map-tip');if(!tip)return;
 const show=el=>{
  tip.innerHTML='<strong>'+esc(el.dataset.tipCode)+'</strong>'+(el.dataset.tipName?'<span>'+esc(el.dataset.tipName)+'</span>':'')+'<small>'+esc(el.dataset.tipMeta)+'</small>';
  tip.style.left=el.style.left;tip.style.top=el.style.top;
  tip.classList.toggle('is-below',parseFloat(el.style.top)<22);
  tip.classList.toggle('is-left',parseFloat(el.style.left)>78);
  tip.classList.toggle('is-right',parseFloat(el.style.left)<12);
  tip.hidden=false;
 };
 const hide=()=>{tip.hidden=true};
 host.querySelector('.map-stage')?.addEventListener('mouseleave',hide);
 host.querySelectorAll('[data-tip-code]').forEach(el=>{
  el.addEventListener('mouseenter',()=>show(el));el.addEventListener('focus',()=>show(el));
  el.addEventListener('mouseleave',hide);el.addEventListener('blur',hide);
 });
}
function renderSectors(){
 const s=state(),seas=seaIds(),map=seas.includes(Number(s.activeSectorMap))?Number(s.activeSectorMap):1;
 const items=data.sectors.filter(x=>x.map===map);
 const opened=items.filter(p=>{const d=map===1&&(p.letter==='A'||p.letter==='B');return Boolean(s.unlocks?.[sectorUnlockKey(p.id)]??d)}).length;
 const tabs=seas.map(m=>'<button type="button" class="map-tab '+(m===map?'active':'')+'" data-map-tab="'+m+'" aria-pressed="'+(m===map)+'">'+seaName(m)+'</button>').join('');
 const points=items.map(p=>{
  const d=map===1&&(p.letter==='A'||p.letter==='B'),on=Boolean(s.unlocks?.[sectorUnlockKey(p.id)]??d),xy=pointAt(map,p.letter),label=seaName(map)+' '+p.letter;
  const name=sectorName(map,p.letter);
  return '<button type="button" class="map-point '+(on?'is-open':'is-closed')+'" style="left:'+xy[0]+'%;top:'+xy[1]+'%" data-sector="'+p.id+'" data-tip-code="'+esc(p.letter)+'" data-tip-name="'+esc(name)+'" data-tip-meta="'+esc('Rank '+p.rank+' · '+(on?'已開啟':'未開啟')+' · 點擊切換')+'" aria-pressed="'+on+'" aria-label="'+esc(label+(name?' '+name:'')+'，Rank '+p.rank+'，'+(on?'已開啟':'未開啟')+'；點擊切換')+'">'+esc(p.letter)+'</button>'
 }).join('');
 $('sector-unlocks').innerHTML='<div class="map-tabs" role="tablist" aria-label="海圖">'+tabs+'</div><div class="map-heading"><strong>'+maps[map]+'</strong><span>'+opened+' / '+items.length+' 個海域已開</span><small>滑鼠移到圓點上可看中文點名</small></div><div class="map-stage is-wiki" style="aspect-ratio:'+(mapAspect[map]||1)+'"><img src="'+mapImage(map)+'" alt="'+seaName(map)+'潛水艇海域地圖" loading="lazy"><div class="map-points">'+points+'</div><div class="map-tip" role="tooltip" hidden></div></div><div class="map-legend"><span><i class="legend-dot is-open"></i>已開啟</span><span><i class="legend-dot is-closed"></i>未開啟</span><small>海圖來源：<a href="https://ff14.huijiwiki.com/wiki/%E9%83%A8%E9%98%9F%E6%BD%9C%E6%B0%B4%E8%89%87" target="_blank" rel="noreferrer">灰機 wiki · 部隊潛水艇</a></small></div>';
 $('sector-unlocks').querySelectorAll('[data-map-tab]').forEach(el=>el.onclick=()=>{persist(s=>{s.activeSectorMap=Number(el.dataset.mapTab)});renderSectors()});
 bindMapTips($('sector-unlocks'));
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
function makeLabel(path){return path.map((p,i)=>i===0||p.map!==path[i-1].map?seaName(p.map)+' '+p.letter:p.letter).join(' → ')}
// Voyage timing as in SubmarineTracker: distance is the straight-line gap between sector coordinates,
// sd the sector's survey duration in minutes.
function travelSeconds(distance,speed){
 return Math.floor(distance*3990/(speed*100)*60);
}
function surveySeconds(point,speed){
 return Math.floor(point.sd*7000/(speed*100)*60);
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
// 實測 EXP 查詢表：每份 logs 只掃描一次，依正規化後的航線文字分組，並保留原始紀錄順序。
const measuredTables=new WeakMap();
function measuredTable(logs){
 let table=measuredTables.get(logs);
 if(!table){
  table=new Map();
  logs.forEach((x,index)=>{
   const key=String(x.route||'').trim().replace(/\s+/g,' ');
   if(!(Number(x.exp)>0))return;
   if(!table.has(key))table.set(key,[]);
   table.get(key).push({index,exp:Number(x.exp)});
  });
  measuredTables.set(logs,table);
 }
 return table;
}
function measuredExp(path,s){
 const route=makeLabel(path),shortRoute=path.map(p=>p.letter).join(' → ');
 const table=measuredTable(s.logs||[]),full=table.get(route)||[],short=route===shortRoute?[]:table.get(shortRoute)||[];
 if(!full.length&&!short.length)return null;
 // 兩組依原始紀錄順序合併後再加總，與逐筆過濾的加總順序相同，平均值完全一致。
 const matches=[];let i=0,j=0;
 while(i<full.length||j<short.length)matches.push(j>=short.length||(i<full.length&&full[i].index<short[j].index)?full[i++]:short[j++]);
 return matches.reduce((a,x)=>a+x.exp,0)/matches.length;
}
function bestRoutes(available,ship,buildKey,maxHours,s,requiredId=null,beamLimit=180){
 const rank=shipRank(ship);if(!validBuild(buildKey,rank))return [];
 const stats=buildStats(buildKey,rank),daily=Boolean($('daily-pickup')?.checked);
 let results=[];
 // Each sea has its own home port, so search separately.
 for(const map of seaIds()){const home=seaHome(map);
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


const fmtYield=n=>n<0.01?n.toFixed(4):n<1?n.toFixed(3):n.toFixed(2);
function bestItemRoutes(available,ship,key,maxHours,s,itemId,beamLimit=400){
 const rank=shipRank(ship);if(!validBuild(key,rank))return [];
 const stats=buildStats(key,rank),daily=Boolean($('daily-pickup')?.checked),itemRows=lootData.filter(x=>x.itemId===itemId),bySector=new Map(itemRows.map(x=>[x.sectorId,x]));
 if(!bySector.size)return [];
 const results=[];
 for(const map of seaIds()){const home=seaHome(map);
  const eligible=available.filter(p=>p.map===map&&p.rank<=rank&&bySector.has(p.id));
  if(!eligible.length)continue;
  let beam=[{path:[],prev:home,range:0,time:43200,fuel:0,used:new Set(),yield:0,miss:1}];
  for(let depth=0;depth<5;depth++){
   const next=[];
   for(const cur of beam)for(const p of eligible){
    if(cur.used.has(p.id))continue;
    const edge=p.to[String(cur.prev)];if(!edge)continue;
    const nr=cur.range+edge[0]+p.sr;if(nr>stats.range)continue;
    const nt=cur.time+travelSeconds(edge[1],stats.speed)+surveySeconds(p,stats.speed);
    if(nt>maxHours*3600)continue;
    const row=bySector.get(p.id);
    // 掉落資料提供高觀測力的機率與數量。採用 normal 檔的平均堆疊數估算。
    const chance=Math.max(0,Math.min(1,row.chance));
    const qty=Math.max(0,row.q[1]||0);
    next.push({path:cur.path.concat(p),prev:p.id,range:nr,time:nt,fuel:cur.fuel+p.fuel,
      used:new Set([...cur.used,p.id]),yield:cur.yield+chance*qty,miss:cur.miss*(1-chance)});
   }
   const score=r=>r.yield/pickupElapsed(r.time,daily);
   next.sort((a,b)=>score(b)-score(a)||b.yield-a.yield);
   beam=next.slice(0,beamLimit);
   results.push(...beam.filter(r=>r.yield>0));
   if(!beam.length)break;
  }
 }
 const unique=new Map();
 for(const r of results){
  const label=makeLabel(r.path),score=r.yield/pickupElapsed(r.time,daily);
  if(!unique.has(label)||unique.get(label).score<score)
   unique.set(label,{...r,score,build:key,hit:1-r.miss});
 }
 return [...unique.values()].sort((a,b)=>b.score-a.score).slice(0,5);
}
function renderItemPlanner(){
 const select=$('target-item'),search=$('target-item-search');if(!select)return;
 const names=new Map();
 const aliases={30093:['銀山雀']};
 for(const row of lootData)if(!names.has(row.itemId))names.set(row.itemId,{local:row.itemId===30093?'銀山雀':(row.localName||row.name),en:row.name,aliases:aliases[row.itemId]||[]});
 const all=[...names].map(([id,n])=>({id:String(id),...n})).sort((a,b)=>a.local.localeCompare(b.local));
 function fillOptions(query=''){
  const q=String(query||'').trim().toLocaleLowerCase();
  const current=select.value;
  const filtered=q?all.filter(x=>x.local.toLocaleLowerCase().includes(q)||x.en.toLocaleLowerCase().includes(q)||x.aliases.some(a=>a.toLocaleLowerCase().includes(q))):all;
  select.innerHTML='<option value="">選擇想撈取的物品…</option>'+filtered.map(x=>'<option value="'+x.id+'">'+esc(x.local)+'</option>').join('');
  if(current&&filtered.some(x=>x.id===current))select.value=current;
 }
 fillOptions();
 if(search)search.oninput=()=>fillOptions(search.value);
 $('calc-item-routes').onclick=calculateItemRoutes;
}
function calculateItemRoutes(){return withWindowSnapshot(calculateItemRoutesNow)}
function calculateItemRoutesNow(){
 const itemId=Number($('target-item')?.value),hours=Number($('target-item-hours')?.value)||24;
 const s=state(),open=unlockedSectors(s,145),ships=(s.ships||[]).map((ship,i)=>({...ship,index:i})).filter(x=>x.registered);
 if(!itemId){$('item-route-result').innerHTML='<p class="calc-warning">請先選擇想撈取的物品。</p>';return}
 if(!ships.length){$('item-route-result').innerHTML='<p class="calc-warning">目前沒有已登記的潛水艇。</p>';return}
 const total=stock(s),voyaging=ships.filter(ship=>ship.voyaging),ready=ships.filter(ship=>!ship.voyaging);
 let fixedUsage={};
 for(const ship of voyaging){
  const used=allocate(installed(ship),fixedUsage,total);
  if(!used){$('item-route-result').innerHTML='<p class="calc-warning">航行中的配件已超出目前登記庫存。請核對持有總數（含已裝配部件）。</p>';return}
  fixedUsage=used;
 }
 const candidates=[];
 for(const ship of ready){
  const keys=ship.build&&ship.build!=='auto'?[ship.build]:['1111','1121','1123','3123','3124'];
  for(const key of keys){
   if(!validBuild(key,shipRank(ship))||!allocate(key,fixedUsage,total))continue;
   const route=bestItemRoutes(open,ship,key,hours,s,itemId,400)[0];
   if(route)candidates.push({ship,key,route});
  }
 }
 candidates.sort((a,b)=>b.route.score-a.route.score);
 const best=candidates.slice(0,5);
 if(!best.length){$('item-route-result').innerHTML='<p class="calc-warning">'+(ready.length?'目前海域、Rank、可用部件庫存與 '+hours+' 小時限制內，找不到包含此物品的可行航線。':'所有已登記潛水艇目前都在航行中。')+'</p>';return}
 $('item-route-result').innerHTML=best.map(({ship,key,route},i)=>
  '<article class="route-card item-route-card"'+(i===0?' style="border:2px solid #e3aa35;box-shadow:0 0 0 3px rgba(227,170,53,.16)"':'')+'><h3>#'+(i+1)+' · '+(i===0?'<span style="display:inline-block;background:#e3aa35;color:#fff;padding:2px 8px;border-radius:999px;margin-right:6px">最佳</span>':'')+esc(shipLabel(ship.index,ship))+' · '+esc(makeLabel(route.path))+'</h3>'
  +'<div class="route-meta">配置 '+esc(key)+' · Rank '+shipRank(ship)+' · '+fmtTime(route.time)+' · '+route.fuel+' 罐燃料 · 航程 '+route.range+'</div>'
  +'<div class="route-kpis"><span>預期約 '+fmtYield(route.yield)+' 個／趟（normal 組樣本）</span><span>至少取得一次：約 '+(route.hit*100).toFixed(1)+'%</span><span>預期量／出航週期：'+fmtYield(route.score*3600)+' 個／小時</span></div>'
  +'<div class="voyage-depart-actions"><span class="route-meta">選取後加入下方出航確認</span><button type="button" data-item-route="'+i+'">套用到出航確認</button></div></article>'
 ).join('')+'<p class="hint">列出最高收益的五個庫存可行候選；航行中配件先保留。候選為替代方案，實際裝備需在遊戲內完成。</p>';
 $('item-route-result').querySelectorAll('[data-item-route]').forEach(btn=>btn.onclick=()=>{
  const choice=best[Number(btn.dataset.itemRoute)];
  if(!choice)return;
  pendingItemDeparture={shipIndex:choice.ship.index,key:choice.key,route:choice.route,
   itemLabel:$('target-item')?.selectedOptions?.[0]?.textContent?.trim()||'指定物品'};
  calculate();
  $('calc-result').scrollIntoView({behavior:'smooth',block:'start'});
 });
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
 const target=seaIds().filter(m=>m>1).map(seaEntry).find(p=>p&&!openIds.has(p.id));
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
 const requested=plans.filter(p=>!p.ship.voyaging&&(p.rank<targetRank||p.explorer));
 // 仍然替其他可派船計算；單艘沒有可行航線不應拖垮整個船隊。
 const missing=requested.filter(p=>!p.choices.length).map(p=>shipLabel(p.ship.index,p.ship));
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
 if(!best)return {chosen:new Map(),missing:ready.map(p=>shipLabel(p.ship.index,p.ship)),reason:'實際零件庫存不足，無法讓所有返航船同時配裝出航'};
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
function calculate(){return withWindowSnapshot(calculateNow)}
function calculateNow(){
 if(!data)return;
 const s=state(),ships=s.ships||[],open=unlockedSectors(s,145),
  hours=Number($('calc-hours').value)||48,target=Math.max(2,Math.min(maxRank(),Number($('calc-target-rank').value)||85)),
  daily=Boolean($('daily-pickup')?.checked),total=stock(s),available0003=Math.max(0,Number(total['0003:3'])||0),
  explorersWanted=Math.max(0,Math.min(4,Number($('calc-explorers')?.value)||0));
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
 function gateOptions(ship){
  const rank=shipRank(ship);
  return options(ship).filter(key=>validBuild(key,rank))
   .map(key=>({key,normal:getRoutes(ship,key,null),
    gate:progress?.parent&&progress.step?getRoutes(ship,key,progress.parent.id):[]}));
 }
 // 依設定從已畢業（原本跑 OJ）的船撥出幾艘開後續海域：Rank 越高能探索的前置點越遠，優先撥出。
 const graduated=registered.filter(x=>!x.voyaging&&shipRank(x)>=target);
 const explorers=new Set(explorersWanted&&progress?.parent?graduated
  .filter(x=>gateOptions(x).some(o=>o.gate.length))
  .sort((a,b)=>shipRank(b)-shipRank(a)||a.index-b.index).slice(0,explorersWanted).map(x=>x.index):[]);
 let fixedUsage={},reserved0003=0,stockConflict='';
 for(const ship of registered.filter(x=>(x.voyaging||shipRank(x)>=target)&&!explorers.has(x.index))){
  const current=installed(ship);
  const next=allocate(current,fixedUsage,total);
  if(!next){stockConflict='航行中或已畢業但尚未拆下的配件超過庫存，請檢查各船「實際配置」與零件數量。';break}
  fixedUsage=next;
  if(['1123','3123'].includes(current))reserved0003++;
 }
 if(stockConflict){
  $('calc-result').innerHTML='<p class="calc-warning">'+esc(stockConflict)+'</p>';return;
 }
 const ready=registered.filter(x=>!x.voyaging&&(shipRank(x)<target||explorers.has(x.index)));
 const plans=ready.map(ship=>{
  const rank=shipRank(ship),routeOptions=gateOptions(ship);
  return {ship,rank,routeOptions,canOpen:routeOptions.some(o=>o.gate.length>0),explorer:explorers.has(ship.index),choices:[]};
 });
 // 延續開圖原則：開圖船合計最多兩艘（撥出的畢業船優先），其餘由練等中最高 Rank 的合格船補上；
 // 但由整隊配置評分決定是否使用 0003。
 const openers=progress?.step&&progress.parent?plans.filter(p=>p.canOpen&&!p.explorer)
  .sort((a,b)=>b.rank-a.rank||a.ship.index-b.ship.index).slice(0,Math.max(0,2-explorers.size)).map(p=>p.ship.index):[];
 for(const p of plans){
  const designated=p.explorer||openers.includes(p.ship.index);
  for(const b of p.routeOptions){
   if(designated&&b.gate.length){
    for(const route of b.gate.slice(0,2))p.choices.push({key:b.key,route,alternates:b.normal,opening:true});
   }else if(b.normal.length&&!p.explorer){
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
   html.push('<article class="route-card"><h3>'+esc(shipLabel(ship.index,ship))+'（Rank '+rank+'）</h3>'
    +'<div class="route-meta">航行中，'+esc(current)+' 配件已占用'
    +(builds[current]&&['1123','3123'].includes(current)?'（包含 0003 ×1）':'')
    +'。無法在返航前轉移配件；下次收船後取消「航行中」再計算。</div></article>');
   continue;
  }
  if(rank>=target&&!explorers.has(ship.index)){
   const holding=['1123','3123'].includes(current);
   html.push('<article class="route-card"><h3>'+esc(shipLabel(ship.index,ship))+'：已達 Rank '+target+'</h3>'
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
   html.push('<article class="route-card"><h3>'+esc(shipLabel(ship.index,ship))+'（Rank '+rank+'）</h3>'
    +'<p class="calc-warning">找不到符合庫存的完整船隊配置。'+esc(allocation.reason||'請檢查配件與可跑航點')+'</p></article>');
   continue;
  }
  const {key,route,opening,alternates}=choice,stats=buildStats(key,rank),remaining=remainingToTarget(ship,target);
  const turns=pickupElapsed(route.time,daily)/DAY;
  const runs=remaining?Math.ceil(remaining/Math.max(1,route.actualXp)):0;
  const previous=getRoutes(ship,current,opening&&progress?.parent?progress.parent.id:null)[0]||null;
  const deltaRate=previous?Math.round(((route.actualXp/turns)/
       (previous.actualXp/(pickupElapsed(previous.time,daily)/DAY))-1)*100):null;
  const explorer=explorers.has(ship.index);
  const reason=explorer
   ?'依設定從畢業船撥出開後續海域，練等船不受影響。'
   :opening
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
  html.push('<article class="route-card"><h3>'+esc(shipLabel(ship.index,ship))+'：'+(explorer?'畢業船開圖：':opening?'開圖兼練等：':'升等優先：')+esc(makeLabel(route.path))+'</h3>'
   +'<div class="route-meta">Rank '+rank+' · 建議配置 <strong>'+esc(key)+'</strong> · 速度 '+stats.speed+' / 航程 '+stats.range+'</div>'
   +swapText
   +'<div class="route-kpis"><span>'+route.actualXp.toLocaleString()+' EXP/趟'+(route.usedExp?'（實測）':'（基礎值）')+'</span>'
   +'<span>'+fmtTime(route.time)+'</span><span>'+route.fuel+' 罐燃料</span><span>航程 '+route.range+'</span>'
   +(daily?'<span>最早可收／再派：'+esc(pickupLabel(route.time))+'</span><span>本趟收船週期 '+esc(fmtTime(pickupElapsed(route.time,true)))+'</span>':'')
   +(deltaRate!==null?'<span>相較目前配置 '+(deltaRate>=0?'+':'')+deltaRate+'% EXP／收船週期</span>':'')+'</div>'
   +(explorer
    ?'<div class="route-meta">已達 Rank '+target+'，本趟暫停 O → J 改去開圖；開完或不想開時，把「畢業船撥去開圖」調低即可回到 3124 跑 O → J。</div>'
    :'<div class="route-meta">至 Rank '+target+' 尚需 '+remaining.toLocaleString()+' EXP；若一直跑這條約 '+runs+' 趟（升級與開圖後會改變）。</div>')
   +(opening?'<div class="route-meta">本輪探索 '+esc(seaName(progress.step.map)+' '+progress.step.letter)+' 的前置點；成功開圖後請點地圖更新。</div>':'')
   +stepBar([{label:switching?'遊戲內換裝 '+current+' → '+key+'，再按「更新紀錄」':'配置符合（'+key+'）',done:!switching,current:switching},{label:'遊戲內派往這條航線',current:!switching},{label:'按「確認出航」開始計時'}])
   +'<div class="voyage-depart-actions"><span class="route-meta">預計實際航行 '+esc(fmtTime(route.time))+'；完成遊戲內出航後再按下按鈕。</span>'
   +'<button class="voyage-depart-button" type="button" data-depart-ship="'+ship.index+'">⚓ 確認出航</button></div>'
   +'</article>');
 }
 const premiumAssigned=[...selected.values()].filter(c=>['1123','3123'].includes(c.key)).length;
 const free0003=Math.max(0,available0003-reserved0003-premiumAssigned);
 const header='<div class="route-meta"><strong>0003 智慧分配：</strong>持有 '+available0003+' 套；航行中／已畢業未拆配件占用 '+reserved0003
  +' 套；本輪派船分配 '+premiumAssigned+' 套；暫時未使用 '+free0003+' 套。'
  +' 本次比較最多四艘的可行組合，考慮剩餘 EXP、畢業瓶頸及必要開圖。</div>';
 const progressNote=progress?.step
  ?'<p class="hint">下一張海圖目標：'+esc(seaName(progress.target.map)+' '+progress.target.letter)
   +'；優先探索 '+esc(progress.parent?seaName(progress.parent.map)+' '+progress.parent.letter:'尚未開出的前置點')
   +'。'+(explorers.size?'撥出 '+explorers.size+' 艘畢業船開圖'+(explorers.size<2?'，練等船最多再補 1 艘':'')+'，其他船照常練等／跑 O → J。':'最多兩艘合格船負責開圖，其他船優先練等。')
   +(explorersWanted>explorers.size?'（設定撥出 '+explorersWanted+' 艘，但目前只有 '+explorers.size+' 艘返航中的畢業船能跑到開圖前置點。）':'')+'</p>'
  :'<p class="hint">'+(seaIds().every(m=>m===1||open.some(p=>p.id===seaEntry(m)?.id))?'目前資料內的海圖都已開啟；之後新增海圖時，撥出的畢業船會自動改去開新海域。':'下一張海圖前置已完成，返航的船會以練等／OJ 營運為目標分配。')+'</p>';
 const warning=allocation.reason?'<p class="calc-warning">'+esc(allocation.reason)+'</p>':'';
 $('calc-result').innerHTML=header+progressNote+warning+html.join('')
  +'<p class="hint">本輪建議消耗約 '+fuel+' 罐燃料（庫存 '+(Number(s.fuel)||0)+'）。'
  +(daily?'每天可收／派船窗口 '+fmtClock(windowSettings().start*60)+'～'+fmtClock(windowSettings().end*60)+'；考慮實際預計出航時間與下一次可收船時間。':'以 EXP／實際時間比較。')
  +' 智慧分配屬逐趟前瞻估算，不是保證全球最短畢業日；實際開圖 RNG、EXP 獎勵及未來航點變化仍會改變最佳選擇。</p>'
  +(registered.some(x=>shipRank(x)>maxRank())?'<p class="hint calc-warning">航線資料目前收錄到 Rank '+maxRank()+'；更高 Rank 使用現有海域預估。</p>':'');
 if(pendingItemDeparture){
  const pending=pendingItemDeparture,ship=ships[pending.shipIndex];
  if(!ship||!ship.registered||ship.voyaging){
   $('calc-result').insertAdjacentHTML('beforeend','<article class="route-card"><h3>指定物品航線</h3><p class="calc-warning">選取的潛水艇目前無法出航，請重新選擇候選。</p><button type="button" data-clear-item-route>清除選取</button></article>');
  }else{
   const currentBuild=installed(ship),routeText=makeLabel(pending.route.path);
   const switchControl=currentBuild===pending.key
    ?'<p class="route-meta">目前紀錄配置已符合，可直接確認出航。</p>'
    :'<div class="switch-advice"><strong>請先在遊戲內換裝：'+esc(currentBuild)+' → '+esc(pending.key)+'</strong><span>'+esc(changes(currentBuild,pending.key))+'</span><button type="button" data-sync-item-build>已在遊戲換裝，更新紀錄</button></div>';
   $('calc-result').insertAdjacentHTML('beforeend','<article class="route-card item-route-confirm" style="border:2px solid #36a6a0"><h3>指定物品航線已套用至出航確認</h3><div class="route-meta">'+esc(shipLabel(pending.shipIndex,ship))+' · '+esc(pending.itemLabel)+' · '+esc(routeText)+'</div><div class="route-meta">配置 '+esc(pending.key)+' · '+fmtTime(pending.route.time)+' · '+pending.route.fuel+' 罐燃料</div>'+switchControl+stepBar([{label:currentBuild===pending.key?'配置符合（'+pending.key+'）':'遊戲內換裝 '+currentBuild+' → '+pending.key+'，再按「更新紀錄」',done:currentBuild===pending.key,current:currentBuild!==pending.key},{label:'遊戲內派往這條航線',current:currentBuild===pending.key},{label:'按「確認出航」開始計時'}])+'<div class="voyage-depart-actions"><span class="route-meta">確認前請確定遊戲內已派往此航線。</span><button type="button" class="voyage-depart-button" data-depart-item-route>⚓ 確認出航</button><button type="button" data-clear-item-route>取消此選擇</button></div></article>');
   $('calc-result').querySelector('[data-sync-item-build]')?.addEventListener('click',async()=>{
    const ok=await dialogs().confirm({title:'更新配置紀錄',message:'請確認已在 FF14 遊戲內將「'+shipLabel(pending.shipIndex,ship)+'」換成 '+pending.key+'。確認後只更新本工具的配置紀錄。',ok:'已換裝，更新紀錄'});
    if(!ok)return;
    recordBuildChange(pending.shipIndex,pending.key);
    renderBuilds();calculate();
   });
   $('calc-result').querySelector('[data-depart-item-route]')?.addEventListener('click',async()=>{
    const current=state(),latest=current.ships?.[pending.shipIndex];
    if(!latest||!latest.registered||latest.voyaging){await dialogs().alert('潛艇狀態已變更，請重新計算。');calculate();return}
    if(installed(latest)!==pending.key){dialogs().alert('請先在遊戲內換裝並更新配置紀錄。');return}
    const duration=Math.round(Number(pending.route.time));
    if(!Number.isFinite(duration)||duration<=0){dialogs().alert('航程時間無效，請重新計算。');return}
    const ok=await dialogs().confirm({title:'確認出航',message:'已在 FF14 中將「'+shipLabel(pending.shipIndex,latest)+'」實際派往「'+routeText+'」嗎？\n確認後開始計時；燃料與物資會在返航結算時扣除。',
     details:[['航線',routeText],['配置',pending.key],['航行時間',fmtTime(pending.route.time)],['預計返航',fmtEta(Date.now()+duration*1000)],['燃料',pending.route.fuel+' 罐']],ok:'⚓ 確認出航'});
    if(!ok)return;
    const route=pending.route,key=pending.key,index=pending.shipIndex;
    pendingItemDeparture=null;recordDeparture(index,route,routeText,key);renderBuilds();calculate();
   });
  }
  $('calc-result').querySelectorAll('[data-clear-item-route]').forEach(btn=>btn.onclick=()=>{pendingItemDeparture=null;calculate()});
 }
 $('calc-result').querySelectorAll('[data-depart-ship]').forEach(btn=>btn.onclick=()=>{
  const i=Number(btn.dataset.departShip),choice=selected.get(i),current=state(),ship=current.ships?.[i];
  if(!ship||!ship.registered||ship.voyaging||!choice){dialogs().alert('船隻狀態已變更，請重新計算航線。').then(calculate);return;}
  if(installed(ship)!==choice.key){dialogs().alert('請先在遊戲中完成換裝，並點選「已在遊戲換裝，更新紀錄」。');return;}
  const duration=Math.round(Number(choice.route.time));
  if(!Number.isFinite(duration)||duration<=0){dialogs().alert('航程時間無效，請重新計算。');return;}
  const routeText=makeLabel(choice.route.path),label=shipLabel(i,ship);
  dialogs().confirm({title:'確認出航',message:'已在 FF14 中將「'+label+'」實際派往「'+routeText+'」嗎？\n確認後開始計時；燃料與物資會在返航結算時扣除。',
   details:[['航線',routeText],['配置',choice.key],['航行時間',fmtTime(choice.route.time)],['預計返航',fmtEta(Date.now()+duration*1000)],['燃料',choice.route.fuel+' 罐']],ok:'⚓ 確認出航'}).then(ok=>{
   if(!ok)return;
   recordDeparture(i,choice.route,routeText,choice.key);
   renderBuilds();calculate();
  });
 });
 $('calc-result').querySelectorAll('[data-apply-build]').forEach(btn=>btn.onclick=()=>{
  const i=Number(btn.dataset.applyBuild),next=btn.dataset.newBuild;
  if(!builds[next]||state().ships[i].voyaging)return;
  recordBuildChange(i,next);renderBuilds();calculate();
 });
}
const defaultPlannerSettings={
 maxHours:72,targetRank:85,dailyPickup:true,pickupStart:'19:00',
 pickupEnd:'22:00',departureTime:'19:00',manualDeparture:false,explorers:0
};
function validClock(value,fallback){
 return typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value)?value:fallback;
}
function plannerControls(settings){
 const s={...defaultPlannerSettings,...(settings||{})};
 // 舊版 48h 是預設限制；首次開放長航線後升到 72h。使用者日後可自行改回 48h。
 if(settings&&Number(settings.maxHours)===48&&settings.expandedLongRoutes!==true)s.maxHours=72;
 $('calc-hours').value=[24,36,48,50,52,72].includes(Number(s.maxHours))?String(s.maxHours):'72';
 $('calc-target-rank').value=Number.isInteger(Number(s.targetRank))&&Number(s.targetRank)>=2&&Number(s.targetRank)<=maxRank()?String(s.targetRank):'85';
 $('calc-explorers').value=[0,1,2,3,4].includes(Number(s.explorers))?String(Number(s.explorers)):'0';
 $('daily-pickup').checked=s.dailyPickup!==false;
 $('pickup-start').value=validClock(s.pickupStart,'19:00');
 $('pickup-end').value=validClock(s.pickupEnd,'22:00');
 $('calc-departure-time').value=validClock(s.departureTime,'19:00');
 return s.manualDeparture===true;
}
function savePlannerSettings(manualDeparture){
 const snapshot={
  maxHours:Number($('calc-hours').value),targetRank:Number($('calc-target-rank').value),explorers:Number($('calc-explorers').value)||0,
  dailyPickup:!!$('daily-pickup').checked,pickupStart:$('pickup-start').value,
  pickupEnd:$('pickup-end').value,departureTime:$('calc-departure-time').value,
  manualDeparture:!!manualDeparture,expandedLongRoutes:true
 };
 persist(s=>{s.plannerSettings={...(s.plannerSettings||{}),...snapshot}});
}
async function init(){
 try{
  const [res,lootRes]=await Promise.all([fetch('submarine-route-data.json?v=20261022-seas2'),fetch('submarine-loot-data.json?v=20261022-seas')]);if(!res.ok)throw new Error('route data '+res.status);if(!lootRes.ok)throw new Error('loot data '+lootRes.status);
  data=await res.json();lootData=await lootRes.json();
  renderBuilds();renderSectors();renderItemPlanner();
  let manuallySelectedDeparture=plannerControls(state().plannerSettings);
  // 記錄已啟用長航線，避免之後手動切回 48h 又被升級。
  if(state().plannerSettings?.expandedLongRoutes!==true)savePlannerSettings(manuallySelectedDeparture);
  function refreshDepartureClock(){
   if(manuallySelectedDeparture)return;
   const now=new Date(),minute=now.getHours()*60+now.getMinutes(),w=windowSettings();
   $('calc-departure-time').value=minute>=w.start&&minute<=w.end
    ?String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0')
    :fmtClock(w.start*60);
  }
  function updatePlanner(){savePlannerSettings(manuallySelectedDeparture);calculate()}
  $('calc-routes').onclick=()=>{refreshDepartureClock();updatePlanner()};
  ['calc-hours','calc-target-rank','calc-explorers','daily-pickup','pickup-start','pickup-end'].forEach(id=>{
   const ctrl=$(id);if(ctrl)ctrl.onchange=updatePlanner;
  });
  $('calc-departure-time').onchange=()=>{manuallySelectedDeparture=true;updatePlanner()};
  // 匯出前把目前表單值一併寫回 JSON；匯入完整備份後再套用時間與偏好。
  window.addEventListener('submarine-export-requested',()=>savePlannerSettings(manuallySelectedDeparture));
  window.addEventListener('submarine-data-imported',()=>{
   manuallySelectedDeparture=plannerControls(state().plannerSettings);
   renderBuilds();renderSectors();renderItemPlanner();calculate();
  });
  refreshDepartureClock();
  // 其他分頁寫入時，保留本頁正在輸入、尚未觸發 change 的計算器設定。
  const plannerIds=['calc-hours','calc-target-rank','calc-explorers','daily-pickup','pickup-start','pickup-end','calc-departure-time'];
  const plannerDrafts=new Set();
  for(const id of plannerIds){
   $(id)?.addEventListener('input',()=>plannerDrafts.add(id));
   $(id)?.addEventListener('change',()=>plannerDrafts.delete(id),true);
  }
  window.addEventListener('storage',e=>{
   if(e.key!==KEY&&e.key!==null)return;
   const drafts=[...plannerDrafts].map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]);
   manuallySelectedDeparture=plannerControls(state().plannerSettings);
   refreshDepartureClock();
   for(const [id,value] of drafts){if($(id).type==='checkbox')$(id).checked=value;else $(id).value=value}
   renderBuilds();renderSectors();calculate();
  });
  window.addEventListener('submarine-state-updated',()=>{renderBuilds();renderSectors();calculate()});
  calculate();
 }catch(e){$('calc-result').textContent='海域資料載入失敗：'+e.message}
}
init();
})();