/* Ambient harbor v2: read-only voyage display and cosmetic random vignettes.
   No changes to fleet records, route recommendations, or settlement inventory. */
(function(){
  'use strict';
  const KEY='ff14_submarine_planner_v1';
  const dock=document.getElementById('mini-harbor');
  if(!dock)return;
  const fleetEl=document.getElementById('harbor-fleet');
  const liveStatus=document.getElementById('harbor-clock');
  const ambient=document.getElementById('harbor-ambient');
  const tooltip=document.getElementById('harbor-tooltip');
  const starts=[9,15.5,22,28.5],finish=89; // moored to the right of each berth, not over its pier
  const motion=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):null;
  const reduced=()=>Boolean(motion&&motion.matches);
  function read(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch{return {}}}
  function fmt(ms){return new Date(ms).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}
  fleetEl.innerHTML=starts.map((start,i)=>
    '<div class="harbor-submarine" data-harbor-ship="'+i+'" style="left:'+start+
    '%;--boat-bottom:'+(27+(i%2)*2)+'px;--boat-bottom-mobile:'+
    (22+(i%2)*2)+'px" tabindex="0" aria-label="潛水艇 '+(i+1)+'，查看航行資訊">'+
      '<div class="harbor-sprite"><span class="harbor-sub-hull"></span><span class="harbor-sub-fin"></span>'+
        '<span class="harbor-conning"></span><span class="harbor-periscope"></span>'+
        '<span class="harbor-sub-window w1"></span><span class="harbor-sub-window w2"></span>'+
        '<span class="harbor-sub-flag"><span>'+(i+1)+'</span></span></div></div>'
  ).join('');
  const boats=[...fleetEl.querySelectorAll('[data-harbor-ship]')];
  const running=Array.from({length:4},()=>null);
  let viewportWidth=0,hoveredIndex=-1,tooltipFrame=null;
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  function remaining(ms){
    const minutes=Math.max(0,Math.ceil(ms/60000));
    const days=Math.floor(minutes/1440),hours=Math.floor((minutes%1440)/60),mins=minutes%60;
    return (days?days+' 天 ':'')+(hours||days?hours+' 小時 ':'')+mins+' 分鐘';
  }
  function positionTooltip(i){
    if(!tooltip||i<0||!boats[i])return;
    const r=boats[i].getBoundingClientRect();
    const width=window.innerWidth||document.documentElement.clientWidth||1200;
    const half=Math.min(tooltip.offsetWidth/2,(width-20)/2);
    const mid=Math.max(half+10,Math.min(width-half-10,r.left+r.width/2));
    tooltip.style.left=mid+'px';
    tooltip.style.top=Math.max(tooltip.offsetHeight+8,r.top-10)+'px';
  }
  function followTooltip(){
    tooltipFrame=null;
    if(hoveredIndex<0||!tooltip||tooltip.hidden)return;
    positionTooltip(hoveredIndex);
    tooltipFrame=window.requestAnimationFrame(followTooltip);
  }
  function showTooltip(i){
    if(!tooltip||boats[i].hidden)return;
    hoveredIndex=i;
    const ships=read().ships||[],ship=ships[i]||{},v=ship.voyage;
    const departed=Number(v?.departedAt),eta=Number(v?.etaAt);
    const valid=Boolean(ship.voyaging&&v&&Number.isFinite(departed)&&departed>0&&
      Number.isFinite(eta)&&eta>departed);
    const now=Date.now(),active=Boolean(ship.voyaging);
    const name=typeof ship.name==='string'&&ship.name.trim()?ship.name.trim():'潛水艇 '+(i+1);
    const route=active&&valid&&typeof v.route==='string'&&v.route.trim()?v.route.trim():'—';
    const status=!ship.registered&&!active?'泊位尚未啟用':
      !active?'停泊待命':!valid?'航行中・尚無航時紀錄':
      now>=eta?'預計返航時間已到・待結算':now<(departed+eta)/2?'出航中':'返航中';
    tooltip.innerHTML='<strong>⚓ '+esc(name)+'</strong>'+
      '<dl><dt>目前狀態</dt><dd>'+esc(status)+'</dd>'+
      '<dt>航線／目的地</dt><dd>'+esc(active?route:'尚未出航')+'</dd>'+
      '<dt>剩餘時間</dt><dd>'+esc(valid?remaining(eta-now):'—')+'</dd>'+
      '<dt>預計返航 ETA</dt><dd>'+esc(valid?fmt(eta):'—')+'</dd></dl>';
    tooltip.hidden=false;
    positionTooltip(i);
    if(tooltipFrame===null)tooltipFrame=window.requestAnimationFrame(followTooltip);
  }
  function hideTooltip(i){
    if(hoveredIndex!==i||!tooltip)return;
    hoveredIndex=-1;tooltip.hidden=true;
    if(tooltipFrame!==null){window.cancelAnimationFrame(tooltipFrame);tooltipFrame=null;}
  }
  boats.forEach((boat,i)=>{
    boat.addEventListener('mouseenter',()=>showTooltip(i));
    boat.addEventListener('mousemove',()=>positionTooltip(i));
    boat.addEventListener('mouseleave',()=>hideTooltip(i));
    boat.addEventListener('focus',()=>showTooltip(i));
    boat.addEventListener('blur',()=>hideTooltip(i));
  });
  function stop(i){
    const previous=running[i];
    if(previous&&previous.animation)previous.animation.cancel();
    running[i]=null;
    boats[i].style.transform='translateX(-50%)';
  }
  // Swim out of the slip first; cross the finger piers only after diving below them.
  // Time spent in the exit/entry maneuver is a tiny fraction of the real voyage.
  function boatPosition(i,phase,width){
    const distance=width*(finish-starts[i])/100;
    const down=44; // hull and sail clear the bottom edge of the finger piers
    const exit=.035,enter=.965;
    let x=0,y=0;
    if(phase<exit){y=down*(phase/exit);}
    else if(phase<.5){x=distance*((phase-exit)/(.5-exit));y=down;}
    else if(phase<enter){x=distance*(1-(phase-.5)/(enter-.5));y=down;}
    else{y=down*(1-(phase-enter)/(1-enter));}
    return {x,y};
  }
  function transformAt(i,phase,width){
    const p=boatPosition(i,phase,width);
    return 'translate(calc(-50% + '+p.x.toFixed(2)+'px), '+p.y.toFixed(2)+'px)';
  }
  // WAAPI keeps the entire departure → voyage → return route on the browser timeline.
  function animateBoat(i,depart,eta,now,ratio){
    const boat=boats[i],width=dock.getBoundingClientRect().width;
    const key=depart+':'+eta+':'+Math.round(width);
    if(!reduced()&&typeof boat.animate==='function'&&width>0){
      if(!running[i]||running[i].key!==key){
        stop(i);
        boat.style.left=starts[i]+'%';
        const phases=[0,.035,.5,.965,1];
        const frames=phases.map(phase=>({
          transform:transformAt(i,phase,width),offset:phase
        }));
        const animation=boat.animate(frames,{duration:eta-depart,easing:'linear',fill:'both'});
        animation.currentTime=Math.max(0,Math.min(now-depart,eta-depart));
        running[i]={key,animation};
      }else{
        const animation=running[i].animation;
        if(Math.abs((animation.currentTime||0)-(now-depart))>3000)
          animation.currentTime=Math.max(0,Math.min(now-depart,eta-depart));
      }
    }else{
      if(running[i])stop(i);
      boat.style.left=starts[i]+'%';
      boat.style.transform=transformAt(i,ratio,width);
    }
  }
  function render(){
    const state=read(),ships=Array.isArray(state.ships)?state.ships:[];
    const now=Date.now();let activeCount=0;
    const texts=[];
    boats.forEach((boat,i)=>{
      const ship=ships[i]||{},v=ship.voyage;
      const depart=Number(v?.departedAt),eta=Number(v?.etaAt);
      const valid=Boolean(ship.voyaging&&v&&Number.isFinite(depart)&&depart>0&&
        Number.isFinite(eta)&&eta>depart);
      const ratio=valid?Math.max(0,Math.min(1,(now-depart)/(eta-depart))):0;
      const progress=ratio<=.5?ratio*2:(1-ratio)*2;
      const active=Boolean(ship.voyaging),registered=Boolean(ship.registered);
      if(active)activeCount++;
      boat.hidden=!registered&&!active;
      boat.classList.toggle('is-sailing',valid&&ratio<1);
      boat.classList.toggle('is-returning',valid&&ratio>.5&&ratio<1);
      boat.classList.toggle('is-awaiting',valid&&ratio>=1);
      if(!valid||ratio>=1||boat.hidden)stop(i);
      else animateBoat(i,depart,eta,now,ratio);
      if(hoveredIndex===i)showTooltip(i);
      const label=typeof ship.name==='string'&&ship.name.trim()?ship.name.trim():'潛水艇 '+(i+1);
      const status=!registered&&!active?'泊位空置':!active?'停泊中':
        !valid?'航行中，未記錄時間':ratio>=1?'預計已返航，待結算':'預計 '+fmt(eta)+' 返航';
      texts.push(label+'：'+status);
    });
    liveStatus.textContent=(activeCount?'航行中 '+activeCount+' 艘。':'碼頭待命。')+' '+texts.join('；');
    setNightTheme();
  }
  function setNightTheme(){
    // Local clock controls only decorative illumination, not in-game weather.
    const hour=new Date().getHours();
    dock.classList.toggle('harbor-night',hour>=18||hour<6);
  }

  // Small, mutually exclusive and infrequent scenes. None reflects actual game loot/weather.
  const scenes=[
    {type:'gull',weight:28,duration:12000},
    {type:'fish',weight:24,duration:6500},
    {type:'cart',weight:24,duration:14000},
    {type:'bubbles',weight:18,duration:7500},
    {type:'cat',weight:6,duration:11000},
    {type:'tit',weight:25,duration:13500},
    {type:'seal',weight:15,duration:9000},
    {type:'crab',weight:15,duration:9500},
    {type:'jelly',weight:12,duration:11000,night:true},
    {type:'catnap',weight:14,duration:13000},
    {type:'meteor',weight:5,duration:4300,night:true},
    {type:'paperboat',weight:12,duration:12500},
    {type:'interaction',weight:12,duration:12000},
    {type:'teleport',weight:9,duration:9500}
  ];
  const shapes={
    gull:'<span class="gull-wing wing-left"></span><span class="gull-wing wing-right"></span>',
    fish:'<span class="fish-body"></span><span class="fish-tail"></span>',
    cart:'<span class="cart-box"></span><span class="cart-wheel wheel-a"></span><span class="cart-wheel wheel-b"></span>',
    bubbles:'<span class="bubble b1"></span><span class="bubble b2"></span><span class="bubble b3"></span>',
    cat:'<span class="cat-tail"></span><span class="cat-body"></span><span class="cat-ear left"></span><span class="cat-ear right"></span><span class="cat-face"><span class="cat-muzzle"></span></span>',
    tit:'<span class="tit-tail"></span><span class="tit-body"><span class="tit-eye"></span></span><span class="tit-wing"></span>',
    seal:'<span class="seal-head"><span class="seal-eyes"></span><span class="seal-nose"></span></span><span class="seal-ripple"></span>',
    crab:'<span class="crab-claw left"></span><span class="crab-body"><span class="crab-eye left"></span><span class="crab-eye right"></span></span><span class="crab-claw right"></span>',
    jelly:'<span class="jelly-bell"><span class="jelly-highlight"></span></span><span class="jelly-tentacles"><i></i><i></i><i></i><i></i></span>',
    catnap:'<span class="nap-cat"><span class="nap-ear left"></span><span class="nap-ear right"></span><span class="nap-face"><i></i></span><span class="nap-tail"></span></span>',
    meteor:'<span class="meteor-star"></span>',
    paperboat:'<span class="paper-boat-sail"></span><span class="paper-boat-hull"></span>',
    interaction:'<span class="interaction-bird"><span class="tit-tail"></span><span class="tit-body"><span class="tit-eye"></span></span><span class="tit-wing"></span></span><span class="interaction-worker"><span class="helmet"></span><span class="vest"></span><span class="legs"></span></span>',
    teleport:'<span class="teleport-rays"></span><span class="teleport-character"><span class="teleport-head"></span><span class="teleport-torso"></span><span class="teleport-feet"></span></span><span class="teleport-particles"></span>'
  };
  let nextScene=null,cleanup=null;
  const rand=(lo,hi)=>lo+Math.random()*(hi-lo);
  function choose(){
    // Nighttime-only scenes follow the visitor's local clock.
    const hour=new Date().getHours(),night=hour>=18||hour<6;
    const available=scenes.filter(scene=>!scene.night||night);
    const totalWeight=available.reduce((sum,scene)=>sum+scene.weight,0);
    let n=rand(0,totalWeight);
    for(const scene of available){n-=scene.weight;if(n<0)return scene;}
    return available[available.length-1];
  }
  function resetSceneTimers(){
    if(nextScene!==null)window.clearTimeout(nextScene);
    if(cleanup!==null)window.clearTimeout(cleanup);
    nextScene=null;cleanup=null;
  }
  function schedule(delay){
    if(!ambient||reduced()||document.hidden)return;
    nextScene=window.setTimeout(showScene,delay);
  }
  function showScene(){
    nextScene=null;
    if(!ambient||reduced()||document.hidden)return;
    const scene=choose();
    const node=document.createElement('span');
    node.className='harbor-event harbor-event-'+scene.type;
    node.setAttribute('aria-hidden','true');
    node.style.setProperty('--event-duration',scene.duration+'ms');
    node.style.setProperty('--event-x',rand(40,83).toFixed(1)+'%');
    if(scene.type==='seal'||scene.type==='jelly'||scene.type==='paperboat')
      node.style.setProperty('--event-x',rand(37,83).toFixed(1)+'%');
    if(scene.type==='crab'||scene.type==='catnap'||scene.type==='interaction'||scene.type==='teleport')
      node.style.setProperty('--event-x',rand(8,23).toFixed(1)+'%');
    if(scene.type==='tit'){
      // Two safe perches: upper crane edge or harbor lamp; stay inside scene.
      const perch=Math.random()<.5?{x:94,y:85}:{x:Math.max(70,dock.clientWidth*.06),y:91};
      node.style.setProperty('--tit-x',perch.x.toFixed(0)+'px');
      node.style.setProperty('--tit-y',perch.y.toFixed(0)+'px');
      node.style.setProperty('--tit-out',Math.min(dock.clientWidth-25,perch.x+165).toFixed(0)+'px');
    }
    node.innerHTML=shapes[scene.type];
    ambient.replaceChildren(node);
    cleanup=window.setTimeout(()=>{
      ambient.replaceChildren();cleanup=null;
    },scene.duration+150);
    // A moment of calm between events is deliberate.
    schedule(scene.duration+rand(12000,28000));
  }
  function restartSceneLoop(){
    resetSceneTimers();
    if(ambient)ambient.replaceChildren();
    if(!reduced()&&!document.hidden)schedule(rand(4000,9000));
  }
  function refresh(){
    render();
  }
  ['submarine-state-updated','submarine-build-state-updated',
   'submarine-settlement-saved','submarine-data-imported',
   'submarine-voyage-started'].forEach(event=>window.addEventListener(event,refresh));
  window.addEventListener('storage',event=>{if(event.key===KEY)refresh();});
  window.addEventListener('visibilitychange',()=>{
    if(document.hidden&&tooltip){hoveredIndex=-1;tooltip.hidden=true;}
    render();restartSceneLoop();
  });
  window.addEventListener('scroll',()=>{if(hoveredIndex>=0)positionTooltip(hoveredIndex);},{passive:true});
  window.addEventListener('resize',()=>{
    const width=dock.getBoundingClientRect().width;
    if(Math.abs(width-viewportWidth)>1){viewportWidth=width;render();}
  });
  if(motion&&motion.addEventListener)motion.addEventListener('change',()=>{
    boats.forEach((_,i)=>stop(i));render();restartSceneLoop();
  });
  // Fallback movement / status refresh; WAAPI handles normal motion independently.
  render();
  viewportWidth=dock.getBoundingClientRect().width;
  restartSceneLoop();
  // Native movement runs on the browser animation timeline; refresh metadata less often.
  // Older browsers use frequent small CSS transition steps for the fallback route.
  const nativeMotion=boats.every(boat=>typeof boat.animate==='function');
  window.setInterval(()=>{if(!document.hidden)render();},nativeMotion?10000:1000);
})();
