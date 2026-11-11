/* Harbor link v1: ties page actions to the harbor at the bottom of the screen.
   Display only. Reads fleet state, never writes it, and never delays planner actions.
   - Departure: a light trail flies from the 確認出航 button to the boat, then a caption follows the boat out.
   - Return: a caption over the berth; boats waiting for settlement carry a "!" marker (CSS).
   - Settlement: a caption with the rank change.
   - Clicking a boat that waits for settlement jumps to 返航結算 with that boat selected. */
(function(){
  'use strict';
  const KEY='ff14_submarine_planner_v1';
  const dock=document.getElementById('mini-harbor'),fleetEl=document.getElementById('harbor-fleet');
  if(!dock||!fleetEl)return;
  const motion=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):null;
  const reduced=()=>Boolean(motion&&motion.matches);
  const boat=i=>fleetEl.querySelector('[data-harbor-ship="'+i+'"]');
  function read(){try{return JSON.parse(FF14Data.readRaw(KEY)||'{}')||{}}catch{return {}}}
  function shipName(i,ship){return typeof ship?.name==='string'&&ship.name.trim()?ship.name.trim():'潛水艇 '+(i+1)}
  function fmt(ms){return new Date(ms).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}

  /* ---------- captions ---------- */
  const layer=document.createElement('div');
  layer.className='harbor-captions';layer.setAttribute('aria-hidden','true'); // toasts already announce these moments
  document.body.appendChild(layer);
  const captions=new Map();
  let follow=0;
  function place(entry){
    const b=boat(entry.i);
    if(!b||b.hidden){remove(entry.i);return}
    const r=b.getBoundingClientRect(),width=window.innerWidth||document.documentElement.clientWidth||1200;
    const half=entry.node.offsetWidth/2;
    const x=Math.max(half+8,Math.min(width-half-8,r.left+r.width/2));
    entry.node.style.left=x.toFixed(1)+'px';
    entry.node.style.top=Math.max(entry.node.offsetHeight+6,r.top-8).toFixed(1)+'px';
    // The pointer stays on the boat even when the caption is clamped at a screen edge.
    entry.node.style.setProperty('--tail',Math.max(10,Math.min(entry.node.offsetWidth-10,r.left+r.width/2-x+half)).toFixed(1)+'px');
  }
  // Captions of neighbouring berths stack upward instead of covering each other.
  function layout(){
    captions.forEach(place);
    const placed=[];
    [...captions.values()].sort((a,b)=>a.i-b.i).forEach(entry=>{
      let r=entry.node.getBoundingClientRect(),top=parseFloat(entry.node.style.top);
      for(const p of placed){
        if(r.left<p.right+4&&r.right>p.left-4&&r.top<p.bottom+4&&r.bottom>p.top-4){
          top=Math.max(r.height+6,p.top-6);entry.node.style.top=top.toFixed(1)+'px';r=entry.node.getBoundingClientRect();
        }
      }
      placed.push(r);
    });
  }
  function tick(){
    follow=0;
    if(!captions.size||document.hidden)return;
    layout();
    if(captions.size)follow=requestAnimationFrame(tick);
  }
  function remove(i){
    const entry=captions.get(i);if(!entry)return;
    clearTimeout(entry.timer);clearTimeout(entry.gone);entry.node.remove();captions.delete(i);
  }
  function caption(i,tone,title,detail,seconds){
    if(dock.classList.contains('is-collapsed'))return;
    const b=boat(i);if(!b||b.hidden)return;
    remove(i);
    const node=document.createElement('div');
    node.className='harbor-caption is-'+tone;
    const strong=document.createElement('strong');strong.textContent=title;node.appendChild(strong);
    if(detail){const span=document.createElement('span');span.textContent=detail;node.appendChild(span)}
    layer.appendChild(node);
    const entry={i,node,timer:0,gone:0};
    captions.set(i,entry);layout();
    entry.timer=setTimeout(()=>{
      node.classList.add('is-leaving');
      entry.gone=setTimeout(()=>{if(captions.get(i)===entry)remove(i)},reduced()?0:260);
    },seconds*1000);
    if(!follow)follow=requestAnimationFrame(tick);
  }

  /* ---------- departure trail: from the button the player pressed to the boat ---------- */
  let lastPress=null;
  document.addEventListener('click',event=>{
    // The confirmation dialog sits between the press and the departure; fly from whichever was pressed last.
    const target=event.target.closest?.('.voyage-depart-button,[data-dialog-ok],[data-dialog-cancel]');
    if(!target)return;
    if(!target.matches('.voyage-depart-button')&&!lastPress)return;
    if(target.matches('[data-dialog-cancel]')){lastPress=null;return}
    const button=target;
    const r=button.getBoundingClientRect();
    lastPress={x:r.left+r.width/2,y:r.top+r.height/2,at:performance.now()};
  },{capture:true,passive:true});
  function trail(i){
    const press=lastPress;lastPress=null;
    const b=boat(i);
    if(!press||!b||b.hidden||reduced()||document.hidden||typeof b.animate!=='function')return;
    if(performance.now()-press.at>20000||dock.classList.contains('is-collapsed'))return;
    const r=b.getBoundingClientRect(),tx=r.left+r.width/2,ty=r.top+r.height/2;
    const dx=tx-press.x,dy=ty-press.y,dist=Math.hypot(dx,dy);
    if(dist<40)return;
    const duration=Math.max(420,Math.min(900,dist*.9));
    const spark=document.createElement('span');
    spark.className='harbor-trail';spark.style.left=press.x+'px';spark.style.top=press.y+'px';
    document.body.appendChild(spark);
    // Arc: rise a little first, then drop onto the boat.
    const lift=-Math.min(90,dist*.18);
    const frames=[0,.25,.5,.75,1].map(t=>{
      const x=dx*t,y=dy*t*t+lift*4*t*(1-t);
      return {transform:'translate(-50%,-50%) translate('+x.toFixed(1)+'px,'+y.toFixed(1)+'px) scale('+(1.15-.45*t).toFixed(2)+')',opacity:t===0?0:t===1?.9:1,offset:t};
    });
    const flight=spark.animate(frames,{duration,easing:'cubic-bezier(.4,0,.6,1)',fill:'forwards'});
    const done=()=>{
      spark.remove();
      const ring=document.createElement('span');
      ring.className='harbor-trail-ring';ring.style.left=tx+'px';ring.style.top=ty+'px';
      document.body.appendChild(ring);
      const a=ring.animate([{transform:'translate(-50%,-50%) scale(.3)',opacity:.9},{transform:'translate(-50%,-50%) scale(2.6)',opacity:0}],{duration:620,easing:'ease-out'});
      a.onfinish=a.oncancel=()=>ring.remove();
    };
    flight.onfinish=done;flight.oncancel=()=>spark.remove();
  }

  /* ---------- fleet moments ---------- */
  window.addEventListener('submarine-voyage-started',event=>{
    const i=Number(event.detail?.index);if(!Number.isInteger(i))return;
    const ship=(read().ships||[])[i]||{},eta=Number(ship.voyage?.etaAt);
    trail(i);
    caption(i,'depart',shipName(i,ship)+' 出航',Number.isFinite(eta)?'預計 '+fmt(eta)+' 返航':'',6.5);
  });
  window.addEventListener('harbor-submarine-arrived',event=>{
    const i=Number(event.detail?.index);if(!Number.isInteger(i))return;
    const ship=(read().ships||[])[i]||{};
    caption(i,'arrive',shipName(i,ship)+' 已返航','點船前往結算',9);
  });
  window.addEventListener('submarine-settlement-saved',event=>{
    const d=event.detail||{},i=Number(d.index);if(!Number.isInteger(i))return;
    const ship=(read().ships||[])[i]||{},before=Number(d.rankBefore),after=Number(d.rankAfter);
    const up=Number.isFinite(before)&&Number.isFinite(after)&&after>before;
    caption(i,up?'rankup':'settle',shipName(i,ship)+' 結算完成',up?'Rank '+before+' → '+after:'',7);
  });
  // A departure caption must not outlive its voyage (undo, import).
  ['submarine-state-updated','submarine-data-imported','submarine-build-state-updated'].forEach(name=>window.addEventListener(name,()=>{
    const ships=read().ships||[];
    captions.forEach((entry,i)=>{if(entry.node.classList.contains('is-depart')&&!ships[i]?.voyaging)remove(i)});
  }));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&captions.size&&!follow)follow=requestAnimationFrame(tick)});
  window.addEventListener('resize',layout);

  /* ---------- a boat waiting for settlement leads to the settlement form ---------- */
  function goSettle(i){
    const panel=document.getElementById('return-settlement'),select=document.getElementById('settle-ship');
    if(!panel)return;
    const value=String(i+1);
    if(select&&select.value!==value&&[...select.options].some(o=>o.value===value)){
      select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));
    }
    panel.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'start'});
    if(select)select.focus({preventScroll:true});
  }
  fleetEl.addEventListener('click',event=>{
    const b=event.target.closest?.('[data-harbor-ship]');
    if(b&&b.classList.contains('is-awaiting'))goSettle(Number(b.dataset.harborShip));
  });
  fleetEl.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    const b=event.target.closest?.('[data-harbor-ship]');
    if(b&&b.classList.contains('is-awaiting')){event.preventDefault();goSettle(Number(b.dataset.harborShip))}
  });
  window.HarborLink={caption,captions:()=>[...captions.keys()]};
})();
