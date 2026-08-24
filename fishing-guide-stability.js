// Keep fishing method / bait / bite-time panels stable when the TC display layer mutates fish names.
(function(){
  'use strict';

  function readCatalog(){
    try{return JSON.parse(localStorage.getItem('fishCatalog')||'[]')||[]}catch{return []}
  }

  // fishing-guide.js originally reads the visible <strong> text as the lookup key.
  // After the TC layer translates that text, the English fish-method catalog no longer matches.
  // Always resolve the method lookup name from fishCatalog by itemId instead.
  const originalMeta=window.fgFishMetaFromRow;
  if(typeof originalMeta==='function'){
    window.fgFishMetaFromRow=function(row){
      const base=originalMeta(row)||{};
      const visibleName=row?.querySelector?.(':scope > div:first-child > strong')?.textContent?.trim()||base.name||'';
      let itemId=Number(base.itemId)||0;
      if(!itemId){
        const href=row?.querySelector?.('a[href*="/fish/"]')?.getAttribute('href')||'';
        const m=href.match(/\/fish\/(\d+)/);if(m)itemId=Number(m[1])||0;
      }
      const catalog=base.catalog||readCatalog().find(x=>Number(x.itemId)===itemId)||null;
      const sourceName=String(catalog?.name||base.name||visibleName).trim();
      return {...base,name:sourceName,displayName:visibleName,itemId,catalog};
    };
  }

  let repairQueued=false;
  function needsRepair(){
    const rows=document.querySelectorAll('#fish-catalog .fish-row');
    for(const row of rows){
      if(row.querySelector('.fish-method'))continue;
      const meta=typeof window.fgFishMetaFromRow==='function'?window.fgFishMetaFromRow(row):null;
      if(!meta?.itemId||meta?.catalog?.type==='spearfishing')continue;
      // Only request a repair when method data actually exists for this fish.
      if(typeof window.fgMethodForName==='function'&&window.fgMethodForName(meta.name))return true;
    }
    return false;
  }

  function repairMissingPanels(){
    if(repairQueued)return;
    repairQueued=true;
    queueMicrotask(()=>{
      repairQueued=false;
      if(!needsRepair())return;
      try{if(typeof window.renderFishingGuide==='function')window.renderFishingGuide()}catch(e){console.warn('repair fishing guide panel failed',e)}
    });
  }

  window.addEventListener('DOMContentLoaded',()=>{
    const catalog=document.getElementById('fish-catalog');
    if(catalog){
      const observer=new MutationObserver(()=>repairMissingPanels());
      observer.observe(catalog,{childList:true,subtree:true,characterData:true});
    }
    setTimeout(repairMissingPanels,500);
    setTimeout(repairMissingPanels,1800);
    setTimeout(repairMissingPanels,3500);
  });
})();
