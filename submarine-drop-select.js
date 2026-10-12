(function(){
'use strict';
const $=id=>document.getElementById(id);
const labels={1:'溺沒海',2:'灰海',3:'翠浪海'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data=null,points=[],loading=null;
function setRoute(){
 const map=$('loot-map').value;
 $('settle-route').value=points.length?labels[map]+' '+points.join(' → '):'';
 $('loot-points').innerHTML=points.length?points.map((p,i)=>'<button type="button" class="settle-chip" data-route-index="'+i+'" title="移除這個航點">'+esc(p)+' ×</button>').join(''):'尚未選擇航點';
 $('loot-points').querySelectorAll('[data-route-index]').forEach(b=>b.onclick=()=>{points.splice(Number(b.dataset.routeIndex),1);update()});
}
function update(){
 setRoute();
 const rows=data?.maps?.[$('loot-map').value]||{};
 const names=new Set();
 for(const p of points)for(const tier of rows[p]||[])for(const item of tier)names.add(item);
 const sorted=[...names].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
 $('loot-select-item').innerHTML='<option value="">選擇打撈物品…</option>'+sorted.map((n,i)=>'<option value="'+i+'">'+esc(n)+'</option>').join('');
 $('loot-select-item')._names=sorted;
 $('loot-candidates').textContent=points.length?'此航線有 '+sorted.length+' 種候選物品（按 Wiki 收錄資料）':'加入航點後即可選擇可能的掉落物。';
}
function fillPoints(){
 const rows=data?.maps?.[$('loot-map').value]||{};
 $('loot-point').innerHTML=Object.keys(rows).sort().map(p=>'<option value="'+p+'">'+p+'</option>').join('')||'<option value="">尚無航點資料</option>';
}
async function load(){
 if(loading)return loading;
 loading=fetch('submarine-drop-data.json?v=20261012-2').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(result=>{
  data=result;fillPoints();update();
 }).catch(e=>{$('loot-select-status').textContent='航點掉落資料載入失敗，可用「手動新增物品」：'+e.message;loading=null});
 return loading;
}
$('loot-map').onchange=()=>{points=[];fillPoints();update()};
$('loot-add-point').onclick=()=>{const p=$('loot-point').value;if(p&&data?.maps?.[$('loot-map').value]?.[p]&&!points.includes(p)){points.push(p);update()}};
$('loot-clear-points').onclick=()=>{points=[];update()};
$('loot-add-selected').onclick=()=>{
 const select=$('loot-select-item'),index=Number(select.value),name=select._names?.[index],qty=Number($('loot-selected-qty').value);
 if(select.value===''||!name||!Number.isSafeInteger(qty)||qty<1||qty>1000000){$('loot-select-status').textContent='請選擇掉落物並輸入有效的正整數數量。';return}
 if(!window.SubmarineLootDraft?.addItem){$('loot-select-status').textContent='掉落物表單尚未載入。';return}
 window.SubmarineLootDraft.addItem(name,qty);
 $('loot-select-status').textContent='已加入 '+name+' × '+qty;
};
function clear(){points=[];setRoute();update();$('loot-select-status').textContent=''}
window.addEventListener('submarine-settlement-saved',clear);
window.addEventListener('submarine-settlement-reset',clear);
window.addEventListener('submarine-data-imported',clear);
load();
})();