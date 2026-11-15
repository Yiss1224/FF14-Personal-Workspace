/* Bridge FX v1: interactive motion for the submarine page. Presentation only.
   Never reads or writes fleet data, never delays or intercepts planner actions, and adds nothing
   inside existing controls (overlays live on <body> or in dedicated decorative nodes).
   Everything here is skipped or made static under prefers-reduced-motion. */
(function(){
  'use strict';
  if(!window.matchMedia||!Element.prototype.animate)return;
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced=()=>motion.matches;
  const fine=window.matchMedia('(hover: hover) and (pointer: fine)');
  const root=document.documentElement;
  root.classList.add('fx-ready');
  const frame=fn=>{let queued=false,last;return function(arg){last=arg;if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;fn(last)})}};

  /* ---------- 1. Hero: bubbles that avoid the pointer, sonar pings on click ---------- */
  (function hero(){
    const header=document.querySelector('header');
    if(!header)return;
    const canvas=document.createElement('canvas'),ctx=canvas.getContext&&canvas.getContext('2d');
    if(!ctx)return;
    canvas.className='fx-hero';canvas.setAttribute('aria-hidden','true');
    header.prepend(canvas);
    // The anchor in the title is the sonar source and a small toy of its own.
    const h1=header.querySelector('h1');let anchor=null;
    if(h1&&h1.firstChild&&h1.firstChild.nodeType===3&&h1.firstChild.nodeValue.startsWith('⚓')){
      anchor=document.createElement('span');anchor.className='fx-anchor';anchor.textContent='⚓';
      h1.firstChild.nodeValue=h1.firstChild.nodeValue.slice(1);h1.prepend(anchor);
    }
    let W=0,H=0,dpr=1,raf=0,last=0,onScreen=true,pointer=null,nextPing=3;
    const bubbles=[],pings=[];
    const rand=(a,b)=>a+Math.random()*(b-a);
    function spawn(anywhere,x,y,burst){
      return {x:x??rand(0,W),y:y??(anywhere?rand(0,H):H+rand(4,30)),r:rand(1.4,burst?3.2:5),vy:-rand(7,burst?46:22),vx:burst?rand(-40,40):0,
        ph:rand(0,6.28),a:rand(.35,1),burst:Boolean(burst)};
    }
    function resize(){
      const r=header.getBoundingClientRect();
      if(r.width<=0||r.height<=0)return;
      W=r.width;H=r.height;dpr=Math.min(2,window.devicePixelRatio||1);
      canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
      const want=Math.max(14,Math.min(54,Math.round(W/26)));
      while(bubbles.filter(b=>!b.burst).length<want)bubbles.push(spawn(true));
      let extra=bubbles.filter(b=>!b.burst).length-want;
      for(let k=bubbles.length-1;k>=0&&extra>0;k--)if(!bubbles[k].burst){bubbles.splice(k,1);extra--}
      if(reduced())draw(0);
    }
    function anchorPoint(){
      if(!anchor)return {x:W*.12,y:H*.5};
      const a=anchor.getBoundingClientRect(),r=header.getBoundingClientRect();
      return {x:a.left+a.width/2-r.left,y:a.top+a.height/2-r.top};
    }
    function ping(x,y,strong){if(pings.length<6)pings.push({x,y,t:0,strong:Boolean(strong)})}
    function draw(dt){
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
      for(let k=pings.length-1;k>=0;k--){
        const p=pings[k];p.t+=dt;
        const life=p.strong?1.7:2.4;
        if(p.t>life){pings.splice(k,1);continue}
        for(let ring=0;ring<3;ring++){
          const t=p.t-ring*.22;if(t<=0)continue;
          const q=t/life,radius=q*(p.strong?260:190);
          ctx.beginPath();ctx.arc(p.x,p.y,radius,0,6.283);
          ctx.strokeStyle='rgba(140,236,232,'+(Math.max(0,1-q)*(p.strong?.5:.22)).toFixed(3)+')';
          ctx.lineWidth=p.strong?1.6:1;ctx.stroke();
        }
      }
      for(let k=bubbles.length-1;k>=0;k--){
        const b=bubbles[k];
        if(pointer){
          const dx=b.x-pointer.x,dy=b.y-pointer.y,d=Math.hypot(dx,dy)||1;
          if(d<95){const f=(95-d)/95*320*dt;b.vx+=dx/d*f;b.y+=dy/d*f*.35}
        }
        b.vx*=Math.pow(.12,dt);
        b.ph+=dt*1.4;
        b.x+=(b.vx+Math.sin(b.ph)*5)*dt;b.y+=b.vy*dt;
        if(b.burst){b.a-=dt*.9;if(b.a<=0){bubbles.splice(k,1);continue}}
        else if(b.y<-8||b.x<-20||b.x>W+20){bubbles[k]=spawn(false);continue}
        const fade=b.burst?b.a:b.a*Math.min(1,b.y/(H*.35));
        ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,6.283);
        ctx.fillStyle='rgba(150,228,232,'+(fade*.13).toFixed(3)+')';ctx.fill();
        ctx.strokeStyle='rgba(200,244,246,'+(fade*.42).toFixed(3)+')';ctx.lineWidth=1;ctx.stroke();
        if(b.r>2.6){ctx.fillStyle='rgba(255,255,255,'+(fade*.55).toFixed(3)+')';ctx.fillRect(b.x-b.r*.4,b.y-b.r*.45,1,1)}
      }
    }
    // Full rate only while someone is around: every frame for a minute after the last input, then
    // 12 fps, then 4 fps once the page has sat untouched for five minutes (a tab left open for hours).
    let timer=0,lastInput=performance.now(),slow=0;
    function loop(ts){
      raf=0;
      if(document.hidden||reduced()||!onScreen)return;
      const dt=last?Math.min(slow?.3:.05,(ts-last)/1000):0;last=ts;
      nextPing-=dt;
      if(nextPing<=0){const p=anchorPoint();ping(p.x,p.y,false);nextPing=rand(6,10)}
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
      if(reduced())return;
      const r=header.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
      const onAnchor=anchor&&e.target===anchor;
      if(!onAnchor&&e.target.closest('button,a,input'))return;
      ping(x,y,true);
      for(let k=0;k<(onAnchor?14:8);k++)bubbles.push(spawn(false,x+rand(-6,6),y+rand(-4,4),true));
      if(onAnchor)anchor.animate([{transform:'rotate(0)'},{transform:'rotate(-24deg)',offset:.2},{transform:'rotate(17deg)',offset:.45},
        {transform:'rotate(-9deg)',offset:.7},{transform:'rotate(0)'}],{duration:900,easing:'ease-out'});
    });
    if(window.ResizeObserver)new ResizeObserver(resize).observe(header);else window.addEventListener('resize',resize);
    if(window.IntersectionObserver)new IntersectionObserver(entries=>{onScreen=entries[0].isIntersecting;if(onScreen)start();else stop()}).observe(header);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else start()});
    motion.addEventListener('change',()=>{stop();if(reduced()){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height)}else start()});
    resize();start();
    window.BridgeFx=Object.assign(window.BridgeFx||{},{hero:()=>({running:Boolean(raf||timer),slow,bubbles:bubbles.length,pings:pings.length}),idleFor:ms=>{lastInput=performance.now()-ms}});
  })();

  /* ---------- 2. Navigation: sliding highlight and page progress ---------- */
  (function nav(){
    const bar=document.querySelector('.bridge-nav'),wrap=document.querySelector('.bridge-nav-wrap');
    if(!bar||!wrap)return;
    const pill=document.createElement('span');pill.className='fx-nav-pill';pill.setAttribute('aria-hidden','true');bar.prepend(pill);
    const progress=document.createElement('span');progress.className='fx-scroll-progress';progress.setAttribute('aria-hidden','true');wrap.appendChild(progress);
    bar.classList.add('fx-nav');
    let shown=false;
    function move(){
      const active=bar.querySelector('a.is-active');
      if(!active){pill.style.opacity='0';return}
      pill.style.opacity='1';
      pill.style.width=active.offsetWidth+'px';pill.style.height=active.offsetHeight+'px';
      pill.style.transform='translate('+active.offsetLeft+'px,'+active.offsetTop+'px)';
      if(!shown){shown=true;pill.getBoundingClientRect();pill.classList.add('is-live')} // no slide-in from the corner on first paint
      // Keep the active link in view when the bar scrolls sideways (phones).
      const left=active.offsetLeft-12,right=active.offsetLeft+active.offsetWidth+12;
      if(left<bar.scrollLeft)bar.scrollTo({left,behavior:reduced()?'auto':'smooth'});
      else if(right>bar.scrollLeft+bar.clientWidth)bar.scrollTo({left:right-bar.clientWidth,behavior:reduced()?'auto':'smooth'});
    }
    new MutationObserver(move).observe(bar,{attributes:true,attributeFilter:['class'],subtree:true});
    window.addEventListener('resize',frame(move));
    if(document.fonts&&document.fonts.ready)document.fonts.ready.then(move);
    move();
    const onScroll=frame(()=>{
      const max=root.scrollHeight-window.innerHeight;
      progress.style.transform='scaleX('+(max>0?Math.min(1,window.scrollY/max):0).toFixed(4)+')';
    });
    window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',onScroll);onScroll();
  })();

  /* ---------- 3. Sections rise into view as you scroll to them ---------- */
  (function reveal(){
    if(!window.IntersectionObserver||reduced())return;
    const targets=[...document.querySelectorAll('main > .panel, main > .ops-overview')];
    const pending=new Set();
    const show=el=>{if(!pending.delete(el))return;el.classList.add('fx-reveal-in');el.classList.remove('fx-reveal');
      el.addEventListener('animationend',()=>el.classList.remove('fx-reveal-in'),{once:true})};
    const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){io.unobserve(e.target);show(e.target)}}),{rootMargin:'0px 0px -8% 0px'});
    targets.forEach(el=>{
      if(el.getBoundingClientRect().top<window.innerHeight*.92)return; // already on screen: leave it alone
      el.classList.add('fx-reveal');pending.add(el);io.observe(el);
    });
    // Belt and braces: nothing may stay hidden if the observer misses (anchor jumps, restored scroll, print).
    const sweep=frame(()=>pending.forEach(el=>{if(el.getBoundingClientRect().top<window.innerHeight)show(el)}));
    window.addEventListener('scroll',sweep,{passive:true});
    window.addEventListener('hashchange',()=>setTimeout(sweep,60));
    window.addEventListener('beforeprint',()=>[...pending].forEach(show));
    motion.addEventListener('change',()=>{if(reduced())[...pending].forEach(show)});
    setTimeout(sweep,400);
  })();

  /* ---------- 4. Pointer light on cards, tilt on the metric tiles ---------- */
  (function light(){
    let lit=null;
    const SELECTOR='.ops-metric,.panel,.route-card,.ship,.fleet-card';
    const update=frame(e=>{
      const el=e.target.closest?.(SELECTOR);
      if(lit&&lit!==el){lit.classList.remove('fx-lit');lit.style.removeProperty('--fx-rx');lit.style.removeProperty('--fx-ry');lit=null}
      if(!el||reduced()||!fine.matches)return;
      const r=el.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
      el.style.setProperty('--fx-x',x.toFixed(1)+'px');el.style.setProperty('--fx-y',y.toFixed(1)+'px');
      if(el.classList.contains('ops-metric')){
        el.style.setProperty('--fx-ry',((x/r.width-.5)*7).toFixed(2)+'deg');
        el.style.setProperty('--fx-rx',((.5-y/r.height)*7).toFixed(2)+'deg');
      }
      el.classList.add('fx-lit');lit=el;
    });
    document.addEventListener('pointermove',update,{passive:true});
    document.addEventListener('pointerleave',()=>{if(lit){lit.classList.remove('fx-lit');lit=null}});
  })();

  /* ---------- 5. Press ripple on every button (drawn above the button, not inside it) ---------- */
  (function ripple(){
    let live=0;
    document.addEventListener('pointerdown',e=>{
      if(reduced()||live>=6||e.button>0)return;
      const el=e.target.closest?.('button,.bridge-nav a,.ops-metric-link,summary');
      if(!el||el.disabled||el.closest('#mini-harbor'))return;
      const r=el.getBoundingClientRect();
      if(r.width<8||r.height<8)return;
      const style=getComputedStyle(el),clip=document.createElement('span'),dot=document.createElement('span');
      clip.className='fx-ripple';clip.setAttribute('aria-hidden','true');
      clip.style.cssText='left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px;border-radius:'+style.borderRadius;
      const x=e.clientX-r.left,y=e.clientY-r.top,size=Math.hypot(Math.max(x,r.width-x),Math.max(y,r.height-y))*2;
      dot.style.cssText='left:'+x+'px;top:'+y+'px;width:'+size+'px;height:'+size+'px';
      // Light ripple on filled buttons, tinted ripple on pale ones.
      const rgb=(style.backgroundColor.match(/[\d.]+/g)||[255,255,255]).map(Number);
      if((rgb[0]*299+rgb[1]*587+rgb[2]*114)/1000<140&&(rgb[3]===undefined||rgb[3]>.5))dot.classList.add('is-light');
      clip.appendChild(dot);document.body.appendChild(clip);live++;
      const a=dot.animate([{transform:'translate(-50%,-50%) scale(0)',opacity:.55},{transform:'translate(-50%,-50%) scale(1)',opacity:0}],{duration:520,easing:'cubic-bezier(.2,.6,.3,1)'});
      a.onfinish=a.oncancel=()=>{clip.remove();live--};
    },{capture:true,passive:true});
  })();

  /* ---------- 6. Numbers roll when they change ---------- */
  (function numbers(){
    const ids=['ui-active-ships','ui-max-rank','ui-voyages','ui-fuel'];
    ids.forEach(id=>{
      const el=document.getElementById(id);if(!el)return;
      let prev=el.textContent;
      new MutationObserver(()=>{
        const now=el.textContent;if(now===prev)return;
        const first=prev==='—'||prev==='';prev=now;
        if(reduced()||document.hidden||first)return;
        el.animate([{transform:'translateY(55%)',opacity:0,filter:'blur(3px)'},{transform:'translateY(-8%)',opacity:1,filter:'blur(0)',offset:.7},{transform:'translateY(0)'}],
          {duration:420,easing:'cubic-bezier(.2,.8,.3,1)'});
        const card=el.closest('.ops-metric');
        if(card)card.animate([{boxShadow:'0 0 0 0 rgba(0,160,168,.45)'},{boxShadow:'0 0 0 9px rgba(0,160,168,0)'}],{duration:700,easing:'ease-out'});
      }).observe(el,{childList:true,characterData:true,subtree:true});
    });
  })();

  /* ---------- 7. Celebration: a settlement that raises the Rank ---------- */
  (function celebrate(){
    let busy=false;
    function burst(x,y,title,detail){
      if(busy||reduced()||document.hidden)return;
      const canvas=document.createElement('canvas'),ctx=canvas.getContext&&canvas.getContext('2d');
      if(!ctx)return;
      busy=true;
      const W=window.innerWidth,H=window.innerHeight,dpr=Math.min(2,window.devicePixelRatio||1);
      canvas.className='fx-burst';canvas.setAttribute('aria-hidden','true');canvas.width=W*dpr;canvas.height=H*dpr;
      document.body.appendChild(canvas);
      const banner=document.createElement('div');banner.className='fx-rankup';banner.setAttribute('aria-hidden','true');
      const s=document.createElement('strong');s.textContent=title;const d=document.createElement('span');d.textContent=detail;
      banner.append(s,d);document.body.appendChild(banner);
      const colors=['#f6d58a','#5dd6d0','#ffffff','#e7b970','#8fe3b0','#7ab6ff'];
      const parts=[];
      for(let k=0;k<110;k++){
        const ang=-Math.PI/2+(Math.random()-.5)*2.3,speed=260+Math.random()*520;
        parts.push({x,y,vx:Math.cos(ang)*speed,vy:Math.sin(ang)*speed,w:4+Math.random()*5,h:2+Math.random()*4,rot:Math.random()*6.28,vr:(Math.random()-.5)*14,
          c:colors[k%colors.length],life:0,max:1.5+Math.random()*1.1,round:k%4===0});
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
        else{canvas.remove();busy=false}
      })(0);
      const a=banner.animate([{transform:'translate(-50%,-50%) scale(.6)',opacity:0},{transform:'translate(-50%,-50%) scale(1.06)',opacity:1,offset:.14},
        {transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.22},{transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.8},
        {transform:'translate(-50%,-62%) scale(1)',opacity:0}],{duration:2400,easing:'ease-out'});
      a.onfinish=a.oncancel=()=>banner.remove();
    }
    window.addEventListener('submarine-settlement-saved',e=>{
      const d=e.detail||{},before=Number(d.rankBefore),after=Number(d.rankAfter);
      if(!(Number.isFinite(before)&&Number.isFinite(after)&&after>before))return;
      const button=document.getElementById('settle-save'),r=button?button.getBoundingClientRect():null;
      const onScreen=r&&r.bottom>0&&r.top<window.innerHeight;
      burst(onScreen?r.left+r.width/2:window.innerWidth/2,onScreen?r.top:window.innerHeight*.7,'RANK UP','Rank '+before+' → '+after);
    });
    window.BridgeFx=Object.assign(window.BridgeFx||{},{celebrate:burst});
  })();
})();
