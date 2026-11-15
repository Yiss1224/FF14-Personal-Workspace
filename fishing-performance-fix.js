// Keep the fishing catalog lightweight: never build the full 1500+ fish DOM without a narrow scope.
// The catalog data remains available for summary, picker, planner, and search.
(function(){
  'use strict';

  let anchor=null;
  let catalogNode=null;
  let mounted=false;
  let wrapperInstalled=false;
  let originalRender=null;
  let guardedRender=null;
  let scopeSyncTimer=null;
  let catalogRenderTask=null;

  function notifyCatalogRendered(){
    try{document.dispatchEvent(new CustomEvent('ff14-fish-catalog-rendered'))}catch{}
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

  // 共用的已解析圖鑑：內容一變就會重讀。以前這裡自己用「更新時間＋版本」當快取鍵，
  // 補刺魚之類不改這兩個值的寫入就看不到，摘要會停在舊的魚種數。
  function readCatalog(){return window.FF14Fishing.catalog()}

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
    summary.innerHTML=`圖鑑：${uniqCount(catalog)} 種　｜　已釣：${caught.size}　｜　<strong>還沒釣的一般魚：${ordinaryRemaining}</strong>　｜　先跳過：${skipped.size}<br><span class="muted">先選一張地圖，或直接搜尋魚名／釣點，下面就會列出魚。</span>`;
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
      // 清單還沒掛上頁面（沒選地圖）時，圖鑑下載完也要更新上面那行摘要；以前直接返回，第一次進來會一直顯示「圖鑑：0 種」。
      if(!box){renderLightweightSummary();return}
      if(!hasNarrowScope()){
        renderLightweightSummary();
        box.innerHTML='<div class="empty">先選到地圖／釣點，或搜尋魚名，再顯示魚清單。</div>';
        notifyCatalogRendered();
        return;
      }
      const out=originalRender.apply(this,arguments);
      notifyCatalogRendered();
      return out;
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

  function cancelCatalogRender(){
    if(catalogRenderTask===null)return;
    if(typeof cancelIdleCallback==='function')cancelIdleCallback(catalogRenderTask);
    else clearTimeout(catalogRenderTask);
    catalogRenderTask=null;
  }

  function unmountCatalog(){
    if(!catalogNode)return;
    cancelCatalogRender();
    if(mounted){
      // Drop potentially large generated DOM before detaching so reopening stays cheap.
      catalogNode.replaceChildren();
      catalogNode.remove();
      mounted=false;
    }
    renderLightweightSummary();
  }

  function renderScopedCatalog(){
    scopeSyncTimer=null;
    installRenderGuard();
    if(!hasNarrowScope()){
      unmountCatalog();
      return;
    }
    mountCatalog();
    const run=()=>{
      catalogRenderTask=null;
      installRenderGuard();
      const fn=window.renderFishCatalog;
      if(typeof fn==='function')fn();
    };
    cancelCatalogRender();
    if(typeof requestIdleCallback==='function')catalogRenderTask=requestIdleCallback(run,{timeout:120});
    else catalogRenderTask=setTimeout(run,0);
  }

  function syncScopeNow(){
    if(hasNarrowScope())return;
    // Do this synchronously in capture phase. app.js still has old direct handlers;
    // keeping #fish-catalog detached makes those handlers return immediately.
    unmountCatalog();
  }

  function scheduleScopeSync(delay=0){
    if(scopeSyncTimer!==null)clearTimeout(scopeSyncTimer);
    scopeSyncTimer=setTimeout(renderScopedCatalog,delay);
  }

  detachInitialCatalog();
  window.mountDeferredFishCatalog=renderScopedCatalog;

  // Opening the fishing tab itself must stay cheap. Do not mount the giant catalog here.
  document.addEventListener('click',e=>{
    const button=e.target?.closest?.('nav button[data-tab="fishing"]');
    if(!button)return;
    renderLightweightSummary();
  },true);

  // Mount only after the user narrows the scope. If the scope is cleared, detach before
  // app.js can accidentally run its original full-catalog renderer.
  document.addEventListener('input',e=>{
    if(e.target?.id!=='fish-search')return;
    syncScopeNow();
    // Typing used to queue a full catalog render for every keystroke. A short debounce
    // keeps the result identical while only rendering the final query in a burst.
    scheduleScopeSync(80);
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

    // fishing-guide.js builds the Session route controls immediately before #fish-catalog.
    // Temporarily mount the empty/lightweight catalog for the rest of DOMContentLoaded so
    // that UI can be created, then detach the catalog again unless the user already chose a map.
    mountCatalog();
    setTimeout(()=>{
      if(!hasNarrowScope())unmountCatalog();
    },0);
  });
})();
