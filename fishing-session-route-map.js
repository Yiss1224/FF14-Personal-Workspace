// Overlay the already-calculated Session route on the existing FF14 fishing map.
// Straight lines and midpoint arrows are directional hints only, not in-game road/path navigation.
(function(){
  'use strict';

  let timer=null;
  let watchdog=null;

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function tc(v){const s=String(v||'');try{return typeof window.ff14TcText==='function'?window.ff14TcText(s):s}catch{return s}}
  function pickerValue(id){return String(document.getElementById(id)?.value||'')}

  function modelStops(){
    const model=window.__fishingSessionRouteModel;
    if(!model||!Array.isArray(model.stops))return null;
    const region=pickerValue('fish-picker-region'),zone=pickerValue('fish-picker-zone');
    if(zone&&model.zone&&model.zone!==zone)return [];
    if(region&&model.region&&model.region!==region)return [];
    return model.stops.map((x,index)=>({order:Number(x.order)||index+1,region:x.region||'',zone:x.zone||'',spot:x.spot||''})).filter(x=>x.spot);
  }

  function rawStops(){
    const fromModel=modelStops();if(fromModel!==null)return fromModel;
    return [...document.querySelectorAll('#fish-route-result [data-session-route-spot]')].map((btn,index)=>({order:index+1,region:btn.dataset.region||'',zone:btn.dataset.zone||'',spot:btn.dataset.spot||''})).filter(x=>x.spot);
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
    return consecutive?`${orders[0]}–${orders[orders.length-1]}`:orders.join(' ');
  }

  function clearOverlay(){
    document.querySelectorAll('#fish-zone-map-body .ff14-map-marker.session-route').forEach(marker=>{marker.classList.remove('session-route');marker.querySelector('.ff14-route-orders')?.remove()});
    document.querySelectorAll('#fish-zone-map-body .fish-map-fallback [data-map-spot].session-route-fallback').forEach(btn=>{btn.classList.remove('session-route-fallback');delete btn.dataset.routeOrder});
    document.querySelector('#fish-zone-map-body .ff14-route-line-layer')?.remove();
    document.getElementById('fish-session-route-map-note')?.remove();
  }

  function addOrders(marker,labels){
    if(!marker||!labels.length)return;
    marker.classList.add('session-route');
    const wrap=document.createElement('span');wrap.className='ff14-route-orders';
    const badge=document.createElement('span');badge.className='ff14-route-order';badge.textContent=labels.join(' ');wrap.appendChild(badge);
    marker.appendChild(wrap);
  }

  function badgePoint(badge,wrapRect){
    if(!badge||!wrapRect?.width||!wrapRect?.height)return null;
    const r=badge.getBoundingClientRect();
    return{x:r.left+r.width/2-wrapRect.left,y:r.top+r.height/2-wrapRect.top,r:Math.max(r.width,r.height)/2};
  }

  function shortenedSegment(a,b){
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
    const startInset=Math.max(8,a.r+4),endInset=Math.max(8,b.r+4);
    const sx=a.x+ux*startInset,sy=a.y+uy*startInset,ex=b.x-ux*endInset,ey=b.y-uy*endInset;
    const mx=(sx+ex)/2,my=(sy+ey)/2;
    return{sx,sy,mx,my,ex,ey};
  }

  function drawRouteLines(markersWrap,groups,markerMap){
    if(!markersWrap||groups.length<2)return;
    const wrapRect=markersWrap.getBoundingClientRect();
    if(!wrapRect.width||!wrapRect.height)return;

    const points=[];
    for(const group of groups){
      const marker=markerMap.get(group.spot);if(!marker)continue;
      const badge=marker.querySelector('.ff14-route-order');
      const point=badgePoint(badge,wrapRect);if(point)points.push({group,point});
    }
    if(points.length<2)return;

    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('class','ff14-route-line-layer');
    svg.setAttribute('viewBox',`0 0 ${wrapRect.width.toFixed(2)} ${wrapRect.height.toFixed(2)}`);
    svg.setAttribute('preserveAspectRatio','none');
    const defs=document.createElementNS(ns,'defs'),marker=document.createElementNS(ns,'marker');
    marker.setAttribute('id','ff14-route-arrow');marker.setAttribute('viewBox','0 0 10 10');marker.setAttribute('refX','5');marker.setAttribute('refY','5');marker.setAttribute('markerWidth','5.5');marker.setAttribute('markerHeight','5.5');marker.setAttribute('orient','auto');
    const arrow=document.createElementNS(ns,'path');arrow.setAttribute('d','M 0 0 L 10 5 L 0 10 z');arrow.setAttribute('class','ff14-route-arrow-head');marker.appendChild(arrow);defs.appendChild(marker);svg.appendChild(defs);

    for(let i=0;i<points.length-1;i++){
      const a=points[i].point,b=points[i+1].point;if(Math.abs(a.x-b.x)<1&&Math.abs(a.y-b.y)<1)continue;
      const q=shortenedSegment(a,b),path=document.createElementNS(ns,'path');
      path.setAttribute('d',`M ${q.sx.toFixed(2)} ${q.sy.toFixed(2)} L ${q.mx.toFixed(2)} ${q.my.toFixed(2)} L ${q.ex.toFixed(2)} ${q.ey.toFixed(2)}`);
      path.setAttribute('class','ff14-route-line');path.setAttribute('marker-mid','url(#ff14-route-arrow)');svg.appendChild(path);
    }
    markersWrap.prepend(svg);
  }

  function applyOverlay(){
    clearOverlay();
    const body=document.getElementById('fish-zone-map-body');if(!body)return;
    const region=pickerValue('fish-picker-region'),zone=pickerValue('fish-picker-zone');if(!zone)return;
    const groups=routeGroups().filter(x=>(!region||!x.region||x.region===region)&&(!x.zone||x.zone===zone));if(!groups.length)return;
    const bySpot=new Map();for(const group of groups){if(!bySpot.has(group.spot))bySpot.set(group.spot,[]);bySpot.get(group.spot).push(orderLabel(group.orders))}
    const markerMap=new Map([...body.querySelectorAll('.ff14-map-marker[data-map-spot]')].map(m=>[m.dataset.mapSpot,m]));
    for(const [spot,labels] of bySpot)addOrders(markerMap.get(spot),labels);
    drawRouteLines(body.querySelector('.ff14-map-markers'),groups,markerMap);
    body.querySelectorAll('.fish-map-fallback [data-map-spot]').forEach(btn=>{const labels=bySpot.get(btn.dataset.mapSpot)||[];if(!labels.length)return;btn.classList.add('session-route-fallback');btn.dataset.routeOrder=labels.join(' ')});
    const title=body.querySelector('.fish-map-title');
    if(title){const note=document.createElement('div');note.id='fish-session-route-map-note';note.className='fish-session-route-map-note';note.innerHTML=`<strong>Session 順序</strong> ${groups.map(g=>`<span>${esc(orderLabel(g.orders))}. ${esc(tc(g.spot))}</span>`).join('<span class="route-map-arrow">→</span>')}`;title.insertAdjacentElement('afterend',note)}
  }

  function overlayMissing(){
    const model=window.__fishingSessionRouteModel,body=document.getElementById('fish-zone-map-body');
    if(!model?.stops?.length||!body?.querySelector('.ff14-map-marker[data-map-spot]'))return false;
    return !body.querySelector('.ff14-map-marker.session-route')||!body.querySelector('.ff14-route-line-layer');
  }
  function schedule(delay=60){clearTimeout(timer);timer=setTimeout(applyOverlay,delay)}

  function addStyles(){
    if(document.getElementById('fish-session-route-map-style'))return;
    const style=document.createElement('style');style.id='fish-session-route-map-style';style.textContent=`
      .ff14-map-marker.session-route{z-index:4}
      .ff14-route-orders{position:absolute;left:10px;top:-24px;display:flex;gap:2px;pointer-events:none}
      .ff14-route-order{display:grid;place-items:center;min-width:20px;height:20px;padding:0 7px;border-radius:999px;background:Canvas;color:CanvasText;border:2px solid currentColor;font-size:11px;font-weight:900;line-height:1;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.45)}
      .ff14-route-line-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;overflow:visible}
      .ff14-route-line{fill:none;stroke:CanvasText;stroke-width:2.4;stroke-linecap:round;opacity:.62;vector-effect:non-scaling-stroke}
      .ff14-route-arrow-head{fill:CanvasText;opacity:.82}
      .fish-session-route-map-note{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin:-2px 0 8px;font-size:12px}
      .fish-session-route-map-note>span{white-space:nowrap}.route-map-arrow{opacity:.55}
      .fish-map-fallback [data-map-spot].session-route-fallback::before{content:attr(data-route-order);display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;margin-right:5px;border-radius:999px;border:1px solid currentColor;font-size:10px;font-weight:800;white-space:nowrap}
    `;document.head.appendChild(style);
  }

  function init(){
    addStyles();
    const result=document.getElementById('fish-route-result');if(result)new MutationObserver(()=>schedule(30)).observe(result,{childList:true,subtree:true});
    document.addEventListener('change',e=>{if(['fish-picker-region','fish-picker-zone','fish-picker-spot'].includes(e.target?.id))schedule(120)});
    watchdog=setInterval(()=>{if(overlayMissing())applyOverlay()},1000);
    schedule(300);
  }

  window.refreshFishingSessionRouteMap=applyOverlay;
  window.addEventListener('DOMContentLoaded',init);
  window.addEventListener('pagehide',()=>{if(watchdog)clearInterval(watchdog)},{once:true});
})();
