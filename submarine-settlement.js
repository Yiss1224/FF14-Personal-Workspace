(function(){
'use strict';
const KEY='ff14_submarine_planner_v1';
const $=id=>document.getElementById(id);
const labels={1:'溺沒海',2:'灰海',3:'翠浪海'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let sectors=null,chosen=new Set(),justSaved=false;
function today(){
 const d=new Date();
 return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
}
function read(){
 try{
  const raw=JSON.parse(localStorage.getItem(KEY)||'null')||{};
  return {
   ...raw,
   ships:Array.from({length:4},(_,i)=>({
    registered:i===0,rank:1,exp:0,name:'',...(raw.ships?.[i]||{})
   })),
   unlocks:raw.unlocks||{},
   logs:Array.isArray(raw.logs)?raw.logs:[]
  };
 }catch(e){throw new Error('無法讀取原本的潛艇資料，請先備份並確認匯入的 JSON。')}
}
function opened(point,s){
 return Boolean(s.unlocks['sector-'+point.id]??(point.map===1&&['A','B'].includes(point.letter)));
}
function status(message,isError=false){
 const el=$('settle-status');
 el.textContent=message;
 el.className='settle-status '+(message?(isError?'settle-error':'settle-success'):'');
}
function resetButton(){if(!justSaved)$('settle-save').disabled=false}
function shipLabel(index,ship){
 const name=typeof ship?.name==='string'?ship.name.trim():'';
 return '潛水艇 '+(index+1)+(name?' · '+name:'');
}
function refreshShipOptions(){
 const select=$('settle-ship'),selected=select.value||'1';
 const s=read();
 select.innerHTML=s.ships.map((ship,i)=>'<option value="'+(i+1)+'">'+esc(shipLabel(i,ship))+'</option>').join('');
 select.value=selected;
}
function refreshShip(){
 const ship=Number($('settle-ship').value)-1;
 try{
  const s=read().ships[ship];
  $('settle-rank').value=Number(s?.rank)||1;
  $('settle-exp').value=Number(s?.exp)||0;
  resetButton();
 }catch(e){status(e.message,true)}
}
function refreshPoints(){
 const picker=$('settle-sector-picker'),chips=$('settle-sector-chips');
 if(!sectors){
  picker.innerHTML='<option value="">航點載入中…</option>';
  $('settle-sector-add').disabled=true;
  return;
 }
 const s=read();
 const available=sectors.filter(p=>!opened(p,s)&&!chosen.has(p.id));
 const opts=[1,2,3].map(map=>{
  const here=available.filter(p=>p.map===map);
  return here.length?'<optgroup label="'+labels[map]+'">'+here.map(p=>
    '<option value="'+p.id+'">'+esc(p.letter)+'（Rank '+p.rank+'）</option>').join('')+'</optgroup>':'';
 }).join('');
 picker.innerHTML='<option value="">選擇未開航點…</option>'+opts;
 picker.value='';
 $('settle-sector-add').disabled=available.length===0;
 chips.innerHTML=chosen.size?[...chosen].map(id=>{
  const p=sectors.find(x=>x.id===id);
  return p?'<span class="settle-chip">'+esc(labels[p.map]+' '+p.letter)
    +'<button type="button" data-unchoose="'+p.id+'" aria-label="移除 '+esc(labels[p.map]+' '+p.letter)+'">×</button></span>':'';
 }).join(''):'<span class="hint">本趟沒有新增航點。</span>';
 chips.querySelectorAll('[data-unchoose]').forEach(b=>b.onclick=()=>{
  chosen.delete(Number(b.dataset.unchoose));resetButton();refreshPoints();
 });
}
function clearForm(){
 chosen=new Set();
 for(const id of ['settle-route','settle-gain','settle-fuel','settle-repair','settle-note'])$(id).value='';
 $('settle-date').value=today();
 refreshShip();refreshPoints();
 resetButton();
}
function num(id,name,required=false,max=Number.MAX_SAFE_INTEGER){
 const raw=String($(id).value).trim();
 if(!raw){if(required)throw new Error('請填寫「'+name+'」。');return null;}
 const n=Number(raw);
 if(!Number.isSafeInteger(n)||n<0||n>max)throw new Error('「'+name+'」必須是有效的非負整數。');
 return n;
}
function commit(){
 if(justSaved)return status('這趟已結算。如需登記下一趟，請先切換船隻或按「清空這次結算」。',true);
 try{
  window.SubmarineRouteEntry?.validate();
  const s=read(),shipNo=Number($('settle-ship').value),ship=s.ships[shipNo-1];
  if(!ship?.registered)throw new Error('這艘船還沒登記，請先在上方「船隊進度」勾選已登記。');
  const date=$('settle-date').value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T00:00:00')))
   throw new Error('請選擇有效的返航日期。');
  const rank=num('settle-rank','返航後 Rank',true,145);
  if(rank<1)throw new Error('Rank 不得低於 1。');
  const exp=num('settle-exp','返航後本 Rank EXP',true);
  const gained=num('settle-gain','本趟獲得 EXP');
  const fuel=num('settle-fuel','本趟消耗燃料')??0;
  const repair=num('settle-repair','本趟消耗修理材料')??0;
  if(rank<Number(ship.rank)|| (rank===Number(ship.rank)&&exp<Number(ship.exp||0)))
   throw new Error('返航後 Rank／EXP 低於船隊現有進度；如需校正歷史資料，請先從上方手動欄位修改。');
  if(fuel>Number(s.fuel||0))throw new Error('燃料庫存不足，請確認用量或先在上方補正庫存。');
  if(repair>Number(s.repair||0))throw new Error('修理材料庫存不足，請確認用量或先在上方補正庫存。');
  const loot=window.SubmarineLootDraft?window.SubmarineLootDraft.getItems():[];
  const newlyOpened=sectors?[...chosen].map(id=>sectors.find(x=>x.id===id)).filter(Boolean)
   .filter(p=>!opened(p,s)).map(p=>({id:p.id,label:labels[p.map]+' '+p.letter})):[];
  if(chosen.size&&!sectors)throw new Error('航點清單尚未載入，請改到海圖手動更新。');
  s.logs.push({
   kind:'settlement',date,ship:shipNo,route:$('settle-route').value.trim(),
   exp:gained??0,fuel,repair,note:$('settle-note').value.trim(),
   rankBefore:Number(ship.rank)||1,expBefore:Number(ship.exp)||0,
   rankAfter:rank,expAfter:exp,openedSectors:newlyOpened,loot
  });
  s.fuel=Number(s.fuel||0)-fuel;s.repair=Number(s.repair||0)-repair;
  ship.rank=rank;ship.exp=exp;ship.voyaging=false;
  // 已結算的航程不再作為進行中航程；保留為 lastVoyage，避免之後手動標記出航時誤用舊計時。
  if(ship.voyage){ship.lastVoyage={...ship.voyage,settledAt:Date.now()};delete ship.voyage}
  for(const p of newlyOpened)s.unlocks['sector-'+p.id]=true;
  localStorage.setItem(KEY,JSON.stringify(s));
  window.dispatchEvent(new Event('submarine-settlement-saved'));
  window.dispatchEvent(new Event('submarine-state-updated'));
  clearForm();
  justSaved=true;
  $('settle-save').disabled=true; // 必須切船或清空表單才可登記下一趟
  status(shipLabel(shipNo-1,ship)+' 已結算：Rank '+rank+'、本 Rank EXP '+exp.toLocaleString()
    +'；開啟 '+newlyOpened.length+' 個航點。已同步更新船隊、出航紀錄及庫存。');
 }catch(e){status(e.message,true)}
}
function init(){
 $('settle-date').value=today();
 refreshShipOptions();
 $('settle-ship').onchange=()=>{justSaved=false;clearForm();window.dispatchEvent(new Event('submarine-settlement-reset'));status('')};
 $('settle-sector-add').onclick=()=>{
  const id=Number($('settle-sector-picker').value);
  if(!id||!sectors?.some(p=>p.id===id))return;
  chosen.add(id);resetButton();refreshPoints();
 };
 $('settle-save').onclick=commit;
 $('settle-reset').onclick=()=>{justSaved=false;clearForm();window.dispatchEvent(new Event('submarine-settlement-reset'));status('')};
 $('settle-form').addEventListener('input',resetButton);
 $('settle-form').addEventListener('change',resetButton);
 window.addEventListener('submarine-build-state-updated',refreshPoints);
 window.addEventListener('submarine-state-updated',()=>{
  refreshShipOptions();refreshPoints();
 });
 window.addEventListener('submarine-data-imported',()=>{justSaved=false;refreshShipOptions();clearForm();status('已載入備份；返航結算已切換到匯入的船隊資料。')});
 refreshShip();refreshPoints();
 fetch('submarine-route-data.json').then(r=>{
  if(!r.ok)throw new Error('HTTP '+r.status);
  return r.json();
 }).then(data=>{
  sectors=(data.sectors||[]).filter(p=>[1,2,3].includes(p.map))
   .map(p=>({id:Number(p.id),map:Number(p.map),letter:String(p.letter),rank:Number(p.rank)}));
  refreshPoints();
 }).catch(e=>{
  sectors=[];
  refreshPoints();
  $('settle-sector-picker').innerHTML='<option value="">航點載入失敗，請用下方海圖</option>';
  status('載入航點失敗：'+e.message+'。Rank／EXP 及航行紀錄仍可正常結算。',true);
 });
}
init();
})();
