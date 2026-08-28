// Keep the real fishing map visible while scrolling on desktop/tablet.
// The actual map DOM node is moved into the floating dock (not cloned), so map clicks stay in sync.
(function(){
  'use strict';

  const MIN_WIDTH=701;
  const STICKY_TOP=10;
  const FLOAT_SCALE=.8;
  let mapNode=null;
  let mapPlaceholder=null;
  let dock=null;
  let dragHandle=null;
  let floating=false;
  let raf=0;
  let initTimer=0;
  let dragState=null;

  function addStyles(){
    if(document.getElementById('fish-sticky-planner-style'))return;
    const s=document.createElement('style');
    s.id='fish-sticky-planner-style';
    s.textContent=`
      #fish-floating-planner-dock{position:fixed;top:${STICKY_TOP}px;right:12px;width:min(44vw,600px);max-height:calc(100vh - ${STICKY_TOP*2}px);overflow:auto;overscroll-behavior:contain;z-index:90;padding:10px 12px 12px;border:1px solid var(--border,#d8d8df);border-radius:14px;background:Canvas;color:CanvasText;box-shadow:0 12px 34px rgba(0,0,0,.24);scrollbar-gutter:stable;transform:scale(${FLOAT_SCALE});transform-origin:top right}
      #fish-floating-planner-dock[hidden]{display:none!important}
      #fish-floating-planner-dock .fish-zone-map{margin-top:0;padding-top:0;border-top:0}
      #fish-floating-planner-dock .ff14-map-wrap{width:100%;max-width:none}
      #fish-floating-planner-dock .fish-map-head{margin-top:0}
      .fish-floating-planner-drag{display:flex;align-items:center;justify-content:center;gap:6px;margin:-2px -2px 8px;padding:7px 10px;border-radius:9px;background:rgba(127,127,127,.10);font-size:12px;font-weight:700;user-select:none;-webkit-user-select:none;touch-action:none;cursor:grab}
      .fish-floating-planner-drag:active{cursor:grabbing}
      .fish-sticky-placeholder{width:100%;pointer-events:none}
      @media(min-width:701px) and (max-width:1100px){#fish-floating-planner-dock{right:8px;top:8px;width:min(54vw,520px);max-height:calc(100vh - 16px);padding:9px 10px 10px}.fish-floating-planner-drag{min-height:34px;font-size:13px}}
      @media(max-width:700px){#fish-floating-planner-dock{display:none!important}.fish-sticky-placeholder{display:none!important}}
      @media(prefers-color-scheme:dark){#fish-floating-planner-dock{background:#17191d;color:#f1f3f5;border-color:#3a3f46;box-shadow:0 12px 36px rgba(0,0,0,.5)}}
    `;
    document.head.appendChild(s);
  }

  function fishingActive(){return !!document.getElementById('fishing')?.classList.contains('active')}
  function zoneSelected(){return !!String(document.getElementById('fish-picker-zone')?.value||'').trim()}
  function eligible(){return window.innerWidth>=MIN_WIDTH&&fishingActive()&&zoneSelected()}

  function clampDock(){
    if(!dock||dock.hidden||!floating)return;
    const rect=dock.getBoundingClientRect();
    const maxX=Math.max(0,window.innerWidth-rect.width);
    const maxY=Math.max(0,window.innerHeight-rect.height);
    if(dock.style.left){
      const x=Math.min(maxX,Math.max(0,Number.parseFloat(dock.style.left)||0));
      const y=Math.min(maxY,Math.max(0,Number.parseFloat(dock.style.top)||0));
      dock.style.left=`${x}px`;
      dock.style.top=`${y}px`;
    }
  }

  function beginDrag(e){
    if(!floating||!dock||e.button>0)return;
    e.preventDefault();
    const rect=dock.getBoundingClientRect();
    dock.style.transformOrigin='top left';
    dock.style.left=`${rect.left}px`;
    dock.style.top=`${rect.top}px`;
    dock.style.right='auto';
    dragState={pointerId:e.pointerId,dx:e.clientX-rect.left,dy:e.clientY-rect.top};
    try{dragHandle?.setPointerCapture(e.pointerId)}catch{}
  }

  function moveDrag(e){
    if(!dragState||e.pointerId!==dragState.pointerId||!dock)return;
    e.preventDefault();
    const rect=dock.getBoundingClientRect();
    const maxX=Math.max(0,window.innerWidth-rect.width);
    const maxY=Math.max(0,window.innerHeight-rect.height);
    const x=Math.min(maxX,Math.max(0,e.clientX-dragState.dx));
    const y=Math.min(maxY,Math.max(0,e.clientY-dragState.dy));
    dock.style.left=`${x}px`;
    dock.style.top=`${y}px`;
  }

  function endDrag(e){
    if(!dragState||e.pointerId!==dragState.pointerId)return;
    try{dragHandle?.releasePointerCapture(e.pointerId)}catch{}
    dragState=null;
  }

  function ensureDock(){
    if(dock)return dock;
    dock=document.createElement('aside');
    dock.id='fish-floating-planner-dock';
    dock.setAttribute('aria-label','可拖曳浮動釣魚地圖');
    dock.hidden=true;
    dragHandle=document.createElement('div');
    dragHandle.className='fish-floating-planner-drag';
    dragHandle.textContent='⋮⋮ 拖曳地圖';
    dragHandle.setAttribute('role','button');
    dragHandle.setAttribute('aria-label','拖曳浮動地圖');
    dragHandle.addEventListener('pointerdown',beginDrag);
    dragHandle.addEventListener('pointermove',moveDrag);
    dragHandle.addEventListener('pointerup',endDrag);
    dragHandle.addEventListener('pointercancel',endDrag);
    dock.appendChild(dragHandle);
    document.body.appendChild(dock);
    return dock;
  }

  function makePlaceholder(node){
    const ph=document.createElement('div');
    ph.className='fish-sticky-placeholder fish-sticky-map-placeholder';
    ph.hidden=true;
    node.parentNode.insertBefore(ph,node);
    return ph;
  }

  function captureNode(){
    const currentMap=document.getElementById('fish-zone-map');
    if(!currentMap)return false;
    if(!mapNode){mapNode=currentMap;mapPlaceholder=makePlaceholder(mapNode)}
    ensureDock();
    return true;
  }

  function setPlaceholder(){
    if(!mapPlaceholder||!mapNode)return;
    const rect=mapNode.getBoundingClientRect();
    mapPlaceholder.style.height=`${Math.max(1,Math.round(rect.height))}px`;
    mapPlaceholder.hidden=false;
  }

  function floatPlanner(){
    if(floating||!captureNode())return;
    setPlaceholder();
    dock.hidden=false;
    dock.appendChild(mapNode);
    floating=true;
    document.documentElement.classList.add('fish-floating-planner-active');
    clampDock();
    try{window.refreshFishingSessionRouteMap?.()}catch{}
  }

  function restorePlanner(){
    if(!floating)return;
    if(mapPlaceholder?.parentNode&&mapNode)mapPlaceholder.parentNode.insertBefore(mapNode,mapPlaceholder.nextSibling);
    if(mapPlaceholder){mapPlaceholder.hidden=true;mapPlaceholder.style.height=''}
    if(dock)dock.hidden=true;
    floating=false;
    dragState=null;
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
    if(!captureNode())return;
    if(shouldFloat())floatPlanner();else restorePlanner();
    if(floating)clampDock();
  }

  function schedule(){
    if(raf)return;
    raf=requestAnimationFrame(update);
  }

  function init(){
    addStyles();
    const tryCapture=()=>{
      if(captureNode()){
        clearInterval(initTimer);
        initTimer=0;
        schedule();
      }
    };
    tryCapture();
    if(!mapNode){
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
