// Overlay the already-calculated Session route on the existing FF14 fishing map.
// The map shows stop order only; it deliberately does not draw straight-line paths,
// because those would imply a travel route the game data does not actually provide.
(function(){
  'use strict';

  let timer=null;

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function tc(v){const s=String(v||'');try{return typeof window.ff14TcText==='function'?window.ff14TcText(s):s}catch{return s}}
  function pickerValue(id){return String(document.getElementById(id)?.value||'')}

  function rawStops(){
    return [...document.querySelectorAll('#fish-route-result [data-session-route-spot]')].map((btn,index)=>({
      order:index+1,
      region:btn.dataset.region||'',
      zone:btn.dataset.zone||'',
      spot:btn.dataset.spot||''
    })).filter(x=>x.spot);
  }

  function routeGroups(){
    const out=[];
    for(const stop of rawStops()){
      const last=out[out.length-1];
      if(last&&last.spot===stop.spot&&last.region===stop.region&&last.zone===stop.zone){last.orders.push(stop.order);continue}
      out.push({...stop,orders:[stop.order]});
    }
    return out;
  }

  function orderLabel(orders){
    if(!orders?.length)return'';
    if(orders.length===1)return String(orders[0]);
    const consecutive=orders.every((n,i)=>i===0||n===orders[i-1]+1);
    return consecutive?`${orders[0]}–${orders[orders.length-1]}`:orders.join('·');
  }

  function clearOverlay(){
    document.querySelectorAll('#fish-zone-map-body .ff14-map-marker.session-route').forEach(marker=>{
      marker.classList.remove('session-route');
      marker.querySelector('.ff14-route-orders')?.remove();
    });
    document.querySelectorAll('#fish-zone-map-body .fish-map-fallback [data-map-spot].session-route-fallback').forEach(btn=>{
      btn.classList.remove('session-route-fallback');
      delete btn.dataset.routeOrder;
    });
    document.querySelector('#fish-zone-map-body .ff14-route-line-layer')?.remove();
    document.getElementById('fish-session-route-map-note')?.remove();
  }

  function addOrders(marker,labels){
    if(!marker||!labels.length)return;
    marker.classList.add('session-route');
    const wrap=document.createElement('span');wrap.className='ff14-route-orders';
    for(const label of labels){
      const badge=document.createElement('span');badge.className='ff14-route-order';badge.textContent=label;wrap.appendChild(badge);
    }
    marker.appendChild(wrap);
  }

  function applyOverlay(){
    clearOverlay();
    const body=document.getElementById('fish-zone-map-body');if(!body)return;
    const region=pickerValue('fish-picker-region'),zone=pickerValue('fish-picker-zone');if(!zone)return;
    const groups=routeGroups().filter(x=>(!region||!x.region||x.region===region)&&(!x.zone||x.zone===zone));
    if(!groups.length)return;

    const bySpot=new Map();
    for(const group of groups){
      if(!bySpot.has(group.spot))bySpot.set(group.spot,[]);
      bySpot.get(group.spot).push(orderLabel(group.orders));
    }

    const markerMap=new Map([...body.querySelectorAll('.ff14-map-marker[data-map-spot]')].map(m=>[m.dataset.mapSpot,m]));
    for(const [spot,labels] of bySpot)addOrders(markerMap.get(spot),labels);

    body.querySelectorAll('.fish-map-fallback [data-map-spot]').forEach(btn=>{
      const labels=bySpot.get(btn.dataset.mapSpot)||[];if(!labels.length)return;
      btn.classList.add('session-route-fallback');btn.dataset.routeOrder=labels.join('/');
    });

    const title=body.querySelector('.fish-map-title');
    if(title){
      const note=document.createElement('div');note.id='fish-session-route-map-note';note.className='fish-session-route-map-note';
      note.innerHTML=`<strong>Session 順序</strong> ${groups.map(g=>`<span>${esc(orderLabel(g.orders))}. ${esc(tc(g.spot))}</span>`).join('<span class="route-map-arrow">→</span>')}`;
      title.insertAdjacentElement('afterend',note);
    }
  }

  function schedule(delay=60){clearTimeout(timer);timer=setTimeout(applyOverlay,delay)}

  function addStyles(){
    if(document.getElementById('fish-session-route-map-style'))return;
    const style=document.createElement('style');style.id='fish-session-route-map-style';style.textContent=`
      .ff14-map-marker.session-route{z-index:4}
      .ff14-route-orders{position:absolute;left:10px;top:-24px;display:flex;gap:2px;pointer-events:none}
      .ff14-route-order{display:grid;place-items:center;min-width:20px;height:20px;padding:0 4px;border-radius:999px;background:Canvas;color:CanvasText;border:2px solid currentColor;font-size:11px;font-weight:900;line-height:1;box-shadow:0 1px 4px rgba(0,0,0,.45)}
      .fish-session-route-map-note{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin:-2px 0 8px;font-size:12px}
      .fish-session-route-map-note>span{white-space:nowrap}.route-map-arrow{opacity:.55}
      .fish-map-fallback [data-map-spot].session-route-fallback::before{content:attr(data-route-order);display:inline-grid;place-items:center;min-width:18px;height:18px;margin-right:5px;border-radius:999px;border:1px solid currentColor;font-size:10px;font-weight:800}
    `;document.head.appendChild(style);
  }

  function init(){
    addStyles();
    const result=document.getElementById('fish-route-result');
    if(result)new MutationObserver(()=>schedule(30)).observe(result,{childList:true,subtree:true});
    document.addEventListener('change',e=>{if(['fish-picker-region','fish-picker-zone','fish-picker-spot'].includes(e.target?.id))schedule(150)});
    schedule(300);
  }

  window.refreshFishingSessionRouteMap=applyOverlay;
  window.addEventListener('DOMContentLoaded',init);
})();
