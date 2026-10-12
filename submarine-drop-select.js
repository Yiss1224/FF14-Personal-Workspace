(function(){
'use strict';
const $=id=>document.getElementById(id);
let data=null,started=false,chosen=[];
const labels={1:'溺沒海',2:'灰海',3:'翠浪海'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function options(){
 const map=$('loot-map').value,rows=data?.maps?.[map]||{};
 $('loot-point').innerHTML=Object.keys(rows).sort().map(k=>'<option value="'+k+'">'+k+'</option>').join('');
}
function render(){
 const map=$('loot-map').value,rows=data?.maps?.[map]||{};
 $('loot-points').textContent=chosen.length?'已選航點：'+chosen.join(' → '):'尚未指定這趟航線的航點';
 const all=new Map();
 for(const letter of chosen){
  const tiers=rows[letter]||[];
  tiers.forEach((names,i)=>names.forEach(name=>{
   if(!all.has(name))all.set(name,{points:[],tier:[]});
   const x=all.get(name);x.points.push(letter);x.tier.push(['低','中','高'][i]);
  }));
 }
 const sorted=[...all.keys()].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
 $('loot-select-item').innerHTML='<option value="">選擇這趟實際拿到的物品…</option>'+
  sorted.map((name,i)=>'<option value="'+i+'">'+esc(name)+'</option>').join('');
 $('loot-select-item')._names=sorted;
 $('loot-candidates').textContent='候選 '+sorted.length+' 種物品；物品可能同時來自多個航點，數量請依遊戲實際結果填寫。';
}
function routePoints(){
 const raw=$('settle-route').value.toUpperCase().trim();
 const s=$('loot-map'),match=raw.match(/溺沒海|灰海|翠浪海/);
 if(match)s.value=Object.keys(labels).find(k=>labels[k]===match[0])||s.value;
 options();
 const rows=data?.maps?.[s.value]||{};
 let tokens=raw.match(/(?:^|[^A-Z])([A-Z])(?=$|[^A-Z])/g)||[];
 tokens=tokens.map(x=>x.trim()).filter(x=>rows[x]);
 chosen=[...new Set(tokens)];
 render();
}
async function init(){
 if(started)return;started=true;
 try{
  const res=await fetch('submarine-drop-data.json?v=20261012-1',{cache:'force-cache'});
  if(!res.ok)throw Error('HTTP '+res.status);
  data=await res.json();options();render();
  $('loot-select-status').textContent='已載入 3 張海圖的部分掉落清單。溺沒海目前收錄 A–O；台服名稱請以遊戲為準。';
 }catch(e){$('loot-select-status').textContent='無法載入掉落資料：'+e.message+'。仍可手動新增物品。';}
}
$('loot-helper').addEventListener('toggle',()=>{if($('loot-helper').open)init()});
$('loot-map').onchange=()=>{chosen=[];options();render()};
$('loot-from-route').onclick=()=>{init().then(routePoints)};
$('loot-add-point').onclick=()=>{if(!data)return;const point=$('loot-point').value;if(point&&!chosen.includes(point))chosen.push(point);render()};
$('loot-clear-points').onclick=()=>{chosen=[];render()};
$('loot-add-selected').onclick=()=>{
 const selected=$('loot-select-item').value,index=Number(selected),names=$('loot-select-item')._names||[];
 const name=names[index],qty=Number($('loot-selected-qty').value);
 if(selected===''||!name||!Number.isSafeInteger(qty)||qty<1||qty>1000000){$('loot-select-status').textContent='請選擇物品並填寫正整數數量。';return}
 if(!window.SubmarineLootDraft?.addItem){$('loot-select-status').textContent='掉落物表單尚未準備好。';return}
 window.SubmarineLootDraft.addItem(name,qty);
 $('loot-select-status').textContent='已加入 '+name+' × '+qty+'；請核對返航結算欄位。';
};
window.addEventListener('submarine-settlement-saved',()=>{chosen=[];render()});
window.addEventListener('submarine-settlement-reset',()=>{chosen=[];render()});
window.addEventListener('submarine-data-imported',()=>{chosen=[];render()});
})();