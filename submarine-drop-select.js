(function(){
'use strict';
const $=id=>document.getElementById(id);
const labels={1:'溺沒海',2:'灰海',3:'翠浪海'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data=null,loading=null,points=[];
function update(){
 const map=$('loot-map').value,raw=$('loot-route-input').value.toUpperCase().replace(/[\s,，、>→-]+/g,'');
 const known=data?.maps?.[map]||{},letters=[...raw],unknown=letters.filter(p=>!Object.prototype.hasOwnProperty.call(known,p));
 const valid=Boolean(data)&&(!raw||(/^[A-Z]+$/.test(raw)&&!unknown.length));
 points=valid?letters:[];
 $('settle-route').value=points.length?labels[map]+' '+points.join(' → '):'';
 $('loot-points').textContent=!data?'載入航點資料中…':!raw?'輸入航點代碼，例如 ABE、OJ':!valid?'找不到航點：'+(unknown.join('、')||raw)+'。請檢查海圖與代碼。':'已選航線：'+points.join(' → ');
 $('loot-route-input').setCustomValidity(!data?'航點資料載入中':!valid?'航線代碼無效，請檢查海圖與航點':'');
 const names=new Set();
 for(const p of points)for(const tier of known[p]||[])for(const item of tier)names.add(item);
 const sorted=[...names].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
 $('loot-select-item').innerHTML='<option value="">選擇打撈物品…</option>'+sorted.map((n,i)=>'<option value="'+i+'">'+esc(n)+'</option>').join('');
 $('loot-select-item')._names=sorted;
 $('loot-candidates').textContent=points.length?'此航線有 '+sorted.length+' 種候選物品（按 Wiki 收錄資料）':'輸入有效航線後即可選擇可能的掉落物。';
}
async function load(){
 if(loading)return loading;
 loading=fetch('submarine-drop-data.json?v=20261012-2').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(result=>{data=result;update()}).catch(e=>{
  $('loot-select-status').textContent='航點掉落資料載入失敗，可手動新增物品：'+e.message;
  loading=null;update();
 });
 return loading;
}
$('loot-map').onchange=update;
$('loot-route-input').oninput=update;
$('loot-route-input').onchange=()=>{$('loot-route-input').value=$('loot-route-input').value.toUpperCase().replace(/[\s,，、>→-]+/g,'');update()};
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
function clear(){$('loot-route-input').value='';update();$('loot-select-status').textContent=''}
for(const name of ['submarine-settlement-saved','submarine-settlement-reset','submarine-data-imported'])window.addEventListener(name,clear);
load();
})();