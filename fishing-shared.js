// Shared, side-effect-free data helpers used by fishing recommendation modules.
(function(){
  'use strict';

  function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
  let catalogRaw=null,catalogValue=[];
  function catalog(){
    let raw;try{raw=localStorage.getItem('fishCatalog')}catch{return catalogValue}
    if(raw===catalogRaw)return catalogValue;
    catalogRaw=raw;try{const parsed=JSON.parse(raw||'[]');catalogValue=Array.isArray(parsed)?parsed:[]}catch{catalogValue=[]}
    return catalogValue;
  }
  function idOf(value){return Number(value&&typeof value==='object'?(value.id??value.itemId??value.fishId):value)}
  function idSet(values){return new Set((values||[]).map(idOf).filter(Number.isFinite))}
  function caughtIds(){try{if(typeof window.getCaughtIds==='function')return idSet(window.getCaughtIds())}catch{}return idSet([...(read('fishcakeCaughtIds',[])||[]),...(read('fishCaughtIds',[])||[])])}
  function skippedIds(){try{if(typeof window.getSkippedIds==='function')return idSet(window.getSkippedIds())}catch{}return idSet(read('fishSkippedIds',[])||[])}
  function locations(fish){
    if(!fish)return[];
    if(typeof window.fishLocations==='function')return window.fishLocations(fish);
    return Array.isArray(fish.spots)&&fish.spots.length?fish.spots:[fish];
  }
  function locationsForWindow(fish,info,predicate=()=>true,fallback=true){
    const spots=locations(fish).filter(predicate);
    if(!info?.restricted||!Number(info.locationId))return spots;
    const exact=spots.filter(loc=>Number(loc?.spotId)===Number(info.locationId));
    // Unknown/mismatched tracker locations have historically fallen back to all catalog spots.
    if(exact.length)return exact;
    return fallback?spots:[];
  }
  const oceanNames=new Set(['the high seas','high seas','the endeavor','endeavor','galadion bay','the southern strait of merlthor','southern strait of merlthor','the northern strait of merlthor','northern strait of merlthor','rhotano sea','the cieldalaes','cieldalaes','rothlyt sound','the bloodbrine sea','bloodbrine sea','the sirensong sea','sirensong sea','公海','海釣','遠洋漁業','出海垂釣']);
  function oceanText(value){const text=String(value??'').trim().toLowerCase();return !!text&&(oceanNames.has(text)||text.includes('ocean fishing')||text.includes('the endeavor')||text.includes('high seas')||text.includes('出海垂釣'))}
  function isOceanLocation(loc){return !!loc&&(oceanText(loc.regionName)||oceanText(loc.zoneName)||oceanText(loc.spotName))}
  function isOceanOnlyFish(fish){const spots=locations(fish);return spots.length>0&&spots.every(isOceanLocation)}
  function isOceanOnlyItem(itemId,rows=catalog()){const id=Number(itemId);return isOceanOnlyFish(rows.find(fish=>Number(fish?.itemId)===id))}
  function recommendationEligible(fish){return Number(fish?.itemId)>0&&fish?.type!=='spearfishing'&&!isOceanOnlyFish(fish)}

  // 釣魚資料很大（XIVAPI 三張表、台服 Item.csv、釣法與 NPC 資料），只看首頁或練等的人不需要。
  // 各模組的下載一律等「釣魚分頁第一次被打開」才開始；whenActive() 在那一刻兌現，之後永遠是已兌現。
  let fishingOpen=false;const fishingWaiters=[];
  function openFishing(){if(fishingOpen)return;fishingOpen=true;for(const done of fishingWaiters.splice(0)){try{done()}catch(e){console.error(e)}}}
  function whenActive(){return fishingOpen?Promise.resolve():new Promise(done=>fishingWaiters.push(done))}
  (function watchFishingTab(){
    if(typeof document==='undefined'||typeof MutationObserver==='undefined'){openFishing();return}
    const section=document.getElementById('fishing');let hash='';try{hash=decodeURIComponent(location.hash)}catch{}
    if(!section||section.classList.contains('active')||hash==='#fishing'){openFishing();return}
    const watcher=new MutationObserver(()=>{if(section.classList.contains('active')){watcher.disconnect();openFishing()}});
    watcher.observe(section,{attributes:true,attributeFilter:['class']});
  })();

  window.FF14Fishing=Object.freeze({whenActive,isActive:()=>fishingOpen,read,catalog,idOf,idSet,caughtIds,skippedIds,locations,locationsForWindow,isOceanLocation,isOceanOnlyFish,isOceanOnlyItem,recommendationEligible});
})();
