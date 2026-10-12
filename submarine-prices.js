(function(){
'use strict';
const KEY='ff14_submarine_planner_v1',$=id=>document.getElementById(id);
const npc={'上等沉船戒指':27000,'上等沉船手鐲':28500,'上等沉船耳飾':30000,'上等沉船項鍊':34500};
const catalogue={"納夏薄絹":20270,"白雲花":20791,"紅蓮珊瑚":22441,"仿製財寶":17019,"石像的碎片":22442,"陳舊的樂譜：海中":23337,"天然綠水晶":24490,"天然青水晶":24505,"天然赤水晶":27287,"黃金水瓶":28136,"天然黃水晶":28980,"裝有結晶的背包":30386,"景觀樹":32248,"格斯塔拉的肖像畫":33287,"景觀樹":32248,"天然水晶":23875,"莫古力的王冠":12657,"壞掉的冰盒":33873,"精梳毛布":16906,"強化玻璃板":16908,"沉船戒指":22500,"沉船手鐲":22501,"沉船耳飾":22502,"沉船項鍊":22503,"上等沉船戒指":22504,"上等沉船手鐲":22505,"上等沉船耳飾":22506,"上等沉船項鍊":22507,"舞海月":21921,"南方度假獺獺":24902,"鮣魚級潛水艇":26802,"狐獴":28621,"銀山雀兒":30093,"紫漆油紙傘":31322,"管弦樂琴樂譜：宿命":31671,"希爾德拉級潛水艇P型":32848,"管弦樂琴樂譜：復仇":33120,"本本石":33695,"管弦樂琴樂譜：蓄意":33848,"無屬性水晶":10099,"紅莫柯草":12220,"鐵刀木":12221,"合成生物的粗皮":12222,"蒼天石原石":12223,"藍鐵礦":12224,"深紅水晶":12225,"深紅晶簇":12226,"深綠水晶":12227,"深綠晶簇":12228,"深藍水晶":12229,"深藍晶簇":12230,"天然黏土":12920,"石粉黏土":12921,"鍊金樹脂":12922,"竹片":12923,"輕木廢材":12924,"輕木木材":12925,"鍊金纖維":12926,"魔科學纖維":12927,"深色水晶":12928,"深色晶簇":12929,"鐵紋礦石":25008,"黃檀木材":26528,"柳杉原木":26529,"純鈦礦":26531,"海底黏土":29590,"海產油脂":23222,"打撈上來的古錢":24908,"海底的財寶":24503,"古董瓶":27293,"精梳毛布地毯":15976};
const worlds={'陸行鳥資料中心':'陸行鳥','伊弗利特':'4028','迦樓羅':'4029','利維坦':'4030','鳳凰':'4031','奧汀':'4032','巴哈姆特':'4033','拉姆':'4034','泰坦':'4035'};
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}};
let live={},pending=false;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function lookup(name){
 if(Object.prototype.hasOwnProperty.call(npc,name))return {price:npc[name],source:'NPC'};
 const s=load(),override=s.lootPrices||{};
 if(Object.prototype.hasOwnProperty.call(override,name))return {price:override[name],source:'手動'};
 const found=live[name];return found&&Number.isFinite(found.price)?found:null;
}
function names(){
 const s=load(),all=new Set(Object.keys(catalogue));
 for(const l of s.logs||[])for(const x of l.loot||[])if(x.name)all.add(x.name);
 for(const n of Object.keys(s.lootItemIds||{}))all.add(n);
 return [...all].filter(n=>!Object.prototype.hasOwnProperty.call(npc,n)).sort((a,b)=>a.localeCompare(b,'zh-Hant'));
}
function redraw(){
 const s=load(),ids={...catalogue,...(s.lootItemIds||{})},items=names();
 $('market-items').innerHTML=items.length?items.map(n=>{
  const p=lookup(n),id=ids[n]||'';
  return '<div class="market-item"><span>'+esc(n)+'</span><input type="number" min="1" step="1" data-market-id="'+esc(n)+'" value="'+id+'" placeholder="物品 ID" aria-label="Universalis 物品 ID"><small>'+esc(p?p.price.toLocaleString()+' Gil／'+p.source:'未查價')+'</small></div>'
 }).join(''):'<p class="hint">返航登記材料後，這裡會出現待對應的物品名稱。</p>';
 $('market-items').querySelectorAll('[data-market-id]').forEach(el=>el.onchange=()=>{
  const id=Number(el.value),state=load(),n=el.dataset.marketId;
  state.lootItemIds=state.lootItemIds||{};
  if(el.value.trim()==='')delete state.lootItemIds[n];
  else if(Number.isSafeInteger(id)&&id>0)state.lootItemIds[n]=id;
  else {el.value=state.lootItemIds[n]||'';return}
  localStorage.setItem(KEY,JSON.stringify(state));delete live[n];
  window.dispatchEvent(new Event('submarine-prices-updated'));
  redraw();
 });
}
async function refresh(){
 if(pending)return;pending=true;$('market-refresh').disabled=true;
 try{
  const state=load(),world=$('market-world').value;
  if(state.marketWorld&&state.marketWorld!==world)live={};state.marketWorld=world;localStorage.setItem(KEY,JSON.stringify(state));
  const ids={...catalogue,...(state.lootItemIds||{})};
  const inverse=new Map();
  for(const [name,id] of Object.entries(ids))if(Number.isSafeInteger(Number(id))&&Number(id)>0&&!Object.prototype.hasOwnProperty.call(npc,name)){
   const k=Number(id);if(!inverse.has(k))inverse.set(k,[]);inverse.get(k).push(name);
  }
  const keys=[...inverse.keys()];
  if(!keys.length){$('market-status').textContent='目前沒有設定材料的物品 ID。換金飾品已使用 NPC 固定價格。';return}
  let updated=0,unavailable=0;
  for(let i=0;i<keys.length;i+=70){
   const chunk=keys.slice(i,i+70);
   const url='https://universalis.app/api/v2/'+encodeURIComponent(world)+'/'+chunk.join(',')+'?listings=1&entries=0';
   const resp=await fetch(url);
   if(!resp.ok)throw new Error('Universalis HTTP '+resp.status);
   const result=await resp.json();
   const records=result.items||{[String(result.itemID)]:result};
   for(const id of chunk){
    const item=records[String(id)];
    const value=Number(item?.minPriceNQ??item?.minPrice??item?.listings?.[0]?.pricePerUnit);
    for(const n of inverse.get(id)){
     if(Number.isFinite(value)&&value>0){live[n]={price:Math.round(value),source:'Universalis'};updated++}
     else {delete live[n];unavailable++}
    }
   }
  }
  $('market-status').textContent='已更新 '+updated+' 種材料行情，無價格 '+unavailable+' 種。市場售價為參考估值，不代表已售出。';
  window.dispatchEvent(new Event('submarine-prices-updated'));
  redraw();
 }catch(e){$('market-status').textContent='查價失敗：'+e.message+'。已保留手動價格與 NPC 定價。'}
 finally{pending=false;$('market-refresh').disabled=false}
}
const s=load();$('market-world').value=s.marketWorld&&Object.values(worlds).includes(s.marketWorld)?s.marketWorld:'陸行鳥';
$('market-refresh').onclick=refresh;
$('ledger-details').addEventListener('toggle',()=>{if($('ledger-details').open)redraw()});
window.addEventListener('submarine-settlement-saved',redraw);
window.addEventListener('submarine-data-imported',()=>{live={};redraw()});
window.SubmarinePrices={lookup,npc,refresh,itemIds:catalogue};
})();