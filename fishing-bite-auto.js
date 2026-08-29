// Auto-load visible fishing bite-time data and hide the per-fish "算秒數" button.
(function(){
  'use strict';

  const observed=new WeakSet();
  let observer=null;
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

  function observeButton(button){
    if(!button||observed.has(button))return;
    observed.add(button);
    button.hidden=true;
    if(observer)observer.observe(button);
    else loadButton(button);
  }

  function scan(root=document){
    root.querySelectorAll?.('#fish-catalog [data-fg-bite]').forEach(observeButton);
  }

  function scheduleScan(){
    clearTimeout(scanTimer);
    scanTimer=setTimeout(()=>scan(),30);
  }

  function init(){
    if('IntersectionObserver' in window){
      observer=new IntersectionObserver(entries=>{
        for(const entry of entries){
          if(!entry.isIntersecting)continue;
          observer.unobserve(entry.target);
          loadButton(entry.target);
        }
      },{root:null,rootMargin:'240px 0px',threshold:0.01});
    }
    scan();
    const catalog=document.getElementById('fish-catalog');
    if(catalog)new MutationObserver(scheduleScan).observe(catalog,{childList:true,subtree:true});
    document.addEventListener('ff14-fish-catalog-rendered',scheduleScan);
  }

  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
