// Overlay the already-calculated Session route on the existing FF14 fishing map.
// Lines are only directional sequence hints between planned stops; they are not road/path navigation.
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

  function markerPoint(marker){
    if(!marker)return null;
    const left=parseFloat(marker.style.left),top=parseFloat(marker.style.top);
    return Number.isFinite(left)&&Number.isFinite(top)?{left,top}:null;
  }

  function drawRouteLines(markersWrap,groups,markerMap){
    if(!markersWrap||groups.length<2)return;
    const points=groups.map(g=>({group:g,point:markerPoint(markerMap.get(g.spot))})).filter(x=>x.point);
    if(points.length<2)return;
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('class','ff14-route-line-layer');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');
    const defs=document.createElementNS(ns,'defs'),marker=document.createElementNS(ns,'marker');
    marker.setAttribute('id','ff14-route-arrow');marker.setAttribute('viewBox','0 0 10 10');marker.setAttribute('refX','8');marker.setAttribute('refY','5');marker.setAttribute('markerWidth','5');marker.setAttribute('markerHeight','5');marker.setAttribute('orient','auto-start-reverse');
    const arrow=document.createElementNS(ns,'path');arrow.setAttribute('d','M 0 0 L 10 5 L 0 10 z');arrow.setAttribute('class','ff14-route-arrow-head');marker.appendChild(arrow);defs.appendChild(marker);svg.appendChild(defs);
    for(let i=0;i<points.length-1;i++){
      const a=points[i].point,b=points[i+1].point;
      if(Math.abs(a.left-b.left)<.01&&Math.abs(a.top-b.top)<.01)continue;
      const line=document.createElementNS(ns,'line');
      line.setAttribute('x1',String(a.left));line.setAttribute('y1',String(a.top));line.setAttribute('x2',String(b.left));line.setAttribute('y2',String(b.top));line.setAttribute('class','ff14-route-line');line.setAttribute('marker-end','url(#ff14-route-arrow)');svg.appendChild(line);
    }
    markersWrap.prepend(svg);
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
    drawRouteLines(body.querySelector('.ff14-map-markers'),groups,markerMap);

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
      .ff14-route-line-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;overflow:visible}
      .ff14-route-line{stroke:CanvasText;stroke-width:.55;opacity:.72;vector-effect:non-scaling-stroke}
      .ff14-route-arrow-head{fill:CanvasText;opacity:.82}
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
