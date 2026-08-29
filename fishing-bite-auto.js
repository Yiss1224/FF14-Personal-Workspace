// Auto-load bite-time data as soon as a fishing map/spot list is opened.
(function(){
  'use strict';

  const queued=new WeakSet();
  const runningSpots=new Set();
  const spotQueues=new Map();
  const MAX_SPOT_WORKERS=3;
  let activeSpotWorkers=0;
  let scanTimer=0;

  function canAutoLoad(button){
    return !!(button&&button.dataset?.fgBite&&button.dataset?.fgSpot&&button.dataset?.fgBait&&typeof window.fgLoadFishBite==='function');
  }

  async function loadButton(button){
    if(!canAutoLoad(button)||button.dataset.biteAutoLoaded==='1'||button.dataset.biteAutoLoading==='1')return;
    button.dataset.biteAutoLoading='1';
    button.hidden=true;
    const value=button.closest('.fish-method')?.querySelector('.fish-bite-value');
    if(value&&!String(value.textContent||'').includes('手動'))value.textContent='載入中…';
    try{
      await window.fgLoadFishBite(button,+button.dataset.fgBite,+button.dataset.fgSpot,button.dataset.fgBait,false);
      button.dataset.biteAutoLoaded='1';
    }catch(e){
      if(value)value.textContent='無社群秒數資料';
    }finally{
      button.dataset.biteAutoLoading='0';
      button.hidden=true;
    }
  }

  function pumpSpotQueues(){
    if(activeSpotWorkers>=MAX_SPOT_WORKERS)return;
    for(const [spotId,buttons] of spotQueues){
      if(activeSpotWorkers>=MAX_SPOT_WORKERS)break;
      if(runningSpots.has(spotId)||!buttons.length)continue;
      runningSpots.add(spotId);
      activeSpotWorkers++;
      spotQueues.delete(spotId);
      (async()=>{
        try{
          // First fish fetches the spot data; the rest then reuse the existing Lodinn spot cache.
          if(buttons[0])await loadButton(buttons[0]);
          for(let i=1;i<buttons.length;i++)await loadButton(buttons[i]);
        }finally{
          runningSpots.delete(spotId);
          activeSpotWorkers--;
          pumpSpotQueues();
        }
      })();
    }
  }

  function queueButtons(root){
    const buttons=[...(root?.querySelectorAll?.('[data-fg-bite]')||[])];
    for(const button of buttons){
      button.hidden=true;
      if(queued.has(button)||button.dataset.biteAutoLoaded==='1'||button.dataset.biteAutoLoading==='1')continue;
      queued.add(button);
      const spotId=String(button.dataset.fgSpot||'');
      if(!spotId)continue;
      if(!spotQueues.has(spotId))spotQueues.set(spotId,[]);
      spotQueues.get(spotId).push(button);
    }
    pumpSpotQueues();
  }

  function scanOpenLists(){
    const catalog=document.getElementById('fish-catalog');if(!catalog)return;
    // Only load sections the user has actually opened. This avoids preloading every hidden map.
    catalog.querySelectorAll('details.spot[open]').forEach(queueButtons);
    // Fallback for layouts where fish rows are directly under an opened zone.
    catalog.querySelectorAll('details.zone[open]').forEach(zone=>{
      if(!zone.querySelector('details.spot'))queueButtons(zone);
    });
  }

  function scheduleScan(){
    clearTimeout(scanTimer);
    scanTimer=setTimeout(scanOpenLists,20);
  }

  function init(){
    const catalog=document.getElementById('fish-catalog');if(!catalog)return;
    // The toggle event fires when a map/spot <details> is opened or closed.
    catalog.addEventListener('toggle',e=>{
      const details=e.target;
      if(!(details instanceof HTMLDetailsElement)||!details.open)return;
      if(details.matches('details.spot'))queueButtons(details);
      else if(details.matches('details.zone')){
        details.querySelectorAll('details.spot[open]').forEach(queueButtons);
        if(!details.querySelector('details.spot'))queueButtons(details);
      }
    },true);
    new MutationObserver(scheduleScan).observe(catalog,{childList:true,subtree:true});
    document.addEventListener('ff14-fish-catalog-rendered',scheduleScan);
    scanOpenLists();
  }

  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
