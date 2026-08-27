// Overlay the already-calculated Session route on the existing FF14 fishing map.
(function(){
  'use strict';

  let timer=null;

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function tc(v){const s=String(v||'');try{return typeof window.ff14TcText==='function'?window.ff14TcText(s):s}catch{return s}}
  function pickerValue(id){return String(document.getElementById(id)?.value||'')}

  function routeStops(){
    return [...document.querySelectorAll('#fish-route-result [data-session-route-spot]')].map((btn,index)=>({
      order:index+1,
      region:btn.dataset.region||'',
      zone:btn.dataset.zone||'',
      spot:btn.dataset.spot||''
    })).filter(x=>x.spot);
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

  function addOrders(marker,orders){
    if(!marker||!orders.length)return;
    marker.classList.add('session-route');
    const wrap=document.createElement('span');
    wrap.className='ff14-route-orders';
    for(const order of orders){
      const badge=document.createElement('span');
      badge.className='ff14-route-order';
      badge.textContent=String(order);
      wrap.appendChild(badge);
    }
    marker.appendChild(wrap);
  }

  function drawLines(markersWrap,points){
    if(!markersWrap||points.length<2)return;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('class','ff14-route-line-layer');
    svg.setAttribute('viewBox','0 0 100 100');
    svg.setAttribute('preserveAspectRatio','none');
    const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');
    line.setAttribute('points',points.map(p=>`${p.left},${p.top}`).join(' '));
    line.setAttribute('class','ff14-route-line');
    svg.appendChild(line);
    markersWrap.prepend(svg);
  }

  function applyOverlay(){
    clearOverlay();
    const body=document.getElementById('fish-zone-map-body');
    if(!body)return;
    const region=pickerValue('fish-picker-region'),zone=pickerValue('fish-picker-zone');
    if(!zone)return;
    const stops=routeStops().filter(x=>(!region||!x.region||x.region===region)&&(!x.zone||x.zone===zone));
    if(!stops.length)return;

    const bySpot=new Map();
    for(const stop of stops){
      if(!bySpot.has(stop.spot))bySpot.set(stop.spot,[]);
      bySpot.get(stop.spot).push(stop.order);
    }

    const markerMap=new Map([...body.querySelectorAll('.ff14-map-marker[data-map-spot]')].map(m=>[m.dataset.mapSpot,m]));
    const points=[];
    for(const stop of stops){
      const marker=markerMap.get(stop.spot);
      if(!marker)continue;
      const left=parseFloat(marker.style.left),top=parseFloat(marker.style.top);
      if(Number.isFinite(left)&&Number.isFinite(top))points.push({order:stop.order,left,top});
    }
    for(const [spot,orders] of bySpot)addOrders(markerMap.get(spot),orders);
    points.sort((a,b)=>a.order-b.order);
    drawLines(body.querySelector('.ff14-map-markers'),points);

    body.querySelectorAll('.fish-map-fallback [data-map-spot]').forEach(btn=>{
      const orders=bySpot.get(btn.dataset.mapSpot)||[];
      if(!orders.length)return;
      btn.classList.add('session-route-fallback');
      btn.dataset.routeOrder=orders.join('·');
    });

    const title=body.querySelector('.fish-map-title');
    if(title){
      const note=document.createElement('div');
      note.id='fish-session-route-map-note';
      note.className='fish-session-route-map-note';
      note.innerHTML=`<strong>Session 路線</strong> ${stops.map(s=>`<span>${s.order}. ${esc(tc(s.spot))}</span>`).join('<span class="route-map-arrow">→</span>')}`;
      title.insertAdjacentElement('afterend',note);
    }
  }

  function schedule(delay=60){
    clearTimeout(timer);
    timer=setTimeout(()=>{
      applyOverlay();
      // renderMap can finish shortly after the Session result; retry a few finite times.
      setTimeout(applyOverlay,220);
      setTimeout(applyOverlay,700);
    },delay);
  }

  function addStyles(){
    if(document.getElementById('fish-session-route-map-style'))return;
    const style=document.createElement('style');
    style.id='fish-session-route-map-style';
    style.textContent=`
      .ff14-map-marker.session-route{z-index:4}
      .ff14-route-orders{position:absolute;left:10px;top:-24px;display:flex;gap:2px;pointer-events:none}
      .ff14-route-order{display:grid;place-items:center;min-width:20px;height:20px;padding:0 4px;border-radius:999px;background:Canvas;color:CanvasText;border:2px solid currentColor;font-size:11px;font-weight:900;line-height:1;box-shadow:0 1px 4px rgba(0,0,0,.45)}
      .ff14-route-line-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;color:CanvasText;filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))}
      .ff14-route-line{fill:none;stroke:currentColor;stroke-width:.7;stroke-linecap:round;stroke-linejoin:round;opacity:.9;vector-effect:non-scaling-stroke}
      .fish-session-route-map-note{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin:-2px 0 8px;font-size:12px}
      .fish-session-route-map-note>span{white-space:nowrap}.route-map-arrow{opacity:.55}
      .fish-map-fallback [data-map-spot].session-route-fallback::before{content:attr(data-route-order);display:inline-grid;place-items:center;min-width:18px;height:18px;margin-right:5px;border-radius:999px;border:1px solid currentColor;font-size:10px;font-weight:800}
    `;
    document.head.appendChild(style);
  }

  function init(){
    addStyles();
    const result=document.getElementById('fish-route-result');
    if(result)new MutationObserver(()=>schedule(30)).observe(result,{childList:true,subtree:true});
    document.addEventListener('change',e=>{
      if(['fish-picker-region','fish-picker-zone','fish-picker-spot'].includes(e.target?.id))schedule(150);
    });
    schedule(300);
  }

  window.refreshFishingSessionRouteMap=applyOverlay;
  window.addEventListener('DOMContentLoaded',init);
})();
