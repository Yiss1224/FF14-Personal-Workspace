const FISH_METHOD_SOURCE='https://raw.githubusercontent.com/icykoneko/ff14-fish-tracker-app/5b293c630987f816ad76bab52cae2c0d5d016c9a/private/fishData.yaml';
const FISH_METHOD_CACHE_MS=7*24*60*60*1000;
const GARLAND_ITEM_BASE='https://www.garlandtools.org/db/doc/item/en/3';
const GARLAND_CORE_URL='https://www.garlandtools.org/db/doc/core/en/3/data.json';
const LODINN_ASSET_BASE='https://lodinn.github.io/assets';
const BAIT_SOURCE_CACHE_MS=30*24*60*60*1000;
const BITE_SPOT_CACHE_MS=14*24*60*60*1000;
let fishMethodByName=new Map();
let garlandPlaceMap=null;
const biteSpotMemory=new Map();

function fgUiPref(key,def){const v=store.get(key,null);return v===null?def:!!v}
function fgEnsureUi(){
  const refresh=document.getElementById('refresh-fish-methods');
  if(refresh&&!document.getElementById('load-visible-bite-times')){const b=document.createElement('button');b.id='load-visible-bite-times';b.textContent='載入目前畫面秒數';refresh.insertAdjacentElement('afterend',b)}
  const toolbar=document.querySelector('.bait-toolbar');
  const required=document.getElementById('fish-bait-only-required');
  if(required){required.checked=fgUiPref('fishBaitOnlyRequired',true);const text=required.parentElement;if(text)text.lastChild.textContent=' 購物清單只看「已確認萬能餌不可用」'}
  if(toolbar&&!document.getElementById('resolve-bait-sources')){const b=document.createElement('button');b.id='resolve-bait-sources';b.textContent='解析購物清單 NPC';toolbar.appendChild(b)}
  const baitList=document.getElementById('fish-bait-list');
  if(baitList&&!document.getElementById('fish-vendor-plan')){const v=document.createElement('div');v.id='fish-vendor-plan';v.className='result vendor-plan';baitList.insertAdjacentElement('afterend',v)}
  const catalog=document.getElementById('fish-catalog');
  if(catalog&&!document.getElementById('fish-route-result')){const section=document.createElement('div');section.className='fishing-route-section';section.innerHTML=`<div class="section-head"><div><h3>掃圖路線</h3><p class="hint">依目前篩選、萬能餌判定與你已備的指定餌，先排「能直接處理最多缺魚」的釣點。</p></div><button id="refresh-route-plan">重算路線</button></div><div class="bait-toolbar"><label class="inline-check"><input id="fish-route-ready-only" type="checkbox"> 只看餌已備妥的釣點</label></div><div id="fish-route-result" class="result"></div>`;catalog.insertAdjacentElement('beforebegin',section);const ready=document.getElementById('fish-route-ready-only');if(ready)ready.checked=fgUiPref('fishRouteReadyOnly',false)}
}

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
function fgSetUniversalState(itemId,state){const m=fgUniversalMap();m[String(itemId)]=['yes','no'].includes(state)?state:'unknown';store.set('fishUniversalLureOverrides',m);renderFishCatalog();renderRoutePlanner()}
function fgOwnedMap(){return store.get('fishBaitOwned',{})||{}}
function fgSetOwned(name,owned){const m=fgOwnedMap();m[name]=!!owned;store.set('fishBaitOwned',m);renderBaitShoppingList();renderRoutePlanner()}
function fgNoteMap(){return store.get('fishBaitNotes',{})||{}}
function fgSetNote(name,note){const m=fgNoteMap();m[name]=String(note||'').trim();store.set('fishBaitNotes',m)}
function fgItemIdMap(){return store.get('fishBaitItemIds',{})||{}}
function fgSetItemId(name,id){const m=fgItemIdMap();m[name]=id;store.set('fishBaitItemIds',m)}
function fgSourceCache(){return store.get('fishBaitSourceCache',{})||{}}
function fgSetSourceCache(name,value){const m=fgSourceCache();m[name]={...value,ts:Date.now()};store.set('fishBaitSourceCache',m)}
function fgBiteOverrideMap(){return store.get('fishBiteTimeOverrides',{})||{}}
function fgBiteOverride(itemId){return fgBiteOverrideMap()[String(itemId)]||''}
function fgSetBiteOverride(itemId,value){const m=fgBiteOverrideMap(),v=String(value||'').trim();if(v)m[String(itemId)]=v;else delete m[String(itemId)];store.set('fishBiteTimeOverrides',m);renderFishCatalog()}

