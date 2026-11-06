// 釣魚頁版面：第一次使用引導、「更多找釣場工具」只在有內容時顯示。
// 「今天釣什麼」與「一般魚剩最多的地圖」由各自的腳本直接放進 #fish-today-slot／#fish-more-tools-body。
(function(){
  'use strict';
  const KEY='fishOnboardingDismissed';
  const $=id=>document.getElementById(id);
  let forceOpen=false;

  function known(){try{return typeof getCaughtIds==='function'?getCaughtIds().length:0}catch{return 0}}
  function dismissed(){try{return localStorage.getItem(KEY)==='1'}catch{return false}}
  function setDismissed(v){try{if(v)localStorage.setItem(KEY,'1');else localStorage.removeItem(KEY)}catch{}}
  function update(){const box=$('fish-onboarding');if(box)box.hidden=!(forceOpen||(!dismissed()&&known()===0))}
  function scrollToEl(el){if(el)el.scrollIntoView({behavior:'smooth',block:'start'})}

  function init(){
    const box=$('fish-onboarding');
    if(box){
      $('fish-onboard-close')?.addEventListener('click',()=>{forceOpen=false;setDismissed(true);update()});
      $('fish-onboard-open')?.addEventListener('click',()=>{forceOpen=true;setDismissed(false);update();scrollToEl(box)});
      box.addEventListener('click',e=>{
        const b=e.target.closest('[data-fish-onboard]');if(!b)return;
        const act=b.dataset.fishOnboard;
        if(act==='import')$('import-fishcake')?.click();
        else if(act==='today')scrollToEl(document.querySelector('.fish-today-card')||$('fish-today-slot'));
        else if(act==='map')scrollToEl($('fish-explore-title')?.closest('.section-head'));
      });
      const res=$('fish-result');if(res)new MutationObserver(update).observe(res,{childList:true});
      window.addEventListener('ff14-data-restored',update);
      update();
    }
    const body=$('fish-more-tools-body'),more=$('fish-more-tools');
    if(body&&more){const sync=()=>{more.hidden=!body.children.length};new MutationObserver(sync).observe(body,{childList:true});sync()}
  }
  // 魚圖鑑還沒從 XIVAPI 讀完時，推薦按鈕先顯示「讀取中」，讀好自動重算；讀取失敗就給重試按鈕。
  const GUARDED={'fish-today-map-refresh':'fish-today-map-result','fish-today-refresh':'fish-today-result','fish-whitefish-refresh':'fish-whitefish-hotspot-result'};
  const WAIT_LIMIT_MS=180000;
  let waitTimer=0,waitFor=null;
  function catalogCount(){try{return window.FF14Fishing?.catalog()?.length||0}catch{return 0}}
  function loadFailed(){return window.__fishCatalogState==='failed'}
  function showWaiting(id){
    const box=$(GUARDED[id]);if(!box)return;
    box.innerHTML=loadFailed()
      ?'<div class="fish-wait">魚圖鑑資料讀取失敗，所以還沒辦法推薦。可能是 XIVAPI 暫時連不上。<button type="button" class="fish-primary" data-fish-retry>重新讀取魚資料</button></div>'
      :'<div class="fish-wait"><span class="fish-spinner" aria-hidden="true"></span>正在下載魚圖鑑資料（第一次開啟需要一點時間），讀好後會自動幫你算。</div>';
  }
  function waitThenRun(id){
    waitFor=id;showWaiting(id);clearInterval(waitTimer);const started=Date.now();let failedShown=loadFailed();
    waitTimer=setInterval(()=>{
      if(catalogCount()){clearInterval(waitTimer);const b=$(waitFor);waitFor=null;b?.click();return}
      const failed=loadFailed();if(failed!==failedShown){failedShown=failed;showWaiting(waitFor)}
      if(Date.now()-started>WAIT_LIMIT_MS)clearInterval(waitTimer);
    },800);
  }
  document.addEventListener('click',e=>{
    const retry=e.target.closest?.('[data-fish-retry]');
    if(retry){e.preventDefault();const id=waitFor||'fish-today-map-refresh';try{if(typeof refreshFishCatalog==='function')refreshFishCatalog(true)}catch{}waitThenRun(id);return}
    const b=e.target.closest?.('button');if(!b||!GUARDED[b.id]||catalogCount())return;
    e.preventDefault();e.stopImmediatePropagation();waitThenRun(b.id);
  },true);

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
