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
    document.querySelector('#fish-zone-map-body .ff14-map-markers')?.classList.remove('has-route');
    document.getElementById('fish-session-route-map-note')?.remove();
  }

  function addOrders(marker,labels,first,color){
    if(!marker||!labels.length)return;
    marker.classList.add('session-route');marker.classList.toggle('route-start',!!first);if(color)marker.style.setProperty('--route-color',color);
    const wrap=document.createElement('span');wrap.className='ff14-route-orders';
    const badge=document.createElement('span');badge.className='ff14-route-order';badge.textContent=labels.join(' ');wrap.appendChild(badge);
    marker.appendChild(wrap);
  }

  function badgePoint(badge,wrapRect){
    if(!badge||!wrapRect?.width||!wrapRect?.height)return null;
    const r=badge.getBoundingClientRect();
    return{x:r.left+r.width/2-wrapRect.left,y:r.top+r.height/2-wrapRect.top,r:Math.max(r.width,r.height)/2};
  }

  // 以 Catmull-Rom 曲線平滑串起各站；每段在中點切開，讓 marker-mid 的箭頭落在每段中間並順著切線方向。
  const mid=(p,q)=>({x:(p.x+q.x)/2,y:(p.y+q.y)/2});
  const f=n=>n.toFixed(2);
  function smoothSegments(pts){
    const out=[];
    for(let i=0;i<pts.length-1;i++){
      const p0=pts[i-1]||pts[i],p1=pts[i],p2=pts[i+1],p3=pts[i+2]||p2;
      const c1={x:p1.x+(p2.x-p0.x)/6,y:p1.y+(p2.y-p0.y)/6},c2={x:p2.x-(p3.x-p1.x)/6,y:p2.y-(p3.y-p1.y)/6};
      const m01=mid(p1,c1),m12=mid(c1,c2),m23=mid(c2,p2),m012=mid(m01,m12),m123=mid(m12,m23),m=mid(m012,m123);
      out.push(` C ${f(m01.x)} ${f(m01.y)} ${f(m012.x)} ${f(m012.y)} ${f(m.x)} ${f(m.y)} C ${f(m123.x)} ${f(m123.y)} ${f(m23.x)} ${f(m23.y)} ${f(p2.x)} ${f(p2.y)}`);
    }
    return out;
  }
  // 依站序從綠漸變到橘：每一段一個顏色
  // 藍 → 紫 → 洋紅 → 橘，白字在每一段都看得清楚
  function stepColor(t){return `hsl(${Math.round(195+175*t)%360} 78% ${Math.round(44+4*t)}%)`}
  window.ff14RouteStepColor=stepColor;
  let lastRouteKey='',drawStart=0;
  const DRAW_MS=1000;

  function drawRouteLines(markersWrap,groups,markerMap){
    if(!markersWrap||groups.length<2)return;
    const wrapRect=markersWrap.getBoundingClientRect();
    if(!wrapRect.width||!wrapRect.height)return;

    const points=[];
    for(const group of groups){
      const marker=markerMap.get(group.spot);if(!marker)continue;
      const badge=marker.querySelector('.ff14-route-order');
      const point=badgePoint(badge,wrapRect);if(!point)continue;
      const prev=points[points.length-1];if(prev&&Math.abs(prev.x-point.x)<1&&Math.abs(prev.y-point.y)<1)continue;
      points.push(point);
    }
    if(points.length<2)return;

    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),el=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n};
    svg.setAttribute('class','ff14-route-line-layer');
    svg.setAttribute('viewBox',`0 0 ${wrapRect.width.toFixed(2)} ${wrapRect.height.toFixed(2)}`);
    svg.setAttribute('preserveAspectRatio','none');
    const defs=el('defs',{});
    const glow=el('filter',{id:'ff14-route-glow',x:'-20%',y:'-20%',width:'140%',height:'140%'});glow.appendChild(el('feGaussianBlur',{stdDeviation:'3.5'}));defs.appendChild(glow);
    const marker=document.createElementNS(ns,'marker');
    marker.setAttribute('id','ff14-route-arrow');marker.setAttribute('viewBox','0 0 10 10');marker.setAttribute('refX','5');marker.setAttribute('refY','5');marker.setAttribute('markerWidth','3.2');marker.setAttribute('markerHeight','3.2');marker.setAttribute('orient','auto');
    const arrow=document.createElementNS(ns,'path');arrow.setAttribute('d','M 2.5 1.5 L 7 5 L 2.5 8.5');arrow.setAttribute('class','ff14-route-arrow-head');marker.appendChild(arrow);defs.appendChild(marker);svg.appendChild(defs);

    const segs=smoothSegments(points),d=`M ${f(points[0].x)} ${f(points[0].y)}`+segs.join(''),n=segs.length;
    // 新路線第一次出現時，用一筆畫出來的動畫；之後重畫（捲動、切換）就不再重播。
    const key=points.map(p=>`${Math.round(p.x)},${Math.round(p.y)}`).join('|')+'#'+groups.map(g=>g.spot).join('>');
    const routeKey=groups.map(g=>g.spot).join('>');
    // 覆蓋層常被重畫（地圖重繪、結果更新）；動畫期間重畫時接著播剩下的部分，不重頭來也不中斷。
    if(routeKey!==lastRouteKey){lastRouteKey=routeKey;drawStart=performance.now()}
    const elapsed=(performance.now()-drawStart)/1000,drawing=elapsed<DRAW_MS/1000+.25;
    if(drawing)svg.classList.add('is-drawing');
    svg.dataset.routeKey=key;
    const under=[el('path',{d,class:'ff14-route-glow',filter:'url(#ff14-route-glow)'}),el('path',{d,class:'ff14-route-casing'})];
    for(const u of under)svg.appendChild(u);
    const linePaths=[];
    segs.forEach((seg,i)=>{
      const path=document.createElementNS(ns,'path');
      path.setAttribute('d',`M ${f(points[i].x)} ${f(points[i].y)}`+seg);
      path.setAttribute('class','ff14-route-line');path.setAttribute('marker-mid','url(#ff14-route-arrow)');
      path.style.stroke=stepColor((i+.5)/n);path.style.animationDelay=`${(i/n-elapsed).toFixed(3)}s`;path.style.animationDuration=`${(1/n+.05).toFixed(2)}s`;
      svg.appendChild(path);linePaths.push(path);
    });
    svg.appendChild(el('path',{d,class:'ff14-route-flow'}));
    markersWrap.prepend(svg);
    // 用實際長度做描線動畫（pathLength 在部分瀏覽器搭配 non-scaling-stroke 時會算錯，前端會冒出一小截）
    for(const lp of linePaths){try{lp.style.setProperty('--len',`${Math.ceil(lp.getTotalLength())+2}`)}catch{}}
    if(drawing)setTimeout(()=>svg.classList.remove('is-drawing'),Math.max(0,DRAW_MS+300-elapsed*1000));
  }

  function applyOverlay(){
    clearOverlay();
    const body=document.getElementById('fish-zone-map-body');if(!body)return;
    const region=pickerValue('fish-picker-region'),zone=pickerValue('fish-picker-zone');if(!zone)return;
    const groups=routeGroups().filter(x=>(!region||!x.region||x.region===region)&&(!x.zone||x.zone===zone));if(!groups.length)return;
    const bySpot=new Map();for(const group of groups){if(!bySpot.has(group.spot))bySpot.set(group.spot,[]);bySpot.get(group.spot).push(orderLabel(group.orders))}
    const markerMap=new Map([...body.querySelectorAll('.ff14-map-marker[data-map-spot]')].map(m=>[m.dataset.mapSpot,m]));
    const stepOf=new Map();groups.forEach((g,i)=>{if(!stepOf.has(g.spot))stepOf.set(g.spot,i)});
    const tOf=i=>groups.length>1?i/(groups.length-1):1;
    for(const [spot,labels] of bySpot)addOrders(markerMap.get(spot),labels,spot===groups[0].spot,stepColor(tOf(stepOf.get(spot)||0)));
    const layer=body.querySelector('.ff14-map-markers');layer?.classList.add('has-route');
    try{window.ff14DeclutterMapLabels?.()}catch{}
    drawRouteLines(layer,groups,markerMap);
    body.querySelectorAll('.fish-map-fallback [data-map-spot]').forEach(btn=>{const labels=bySpot.get(btn.dataset.mapSpot)||[];if(!labels.length)return;btn.classList.add('session-route-fallback');btn.dataset.routeOrder=labels.join(' ')});
    const title=body.querySelector('.fish-map-title');
    if(title){const note=document.createElement('div');note.id='fish-session-route-map-note';note.className='fish-session-route-map-note';note.innerHTML=`<strong>釣點順序</strong> ${groups.map((g,i)=>`<span class="route-chip"><b style="background:${stepColor(tOf(i))}">${esc(orderLabel(g.orders))}</b>${esc(tc(g.spot))}</span>`).join('<span class="route-map-arrow">→</span>')}`;title.insertAdjacentElement('afterend',note)}
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
      .ff14-map-marker.session-route .ff14-map-dot{display:none}
      .ff14-map-markers.has-route .ff14-map-marker:not(.session-route){opacity:.55}
      .ff14-map-markers.has-route .ff14-map-marker:not(.session-route) .ff14-map-dot{width:11px;height:11px;border-width:2px}
      .ff14-route-orders{display:flex;gap:2px;pointer-events:none}
      .ff14-route-order{display:grid;place-items:center;min-width:24px;height:24px;padding:0 7px;border-radius:999px;background:var(--route-color,#ff6b1a);color:#fff;border:2px solid #fff;font-size:12px;font-weight:900;line-height:1;white-space:nowrap;box-shadow:0 1px 5px rgba(0,0,0,.55)}
      .ff14-map-marker.session-route .ff14-map-label{background:rgba(20,22,26,.85)}
      .ff14-route-line-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;overflow:visible}
      .ff14-route-glow{fill:none;stroke:#000;stroke-width:9;stroke-linecap:round;stroke-linejoin:round;opacity:.32;vector-effect:non-scaling-stroke}
      .ff14-route-casing{fill:none;stroke:#fff;stroke-width:7;stroke-linecap:round;stroke-linejoin:round;opacity:.92;vector-effect:non-scaling-stroke}
      .ff14-route-line{fill:none;stroke:#ff6b1a;stroke-width:3.8;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
      .ff14-route-arrow-head{fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
      .ff14-route-flow{fill:none;stroke:#fff;stroke-width:3;stroke-linecap:round;stroke-dasharray:0 26;opacity:.95;vector-effect:non-scaling-stroke;animation:ff14-route-flow 1.1s linear infinite}
      @keyframes ff14-route-flow{to{stroke-dashoffset:-26}}
      .ff14-route-glow,.ff14-route-casing,.ff14-route-flow{transition:opacity .35s ease}
      .ff14-route-line-layer.is-drawing .ff14-route-line{stroke-dasharray:var(--len,1000) 99999;stroke-linecap:butt;marker-mid:none;animation:ff14-route-draw 1s linear both}
      .ff14-route-line-layer.is-drawing .ff14-route-glow,.ff14-route-line-layer.is-drawing .ff14-route-casing,.ff14-route-line-layer.is-drawing .ff14-route-flow{opacity:0}
      @keyframes ff14-route-draw{from{stroke-dashoffset:var(--len,1000)}to{stroke-dashoffset:0}}
      @media(prefers-reduced-motion:reduce){.ff14-route-flow{animation:none;opacity:0}.ff14-route-line-layer.is-drawing .ff14-route-line{animation:none;stroke-dasharray:none}}
      .fish-session-route-map-note{display:flex;gap:4px 6px;align-items:center;flex-wrap:wrap;margin:-2px 0 10px;font-size:12px}
      .fish-session-route-map-note .route-chip{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;padding:2px 8px 2px 2px;border-radius:999px;background:rgba(127,127,127,.12)}
      .fish-session-route-map-note .route-chip b{display:grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#ff6b1a;color:#fff;font-size:11px}
      .route-map-arrow{opacity:.5}
      .fish-map-fallback [data-map-spot].session-route-fallback::before{content:attr(data-route-order);display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;margin-right:5px;border-radius:999px;background:#ff6b1a;color:#fff;font-size:10px;font-weight:800;white-space:nowrap}
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