function fgTugText(tug){const t=fgNorm(tug);if(t==='light')return '! 弱咬';if(t==='medium')return '!! 強咬';if(t==='heavy'||t==='legendary')return '!!! 大咬';return tug?String(tug):'—'}
function fgHookText(h){const t=fgNorm(h);if(t==='precision')return '精準提鉤';if(t==='powerful')return '強力提鉤';return h?String(h):'—'}
function fgTimeText(m){const a=Number(m?.startHour),b=Number(m?.endHour);if(a===0&&b===24)return '全天';if(Number.isFinite(a)&&Number.isFinite(b))return `ET ${String(a).padStart(2,'0')}:00–${String(b).padStart(2,'0')}:00`;return '—'}
function fgWeatherText(m){const prev=Array.isArray(m?.previousWeatherSet)?m.previousWeatherSet.filter(Boolean):[],now=Array.isArray(m?.weatherSet)?m.weatherSet.filter(Boolean):[];if(!prev.length&&!now.length)return '無限制';if(prev.length&&now.length)return `${prev.join('/')} → ${now.join('/')}`;return (now.length?now:prev).join('/')}
function fgLodinnUrl(spot){return `https://lodinn.github.io/biterates?spot=${encodeURIComponent(spot||'')}`}
function fgMethodForName(name){return fishMethodByName.get(fgNorm(name))||null}
function fgCatalogLocations(fish){if(!fish)return[];if(typeof window.fishLocations==='function')return window.fishLocations(fish);return Array.isArray(fish.spots)&&fish.spots.length?fish.spots:[fish]}
function fgRowSpotName(row){const small=row?.querySelector?.(':scope > div:first-child > small')?.textContent||'',parts=small.split('/').map(x=>x.trim()).filter(Boolean);return parts[parts.length-1]||''}
function fgCatalogAtRow(itemId,row){const fish=(store.get('fishCatalog',[])||[]).find(x=>Number(x.itemId)===Number(itemId));if(!fish)return null;const shown=fgRowSpotName(row),locations=fgCatalogLocations(fish),tc=v=>{try{return typeof window.ff14TcText==='function'?window.ff14TcText(v):String(v||'')}catch{return String(v||'')}};const loc=locations.find(x=>String(x.spotName||'')===shown||tc(x.spotName)===shown)||locations[0];return loc?{...fish,...loc}:fish}
function fgFishMetaFromRow(row){
  const name=row.querySelector(':scope > div:first-child > strong')?.textContent?.trim()||'';
  const href=row.querySelector('a[href*="/fish/"]')?.getAttribute('href')||'';
  const match=href.match(/\/fish\/(\d+)/),itemId=match?Number(match[1]):0;
  const catalog=fgCatalogAtRow(itemId,row);
  return{name,itemId,catalog}
}

