// Keep the fishing catalog lightweight: never build the full 1500+ fish DOM without a narrow scope.
// The catalog data remains available for summary, picker, planner, and search.
(function(){
  'use strict';

  const headerVersion=(document.querySelector('header p')?.textContent.match(/v\d{4}\.\d{2}\.\d{2}\.\d+/)||[])[0]||'';
  let anchor=null;
  let catalogNode=null;
  let mounted=false;
  let wrapperInstalled=false;
  let originalRender=null;
  let guardedRender=null;
  let catalogCache=null;
  let catalogCacheStamp='';

  function enforceHeaderVersion(){
    if(!headerVersion)return;
    const line=document.querySelector('header p');
    if(!line)return;
    const next=line.textContent.replace(/v\d{4}\.\d{2}\.\d{2}\.\d+$/,headerVersion);
    if(next!==line.textContent)line.textContent=next;
  }

  function installVersionGuard(){
    const line=document.querySelector('header p');
    if(!line||!headerVersion)return;
    enforceHeaderVersion();
    new MutationObserver(enforceHeaderVersion).observe(line,{childList:true,characterData:true,subtree:true});
  }

  function detachInitialCatalog(){
    const node=document.getElementById('fish-catalog');
    if(!node||!node.parentNode)return;
    anchor=document.createComment('fish-catalog-deferred');
    node.parentNode.insertBefore(anchor,node);
    catalogNode=node;
    node.remove();
    mounted=false;
  }

  function readStore(key,def=[]){
    try{return JSON.parse(localStorage.getItem(key))??def}catch{return def}
  }

  function readCatalog(){
    const stamp=`${localStorage.getItem('fishCatalogUpdatedAt')||''}|${localStorage.getItem('fishCatalogSchema')||''}`;
    if(catalogCache&&catalogCacheStamp===stamp)return catalogCache;
    catalogCache=readStore('fishCatalog',[]);
    catalogCacheStamp=stamp;
    return catalogCache;
  }

  function uniqCount(rows){
    return new Set((rows||[]).map(x=>`${x.type||'fish'}:${Number(x.itemId)||0}`)).size;
  }

  function renderLightweightSummary(){
    const summary=document.getElementById('fish-map-summary');
    if(!summary)return;
    const catalog=readCatalog();
    const caught=new Set([
      ...(readStore('fishcakeCaughtIds',[])||[]),
      ...(readStore('fishCaughtIds',[])||[])
    ].map(Number));
    const skipped=new Set((readStore('fishSkippedIds',[])||[]).map(Number));
    const ordinaryRemaining=uniqCount(catalog.filter(x=>!caught.has(Number(x.itemId))&&!x.bigFish&&!skipped.has(Number(x.itemId))));
    summary.innerHTML=`外部圖鑑：${uniqCount(catalog)} 種　｜　已知已釣 ID：${caught.size}　｜　<strong>未記錄普通魚：${ordinaryRemaining}</strong>　｜　先跳過：${skipped.size}<br><span class="muted">為避免一次建立整本圖鑑造成卡頓，請先選到「地圖」，或直接搜尋魚名／釣點後再顯示魚清單。</span>`;
  }

  function value(id){return String(document.getElementById(id)?.value||'').trim()}

  function hasNarrowScope(){
    const zone=value('fish-picker-zone');
    const spot=value('fish-picker-spot');
    if(zone||spot)return true;

    const q=value('fish-search');
    if(!q)return false;

    // The picker mirrors a region into the search box. Region-only is still too broad,
    // so only treat it as a real manual search when it differs from the selected region.
    const region=value('fish-picker-region');
    if(region&&q===region)return false;
    return q.length>=2;
  }

  function installRenderGuard(){
    if(wrapperInstalled)return;
    const fn=window.renderFishCatalog;
    if(typeof fn!=='function')return;
    originalRender=fn;
    guardedRender=function(){
      const box=document.getElementById('fish-catalog');
      if(!box)return;
      if(!hasNarrowScope()){
        renderLightweightSummary();
        box.innerHTML='<div class="empty">先選到地圖／釣點，或搜尋魚名，再顯示魚清單。</div>';
        return;
      }
      return originalRender.apply(this,arguments);
    };
    window.renderFishCatalog=guardedRender;
    // Classic-script function declarations are globals; redirect identifier calls when possible.
    try{renderFishCatalog=guardedRender}catch{}
    wrapperInstalled=true;
  }

  function mountCatalog(){
    if(mounted||!catalogNode||!anchor?.parentNode)return;
    anchor.parentNode.insertBefore(catalogNode,anchor.nextSibling);
    mounted=true;
  }

  function unmountCatalog(){
    if(!catalogNode)return;
    if(mounted){
      // Drop potentially large generated DOM before detaching so reopening stays cheap.
      catalogNode.replaceChildren();
      catalogNode.remove();
      mounted=false;
    }
    renderLightweightSummary();
  }

  function renderScopedCatalog(){
    installRenderGuard();
    if(!hasNarrowScope()){
      unmountCatalog();
      return;
    }
    mountCatalog();
    const run=()=>{
      installRenderGuard();
      const fn=window.renderFishCatalog;
      if(typeof fn==='function')fn();
    };
    if(typeof requestIdleCallback==='function')requestIdleCallback(run,{timeout:120});
    else setTimeout(run,0);
  }

  function syncScopeNow(){
    if(hasNarrowScope())return;
    // Do this synchronously in capture phase. app.js still has old direct handlers;
    // keeping #fish-catalog detached makes those handlers return immediately.
    unmountCatalog();
  }

  function scheduleScopeSync(){setTimeout(renderScopedCatalog,0)}

  detachInitialCatalog();
  installVersionGuard();
  window.mountDeferredFishCatalog=renderScopedCatalog;

  // Opening the fishing tab itself must stay cheap. Do not mount the giant catalog here.
  document.addEventListener('click',e=>{
    const button=e.target?.closest?.('nav button[data-tab="fishing"]');
    if(!button)return;
    renderLightweightSummary();
    enforceHeaderVersion();
  },true);

  // Mount only after the user narrows the scope. If the scope is cleared, detach before
  // app.js can accidentally run its original full-catalog renderer.
  document.addEventListener('input',e=>{
    if(e.target?.id!=='fish-search')return;
    syncScopeNow();
    scheduleScopeSync();
  },true);

  document.addEventListener('change',e=>{
    const id=e.target?.id||'';
    if(!['fish-picker-region','fish-picker-zone','fish-picker-spot','fish-only-missing','fish-hide-big','fish-include-spear','fish-hide-skipped'].includes(id))return;
    if(id==='fish-picker-region'&&!value('fish-picker-region'))unmountCatalog();
    scheduleScopeSync();
  },true);

  window.addEventListener('DOMContentLoaded',()=>{
    installRenderGuard();
    renderLightweightSummary();
    enforceHeaderVersion();
  });
})();
