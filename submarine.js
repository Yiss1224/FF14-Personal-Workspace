(function(){
'use strict';
const KEY='ff14_submarine_planner_v1';
const legacyPartStock=parts=>{
 const stock={};for(let cls=1;cls<=5;cls++)for(let slot=0;slot<4;slot++)stock[cls+':'+slot]=0;
 const add=(cls,slot,n)=>{stock[cls+':'+slot]=Math.max(0,Number(n)||0)};
 for(let slot=0;slot<4;slot++)add(1,slot,parts?.['1111']);
 add(2,2,parts?.['0020']);
 add(3,0,parts?.['3004']);add(4,3,parts?.['3004']);
 add(3,3,parts?.['0003']);
 return stock;
};
const partClasses={1:'鯊級',2:'雲鯨級',3:'鯨級',4:'腔棘魚級',5:'希爾德里昂級'};
const partSlots=['船體','船尾','船首','艦橋'];
const partRecipes={
 '1111':['1:0','1:1','1:2','1:3'],
 '1121':['1:0','1:1','2:2','1:3'],
 '1123':['1:0','1:1','2:2','3:3'],
 '3123':['3:0','1:1','2:2','3:3'],
 '3124':['3:0','1:1','2:2','4:3']
};
const fresh=()=>{
 const parts={'1111':4,'0020':4,'3004':4,'0003':0};
 return {fuel:1600,repair:300,parts,partStock:legacyPartStock(parts),
  ships:Array.from({length:4},(_,i)=>({registered:i===0,rank:1,exp:0,name:''})),
  unlocks:{},logs:[],activeSectorMap:1};
};
function normalize(saved){
 const s=Object.assign(fresh(),saved||{});
 s.parts=Object.assign(fresh().parts,saved?.parts||{});
 s.partStock=Object.assign(legacyPartStock(s.parts),saved?.partStock||{});
 s.ships=fresh().ships.map((x,i)=>Object.assign(x,saved?.ships?.[i]||{}));
 s.unlocks=saved?.unlocks||{};
 s.logs=Array.isArray(saved?.logs)?saved.logs:[];
 return s;
}
let state;
try{state=normalize(JSON.parse(localStorage.getItem(KEY)||'null'))}catch(e){state=fresh()}
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// 以 localStorage 的最新內容取代記憶體副本；資料損毀時保留目前的記憶體狀態。
function reload(){
 try{state=normalize(JSON.parse(localStorage.getItem(KEY)||'null'));return true}
 catch(e){console.error('潛艇資料讀取失敗，保留目前畫面資料',e);return false}
}
// 每次寫入都先重新讀取最新儲存資料，只套用本次修改的欄位。
// 避免本模組較舊的記憶體副本覆寫計算器（voyage、配置）、返航結算或其他分頁寫入的資料。
const update=mutator=>{
 reload();
 mutator(state);
 localStorage.setItem(KEY,JSON.stringify(state));render();window.dispatchEvent(new Event('submarine-state-updated'));
};
// 外部更新（其他分頁、計算器、返航結算）重畫畫面時，保留使用者尚未送出的輸入、船名草稿與焦點。
// 只保留使用者實際輸入過、尚未觸發 change 的欄位；未修改的欄位照常顯示最新資料。
function editableKey(el){
 if(!el||!el.matches?.('input,select,textarea'))return null;
 if(el.id==='fuel-stock'||el.id==='repair-stock')return '#'+el.id;
 for(const attr of ['data-part-stock','data-rank','data-exp','data-registered','data-ship-name-input'])
  if(el.hasAttribute(attr))return '['+attr+'="'+el.getAttribute(attr)+'"]';
 return null;
}
const dirtyFields=new Set();
document.addEventListener('input',e=>{const key=editableKey(e.target);if(key)dirtyFields.add(key)},true);
document.addEventListener('change',e=>{const key=editableKey(e.target);if(key)dirtyFields.delete(key)},true);
function preservingEdits(paint){
 const active=document.activeElement,focusKey=editableKey(active);
 let selection=null;
 try{if(focusKey&&active.selectionStart!==null)selection=[active.selectionStart,active.selectionEnd]}catch(e){}
 const drafts=[...dirtyFields].map(key=>[key,document.querySelector(key)?.value]).filter(([,value])=>value!==undefined);
 const editors=[...document.querySelectorAll('[data-ship-name-editor]')].filter(x=>!x.hidden)
  .map(x=>[x.dataset.shipNameEditor,x.querySelector('[data-ship-name-input]')?.value??'']);
 paint();
 for(const [key,value] of drafts){const el=document.querySelector(key);if(el)el.value=value}
 for(const [i,value] of editors){
  const editor=document.querySelector('[data-ship-name-editor="'+i+'"]'),input=editor?.querySelector('[data-ship-name-input]');
  if(!editor||!input)continue;
  editor.hidden=false;input.value=value;
  document.querySelector('[data-edit-ship-name="'+i+'"]')?.setAttribute('aria-expanded','true');
 }
 const el=focusKey&&document.querySelector(focusKey);
 if(el&&document.activeElement!==el){
  el.focus({preventScroll:true});
  try{if(selection)el.setSelectionRange(selection[0],selection[1])}catch(e){}
 }
}
window.addEventListener('submarine-build-state-updated',()=>{if(reload())preservingEdits(renderFleet)});
window.addEventListener('submarine-settlement-saved',()=>{if(reload())preservingEdits(render)});
// 其他分頁寫入時同步本頁，之後的修改才會以新資料為基礎。
window.addEventListener('storage',e=>{if((e.key===KEY||e.key===null)&&reload())preservingEdits(render)});
const rankRoutes=[
 [1,4,'溺沒海','A → B','起步，先開 B→E 的前置鏈'],
 [5,9,'溺沒海','A → C → D','可用時用較高 EXP 點'],
 [10,14,'溺沒海','G → E → C','若未開齊，改跑已開的 E/C/A/B'],
 [15,19,'溺沒海','G → H','Rank 15 換船首，1111→1121'],
 [20,24,'溺沒海','I → K → J','J 也是第 2 艘登記解鎖點'],
 [25,29,'溺沒海','G → I → K → L','距離與海域開啟狀態需符合'],
 [30,34,'溺沒海','I → P → O → N','O 是第 3 艘登記解鎖點'],
 [35,39,'溺沒海','I → M → Q → P','Rank 35 可裝腔棘魚部件'],
 [40,44,'溺沒海','I → U → S → T','T 是第 4 艘登記解鎖點'],
 [45,49,'溺沒海','U → W → V','接近 Rank 50 時優先準備灰海開圖'],
 [50,54,'灰海','A → B','Rank 50 後經驗效率大幅上升'],
 [55,59,'灰海','B → A → C → D','同時沿解鎖鏈往 R 推進'],
 [60,69,'灰海','A → C → G → F → K','依已開海域、航距調整'],
 [70,79,'灰海','A → C → F → K → T','開翠浪海後仍可用灰海效率路線'],
 [80,84,'翠浪海','A → C → G → K','若海域未開，先留在灰海'],
 [85,145,'溺沒海','O → J','3124（3004 加 1121）可開始穩定金策；非最快練等路線']
];
const unlockGroups=[
 {name:'溺沒海 → 灰海（Rank 50）',steps:[['B',1],['E',7],['J',20],['N',27],['O',30],['S',37],['T',40],['Y',47],['Z',50],['AA',50],['AB',50],['AD',50]]},
 {name:'灰海 → 翠浪海（Rank 67）',steps:[['A',50],['B',50],['C',54],['F',57],['G',60],['H',60],['K',60],['L',63],['P',65],['R',67]]},
 {name:'翠浪海 → 塞壬海（Rank 90）',steps:[['A',70],['C',70],['E',72],['G',74],['J',75],['M',80],['R',88],['T',90]]},
 {name:'塞壬海 → 紫礁海（Rank 105）',steps:[['A',90],['B',90],['F',93],['J',97],['L',99],['P',102],['T',105]]},
 {name:'紫礁海 → 南蒼茫洋（Rank 120）',steps:[['A',105],['B',105],['F',108],['J',113],['L',115],['Q',119],['T',120]]},
 {name:'南蒼茫洋 → 北洋（Rank 135）',steps:[['A',120],['B',120],['F',123],['I',127],['M',130],['N',131],['R',134],['T',135]]}
];
function phase(rank){return rank<15?'1111':'1121'}
function shipLabel(index,ship){
 const name=typeof ship?.name==='string'?ship.name.trim():'';
 return '潛水艇 '+(index+1)+(name?' · '+name:'');
}
function renderEstimate(){
 const fuel=Number(state.fuel)||0,repair=Number(state.repair)||0;
 $('estimate').innerHTML=[
  ['初始目標','Rank 85','依每艘目前 Rank、EXP、開放海域與船速即時計算。'],
  ['目前庫存',fuel.toLocaleString()+' 罐燃料 / '+repair.toLocaleString()+' 個修理材料','燃料與修理材料仍可在本頁直接修改。'],
  ['部件庫存','共 '+Object.values(state.partStock||{}).reduce((a,b)=>a+(Number(b)||0),0)+' 件','依型號與槽位逐件登記；全艦隊配置會讀取此庫存。'],
  ['估算範圍','路線資料到 Rank 80','不含 Rank 81 以上的新海域；EXP 預估不計隨機追加探索。']
 ].map(x=>'<div class="stat"><small>'+esc(x[0])+'</small><strong>'+esc(x[1])+'</strong><small>'+esc(x[2])+'</small></div>').join('');
}
function renderPartInventory(){
 const stock=state.partStock||legacyPartStock(state.parts),host=$('part-inventory');
 host.innerHTML='<div class="table-wrap part-inventory-wrap"><table class="part-inventory-table"><thead><tr><th>部件型號</th>'+partSlots.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'
  +Array.from({length:5},(_,i)=>i+1).map(cls=>'<tr><th>'+cls+' 型 · '+esc(partClasses[cls])+'</th>'+[0,1,2,3].map(slot=>'<td><input type="number" min="0" step="1" data-part-stock="'+cls+':'+slot+'" aria-label="'+esc(partClasses[cls]+' '+partSlots[slot]+'庫存')+'" value="'+(Number(stock[cls+':'+slot])||0)+'"></td>').join('')+'</tr>').join('')
  +'</tbody></table></div><p class="hint">輸入每個槽位實際持有的部件件數，變更會立即保存並觸發派船建議重算。</p>';
 host.querySelectorAll('[data-part-stock]').forEach(input=>input.onchange=()=>{
  const key=input.dataset.partStock,count=Math.max(0,Math.floor(Number(input.value)||0));
  update(s=>{s.partStock[key]=count;syncLegacyPartCounts()});
 });
 renderPartBuildable(stock);
}
function syncLegacyPartCounts(){
 const stock=state.partStock;
 const min=(keys)=>Math.min(...keys.map(k=>Number(stock[k])||0));
 state.parts['1111']=min(['1:0','1:1','1:2','1:3']);
 state.parts['0020']=Number(stock['2:2'])||0;
 state.parts['3004']=Math.min(Number(stock['3:0'])||0,Number(stock['4:3'])||0);
 state.parts['0003']=Number(stock['3:3'])||0;
}
function renderPartBuildable(stock){
 const configs=Object.entries(partRecipes).map(([key,pieces])=>({key,pieces,rank:{1111:1,1121:15,1123:25,3123:25,3124:35}[key]}));
 let best={count:-1,rank:-1,counts:{}},used={};
 function walk(i,count,rank,counts){
  if(i===configs.length){
   if(count>best.count||(count===best.count&&rank>best.rank))best={count,rank,counts:{...counts}};
   return;
  }
  const cfg=configs[i],limit=Math.min(4-count,...cfg.pieces.map(k=>Math.max(0,(Number(stock[k])||0)-(Number(used[k])||0))));
  for(let n=0;n<=limit;n++){
   cfg.pieces.forEach(k=>used[k]=(Number(used[k])||0)+n);
   counts[cfg.key]=n;walk(i+1,count+n,rank+n*cfg.rank,counts);
   cfg.pieces.forEach(k=>used[k]-=n);
  }
 }
 walk(0,0,0,{});
 const lines=Object.entries(best.counts).filter(([,n])=>n>0).map(([key,n])=>key+' × '+n+' 艘');
 const class5=Object.keys(stock).filter(k=>k.startsWith('5:')).reduce((n,k)=>n+(Number(stock[k])||0),0);
 $('part-buildable').innerHTML='<strong>依目前庫存最多可同時組成 '+Math.max(0,best.count)+' 艘</strong>'
  +(lines.length?'<span>'+esc(lines.join('　／　'))+'</span>':'<span>目前數量不足以組出已登錄的配置。</span>')
  +'<small>以上是純部件數量估算；Rank 門檻和各船實際已裝配置仍由派船計算器檢查。</small>'
  +(class5?'<small>5 型目前已記錄 '+class5+' 件；現有建議配置尚未使用 5 型部件。</small>':'');
}
function renderFleetSummary(){
 const registered=state.ships.filter(s=>s.registered).length;
 $('fleet-summary').textContent='已登記 '+registered+' / 4 艘潛水艇；部件與個別 Rank 可在管理視窗調整。';
 $('parts-inventory-summary').textContent='目前部件庫存：'+Object.values(state.partStock||{}).reduce((a,b)=>a+(Number(b)||0),0)+' 件（按型號與槽位管理）';
}
function renderFleet(){
 $('fleet').innerHTML=state.ships.map((s,i)=>{
  const rank=Math.max(1,Math.min(145,Number(s.rank)||1)),route=rankRoutes.find(x=>rank>=x[0]&&rank<=x[1]);
  const build=s.currentBuild||phase(rank);
  const name=typeof s.name==='string'?s.name:'';
  const shipTitle=esc(shipLabel(i,s));
  return '<article class="ship"><div class="head"><h3>'+shipTitle+'</h3>'
   +'<div class="ship-head-actions">'
   +'<button type="button" class="ship-rename-button" data-edit-ship-name="'+i+'" aria-label="編輯'+shipTitle+'名稱">編輯名稱</button>'
   +'<label class="checkbox"><input type="checkbox" data-registered="'+i+'" '+(s.registered?'checked':'')+'> 已登記</label></div></div>'
   +'<div class="ship-rename-editor" data-ship-name-editor="'+i+'" hidden>'
   +'<label>潛水艇名稱<input type="text" maxlength="40" data-ship-name-input="'+i+'" value="'+esc(name)+'" placeholder="留空恢復預設名稱"></label>'
   +'<div class="ship-rename-actions"><button type="button" data-save-ship-name="'+i+'">儲存</button>'
   +'<button type="button" data-cancel-ship-name="'+i+'">取消</button></div></div>'
   +'<div class="ship-fields"><label>目前 Rank<input type="number" min="1" max="145" data-rank="'+i+'" value="'+rank+'"></label>'
   +'<label>本 Rank EXP<input type="number" min="0" step="1" data-exp="'+i+'" value="'+(Number(s.exp)||0)+'"></label></div>'
   +'<div class="ship-meta">已登記配置：<strong>'+esc(build)+'</strong><br>參考航線：'
   +(route?esc(route[2]+' '+route[3]):'—')+'<br>已記錄出航：'+state.logs.filter(l=>Number(l.ship)===i+1).length+' 趟</div></article>';
 }).join('');
 const fleet=$('fleet');
 function closeEditor(i){
  const editor=fleet.querySelector('[data-ship-name-editor="'+i+'"]');
  if(editor)editor.hidden=true;
  const edit=fleet.querySelector('[data-edit-ship-name="'+i+'"]');
  if(edit)edit.setAttribute('aria-expanded','false');
 }
 function saveName(i){
  const input=fleet.querySelector('[data-ship-name-input="'+i+'"]');
  if(!input)return;
  const name=[...input.value.trim()].slice(0,40).join('');
  update(s=>{s.ships[i].name=name});
 }
 fleet.querySelectorAll('[data-edit-ship-name]').forEach(el=>el.onclick=()=>{
  const i=Number(el.dataset.editShipName);
  const editor=fleet.querySelector('[data-ship-name-editor="'+i+'"]');
  const input=fleet.querySelector('[data-ship-name-input="'+i+'"]');
  if(!editor||!input)return;
  if(!editor.hidden){closeEditor(i);return;}
  fleet.querySelectorAll('[data-ship-name-editor]').forEach(x=>x.hidden=true);
  fleet.querySelectorAll('[data-edit-ship-name]').forEach(x=>x.setAttribute('aria-expanded','false'));
  input.value=state.ships[i].name||'';
  editor.hidden=false;el.setAttribute('aria-expanded','true');
  input.focus();input.select();
 });
 fleet.querySelectorAll('[data-save-ship-name]').forEach(el=>el.onclick=()=>saveName(Number(el.dataset.saveShipName)));
 fleet.querySelectorAll('[data-cancel-ship-name]').forEach(el=>el.onclick=()=>closeEditor(Number(el.dataset.cancelShipName)));
 fleet.querySelectorAll('[data-ship-name-input]').forEach(el=>el.onkeydown=e=>{
  const i=Number(el.dataset.shipNameInput);
  if(e.key==='Enter'){e.preventDefault();saveName(i);}
  if(e.key==='Escape'){e.preventDefault();closeEditor(i);}
 });
 fleet.querySelectorAll('[data-registered]').forEach(el=>el.onchange=()=>{const i=+el.dataset.registered,on=el.checked;update(s=>{s.ships[i].registered=on})});
 fleet.querySelectorAll('[data-rank]').forEach(el=>el.onchange=()=>{const i=+el.dataset.rank,rank=Number(el.value)||1;update(s=>{s.ships[i].rank=rank})});
 fleet.querySelectorAll('[data-exp]').forEach(el=>el.onchange=()=>{const i=+el.dataset.exp,exp=Number(el.value)||0;update(s=>{s.ships[i].exp=exp})});
}
function renderRoutes(){
 $('route-table').innerHTML=rankRoutes.map(r=>'<tr><td>'+r[0]+'–'+r[1]+'</td><td>'+r[2]+'</td><td><strong>'+r[3]+'</strong></td><td>'+r[4]+'</td></tr>').join('');
}
function renderUnlocks(){
 $('unlock-list').innerHTML=unlockGroups.map((g,gi)=>'<div class="unlock-group"><h3>'+g.name+'</h3>'+g.steps.map((s,si)=>{
   const id=gi+'-'+si,key='u-'+id;
   return '<label class="unlock-step"><input type="checkbox" data-unlock="'+key+'" '+(state.unlocks[key]?'checked':'')+'><span>'+s[0]+' 海域已開</span><small>Rank '+s[1]+'</small></label>'
 }).join('')+'</div>').join('');
 $('unlock-list').querySelectorAll('[data-unlock]').forEach(el=>el.onchange=()=>{state.unlocks[el.dataset.unlock]=el.checked;localStorage.setItem(KEY,JSON.stringify(state))});
}
function renderLogs(){
 const runs=state.logs.length,fuelUsed=state.logs.reduce((a,l)=>a+(Number(l.fuel)||0),0),repairUsed=state.logs.reduce((a,l)=>a+(Number(l.repair)||0),0),xp=state.logs.reduce((a,l)=>a+(Number(l.exp)||0),0);
 $('log-summary').innerHTML='已記錄 <strong>'+runs+' 趟</strong>／累計 '+fuelUsed.toLocaleString()+' 燃料、'+repairUsed.toLocaleString()+' 修理材料、'+xp.toLocaleString()+' EXP。剩餘庫存：燃料 <strong>'+Number(state.fuel||0).toLocaleString()+'</strong>、修理材料 <strong>'+Number(state.repair||0).toLocaleString()+'</strong>。';
 $('log-table').innerHTML=runs?'<table><thead><tr><th>日期</th><th>艇</th><th>航線</th><th>EXP</th><th>燃料</th><th>修理</th><th>備註</th><th></th></tr></thead><tbody>'+state.logs.slice().reverse().map((l,idx)=>'<tr><td>'+esc(l.date)+'</td><td>'+esc(shipLabel(Number(l.ship)-1,state.ships[Number(l.ship)-1]))+'</td><td>'+esc(l.route)+'</td><td>'+Number(l.exp||0).toLocaleString()+'</td><td>'+Number(l.fuel||0)+'</td><td>'+Number(l.repair||0)+'</td><td>'+(l.kind==='settlement'?'<strong>返航結算 · Rank '+esc(l.rankAfter)+' / EXP '+Number(l.expAfter||0).toLocaleString()+'</strong>；'+(l.openedSectors||[]).map(p=>esc(p.label)).join('、')+'<br>':'')+esc(l.note||'')+'</td><td><button type="button" data-delete="'+(runs-1-idx)+'">刪除</button></td></tr>').join('')+'</tbody></table>':'<div class="empty">還沒有出航紀錄。</div>';
 $('log-table').querySelectorAll('[data-delete]').forEach(el=>el.onclick=()=>{
  const index=+el.dataset.delete,entry=state.logs[index],shown=JSON.stringify(entry);
  if(entry?.kind==='settlement'&&!confirm('刪除這筆返航結算？會回補消耗物資，但 Rank／EXP 和海圖不會倒回。若需修正可直接在上方手動修改。'))return;
  // 依畫面上的紀錄內容在最新資料中定位，避免其他分頁增刪紀錄後刪錯筆。
  let missing=false;
  update(s=>{
   const at=JSON.stringify(s.logs[index])===shown?index:s.logs.findIndex(x=>JSON.stringify(x)===shown);
   if(at<0){missing=true;return}
   const l=s.logs.splice(at,1)[0];s.fuel=Number(s.fuel||0)+(Number(l.fuel)||0);s.repair=Number(s.repair||0)+(Number(l.repair)||0);
  });
  if(missing)alert('這筆紀錄已在其他分頁變更或刪除，畫面已更新為最新資料。');
 });
}
function render(){
 $('fuel-stock').value=Number(state.fuel)||0;$('repair-stock').value=Number(state.repair)||0;
 renderEstimate();renderFleet();renderFleetSummary();renderPartInventory();renderRoutes();renderLogs();
}
[['fuel-stock','fuel'],['repair-stock','repair']].forEach(([id,key])=>$(id).onchange=()=>{const value=Math.max(0,Number($(id).value)||0);update(s=>{s[key]=value})});
const inventoryDialog=$('sub-inventory-dialog');
$('open-inventory').onclick=()=>inventoryDialog.showModal();
document.querySelectorAll('[data-open-inventory]').forEach(btn=>btn.onclick=()=>inventoryDialog.showModal());
$('close-inventory').onclick=()=>inventoryDialog.close();
inventoryDialog.addEventListener('click',e=>{if(e.target===inventoryDialog)inventoryDialog.close()});
// 完整 JSON 備份採用持久化資料快照，避免只匯出本模組較舊的記憶體副本。
// 包含動態配件、海圖、航行歷史、所有目前已儲存的頁面輸入與計算器設定。
function exportBackup(){
 try{
  window.dispatchEvent(new Event('submarine-export-requested'));
  const stored=JSON.parse(localStorage.getItem(KEY)||'null')||JSON.parse(JSON.stringify(state));
  if(!stored.plannerSettings){
   stored.plannerSettings={
    maxHours:Number($('calc-hours')?.value)||48,
    targetRank:Number($('calc-target-rank')?.value)||85,
    dailyPickup:!!$('daily-pickup')?.checked,
    pickupStart:$('pickup-start')?.value||'19:00',
    pickupEnd:$('pickup-end')?.value||'22:00',
    departureTime:$('calc-departure-time')?.value||'19:00',
    manualDeparture:false
   };
  }
  if(stored.activeSectorMap===undefined)stored.activeSectorMap=1;
  if(!stored||!Array.isArray(stored.ships)||!Array.isArray(stored.logs))
   throw new Error('尚無完整的儲存資料，請先確認船隊資料。');
  const payload={schema:2,app:'ff14-submarine-planner',
   exportedAt:new Date().toISOString(),data:stored};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='ff14-submarine-full-backup-'+new Date().toISOString().slice(0,10)+'.json';
  link.click();URL.revokeObjectURL(url);
 }catch(e){alert('匯出失敗：'+e.message)}
}
function importedState(obj){
 const incoming=obj?.data||obj;
 if(!incoming||typeof incoming!=='object'||!Array.isArray(incoming.ships)||!Array.isArray(incoming.logs))
  throw new Error('檔案缺少船隊或航行歷史，無法辨識為潛艇備份。');
 if(incoming.ships.length!==4)throw new Error('船隊資料不是四艘，為避免備份內容遺失而停止匯入。');
 if(!incoming.parts||typeof incoming.parts!=='object'||Array.isArray(incoming.parts))
  throw new Error('備份缺少配件庫存。');
 const result=Object.assign(fresh(),incoming);
 result.parts=Object.assign(fresh().parts,incoming.parts);
 result.partStock=Object.assign(legacyPartStock(result.parts),
  incoming.partStock&&typeof incoming.partStock==='object'&&!Array.isArray(incoming.partStock)?incoming.partStock:{});
 result.ships=fresh().ships.map((ship,i)=>Object.assign(ship,incoming.ships[i]||{}));
 result.unlocks=incoming.unlocks&&typeof incoming.unlocks==='object'&&!Array.isArray(incoming.unlocks)?incoming.unlocks:{};
 result.logs=incoming.logs;
 // 舊版（schema 1／無 schema）的備份本身沒有計算器設定，不會憑空創造數據。
 return result;
}
$('export-data').onclick=exportBackup;
$('import-data-button').onclick=()=>$('import-data').click();
$('import-data').onchange=async e=>{
 const f=e.target.files?.[0];if(!f)return;
 try{
  const parsed=JSON.parse(await f.text()),restored=importedState(parsed);
  // 匯入是整份還原：直接覆寫儲存資料，不與現有資料合併。
  localStorage.setItem(KEY,JSON.stringify(restored));
  state=restored;
  render();
  window.dispatchEvent(new Event('submarine-data-imported'));
  window.dispatchEvent(new Event('submarine-state-updated'));
  alert('完整備份已匯入：船隊、配件、庫存、海圖及全部航行歷史已還原；如備份包含計算器設定，也已套用。');
 }catch(err){alert('匯入失敗，原始資料未變更：'+err.message)}
 e.target.value='';
};
render();
})();