// Keep the fishing catalog lightweight: do not build the full 1500+ fish DOM.
// The catalog data remains available for summary, picker, planner, and search.
(function(){
  'use strict';

  let placeholder=null;
  let catalogNode=null;
  let mounted=false;
  let wrapperInstalled=false;
  let originalRender=null;

  function detachCatalog(){
    const node=document.getElementById('fish-catalog');
    if(!node||!node.parentNode)return;
    placeholder=document.createComment('fish-catalog-deferred');
    node.parentNode.insertBefore(placeholder,node);
    catalogNode=node;
    node.remove();
  }

  function readStore(key,def=[]){
    try{return JSON.parse(localStorage.getItem(key))??def}catch{return def}
  }

  function uniqCount(rows){
    return new Set((rows||[]).map(x=>`${x.type||'fish'}:${Number(x.itemId)||0}`)).size;
  }

  function renderLightweightSummary(){
    const summary=document.getElementById('fish-map-summary');
    if(!summary)return;
    const catalog=readStore('fishCatalog',[]);
    const caught=new Set([
      ...(readStore('fishcakeCaughtIds',[])||[]),
      ...(readStore('fishCaughtIds',[])||[])
    ].map(Number));
    const skipped=new Set((readStore('fishSkippedIds',[])||[]).map(Number));
    const ordinaryRemaining=uniqCount(catalog.filter(x=>!caught.has(Number(x.itemId))&&!x.bigFish&&!skipped.has(Number(x.itemId))));
    summary.innerHTML=`外部圖鑑：${uniqCount(catalog)} 種　｜　已知已釣 ID：${caught.size}　｜　<strong>未記錄普通魚：${ordinaryRemaining}</strong>　｜　先跳過：${skipped.size}<br><span class="muted">為避免一次建立整本圖鑑造成卡頓，請先選地區／地圖／釣點，或輸入搜尋文字後再顯示魚清單。</span>`;
  }

  function hasNarrowScope(){
    const q=(document.getElementById('fish-search')?.value||'').trim();
    return q.length>0;
  }

  function installRenderGuard(){
    if(wrapperInstalled)return;
    const fn=window.renderFishCatalog;
    if(typeof fn!=='function')return;
    originalRender=fn;
    window.renderFishCatalog=function(){
      const box=document.getElementById('fish-catalog');
      if(!box)return;
      if(!hasNarrowScope()){
        renderLightweightSummary();
        box.innerHTML='<div class="empty">先選地區／地圖／釣點，或搜尋魚名，再顯示清單。</div>';
        return;
      }
      return originalRender.apply(this,arguments);
    };
    // Classic-script function declarations are globals; keep identifier calls pointed at the wrapper too.
    try{renderFishCatalog=window.renderFishCatalog}catch{}
    wrapperInstalled=true;
  }

  function mountCatalog(){
    if(mounted)return;
    mounted=true;
    if(placeholder?.parentNode&&catalogNode)placeholder.parentNode.replaceChild(catalogNode,placeholder);
    installRenderGuard();
    const run=()=>{
      installRenderGuard();
      if(typeof window.renderFishCatalog==='function')window.renderFishCatalog();
    };
    if(typeof requestIdleCallback==='function')requestIdleCallback(run,{timeout:250});
    else setTimeout(run,20);
  }

  detachCatalog();
  window.mountDeferredFishCatalog=mountCatalog;

  // Mount only when the fishing tab is opened. The full list still stays gated by a location/search scope.
  document.addEventListener('click',e=>{
    const button=e.target?.closest?.('nav button[data-tab="fishing"]');
    if(button)setTimeout(mountCatalog,0);
  },true);
})();
