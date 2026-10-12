(function(){
'use strict';
const $=id=>document.getElementById(id);
const labels={1:'溺沒海',2:'灰海',3:'翠浪海'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data=null,loading=null,points=[],fuelData=null,lastAutoFuel=null;
function parseRoute(value,known){
 const raw=String(value||'').trim().toUpperCase();
 if(!raw)return {points:[],error:''};
 const explicit=/[,，、;；\s>→-]/.test(raw);
 const tokens=explicit?raw.split(/[,，、;；\s>→-]+/).filter(Boolean):[...raw];
 if(tokens.some(t=>!/^[A-Z]{1,2}$/.test(t)))return {points:[],error:'航線格式無效，雙字母航點請用逗號、空格或 - 分隔。'};
 const unknown=tokens.filter(t=>!Object.prototype.hasOwnProperty.call(known,t));
 if(unknown.length)return {points:[],error:'找不到航點：'+[...new Set(unknown)].join('、')+'。請檢查海圖與代碼。'};
 return {points:tokens,error:''};
}
function showPrice(){
 const sel=$('loot-select-item'),name=sel._names?.[Number(sel.value)];
 const display=$('loot-price-preview');
 if(!sel.value||!name){display.textContent='選擇物品即可查看單價與本筆估值。';return}
 const found=window.SubmarinePrices?.lookup(name);
 const qty=Number($('loot-selected-qty').value);
 if(!found||!Number.isFinite(Number(found.price))){display.textContent=name+'：尚未查價。可在下方收益帳本設定物品 ID、更新行情或手動定價。';return}
 const price=Number(found.price);
 display.textContent=name+'｜'+price.toLocaleString()+' Gil／件（'+found.source+'）'+(Number.isSafeInteger(qty)&&qty>0?'｜'+qty+' 件合計 '+(price*qty).toLocaleString()+' Gil':'｜請輸入有效數量');
}
function update(){
 const map=$('loot-map').value,raw=$('loot-route-input').value;
 const known=data?.maps?.[map]||{},result=parseRoute(raw,known);
 const valid=Boolean(data)&&!result.error;
 points=valid?result.points:[];
 $('settle-route').value=points.length?labels[map]+' '+points.join(' → '):'';
 $('loot-points').textContent=!data?'載入航點資料中…':!raw.trim()?'輸入 ABE、OJ；雙字母航點用 A,AA,AB':!valid?result.error:'已選航線：'+points.join(' → ');
 $('loot-route-input').setCustomValidity(!data?'航點資料載入中':result.error);
 const field=$('settle-fuel'),fuelPoints=points.map(p=>fuelData?.[map]?.[p]);
 const ready=points.length>0&&fuelPoints.every(n=>Number.isSafeInteger(n)&&n>=0);
 if(ready){
  const fuel=fuelPoints.reduce((a,n)=>a+n,0);
  field.value=String(fuel);lastAutoFuel=fuel;
  $('settle-fuel-info').textContent='航線預估消耗 '+fuel+' 罐（可手動修正）';
 }else{
  if(lastAutoFuel!==null&&Number(field.value)===lastAutoFuel)field.value='';
  lastAutoFuel=null;
  $('settle-fuel-info').textContent=points.length?'燃料資料不足，請手動輸入。':'輸入有效航線後自動估算燃料。';
 }
 const names=new Set();
 for(const p of points)for(const tier of known[p]||[])for(const item of tier)names.add(item);
 const sorted=[...names].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
 $('loot-select-item').innerHTML='<option value="">選擇打撈物品…</option>'+sorted.map((n,i)=>'<option value="'+i+'">'+esc(n)+'</option>').join('');
 $('loot-select-item')._names=sorted;
 $('loot-candidates').textContent=points.length?'此航線有 '+sorted.length+' 種候選物品（按 Wiki 收錄資料）':'輸入有效航線後即可選擇可能的掉落物。';
 showPrice();
}
async function load(){
 if(loading)return loading;
 loading=fetch('submarine-drop-data.json?v=20261012-3').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(result=>{data=result;update()}).catch(e=>{
  $('loot-select-status').textContent='航點掉落資料載入失敗，可手動新增物品：'+e.message;
  loading=null;update();
 });
 return loading;
}
fetch('submarine-route-data.json').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(result=>{
 fuelData={};
 for(const sector of result.sectors||[]){
  const map=String(sector.map),letter=String(sector.letter).toUpperCase();
  (fuelData[map]??={})[letter]=Number(sector.fuel);
 }
 update();
}).catch(()=>{$('settle-fuel-info').textContent='燃料資料載入失敗，請手動輸入。'});
$('loot-select-item').onchange=showPrice;
$('loot-selected-qty').oninput=showPrice;
window.addEventListener('submarine-prices-updated',showPrice);
$('loot-map').onchange=update;
$('loot-route-input').oninput=update;
$('loot-route-input').onchange=()=>{$('loot-route-input').value=$('loot-route-input').value.trim().toUpperCase();update()};
$('loot-add-selected').onclick=()=>{
 const select=$('loot-select-item'),index=Number(select.value),name=select._names?.[index],qty=Number($('loot-selected-qty').value);
 if(select.value===''||!name||!Number.isSafeInteger(qty)||qty<1||qty>1000000){$('loot-select-status').textContent='請選擇掉落物並輸入有效的正整數數量。';return}
 if(!window.SubmarineLootDraft?.addItem){$('loot-select-status').textContent='掉落物表單尚未載入。';return}
 window.SubmarineLootDraft.addItem(name,qty);$('loot-select-status').textContent='已加入 '+name+' × '+qty;
};
window.SubmarineRouteEntry={validate:()=>{
 update();const input=$('loot-route-input');
 if(input.value.trim()&&!$('settle-route').value){input.reportValidity?.();throw Error('航線代碼無效，請先修正海圖或航點。')}
 }};
function clear(){$('loot-route-input').value='';lastAutoFuel=null;update();$('loot-select-status').textContent=''}
for(const name of ['submarine-settlement-saved','submarine-settlement-reset','submarine-data-imported'])window.addEventListener(name,clear);
load();
})();