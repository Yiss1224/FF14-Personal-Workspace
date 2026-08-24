const FISH_METHOD_SOURCE='https://raw.githubusercontent.com/icykoneko/ff14-fish-tracker-app/5b293c630987f816ad76bab52cae2c0d5d016c9a/private/fishData.yaml';
const FISH_METHOD_CACHE_MS=7*24*60*60*1000;
let fishMethodByName=new Map();

function fgEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fgNorm(v){return String(v??'').trim().toLowerCase()}
function fgPathNames(value){
  const out=[];
  const walk=v=>{if(v==null)return;if(Array.isArray(v)){v.forEach(walk);return}if(typeof v==='object'){if(v.name)out.push(String(v.name));return}const s=String(v).trim();if(s)out.push(s)};
  walk(value);return out
}
function fgMethodCache(){return store.get('fishMethodCatalog',null)}
function fgSetMethodData(rows,ts=Date.now()){
  const clean=(Array.isArray(rows)?rows:[]).filter(x=>x&&x.name);
  fishMethodByName=new Map(clean.map(x=>[fgNorm(x.name),x]));
  store.set('fishMethodCatalog',{ts,rows:clean});
  return clean
}
function fgLoadCachedMethodData(){const c=fgMethodCache();if(c?.rows?.length){fishMethodByName=new Map(c.rows.map(x=>[fgNorm(x.name),x]));return c}return null}
async function loadFishMethodData(force=false){
  const status=document.getElementById('fish-method-status'),cached=fgLoadCachedMethodData();
  if(!force&&cached?.ts&&Date.now()-cached.ts<FISH_METHOD_CACHE_MS){if(status)status.textContent=`釣法資料：${cached.rows.length} 筆（快取）`;renderFishCatalog();return cached.rows}
  if(status)status.textContent='正在讀取魚糕釣法資料…';
  try{
    if(!window.jsyaml)throw new Error('YAML parser 尚未載入');
    const r=await fetch(FISH_METHOD_SOURCE,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const text=await r.text(),rows=window.jsyaml.load(text);if(!Array.isArray(rows)||rows.length<100)throw new Error('釣法資料格式異常');
    fgSetMethodData(rows);if(status)status.textContent=`釣法資料已更新：${rows.length} 筆`;renderFishCatalog();return rows
  }catch(e){
    if(status)status.textContent=`釣法資料讀取失敗：${e.message}${cached?.rows?.length?'；沿用舊快取':''}`;
    if(cached?.rows?.length){renderFishCatalog();return cached.rows}return []
  }
}
function fgUniversalMap(){return store.get('fishUniversalLureOverrides',{})||{}}
function fgUniversalState(itemId){return fgUniversalMap()[String(itemId)]||'unknown'}
function fgSetUniversalState(itemId,state){const m=fgUniversalMap();m[String(itemId)]=['yes','no'].includes(state)?state:'unknown';store.set('fishUniversalLureOverrides',m);renderFishCatalog()}
function fgOwnedMap(){return store.get('fishBaitOwned',{})||{}}
function fgSetOwned(name,owned){const m=fgOwnedMap();m[name]=!!owned;store.set('fishBaitOwned',m);renderBaitShoppingList()}
function fgNoteMap(){return store.get('fishBaitNotes',{})||{}}
function fgSetNote(name,note){const m=fgNoteMap();m[name]=String(note||'').trim();store.set('fishBaitNotes',m)}
function fgItemIdMap(){return store.get('fishBaitItemIds',{})||{}}
function fgSetItemId(name,id){const m=fgItemIdMap();m[name]=id;store.set('fishBaitItemIds',m)}
function fgTugText(tug){const t=fgNorm(tug);if(t==='light')return '! 弱咬';if(t==='medium')return '!! 強咬';if(t==='heavy')return '!!! 大咬';return tug?String(tug):'—'}
function fgHookText(h){const t=fgNorm(h);if(t==='precision')return '精準提鉤';if(t==='powerful')return '強力提鉤';return h?String(h):'—'}
function fgTimeText(m){const a=Number(m?.startHour),b=Number(m?.endHour);if(a===0&&b===24)return '全天';if(Number.isFinite(a)&&Number.isFinite(b))return `ET ${a}:00–${b}:00`;return '—'}
function fgWeatherText(m){const prev=Array.isArray(m?.previousWeatherSet)?m.previousWeatherSet.filter(Boolean):[],now=Array.isArray(m?.weatherSet)?m.weatherSet.filter(Boolean):[];if(!prev.length&&!now.length)return '無限制';if(prev.length&&now.length)return `${prev.join('/')} → ${now.join('/')}`;return (now.length?now:prev).join('/')}
function fgLodinnUrl(spot){return `https://lodinn.github.io/biterates?spot=${encodeURIComponent(spot||'')}`}
function fgMethodForName(name){return fishMethodByName.get(fgNorm(name))||null}
function fgFishMetaFromRow(row){
  const name=row.querySelector(':scope > div:first-child > strong')?.textContent?.trim()||'';
  const href=row.querySelector('a[href*="/fish/"]')?.getAttribute('href')||'';
  const match=href.match(/\/fish\/(\d+)/),itemId=match?Number(match[1]):0;
  const catalog=(store.get('fishCatalog',[])||[]).find(x=>Number(x.itemId)===itemId);
  return{name,itemId,catalog}
}
function augmentFishMethodRows(){
  const rows=document.querySelectorAll('#fish-catalog .fish-row');
  rows.forEach(row=>{
    row.querySelector('.fish-method')?.remove();
    const meta=fgFishMetaFromRow(row);if(!meta.name||!meta.itemId||meta.catalog?.type==='spearfishing')return;
    const m=fgMethodForName(meta.name);if(!m)return;
    const path=fgPathNames(m.bestCatchPath),first=path[0]||'未提供',rest=path.slice(1);
    const state=fgUniversalState(meta.itemId),panel=document.createElement('div');panel.className='fish-method';
    const route=rest.length?`${fgEsc(first)} → ${rest.map(fgEsc).join(' → ')} → <strong>${fgEsc(meta.name)}</strong>`:`${fgEsc(first)} → <strong>${fgEsc(meta.name)}</strong>`;
    panel.innerHTML=`<div class="fish-method-grid"><span>🪱 <b>推薦路線</b> ${route}</span><span>🎣 <b>咬鉤</b> ${fgEsc(fgTugText(m.tug))} · ${fgEsc(fgHookText(m.hookset))}</span><span>⏰ <b>時間</b> ${fgEsc(fgTimeText(m))}</span><span>🌦 <b>天氣</b> ${fgEsc(fgWeatherText(m))}</span>${m.snagging===true?'<span>🧲 <b>Snagging</b> ON</span>':''}${m.folklore?'<span>📖 <b>傳承錄</b> 需要</span>':''}<span>⏱ <b>秒數</b> <a href="${fgLodinnUrl(meta.catalog?.spotName||m.location)}" target="_blank" rel="noopener">查此釣點咬鉤統計</a></span></div><label class="universal-lure-select">萬能餌 <select data-fg-universal="${meta.itemId}"><option value="unknown" ${state==='unknown'?'selected':''}>未確認</option><option value="yes" ${state==='yes'?'selected':''}>可用</option><option value="no" ${state==='no'?'selected':''}>不可用／改帶指定餌</option></select></label>`;
    row.querySelector(':scope > div:first-child')?.appendChild(panel)
  });
  document.querySelectorAll('[data-fg-universal]').forEach(s=>s.onchange=()=>fgSetUniversalState(+s.dataset.fgUniversal,s.value))
}
function fgFilteredMissingFish(){
  const catalog=store.get('fishCatalog',[])||[],caught=new Set(getCaughtIds()),skipped=new Set(getSkippedIds()),fl=typeof fishFilters==='function'?fishFilters():{missing:true,hideBig:true,includeSpear:true,hideSkipped:true,q:''};
  let rows=catalog.filter(x=>x.type==='fishing').map(x=>({...x,caught:caught.has(x.itemId),skipped:skipped.has(x.itemId)}));
  if(fl.missing)rows=rows.filter(x=>!x.caught);if(fl.hideBig)rows=rows.filter(x=>!x.bigFish);if(fl.hideSkipped)rows=rows.filter(x=>!x.skipped);
  if(fl.q)rows=rows.filter(x=>[x.name,x.spotName,x.zoneName,x.regionName].some(v=>fgNorm(v).includes(fl.q)));
  return rows
}
function fgBuildBaitGroups(){
  const groups=new Map();
  for(const fish of fgFilteredMissingFish()){
    const m=fgMethodForName(fish.name);if(!m)continue;const path=fgPathNames(m.bestCatchPath),bait=path[0];if(!bait)continue;
    const universal=fgUniversalState(fish.itemId);if(universal==='yes')continue;
    if(!groups.has(bait))groups.set(bait,{name:bait,fish:[],required:0,unknown:0});const g=groups.get(bait);g.fish.push(fish);if(universal==='no')g.required++;else g.unknown++
  }
  return [...groups.values()].sort((a,b)=>b.required-a.required||b.fish.length-a.fish.length||a.name.localeCompare(b.name))
}
async function fgResolveBaitItemId(name){
  const known=Number(fgItemIdMap()[name]);if(known)return known;
  const escaped=String(name).replace(/\\/g,'\\\\').replace(/"/g,'\\"');
  for(const query of [`Name="${escaped}"`,`Name~"${escaped}"`]){
    try{const p=new URLSearchParams({sheets:'Item',query,fields:'Name',language:'en',limit:'10'}),r=await fetch(`${XIVAPI}/search?${p}`);if(!r.ok)continue;const j=await r.json(),results=Array.isArray(j.results)?j.results:[],exact=results.find(x=>fgNorm(x?.fields?.Name)===fgNorm(name))||results[0];if(exact?.row_id){fgSetItemId(name,Number(exact.row_id));return Number(exact.row_id)}}catch{}
  }
  return 0
}
async function fgOpenBaitSource(button,name){
  const win=window.open('about:blank','_blank');button.disabled=true;const old=button.textContent;button.textContent='查詢中…';
  const id=await fgResolveBaitItemId(name);button.disabled=false;button.textContent=old;
  if(id){const url=`https://ffxivteamcraft.com/db/en/item/${id}`;if(win)win.location=url;else window.open(url,'_blank')}
  else{if(win)win.close();button.textContent='找不到資料';setTimeout(()=>button.textContent=old,1800)}
}
function renderBaitShoppingList(){
  const summary=document.getElementById('fish-bait-summary'),box=document.getElementById('fish-bait-list');if(!summary||!box)return;
  if(!fishMethodByName.size){summary.innerHTML='釣法資料尚未載入。';box.innerHTML='';return}
  const groups=fgBuildBaitGroups(),owned=fgOwnedMap(),notes=fgNoteMap(),onlyRequired=document.getElementById('fish-bait-only-required')?.checked??false,show=onlyRequired?groups.filter(g=>g.required>0):groups;
  const requiredFish=groups.reduce((s,g)=>s+g.required,0),unknownFish=groups.reduce((s,g)=>s+g.unknown,0),needBaits=groups.filter(g=>!owned[g.name]).length;
  summary.innerHTML=`目前篩選範圍：<strong>${groups.length}</strong> 種推薦起始餌；未標記持有 ${needBaits} 種。<br><span class="muted">萬能餌已確認不可用：${requiredFish} 隻；尚未確認：${unknownFish} 隻。尚未確認不會被自動判成「萬能餌不可用」。</span>`;
  if(!show.length){box.innerHTML='<div class="empty">目前沒有需要列入購物清單的魚餌。</div>';return}
  box.innerHTML=show.map(g=>{const fishNames=g.fish.slice(0,6).map(x=>fgEsc(x.name)).join('、'),more=g.fish.length>6?`＋${g.fish.length-6}`:'';return `<div class="bait-shopping-row ${owned[g.name]?'bait-owned':''}"><label class="inline-check"><input type="checkbox" data-fg-owned="${fgEsc(g.name)}" ${owned[g.name]?'checked':''}> 已有</label><div class="bait-shopping-main"><strong>${fgEsc(g.name)}</strong><div class="muted">對應 ${g.fish.length} 隻｜明確需要 ${g.required}｜未確認 ${g.unknown}<br>${fishNames}${more}</div><input class="bait-note" data-fg-note="${fgEsc(g.name)}" value="${fgEsc(notes[g.name]||'')}" placeholder="NPC／地點／取得方式備註"></div><button data-fg-source="${fgEsc(g.name)}">查取得方式</button></div>`}).join('');
  box.querySelectorAll('[data-fg-owned]').forEach(x=>x.onchange=()=>fgSetOwned(x.dataset.fgOwned,x.checked));
  box.querySelectorAll('[data-fg-note]').forEach(x=>x.onchange=()=>fgSetNote(x.dataset.fgNote,x.value));
  box.querySelectorAll('[data-fg-source]').forEach(b=>b.onclick=()=>fgOpenBaitSource(b,b.dataset.fgSource))
}
function renderFishingGuideLayer(){augmentFishMethodRows();renderBaitShoppingList()}

const fgBaseRenderFishCatalog=renderFishCatalog;
renderFishCatalog=function(){fgBaseRenderFishCatalog();queueMicrotask(renderFishingGuideLayer)};

window.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('refresh-fish-methods')?.addEventListener('click',()=>loadFishMethodData(true));
  document.getElementById('fish-bait-only-required')?.addEventListener('change',renderBaitShoppingList);
  fgLoadCachedMethodData();loadFishMethodData(false);renderFishingGuideLayer()
});
window.renderFishingGuide=()=>{fgLoadCachedMethodData();renderFishingGuideLayer()};
