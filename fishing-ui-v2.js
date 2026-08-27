// Fishing UI v2: Taiwan Traditional Chinese names + simple location picker.
(function(){
  'use strict';

  // Item.csv: use Singular as the canonical display name.
  window.ff14TcCsvMeta=function(text){
    const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/);
    const heads=typeof ff14TcCsvLine==='function'?ff14TcCsvLine(lines[1]||''):(lines[1]||'').split(',');
    let nameIndex=heads.indexOf('Singular');
    if(nameIndex<0)nameIndex=heads.indexOf('Name');
    if(nameIndex<0)nameIndex=1;
    return {lines,nameIndex};
  };

  function tc(v){try{return typeof ff14TcText==='function'?ff14TcText(v):String(v||'')}catch{return String(v||'')}}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function readStore(key,def=[]){try{return JSON.parse(localStorage.getItem(key))??def}catch{return def}}
  function catalog(){return readStore('fishCatalog',[])}
  function catalogLocations(){const rows=catalog();if(typeof window.expandFishLocations==='function')return window.expandFishLocations(rows);const out=[];for(const fish of rows){const spots=Array.isArray(fish?.spots)&&fish.spots.length?fish.spots:[fish];spots.forEach(loc=>out.push({...fish,...loc}))}return out}
  function value(el){return el?.value||''}
  function validName(v){const s=String(v||'').trim();return s&&!/^\d+$/.test(s)?s:''}
  function relationName(v){return validName(v?.fields?.Name??v?.Name??'')}
  function uniqueFishCount(rows){return new Set((rows||[]).map(x=>`${x.type||'fish'}:${Number(x.itemId)||0}`)).size}

  window.locationParts=function(spot){
    const sf=spot?.fields||{},territory=sf.TerritoryType,tf=territory?.fields||{};
    const spotName=relationName(sf.PlaceName)||relationName(sf.PlaceNameSub)||relationName(sf.PlaceNameMain)||'未知釣點';
    const zoneName=relationName(tf.PlaceNameZone)||relationName(tf.PlaceName)||relationName(sf.PlaceNameMain)||'未知地區';
    const regionName=relationName(tf.PlaceNameRegion)||'其他';
    const spotId=Number(spot?.row_id??spot?.rowId??spot?.value??0)||0;
    return {spotId,spotName,zoneName,regionName,x:Number(sf.X)||null,y:Number(sf.Y??sf.Z)||null};
  };

  function distinct(values){
    const seen=new Set(),out=[];
    for(const en of values){const key=validName(en);if(!key||seen.has(key))continue;seen.add(key);out.push({en:key,tc:tc(key)})}
    return out.sort((a,b)=>a.tc.localeCompare(b.tc,'zh-Hant'));
  }

  function ensurePicker(){
    const status=document.getElementById('fish-catalog-status');
    if(!status||document.getElementById('fish-location-picker'))return;
    const box=document.createElement('div');box.id='fish-location-picker';box.className='fish-location-picker result';
    box.innerHTML=`<div class="fish-picker-head"><div><strong>想去哪裡釣？</strong><div class="muted">照順序選：地區 → 地圖 → 釣點。選好後，下方只顯示那個範圍。</div></div><button type="button" id="fish-picker-reset">清除選擇</button></div><div class="fish-picker-grid"><label><span>① 地區</span><select id="fish-picker-region"><option value="">全部地區</option></select></label><label><span>② 地圖</span><select id="fish-picker-zone" disabled><option value="">先選地區</option></select></label><label><span>③ 釣點</span><select id="fish-picker-spot" disabled><option value="">先選地圖</option></select></label></div><div id="fish-picker-current" class="fish-picker-current muted">目前：全部地區</div>`;
    status.insertAdjacentElement('afterend',box);
    document.getElementById('fish-picker-region').addEventListener('change',()=>{fillZones();fillSpots();applyPicker()});
    document.getElementById('fish-picker-zone').addEventListener('change',()=>{fillSpots();applyPicker()});
    document.getElementById('fish-picker-spot').addEventListener('change',applyPicker);
    document.getElementById('fish-picker-reset').addEventListener('click',resetPicker);
  }

  function fillSelect(el,rows,placeholder){
    if(!el)return;const old=el.value;
    el.innerHTML=`<option value="">${esc(placeholder)}</option>`+rows.map(x=>`<option value="${esc(x.en)}">${esc(x.tc)}</option>`).join('');
    if(rows.some(x=>x.en===old))el.value=old;
  }
  function refreshPicker(){
    ensurePicker();const region=document.getElementById('fish-picker-region');if(!region)return;
    fillSelect(region,distinct(catalogLocations().map(x=>x.regionName)),'全部地區');fillZones();fillSpots();updateCurrent();
  }
  function fillZones(){
    const region=document.getElementById('fish-picker-region'),zone=document.getElementById('fish-picker-zone');if(!region||!zone)return;
    const selected=value(region),rows=catalogLocations().filter(x=>!selected||x.regionName===selected);
    fillSelect(zone,distinct(rows.map(x=>x.zoneName)),selected?'全部地圖':'先選地區');zone.disabled=!selected;if(!selected)zone.value='';
  }
  function fillSpots(){
    const region=value(document.getElementById('fish-picker-region')),zoneEl=document.getElementById('fish-picker-zone'),spot=document.getElementById('fish-picker-spot');if(!spot)return;
    const zone=value(zoneEl),rows=catalogLocations().filter(x=>(!region||x.regionName===region)&&(!zone||x.zoneName===zone));
    fillSelect(spot,distinct(rows.map(x=>x.spotName)),zone?'全部釣點':'先選地圖');spot.disabled=!zone;if(!zone)spot.value='';
  }
  function updateCurrent(){
    const parts=[value(document.getElementById('fish-picker-region')),value(document.getElementById('fish-picker-zone')),value(document.getElementById('fish-picker-spot'))].filter(Boolean).map(tc),out=document.getElementById('fish-picker-current');if(!out)return;
    out.innerHTML=parts.length?`目前：<strong>${parts.map(esc).join(' → ')}</strong>`:'目前：全部地區';
  }
  function applyPicker(){
    updateCurrent();const region=value(document.getElementById('fish-picker-region')),zone=value(document.getElementById('fish-picker-zone')),spot=value(document.getElementById('fish-picker-spot')),q=document.getElementById('fish-search');
    if(q){q.value=spot||zone||region||'';q.dispatchEvent(new Event('input',{bubbles:true}))}
  }
  function resetPicker(){
    const r=document.getElementById('fish-picker-region');if(r)r.value='';fillZones();fillSpots();const q=document.getElementById('fish-search');if(q){q.value='';q.dispatchEvent(new Event('input',{bubbles:true}))}updateCurrent();
  }
  function selectFishingSpot(regionName,zoneName,spotName){
    const tab=document.querySelector('nav button[data-tab="fishing"]');if(tab&&!tab.classList.contains('active'))tab.click();
    ensurePicker();refreshPicker();
    const region=document.getElementById('fish-picker-region'),zone=document.getElementById('fish-picker-zone'),spot=document.getElementById('fish-picker-spot');
    if(!region||!zone||!spot)return false;
    if([...region.options].some(o=>o.value===regionName))region.value=regionName;else return false;
    fillZones();
    if([...zone.options].some(o=>o.value===zoneName))zone.value=zoneName;else return false;
    fillSpots();
    if([...spot.options].some(o=>o.value===spotName))spot.value=spotName;else return false;
    spot.dispatchEvent(new Event('change',{bubbles:true}));
    setTimeout(()=>document.getElementById('fish-location-picker')?.scrollIntoView({behavior:'smooth',block:'start'}),30);
    return true;
  }
  window.selectFishingSpot=selectFishingSpot;

  function fixSpotSummaryNames(){
    document.querySelectorAll('#fish-catalog details.spot').forEach(details=>{
      const summary=details.querySelector(':scope > summary'),small=details.querySelector('.fish-row small');
      if(!summary||!small)return;
      const parts=small.textContent.split('/').map(x=>x.trim()).filter(Boolean),spotName=parts[parts.length-1];
      if(!spotName||/^\d+$/.test(spotName))return;
      const textNode=[...summary.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);
      if(textNode&&textNode.nodeValue.trim()!==spotName)textNode.nodeValue=spotName+' ';
    });
  }

  function updateCatalogSummary(){
    const summary=document.getElementById('fish-map-summary');if(!summary)return;
    const all=catalog(),caught=new Set(typeof getCaughtIds==='function'?getCaughtIds():readStore('fishCaughtIds',[])),skipped=new Set(typeof getSkippedIds==='function'?getSkippedIds():readStore('fishSkippedIds',[]));
    const ordinaryRemaining=uniqueFishCount(all.filter(x=>!caught.has(Number(x.itemId))&&!x.bigFish&&!skipped.has(Number(x.itemId))));
    summary.innerHTML=`外部圖鑑：${uniqueFishCount(all)} 種　｜　已知已釣 ID：${caught.size}　｜　<strong>未記錄普通魚：${ordinaryRemaining}</strong>　｜　先跳過：${skipped.size}<br><span class="muted">同一魚種可出現在多個釣場，但圖鑑總數只算一次。魚糕可能漏記，所以「未記錄」不等於一定沒釣過。</span>`;
  }
  function decrementBadge(details){
    if(!details)return;
    const badge=details.querySelector(':scope > summary .badge');if(!badge)return;
    badge.textContent=String(Math.max(0,(Number(badge.textContent)||0)-1));
  }
  function markCaughtInPlace(itemId){
    itemId=Number(itemId);if(!Number.isFinite(itemId))return;
    const ids=typeof getCaughtIds==='function'?getCaughtIds():readStore('fishCaughtIds',[]).map(Number);
    if(!ids.includes(itemId)){
      if(typeof setCaughtIds==='function')setCaughtIds([...ids,itemId]);
      else localStorage.setItem('fishCaughtIds',JSON.stringify([...ids,itemId]));
    }
    if(typeof renderFish==='function')renderFish();
    updateCatalogSummary();

    const buttons=[...document.querySelectorAll(`#fish-catalog [data-caught="${itemId}"]`)],onlyMissing=document.getElementById('fish-only-missing')?.checked??true,seenZones=new Set();
    for(const button of buttons){
      const row=button.closest('.fish-row');if(!row)continue;
      const spot=row.closest('details.spot'),zone=row.closest('details.zone');
      if(onlyMissing){
        row.remove();decrementBadge(spot);if(zone&&!seenZones.has(zone)){decrementBadge(zone);seenZones.add(zone)}
        const list=spot?.querySelector('.fish-list');if(list&&!list.querySelector('.fish-row'))spot.remove();
        if(zone&&!zone.querySelector('details.spot'))zone.remove();
      }else{
        const done=document.createElement('span');done.className='done';done.textContent='✓ 已記錄';button.replaceWith(done);
      }
    }
    try{if(typeof renderBaitShoppingList==='function')renderBaitShoppingList()}catch{}
    try{if(typeof renderRoutePlanner==='function')renderRoutePlanner()}catch{}
    fixSpotSummaryNames();
  }
  window.markCaught=markCaughtInPlace;

  // IMPORTANT: app.js already attached onclick handlers that call the old markCaught(),
  // which rebuilds all of #fish-catalog. Intercept in capture phase before those handlers.
  function interceptCaughtClick(e){
    const button=e.target?.closest?.('#fish-catalog [data-caught]');
    if(!button)return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    markCaughtInPlace(Number(button.dataset.caught));
  }

  function hasBrokenSpotNames(){return catalogLocations().some(x=>/^\d+$/.test(String(x.spotName||'').trim()))}
  async function repairCatalogIfNeeded(){
    if(!hasBrokenSpotNames()||typeof refreshFishCatalog!=='function')return;
    const status=document.getElementById('fish-catalog-status');if(status)status.textContent='偵測到舊版數字釣點，正在重新建立釣點資料…';
    try{await refreshFishCatalog(true);refreshPicker();fixSpotSummaryNames()}catch(e){console.warn('repair fish catalog failed',e)}
  }
  function refreshTc(){try{if(typeof ff14TcRefresh==='function')ff14TcRefresh(true);else if(typeof refreshFF14TcTerms==='function')refreshFF14TcTerms()}catch(e){console.warn('TC refresh failed',e)}}
  function addStyles(){
    if(document.getElementById('fish-picker-style'))return;const s=document.createElement('style');s.id='fish-picker-style';s.textContent=`.fish-location-picker{margin:12px 0 16px;padding:14px}.fish-picker-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.fish-picker-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.fish-picker-grid label{display:flex;flex-direction:column;gap:6px;font-weight:600}.fish-picker-grid select{width:100%;min-height:40px}.fish-picker-current{margin-top:10px}@media(max-width:980px){.fish-picker-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.fish-picker-grid label:nth-child(3){grid-column:1/-1}.fish-location-picker{padding:12px}}@media(max-width:700px){.fish-picker-grid{grid-template-columns:1fr}.fish-picker-grid label:nth-child(3){grid-column:auto}.fish-picker-head{flex-direction:column}.fish-picker-head button{width:100%;min-height:40px}.fish-location-picker{padding:10px}}`;document.head.appendChild(s);
  }

  window.addEventListener('DOMContentLoaded',()=>{
    addStyles();ensurePicker();refreshPicker();fixSpotSummaryNames();
    document.addEventListener('click',interceptCaughtClick,true);
    setTimeout(repairCatalogIfNeeded,600);
    setTimeout(()=>{refreshPicker();fixSpotSummaryNames()},1500);
    setTimeout(()=>{refreshTc();refreshPicker();fixSpotSummaryNames()},2500);
    setTimeout(()=>{refreshPicker();fixSpotSummaryNames()},7000);
  });
  const observer=new MutationObserver(()=>{
    clearTimeout(window.__fishPickerTimer);
    window.__fishPickerTimer=setTimeout(()=>{refreshPicker();fixSpotSummaryNames()},120);
  });
  window.addEventListener('DOMContentLoaded',()=>{const target=document.getElementById('fish-catalog');if(target)observer.observe(target,{childList:true,subtree:true})});
})();