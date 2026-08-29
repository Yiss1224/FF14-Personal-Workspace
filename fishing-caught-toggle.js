// Toggle fish caught state in-place without rebuilding the full catalog.
(function(){
  'use strict';

  function read(key,def=[]){try{return JSON.parse(localStorage.getItem(key))??def}catch{return def}}
  function ids(){try{return typeof window.getCaughtIds==='function'?window.getCaughtIds().map(Number):[...(read('fishcakeCaughtIds',[])||[]),...(read('fishCaughtIds',[])||[])].map(Number)}catch{return[]}}
  function write(next){
    const clean=[...new Set(next.map(Number).filter(Number.isFinite))];
    if(typeof window.setCaughtIds==='function')window.setCaughtIds(clean);
    else{
      localStorage.setItem('fishCaughtIds',JSON.stringify(clean));
      localStorage.setItem('fishcakeCaughtIds',JSON.stringify(clean));
    }
  }
  function uniqueCount(rows){return new Set((rows||[]).map(x=>`${x.type||'fish'}:${Number(x.itemId)||0}`)).size}
  function updateSummary(){
    const summary=document.getElementById('fish-map-summary');if(!summary)return;
    const catalog=read('fishCatalog',[]),caught=new Set(ids()),skipped=new Set(typeof window.getSkippedIds==='function'?window.getSkippedIds():read('fishSkippedIds',[]));
    const ordinaryRemaining=uniqueCount(catalog.filter(x=>!caught.has(Number(x.itemId))&&!x.bigFish&&!skipped.has(Number(x.itemId))));
    summary.innerHTML=`外部圖鑑：${uniqueCount(catalog)} 種　｜　已知已釣 ID：${caught.size}　｜　<strong>未記錄普通魚：${ordinaryRemaining}</strong>　｜　先跳過：${skipped.size}<br><span class="muted">同一魚種可出現在多個釣場，但圖鑑總數只算一次。魚糕可能漏記，所以「未記錄」不等於一定沒釣過。</span>`;
  }
  function decrementBadge(details){
    const badge=details?.querySelector?.(':scope > summary .badge');if(!badge)return;
    badge.textContent=String(Math.max(0,(Number(badge.textContent)||0)-1));
  }
  function normalizeCaughtButtons(root=document){
    root.querySelectorAll?.('#fish-catalog .fish-actions .done').forEach(done=>{
      const skip=done.parentElement?.querySelector?.('[data-skip]'),itemId=Number(skip?.dataset?.skip);if(!itemId)return;
      const button=document.createElement('button');
      button.type='button';button.dataset.caught=String(itemId);button.dataset.caughtState='1';button.setAttribute('aria-pressed','true');button.textContent='✓ 已釣到（再按取消）';
      done.replaceWith(button);
    });
  }
  function toggle(itemId,button){
    itemId=Number(itemId);if(!Number.isFinite(itemId))return;
    const current=ids(),wasCaught=current.includes(itemId),next=wasCaught?current.filter(x=>x!==itemId):[...current,itemId];
    write(next);
    try{window.renderFish?.()}catch{}
    updateSummary();

    const onlyMissing=document.getElementById('fish-only-missing')?.checked??true;
    const buttons=[...document.querySelectorAll(`#fish-catalog [data-caught="${itemId}"]`)];
    if(wasCaught){
      buttons.forEach(b=>{b.dataset.caughtState='0';b.setAttribute('aria-pressed','false');b.textContent='標記已釣'});
    }else if(onlyMissing){
      const seenZones=new Set();
      for(const b of buttons){
        const row=b.closest('.fish-row');if(!row)continue;
        const spot=row.closest('details.spot'),zone=row.closest('details.zone');
        row.remove();decrementBadge(spot);if(zone&&!seenZones.has(zone)){decrementBadge(zone);seenZones.add(zone)}
        const list=spot?.querySelector('.fish-list');if(list&&!list.querySelector('.fish-row'))spot.remove();
        if(zone&&!zone.querySelector('details.spot'))zone.remove();
      }
    }else{
      buttons.forEach(b=>{b.dataset.caughtState='1';b.setAttribute('aria-pressed','true');b.textContent='✓ 已釣到（再按取消）'});
    }
    try{window.renderBaitShoppingList?.()}catch{}
    try{window.renderRoutePlanner?.()}catch{}
    try{window.refreshFishingSessionRouteMap?.()}catch{}
  }

  // Register immediately so this capture handler runs before the older one that is installed on DOMContentLoaded.
  document.addEventListener('click',e=>{
    const button=e.target?.closest?.('#fish-catalog [data-caught]');if(!button)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    toggle(Number(button.dataset.caught),button);
  },true);

  function init(){
    normalizeCaughtButtons();
    const root=document.getElementById('fish-catalog');if(!root)return;
    let timer=0;
    new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>normalizeCaughtButtons(root),0)}).observe(root,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
