// Restore spearfishing fish + notebook locations into fishCatalog.
(function(){
  'use strict';

  function relationId(v){
    if(typeof v==='number'||typeof v==='string')return Number(v)||0;
    return Number(v?.row_id??v?.rowId??v?.value??0)||0;
  }

  function itemName(v){
    try{return typeof nameOf==='function'?nameOf(v):String(v?.fields?.Name??v?.Name??'').trim()}catch{return ''}
  }

  function notebookLocation(row){
    const loc=typeof locationParts==='function'?locationParts(row):{};
    return {
      spotId:Number(row?.row_id??row?.rowId??loc?.spotId??0)||0,
      spotName:String(loc?.spotName||'未知刺魚場'),
      zoneName:String(loc?.zoneName||'未知地圖'),
      regionName:String(loc?.regionName||'其他'),
      x:Number(loc?.x)||null,
      y:Number(loc?.y)||null
    };
  }

  async function loadSpearfishingCatalog(){
    if(typeof fetchSheetRows!=='function')throw new Error('fetchSheetRows unavailable');
    const itemFields='Item.Name,SpearfishingNotebook,IsHidden,IsInLog';
    const notebookFields='PlaceName.Name,TerritoryType.PlaceName.Name,TerritoryType.PlaceNameZone.Name,TerritoryType.PlaceNameRegion.Name,X,Y';
    const [itemRows,notebookRows]=await Promise.all([
      fetchSheetRows('SpearfishingItem',itemFields),
      fetchSheetRows('SpearfishingNotebook',notebookFields)
    ]);
    const notebookById=new Map();
    for(const row of notebookRows||[])notebookById.set(Number(row.row_id)||0,notebookLocation(row));

    const out=[];
    for(const raw of itemRows||[]){
      const f=raw?.fields||{},item=f.Item,itemId=relationId(item),name=itemName(item);
      if(!f.IsInLog||!itemId||!name)continue;
      const notebookId=relationId(f.SpearfishingNotebook);
      const loc=notebookById.get(notebookId)||{
        spotId:notebookId,
        spotName:'未知刺魚場',zoneName:'未知地圖',regionName:'其他',x:null,y:null
      };
      out.push({
        rowId:Number(raw.row_id)||0,itemId,type:'spearfishing',name,
        bigFish:false,hidden:!!f.IsHidden,
        ...loc,spots:[loc]
      });
    }
    return out;
  }

  async function augmentSpearfishing(){
    const spear=await loadSpearfishingCatalog();
    const current=store.get('fishCatalog',[]);
    const byKey=new Map();
    for(const row of current||[])byKey.set(`${row.type||'fishing'}:${Number(row.itemId)||0}`,row);
    for(const row of spear)byKey.set(`spearfishing:${row.itemId}`,row);
    const clean=[...byKey.values()];
    store.set('fishCatalog',clean);
    store.set('fishCatalogUpdatedAt',Date.now());

    const fishingCount=clean.filter(x=>x.type!=='spearfishing').length;
    const spearCount=clean.filter(x=>x.type==='spearfishing').length;
    const status=document.getElementById('fish-catalog-status');
    if(status)status.textContent=`XIVAPI 已更新：${clean.length} 種圖鑑魚（釣魚 ${fishingCount}＋刺魚 ${spearCount}）`;
    if(typeof renderFishCatalog==='function')renderFishCatalog();
    return {total:clean.length,fishingCount,spearCount};
  }

  const baseRefresh=typeof refreshFishCatalog==='function'?refreshFishCatalog:null;
  if(baseRefresh){
    refreshFishCatalog=async function(force=false){
      await baseRefresh(force);
      try{return await augmentSpearfishing()}
      catch(e){console.warn('spearfishing catalog restore failed',e);return null}
    };
  }
  window.refreshSpearfishingCatalog=augmentSpearfishing;

  window.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>augmentSpearfishing().catch(e=>console.warn('initial spearfishing catalog restore failed',e)),120);
  });
})();
