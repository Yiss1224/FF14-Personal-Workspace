// Repair spearfishing catalog data by walking SpearfishingNotebook -> GatheringPointBase -> SpearfishingItem.
(function(){
  'use strict';

  const XIVAPI_BASE='https://v2.xivapi.com/api';
  const SPEAR_CACHE_SCHEMA=2;
  const CACHE_MS=7*24*60*60*1000;
  let refreshPromise=null;

  function read(key,def){try{return JSON.parse(localStorage.getItem(key))??def}catch{return def}}
  function write(key,value){localStorage.setItem(key,JSON.stringify(value))}
  function relFields(v){return v?.fields||{}}
  function relId(v){return Number(v?.row_id??v?.rowId??v?.value??0)||0}
  function nameOf(v){return String(relFields(v).Name??v?.Name??'').trim()}
  function validName(v){const s=String(v||'').trim();return s&&!/^\d+$/.test(s)?s:''}
  function tc(v){const s=String(v||'');try{return typeof window.ff14TcText==='function'?window.ff14TcText(s):s}catch{return s}}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

  async function fetchRows(sheet,fields){
    if(typeof window.fetchSheetRows==='function')return window.fetchSheetRows(sheet,fields);
    let after=null,rows=[],guard=0;
    while(guard++<50){
      const p=new URLSearchParams({fields,language:'en',limit:'500'});
      if(after!==null)p.set('after',String(after));
      const res=await fetch(`${XIVAPI_BASE}/sheet/${sheet}?${p}`);
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

  function cleanLocation(v){
    return {spotId:Number(v?.spotId)||0,spotName:String(v?.spotName||'未知刺魚點'),zoneName:String(v?.zoneName||'未知地圖'),regionName:String(v?.regionName||'其他'),x:Number(v?.x)||null,y:Number(v?.y)||null};
  }

  function uniqueSpots(values){
    const out=[],seen=new Set();
    for(const raw of values||[]){
      const x=cleanLocation(raw),key=x.spotId?`id:${x.spotId}`:`name:${x.regionName}|${x.zoneName}|${x.spotName}`;
      if(seen.has(key))continue;
      seen.add(key);out.push(x);
    }
    return out;
  }

  function notebookLocation(row){
    const f=row?.fields||{},territory=relFields(f.TerritoryType);
    return {
      spotId:Number(row?.row_id)||0,
      spotName:nameOf(f.PlaceName)||'未知刺魚點',
      // For spearfishing, the actual map/territory name is TerritoryType.PlaceName.
      // PlaceNameZone is a broader grouping and was incorrectly used as the map in schema 1.
      zoneName:nameOf(territory.PlaceName)||nameOf(territory.PlaceNameZone)||'未知地圖',
      regionName:nameOf(territory.PlaceNameRegion)||'其他',
      x:Number(f.X)||null,
      y:Number(f.Y)||null
    };
  }

  function spearsFromNotebook(row){
    const f=row?.fields||{},base=relFields(f.GatheringPointBase),items=Array.isArray(base.Item)?base.Item:[],loc=notebookLocation(row),out=[];
    for(const spear of items){
      const sf=relFields(spear),item=sf.Item,itemId=relId(item),name=nameOf(item);
      if(!itemId||!name)continue;
      const spots=uniqueSpots([loc]);
      out.push({rowId:relId(spear)||Number(row?.row_id)||0,itemId,type:'spearfishing',name,bigFish:false,hidden:false,...loc,spots});
    }
    return out;
  }

  function mergeSpears(existing,spears){
    const normal=(existing||[]).filter(x=>x?.type!=='spearfishing'),byId=new Map();
    for(const x of spears){
      const id=Number(x?.itemId)||0;if(!id)continue;
      if(!byId.has(id)){byId.set(id,x);continue}
      const prev=byId.get(id),spots=uniqueSpots([...(prev.spots||[]),...(x.spots||[])]),primary=spots[0]||cleanLocation(prev);
      byId.set(id,{...prev,...primary,spots});
    }
    return [...normal,...byId.values()];
  }

  function uniqueFishCount(rows){return new Set((rows||[]).map(x=>`${x.type||'fish'}:${Number(x.itemId)||0}`)).size}

  function statusText(catalog,links){
    const spear=uniqueFishCount(catalog.filter(x=>x.type==='spearfishing'));
    const fishing=uniqueFishCount(catalog.filter(x=>x.type!=='spearfishing'));
    return `XIVAPI 已更新：${uniqueFishCount(catalog)} 種圖鑑魚（釣魚 ${fishing} / 刺魚 ${spear}），${links} 個釣場關聯`;
  }

  function refreshPicker(){
    const region=document.getElementById('fish-picker-region'),zone=document.getElementById('fish-picker-zone'),spot=document.getElementById('fish-picker-spot');
    if(!region||!zone||!spot)return;
    const catalog=read('fishCatalog',[]),rows=[];
    for(const fish of catalog){
      const spots=Array.isArray(fish?.spots)&&fish.spots.length?fish.spots:[fish];
      for(const loc of spots)rows.push({...fish,...loc});
    }
    const distinct=values=>{
      const seen=new Set(),out=[];
      for(const raw of values){const en=validName(raw);if(!en||seen.has(en))continue;seen.add(en);out.push({en,label:tc(en)})}
      return out.sort((a,b)=>a.label.localeCompare(b.label,'zh-Hant'));
    };
    const fill=(el,data,placeholder,old)=>{
      el.innerHTML=`<option value="">${esc(placeholder)}</option>`+data.map(x=>`<option value="${esc(x.en)}">${esc(x.label)}</option>`).join('');
      if(data.some(x=>x.en===old))el.value=old;
    };
    const oldRegion=region.value,oldZone=zone.value,oldSpot=spot.value;
    fill(region,distinct(rows.map(x=>x.regionName)),'全部地區',oldRegion);
    const rv=region.value,zoneRows=rows.filter(x=>!rv||x.regionName===rv);
    fill(zone,distinct(zoneRows.map(x=>x.zoneName)),rv?'全部地圖':'先選地區',oldZone);zone.disabled=!rv;if(!rv)zone.value='';
    const zv=zone.value,spotRows=zoneRows.filter(x=>!zv||x.zoneName===zv);
    fill(spot,distinct(spotRows.map(x=>x.spotName)),zv?'全部釣點':'先選地圖',oldSpot);spot.disabled=!zv;if(!zv)spot.value='';
  }

  async function rebuild(force=false){
    if(refreshPromise)return refreshPromise;
    refreshPromise=(async()=>{
      const existing=read('fishCatalog',[]),updated=Number(read('fishCatalogUpdatedAt',0))||0,schema=Number(read('fishSpearCatalogSchema',0))||0;
      const existingSpear=uniqueFishCount(existing.filter(x=>x.type==='spearfishing'));
      if(!force&&schema===SPEAR_CACHE_SCHEMA&&existingSpear>0&&Date.now()-updated<CACHE_MS){refreshPicker();return existing}

      const status=document.getElementById('fish-catalog-status');
      if(status)status.textContent='正在補齊刺魚圖鑑與刺魚點…';
      const fields='PlaceName.Name,TerritoryType.PlaceName.Name,TerritoryType.PlaceNameZone.Name,TerritoryType.PlaceNameRegion.Name,X,Y,GatheringPointBase.Item[].Item.Name';
      const notebookRows=await fetchRows('SpearfishingNotebook',fields),spears=[];
      for(const row of notebookRows)spears.push(...spearsFromNotebook(row));
      if(!spears.length)throw new Error('SpearfishingNotebook 沒有解析出任何刺魚；先保留舊快取');

      const merged=mergeSpears(existing,spears),links=merged.reduce((n,x)=>n+(Array.isArray(x?.spots)&&x.spots.length?x.spots.length:1),0);
      write('fishCatalog',merged);
      write('fishCatalogUpdatedAt',Date.now());
      write('fishSpearCatalogSchema',SPEAR_CACHE_SCHEMA);
      // Keep the legacy app.js cache schema satisfied; this compatibility layer owns spear schema separately.
      write('fishCatalogSchema',2);
      if(status)status.textContent=statusText(merged,links);
      try{if(typeof window.renderFishCatalog==='function')window.renderFishCatalog();else if(typeof renderFishCatalog==='function')renderFishCatalog()}catch(e){console.warn('render catalog after spear repair failed',e)}
      refreshPicker();
      document.dispatchEvent(new CustomEvent('fishcatalogupdated',{detail:{total:uniqueFishCount(merged),spearfishing:uniqueFishCount(merged.filter(x=>x.type==='spearfishing'))}}));
      return merged;
    })().catch(e=>{
      console.error('spearfishing catalog repair failed',e);
      const status=document.getElementById('fish-catalog-status');if(status)status.textContent=`刺魚資料補齊失敗：${e.message}`;
      return read('fishCatalog',[]);
    }).finally(()=>{refreshPromise=null});
    return refreshPromise;
  }

  // Any future manual/external refresh must also restore the spearfishing side of the catalog.
  const originalRefresh=typeof window.refreshFishCatalog==='function'?window.refreshFishCatalog:(typeof refreshFishCatalog==='function'?refreshFishCatalog:null);
  async function fixedRefresh(force=false){
    if(originalRefresh){try{await originalRefresh(force)}catch(e){console.warn('legacy catalog refresh failed; continuing with spear repair',e)}}
    return rebuild(!!force);
  }
  window.refreshFishCatalog=fixedRefresh;
  try{refreshFishCatalog=fixedRefresh}catch{}
  const refreshBtn=document.getElementById('refresh-fish-data');if(refreshBtn)refreshBtn.onclick=()=>fixedRefresh(true);

  const start=()=>setTimeout(()=>rebuild(false),0);
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
