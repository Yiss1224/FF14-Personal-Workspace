// Exclude Ocean Fishing stops from the normal overworld route planner.
(function(){
  'use strict';

  const OCEAN_EXACT=new Set([
    'the high seas',
    'high seas',
    'the endeavor',
    'endeavor',
    'galadion bay',
    'the southern strait of merlthor',
    'southern strait of merlthor',
    'the northern strait of merlthor',
    'northern strait of merlthor',
    'rhotano sea',
    'the cieldalaes',
    'cieldalaes',
    'rothlyt sound',
    'the bloodbrine sea',
    'bloodbrine sea',
    'the sirensong sea',
    'sirensong sea',
    '公海',
    '海釣',
    '遠洋漁業'
  ]);

  function norm(v){return String(v??'').trim().toLowerCase()}

  function isOceanText(v){
    const s=norm(v);
    if(!s)return false;
    if(OCEAN_EXACT.has(s))return true;
    return s.includes('ocean fishing')||s.includes('the endeavor')||s.includes('high seas');
  }

  function isOceanStop(stop){
    if(!stop)return false;
    if(isOceanText(stop.regionName)||isOceanText(stop.zoneName)||isOceanText(stop.spotName))return true;

    // If catalog metadata is present, inspect all matching fish rows too.
    try{
      const catalog=JSON.parse(localStorage.getItem('fishCatalog')||'[]')||[];
      return catalog.some(x=>
        Number(x.spotId)===Number(stop.spotId)&&
        (isOceanText(x.regionName)||isOceanText(x.zoneName)||isOceanText(x.spotName))
      );
    }catch{return false}
  }

  if(typeof window.fgBuildSpotPlan==='function'){
    const base=window.fgBuildSpotPlan;
    window.fgBuildSpotPlan=function(){
      const rows=base.apply(this,arguments)||[];
      return rows.filter(x=>!isOceanStop(x));
    };
  }

  window.isOceanFishingRouteStop=isOceanStop;

  window.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>{
      try{if(typeof window.renderRoutePlanner==='function')window.renderRoutePlanner()}catch(e){console.warn('route planner ocean filter refresh failed',e)}
    },300);
  });
})();
