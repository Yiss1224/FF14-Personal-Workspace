// 魚圖鑑資料：向 XIVAPI 下載釣魚／刺魚圖鑑與釣點，整理後存進 localStorage 的 fishCatalog。
// 這支只管「資料」：下載、合併、快取是否過期、舊快取的修復。畫面由其他 fishing-*.js 負責。
//
// 對外：
//   window.refreshFishCatalog(force)   重新整理圖鑑（主圖鑑 + 刺魚）；force=true 不看快取
//   window.fishLocations(fish) / window.expandFishLocations(rows)
//   window.FF14FishCatalog             其餘工具（uniqueFishCount 等）
//   window.__fishCatalogState          'loading' | 'ready' | 'failed'，別的區塊用來判斷要不要等
//   資料更新後會呼叫 window.renderFishCatalog() 與 window.refreshFishingPicker()（fishing-browse.js）
//
// localStorage：fishCatalog、fishCatalogUpdatedAt、fishCatalogSchema、fishSpearCatalogSchema、fishCatalogMapGroupingVersion
//
// fishCatalog 的每一筆：{rowId,itemId,type:'fishing'|'spearfishing',name,bigFish,hidden,
//                        spotId,spotName,zoneName,regionName,x,y,          ← 主釣點
//                        spots:[{spotId,spotName,zoneName,regionName,x,y}]} ← 所有釣點
// zoneName 是遊戲裡實際的地圖名，regionName 是它上一層的區域。
(function(){
  'use strict';

  const XIVAPI='https://v2.xivapi.com/api';
  const CACHE_MS=7*24*60*60*1000;
  const CATALOG_SCHEMA=3;             // 3：舊版刺魚修補把圖鑑蓋成只剩刺魚，強制重抓一次
  const SPEAR_SCHEMA=2;               // 2：刺魚的地圖改用 TerritoryType.PlaceName
  const MAP_GROUPING='map-groups-v1'; // 釣點改依實際地圖分組；沒有這個標記的舊快取要重抓一次
  const MAP_GROUPING_KEY='fishCatalogMapGroupingVersion';

  const shared=window.FF14Fishing;
  const read=shared.read;
  function write(key,value){localStorage.setItem(key,JSON.stringify(value))}
  function status(text){const el=document.getElementById('fish-catalog-status');if(el)el.textContent=text}

  // ---- XIVAPI 資料列的小工具 ----
  function relId(v){return Number(v?.row_id??v?.rowId??v?.value??0)||0}
  function relFields(v){return v?.fields||{}}
  function nameOf(v){return String(relFields(v).Name??v?.Name??'').trim()}
  // 地名欄位偶爾會拿到純數字（關聯沒展開），那種不算名字。
  function placeName(v){const s=nameOf(v);return s&&!/^\d+$/.test(s)?s:''}

  async function fetchSheetRows(sheet,fields){
    let after=null,rows=[],guard=0;
    while(guard++<50){
      const p=new URLSearchParams({fields,language:'en',limit:'500'});
      if(after!==null)p.set('after',String(after));
      const res=await fetch(`${XIVAPI}/sheet/${sheet}?${p}`);
      if(!res.ok)throw new Error(`${sheet} API ${res.status}`);
      const json=await res.json(),batch=Array.isArray(json.rows)?json.rows:[];
      if(!batch.length)break;
      rows.push(...batch);
      const last=Number(batch[batch.length-1].row_id);
      if(!Number.isFinite(last)||last===after)break;
      after=last;
    }
    return rows;
  }

  // ---- 釣點 ----
  // 釣魚：TerritoryType.PlaceName 是實際地圖，PlaceNameZone／PlaceNameRegion 是上層區域。
  function locationParts(spot){
    const sf=relFields(spot),tf=relFields(sf.TerritoryType);
    return{
      spotId:relId(spot),
      spotName:placeName(sf.PlaceName)||placeName(sf.PlaceNameSub)||placeName(sf.PlaceNameMain)||'未知釣點',
      zoneName:placeName(tf.PlaceName)||placeName(sf.PlaceNameMain)||placeName(tf.PlaceNameZone)||'未知地圖',
      regionName:placeName(tf.PlaceNameZone)||placeName(tf.PlaceNameRegion)||'其他',
      x:Number(sf.X)||null,
      y:Number(sf.Y??sf.Z)||null
    };
  }
  function cleanLocation(v,unknownSpot='未知釣點',unknownZone='未知地區'){
    return{spotId:Number(v?.spotId)||0,spotName:String(v?.spotName||unknownSpot),zoneName:String(v?.zoneName||unknownZone),regionName:String(v?.regionName||'其他'),x:Number(v?.x)||null,y:Number(v?.y)||null};
  }
  function uniqueSpots(values,clean=cleanLocation){
    const out=[],seen=new Set();
    for(const raw of values||[]){
      const x=clean(raw),key=x.spotId?`id:${x.spotId}`:`name:${x.regionName}|${x.zoneName}|${x.spotName}`;
      if(seen.has(key))continue;
      seen.add(key);out.push(x);
    }
    return out;
  }
  const cleanSpearLocation=v=>cleanLocation(v,'未知刺魚點','未知地圖');
  const uniqueSpearSpots=values=>uniqueSpots(values,cleanSpearLocation);

  // 一條魚的所有釣點；沒有 spots 的舊資料就用魚本身記的那一個。
  function fishLocations(fish){
    const spots=Array.isArray(fish?.spots)&&fish.spots.length?fish.spots:[fish];
    return uniqueSpots(spots);
  }
  // 把「一條魚多個釣點」攤平成「每個釣點一列」。
  function expandFishLocations(rows){
    const out=[];
    for(const fish of rows||[]){
      const spots=fishLocations(fish);
      if(!spots.length)out.push(fish);
      else spots.forEach(loc=>out.push({...fish,...loc}));
    }
    return out;
  }
  function uniqueFishCount(rows){return new Set((rows||[]).map(x=>`${x.type||'fish'}:${Number(x.itemId)||0}`)).size}

  // ---- 主圖鑑：FishParameter + FishingSpot（+ SpearfishingItem） ----
  function normalizeFishingRow(r){
    const f=r.fields||{},itemId=relId(f.Item),name=nameOf(f.Item);
    if(!f.IsInLog||!itemId||!name)return null;
    return{rowId:r.row_id,itemId,type:'fishing',name,bigFish:Number(f.AchievementCredit||0)!==0,hidden:!!f.IsHidden,...locationParts(f.FishingSpot)};
  }
  function normalizeSpearRow(r){
    const f=r.fields||{},itemId=relId(f.Item),name=nameOf(f.Item);
    if(!f.IsInLog||!itemId||!name)return null;
    return{rowId:r.row_id,itemId,type:'spearfishing',name,bigFish:false,hidden:!!f.IsHidden,...locationParts(f.SpearfishingNotebook)};
  }
  // FishingSpot.Item[] 才有「這個釣點能釣到哪些魚」的完整關聯；FishParameter 每條魚只記一個釣點。
  function fishingSpotIndex(rows){
    const byItem=new Map();
    for(const r of rows||[]){
      const items=Array.isArray(r.fields?.Item)?r.fields.Item:[],loc=locationParts(r);
      if(!loc.spotId)continue;
      for(const item of items){
        const itemId=relId(item);
        if(!itemId)continue;
        if(!byItem.has(itemId))byItem.set(itemId,[]);
        byItem.get(itemId).push(loc);
      }
    }
    for(const[itemId,spots]of byItem)byItem.set(itemId,uniqueSpots(spots));
    return byItem;
  }
  const FISH_FIELDS='Item.Name,FishingSpot.PlaceName.Name,FishingSpot.PlaceNameMain.Name,FishingSpot.PlaceNameSub.Name,FishingSpot.TerritoryType.PlaceName.Name,FishingSpot.TerritoryType.PlaceNameZone.Name,FishingSpot.TerritoryType.PlaceNameRegion.Name,FishingSpot.X,FishingSpot.Z,AchievementCredit,IsHidden,IsInLog';
  const SPEAR_FIELDS='Item.Name,SpearfishingNotebook.PlaceName.Name,SpearfishingNotebook.TerritoryType.PlaceName.Name,SpearfishingNotebook.TerritoryType.PlaceNameZone.Name,SpearfishingNotebook.TerritoryType.PlaceNameRegion.Name,SpearfishingNotebook.X,SpearfishingNotebook.Y,IsHidden,IsInLog';
  const SPOT_FIELDS='Item[].Name,PlaceName.Name,PlaceNameMain.Name,PlaceNameSub.Name,TerritoryType.PlaceName.Name,TerritoryType.PlaceNameZone.Name,TerritoryType.PlaceNameRegion.Name,X,Z';

  function buildMainCatalog(fishRows,spearRows,spotRows){
    const spotsByItem=fishingSpotIndex(spotRows),catalog=[];
    for(const raw of fishRows){
      const x=normalizeFishingRow(raw);if(!x)continue;
      const spots=uniqueSpots([...(spotsByItem.get(x.itemId)||[]),x]),primary=spots[0]||cleanLocation(x);
      catalog.push({...x,...primary,spots});
    }
    for(const raw of spearRows){
      const x=normalizeSpearRow(raw);if(!x)continue;
      const spots=uniqueSpots([x]),primary=spots[0]||cleanLocation(x);
      catalog.push({...x,...primary,spots});
    }
    const byId=new Map();
    for(const x of catalog){
      const key=`${x.type}:${x.itemId}`;
      if(!byId.has(key)){byId.set(key,x);continue}
      const prev=byId.get(key),spots=uniqueSpots([...(prev.spots||[]),...(x.spots||[])]),primary=spots[0]||cleanLocation(prev);
      byId.set(key,{...prev,...primary,bigFish:!!(prev.bigFish||x.bigFish),hidden:!!(prev.hidden&&x.hidden),spots});
    }
    return[...byId.values()];
  }

  // 下載主圖鑑。快取還新鮮（且不是 force）就只標示狀態。回傳這次是否真的重新下載成功。
  async function loadMainCatalog(force=false){
    const cached=read('fishCatalog',[])||[],updated=Number(read('fishCatalogUpdatedAt',0))||0,schema=Number(read('fishCatalogSchema',0))||0;
    if(!force&&schema===CATALOG_SCHEMA&&cached.length&&Date.now()-updated<CACHE_MS){
      status(`使用快取：${cached.length} 種（${new Date(updated).toLocaleString('zh-TW')} 更新）`);
      window.__fishCatalogState='ready';
      renderCatalog();
      return false;
    }
    window.__fishCatalogState='loading';
    status('從 XIVAPI 讀取魚類與完整釣場關聯…');
    try{
      const[fishRows,spearRows,spotRows]=await Promise.all([fetchSheetRows('FishParameter',FISH_FIELDS),fetchSheetRows('SpearfishingItem',SPEAR_FIELDS),fetchSheetRows('FishingSpot',SPOT_FIELDS)]);
      const clean=buildMainCatalog(fishRows,spearRows,spotRows),links=clean.reduce((n,x)=>n+fishLocations(x).length,0);
      write('fishCatalog',clean);
      write('fishCatalogUpdatedAt',Date.now());
      write('fishCatalogSchema',CATALOG_SCHEMA);
      window.__fishCatalogDownloadedAt=Date.now();
      status(`XIVAPI 已更新：${clean.length} 種圖鑑魚，${links} 個釣場關聯`);
      window.__fishCatalogState='ready';
      renderCatalog();
      return true;
    }catch(e){
      window.__fishCatalogState='failed';
      status(`外部資料讀取失敗：${e.message}${cached.length?'（保留舊快取）':''}`);
      console.error(e);
      if(cached.length)renderCatalog();
      return false;
    }
  }

  // ---- 刺魚：SpearfishingNotebook → GatheringPointBase → SpearfishingItem ----
  // SpearfishingItem 本身沒有可用的地點，要從筆記本那一側走回來才知道哪個刺魚點有哪些魚。
  function notebookLocation(row){
    const f=row?.fields||{},territory=relFields(f.TerritoryType);
    return{
      spotId:Number(row?.row_id)||0,
      spotName:nameOf(f.PlaceName)||'未知刺魚點',
      zoneName:nameOf(territory.PlaceName)||nameOf(territory.PlaceNameZone)||'未知地圖',
      regionName:nameOf(territory.PlaceNameRegion)||'其他',
      x:Number(f.X)||null,
      y:Number(f.Y)||null
    };
  }
  function spearsFromNotebook(row){
    const base=relFields(row?.fields?.GatheringPointBase),items=Array.isArray(base.Item)?base.Item:[],loc=notebookLocation(row),out=[];
    for(const spear of items){
      const item=relFields(spear).Item,itemId=relId(item),name=nameOf(item);
      if(!itemId||!name)continue;
      out.push({rowId:relId(spear)||Number(row?.row_id)||0,itemId,type:'spearfishing',name,bigFish:false,hidden:false,...loc,spots:uniqueSpearSpots([loc])});
    }
    return out;
  }
  // 圖鑑裡原有的刺魚全部換成筆記本解析出來的；釣魚的部分不動。
  function mergeSpears(existing,spears){
    const normal=(existing||[]).filter(x=>x?.type!=='spearfishing'),byId=new Map();
    for(const x of spears){
      const id=Number(x?.itemId)||0;if(!id)continue;
      if(!byId.has(id)){byId.set(id,x);continue}
      const prev=byId.get(id),spots=uniqueSpearSpots([...(prev.spots||[]),...(x.spots||[])]),primary=spots[0]||cleanSpearLocation(prev);
      byId.set(id,{...prev,...primary,spots});
    }
    return[...normal,...byId.values()];
  }
  let spearPromise=null;
  async function loadSpearfishing(force=false){
    if(spearPromise)return spearPromise;
    spearPromise=(async()=>{
      const existing=read('fishCatalog',[])||[],updated=Number(read('fishCatalogUpdatedAt',0))||0,schema=Number(read('fishSpearCatalogSchema',0))||0;
      const existingSpear=uniqueFishCount(existing.filter(x=>x.type==='spearfishing'));
      if(!force&&schema===SPEAR_SCHEMA&&existingSpear>0&&Date.now()-updated<CACHE_MS){refreshPicker();return existing}

      status('正在補齊刺魚圖鑑與刺魚點…');
      const notebookRows=await fetchSheetRows('SpearfishingNotebook','PlaceName.Name,TerritoryType.PlaceName.Name,TerritoryType.PlaceNameZone.Name,TerritoryType.PlaceNameRegion.Name,X,Y,GatheringPointBase.Item[].Item.Name'),spears=[];
      for(const row of notebookRows)spears.push(...spearsFromNotebook(row));
      if(!spears.length)throw new Error('SpearfishingNotebook 沒有解析出任何刺魚；先保留舊快取');

      // 下載期間圖鑑可能已經被別的流程更新，合併前重讀一次。
      const merged=mergeSpears(read('fishCatalog',[]),spears),links=merged.reduce((n,x)=>n+(Array.isArray(x?.spots)&&x.spots.length?x.spots.length:1),0);
      write('fishCatalog',merged);
      write('fishCatalogUpdatedAt',Date.now());
      write('fishSpearCatalogSchema',SPEAR_SCHEMA);
      // 這裡不寫 fishCatalogSchema：它代表「主圖鑑完整下載過」，只補刺魚不算。
      const spear=uniqueFishCount(merged.filter(x=>x.type==='spearfishing')),fishing=uniqueFishCount(merged.filter(x=>x.type!=='spearfishing'));
      status(`XIVAPI 已更新：${uniqueFishCount(merged)} 種圖鑑魚（釣魚 ${fishing} / 刺魚 ${spear}），${links} 個釣場關聯`);
      try{renderCatalog()}catch(e){console.warn('render catalog after spear repair failed',e)}
      refreshPicker();
      document.dispatchEvent(new CustomEvent('fishcatalogupdated',{detail:{total:uniqueFishCount(merged),spearfishing:spear}}));
      return merged;
    })().catch(e=>{
      console.error('spearfishing catalog repair failed',e);
      status(`刺魚資料補齊失敗：${e.message}`);
      return read('fishCatalog',[]);
    }).finally(()=>{spearPromise=null});
    return spearPromise;
  }

  // 畫面那一側（fishing-browse.js）比這支晚載入，用到時才找。
  function renderCatalog(){if(typeof window.renderFishCatalog==='function')window.renderFishCatalog()}
  function refreshPicker(){if(typeof window.refreshFishingPicker==='function')window.refreshFishingPicker()}

  // ---- 對外：重新整理整份圖鑑（主圖鑑 + 刺魚） ----
  async function refreshFishCatalog(force=false){
    try{await loadMainCatalog(force)}catch(e){console.warn('legacy catalog refresh failed; continuing with spear repair',e)}
    return loadSpearfishing(!!force);
  }

  // ---- 舊快取修復 ----
  // 很舊的快取把釣點名存成數字 ID。
  function hasNumericSpotNames(){return expandFishLocations(shared.catalog()).some(x=>/^\d+$/.test(String(x.spotName||'').trim()))}
  async function repairNumericSpotNames(){
    if(!hasNumericSpotNames())return;
    status('偵測到舊版數字釣點，正在重新建立釣點資料…');
    try{await refreshFishCatalog(true);refreshPicker()}catch(e){console.warn('repair fish catalog failed',e)}
  }
  // 沒有「依實際地圖分組」標記的快取重抓一次；這次造訪剛下載過的圖鑑已經是新分組，直接標記。
  async function ensureMapGrouping(){
    let current='';
    try{current=localStorage.getItem(MAP_GROUPING_KEY)||''}catch{}
    if(current===MAP_GROUPING)return;
    if(window.__fishCatalogDownloadedAt){
      try{localStorage.setItem(MAP_GROUPING_KEY,MAP_GROUPING)}catch{}
      return;
    }
    status('正在依實際地圖重新整理釣場分組…');
    try{
      await refreshFishCatalog(true);
      localStorage.setItem(MAP_GROUPING_KEY,MAP_GROUPING);
      if(typeof window.refreshFF14TcTerms==='function')setTimeout(()=>window.refreshFF14TcTerms(),100);
    }catch(e){
      console.warn('rebuild map-grouped fish catalog failed',e);
      status('釣場地圖分組更新失敗，沿用原資料。');
    }
  }

  // ---- 啟動：釣魚分頁第一次打開才開始，一步一步來，同一份資料不會同時抓兩次 ----
  async function start(){
    const downloaded=await loadMainCatalog(false);
    // 主圖鑑這次有重新下載（或下載失敗）時，刺魚要重新合併進去。
    await loadSpearfishing(downloaded||window.__fishCatalogState==='failed');
    await repairNumericSpotNames();
    await ensureMapGrouping();
  }

  Object.assign(window,{fishLocations,expandFishLocations,refreshFishCatalog});
  window.FF14FishCatalog=Object.freeze({uniqueFishCount,fishLocations,expandFishLocations,refresh:refreshFishCatalog,locationParts,buildMainCatalog,spearsFromNotebook,mergeSpears});

  document.getElementById('refresh-fish-data')?.addEventListener('click',()=>refreshFishCatalog(true));
  shared.whenActive().then(start);
})();
