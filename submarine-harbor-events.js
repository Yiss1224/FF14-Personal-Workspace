/* Harbor random events v1 (experimental): small stories drawn on the harbor scene canvas.
   Display only. Never touches fleet data, timers of the planner, or the DOM submarines.
   Each event declares when it may run, its weight, cooldown, duration and the space it uses;
   the scheduler keeps quiet gaps, caps concurrency and never overlaps events in one space.
   Developer preview: add ?harbor-dev=1 to the URL (panel + window.HarborScene.events API). */
(function(){
  'use strict';
  const DEV=new URLSearchParams(location.search).has('harbor-dev');

  /* ---------- small helpers ---------- */
  function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  const lerp=(a,b,t)=>a+(b-a)*t;
  const seg=(t,a,b)=>t<=a?0:t>=b?1:(t-a)/(b-a);
  const smooth=v=>v*v*(3-2*v);
  const R=(g,c,x,y,w,h)=>{g.fillStyle=c;g.fillRect(Math.round(x),Math.round(y),w,h)};
  let A=null; // scene api (sprite, glow, gust, ...)
  const spr=(g,rows,pal,x,y,flip,alpha=1)=>{const s=A.sprite(rows,pal,Boolean(flip));if(alpha<1)g.globalAlpha=alpha;g.drawImage(s,Math.round(x),Math.round(y));if(alpha<1)g.globalAlpha=1;return s};
  const sprCrop=(g,rows,pal,x,y,flip,top,hgt)=>{const s=A.sprite(rows,pal,Boolean(flip));if(hgt<=0)return;g.drawImage(s,0,top,s.width,hgt,Math.round(x),Math.round(y)+top,s.width,hgt)};

  // Pixel people in the same proportions as the harbor workers (3 px wide, 9 px tall).
  function person(g,o){
    const x=Math.round(o.x),y=Math.round(o.y),dir=o.dir>=0?1:-1,p=o.pal,pose=o.pose||'stand',f=o.frame|0;
    if(o.alpha!==undefined)g.globalAlpha=o.alpha;
    const front=dir>0?x+3:x-1,backX=dir>0?x-1:x+3;
    if(o.kind==='small'){ // Lalafell
      R(g,p.legs,x,y-1,1,1);R(g,p.legs,x+2,y-1-(pose==='walk'&&f%2?1:0),1,1);
      R(g,p.top,x,y-4,3,3);if(p.cape)R(g,p.cape,backX,y-4,1,3);
      R(g,p.hair,x-1,y-7,5,2);R(g,p.skin,dir>0?x+1:x,y-6,2,2);R(g,p.hair,dir>0?x:x+2,y-6,1,2);
      R(g,'#2a2420',dir>0?x+2:x,y-6,1,1);R(g,p.skin,backX,y-6,1,1);
      if(pose==='wave')R(g,p.skin,front,y-8+(f%2),1,2);
      g.globalAlpha=1;return;
    }
    const dy=pose==='sit'?2:pose==='crouch'?1:0;
    // legs
    if(pose==='sit'){R(g,p.legs,dir>0?x:x-1,y-1,4,1);R(g,p.boots,dir>0?x+3:x-1,y-1,1,1)}
    else if(pose==='crouch'){R(g,p.legs,x,y-1,3,1);R(g,p.boots,dir>0?x+2:x,y-1,1,1)}
    else if(pose==='walk'&&f%2){R(g,p.legs,x+1,y-2,1,2);R(g,p.boots,x+1,y-1,1,1)}
    else{R(g,p.legs,x,y-2,1,2);R(g,p.legs,x+2,y-2,1,2);R(g,p.boots,x,y-1,1,1);R(g,p.boots,x+2,y-1,1,1)}
    // cape and tail behind the body
    if(p.cape)R(g,p.cape,backX,y-6+dy,1,pose==='sit'?3:5);
    if(p.tail){const sw=(o.swish||0);R(g,p.tail,backX,y-3+dy,1,1);R(g,p.tail,backX-dir,y-4+dy+sw,1,1);R(g,p.tail,backX-dir,y-5+dy+sw,1,1)}
    // body, head, hair
    R(g,p.top,x,y-6+dy,3,4);if(p.belt)R(g,p.belt,x,y-4+dy,3,1);
    R(g,p.skin,dir>0?x+1:x,y-8+dy,2,2);R(g,p.hair,dir>0?x:x+2,y-8+dy,1,2);R(g,p.hair,x,y-9+dy,3,1);
    R(g,'#2a2420',dir>0?x+2:x,y-8+dy+(o.lookUp?0:0),1,1);
    if(p.hat)R(g,p.hat,x-1,y-9+dy,5,1);
    if(p.ears){R(g,p.hair,x,y-10+dy,1,1);R(g,p.hair,x+2,y-10+dy,1,1)}
    // arms
    if(pose==='wave'){R(g,p.skin,front,y-9+dy+(f%2),1,2)}
    else if(pose==='cast'){R(g,p.top,front,y-8+dy,1,2);R(g,p.skin,front,y-10+dy,1,2)}
    else if(pose==='shade'){R(g,p.top,front,y-7+dy,1,1);R(g,p.skin,front,y-8+dy,1,1)}
    else if(pose==='carry'){R(g,p.skin,front,y-6+dy,1,1)}
    else R(g,p.top,front-dir,y-5+dy,1,1);
    g.globalAlpha=1;
  }
  const ICONS={'!':['#','#','#','.','#'],'?':['###','..#','.##','...','.#.'],'♪':['.####','.#..#','.#..#','##.##','##.##'],'♥':['##.##','#####','#####','.###.','..#..'],'z':['###','..#','.#.','#..','###']};
  function bubble(g,x,y,icon,color){ // speech bubble: 7x7 above (x,y) = tip
    const bx=Math.round(x-3),by=Math.round(y-8);
    R(g,'#33424a',bx,by,7,7);R(g,'#fffbea',bx+1,by+1,5,5);R(g,'#fffbea',bx,by+1,1,5);R(g,'#fffbea',bx+6,by+1,1,5);
    R(g,'#33424a',bx,by,1,1);R(g,'#33424a',bx+6,by,1,1);R(g,'#33424a',bx,by+6,1,1);R(g,'#33424a',bx+6,by+6,1,1);
    R(g,'#fffbea',Math.round(x),by+7,1,1);
    const rows=ICONS[icon]||ICONS['!'],ox=bx+1+((5-rows[0].length)>>1);g.fillStyle=color||'#b5452e';
    rows.forEach((row,ry)=>[...row].forEach((c,rx)=>{if(c==='#')g.fillRect(ox+rx,by+1+ry,1,1)}));
  }
  // Particles shared by events: {x,y,vx,vy,life,max,col,g(ravity)}
  function stepParticles(list,dt){
    for(const q of list){q.life+=dt;q.vy+=(q.g||0)*dt;q.x+=q.vx*dt;q.y+=q.vy*dt}
    for(let i=list.length-1;i>=0;i--)if(list[i].life>=list[i].max)list.splice(i,1);
  }
  function drawParticles(g,list,size=1){
    for(const q of list){const a=(q.a??1)*(1-q.life/q.max);g.globalAlpha=Math.max(0,a);g.fillStyle=q.col;g.fillRect(Math.round(q.x),Math.round(q.y),size,size)}
    g.globalAlpha=1;
  }
  function ring(g,x,y,r,col,a){ // flat water ring (ellipse 3:1)
    g.globalAlpha=a;g.fillStyle=col;
    for(let k=0;k<12;k++){const ang=k/12*Math.PI*2,px=Math.round(x+Math.cos(ang)*r),py=Math.round(y+Math.sin(ang)*r*.3);g.fillRect(px,py,1,1)}
    g.globalAlpha=1;
  }
  const foam='rgba(232,250,247,.85)';
  const openSea=env=>[env.G.dockR+10,env.w-12];
  const buoyX=env=>Math.round(env.G.dockR+Math.max(8,(env.w-env.G.dockR)*.08));
  const deckY=env=>env.G.apronY-1;
  const mooredBoats=env=>env.boatDraw.filter(d=>d&&d.moored);

  /* ---------- sprites ---------- */
  const SEAL={o:'#46555b',G:'#8b999e',g:'#c3cdcf',k:'#141a1d',n:'#2a3034',w:'#e8eded',d:'#6b797e'};
  const SEAL_F=['...oooo...','..oggggo..','.oGgggGGo.','.oGkGGkGo.','woGGnnGGow','.oGGddGGo.','oGGGGGGGGo','oGGgGGGGGo','oGGGGGGGGo'];
  const SEAL_L=['...oooo...','..oggggo..','.oggGGGGo.','.okGGkGGo.','wonnGGGGow','.oddGGGGo.','oGGGGGGGGo','oGGgGGGGGo','oGGGGGGGGo'];
  const SEAL_R=['...oooo...','..oggggo..','.oGGGgggo.','.oGGkGGko.','woGGGGnnow','.oGGGGddo.','oGGGGGGGGo','oGGGGGgGGo','oGGGGGGGGo'];
  const SEAL_B=['...oooo...','..oggggo..','.oGgggGGo.','.oGdGGdGo.','woGGnnGGow','.oGGddGGo.','oGGGGGGGGo','oGGgGGGGGo','oGGGGGGGGo'];
  const CRAB={R:'#c4513a',r:'#e58f6e',C:'#e27a5c',k:'#151515',l:'#8a3826'};
  const CRAB_A=['.k...k.','C.RRR.C','CRRRRRC','.RrRrR.','l.l.l.l'];
  const CRAB_B=['.k...k.','C.RRR.C','CRRRRRC','.RrRrR.','.l.l.l.'];
  const CRAB_UP=['Ck...kC','C.RRR.C','.RRRRR.','.RrRrR.','l.l.l.l'];
  const CRAB_EYES=['.k...k.'];
  const GULL={w:'#f4f6f2',G:'#9aa7ad',k:'#1d1d1d',O:'#f0a33a',y:'#e3a54a'};
  const GULL_SIT=['....ww..','....wkwO','GG.wwww.','.GGGwww.','..GGww..','...y.y..'];
  const GULL_PREEN=['........','........','GG.wwww.','.GOkwww.','..GGww..','...y.y..'];
  const GULL_SHAKE=['....ww..','...wwkwO','GGwwwww.','GGGGwww.','..GGww..','...y.y..'];
  const TIT={W:'#f5f3ec',T:'#2b2b30',k:'#141414',b:'#3a2a20',B:'#cfa7a3',d:'#5d4c42'};
  const TIT_A=['...WWW.','TTTWWkb','...BWW.','....d..'];
  const TIT_TILT=['...WWk.','TTTWWWb','...BWW.','....d..'];
  const TIT_FLICK=['T..WWW.','.TTWWkb','...BWW.','....d..'];
  const TIT_FLY=['..WW...','TTTWWkb','...WW..'];
  const CAT={c:'#8f99a3',s:'#5b6570',k:'#1c2228',w:'#f4f1ea',p:'#e59a9a'};
  const CAT_SIT=['..c..c','..cccc','..ckck','...cw.','..cscc','t.cccc','tt.cc.'];
  const CAT_ALERT=['.c...c','.ccccc','.ckckc','..cpc.','..cscc','t.cccc','tt.cc.'];
  const CAT_GROOM=['......','..c..c','..cccc','..cck.','..cscp','t.cccc','tt.cc.'];
  const CAT_WALK_A=['.....c.c','t....ccc','.tcssckc','..cccccw','..c.c.c.'];
  const CAT_WALK_B=['.....c.c','t....ccc','.tcssckc','..cccccw','...c.c.c'];
  const CAT_STRETCH=['t.......','.tc.....','..cc..cc','...cccck','..c..ccw'];
  const CAT_CROUCH=['........','t....c.c','.tcssckc','.ccccccw'];
  const CAT_NAP=['..cscc.','.cccccc','tcccc..'];
  const CHOCO={Y:'#f2c94c',y:'#fbe48a',k:'#232323',O:'#e8892d',L:'#dd7e25',w:'#e2ad36'};
  const CHOCO_A=['.....yy..','....YYYY.','....YkYOO','....YYY..','.yY.YYY..','yYYYYYYY.','.YYwwYYY.','..YYYYY..','...L..L..','..LL..LL.'];
  const CHOCO_B=['.....yy..','....YYYY.','....YkYOO','....YYY..','.yY.YYY..','yYYYYYYY.','.YYwwYYY.','..YYYYY..','....LL...','...LLLL..'];
  const CHOCO_FLAP=['.....yy..','....YYYY.','....YkYOO','..w.YYY..','.ywwYYY..','yYYYYYYY.','.YYYYYYY.','..YYYYY..','...L..L..','..LL..LL.'];
  const SAIL={m:'#5a4634',S:'#f4efe0',s:'#d8d0bc',h:'#4a3a2e',f:'#d0553f'};
  const SAIL_L=['..fm...','...mS..','...mSS.','..smSS.','.ssmSSS','hhhhhhh','.hhhhh.'];
  const BOTTLE={o:'#24533f',g:'#4f9a76',G:'#8fd0ad',c:'#a8794a',p:'#f4ecd2'};
  const BOTTLE_A=['oooooc','gpGggc','oooooo'];
  const BOTTLE_B=['.ooooc','ogpGgc','ooooo.'];
  const CART={b:'#7a5530',B:'#a7773f',k:'#2f2f2f',h:'#5b4632'};
  const CART_S=['h.......','.hbbbbbb','..bBBBBb','...k..k.'];

  /* ---------- palettes for visitors ---------- */
  const ADVENTURERS=[
    {hair:'#e6a3bd',skin:'#f3d3b4',top:'#3f6fa8',legs:'#33405a',boots:'#5a4030',cape:'#a83a3a',ears:true,tail:'#e6a3bd',belt:'#c9a24a'},
    {hair:'#2f2a2a',skin:'#e9c29d',top:'#5f8a4c',legs:'#3a3a30',boots:'#4a3424',cape:'#7a5a3a',ears:true,tail:'#2f2a2a'},
    {hair:'#f1e3b0',skin:'#f6dcc3',top:'#e2e0d6',legs:'#55607a',boots:'#6b4b33',cape:'#4b6fae',belt:'#b58a3c'}
  ];
  const MAGE={hair:'#3d4f8f',skin:'#f0d0b2',top:'#2f3f73',legs:'#2a3360',boots:'#2a2a3a',cape:'#5b6fc0',hat:'#2f3f73'};
  const MECH={hair:'#4a3628',skin:'#efcca8',top:'#e08a3c',legs:'#c87430',boots:'#3a2e26',hat:'#3b5b7a'};
  const PORTER={hair:'#6a4a32',skin:'#f0d2a8',top:'#4e7fa8',legs:'#3a4652',boots:'#3a2e26',hat:'#4e7fa8'};
  const KEEPER={hair:'#8a8f96',skin:'#f0d2a8',top:'#3e5b4d',legs:'#2e3a36',boots:'#3a2e26',belt:'#c9a24a'};
  const LALA={hair:'#f2a65a',skin:'#f6d7b8',top:'#c4566b',legs:'#5a4a6a',cape:null};

  /* ============================================================
     Event definitions
     ============================================================ */
  const DEFS=[];
  const def=d=>DEFS.push(d);

  // 1. Seal: ripples, head rises, looks around, blinks, dives with a splash.
  def({id:'seal',name:'海豹探頭',time:'any',weight:8,cooldown:240,
    setup(e,env){
      const [lo,hi]=openSea(env),bx=buoyX(env);let x=lerp(lo+4,hi-6,e.r());
      if(Math.abs(x-bx)<9)x=bx+12<hi?bx+12:bx-12;
      e.x=Math.round(x);e.y=env.G.waterline+4;e.dur=10;e.drops=[];
      e.zones=[['water',e.x-9,e.x+9]];
      e.look=[[2.2,'F'],[3.4,'L'],[4.2,'B'],[4.35,'L'],[5,'F'],[5.6,'R'],[6.5,'B'],[6.65,'R'],[6.9,'F']];
    },
    update(e,dt){
      if(e.t>=7.35&&!e.splashed){e.splashed=true;
        for(let k=0;k<14;k++)e.drops.push({x:e.x+(k-7)*.7,y:e.y-1,vx:(k-7)*3.4,vy:-12-e.r()*14,g:55,life:0,max:.8+e.r()*.4,col:k%3?foam:'#ffffff'});
        for(let k=0;k<6;k++)e.drops.push({x:e.x+(e.r()-.5)*2,y:e.y-1,vx:(e.r()-.5)*2,vy:-22-k*3,g:50,life:0,max:.7,col:'#ffffff'})}
      stepParticles(e.drops,dt);
    },
    surface(g,e,env){
      const t=e.t,rise=smooth(seg(t,1.2,2.2))*(1-smooth(seg(t,7,7.6)));e.focus=[e.x,e.y-4];
      for(const [st,sp] of [[0,1.4],[.5,1.4],[7.3,2.2],[7.8,2.2]]){const k=seg(t,st,st+sp);if(k>0&&k<1)ring(g,e.x,e.y,1.5+k*7,foam,.6*(1-k))}
      const shown=Math.round(rise*8);
      if(shown>0){
        let face='F';for(const [at,f] of e.look)if(t>=at)face=f;
        const rows=face==='L'?SEAL_L:face==='R'?SEAL_R:face==='B'?SEAL_B:SEAL_F;
        const bob=t>2.2&&t<7?Math.round(Math.sin(t*2.1)*.6):0;
        const s=A.sprite(rows,SEAL,false),top=e.y-shown+bob;
        g.drawImage(s,0,0,10,shown,e.x-5,top,10,shown);
        R(g,foam,e.x-6,e.y+1,2,1);R(g,foam,e.x+5,e.y+1,2,1);R(g,'rgba(232,250,247,.5)',e.x-4,e.y+1,8,1);
        if(Math.sin(t*5)>.7)R(g,foam,e.x-3+Math.round(e.r()*6),e.y+1,1,1);
      }
      drawParticles(g,e.drops,2);
    }
  });

  // 2. Fish school: shadows glide under the surface, ripples above, one fish leaps.
  def({id:'fish',name:'小魚群',time:'any',weight:9,cooldown:180,
    setup(e,env){
      const dir=e.r()<.5?1:-1,[lo,hi]=[env.G.landR+6,env.w-6],span=Math.min(150,hi-lo-10);
      const start=dir>0?lerp(lo,hi-span,e.r()):lerp(lo+span,hi,e.r());
      e.dir=dir;e.x0=start;e.span=span;e.dur=10;e.fish=[];e.drops=[];
      for(let i=0;i<9;i++)e.fish.push({dx:-i*3.4-e.r()*3,dy:(e.r()-.5)*6,ph:e.r()*6.28,flash:0});
      const a=Math.min(start,start+dir*span),b=Math.max(start,start+dir*span);
      e.zones=[['water',a-12,b+12]];e.jumpAt=4.6;
    },
    head(e,t){return e.x0+e.dir*e.span*(t/e.dur)},
    update(e,dt,env){
      for(const f of e.fish){f.flash=Math.max(0,f.flash-dt);if(e.r()<dt*.6)f.flash=.2}
      if(!e.leapDone&&e.t>=e.jumpAt){e.leapDone=true;e.leap={x:this.head(e,e.t)+e.dir*3,t:0}}
      if(e.leap){e.leap.t+=dt;const k=e.leap.t/.75;
        if(k>=1&&!e.leap.in){e.leap.in=true;for(let i=0;i<6;i++)e.drops.push({x:e.leap.x+e.dir*10,y:env.G.waterline,vx:(e.r()-.5)*10,vy:-10-e.r()*8,g:55,life:0,max:.55,col:foam})}}
      stepParticles(e.drops,dt);
    },
    underwater(g,e,env){
      const t=e.t,fade=Math.min(seg(t,0,1.4),1-seg(t,e.dur-1.6,e.dur)),base=env.G.waterline+5,hx=this.head(e,t);
      for(const f of e.fish){
        const x=Math.round(hx+e.dir*f.dx+Math.sin(t*3+f.ph)*.8),y=Math.round(base+f.dy+Math.sin(t*2.2+f.ph)*.9+(1-fade)*3);
        const tail=x-e.dir*2,flick=Math.sin(t*9+f.ph)>0?1:0;
        g.globalAlpha=.85*fade;R(g,'#1c3d4c',e.dir>0?x-1:x,y,4,2);R(g,'#9ec3cc',e.dir>0?x:x+1,y,2,1);R(g,'#1c3d4c',tail,y-flick,1,1);R(g,'#1c3d4c',tail,y+1-flick,1,1);
        if(f.flash>0)R(g,'#f2ffff',e.dir>0?x+1:x,y,2,1);
      }
      g.globalAlpha=1;
    },
    surface(g,e,env){
      const t=e.t,fade=Math.min(seg(t,.5,1.6),1-seg(t,e.dur-1.6,e.dur)),hx=this.head(e,t),wl=env.G.waterline;e.focus=[hx-e.dir*8,wl];
      if(fade>0)for(let k=0;k<3;k++){const ph=(t*1.3+k*.33)%1;ring(g,hx-e.dir*(4+k*7),wl+1,1+ph*3,foam,.45*fade*(1-ph))}
      if(e.leap&&e.leap.t<.75){const k=e.leap.t/.75,x=Math.round(e.leap.x+e.dir*12*k),y=Math.round(wl-Math.sin(k*Math.PI)*11),tilt=k<.5?1:-1;
        R(g,'#7f9fa8',x-1,y,5,2);R(g,'#e3f3f5',x,y,3,1);R(g,'#1c3d4c',e.dir>0?x+3:x-1,y,1,1);R(g,'#7f9fa8',x-e.dir*3,y+tilt,1,2);
        for(let d=1;d<4;d++)if(k>d*.08)R(g,'rgba(232,250,247,.6)',Math.round(e.leap.x+e.dir*12*(k-d*.08)),Math.round(wl-Math.sin((k-d*.08)*Math.PI)*11)+2,1,1)}
      if(e.leap&&e.leap.t<.4){ring(g,e.leap.x,wl+1,1+e.leap.t*10,foam,.8)}
      drawParticles(g,e.drops,2);
    }
  });

  // 3. Crab: peeks out of a crevice, scuttles along the embankment, waves its claws, hides.
  def({id:'crab',name:'石縫螃蟹',time:'any',weight:7,cooldown:220,
    can:env=>env.G.crevices&&env.G.landR>=14,
    setup(e,env){
      const [c0,c1]=e.r()<.5?env.G.crevices:[...env.G.crevices].reverse();
      e.from=c0;e.to=c1;e.y=env.G.waterline-4;e.dur=14;e.stops=[lerp(c0,c1,.35),lerp(c0,c1,.7)];
      e.zones=[['wall',0,env.G.landR]];
    },
    pos(e){ // x along the wall, with two pauses
      const t=e.t,walk=t<2?0:t>11?1:null;
      if(walk!==null)return lerp(e.from,e.to,walk);
      const legs=[[2,4.6,0,.35],[5.8,8.2,.35,.7],[9.2,11,.7,1]];
      for(const [a,b,p0,p1] of legs){if(t<a)return lerp(e.from,e.to,p0);if(t<=b)return lerp(e.from,e.to,lerp(p0,p1,(t-a)/(b-a)))}
      return e.to;
    },
    actors(g,e){
      const t=e.t,x=this.pos(e);e.focus=[x,e.y];const wave=(t>4.6&&t<5.8)||(t>8.2&&t<9.2),moving=!wave&&t>2&&t<11;
      if(t<1.4){if(Math.floor(t*3)%3!==1)spr(g,CRAB_EYES,CRAB,e.from-1,e.y-1);return}       // eyes peek, blink
      if(t>13){if(Math.floor(t*3)%3!==1)spr(g,CRAB_EYES,CRAB,e.to-1,e.y-1);return}
      const emerge=seg(t,1.4,2),hide=seg(t,12,13);
      const rows=wave?(Math.floor(t*4)%2?CRAB_UP:CRAB_A):moving&&Math.floor(t*8)%2?CRAB_B:CRAB_A;
      const shown=Math.round(5*Math.min(emerge,1-hide));
      sprCrop(g,rows,CRAB,x-2,e.y-2,false,0,shown);
      if(shown<5&&shown>0)R(g,'#2c3432',(t<6?e.from:e.to),e.y,3,2-Math.min(1,shown>>1));
    }
  });

  // 4. Moon jellies (night): bells pulse and drift up through the water, glowing softly.
  def({id:'jelly',name:'夜光水母',time:'night',weight:9,cooldown:200,
    setup(e,env){
      const [lo,hi]=openSea(env),cx=lerp(lo+10,hi-14,e.r());e.dur=16;e.j=[];
      const n=env.w<300?2:3;
      for(let i=0;i<n;i++)e.j.push({x:cx+(i-1)*12+(e.r()-.5)*4,y:env.h-6-e.r()*3-(i%2)*3,ph:e.r()*6.28,col:i%2?[255,170,220]:[150,240,255]});
      e.zones=[['water',cx-18,cx+18]];
    },
    jp(e,j){const t=e.t,pulse=Math.sin(t*2.6+j.ph);return {x:j.x+Math.sin(t*.4+j.ph)*2,y:j.y-t*.55-Math.max(0,pulse)*.4,pulse}},
    underwater(g,e){
      const fade=Math.min(seg(e.t,0,2),1-seg(e.t,e.dur-2.5,e.dur));e.focus=[e.j[0].x,e.j[0].y-e.t*.55];
      for(const j of e.j){const p=this.jp(e,j),x=Math.round(p.x),y=Math.round(p.y),c='rgb('+j.col.join(',')+')',rim='rgb('+j.col.map(v=>Math.round(v*.7)).join(',')+')',wide=p.pulse>0;
        g.globalAlpha=.9*fade;
        // Bell: wide and flat when relaxed, narrow and tall when it contracts to swim.
        if(wide){R(g,c,x-2,y,5,1);R(g,c,x-3,y+1,7,1);R(g,rim,x-3,y+2,7,1)}
        else{R(g,c,x-1,y-1,3,1);R(g,c,x-2,y,5,1);R(g,c,x-2,y+1,5,1);R(g,rim,x-2,y+2,5,1)}
        R(g,'#ffffff',x-1,y,1,1);R(g,'rgba(255,255,255,.7)',x,y+1,1,1);
        for(let k=0;k<4;k++){const sx=x-2+k+(k>1?1:0),len=4+((k+Math.floor(e.t*1.6))%3);for(let s=0;s<len;s++)if(s<3||(s+k)%2===0)R(g,c,sx+Math.round(Math.sin(e.t*1.8+s*.8+k)*.7),y+3+s,1,1)}
      }
      g.globalAlpha=1;
    },
    light(g,e){
      const fade=Math.min(seg(e.t,0,2),1-seg(e.t,e.dur-2.5,e.dur));
      for(const j of e.j){const p=this.jp(e,j);A.glow(g,Math.round(p.x),Math.round(p.y)+2,9,.4*fade*(.7+.3*Math.max(0,p.pulse)),j.col)}
    }
  });

  // 5. Gull: flies in, lands on a bollard, preens and looks around, takes off again.
  def({id:'gull',name:'海鷗歇腳',time:'notnight',weight:9,cooldown:180,
    can:env=>(env.G.bollards||[]).some(b=>Math.abs(b-env.fisherX)>8),
    setup(e,env){
      const opts=env.G.bollards.filter(b=>Math.abs(b-env.fisherX)>8&&!env.workers.some(wk=>Math.abs(wk.x-b)<6));
      const list=opts.length?opts:env.G.bollards.filter(b=>Math.abs(b-env.fisherX)>8);
      e.bx=list[Math.floor(e.r()*list.length)];e.by=env.G.apronY-3;e.dur=15;
      e.from={x:Math.min(env.w+8,e.bx+90),y:env.G.horizonY-env.G.skyRows+4};e.to={x:Math.max(-10,e.bx-110),y:env.G.horizonY-env.G.skyRows+2};
      e.zones=[['deck',e.bx-5,e.bx+5],['sky',0,env.w]];
      e.plan=[[4.2,'sit'],[5.4,'look'],[6.4,'sit'],[7.0,'preen'],[7.5,'sit'],[7.9,'preen'],[8.5,'sit'],[9.2,'shake'],[9.6,'sit'],[10.4,'look'],[11.4,'sit']];
    },
    actors(g,e,env){
      const t=e.t;
      if(t<4.2){ // flight in: flap, then glide and flare
        const k=smooth(t/4.2),x=lerp(e.from.x,e.bx+1,k),y=lerp(e.from.y,e.by-5,Math.pow(k,1.6));
        const flap=t<2.9?Math.sin(t*14):t<3.8?.25:-.9;flyingGull(g,x,y,-1,flap);e.focus=[x,y];return;
      }
      if(t>11.8){const k=seg(t,11.8,e.dur),x=lerp(e.bx,e.to.x,smooth(k)),y=lerp(e.by-5,e.to.y,Math.sqrt(k));flyingGull(g,x,y,-1,Math.sin(t*15));e.focus=[x,y];return}
      e.focus=[e.bx,e.by-3];
      let st='sit';for(const [at,s] of e.plan)if(t>=at)st=s;
      const rows=st==='preen'?GULL_PREEN:st==='shake'?GULL_SHAKE:GULL_SIT;
      spr(g,rows,GULL,e.bx-4,e.by-6,st==='look');
    }
  });
  function flyingGull(g,x,y,dir,flap){
    x=Math.round(x);y=Math.round(y);
    R(g,'#f4f6f2',x-1,y,3,1);R(g,'#f4f6f2',x+dir*2,y,1,1);R(g,'#f0a33a',x+dir*3,y,1,1);
    for(let k=1;k<=4;k++){const dy=Math.round(-flap*k*.7);const c=k>=3?'#9aa7ad':'#f4f6f2';R(g,c,x-k-(dir>0?0:0),y+dy,1,1);R(g,c,x+k,y+dy,1,1)}
  }

  // 6. Long-tailed tit: bounces in, hops on the lamp, tilts its head, flicks its tail, leaves.
  def({id:'tit',name:'長尾山雀',time:'notnight',weight:7,cooldown:200,minor:true,
    can:env=>env.G.lamps&&env.G.lamps.length>0,
    setup(e,env){
      e.li=Math.floor(e.r()*env.G.lamps.length);e.lx=env.G.lamps[e.li];e.ly=env.G.apronY-17;e.dur=10;
      e.side=e.r()<.5?-1:1;e.zones=[['lamp'+e.li,0,0]];
      e.hops=[[2.6,-1],[3.6,1],[5.2,0],[6.4,1],[7.1,-1]];
      e.anim=[[2.2,'A'],[3.0,'tilt'],[3.5,'A'],[4.2,'flick'],[4.5,'A'],[4.9,'turn'],[5.6,'tilt'],[6.0,'A'],[6.8,'flick'],[7.0,'A'],[7.6,'turn']];
    },
    actors(g,e){
      const t=e.t;e.focus=[e.lx,e.ly];
      if(t<2.2){const k=t/2.2,x=lerp(e.lx+e.side*45,e.lx,smooth(k)),y=e.ly-2-Math.abs(Math.sin(k*Math.PI*3))*4+(1-k)*-6;spr(g,TIT_FLY,TIT,x-3,y,e.side>0,1);return}
      if(t>8){const k=seg(t,8,e.dur),x=lerp(e.lx,e.lx-e.side*55,k),y=e.ly-2-Math.abs(Math.sin(k*Math.PI*3))*4-k*8;spr(g,TIT_FLY,TIT,x-3,y,e.side<0);return}
      let off=0,anim='A',turns=0;for(const [at,d] of e.hops)if(t>=at)off=d;
      for(const [at,a] of e.anim)if(t>=at){if(a==='turn')turns++;else anim=a}
      const face=(e.side>0?-1:1)*(turns%2?-1:1);
      const hop=e.hops.some(([at])=>t>=at&&t<at+.18)?1:0;
      const rows=anim==='tilt'?TIT_TILT:anim==='flick'?TIT_FLICK:TIT_A;
      spr(g,rows,TIT,e.lx+off-3,e.ly-1-hop,face<0);
    }
  });

  // 7. Adventurer: walks out along the pier, sits and watches the sea, then heads back.
  def({id:'adventurer',name:'冒險者看海',time:'any',weight:7,cooldown:240,
    setup(e,env){
      e.pal=ADVENTURERS[Math.floor(e.r()*ADVENTURERS.length)];
      const lo=env.G.landR+18,hi=Math.min(env.fisherX-14,lo+110);e.stop=Math.round(lerp(lo,Math.max(lo,hi),.2+e.r()*.8));
      e.speed=7.5;e.walk=(e.stop+4)/e.speed;
      e.seq=[e.walk,e.walk+1.4,e.walk+2,e.walk+7.5,e.walk+8.1,e.walk+9.4];
      e.dur=e.seq[5]+e.walk;e.zones=[['deck',-4,e.stop+10]];
      e.marks={arrive:e.walk*.6,sit:e.seq[2]+.6,music:e.seq[2]+3,shade:e.seq[4]+.6,leave:e.seq[5]+e.walk*.4};
    },
    state(e){
      const t=e.t,s=e.seq;
      if(t<s[0])return {x:-4+t*e.speed,pose:'walk',dir:1};
      if(t<s[1])return {x:e.stop,pose:'stand',dir:1};
      if(t<s[2])return {x:e.stop,pose:'crouch',dir:1};
      if(t<s[3])return {x:e.stop,pose:'sit',dir:1,look:t-s[2]};
      if(t<s[4])return {x:e.stop,pose:'crouch',dir:1};
      if(t<s[5])return {x:e.stop,pose:'shade',dir:1};
      return {x:e.stop-(t-s[5])*e.speed,pose:'walk',dir:-1};
    },
    actors(g,e,env){
      const st=this.state(e);e.focus=[st.x,deckY(env)-5];
      person(g,{x:st.x,y:deckY(env),dir:st.dir,pal:e.pal,pose:st.pose,frame:Math.floor(e.t*7),swish:Math.round(Math.sin(e.t*2.4))});
      e.pos=[st.x+1];
      if(env.night){R(g,'#3a3a3a',st.x+(st.dir>0?3:-1),deckY(env)-5,1,1);R(g,'#ffd27a',st.x+(st.dir>0?3:-1),deckY(env)-4,1,2)}
      if(st.pose==='sit'&&st.look>2.2&&st.look<3.8)bubble(g,st.x+2,deckY(env)-9,'♪','#3a5f8a');
    },
    light(g,e,env){if(!env.night)return;const st=this.state(e);A.glow(g,Math.round(st.x+(st.dir>0?3:-1)),deckY(env)-3,6,.45,[255,200,120])}
  });

  // 8. Teleport: aether ring, light column, the traveller materialises, looks around, departs.
  def({id:'teleport',name:'傳送魔法',time:'any',weight:5,cooldown:300,
    setup(e,env){
      const lo=env.G.landR+8,hi=env.fisherX-12;e.x=Math.round(lerp(lo,hi,e.r()));e.dur=12.5;e.parts=[];e.zones=[['deck',e.x-7,e.x+7]];
      e.pal=MAGE;
    },
    update(e,dt,env){
      const t=e.t,y=deckY(env);
      const spawn=(t>.2&&t<3)||(t>8&&t<10.6);
      if(spawn&&e.r()<dt*18){const ang=e.r()*6.28;e.parts.push({x:e.x+1+Math.cos(ang)*5,y:y-e.r()*2,vx:-Math.cos(ang)*3,vy:-6-e.r()*8,life:0,max:1+e.r()*.8,col:e.r()<.5?'#bff4ff':'#7fdcff'})}
      stepParticles(e.parts,dt);
    },
    actors(g,e,env){
      const t=e.t,y=deckY(env),x=e.x;e.focus=[x,y-6];
      const ringA=Math.max(seg(t,0,.8)*(1-seg(t,3,3.8)),seg(t,7.8,8.6)*(1-seg(t,10.6,11.6)));
      if(ringA>0){g.globalAlpha=ringA;for(let k=0;k<14;k++){const a=k/14*6.28+t*1.5;R(g,k%2?'#7fe8ff':'#d8fbff',x+1+Math.round(Math.cos(a)*5),y+Math.round(Math.sin(a)*1),1,1)}g.globalAlpha=1}
      // Materialise top-down, dissolve bottom-up.
      const inK=seg(t,1.5,2.7),outK=seg(t,9.4,10.4);
      if(inK>0&&outK<1){
        // Visible rows: revealed from the head down, then dissolved from the feet up.
        const top=y-11,bottom=Math.min(top+Math.round(12*inK),y+1-Math.round(12*outK));
        g.save();g.beginPath();g.rect(0,top-2,env.w,Math.max(0,bottom-(top-2)));g.clip();
        const t2=t-2.7,dir=t2<1.4?1:t2<2.6?-1:t2<3.6?1:-1;
        const pose=t>8.1?'cast':t2>4.2&&t2<5.2?'wave':'stand';
        person(g,{x,y,dir,pal:e.pal,pose,frame:Math.floor(t*4),alpha:inK<1?.6+inK*.4:1});
        g.restore();
        if(t2>2.7&&t2<4)bubble(g,x+1,y-11,'?','#3a5f8a');
      }
      drawParticles(g,e.parts);
    },
    light(g,e,env){
      const t=e.t,y=deckY(env),col=Math.max(seg(t,1,1.6)*(1-seg(t,2.4,3.2)),seg(t,9,9.6)*(1-seg(t,10.4,11.2)));
      if(col>0){const grd=g.createLinearGradient(0,y-24,0,y);grd.addColorStop(0,'rgba(140,225,255,0)');grd.addColorStop(1,'rgba(140,225,255,'+(.55*col).toFixed(2)+')');g.fillStyle=grd;g.fillRect(e.x-1,y-24,5,24)}
      const ring=Math.max(seg(t,0,.8)*(1-seg(t,3,3.8)),seg(t,7.8,8.6)*(1-seg(t,10.6,11.6)));
      if(ring>0)A.glow(g,e.x+1,y,8,.35*ring,[140,225,255]);
    }
  });

  // 9. Submarine check: a mechanic climbs out of the tower hatch, welds a seam, climbs back in.
  def({id:'inspect',name:'潛水艇檢修',time:'any',weight:6,cooldown:260,
    can:env=>mooredBoats(env).some(d=>d.big),
    setup(e,env){
      const list=mooredBoats(env).filter(d=>d.big);const d=list[Math.floor(e.r()*list.length)];
      e.i=d.i;e.dur=16;e.sparks=[];e.zones=[['boat'+d.i,0,0]];e.pal=MECH;
    },
    geo(e,env){const d=env.boatDraw[e.i];if(!d||!d.moored)return null;
      const hatchX=d.flip?d.x0+d.w-1-12:d.x0+12,towerTop=d.y0+2,deck=d.y0+8,bow=d.flip?d.x0+3:d.x0+d.w-5;return {d,hatchX,towerTop,deck,bow,dir:d.flip?-1:1}},
    update(e,dt,env){
      const q=this.geo(e,env);if(!q){e.done=true;return}
      const t=e.t,work=t>4.2&&t<10.5&&(Math.floor(t*1.6)%3!==2);
      if(work&&e.r()<dt*40){for(let k=0;k<2;k++)e.sparks.push({x:q.bow+q.dir*2,y:q.deck-1,vx:(e.r()-.3)*q.dir*18,vy:-6-e.r()*12,g:50,life:0,max:.35+e.r()*.35,col:e.r()<.5?'#ffd27a':'#fff4d6'})}
      e.welding=work;stepParticles(e.sparks,dt);
    },
    pose(e,q){
      const t=e.t;
      if(t<1)return {phase:'hatch'};
      if(t<2.3)return {phase:'climb',x:q.hatchX-1,y:lerp(q.towerTop+9,q.towerTop,smooth(seg(t,1,2.3))),dir:q.dir};
      if(t<3.4)return {phase:'walk',x:lerp(q.hatchX-1,q.bow,smooth(seg(t,2.3,3.4))),y:lerp(q.towerTop,q.deck,seg(t,2.3,2.8)),dir:q.dir};
      if(t<10.6)return {phase:'work',x:q.bow,y:q.deck,dir:q.dir};
      if(t<11.6)return {phase:'wave',x:q.bow,y:q.deck,dir:-q.dir};
      if(t<12.8)return {phase:'walk',x:lerp(q.bow,q.hatchX-1,smooth(seg(t,11.6,12.8))),y:lerp(q.deck,q.towerTop,seg(t,12.3,12.8)),dir:-q.dir};
      if(t<14)return {phase:'climb',x:q.hatchX-1,y:lerp(q.towerTop,q.towerTop+9,smooth(seg(t,12.8,14))),dir:q.dir};
      return {phase:'hatch'};
    },
    actors(g,e,env){
      const q=this.geo(e,env);if(!q)return;const t=e.t,p=this.pose(e,q);e.focus=[q.hatchX,q.towerTop+2];
      const open=t>.4&&t<14.6;
      if(open){R(g,'#122630',q.hatchX-1,q.towerTop,3,1);R(g,'#7da4b2',q.hatchX+(q.dir>0?2:-2),q.towerTop-2,1,2)}
      if(p.phase==='climb'){g.save();g.beginPath();g.rect(0,0,env.w,q.towerTop+1);g.clip();person(g,{x:p.x,y:p.y,dir:p.dir,pal:e.pal,pose:'stand'});g.restore()}
      else if(p.phase==='walk')person(g,{x:p.x,y:p.y,dir:p.dir,pal:e.pal,pose:'walk',frame:Math.floor(t*7)});
      else if(p.phase==='work'){person(g,{x:p.x,y:p.y,dir:p.dir,pal:e.pal,pose:'crouch'});if(e.welding)R(g,'#fff6dc',q.bow+q.dir*2,q.deck-1,1,1)}
      else if(p.phase==='wave'){person(g,{x:p.x,y:p.y,dir:p.dir,pal:e.pal,pose:'wave',frame:Math.floor(t*5)});bubble(g,p.x+1,p.y-10,'!','#2f7a5a')}
      drawParticles(g,e.sparks);
    },
    light(g,e,env){const q=this.geo(e,env);if(!q||!e.welding)return;A.glow(g,q.bow+q.dir*2,q.deck-1,7,.35+Math.random()*.25,[255,220,150])}
  });

  // 10. Harbor cat: steps out from the crates, grooms, stretches, naps; looks up when people pass.
  def({id:'cat',name:'碼頭小貓',time:'any',weight:8,cooldown:260,
    can:env=>env.G.crateX!==undefined,
    setup(e,env){
      e.sx=env.G.crateX+13;e.edge=env.G.crateX+9;e.dur=27;e.z=[];e.butterfly=env.day&&e.r()<.75;
      e.zones=[['deck',env.G.crateX,env.G.crateX+22]];
    },
    near(e,env){return env.workers.some(wk=>Math.abs(wk.x-e.sx)<9)||(env.deckActors||[]).some(x=>Math.abs(x-e.sx)<9)},
    update(e,dt){
      if(e.t>15&&e.t<21&&e.r()<dt*.9)e.z.push({x:e.sx+5,y:0,vx:2,vy:-3,life:0,max:2.2,col:'#ffffff'});
      stepParticles(e.z,dt);
    },
    actors(g,e,env){
      const t=e.t,y=deckY(env);let rows,x=e.sx,clip=false;e.focus=[e.sx,y-4];
      if(t<2.2){x=lerp(e.edge-6,e.sx,smooth(t/2.2));rows=Math.floor(t*6)%2?CAT_WALK_A:CAT_WALK_B;clip=true}
      else if(t<3.6)rows=CAT_SIT;
      else if(t<6)rows=Math.floor(t*3)%2?CAT_GROOM:CAT_SIT;
      else if(t<7.4)rows=CAT_STRETCH;
      else if(t<14){
        if(e.butterfly){rows=t>11&&t<12?CAT_CROUCH:t>=12&&t<12.6?CAT_WALK_A:CAT_ALERT}
        else rows=Math.floor(t*1.5)%3===0?CAT_GROOM:CAT_SIT;
      }
      else if(t<21)rows=CAT_NAP;
      else if(t<22.4)rows=CAT_STRETCH;
      else{x=lerp(e.sx,e.edge-8,smooth(seg(t,22.4,e.dur)));rows=Math.floor(t*6)%2?CAT_WALK_A:CAT_WALK_B;clip=true}
      const leaving=t>=22.4,awake=rows!==CAT_NAP;
      if(awake&&!leaving&&rows===CAT_SIT&&this.near(e,env))rows=CAT_ALERT;
      if(rows===CAT_NAP&&this.near(e,env)&&Math.floor(t*2)%4===0)rows=CAT_ALERT;
      const hgt=rows.length,jump=t>=12&&t<12.6&&e.butterfly?Math.round(Math.sin(seg(t,12,12.6)*Math.PI)*4):0;
      if(clip){g.save();g.beginPath();g.rect(e.edge,0,env.w,env.h);g.clip()}
      spr(g,rows,CAT,x,y-hgt+1-jump,leaving);
      if(clip)g.restore();
      e.eyes=awake&&!leaving&&rows!==CAT_GROOM?[x+3,y-hgt+3]:null;
      if(e.butterfly&&t>7&&t<14.5){
        const bt=t-7,bx=e.sx+6+Math.sin(bt*1.3)*5+(t>12.3?(t-12.3)*6:0),by=y-12+Math.sin(bt*2.7)*2-(t>12.3?(t-12.3)*6:0),wing=Math.floor(t*8)%2;
        R(g,'#f2c14e',bx,by,1,1);R(g,'#f2c14e',bx+(wing?1:-1),by-(wing?1:0),1,1);R(g,'#e98a2b',bx-(wing?1:-1),by-(wing?1:0),1,1);
      }
      for(const q of e.z){g.globalAlpha=1-q.life/q.max;spr(g,['###','.#.','###'],{'#':'#f4f0e6'},q.x+q.life*2,y-9-q.life*3,false);g.globalAlpha=1}
    },
    light(g,e,env){if(env.night&&e.eyes)A.glow(g,e.eyes[0],e.eyes[1],2,.6,[190,255,140])}
  });

  // 11. Distant sailboat crossing near the horizon (lantern at night).
  def({id:'sailboat',name:'遠方帆船',time:'any',weight:6,cooldown:300,minor:true,
    setup(e,env){
      e.x0=env.w+6;e.x1=Math.max(env.G.dockR+20,env.w*.45);e.speed=Math.max(4.5,(e.x0-e.x1)/40);e.dur=(e.x0-e.x1)/e.speed;
      e.y=env.G.horizonY+2;e.zones=[['horizon',0,env.w]];
    },
    x(e){return lerp(e.x0,e.x1,e.t/e.dur)},
    far(g,e,env){
      const x=Math.round(this.x(e));e.focus=[x,e.y-3];const fade=Math.min(seg(e.t,0,2),1-seg(e.t,e.dur-3,e.dur)),bob=Math.round(Math.sin(e.t*1.4)*.5);
      spr(g,SAIL_L,SAIL,x-3,e.y-6+bob,false,fade);
      g.globalAlpha=.5*fade;for(let k=1;k<6;k++)if((k+Math.floor(e.t*4))%3)R(g,'#e8f8f6',x+3+k,e.y+1,1,1);g.globalAlpha=1;
    },
    light(g,e,env){if(!env.night)return;A.glow(g,Math.round(this.x(e))+1,e.y-1,4,.5*Math.min(seg(e.t,0,2),1-seg(e.t,e.dur-3,e.dur)),[255,210,130])}
  });

  // 12. Resupply: a porter wheels supplies from the office to a moored submarine and lowers
  //     two crates on a rope into its forward deck hatch.
  def({id:'supply',name:'補給物資',time:'any',weight:6,cooldown:280,
    can:env=>env.G.office&&mooredBoats(env).some(d=>d.big),
    setup(e,env){
      // Nearest moored submarine whose berth is clear of the crate stack (else simply the nearest).
      const door=env.G.office.x+4,list=mooredBoats(env).filter(b=>b.big).sort((a,b)=>Math.abs(a.cx-door)-Math.abs(b.cx-door));
      const clear=list.filter(b=>env.G.crateX===undefined||Math.abs(b.cx-(env.G.crateX+5))>16),d=clear[0]||list[0];
      e.i=d.i;e.door=door;e.dir=d.flip?-1:1;e.target=Math.round(d.cx+e.dir*1);e.speed=6.5;
      e.go=Math.abs(e.target-e.door)/e.speed;
      // seq: leave door, arrive, hatch open, crate 1 down, crate 2 down, hatch shut, start back
      e.seq=[1,1+e.go,1+e.go+1,1+e.go+4.5,1+e.go+8,1+e.go+8.8,1+e.go+9.4];e.dur=e.seq[6]+e.go+1.6;
      e.marks={walk:1+e.go*.5,hatch:e.seq[2]-.3,lower1:e.seq[2]+1.6,lower2:e.seq[3]+1.9,back:e.seq[6]+e.go*.5};
      e.zones=[['deck',Math.min(e.door,e.target)-4,Math.max(e.door,e.target)+12],['boat'+d.i,0,0]];e.pal=PORTER;
    },
    actors(g,e,env){
      const t=e.t,s=e.seq,y=deckY(env),d=env.boatDraw[e.i];
      if(!d||!d.moored){e.done=true;return}
      const out=t<s[6];let x,dir=1;
      if(t<s[0])x=e.door;else if(t<s[1])x=lerp(e.door,e.target,(t-s[0])/e.go);else if(t<s[6])x=e.target;
      else{x=lerp(e.target,e.door,Math.min(1,(t-s[6])/e.go));dir=-1}
      if(t<1.2||t>e.dur-1.6)R(g,'#2b1f1a',e.door-1,y-6,4,6);
      // Forward deck hatch on the hull, between the tower and the bow.
      const hx=d.flip?d.x0+5:d.x0+d.w-8,hullTop=d.y0+8,open=t>s[2]-.6&&t<s[5];
      if(open){R(g,'#0f1e26',hx-1,hullTop,3,1);R(g,'#7da4b2',hx+2,hullTop-2,1,2)}
      // Crates: two on the cart; each is lowered on a rope from the pier edge into the hatch.
      let onCart=2;
      for(let c=0;c<2;c++){
        const t0=s[2]+c*3.5,k=seg(t,t0,t0+3);
        if(t<t0)continue;onCart--;
        if(k>=1)continue;
        const sx=x+(dir>0?8:-8),cx=lerp(sx,hx,smooth(seg(k,0,.25))),cy=lerp(y-4,hullTop-2,smooth(seg(k,.15,.85)));
        R(g,'#3d2f22',Math.round(cx)+1,y-1,1,Math.max(0,Math.round(cy)-y+1));
        g.save();g.beginPath();g.rect(0,0,env.w,hullTop+(k>.8?0:1));g.clip();
        R(g,'#3f6f96',cx-1,cy,3,3);R(g,'#e8eef0',cx-1,cy+1,3,1);R(g,'#77a6c9',cx-1,cy,3,1);
        g.restore();
      }
      if(t>=s[5])onCart=0;
      const cartX=dir>0?x+3:x-8;
      spr(g,CART_S,CART,cartX,y-4,dir<0);
      for(let c=0;c<onCart;c++){const bx=(dir>0?x+5:x-6)+c*3;R(g,'#3f6f96',bx,y-7,3,3);R(g,'#e8eef0',bx,y-6,3,1);R(g,'#77a6c9',bx,y-7,3,1)}
      const lowering=t>=s[2]&&t<s[5];
      if(!(t<s[0]))person(g,{x,y,dir:lowering?1:dir,pal:e.pal,pose:lowering?'carry':(t<s[1]||t>=s[6])?'walk':'stand',frame:Math.floor(t*6)});
      if(t>=s[5]-.2&&t<s[6]+.6)bubble(g,x+1,y-10,'!','#2f7a5a');
      e.pos=[x+1];e.focus=[x+4,y];void out;
    }
  });

  // 13. Ballast test: bubbles stream up beside a moored submarine and pop with small sprays.
  def({id:'bubbles',name:'壓載艙測試',time:'any',weight:6,cooldown:150,minor:true,
    can:env=>mooredBoats(env).some(d=>d.big),
    setup(e,env){
      const list=mooredBoats(env).filter(d=>d.big),d=list[Math.floor(e.r()*list.length)];
      e.i=d.i;e.dur=7;e.b=[];e.pops=[];e.zones=[['boatwater'+d.i,0,0]];
    },
    update(e,dt,env){
      const d=env.boatDraw[e.i];if(!d||!d.moored){e.done=true;return}
      const burst=e.t>2&&e.t<2.6;
      if(e.t<5.6&&e.r()<dt*(burst?50:14))e.b.push({x:d.x0+3+e.r()*(d.w-6),y:env.h-1-e.r()*3,s:e.r()<.45?2:1,v:6+e.r()*6,wob:e.r()*6});
      for(const b of e.b){b.y-=b.v*dt;b.x+=Math.sin(e.t*6+b.wob)*dt*2}
      for(let i=e.b.length-1;i>=0;i--)if(e.b[i].y<=d.waterY+1){const b=e.b.splice(i,1)[0];e.pops.push({x:b.x,y:d.waterY,vx:(e.r()-.5)*6,vy:-6-e.r()*6-(burst?8:0),g:40,life:0,max:.4,col:foam})}
      stepParticles(e.pops,dt);
    },
    underwater(g,e){for(const b of e.b){if(b.s>1){R(g,'#f2ffff',b.x,b.y,2,2);R(g,'#8fcad4',b.x+1,b.y+1,1,1)}else R(g,'#e6fbfc',b.x,b.y,1,1)}},
    surface(g,e,env){const d=env.boatDraw[e.i];if(!d)return;e.focus=[d.cx,d.waterY];drawParticles(g,e.pops);if(e.t>2&&e.t<3.4)ring(g,d.cx,d.waterY+1,3+(e.t-2)*6,foam,.6*(1-(e.t-2)/1.4))}
  });

  // 14. Meteors at night; now and then a short shower.
  def({id:'meteor',name:'流星',time:'night',weight:8,cooldown:160,minor:true,
    setup(e,env){
      const shower=e.r()<.2,n=shower?4+Math.floor(e.r()*3):1;e.dur=shower?9:3.2;e.m=[];
      const top=env.G.horizonY-env.G.skyRows;
      // Paths stay in the opaque lower sky, above the horizon.
      for(let i=0;i<n;i++){const len=24+e.r()*22,x=lerp(env.w*.3,env.w-10,e.r());e.m.push({at:shower?.4+i*1.4+e.r()*.6:.3,dur:.8+e.r()*.5,x,y:top+9+e.r()*6,dx:-len,dy:len*.2})}
      e.zones=[['sky',0,env.w]];
    },
    light(g,e){
      for(const m of e.m){const k=(e.t-m.at)/m.dur;if(k<0||k>1.25)continue;
        const kk=Math.min(1,k),hx=m.x+m.dx*kk,hy=m.y+m.dy*kk,fade=k>1?1-(k-1)/.25:1;e.focus=[hx+m.dx*-.3,hy];
        for(let s=0;s<10;s++){const b=Math.max(0,kk-s*.035);const a=(1-s/10)*.9*fade;g.fillStyle='rgba(255,245,220,'+a.toFixed(2)+')';g.fillRect(Math.round(m.x+m.dx*b),Math.round(m.y+m.dy*b),1,1)}
        A.glow(g,Math.round(hx),Math.round(hy),3,.6*fade,[255,240,210]);
      }
    }
  });

  // 15. Message bottle drifting in from the open sea, glinting as it bobs past.
  def({id:'bottle',name:'漂流瓶',time:'any',weight:5,cooldown:300,
    setup(e,env){
      const [lo,hi]=openSea(env);e.x0=lerp(Math.max(lo,env.w*.55),hi,e.r());e.x1=e.x0-30-e.r()*20;e.y0=env.G.horizonY+3;e.y1=env.h+3;
      e.dur=22;e.zones=[['water',e.x1-6,e.x0+6]];
    },
    surface(g,e,env){
      const k=e.t/e.dur,p=Math.pow(k,1.35),x=Math.round(lerp(e.x0,e.x1,p)),y=Math.round(lerp(e.y0,e.y1,p)+Math.sin(e.t*2.1)*.6),fade=seg(e.t,0,2.5);e.focus=[x,y];
      if(p<.12){g.globalAlpha=fade;R(g,'#4f9a76',x,y,2,1);g.globalAlpha=1}
      else if(p<.3){R(g,'#24533f',x,y,3,1);R(g,'#8fd0ad',x+1,y,1,1);R(g,'#a8794a',x+3,y,1,1)}
      else spr(g,Math.floor(e.t/1.3)%2?BOTTLE_A:BOTTLE_B,BOTTLE,x-3,y-1,false);
      if(Math.floor(e.t*.8)%2===0&&(e.t*.8)%1<.35){const gx=x+(p<.3?1:0),gy=y-(p<.3?1:2);R(g,'#ffffff',gx,gy,1,1);if(p>=.3){R(g,'#ffffff',gx-1,gy,3,1)}}
      if((e.t%2.6)<1.2&&p>.3)ring(g,x,y+1,2+(e.t%2.6)*2.5,foam,.45*(1-(e.t%2.6)/1.2));
    }
  });

  // 16. Gust: the wind picks up for a few seconds; clouds, smoke, flags, sea and stray leaves react.
  def({id:'gust',name:'一陣強風',time:'any',weight:4,cooldown:400,minor:true,
    setup(e,env){
      e.dur=7;e.streaks=[];e.leaves=[];e.caps=[];A.gust(2.6,5.5);
      const top=env.G.horizonY-env.G.skyRows;
      for(let i=0;i<6;i++)e.streaks.push({at:i*.55+e.r()*.4,y:top+11+e.r()*(env.G.skyRows-15),len:14+e.r()*12,curl:e.r()<.5});
      const n=env.night?2:4;for(let i=0;i<n;i++)e.leaves.push({at:.6+i*.9+e.r()*.5,col:env.night?'#e8e2d0':['#7fa65a','#d9963a','#c9b04a'][i%3],ph:e.r()*6});
      e.zones=[['sky',0,env.w],['gust',0,0]];
    },
    update(e,dt,env){if(e.t<5.5&&e.r()<dt*28){const [lo,hi]=openSea(env);e.caps.push({x:lerp(lo,hi,e.r()),y:env.G.waterline+1+e.r()*(env.h-env.G.waterline-3),life:0,max:.5})}for(const c of e.caps)c.life+=dt;e.caps=e.caps.filter(c=>c.life<c.max)},
    far(g,e,env){
      for(const s of e.streaks){const k=(e.t-s.at)/1.6;if(k<0||k>1)continue;const head=lerp(-20,env.w+20,k);
        for(let i=0;i<s.len;i++){const x=Math.round(head-i*2),y=Math.round(s.y+(s.curl&&i<5?-Math.sin(i/5*Math.PI)*3:0));g.globalAlpha=.8*(1-i/s.len);R(g,'#ffffff',x,y,2,1)}
        g.globalAlpha=1}
    },
    actors(g,e,env){
      const y=deckY(env);e.focus=[env.G.landR+40,y-8];
      for(const l of e.leaves){const k=(e.t-l.at)/2.6;if(k<0||k>1)continue;
        const x=lerp(-4,env.G.dockR+20,k),hop=Math.abs(Math.sin(k*Math.PI*4+l.ph))*5,yy=Math.round(y-1-hop-(x>env.G.dockR?(x-env.G.dockR)*.4:0));
        const f=Math.floor(e.t*10+l.ph)%2;R(g,l.col,x,yy,2,2);R(g,'rgba(0,0,0,.25)',x+(f?1:0),yy+(f?0:1),1,1)}
    },
    surface(g,e){for(const c of e.caps){g.globalAlpha=1-c.life/c.max;R(g,'#f2fbf9',c.x,c.y,2,1)}g.globalAlpha=1}
  });

  // 17. Chance meeting: the harbourmaster looks out to sea, a visitor steps out of the office, they greet.
  def({id:'greet',name:'碼頭偶遇',time:'any',weight:6,cooldown:300,
    can:env=>Boolean(env.G.office),
    setup(e,env){
      e.door=env.G.office.x+4;e.meet=Math.round(lerp(env.G.landR+16,Math.min(env.fisherX-24,env.G.landR+90),.3+e.r()*.5));
      e.a={pal:KEEPER};e.b={pal:e.r()<.5?LALA:ADVENTURERS[2],small:false};e.b.small=e.b.pal===LALA;
      e.speed=7;e.wa=(e.meet+4)/e.speed;e.wb=(e.meet-4-e.door)/e.speed;
      e.seq=[e.wa,e.wa+1+e.wb,e.wa+1+e.wb+3.2,e.wa+1+e.wb+4.2];
      e.dur=e.seq[3]+Math.max(e.wa,e.wb)+1.5;e.icon=e.r()<.5?'♪':'♥';
      e.marks={walk:e.wa*.6,door:e.wa+.8,notice:e.seq[1]+.7,greet:e.seq[1]+2.2,part:e.seq[3]+2.5};
      e.zones=[['deck',-4,e.meet+6]];
    },
    actors(g,e,env){
      const t=e.t,s=e.seq,y=deckY(env);
      // A: walks in from the left, looks at the sea, turns when B arrives.
      let ax,ad=1,ap='walk';
      if(t<s[0])ax=-4+t*e.speed;else if(t<s[3]){ax=e.meet;ad=t<s[1]-.6?1:-1;ap=t>=s[1]&&t<s[1]+1.2?'wave':'stand'}
      else{ax=e.meet+(t-s[3])*e.speed*.9;ap='walk'}
      // B: steps out of the office door after a moment, walks up, greets, heads back.
      let bx=null,bd=1,bp='walk';const bStart=e.wa+1;
      if(t>=bStart-.6&&t<bStart)R(g,'#2b1f1a',e.door-1,y-6,4,6);
      if(t>=bStart&&t<s[1])bx=lerp(e.door,e.meet-5,(t-bStart)/e.wb);
      else if(t>=s[1]&&t<s[3]){bx=e.meet-5;bp=t>=s[1]+1.2&&t<s[2]?'wave':'stand'}
      else if(t>=s[3]){bx=e.meet-5-(t-s[3])*e.speed;bd=-1;if(bx<=e.door){bx=null;if(t<s[3]+e.wb+.6)R(g,'#2b1f1a',e.door-1,y-6,4,6)}}
      if(ax<env.G.dockR)person(g,{x:ax,y,dir:ad,pal:e.a.pal,pose:ap,frame:Math.floor(t*6)});
      if(bx!==null)person(g,{x:bx,y,dir:bd,pal:e.b.pal,pose:bp,frame:Math.floor(t*6),kind:e.b.small?'small':undefined});
      if(t>=s[1]+.2&&t<s[1]+1.4)bubble(g,ax+1,y-10,'!','#b5452e');
      if(t>=s[1]+1.4&&t<s[2])bubble(g,(bx??ax)+1,y-(e.b.small?8:10),e.icon,e.icon==='♥'?'#d0506a':'#3a5f8a');
      e.pos=[ax+1].concat(bx!==null?[bx+1]:[]);e.focus=[(ax+(bx??ax))/2,y-5];
    }
  });

  // 18. Whale (rare): a back breaks the far water, blows, rolls and shows its flukes.
  def({id:'whale',name:'鯨魚現身（彩蛋）',time:'any',weight:1.5,cooldown:1800,rare:true,
    setup(e,env){
      const lo=Math.max(env.G.dockR+30,env.w*.45),hi=env.w-30,subs=env.boatDraw.filter(d=>d&&!d.moored).map(d=>d.towerX);
      let best=null;for(let k=0;k<12;k++){const x=lerp(lo,Math.max(lo,hi),e.r()),gap=Math.min(99,...subs.map(s=>Math.abs(s-x)));if(!best||gap>best.gap)best={x,gap}}
      e.x=Math.round(best.x);e.y=Math.round(env.G.horizonY+(env.G.waterline-env.G.horizonY)*.72);
      e.dur=13.5;e.spout=[];e.drops=[];e.zones=[['farsea',e.x-20,e.x+22]];
    },
    update(e,dt){
      const t=e.t;
      if(t>2.6&&t<4.2&&e.r()<dt*45)e.spout.push({x:e.x+2+(e.r()-.5)*2,y:e.y-3,vx:(e.r()-.5)*4+1.5,vy:-12-e.r()*7,g:14,life:0,max:1.2+e.r()*.6,col:e.r()<.5?'#f2fbff':'#cfe9f2'});
      if(t>8.6&&!e.splash){e.splash=true;for(let k=0;k<10;k++)e.drops.push({x:e.x+10+(e.r()-.5)*6,y:e.y-1,vx:(e.r()-.5)*10,vy:-8-e.r()*8,g:40,life:0,max:.7,col:foam})}
      stepParticles(e.spout,dt);stepParticles(e.drops,dt);
    },
    surface(g,e,env){
      const t=e.t,x=e.x,y=e.y;e.focus=[x+4,y-4];const body=env.night?'#2a3a48':'#34495a',hl=env.night?'#6b88a8':'#6f8ea0';
      for(const [st,sp] of [[0,2],[.8,2],[8.6,2.4]]){const k=seg(t,st,st+sp);if(k>0&&k<1)ring(g,x+(st>8?10:2),y+1,2+k*10,foam,.5*(1-k))}
      const rise=smooth(seg(t,1,2.4))*(1-smooth(seg(t,5,6.6))),roll=seg(t,4,6.6)*5;
      if(rise>0){const hgt=Math.round(rise*3);
        for(let r=0;r<hgt;r++){const half=[6,10,13][r+(3-hgt)]||13;R(g,body,x-half+roll,y-hgt+1+r,half*2,1)}
        R(g,hl,x-5+roll,y-hgt+1,10,1);if(hgt>=2){R(g,body,x+6+roll,y-hgt-1,2,2);R(g,body,x+7+roll,y-hgt-2,1,1)}
        R(g,'rgba(232,250,247,.7)',x-14+roll,y+1,28,1);
      }
      const fl=smooth(seg(t,6.6,7.6))*(1-smooth(seg(t,8.2,8.8)));
      if(fl>0){const fy=y-Math.round(fl*6),fx=x+10;
        R(g,body,fx-6,fy,4,1);R(g,body,fx+3,fy,4,1);R(g,body,fx-5,fy+1,11,1);R(g,hl,fx-5,fy+1,3,1);R(g,body,fx-2,fy+2,5,1);R(g,body,fx-1,fy+3,3,1);R(g,body,fx,fy+4,1,Math.max(1,Math.round(fl*3)));
        if(fl>.6){R(g,foam,fx-6,fy+1,1,2);R(g,foam,fx+6,fy+1,1,2);R(g,foam,fx-1,fy+5,3,1)}}
      drawParticles(g,e.spout);drawParticles(g,e.drops);
    }
  });

  // 19. Chocobo (rare): trots down the pier, kwehs at the sea, flaps its little wings, runs home.
  def({id:'chocobo',name:'陸行鳥來訪（彩蛋）',time:'any',weight:1.5,cooldown:1800,rare:true,
    setup(e,env){
      e.stop=Math.round(Math.min(env.fisherX-16,env.G.landR+130));e.run=(e.stop+10)/12;e.seq=[e.run,e.run+1,e.run+2.6,e.run+3.6,e.run+4.4];
      e.dur=e.seq[4]+e.run+1;e.zones=[['deck',-10,e.stop+10]];
      e.marks={run:e.run*.6,kweh:e.seq[0]+.6,flap:e.seq[1]+.4,look:e.seq[2]+.4,home:e.seq[4]+e.run*.3};
    },
    actors(g,e,env){
      const t=e.t,s=e.seq,y=deckY(env);let x,dir=1,rows;
      if(t<s[0]){x=-10+t*12;rows=Math.floor(t*10)%2?CHOCO_A:CHOCO_B}
      else if(t<s[3]){x=e.stop;rows=t>=s[1]&&t<s[2]&&Math.floor(t*8)%2?CHOCO_FLAP:CHOCO_A;if(t>=s[2])dir=Math.floor(t*2)%2?1:-1}
      else if(t<s[4]){x=e.stop;dir=-1;rows=CHOCO_A}
      else{x=e.stop-(t-s[4])*12;dir=-1;rows=Math.floor(t*10)%2?CHOCO_A:CHOCO_B}
      const hop=t<s[0]||t>=s[4]?Math.abs(Math.sin(t*10))*1:0;
      spr(g,rows,CHOCO,x-4,y-9-Math.round(hop),dir<0);
      if(t>=s[0]+.2&&t<s[1]+.9)bubble(g,x+(dir>0?3:-3),y-11,'!','#d08a1a');
      e.pos=[x];e.focus=[x,y-5];
    }
  });

  /* ============================================================
     Scheduler
     ============================================================ */
  function timeOk(d,env){
    if(d.time==='night')return env.P.light>.55;
    if(d.time==='day')return env.P.light<.3;
    if(d.time==='notnight')return env.P.light<.6;
    return true;
  }
  function overlaps(a,b){return a[0]===b[0]&&a[1]<=b[2]&&b[1]<=a[2]}
  function create(api){
    A=api;
    const active=[],cooldown={};
    let clock=0,nextAt=6+Math.random()*6,paused=false,auto=true,lastEnv=null,lastId=null,seedBase=(Date.now()>>>0),lastPlay=null,blockedKey='';
    const byId=Object.fromEntries(DEFS.map(d=>[d.id,d]));

    function instance(d,env,seed){
      const e={def:d,id:d.id,seed,r:mulberry(seed),t:0,dur:10,zones:[],done:false};
      d.setup(e,env);return e;
    }
    function free(e){return !active.some(o=>o.zones.some(z=>e.zones.some(y=>overlaps(z,y))))}
    function eligible(d,env){
      if(!timeOk(d,env))return false;
      if((cooldown[d.id]||0)>clock)return false;
      if(d.can&&!d.can(env))return false;
      if(active.some(a=>a.id===d.id))return false;
      if(active.length>=2)return false;
      if(active.length===1&&!d.minor&&!active[0].def.minor)return false;
      return true;
    }
    function tryStart(env){
      const pool=DEFS.filter(d=>eligible(d,env)&&d.id!==lastId);
      let total=pool.reduce((s,d)=>s+d.weight,0);
      while(pool.length&&total>0){
        let n=Math.random()*total,pick=pool[pool.length-1];
        for(const d of pool){n-=d.weight;if(n<0){pick=d;break}}
        const e=instance(pick,env,(seedBase+=7919)>>>0);
        if(free(e)){active.push(e);lastId=pick.id;return e}
        pool.splice(pool.indexOf(pick),1);total-=pick.weight;
      }
      return null;
    }
    function finish(e){
      const i=active.indexOf(e);if(i>=0)active.splice(i,1);
      cooldown[e.id]=clock+e.def.cooldown;
    }
    function syncBlocked(){
      const list=[];for(const e of active)for(const z of e.zones)if(z[0]==='deck')list.push([z[1],z[2]]);
      const key=JSON.stringify(list);if(key!==blockedKey){blockedKey=key;api.setBlocked(list)}
    }
    function update(dt,env){
      lastEnv=env;
      env.deckActors=[];for(const e of active)if(e.pos)env.deckActors.push(...e.pos);
      if(paused)return;
      clock+=dt;
      for(const e of active.slice()){
        e.t+=dt;
        if(e.def.update)e.def.update(e,dt,env);
        if(e.done||e.t>=e.dur)finish(e);
      }
      if(auto&&clock>=nextAt){
        const started=tryStart(env);
        // Quiet time after each event; minor events may overlap a running one.
        nextAt=clock+(started?(started.def.minor?8:started.dur)+10+Math.random()*18:5);
      }
      syncBlocked();
    }
    function draw(layerName,g,env){for(const e of active)if(e.def[layerName])e.def[layerName](e,g,env)}
    // Layer methods are called with the definition as `this`.
    for(const d of DEFS)for(const name of ['far','underwater','actors','surface','light'])if(d[name]){const fn=d[name];d[name]=function(e,g,env){return fn.call(d,g,e,env)}}
    const has=name=>active.some(e=>e.def[name]);

    /* ---------- developer preview API (only with ?harbor-dev=1) ---------- */
    function status(){return {paused,auto,clock:+clock.toFixed(1),nextIn:auto?+(nextAt-clock).toFixed(1):null,
      active:active.map(e=>({id:e.id,name:e.def.name,t:+e.t.toFixed(2),dur:+e.dur.toFixed(2),zones:e.zones,focus:e.focus||null,marks:e.marks||null}))}}
    const list=()=>DEFS.map((d,i)=>({no:i+1,id:d.id,name:d.name,time:d.time,weight:d.weight,cooldown:d.cooldown,minor:Boolean(d.minor),rare:Boolean(d.rare)}));
    const publicApi={list,status};
    if(DEV){
      Object.assign(publicApi,{
        play(id,opts={}){
          const d=byId[id];if(!d)return {ok:false,error:'unknown event'};
          if(!lastEnv)return {ok:false,error:'scene not ready'};
          if(d.can&&!d.can(lastEnv))return {ok:false,error:'condition not met (e.g. no moored submarine)'};
          active.length=0;const seed=opts.seed??((seedBase+=7919)>>>0);
          const e=instance(d,lastEnv,seed);active.push(e);lastPlay={id,seed};paused=false;syncBlocked();
          if(opts.at)publicApi.seek(opts.at);
          return {ok:true,seed,dur:e.dur};
        },
        // Re-run the current event from the start with the same seed and step to `seconds`.
        seek(seconds){
          if(!lastPlay||!lastEnv)return false;
          const d=byId[lastPlay.id];active.length=0;const e=instance(d,lastEnv,lastPlay.seed);active.push(e);
          const step=1/20;while(e.t+step<=seconds){e.t+=step;if(d.update)d.update(e,step,lastEnv);if(e.done)break}
          return true;
        },
        replay(){return lastPlay?publicApi.play(lastPlay.id,{seed:lastPlay.seed}):false},
        pause(){paused=true},resume(){paused=false},
        reset(){active.length=0;for(const k in cooldown)delete cooldown[k];syncBlocked()},
        setAuto(on){auto=Boolean(on);if(auto)nextAt=clock+3},
        setHour(h){api.setHour(h)},freeze(on){api.freeze(on)}
      });
      buildPanel(publicApi);
    }
    return {update,draw,has,publicApi};
  }

  function buildPanel(api){
    const make=()=>{
      const box=document.createElement('div');
      box.id='harbor-dev-panel';
      box.style.cssText='position:fixed;top:8px;right:8px;z-index:9999;background:rgba(16,28,36,.92);color:#f4f0e2;font:12px/1.4 system-ui,sans-serif;padding:8px 10px;border-radius:8px;display:grid;gap:6px;max-width:280px;box-shadow:0 4px 16px rgba(0,0,0,.35)';
      const opts=api.list().map(d=>'<option value="'+d.id+'">'+String(d.no).padStart(2,'0')+' '+d.name+(d.time==='night'?'（夜）':d.time==='notnight'?'（日）':'')+'</option>').join('');
      box.innerHTML='<strong>碼頭事件預覽（開發用）</strong>'
        +'<select data-dev="event">'+opts+'</select>'
        +'<div style="display:flex;gap:4px;flex-wrap:wrap"><button data-dev="play">播放</button><button data-dev="pause">暫停</button><button data-dev="resume">繼續</button><button data-dev="replay">重播</button><button data-dev="reset">重置</button></div>'
        +'<label>時段 <select data-dev="hour"><option value="">依時鐘</option><option value="13">白天</option><option value="18.6">黃昏</option><option value="22">夜晚</option><option value="6.4">清晨</option></select></label>'
        +'<label><input type="checkbox" data-dev="auto" checked> 自動隨機排程</label>'
        +'<div data-dev="status" style="opacity:.85">—</div>';
      document.body.appendChild(box);
      const q=s=>box.querySelector('[data-dev="'+s+'"]');
      q('play').onclick=()=>api.play(q('event').value);
      q('pause').onclick=()=>api.pause();q('resume').onclick=()=>api.resume();
      q('replay').onclick=()=>api.replay();q('reset').onclick=()=>api.reset();
      q('hour').onchange=()=>api.setHour(q('hour').value===''?null:Number(q('hour').value));
      q('auto').onchange=()=>api.setAuto(q('auto').checked);
      setInterval(()=>{const s=api.status();q('status').textContent=(s.paused?'⏸ ':'▶ ')+(s.active.length?s.active.map(a=>a.name+' '+a.t+'/'+a.dur+'s').join('、'):'（無事件）')+(s.auto&&s.nextIn!==null?'｜下次排程 '+Math.max(0,s.nextIn)+'s':'')},250);
    };
    if(document.body)make();else document.addEventListener('DOMContentLoaded',make);
  }

  window.HarborEvents={create,definitions:DEFS};
})();
