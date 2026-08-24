// Single renderer for fishing method panels. Data lookup stays English by itemId; display stays Traditional Chinese.
(function(){
  'use strict';

  function tc(v){try{return typeof window.ff14TcText==='function'?window.ff14TcText(v):String(v??'')}catch{return String(v??'')}}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function catalogRow(itemId){return (store.get('fishCatalog',[])||[]).find(x=>Number(x.itemId)===Number(itemId))||null}
  function rowMeta(row){
    const visibleName=row?.querySelector?.(':scope > div:first-child > strong')?.textContent?.trim()||'';
    const href=row?.querySelector?.('a[href*="/fish/"]')?.getAttribute('href')||'';
    const m=href.match(/\/fish\/(\d+)/),itemId=m?Number(m[1])||0:0;
    const catalog=catalogRow(itemId);
    const sourceName=String(catalog?.name||visibleName).trim();
    return {name:sourceName,displayName:visibleName||tc(sourceName),itemId,catalog};
  }

  // Make every guide feature use the stable English catalog name for lookups.
  window.fgFishMetaFromRow=function(row){return rowMeta(row)};

  function weatherTc(m){
    const prev=Array.isArray(m?.previousWeatherSet)?m.previousWeatherSet.filter(Boolean).map(tc):[];
    const now=Array.isArray(m?.weatherSet)?m.weatherSet.filter(Boolean).map(tc):[];
    if(!prev.length&&!now.length)return '無限制';
    if(prev.length&&now.length)return `${prev.join('/')} → ${now.join('/')}`;
    return (now.length?now:prev).join('/');
  }

  // Replace the original renderer. Never remove/rebuild an existing panel in-place.
  window.augmentFishMethodRows=function(){
    document.querySelectorAll('#fish-catalog .fish-row').forEach(row=>{
      if(row.querySelector('.fish-method'))return;
      const meta=rowMeta(row);
      if(!meta.name||!meta.itemId||meta.catalog?.type==='spearfishing')return;
      const m=typeof fgMethodForName==='function'?fgMethodForName(meta.name):null;
      if(!m)return;

      const path=typeof fgPathNames==='function'?fgPathNames(m.bestCatchPath):[];
      const first=path[0]||'未提供',rest=path.slice(1);
      const state=typeof fgUniversalState==='function'?fgUniversalState(meta.itemId):'unknown';
      const manual=typeof fgBiteOverride==='function'?fgBiteOverride(meta.itemId):'';
      const spotId=Number(meta.catalog?.spotId)||0;
      const cachedBite=spotId&&typeof biteSpotMemory!=='undefined'?biteSpotMemory.get(spotId)?.data:null;
      const panel=document.createElement('div');panel.className='fish-method';
      const display=meta.displayName||tc(meta.name);
      const translatedPath=path.map(tc);
      const route=translatedPath.length
        ? `${translatedPath.map(esc).join(' → ')} → <strong>${esc(display)}</strong>`
        : `<strong>${esc(display)}</strong>`;
      const tug=typeof fgTugText==='function'?fgTugText(m.tug):(m.tug||'—');
      const hook=typeof fgHookText==='function'?fgHookText(m.hookset):(m.hookset||'—');
      const time=typeof fgTimeText==='function'?fgTimeText(m):'—';
      const lodinn=typeof fgLodinnUrl==='function'?fgLodinnUrl(meta.catalog?.spotName||m.location):'#';

      panel.innerHTML=`<div class="fish-method-grid"><span>🪱 <b>推薦路線</b> ${route}</span><span>🎣 <b>咬鉤</b> ${esc(tug)} · ${esc(hook)}</span><span>⏰ <b>時間</b> ${esc(time)}</span><span>🌦 <b>天氣</b> ${esc(weatherTc(m))}</span>${m.snagging===true?'<span>🧲 <b>Snagging</b> ON</span>':''}${m.folklore?'<span>📖 <b>傳承錄</b> 需要</span>':''}<span class="fish-bite-line">⏱ <b>秒數</b> <span class="fish-bite-value">${manual?`${esc(manual)}（手動）`:(cachedBite?'已載入釣點資料，按「算秒數」':'尚未載入')}</span> ${spotId&&first!=='未提供'?`<button class="mini-btn" data-fg-bite="${meta.itemId}" data-fg-spot="${spotId}" data-fg-bait="${esc(first)}">算秒數</button>`:''} <button class="mini-btn" data-fg-bite-edit="${meta.itemId}">手動</button> <a href="${esc(lodinn)}" target="_blank" rel="noopener">Lodinn</a></span></div><label class="universal-lure-select">萬能餌 <select data-fg-universal="${meta.itemId}"><option value="unknown" ${state==='unknown'?'selected':''}>未確認／先試萬能餌</option><option value="yes" ${state==='yes'?'selected':''}>可用</option><option value="no" ${state==='no'?'selected':''}>不可用／要指定餌</option></select></label>`;
      row.querySelector(':scope > div:first-child')?.appendChild(panel);
    });

    document.querySelectorAll('[data-fg-universal]').forEach(s=>s.onchange=()=>fgSetUniversalState(+s.dataset.fgUniversal,s.value));
    document.querySelectorAll('[data-fg-bite]').forEach(b=>b.onclick=()=>fgLoadFishBite(b,+b.dataset.fgBite,+b.dataset.fgSpot,b.dataset.fgBait,false));
    document.querySelectorAll('[data-fg-bite-edit]').forEach(b=>b.onclick=()=>{
      const id=+b.dataset.fgBiteEdit,cur=fgBiteOverride(id),v=prompt('手動秒數，例如 8–12s；留空可清除手動值',cur);
      if(v!==null)fgSetBiteOverride(id,v);
    });
  };

  // Existing rows may have been drawn before this final override loaded. Rebuild catalog once,
  // after which fishing-guide.js will call this renderer only.
  queueMicrotask(()=>{try{if(typeof renderFishCatalog==='function')renderFishCatalog()}catch(e){console.warn('single fishing guide renderer init failed',e)}});
})();
