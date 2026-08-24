// Group fishing spots by the actual in-game map instead of broad region labels.
(function(){
  'use strict';

  const VERSION='map-groups-v1';
  const VERSION_KEY='fishCatalogMapGroupingVersion';

  function validName(v){
    const s=String(v||'').trim();
    return s&&!/^\d+$/.test(s)?s:'';
  }
  function relationName(v){
    return validName(v?.fields?.Name??v?.Name??'');
  }

  // TerritoryType.PlaceName is the concrete map/territory name.
  // PlaceNameZone / PlaceNameRegion are broader parent areas.
  window.locationParts=function(spot){
    const sf=spot?.fields||{};
    const territory=sf.TerritoryType;
    const tf=territory?.fields||{};

    const spotName=
      relationName(sf.PlaceName)||
      relationName(sf.PlaceNameSub)||
      relationName(sf.PlaceNameMain)||
      '未知釣點';

    const zoneName=
      relationName(tf.PlaceName)||
      relationName(sf.PlaceNameMain)||
      relationName(tf.PlaceNameZone)||
      '未知地圖';

    const regionName=
      relationName(tf.PlaceNameZone)||
      relationName(tf.PlaceNameRegion)||
      '其他';

    const spotId=Number(spot?.row_id??spot?.rowId??spot?.value??0)||0;
    return {
      spotId,
      spotName,
      zoneName,
      regionName,
      x:Number(sf.X)||null,
      y:Number(sf.Y??sf.Z)||null
    };
  };

  async function rebuildOnce(){
    let current='';
    try{current=localStorage.getItem(VERSION_KEY)||''}catch{}
    if(current===VERSION)return;
    if(typeof refreshFishCatalog!=='function')return;

    const status=document.getElementById('fish-catalog-status');
    if(status)status.textContent='正在依實際地圖重新整理釣場分組…';

    try{
      await refreshFishCatalog(true);
      localStorage.setItem(VERSION_KEY,VERSION);
      if(typeof refreshFF14TcTerms==='function')setTimeout(()=>refreshFF14TcTerms(),100);
    }catch(e){
      console.warn('rebuild map-grouped fish catalog failed',e);
      if(status)status.textContent='釣場地圖分組更新失敗，沿用原資料。';
    }
  }

  window.addEventListener('DOMContentLoaded',()=>{
    setTimeout(rebuildOnce,700);
  });
})();