async function fgLoadBiteSpot(spotId,force=false){
  const key=Number(spotId),entry=biteSpotMemory.get(key);
  if(!force&&entry?.data&&entry.ts&&Date.now()-entry.ts<BITE_SPOT_CACHE_MS)return entry.data;
  const r=await fetch(`${LODINN_ASSET_BASE}/spot_data/${key}.json`,{cache:'no-store'});if(!r.ok)throw new Error(`Lodinn ${r.status}`);
  const data=await r.json();biteSpotMemory.set(key,{ts:Date.now(),data});return data
}
function fgRoundHalf(n){return Math.round(Number(n)*2)/2}
function fgAggregateBite(data,baitId,fishId){
  if(!data?.rates)return null;let weightedLow=0,weightedHigh=0,samples=0,catches=0,misses=0;
  for(const patch of Object.keys(data.rates||{})){
    const perBait=data.rates[patch]?.[String(baitId)]??data.rates[patch]?.[Number(baitId)];if(!perBait)continue;
    const f=perBait[String(fishId)]??perBait[Number(fishId)];if(!f)continue;
    const c=Number(f.catches)||0,m=Number(f.bayesian_misses)||0;catches+=c;misses+=m;
    if(Number.isFinite(Number(f.bitetime_low))&&Number.isFinite(Number(f.bitetime_high))&&c>0){weightedLow+=Number(f.bitetime_low)*c;weightedHigh+=Number(f.bitetime_high)*c;samples+=c}
  }
  if(samples<=0)return null;return{low:fgRoundHalf(weightedLow/samples),high:fgRoundHalf(weightedHigh/samples),samples,catches,misses,baitId:Number(baitId)}
}
function fgBestAvailableBite(data,fishId,preferredBaitId){
  if(preferredBaitId){const exact=fgAggregateBite(data,preferredBaitId,fishId);if(exact)return exact}
  const baitIds=new Set();for(const patch of Object.values(data?.rates||{}))for(const baitId of Object.keys(patch||{}))if((patch[baitId]||{})[String(fishId)])baitIds.add(baitId);
  let best=null;for(const baitId of baitIds){const x=fgAggregateBite(data,baitId,fishId);if(x&&(!best||x.samples>best.samples))best=x}return best
}
function fgFormatBiteStat(stat,data){if(!stat)return '無社群秒數資料';const baitName=data?.bait?.[String(stat.baitId)]?.name||data?.bait?.[stat.baitId]?.name||'';return `${stat.low}–${stat.high}s${baitName?`（${baitName}）`:''} · ${Math.round(stat.samples)} 筆`}
async function fgLoadFishBite(button,itemId,spotId,baitName,force=false){
  const status=button?.closest('.fish-method')?.querySelector('.fish-bite-value');if(status)status.textContent='載入中…';if(button)button.disabled=true;
  try{const baitId=await fgResolveBaitItemId(baitName),data=await fgLoadBiteSpot(spotId,force),stat=fgBestAvailableBite(data,itemId,baitId);if(status)status.textContent=fgFormatBiteStat(stat,data)}catch(e){if(status)status.textContent=`讀取失敗：${e.message}`}
  if(button)button.disabled=false
}
async function fgLoadVisibleBiteTimes(){
  const btn=document.getElementById('load-visible-bite-times'),status=document.getElementById('fish-method-status');if(btn)btn.disabled=true;
  const rows=[...document.querySelectorAll('#fish-catalog .fish-row')].slice(0,60),tasks=[];
  for(const row of rows){const meta=fgFishMetaFromRow(row),m=fgMethodForName(meta.name),bait=fgPathNames(m?.bestCatchPath)[0];if(!meta.itemId||!meta.catalog?.spotId||!bait)continue;tasks.push({row,itemId:meta.itemId,spotId:meta.catalog.spotId,bait})}
  const spots=[...new Set(tasks.map(x=>x.spotId))].slice(0,30);if(status)status.textContent=`正在載入目前畫面秒數：${spots.length} 個釣點…`;
  for(const spotId of spots){try{await fgLoadBiteSpot(spotId,false)}catch{}await new Promise(r=>setTimeout(r,80))}
  for(const t of tasks){const cache=biteSpotMemory.get(Number(t.spotId))?.data;if(!cache)continue;const baitId=await fgResolveBaitItemId(t.bait),stat=fgBestAvailableBite(cache,t.itemId,baitId),el=t.row.querySelector('.fish-bite-value');if(el)el.textContent=fgFormatBiteStat(stat,cache)}
  if(status)status.textContent=`秒數已嘗試載入：${spots.length} 個釣點（最多處理目前前 30 個釣點）`;if(btn)btn.disabled=false
}

