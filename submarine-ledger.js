(function(){
'use strict';
const KEY='ff14_submarine_planner_v1',$=id=>document.getElementById(id);
let loot=[];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=()=>JSON.parse(localStorage.getItem(KEY)||'{}');
function renderTotal(){
 let total=0,missing=new Set();
 for(const x of loot){
  if(!x.name||!Number.isSafeInteger(Number(x.qty))||Number(x.qty)<1)continue;
  const unit=window.SubmarinePrices?.lookup(x.name)?.price;
  if(typeof unit==='number'&&Number.isFinite(unit))total+=unit*Number(x.qty);
  else missing.add(x.name);
 }
 $('voyage-loot-total').textContent='本趟掉落總估值：'+total.toLocaleString('en-US')+' Gil'+(missing.size?'（'+missing.size+' 種未查價，未計入）':'')+'｜非實際售出收入';
}
function render(){
 $('voyage-loot-rows').innerHTML=loot.map((x,i)=>'<div class="loot-line"><input data-loot-name="'+i+'" value="'+esc(x.name)+'" placeholder="物品名稱"><input data-loot-qty="'+i+'" type="number" min="1" value="'+x.qty+'"><button data-loot-remove="'+i+'" type="button">移除</button></div>').join('');
 $('voyage-loot-rows').querySelectorAll('[data-loot-name]').forEach(el=>el.onchange=()=>(loot[+el.dataset.lootName].name=el.value.trim(),renderTotal()));
 $('voyage-loot-rows').querySelectorAll('[data-loot-qty]').forEach(el=>el.onchange=()=>(loot[+el.dataset.lootQty].qty=Number(el.value),renderTotal()));
 $('voyage-loot-rows').querySelectorAll('[data-loot-remove]').forEach(el=>el.onclick=()=>{loot.splice(+el.dataset.lootRemove,1);render()});
 renderTotal();
}
function clear(){loot=[];render()}
function values(){
 return loot.filter(x=>x.name).map(x=>{
  if(!Number.isSafeInteger(x.qty)||x.qty<1)throw Error('掉落物數量必須是正整數');
  return {name:x.name.slice(0,140),qty:x.qty};
 });
}
function monthly(){
 const s=read(),logs=(s.logs||[]).filter(l=>String(l.date||'').startsWith($('ledger-month').value));
 const price=s.lootPrices||{};
 let total=0,lines=[],byShip=[0,0,0,0],unpriced=new Set();
 for(const l of logs){
  const value=(l.loot||[]).reduce((sum,x)=>{
   const record=window.SubmarinePrices?.lookup(x.name);
   const unit=record?.price??(Number.isFinite(Number(price[x.name]))?Number(price[x.name]):null);
   if(unit===null||unit===undefined){unpriced.add(x.name);return sum;}
   return sum+x.qty*unit;
  },0);
  total+=value;if(l.ship>=1&&l.ship<=4)byShip[l.ship-1]+=value;lines.push('<tr><td>'+esc(l.date)+'</td><td>'+l.ship+'</td><td>'+esc((l.loot||[]).map(x=>x.name+' × '+x.qty).join('、'))+'</td><td>'+value.toLocaleString()+'</td></tr>');
 }
 $('ledger-summary').textContent=logs.length+' 趟／估值 '+total.toLocaleString()+' Gil（非已售收入、未扣成本）。船隊估值：'+byShip.map((v,i)=>(i+1)+' 號 '+v.toLocaleString()).join('／')+' Gil。'+(unpriced.size?' 未查價 '+unpriced.size+' 種，未計入估值。':'');
 $('ledger-rows').innerHTML='<table><tr><th>日期</th><th>艇</th><th>掉落</th><th>價值</th></tr>'+lines.reverse().join('')+'</table>';
}
$('voyage-add-item').onclick=()=>{loot.push({name:'',qty:1});render()};
window.SubmarineLootDraft={getItems:values,clear,addItem:(name,qty)=>{const old=loot.find(x=>x.name===name);if(old)old.qty=Number(old.qty)+qty;else loot.push({name,qty});render()}};
window.addEventListener('submarine-settlement-saved',()=>{clear();if($('ledger-details').open)monthly()});
window.addEventListener('submarine-settlement-reset',clear);
window.addEventListener('submarine-data-imported',()=>{clear();if($('ledger-details').open)monthly()});
$('ledger-details').addEventListener('toggle',()=>{if(!$('ledger-details').open)return;
 const d=new Date();if(!$('ledger-month').value)$('ledger-month').value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
 monthly();
});
$('ledger-month').onchange=monthly;
window.addEventListener('submarine-prices-updated',()=>{renderTotal();if($('ledger-details').open)monthly()});
$('ledger-price-save').onclick=()=>{
 const name=$('ledger-price-name').value.trim(),p=Number($('ledger-price-value').value);
 if(!name||!Number.isSafeInteger(p)||p<0){const msg='物品名稱及價格格式不符';if(window.SubDialog)window.SubDialog.alert(msg);else window.alert(msg);return}
 const s=read();s.lootPrices=s.lootPrices||{};s.lootPrices[name]=p;
 localStorage.setItem(KEY,JSON.stringify(s));renderTotal();monthly();$('ledger-price-status').textContent=name+'：'+p+' Gil／件，已儲存。';
};
render();
})();