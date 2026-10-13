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
  let viewportWidth=0,hoveredIndex=-1;
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  function remaining(ms){
    const minutes=Math.max(0,Math.ceil(ms/60000));
    const days=Math.floor(minutes/1440),hours=Math.floor((minutes%1440)/60),mins=minutes%60;
    return (days?days+' 天 ':'')+(hours||days?hours+' 小時 ':'')+mins+' 分鐘';
  }
  function positionTooltip(i){
    if(!tooltip||i<0)return;
    const r=boats[i].getBoundingClientRect();
    const width=window.innerWidth||document.documentElement.clientWidth||1200;
    const mid=Math.max(115,Math.min(width-115,r.left+r.width/2));
    tooltip.style.left=mid+'px';
    tooltip.style.top=Math.max(8,r.top-10)+'px';
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
      now>=eta?'預計返航時間已到・待結算':now<(depart+eta)/2?'出航中':'返航中';
    tooltip.innerHTML='<strong>⚓ '+esc(name)+'</strong>'+
      '<dl><dt>目前狀態</dt><dd>'+esc(status)+'</dd>'+
      '<dt>航線／目的地</dt><dd>'+esc(active?route:'尚未出航')+'</dd>'+
      '<dt>剩餘時間</dt><dd>'+esc(valid?remaining(eta-now):'—')+'</dd>'+
      '<dt>預計返航 ETA</dt><dd>'+esc(valid?fmt(eta):'—')+'</dd></dl>';
    tooltip.hidden=false;
    positionTooltip(i);
  }
  function hideTooltip(i){
    if(hoveredIndex!==i||!tooltip)return;
    hoveredIndex=-1;tooltip.hidden=true;
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
  // Native Web Animations keep each boat moving continuously without repeatedly rewriting layouts.
  function animateBoat(i,depart,eta,now,progress){
    const boat=boats[i],width=dock.getBoundingClientRect().width;
    const distance=width*(finish-starts[i])/100;
    const key=depart+':'+eta+':'+Math.round(width);
    if(!reduced()&&typeof boat.animate==='function'&&width>0){
      if(!running[i]||running[i].key!==key){
        stop(i);
        boat.style.left=starts[i]+'%';
        const frames=[
          {transform:'translateX(-50%)',offset:0},
          {transform:'translateX(calc(-50% + '+distance+'px))',offset:.5},
          {transform:'translateX(-50%)',offset:1}
        ];
        const animation=boat.animate(frames,{duration:eta-depart,easing:'linear',fill:'both'});
        animation.currentTime=Math.max(0,Math.min(now-depart,eta-depart));
        running[i]={key,animation};
      }else{
        // Re-sync only if needed after background throttling, not on every render.
        const a=running[i].animation,offset=Math.abs((a.currentTime||0)-(now-depart));
        if(offset>3000)a.currentTime=Math.max(0,Math.min(now-depart,eta-depart));
      }
    }else{
      if(running[i])stop(i);
      boat.style.left=starts[i]+'%';
      const delta=(distance*progress).toFixed(2);
      boat.style.transform='translateX(calc(-50% + '+delta+'px))';
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
      else animateBoat(i,depart,eta,now,progress);
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
    {type:'cat',weight:6,duration:11000}
  ];
  const shapes={
    gull:'<span class="gull-wing wing-left"></span><span class="gull-wing wing-right"></span>',
    fish:'<span class="fish-body"></span><span class="fish-tail"></span>',
    cart:'<span class="cart-box"></span><span class="cart-wheel wheel-a"></span><span class="cart-wheel wheel-b"></span>',
    bubbles:'<span class="bubble b1"></span><span class="bubble b2"></span><span class="bubble b3"></span>',
    cat:'<span class="cat-ear left"></span><span class="cat-ear right"></span><span class="cat-face"></span><span class="cat-tail"></span>'
  };
  let nextScene=null,cleanup=null;
  const rand=(lo,hi)=>lo+Math.random()*(hi-lo);
  function choose(){
    const n=rand(0,100);let total=0;
    for(const scene of scenes){total+=scene.weight;if(n<total)return scene;}
    return scenes[0];
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
    node.innerHTML=shapes[scene.type];
    ambient.replaceChildren(node);
    cleanup=window.setTimeout(()=>{
      ambient.replaceChildren();cleanup=null;
    },scene.duration+150);
    // A moment of calm between events is deliberate.
    schedule(scene.duration+rand(18000,52000));
  }
  function restartSceneLoop(){
    resetSceneTimers();
    if(ambient)ambient.replaceChildren();
    if(!reduced()&&!document.hidden)schedule(rand(9000,22000));
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
