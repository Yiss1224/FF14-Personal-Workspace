(function(){
'use strict';
const KEY='ff14_submarine_planner_v1';
const fresh=()=>({
  fuel:1600,repair:300,parts:{'1111':4,'0020':4,'3004':4},
  ships:Array.from({length:4},(_,i)=>({registered:i===0,rank:1,exp:0})),
  unlocks:{},logs:[]
});
let state;
try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');state=Object.assign(fresh(),saved||{});state.parts=Object.assign(fresh().parts,saved?.parts||{});state.ships=fresh().ships.map((x,i)=>Object.assign(x,saved?.ships?.[i]||{}));state.unlocks=saved?.unlocks||{};state.logs=Array.isArray(saved?.logs)?saved.logs:[]}catch(e){state=fresh()}
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const save=()=>{localStorage.setItem(KEY,JSON.stringify(state));render()};
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
function renderEstimate(){
 const s=Number(state.fuel)||0,r=Number(state.repair)||0;
 $('estimate').innerHTML=[
  ['初始目標','Rank 85','按每艘目前 Rank、EXP、開放海域與船速即時計算，不再用固定趟數估算。'],
  ['目前庫存',s.toLocaleString()+' 罐燃料 / '+r.toLocaleString()+' 個修理材料','預設採用你提供的庫存；可直接修改。'],
  ['零件庫存','1111 ×4、0020 ×4、3004 ×4','自動練等配置：Rank 1–14 用 1111，Rank 15 起建議 1121；3124 留作後續金策配置。'],
  ['估算範圍','路線資料到 Rank 80','不含 Rank 81 以上的新海域；EXP 預估不計隨機追加探索。']
 ].map(x=>'<div class="stat"><small>'+esc(x[0])+'</small><strong>'+esc(x[1])+'</strong><small>'+esc(x[2])+'</small></div>').join('');
}
function renderFleet(){
 $('fleet').innerHTML=state.ships.map((s,i)=>{
  const rank=Math.max(1,Math.min(145,Number(s.rank)||1)),route=rankRoutes.find(x=>rank>=x[0]&&rank<=x[1]);
  const build=phase(rank);
  return '<article class="ship"><div class="head"><h3>潛水艇 '+(i+1)+'</h3><label class="checkbox"><input type="checkbox" data-registered="'+i+'" '+(s.registered?'checked':'')+'> 已登記</label></div><div class="ship-fields"><label>目前 Rank<input type="number" min="1" max="145" data-rank="'+i+'" value="'+rank+'"></label><label>本 Rank EXP<input type="number" min="0" step="1" data-exp="'+i+'" value="'+(Number(s.exp)||0)+'"></label></div><div class="ship-meta">建議配置：<strong>'+build+'</strong><br>參考航線：'+(route?route[2]+' '+route[3]:'—')+'<br>已記錄出航：'+state.logs.filter(l=>Number(l.ship)===i+1).length+' 趟</div></article>'
 }).join('');
 $('fleet').querySelectorAll('[data-registered]').forEach(el=>el.onchange=()=>{state.ships[+el.dataset.registered].registered=el.checked;save()});
 $('fleet').querySelectorAll('[data-rank]').forEach(el=>el.onchange=()=>{state.ships[+el.dataset.rank].rank=Number(el.value)||1;save()});
 $('fleet').querySelectorAll('[data-exp]').forEach(el=>el.onchange=()=>{state.ships[+el.dataset.exp].exp=Number(el.value)||0;save()});
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
 $('log-table').innerHTML=runs?'<table><thead><tr><th>日期</th><th>艇</th><th>航線</th><th>EXP</th><th>燃料</th><th>修理</th><th>備註</th><th></th></tr></thead><tbody>'+state.logs.slice().reverse().map((l,idx)=>'<tr><td>'+esc(l.date)+'</td><td>'+esc(l.ship)+'</td><td>'+esc(l.route)+'</td><td>'+Number(l.exp||0).toLocaleString()+'</td><td>'+Number(l.fuel||0)+'</td><td>'+Number(l.repair||0)+'</td><td>'+esc(l.note||'')+'</td><td><button type="button" data-delete="'+(runs-1-idx)+'">刪除</button></td></tr>').join('')+'</tbody></table>':'<div class="empty">還沒有出航紀錄。</div>';
 $('log-table').querySelectorAll('[data-delete]').forEach(el=>el.onclick=()=>{const l=state.logs.splice(+el.dataset.delete,1)[0];state.fuel=Number(state.fuel||0)+(Number(l.fuel)||0);state.repair=Number(state.repair||0)+(Number(l.repair)||0);save()});
}
function render(){
 $('fuel-stock').value=Number(state.fuel)||0;$('repair-stock').value=Number(state.repair)||0;
 $('parts-1111').value=Number(state.parts['1111'])||0;$('parts-0020').value=Number(state.parts['0020'])||0;$('parts-3004').value=Number(state.parts['3004'])||0;
 renderEstimate();renderFleet();renderRoutes();renderUnlocks();renderLogs();
}
[['fuel-stock','fuel'],['repair-stock','repair']].forEach(([id,key])=>$(id).onchange=()=>{state[key]=Math.max(0,Number($(id).value)||0);save()});
[['parts-1111','1111'],['parts-0020','0020'],['parts-3004','3004']].forEach(([id,key])=>$(id).onchange=()=>{state.parts[key]=Math.max(0,Number($(id).value)||0);save()});
$('log-date').value=new Date().toISOString().slice(0,10);
$('save-log').onclick=()=>{
 const fuel=Math.max(0,Number($('log-fuel').value)||0),repair=Math.max(0,Number($('log-repair').value)||0);
 if(fuel>Number(state.fuel||0)){alert('燃料庫存不足，請先更新庫存或確認輸入。');return}
 if(repair>Number(state.repair||0)){alert('修理材料庫存不足，請先更新庫存或確認輸入。');return}
 const ship=Number($('log-ship').value);
 state.logs.push({date:$('log-date').value||new Date().toISOString().slice(0,10),ship,route:$('log-route').value.trim(),exp:Number($('log-exp').value)||0,fuel,repair,note:$('log-note').value.trim()});
 state.fuel-=fuel;state.repair-=repair;
 ['log-route','log-exp','log-fuel','log-repair','log-note'].forEach(id=>$(id).value='');
 save();
};
$('clear-log-form').onclick=()=>['log-route','log-exp','log-fuel','log-repair','log-note'].forEach(id=>$(id).value='');
$('export-data').onclick=()=>{const blob=new Blob([JSON.stringify({schema:1,exportedAt:new Date().toISOString(),data:state},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ff14-submarine-log-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(url)};
$('import-data-button').onclick=()=>$('import-data').click();
$('import-data').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const obj=JSON.parse(await f.text()),incoming=obj.data||obj;if(!incoming.ships||!Array.isArray(incoming.logs))throw new Error('檔案格式不符');state=Object.assign(fresh(),incoming);state.parts=Object.assign(fresh().parts,incoming.parts||{});state.ships=fresh().ships.map((x,i)=>Object.assign(x,incoming.ships[i]||{}));state.logs=incoming.logs;save();alert('紀錄已匯入。')}catch(err){alert('匯入失敗：'+err.message)}e.target.value=''};
render();
})();