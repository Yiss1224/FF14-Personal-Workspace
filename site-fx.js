/* Site FX v1: interactive motion for the home page (dashboard, leveling, fishing tabs).
   Presentation only. Reads no saved data, changes no text or structure of what the app renders,
   and never delays or intercepts an action: overlays live on <body> or in decorative nodes this
   file creates, existing elements only receive fx- classes and --fx- variables.
   Everything is skipped or static under prefers-reduced-motion. The submarine page has its own
   layer (submarine-fx.js). */
(function(){
  'use strict';
  if(!window.matchMedia||!Element.prototype.animate)return;
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced=()=>motion.matches;
  const fine=window.matchMedia('(hover: hover) and (pointer: fine)');
  const root=document.documentElement;
  root.classList.add('fx-ready');
  const frame=fn=>{let queued=false,last;return function(arg){last=arg;if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;fn(last)})}};
  const rand=(a,b)=>a+Math.random()*(b-a);
  const activeTab=()=>document.querySelector('.tab.active')?.id||'dashboard';
  const bootedAt=performance.now();
  // Nothing should announce itself while the page is still filling in its first render.
  const settled=()=>performance.now()-bootedAt>1500;

  /* ---------- 1. Header sky: drifting motes that change with the tab and react to the pointer ---------- */
  // dashboard: aether motes; leveling: EXP sparks; fishing: bubbles and the odd ring on the water.
  const THEMES={
    dashboard:{rgb:'150,220,255',glow:'190,235,255',shape:'diamond',vy:[5,16],size:[1.2,3.2],ring:'150,220,255'},
    leveling:{rgb:'255,214,130',glow:'255,236,180',shape:'spark',vy:[10,30],size:[1,2.6],ring:'255,214,130'},
    fishing:{rgb:'150,228,232',glow:'200,244,246',shape:'bubble',vy:[7,22],size:[1.4,5],ring:'140,236,232'}
  };
  (function sky(){
    const header=document.querySelector('header');
    if(!header)return;
    const canvas=document.createElement('canvas'),ctx=canvas.getContext&&canvas.getContext('2d');
    if(!ctx)return;
    canvas.className='fx-sky';canvas.setAttribute('aria-hidden','true');
    header.prepend(canvas);
    let W=0,H=0,dpr=1,raf=0,timer=0,last=0,onScreen=true,pointer=null,theme=THEMES[activeTab()]||THEMES.dashboard,nextRing=4;
    let lastInput=performance.now(),slow=0;
    const motes=[],rings=[];
    function spawn(anywhere,x,y,burst){
      const t=theme;
      return {x:x??rand(0,W),y:y??(anywhere?rand(0,H):H+rand(4,24)),r:rand(t.size[0],burst?Math.min(3,t.size[1]):t.size[1]),
        vy:-rand(t.vy[0],burst?t.vy[1]*2.4:t.vy[1]),vx:burst?rand(-46,46):0,ph:rand(0,6.28),a:rand(.35,1),burst:Boolean(burst),t};
    }
    function resize(){
      const r=header.getBoundingClientRect();
      if(r.width<=0||r.height<=0)return;
      W=r.width;H=r.height;dpr=Math.min(2,window.devicePixelRatio||1);
      canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
      const want=Math.max(12,Math.min(46,Math.round(W/30)));
      while(motes.filter(m=>!m.burst).length<want)motes.push(spawn(true));
      let extra=motes.filter(m=>!m.burst).length-want;
      for(let k=motes.length-1;k>=0&&extra>0;k--)if(!motes[k].burst){motes.splice(k,1);extra--}
      if(reduced())clear();
    }
    function clear(){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height)}
    function ring(x,y,strong,rgb){if(rings.length<6)rings.push({x,y,t:0,strong:Boolean(strong),rgb:rgb||theme.ring})}
    function draw(dt){
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
      for(let k=rings.length-1;k>=0;k--){
        const p=rings[k];p.t+=dt;
        const life=p.strong?1.5:2.2;
        if(p.t>life){rings.splice(k,1);continue}
        for(let n=0;n<3;n++){
          const t=p.t-n*.2;if(t<=0)continue;
          const q=t/life;
          ctx.beginPath();ctx.ellipse(p.x,p.y,q*(p.strong?230:150),q*(p.strong?230:150)*(p.strong?1:.45),0,0,6.283);
          ctx.strokeStyle='rgba('+p.rgb+','+(Math.max(0,1-q)*(p.strong?.5:.2)).toFixed(3)+')';
          ctx.lineWidth=p.strong?1.5:1;ctx.stroke();
        }
      }
      for(let k=motes.length-1;k>=0;k--){
        const m=motes[k],t=m.t;
        if(pointer){
          const dx=m.x-pointer.x,dy=m.y-pointer.y,d=Math.hypot(dx,dy)||1;
          if(d<90){const f=(90-d)/90*300*dt;m.vx+=dx/d*f;m.y+=dy/d*f*.35}
        }
        m.vx*=Math.pow(.12,dt);m.ph+=dt*1.5;
        m.x+=(m.vx+Math.sin(m.ph)*(t.shape==='spark'?9:5))*dt;m.y+=m.vy*dt;
        if(m.burst){m.a-=dt*.9;if(m.a<=0){motes.splice(k,1);continue}}
        // A mote of the previous tab's kind is replaced by the new kind when it leaves the header.
        else if(m.y<-8||m.x<-20||m.x>W+20){motes[k]=spawn(false);continue}
        const twinkle=t.shape==='bubble'?1:.55+.45*Math.sin(m.ph*1.7);
        const fade=(m.burst?m.a:m.a*Math.min(1,m.y/(H*.4)))*twinkle;
        if(t.shape==='bubble'){
          ctx.beginPath();ctx.arc(m.x,m.y,m.r,0,6.283);
          ctx.fillStyle='rgba('+t.rgb+','+(fade*.13).toFixed(3)+')';ctx.fill();
          ctx.strokeStyle='rgba('+t.glow+','+(fade*.42).toFixed(3)+')';ctx.lineWidth=1;ctx.stroke();
        }else if(t.shape==='diamond'){
          const r=m.r*1.25;
          ctx.beginPath();ctx.moveTo(m.x,m.y-r*1.5);ctx.lineTo(m.x+r,m.y);ctx.lineTo(m.x,m.y+r*1.5);ctx.lineTo(m.x-r,m.y);ctx.closePath();
          ctx.fillStyle='rgba('+t.rgb+','+(fade*.34).toFixed(3)+')';ctx.fill();
          ctx.strokeStyle='rgba('+t.glow+','+(fade*.6).toFixed(3)+')';ctx.lineWidth=.8;ctx.stroke();
        }else{
          const r=m.r*1.6;
          ctx.strokeStyle='rgba('+t.glow+','+(fade*.8).toFixed(3)+')';ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(m.x-r,m.y);ctx.lineTo(m.x+r,m.y);ctx.moveTo(m.x,m.y-r);ctx.lineTo(m.x,m.y+r);ctx.stroke();
          ctx.fillStyle='rgba('+t.rgb+','+(fade*.9).toFixed(3)+')';ctx.fillRect(m.x-.6,m.y-.6,1.2,1.2);
        }
      }
    }
    // Full rate only while someone is around: every frame for a minute after the last input, then
    // 12 fps, then 4 fps once the page has sat untouched for five minutes.
    function loop(ts){
      raf=0;
      if(document.hidden||reduced()||!onScreen)return;
      const dt=last?Math.min(slow?.3:.05,(ts-last)/1000):0;last=ts;
      if(theme===THEMES.fishing){nextRing-=dt;if(nextRing<=0){ring(rand(W*.15,W*.85),rand(H*.55,H*.9),false);nextRing=rand(4,8)}}
      draw(dt);
      const idle=performance.now()-lastInput;
      slow=idle<60000?0:idle<300000?83:250;
      if(slow)timer=window.setTimeout(()=>{timer=0;raf=requestAnimationFrame(loop)},slow-16);
      else raf=requestAnimationFrame(loop);
    }
    function start(){if(!raf&&!timer&&!reduced()&&!document.hidden&&onScreen){last=0;raf=requestAnimationFrame(loop)}}
    function stop(){if(raf){cancelAnimationFrame(raf);raf=0}if(timer){window.clearTimeout(timer);timer=0}}
    function wake(){lastInput=performance.now();if(timer){window.clearTimeout(timer);timer=0;slow=0;raf=requestAnimationFrame(loop)}}
    ['pointermove','pointerdown','keydown','wheel','touchstart','scroll'].forEach(name=>window.addEventListener(name,wake,{passive:true,capture:true}));
    header.addEventListener('pointermove',e=>{const r=header.getBoundingClientRect();pointer={x:e.clientX-r.left,y:e.clientY-r.top}},{passive:true});
    header.addEventListener('pointerleave',()=>{pointer=null},{passive:true});
    header.addEventListener('click',e=>{
      if(reduced()||e.target.closest('button,a,input,select,label'))return;
      const r=header.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
      ring(x,y,true);
      for(let k=0;k<10;k++)motes.push(spawn(false,x+rand(-6,6),y+rand(-4,4),true));
    });
    function setTheme(id){
      const next=THEMES[id]||THEMES.dashboard;
      if(next===theme)return;
      theme=next;header.dataset.fxTheme=id in THEMES?id:'dashboard';
      // A handful of the new kind rise at once so the change reads immediately; the rest turn over as they drift out.
      if(!reduced()&&settled())for(let k=0;k<8;k++)motes.push(spawn(false,rand(0,W),H+rand(0,10),true));
    }
    header.dataset.fxTheme=activeTab() in THEMES?activeTab():'dashboard';
    window.addEventListener('site-fx-tab',e=>setTheme(e.detail.id));
    if(window.ResizeObserver)new ResizeObserver(resize).observe(header);else window.addEventListener('resize',resize);
    if(window.IntersectionObserver)new IntersectionObserver(entries=>{onScreen=entries[0].isIntersecting;if(onScreen)start();else stop()}).observe(header);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else start()});
    motion.addEventListener('change',()=>{stop();if(reduced())clear();else start()});
    resize();start();
    window.SiteFx=Object.assign(window.SiteFx||{},{sky:()=>({running:Boolean(raf||timer),slow,motes:motes.length,rings:rings.length,theme:header.dataset.fxTheme}),idleFor:ms=>{lastInput=performance.now()-ms}});
  })();

  /* ---------- 2. Tabs: sliding highlight, and the opened tab's cards settle in ---------- */
  (function tabs(){
    const nav=document.querySelector('nav');
    if(!nav)return;
    const pill=document.createElement('span');pill.className='fx-tab-pill';pill.setAttribute('aria-hidden','true');nav.prepend(pill);
    nav.classList.add('fx-tabs');
    let shown=false,current=activeTab();
    function move(){
      const active=nav.querySelector('button.active');
      if(!active){pill.style.opacity='0';return}
      pill.style.opacity='1';
      pill.style.width=active.offsetWidth+'px';pill.style.height=active.offsetHeight+'px';
      pill.style.transform='translate('+active.offsetLeft+'px,'+active.offsetTop+'px)';
      if(!shown){shown=true;pill.getBoundingClientRect();pill.classList.add('is-live')} // no slide-in from the corner on first paint
    }
    function entered(id){
      window.dispatchEvent(new CustomEvent('site-fx-tab',{detail:{id}}));
      const tab=document.getElementById(id);
      if(!tab||reduced()||!settled())return;
      // Only what is on screen and of card size moves; long lists (the fish catalog) just appear.
      let n=0;
      for(const el of tab.children){
        const r=el.getBoundingClientRect();
        if(r.height<=0||r.top>window.innerHeight)continue;
        if(r.height>1600||n>=6)continue;
        el.animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'none'}],{duration:360,delay:n*55,easing:'cubic-bezier(.2,.75,.25,1)',fill:'backwards'});
        n++;
      }
      if(id==='dashboard')for(const [k,card] of [...tab.querySelectorAll('.grid > article')].entries())
        card.animate([{opacity:0,transform:'translateY(16px) scale(.98)'},{opacity:1,transform:'none'}],{duration:380,delay:k*60,easing:'cubic-bezier(.2,.75,.25,1)',fill:'backwards'});
    }
    const sync=frame(()=>{move();const id=activeTab();if(id!==current){current=id;entered(id)}});
    new MutationObserver(sync).observe(nav,{attributes:true,attributeFilter:['class'],subtree:true});
    window.addEventListener('resize',sync);
    if(document.fonts&&document.fonts.ready)document.fonts.ready.then(move);
    move();
  })();

  /* ---------- 3. Pointer light on cards ---------- */
  (function light(){
    let lit=null;
    const SELECTOR='article,.fish-today-card,.fish-onboard-steps li,.schedule-day';
    const update=frame(e=>{
      const el=e.target.closest?.(SELECTOR);
      if(lit&&lit!==el){lit.classList.remove('fx-lit');lit=null}
      if(!el||reduced()||!fine.matches)return;
      const r=el.getBoundingClientRect();
      el.style.setProperty('--fx-x',(e.clientX-r.left).toFixed(1)+'px');el.style.setProperty('--fx-y',(e.clientY-r.top).toFixed(1)+'px');
      el.classList.add('fx-lit');lit=el;
    });
    document.addEventListener('pointermove',update,{passive:true});
    document.addEventListener('pointerleave',()=>{if(lit){lit.classList.remove('fx-lit');lit=null}});
  })();

  /* ---------- 4. Press ripple on buttons (drawn above the button, not inside it) ---------- */
  (function ripple(){
    let live=0;
    document.addEventListener('pointerdown',e=>{
      if(reduced()||live>=6||e.button>0)return;
      const el=e.target.closest?.('button,a.tab-link,summary');
      if(!el||el.disabled||el.classList.contains('ff14-map-marker'))return;
      const r=el.getBoundingClientRect();
      if(r.width<8||r.height<8)return;
      const style=getComputedStyle(el),clip=document.createElement('span'),dot=document.createElement('span');
      clip.className='fx-ripple';clip.setAttribute('aria-hidden','true');
      clip.style.cssText='left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px;border-radius:'+style.borderRadius;
      const x=e.clientX-r.left,y=e.clientY-r.top,size=Math.hypot(Math.max(x,r.width-x),Math.max(y,r.height-y))*2;
      dot.style.cssText='left:'+x+'px;top:'+y+'px;width:'+size+'px;height:'+size+'px';
      const rgb=(style.backgroundColor.match(/[\d.]+/g)||[255,255,255]).map(Number);
      if((rgb[0]*299+rgb[1]*587+rgb[2]*114)/1000<140&&(rgb[3]===undefined||rgb[3]>.5))dot.classList.add('is-light');
      clip.appendChild(dot);document.body.appendChild(clip);live++;
      const a=dot.animate([{transform:'translate(-50%,-50%) scale(0)',opacity:.55},{transform:'translate(-50%,-50%) scale(1)',opacity:0}],{duration:520,easing:'cubic-bezier(.2,.6,.3,1)'});
      a.onfinish=a.oncancel=()=>{clip.remove();live--};
    },{capture:true,passive:true});
  })();

  /* ---------- shared: a short burst of particles on <body> at a screen point ---------- */
  let bursts=0;
  function sparkle(x,y,colors,count,spread){
    if(reduced()||document.hidden||bursts>=4)return;
    bursts++;let left=count;
    for(let k=0;k<count;k++){
      const dot=document.createElement('span');dot.className='fx-spark';dot.setAttribute('aria-hidden','true');
      const ang=rand(0,6.283),dist=rand(spread*.45,spread),size=rand(3,6);
      dot.style.cssText='left:'+x+'px;top:'+y+'px;width:'+size+'px;height:'+size+'px;background:'+colors[k%colors.length];
      document.body.appendChild(dot);
      const a=dot.animate([{transform:'translate(-50%,-50%) scale(.4)',opacity:1},
        {transform:'translate(calc(-50% + '+(Math.cos(ang)*dist).toFixed(1)+'px),calc(-50% + '+(Math.sin(ang)*dist-8).toFixed(1)+'px)) scale(1)',opacity:1,offset:.6},
        {transform:'translate(calc(-50% + '+(Math.cos(ang)*dist*1.15).toFixed(1)+'px),calc(-50% + '+(Math.sin(ang)*dist*1.15+6).toFixed(1)+'px)) scale(.2)',opacity:0}],
        {duration:rand(480,720),easing:'cubic-bezier(.15,.7,.3,1)'});
      a.onfinish=a.oncancel=()=>{dot.remove();if(--left===0)bursts--};
    }
  }
  // Rings spreading on water, for the fishing tab.
  function splash(x,y){
    if(reduced()||document.hidden)return;
    for(let k=0;k<3;k++){
      const ringEl=document.createElement('span');ringEl.className='fx-splash';ringEl.setAttribute('aria-hidden','true');
      ringEl.style.cssText='left:'+x+'px;top:'+y+'px';
      document.body.appendChild(ringEl);
      const a=ringEl.animate([{transform:'translate(-50%,-50%) scale(.15)',opacity:.85},{transform:'translate(-50%,-50%) scale(1)',opacity:0}],
        {duration:720,delay:k*130,easing:'cubic-bezier(.2,.6,.3,1)',fill:'backwards'});
      a.onfinish=a.oncancel=()=>ringEl.remove();
    }
    sparkle(x,y-4,['#9fe3ee','#e6fbff','#4ea8c6'],7,26);
  }

  /* ---------- 5. Celebration banner with confetti ---------- */
  let celebrating=false;
  function celebrate(x,y,title,detail){
    if(celebrating||reduced()||document.hidden)return;
    const canvas=document.createElement('canvas'),ctx=canvas.getContext&&canvas.getContext('2d');
    if(!ctx)return;
    celebrating=true;
    const W=window.innerWidth,H=window.innerHeight,dpr=Math.min(2,window.devicePixelRatio||1);
    canvas.className='fx-burst';canvas.setAttribute('aria-hidden','true');canvas.width=W*dpr;canvas.height=H*dpr;
    document.body.appendChild(canvas);
    const banner=document.createElement('div');banner.className='fx-banner';banner.setAttribute('aria-hidden','true');
    const s=document.createElement('strong');s.textContent=title;const d=document.createElement('span');d.textContent=detail;
    banner.append(s,d);document.body.appendChild(banner);
    const colors=['#f6d58a','#7ab6ff','#ffffff','#e7b970','#8fe3b0','#b7a2ff'],parts=[];
    for(let k=0;k<96;k++){
      const ang=-Math.PI/2+(Math.random()-.5)*2.3,speed=240+Math.random()*480;
      parts.push({x,y,vx:Math.cos(ang)*speed,vy:Math.sin(ang)*speed,w:4+Math.random()*5,h:2+Math.random()*4,rot:Math.random()*6.28,vr:(Math.random()-.5)*14,
        c:colors[k%colors.length],life:0,max:1.4+Math.random()*1.1,round:k%4===0});
    }
    let last=0;
    (function step(ts){
      const dt=last?Math.min(.05,(ts-last)/1000):0;last=ts;
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
      let alive=0;
      for(const p of parts){
        p.life+=dt;if(p.life>=p.max)continue;alive++;
        p.vy+=620*dt;p.vx*=Math.pow(.35,dt);p.x+=p.vx*dt;p.y+=p.vy*dt;p.rot+=p.vr*dt;
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.globalAlpha=Math.min(1,(p.max-p.life)*2);ctx.fillStyle=p.c;
        if(p.round){ctx.beginPath();ctx.arc(0,0,p.h,0,6.283);ctx.fill()}else ctx.fillRect(-p.w/2,-p.h/2*Math.cos(p.life*9),p.w,p.h*Math.cos(p.life*9));
        ctx.restore();
      }
      if(alive&&!document.hidden&&!reduced())requestAnimationFrame(step);
      else{canvas.remove();celebrating=false}
    })(0);
    const a=banner.animate([{transform:'translate(-50%,-50%) scale(.6)',opacity:0},{transform:'translate(-50%,-50%) scale(1.06)',opacity:1,offset:.14},
      {transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.22},{transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.8},
      {transform:'translate(-50%,-62%) scale(1)',opacity:0}],{duration:2200,easing:'ease-out'});
    a.onfinish=a.oncancel=()=>banner.remove();
  }

  /* ---------- 6. Daily checklist: a tick sparkles, the last tick of the day celebrates ---------- */
  (function daily(){
    const list=document.getElementById('daily-list');
    if(!list)return;
    list.addEventListener('change',e=>{
      const box=e.target;
      if(!box.matches||!box.matches('input[type=checkbox]'))return;
      const r=box.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,checked=box.checked;
      if(checked)sparkle(x,y,['#f6d58a','#ffffff','#7ab6ff','#8fe3b0'],9,30);
      // The list is re-rendered after the change, so the outcome is read on the next frame.
      requestAnimationFrame(()=>{
        const boxes=[...list.querySelectorAll('input[type=checkbox]')];
        if(checked&&boxes.length>1&&boxes.every(b=>b.checked))celebrate(x,y,'DAILY CLEAR','今日 Daily 全部完成');
      });
    });
  })();

  /* ---------- 7. Results and summaries settle in when their content changes ---------- */
  (function fresh(){
    const ids=['level-summary','level-multi-summary','tonight-summary','fish-summary','level-result','multi-level-result','tonight-result','fish-result'];
    ids.forEach(id=>{
      const el=document.getElementById(id);if(!el)return;
      let prev=el.textContent,busy=false;
      new MutationObserver(()=>{
        const now=el.textContent;if(now===prev)return;
        prev=now;
        if(busy||reduced()||document.hidden||!settled()||el.offsetParent===null)return;
        busy=true;
        const a=el.animate([{opacity:.25,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:340,easing:'cubic-bezier(.2,.8,.3,1)'});
        a.onfinish=a.oncancel=()=>{busy=false};
        const card=el.closest('article');
        if(card&&el.classList.contains('result')===false)card.animate([{boxShadow:'0 0 0 0 rgba(78,150,214,.45)'},{boxShadow:'0 0 0 10px rgba(78,150,214,0)'}],{duration:700,easing:'ease-out'});
      }).observe(el,{childList:true,characterData:true,subtree:true});
    });
  })();

  /* ---------- 8. Fishing: marking a fish makes a splash where you tapped ---------- */
  (function fishing(){
    const tab=document.getElementById('fishing');
    if(!tab)return;
    tab.addEventListener('click',e=>{
      const hit=e.target.closest&&e.target.closest('[data-caught]');
      if(!hit||hit.disabled)return;
      const r=hit.getBoundingClientRect();
      // Keyboard activation reports no pointer position: use the control's centre.
      const x=e.clientX||r.left+r.width/2,y=e.clientY||r.top+r.height/2;
      splash(x,y);
    },true);
  })();

  window.SiteFx=Object.assign(window.SiteFx||{},{celebrate,sparkle,splash});
})();
