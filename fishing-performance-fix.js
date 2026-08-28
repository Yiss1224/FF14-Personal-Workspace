// Defer the very large fishing catalog DOM until the fishing tab is actually opened.
// This keeps dashboard/leveling startup light without changing fishing data or planner logic.
(function(){
  'use strict';

  let placeholder=null;
  let catalogNode=null;
  let mounted=false;

  function detachCatalog(){
    const node=document.getElementById('fish-catalog');
    if(!node||!node.parentNode)return;
    placeholder=document.createComment('fish-catalog-deferred');
    node.parentNode.insertBefore(placeholder,node);
    catalogNode=node;
    node.remove();
  }

  function renderDeferredCatalog(){
    try{
      if(typeof window.renderFishCatalog==='function')window.renderFishCatalog();
      else if(typeof renderFishCatalog==='function')renderFishCatalog();
    }catch(e){console.warn('deferred fish catalog render failed',e)}
  }

  function mountCatalog(){
    if(mounted)return;
    mounted=true;
    if(placeholder?.parentNode&&catalogNode)placeholder.parentNode.replaceChild(catalogNode,placeholder);
    const run=()=>renderDeferredCatalog();
    if(typeof requestIdleCallback==='function')requestIdleCallback(run,{timeout:350});
    else setTimeout(run,40);
  }

  detachCatalog();
  window.mountDeferredFishCatalog=mountCatalog;

  // Capture the tab click before the normal tab handler, then mount after the tab switch.
  document.addEventListener('click',e=>{
    const button=e.target?.closest?.('nav button[data-tab="fishing"]');
    if(button)setTimeout(mountCatalog,0);
  },true);
})();
