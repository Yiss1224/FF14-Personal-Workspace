// Keep the real fishing map + Session route visible while scrolling on desktop/tablet.
// The actual DOM nodes are moved into the dock (not cloned), so map clicks and route updates stay in sync.
(function(){
  'use strict';

  const MIN_WIDTH=701;
  const STICKY_TOP=10;
  const FLOAT_SCALE=.8;
  let mapNode=null;
  let routeNode=null;
  let mapPlaceholder=null;
  let routePlaceholder=null;
  let dock=null;
  let floating=false;
  let raf=0;
  let initTimer=0;

  function addStyles(){
    if(document.getElementById('fish-sticky-planner-style'))return;
    const s=document.createElement('style');
    s.id='fish-sticky-planner-style';
    s.textContent=`
      #fish-floating-planner-dock{position:fixed;top:${STICKY_TOP}px;right:12px;width:min(44vw,600px);max-height:calc(100vh - ${STICKY_TOP*2}px);overflow:auto;overscroll-behavior:contain;z-index:90;padding:12px;border:1px solid var(--border,#d8d8df);border-radius:14px;background:Canvas;color:CanvasText;box-shadow:0 12px 34px rgba(0,0,0,.24);scrollbar-gutter:stable;transform:scale(${FLOAT_SCALE});transform-origin:top right}
      #fish-floating-planner-dock[hidden]{display:none!important}
      #fish-floating-planner-dock .fish-zone-map{margin-top:0;padding-top:0;border-top:0}
      #fish-floating-planner-dock .fishing-route-section{margin:14px 0 0}
      #fish-floating-planner-dock .ff14-map-wrap{width:100%;max-width:none}
      #fish-floating-planner-dock .fish-map-head{margin-top:0}
      .fish-sticky-placeholder{width:100%;pointer-events:none}
      @media(min-width:701px) and (max-width:1100px){#fish-floating-planner-dock{right:8px;top:8px;width:min(54vw,520px);max-height:calc(100vh - 16px);padding:10px}}
      @media(max-width:700px){#fish-floating-planner-dock{display:none!important}.fish-sticky-placeholder{display:none!important}}
      @media(prefers-color-scheme:dark){#fish-floating-planner-dock{background:#17191d;color:#f1f3f5;border-color:#3a3f46;box-shadow:0 12px 36px rgba(0,0,0,.5)}}
    `;
    document.head.appendChild(s);
  }

  function fishingActive(){return !!document.getElementById('fishing')?.classList.contains('active')}
  function zoneSelected(){return !!String(document.getElementById('fish-picker-zone')?.value||'').trim()}
  function eligible(){return window.innerWidth>=MIN_WIDTH&&fishingActive()&&zoneSelected()}

  function ensureDock(){
    if(dock)return dock;
    dock=document.createElement('aside');
    dock.id='fish-floating-planner-dock';
    dock.setAttribute('aria-label','浮動釣魚地圖與 Session 路線');
    dock.hidden=true;
    document.body.appendChild(dock);
    return dock;
  }

  function makePlaceholder(node,kind){
    const ph=document.createElement('div');
    ph.className=`fish-sticky-placeholder fish-sticky-${kind}-placeholder`;
    ph.hidden=true;
    node.parentNode.insertBefore(ph,node);
    return ph;
  }

  function captureNodes(){
    const currentMap=document.getElementById('fish-zone-map');
    const currentRoute=document.querySelector('.fishing-route-section');
    if(!currentMap||!currentRoute)return false;

    if(!mapNode){mapNode=currentMap;mapPlaceholder=makePlaceholder(mapNode,'map')}
    if(!routeNode){routeNode=currentRoute;routePlaceholder=makePlaceholder(routeNode,'route')}
    ensureDock();
    return true;
  }

  function setPlaceholder(ph,node){
    if(!ph||!node)return;
    const rect=node.getBoundingClientRect();
    ph.style.height=`${Math.max(1,Math.round(rect.height))}px`;
    ph.hidden=false;
  }

  function floatPlanner(){
    if(floating||!captureNodes())return;
    setPlaceholder(mapPlaceholder,mapNode);
    setPlaceholder(routePlaceholder,routeNode);
    dock.hidden=false;
    dock.appendChild(mapNode);
    dock.appendChild(routeNode);
    floating=true;
    document.documentElement.classList.add('fish-floating-planner-active');
    try{window.refreshFishingSessionRouteMap?.()}catch{}
  }

  function restorePlanner(){
    if(!floating)return;
    if(mapPlaceholder?.parentNode&&mapNode)mapPlaceholder.parentNode.insertBefore(mapNode,mapPlaceholder.nextSibling);
    if(routePlaceholder?.parentNode&&routeNode)routePlaceholder.parentNode.insertBefore(routeNode,routePlaceholder.nextSibling);
    if(mapPlaceholder){mapPlaceholder.hidden=true;mapPlaceholder.style.height=''}
    if(routePlaceholder){routePlaceholder.hidden=true;routePlaceholder.style.height=''}
    if(dock)dock.hidden=true;
    floating=false;
    document.documentElement.classList.remove('fish-floating-planner-active');
    try{window.refreshFishingSessionRouteMap?.()}catch{}
  }

  function shouldFloat(){
    if(!eligible())return false;
    if(floating){
      const top=mapPlaceholder?.getBoundingClientRect().top;
      return Number.isFinite(top)&&top<STICKY_TOP+4;
    }
    const top=mapNode?.getBoundingClientRect().top;
    return Number.isFinite(top)&&top<STICKY_TOP;
  }

  function update(){
    raf=0;
    if(!captureNodes())return;
    if(shouldFloat())floatPlanner();else restorePlanner();
  }

  function schedule(){
    if(raf)return;
    raf=requestAnimationFrame(update);
  }

  function init(){
    addStyles();
    const tryCapture=()=>{
      if(captureNodes()){
        clearInterval(initTimer);
        initTimer=0;
        schedule();
      }
    };
    tryCapture();
    if(!mapNode||!routeNode){
      initTimer=setInterval(tryCapture,100);
      setTimeout(()=>{if(initTimer){clearInterval(initTimer);initTimer=0}},10000);
    }

    window.addEventListener('scroll',schedule,{passive:true});
    window.addEventListener('resize',schedule,{passive:true});
    document.addEventListener('change',e=>{
      if(['fish-picker-region','fish-picker-zone','fish-picker-spot'].includes(e.target?.id||''))setTimeout(schedule,0);
    },true);
    document.addEventListener('click',e=>{
      if(e.target?.closest?.('nav button'))setTimeout(schedule,0);
    },true);
    document.addEventListener('ff14-fish-catalog-rendered',schedule);
  }

  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
