// Keep fishing method / bait / bite-time panels stable, including fish not covered by fishData.yaml.
(function(){
  'use strict';

  function readCatalog(){
    try{return JSON.parse(localStorage.getItem('fishCatalog')||'[]')||[]}catch{return []}
  }
  function esc(v){
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function metaFromRow(row){
    const visibleName=row?.querySelector?.(':scope > div:first-child > strong')?.textContent?.trim()||'';
    const href=row?.querySelector?.('a[href*="/fish/"]')?.getAttribute('href')||'';
    const m=href.match(/\/fish\/(\d+)/);
    const itemId=m?Number(m[1])||0:0;
    const catalog=readCatalog().find(x=>Number(x.itemId)===itemId)||null;
    const sourceName=String(catalog?.name||visibleName).trim();
    return {visibleName,sourceName,itemId,catalog};
  }
  function methodFor(meta){
    try{
      if(typeof fgMethodForName==='function')return fgMethodForName(meta.sourceName)||fgMethodForName(meta.visibleName)||null;
    }catch{}
    return null;
  }

  // fishing-guide.js reads the visible fish name as its English lookup key. After the
  // Traditional-Chinese display layer runs, that can fail. Patch the original helper
  // through the shared classic-script global binding instead of relying on window.*.
  try{
    if(typeof fgFishMetaFromRow==='function'){
      const originalMeta=fgFishMetaFromRow;
      fgFishMetaFromRow=function(row){
        const base=originalMeta(row)||{};
        const stable=metaFromRow(row);
        return {
          ...base,
          name:stable.sourceName||base.name||stable.visibleName,
          displayName:stable.visibleName,
          itemId:stable.itemId||Number(base.itemId)||0,
          catalog:stable.catalog||base.catalog||null
        };
      };
    }
  }catch(e){console.warn('fish guide meta patch failed',e)}

  async function loadFallbackBite(button){
    const row=button.closest('.fish-row'),meta=metaFromRow(row),value=row?.querySelector('.fish-method-fallback .fish-bite-value');
    if(!meta.itemId||!meta.catalog?.spotId||!value)return;
    button.disabled=true;value.textContent='載入中…';
    try{
      if(typeof fgLoadBiteSpot!=='function'||typeof fgBestAvailableBite!=='function'||typeof fgFormatBiteStat!=='function')throw new Error('秒數模組尚未就緒');
      const data=await fgLoadBiteSpot(Number(meta.catalog.spotId),false);
      const stat=fgBestAvailableBite(data,meta.itemId,0);
      value.textContent=fgFormatBiteStat(stat,data);
    }catch(e){
      value.textContent=`讀取失敗：${e.message}`;
    }finally{button.disabled=false}
  }

  function addFallbackPanels(){
    document.querySelectorAll('#fish-catalog .fish-row').forEach(row=>{
      if(row.querySelector('.fish-method'))return;
      const meta=metaFromRow(row);
      if(!meta.itemId||meta.catalog?.type==='spearfishing')return;
      if(methodFor(meta))return; // normal fish: let fishing-guide.js render the full panel.

      const host=row.querySelector(':scope > div:first-child');if(!host)return;
      const panel=document.createElement('div');panel.className='fish-method fish-method-fallback';
      const spotId=Number(meta.catalog?.spotId)||0,spotName=meta.catalog?.spotName||'';
      const biteButton=spotId?'<button type="button" class="mini-btn" data-fgs-bite>查秒數</button>':'';
      const lodinn=`https://lodinn.github.io/biterates?spot=${encodeURIComponent(spotName)}`;
      panel.innerHTML=`<div class="fish-method-grid"><span>🪱 <b>推薦路線</b> <span class="muted">目前釣法來源未收錄（出海垂釣等內容）</span></span><span>🎣 <b>咬鉤／提鉤</b> <span class="muted">來源未提供</span></span><span>⏰ <b>時間／天氣</b> <span class="muted">依出海垂釣航線／當場條件</span></span><span class="fish-bite-line">⏱ <b>秒數</b> <span class="fish-bite-value">尚未載入</span> ${biteButton} <a href="${esc(lodinn)}" target="_blank" rel="noopener">Lodinn</a></span></div>`;
      host.appendChild(panel);
    });
  }

  let repairTimer=0,repairing=false;
  function repairPanels(){
    if(repairing)return;
    clearTimeout(repairTimer);
    repairTimer=setTimeout(()=>{
      repairing=true;
      try{
        let hasMissingKnown=false;
        document.querySelectorAll('#fish-catalog .fish-row').forEach(row=>{
          if(row.querySelector('.fish-method'))return;
          const meta=metaFromRow(row);
          if(meta.itemId&&meta.catalog?.type!=='spearfishing'&&methodFor(meta))hasMissingKnown=true;
        });
        if(hasMissingKnown&&typeof window.renderFishingGuide==='function')window.renderFishingGuide();
        // Full guide rendering may replace rows/panels. Add explicit fallback only afterwards.
        setTimeout(addFallbackPanels,0);
      }catch(e){console.warn('repair fishing guide panel failed',e)}
      finally{repairing=false}
    },60);
  }

  window.addEventListener('DOMContentLoaded',()=>{
    const catalog=document.getElementById('fish-catalog');
    if(catalog){
      catalog.addEventListener('click',e=>{
        const b=e.target.closest('[data-fgs-bite]');if(b){e.preventDefault();loadFallbackBite(b)}
      });
      const observer=new MutationObserver(repairPanels);
      observer.observe(catalog,{childList:true,subtree:true,characterData:true});
    }
    repairPanels();
    setTimeout(repairPanels,700);
    setTimeout(repairPanels,1800);
    setTimeout(repairPanels,3500);
  });
})();