function augmentFishMethodRows(){
  const rows=document.querySelectorAll('#fish-catalog .fish-row');
  rows.forEach(row=>{
    row.querySelector('.fish-method')?.remove();
    const meta=fgFishMetaFromRow(row);if(!meta.name||!meta.itemId||meta.catalog?.type==='spearfishing')return;
    const m=fgMethodForName(meta.name);if(!m)return;
    const path=fgPathNames(m.bestCatchPath),first=path[0]||'未提供',rest=path.slice(1),state=fgUniversalState(meta.itemId),manual=fgBiteOverride(meta.itemId),spotId=Number(meta.catalog?.spotId)||0,panel=document.createElement('div');panel.className='fish-method';
    const route=rest.length?`${fgEsc(first)} → ${rest.map(fgEsc).join(' → ')} → <strong>${fgEsc(meta.name)}</strong>`:`${fgEsc(first)} → <strong>${fgEsc(meta.name)}</strong>`;
    const cachedBite=spotId?biteSpotMemory.get(Number(spotId))?.data:null;
    panel.innerHTML=`<div class="fish-method-grid"><span>🪱 <b>推薦路線</b> ${route}</span><span>🎣 <b>咬鉤</b> ${fgEsc(fgTugText(m.tug))} · ${fgEsc(fgHookText(m.hookset))}</span><span>⏰ <b>時間</b> ${fgEsc(fgTimeText(m))}</span><span>🌦 <b>天氣</b> ${fgEsc(fgWeatherText(m))}</span>${m.snagging===true?'<span>🧲 <b>Snagging</b> ON</span>':''}${m.folklore?'<span>📖 <b>傳承錄</b> 需要</span>':''}<span class="fish-bite-line">⏱ <b>秒數</b> <span class="fish-bite-value">${manual?`${fgEsc(manual)}（手動）`:(cachedBite?'已載入釣點資料，按「算秒數」':'尚未載入')}</span> ${spotId&&first!=='未提供'?`<button class="mini-btn" data-fg-bite="${meta.itemId}" data-fg-spot="${spotId}" data-fg-bait="${fgEsc(first)}">算秒數</button>`:''} <button class="mini-btn" data-fg-bite-edit="${meta.itemId}">手動</button> <a href="${fgLodinnUrl(meta.catalog?.spotName||m.location)}" target="_blank" rel="noopener">Lodinn</a></span></div><label class="universal-lure-select">萬能餌 <select data-fg-universal="${meta.itemId}"><option value="unknown" ${state==='unknown'?'selected':''}>未確認／先試萬能餌</option><option value="yes" ${state==='yes'?'selected':''}>可用</option><option value="no" ${state==='no'?'selected':''}>不可用／要指定餌</option></select></label>`;
    row.querySelector(':scope > div:first-child')?.appendChild(panel)
  });
  document.querySelectorAll('[data-fg-universal]').forEach(s=>s.onchange=()=>fgSetUniversalState(+s.dataset.fgUniversal,s.value));
  document.querySelectorAll('[data-fg-bite]').forEach(b=>b.onclick=()=>fgLoadFishBite(b,+b.dataset.fgBite,+b.dataset.fgSpot,b.dataset.fgBait,false));
  document.querySelectorAll('[data-fg-bite-edit]').forEach(b=>b.onclick=()=>{const id=+b.dataset.fgBiteEdit,cur=fgBiteOverride(id),v=prompt('手動秒數，例如 8–12s；留空可清除手動值',cur);if(v!==null)fgSetBiteOverride(id,v)})
}

