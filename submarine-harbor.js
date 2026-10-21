/* Ambient harbor v3: read-only voyage display and cosmetic random vignettes.
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
  const starts=[9,15.5,22,28.5];
  let quayPercent=31.75;
  function measureBerths(){
    const stage=dock.getBoundingClientRect(),piers=[...dock.querySelectorAll('.harbor-slip-wall')];
    if(stage.width<=0||piers.length!==5)return;
    const centers=piers.map(p=>{const r=p.getBoundingClientRect();return r.left+r.width/2-stage.left});
    for(let i=0;i<4;i++)starts[i]=(centers[i]+centers[i+1])/2/stage.width*100;
    quayPercent=centers[4]/stage.width*100;
  }
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
    if(hoveredIndex<0||!tooltip||tooltip.hidden||document.hidden)return;
    positionTooltip(hoveredIndex);
    if(running[hoveredIndex])tooltipFrame=window.requestAnimationFrame(followTooltip);
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
    boats[i].style.left=starts[i]+'%';
    boats[i].style.transform='translateX(-50%)';
  }
  // Dock maneuvers are short visual transitions, never a percentage of a day-long trip.
  // The offshore leg still follows the saved departure/ETA timestamps.
  // With a horizon (scene v4), each boat heads to its own lane far out at sea and
  // shrinks with distance, so boats at sea never stack on one spot.
  function voyagePath(i,width,duration,down,rise){
    const exit=Math.min(12000,duration*.1)/duration;
    const offshore=Math.min(90,quayPercent+6+i*1.5),turnaround=Math.min(96,Math.max(offshore+2,89-i*2));
    const x=percent=>width*(percent-starts[i])/100;
    if(rise>0){
      const cruise=Math.min(.45,exit+Math.min(30000,duration*.15)/duration);
      const lane=Math.min(97,quayPercent+(100-quayPercent)*(.1+.27*i)),far=-rise+(i%2)*3,s=.62;
      return [
        {phase:0,x:0,y:0,s:1},
        {phase:exit*.25,x:0,y:down,s:1},
        {phase:exit,x:x(offshore),y:down,s:1},
        {phase:cruise,x:x(lane),y:far,s},
        {phase:.5,x:x(Math.min(97,lane+2)),y:far,s},
        {phase:1-cruise,x:x(lane),y:far,s},
        {phase:1-exit,x:x(offshore),y:down,s:1},
        {phase:1-exit*.25,x:0,y:down,s:1},
        {phase:1,x:0,y:0,s:1}
      ];
    }
    return [
      {phase:0,x:0,y:0},
      {phase:exit*.25,x:0,y:down},
      {phase:exit,x:x(offshore),y:down},
      {phase:.5,x:x(turnaround),y:down},
      {phase:1-exit,x:x(offshore),y:down},
      {phase:1-exit*.25,x:0,y:down},
      {phase:1,x:0,y:0}
    ];
  }
  function boatPosition(i,phase,width,duration,down,rise){
    const path=voyagePath(i,width,duration,down,rise);
    const p=Math.max(0,Math.min(1,phase));
    for(let n=1;n<path.length;n++){
      const a=path[n-1],b=path[n];
      if(p<=b.phase){
        const t=(p-a.phase)/(b.phase-a.phase);
        const sa=a.s??1,sb=b.s??1;
        return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,s:sa+(sb-sa)*t};
      }
    }
    return {x:0,y:0,s:1};
  }
  function positionTransform(p){
    const scale=p.s!==undefined&&p.s!==1?' scale('+p.s.toFixed(3)+')':'';
    return 'translate(calc(-50% + '+p.x.toFixed(2)+'px), '+p.y.toFixed(2)+'px)'+scale;
  }
  function animateBoat(i,depart,eta,now,ratio){
    const boat=boats[i],width=dock.getBoundingClientRect().width;
    // Keep the hull inside the water strip on desktop and mobile.
    const bottom=parseFloat(window.getComputedStyle(boat).bottom)||0;
    const horizon=parseFloat(window.getComputedStyle(dock).getPropertyValue('--horizon'))||0;
    const rise=horizon>0?Math.max(0,horizon-bottom-22):0;
    const down=rise>0?Math.min(4,bottom):Math.max(0,bottom-(6+i*2)),duration=eta-depart;
    const key=depart+':'+eta+':'+Math.round(width)+':'+down+':'+rise+':'+starts[i].toFixed(3);
    if(!reduced()&&typeof boat.animate==='function'&&width>0){
      if(!running[i]||running[i].key!==key){
        stop(i);
        boat.style.left=starts[i]+'%';
        const frames=voyagePath(i,width,duration,down,rise).map(p=>({
          transform:positionTransform(p),offset:p.phase
        }));
        const animation=boat.animate(frames,{duration,easing:'linear',fill:'both'});
        animation.currentTime=Math.max(0,Math.min(now-depart,duration));
        running[i]={key,animation};
      }else{
        const animation=running[i].animation;
        if(Math.abs((animation.currentTime||0)-(now-depart))>3000)
          animation.currentTime=Math.max(0,Math.min(now-depart,duration));
      }
    }else{
      if(running[i])stop(i);
      boat.style.left=starts[i]+'%';
      boat.style.transform=positionTransform(boatPosition(i,ratio,width,duration,down,rise));
    }
  }
  function render(){
    measureBerths();
    const state=read(),ships=Array.isArray(state.ships)?state.ships:[];
    const now=Date.now();let activeCount=0;
    const texts=[];
    boats.forEach((boat,i)=>{
      const ship=ships[i]||{},v=ship.voyage;
      const depart=Number(v?.departedAt),eta=Number(v?.etaAt);
      const valid=Boolean(ship.voyaging&&v&&Number.isFinite(depart)&&depart>0&&
        Number.isFinite(eta)&&eta>depart);
      const ratio=valid?Math.max(0,Math.min(1,(now-depart)/(eta-depart))):0;
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
  let nextScene=null,cleanup=null,lastScene=null;
  const sceneTimers=new Set();
  function sceneAfter(callback,delay){
    const timer=window.setTimeout(()=>{sceneTimers.delete(timer);callback()},delay);
    sceneTimers.add(timer);
  }
  const rand=(lo,hi)=>lo+Math.random()*(hi-lo);
  function choose(){
    // Nighttime-only scenes follow the visitor's local clock.
    const hour=new Date().getHours(),night=hour>=18||hour<6;
    const available=scenes.filter(scene=>(!scene.night||night)&&scene.type!==lastScene);
    const totalWeight=available.reduce((sum,scene)=>sum+scene.weight,0);
    let n=rand(0,totalWeight);
    for(const scene of available){n-=scene.weight;if(n<0)return scene;}
    return available[available.length-1];
  }
  function resetSceneTimers(){
    if(nextScene!==null)window.clearTimeout(nextScene);
    if(cleanup!==null)window.clearTimeout(cleanup);
    nextScene=null;cleanup=null;
    sceneTimers.forEach(timer=>window.clearTimeout(timer));sceneTimers.clear();
  }
  // The canvas harbor scene (has-scene) runs its own event system; these DOM vignettes
  // remain the fallback when the canvas is unavailable.
  const sceneEvents=()=>dock.classList.contains('has-scene')&&Boolean(window.HarborEvents);
  function schedule(delay){
    if(!ambient||reduced()||document.hidden||sceneEvents())return;
    nextScene=window.setTimeout(showScene,delay);
  }
  function showScene(){
    nextScene=null;
    if(!ambient||reduced()||document.hidden||sceneEvents())return;
    const scene=choose();lastScene=scene.type;
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
      // Use the real lamp position: its scale and height vary with the viewport.
      const stage=dock.getBoundingClientRect();
      const lamp=dock.querySelector('.harbor-lamp')?.getBoundingClientRect();
      const perch=lamp?{x:lamp.left-stage.left-3,y:lamp.top-stage.top-11}:{x:70,y:65};
      node.style.setProperty('--tit-x',perch.x.toFixed(0)+'px');
      node.style.setProperty('--tit-y',perch.y.toFixed(0)+'px');
      node.style.setProperty('--tit-out',Math.min(dock.clientWidth-25,perch.x+165).toFixed(0)+'px');
    }
    node.innerHTML=shapes[scene.type];
    ambient.replaceChildren(node);
    if(scene.type==='tit'){
      sceneAfter(()=>node.classList.add('is-perched'),scene.duration*.46);
      sceneAfter(()=>node.classList.remove('is-perched'),scene.duration*.68);
    }
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
  document.addEventListener('visibilitychange',()=>{
    dock.classList.toggle('harbor-paused',document.hidden);
    if(document.hidden){
      if(hoveredIndex>=0)hideTooltip(hoveredIndex);
      running.forEach(entry=>entry?.animation?.pause());
      resetSceneTimers();ambient?.replaceChildren();
    }else{
      render();
      running.forEach(entry=>entry?.animation?.play());
      restartSceneLoop();
    }
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
  dock.classList.toggle('harbor-paused',document.hidden);
  render();
  if(document.hidden)running.forEach(entry=>entry?.animation?.pause());
  viewportWidth=dock.getBoundingClientRect().width;
  restartSceneLoop();
  // Native movement runs on the browser animation timeline; refresh metadata less often.
  // Older browsers use frequent small CSS transition steps for the fallback route.
  const nativeMotion=boats.every(boat=>typeof boat.animate==='function');
  window.setInterval(()=>{if(!document.hidden)render();},nativeMotion?10000:1000);
})();