function fgFilteredMissingFish(){
  const catalog=store.get('fishCatalog',[])||[],caught=new Set(getCaughtIds()),skipped=new Set(getSkippedIds()),fl=typeof fishFilters==='function'?fishFilters():{missing:true,hideBig:true,includeSpear:true,hideSkipped:true,q:''};
  let rows=catalog.filter(x=>x.type==='fishing').map(x=>({...x,caught:caught.has(x.itemId),skipped:skipped.has(x.itemId)}));
  if(fl.missing)rows=rows.filter(x=>!x.caught);if(fl.hideBig)rows=rows.filter(x=>!x.bigFish);if(fl.hideSkipped)rows=rows.filter(x=>!x.skipped);
  if(fl.q)rows=rows.filter(x=>[x.name,...fgCatalogLocations(x).flatMap(loc=>[loc.spotName,loc.zoneName,loc.regionName])].some(v=>fgNorm(v).includes(fl.q)));
  return rows
}
function fgFishPrep(fish){
  const m=fgMethodForName(fish.name),path=fgPathNames(m?.bestCatchPath),bait=path[0]||'',universal=fgUniversalState(fish.itemId),owned=fgOwnedMap();
  if(universal==='yes')return{ready:true,mode:'萬能餌',bait,universal,path};
  if(universal==='no')return{ready:!!(bait&&owned[bait]),mode:bait&&owned[bait]?'指定餌已備':'缺指定餌',bait,universal,path};
  return{ready:true,mode:'先試萬能餌',bait,universal,path}
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

function fgIndexGarlandPlaces(root){
  const out=new Map(),seen=new Set();
  const walk=v=>{if(v==null||typeof v!=='object'||seen.has(v))return;seen.add(v);if(Array.isArray(v)){v.forEach(walk);return}const id=Number(v.i??v.id),name=v.n??v.name;if(Number.isFinite(id)&&typeof name==='string'&&name.trim())out.set(id,name.trim());for(const [k,x] of Object.entries(v)){if(/^\d+$/.test(k)&&typeof x==='string')out.set(Number(k),x);else walk(x)}};
  walk(root);return out
}
async function fgLoadGarlandCore(){
  if(garlandPlaceMap)return garlandPlaceMap;
  try{const r=await fetch(GARLAND_CORE_URL,{cache:'force-cache'});if(!r.ok)throw new Error(`Garland core ${r.status}`);const j=await r.json();garlandPlaceMap=fgIndexGarlandPlaces(j);return garlandPlaceMap}catch{garlandPlaceMap=new Map();return garlandPlaceMap}
}
function fgCoords(c){if(Array.isArray(c)&&c.length>=2){const x=Number(c[0]),y=Number(c[1]);if(Number.isFinite(x)&&Number.isFinite(y))return `${x.toFixed(1)}, ${y.toFixed(1)}`}if(c&&typeof c==='object'){const x=c.x??c.X??c[0],y=c.y??c.Y??c[1];if(Number.isFinite(Number(x))&&Number.isFinite(Number(y)))return `${Number(x).toFixed(1)}, ${Number(y).toFixed(1)}`}return''}
async function fgFetchBaitSource(name,force=false){
  const cached=fgSourceCache()[name];if(!force&&cached?.ts&&Date.now()-cached.ts<BAIT_SOURCE_CACHE_MS)return cached;
  const id=await fgResolveBaitItemId(name);if(!id)throw new Error('找不到 Item ID');
  const [core,r]=await Promise.all([fgLoadGarlandCore(),fetch(`${GARLAND_ITEM_BASE}/${id}.json`,{cache:'force-cache'})]);if(!r.ok)throw new Error(`Garland ${r.status}`);const j=await r.json(),item=j.item||{},partials=Array.isArray(j.partials)?j.partials:[],npcMap=new Map(partials.filter(x=>x.type==='npc').map(x=>[Number(x.id),x.obj||{}]));
  const npcInfo=npcId=>{const n=npcMap.get(Number(npcId))||{},areaId=Number(n.a??n.area??0)||0;return{id:Number(n.i??npcId)||Number(npcId),name:n.n||`NPC ${npcId}`,title:n.t||'',areaId,area:core.get(areaId)||'',coords:fgCoords(n.c)}};
  const vendors=[...new Set((item.vendors||[]).map(Number).filter(Boolean))].map(npcInfo);
  const tradeShops=(item.tradeShops||[]).map(s=>({shop:s.shop||'特殊商店',npcs:(s.npcs||[]).map(npcInfo),listings:s.listings||[]}));
  const source={id,name:item.name||name,price:Number(item.price)||0,vendors,tradeShops,craftCount:Array.isArray(item.craft)?item.craft.length:0,nodeCount:Array.isArray(item.nodes)?item.nodes.length:0,reducedCount:Array.isArray(item.reducedFrom)?item.reducedFrom.length:0,dropCount:Array.isArray(item.drops)?item.drops.length:0};fgSetSourceCache(name,source);return source
}
function fgSourceSummaryHtml(src){
  if(!src)return'<span class="muted">尚未解析。</span>';
  const parts=[];
  if(src.vendors?.length){parts.push(`<div><b>Gil 商店${src.price?` · ${Number(src.price).toLocaleString('zh-TW')} Gil`:''}</b>${src.vendors.map(v=>`<div>• ${fgEsc(v.name)}${v.title?` &lt;${fgEsc(v.title)}&gt;`:''}${v.area?` · ${fgEsc(v.area)}`:''}${v.coords?` X/Y ${fgEsc(v.coords)}`:''}</div>`).join('')}</div>`)}
  if(src.tradeShops?.length){parts.push(`<div><b>特殊商店</b>${src.tradeShops.map(s=>`<div>• ${fgEsc(s.shop)}${s.npcs?.length?` · ${s.npcs.map(n=>`${fgEsc(n.name)}${n.area?` / ${fgEsc(n.area)}`:''}`).join('、')}`:''}</div>`).join('')}</div>`)}
  const other=[];if(src.craftCount)other.push(`製作 ${src.craftCount}`);if(src.nodeCount)other.push(`採集 ${src.nodeCount}`);if(src.reducedCount)other.push(`精選 ${src.reducedCount}`);if(src.dropCount)other.push(`掉落 ${src.dropCount}`);if(other.length)parts.push(`<div><b>其他來源</b> ${other.join(' / ')}</div>`);
  if(!parts.length)parts.push('<div class="muted">Garland 沒列到一般 NPC 商店；可能是市場、特殊取得或資料缺漏。</div>');
  return parts.join('')
}
async function fgLoadSourceIntoRow(button,name,force=false){
  const row=button.closest('.bait-shopping-row'),box=row?.querySelector('.bait-source-detail');if(box)box.innerHTML='解析中…';button.disabled=true;
  try{const src=await fgFetchBaitSource(name,force);if(box)box.innerHTML=fgSourceSummaryHtml(src);renderVendorPlan()}catch(e){if(box)box.innerHTML=`<span class="muted">解析失敗：${fgEsc(e.message)}。可先用 Teamcraft / Garland 查。</span>`}button.disabled=false
}
async function fgResolveShoppingSources(){
  const btn=document.getElementById('resolve-bait-sources'),groups=fgShoppingGroupsToShow().filter(g=>!fgOwnedMap()[g.name]);if(btn)btn.disabled=true;
  for(let i=0;i<groups.length;i++){if(btn)btn.textContent=`解析中 ${i+1}/${groups.length}`;try{await fgFetchBaitSource(groups[i].name,false)}catch{}await new Promise(r=>setTimeout(r,180))}
  if(btn){btn.disabled=false;btn.textContent='解析購物清單 NPC'}renderBaitShoppingList();renderVendorPlan()
}
function fgShoppingGroupsToShow(){const groups=fgBuildBaitGroups(),onlyRequired=document.getElementById('fish-bait-only-required')?.checked??fgUiPref('fishBaitOnlyRequired',true);return onlyRequired?groups.filter(g=>g.required>0):groups}
function renderBaitShoppingList(){
  const summary=document.getElementById('fish-bait-summary'),box=document.getElementById('fish-bait-list');if(!summary||!box)return;
  if(!fishMethodByName.size){summary.innerHTML='釣法資料尚未載入。';box.innerHTML='';return}
  const groups=fgBuildBaitGroups(),owned=fgOwnedMap(),notes=fgNoteMap(),show=fgShoppingGroupsToShow(),requiredFish=groups.reduce((s,g)=>s+g.required,0),unknownFish=groups.reduce((s,g)=>s+g.unknown,0),needBaits=show.filter(g=>!owned[g.name]).length,sourceCache=fgSourceCache();
  summary.innerHTML=`目前篩選範圍：<strong>${groups.length}</strong> 種推薦起始餌；購物清單顯示 ${show.length} 種，未標記持有 ${needBaits} 種。<br><span class="muted">萬能餌已確認不可用：${requiredFish} 隻；尚未確認：${unknownFish} 隻。未確認預設當作「先試萬能餌」，不會硬判成一定要買。</span>`;
  if(!show.length){box.innerHTML='<div class="empty">目前沒有需要列入購物清單的魚餌。</div>';renderVendorPlan();return}
  box.innerHTML=show.map(g=>{const fishNames=g.fish.slice(0,6).map(x=>fgEsc(x.name)).join('、'),more=g.fish.length>6?`＋${g.fish.length-6}`:'',src=sourceCache[g.name];return `<div class="bait-shopping-row ${owned[g.name]?'bait-owned':''}" data-bait-name="${fgEsc(g.name)}"><label class="inline-check"><input type="checkbox" data-fg-owned="${fgEsc(g.name)}" ${owned[g.name]?'checked':''}> 已有</label><div class="bait-shopping-main"><strong>${fgEsc(g.name)}</strong><div class="muted">對應 ${g.fish.length} 隻｜明確需要 ${g.required}｜未確認 ${g.unknown}<br>${fishNames}${more}</div><input class="bait-note" data-fg-note="${fgEsc(g.name)}" value="${fgEsc(notes[g.name]||'')}" placeholder="自己的備註"></div><div class="bait-source-actions"><button data-fg-source="${fgEsc(g.name)}">${src?'重新解析':'查 NPC／取得方式'}</button>${src?.id?`<a href="https://ffxivteamcraft.com/db/en/item/${src.id}" target="_blank" rel="noopener">Teamcraft</a><a href="https://garlandtools.org/db/#item/${src.id}" target="_blank" rel="noopener">Garland</a>`:''}</div><div class="bait-source-detail">${src?fgSourceSummaryHtml(src):'<span class="muted">尚未解析取得方式。</span>'}</div></div>`}).join('');
  box.querySelectorAll('[data-fg-owned]').forEach(x=>x.onchange=()=>fgSetOwned(x.dataset.fgOwned,x.checked));
  box.querySelectorAll('[data-fg-note]').forEach(x=>x.onchange=()=>fgSetNote(x.dataset.fgNote,x.value));
  box.querySelectorAll('[data-fg-source]').forEach(b=>b.onclick=()=>fgLoadSourceIntoRow(b,b.dataset.fgSource,true));renderVendorPlan()
}

function fgVendorCandidates(){
  const owned=fgOwnedMap(),groups=fgShoppingGroupsToShow().filter(g=>!owned[g.name]),cache=fgSourceCache(),vendors=new Map();
  for(const g of groups){const src=cache[g.name];if(!src)continue;for(const v of src.vendors||[]){const key=`${v.id}|${v.area}|${v.coords}`;if(!vendors.has(key))vendors.set(key,{...v,baits:[]});vendors.get(key).baits.push(g.name)}for(const shop of src.tradeShops||[])for(const v of shop.npcs||[]){const key=`trade:${shop.shop}|${v.id}|${v.area}`;if(!vendors.has(key))vendors.set(key,{...v,shop:shop.shop,baits:[]});vendors.get(key).baits.push(g.name)}}
  return [...vendors.values()].sort((a,b)=>b.baits.length-a.baits.length||String(a.area).localeCompare(String(b.area)))
}
function renderVendorPlan(){
  const box=document.getElementById('fish-vendor-plan');if(!box)return;const c=fgVendorCandidates();if(!c.length){box.innerHTML='<span class="muted">解析魚餌來源後，這裡會把能一次買多種餌的 NPC 排前面。</span>';return}
  box.innerHTML=`<div class="vendor-plan-title">採買點合併</div>${c.slice(0,8).map(v=>`<div class="vendor-plan-row"><strong>${fgEsc(v.name)}</strong>${v.shop?` · ${fgEsc(v.shop)}`:''}${v.area?` · ${fgEsc(v.area)}`:''}${v.coords?` · X/Y ${fgEsc(v.coords)}`:''}<span class="badge">可處理 ${v.baits.length} 種</span><div class="muted">${v.baits.map(fgEsc).join('、')}</div></div>`).join('')}`
}

function fgBuildSpotPlan(){
  const owned=fgOwnedMap(),spots=new Map(),base=fgFilteredMissingFish(),rows=typeof window.expandFishLocations==='function'?window.expandFishLocations(base):base.flatMap(fish=>fgCatalogLocations(fish).map(loc=>({...fish,...loc})));
  for(const fish of rows){
    const prep=fgFishPrep(fish),key=`${fish.spotId}|||${fish.spotName}|||${fish.zoneName}`;if(!spots.has(key))spots.set(key,{spotId:fish.spotId,spotName:fish.spotName,zoneName:fish.zoneName,regionName:fish.regionName,fish:[],ready:0,blocked:0,unknown:0,missingBaits:new Set()});const s=spots.get(key);s.fish.push({...fish,prep});if(prep.universal==='unknown')s.unknown++;if(prep.ready)s.ready++;else{s.blocked++;if(prep.bait&&!owned[prep.bait])s.missingBaits.add(prep.bait)}
  }
  return [...spots.values()].sort((a,b)=>b.ready-a.ready||a.blocked-b.blocked||b.fish.length-a.fish.length||a.spotName.localeCompare(b.spotName))
}
function renderRoutePlanner(){
  const box=document.getElementById('fish-route-result');if(!box)return;if(!fishMethodByName.size){box.innerHTML='釣法資料尚未載入。';return}const spots=fgBuildSpotPlan();if(!spots.length){box.innerHTML='目前篩選範圍沒有待處理的一般釣魚。';return}
  const readyOnly=document.getElementById('fish-route-ready-only')?.checked??false,show=(readyOnly?spots.filter(s=>s.blocked===0):spots).slice(0,12);
  box.innerHTML=`<div class="route-summary"><strong>推薦先跑：${fgEsc(show[0]?.spotName||'—')}</strong><span class="muted">排序先看「可直接處理的缺魚數」，再避開缺指定餌的點。未確認萬能餌者視為先試萬能餌。</span></div>${show.map((s,i)=>`<div class="route-row"><div class="route-rank">${i+1}</div><div><strong>${fgEsc(s.spotName)}</strong><div class="muted">${fgEsc(s.zoneName)} · ${fgEsc(s.regionName||'')}</div><div class="route-tags"><span class="tag">缺 ${s.fish.length}</span><span class="tag">可直接 ${s.ready}</span>${s.unknown?`<span class="tag">先試萬能 ${s.unknown}</span>`:''}${s.blocked?`<span class="tag warn">缺餌卡住 ${s.blocked}</span>`:'<span class="tag goodtag">餌已備妥</span>'}</div>${s.missingBaits.size?`<div class="muted">要先補：${[...s.missingBaits].map(fgEsc).join('、')}</div>`:''}</div><button data-fg-spot-filter="${fgEsc(s.spotName)}">只看這點</button></div>`).join('')||'<div class="empty">沒有符合條件的釣點。</div>'}`;
  box.querySelectorAll('[data-fg-spot-filter]').forEach(b=>b.onclick=()=>{const q=document.getElementById('fish-search');if(q){q.value=b.dataset.fgSpotFilter;renderFishCatalog();document.getElementById('fish-catalog')?.scrollIntoView({behavior:'smooth',block:'start'})}})
}

function renderFishingGuideLayer(){augmentFishMethodRows();renderBaitShoppingList();renderRoutePlanner()}
const fgBaseRenderFishCatalog=renderFishCatalog;
renderFishCatalog=function(){fgBaseRenderFishCatalog();queueMicrotask(renderFishingGuideLayer)};

window.addEventListener('DOMContentLoaded',()=>{
  fgEnsureUi();
  document.getElementById('refresh-fish-methods')?.addEventListener('click',()=>loadFishMethodData(true));
  document.getElementById('load-visible-bite-times')?.addEventListener('click',fgLoadVisibleBiteTimes);
  document.getElementById('fish-bait-only-required')?.addEventListener('change',e=>{store.set('fishBaitOnlyRequired',e.target.checked);renderBaitShoppingList();renderVendorPlan()});
  document.getElementById('resolve-bait-sources')?.addEventListener('click',fgResolveShoppingSources);
  document.getElementById('refresh-route-plan')?.addEventListener('click',renderRoutePlanner);
  document.getElementById('fish-route-ready-only')?.addEventListener('change',e=>{store.set('fishRouteReadyOnly',e.target.checked);renderRoutePlanner()});
  fgLoadCachedMethodData();loadFishMethodData(false);renderFishingGuideLayer()
});
window.renderFishingGuide=()=>{fgLoadCachedMethodData();renderFishingGuideLayer()};
