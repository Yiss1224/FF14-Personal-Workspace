/* Harbor scene v4 (experimental): pixel-art canvas backdrop for the ambient harbor.
   Display only. Reads boat positions/classes from the existing DOM and never writes fleet data.
   Interaction (hover, focus, tooltip) stays on the DOM boats managed by submarine-harbor.js. */
(function(){
  'use strict';
  const dock=document.getElementById('mini-harbor');
  if(!dock)return;
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext&&canvas.getContext('2d');
  if(!ctx)return;
  canvas.className='harbor-scene';
  canvas.setAttribute('aria-hidden','true');
  dock.prepend(canvas);

  const PX=2;                       // CSS pixels per art pixel
  const FPS=20;
  const motion=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):null;
  const reduced=()=>Boolean(motion&&motion.matches);
  let forcedHour=(()=>{const v=parseFloat(new URLSearchParams(location.search).get('harbor-hour'));return Number.isFinite(v)?((v%24)+24)%24:null})();

  /* ---------- helpers ---------- */
  const clamp=(v,a,b)=>v<a?a:v>b?b:v;
  const hex=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
  const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
  const css=(c,a=1)=>'rgba('+(c[0]|0)+','+(c[1]|0)+','+(c[2]|0)+','+a+')';
  let seed=20261021;
  const srand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  function hash(x,y){let n=(x*374761393+y*668265263)|0;n=(n^(n>>>13))*1274126177|0;return((n^(n>>>16))>>>0)/4294967296}
  function noise(x,y){
    const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
    const a=hash(xi,yi),b=hash(xi+1,yi),c=hash(xi,yi+1),d=hash(xi+1,yi+1);
    return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
  }

  /* ---------- time of day: continuous palette ---------- */
  const KEYS=[
    {h:0,  sky:['#081428','#1b2f52'],sea:['#1d3d5c','#0c2236'],hl:'#4f7fa6',tint:[14,22,60,.58],light:1,stars:1},
    {h:4.8,sky:['#0b1a33','#24395f'],sea:['#21425f','#0e2539'],hl:'#5683a8',tint:[14,22,60,.55],light:1,stars:.9},
    {h:6.2,sky:['#41608f','#f0b088'],sea:['#6f8ea3','#294f6b'],hl:'#ffd2a6',tint:[255,160,110,.16],light:.45,stars:.1},
    {h:8,  sky:['#7fc3df','#d3eeec'],sea:['#5ea6b6','#1d6680'],hl:'#e8fbf6',tint:[0,0,0,0],light:0,stars:0},
    {h:16.3,sky:['#86c6e0','#dcefe8'],sea:['#62a8b5','#1f6880'],hl:'#effcf6',tint:[0,0,0,0],light:0,stars:0},
    {h:18.2,sky:['#4b5b92','#f4a066'],sea:['#7c7c98','#2b4563'],hl:'#ffc184',tint:[255,110,70,.2],light:.55,stars:.15},
    {h:19.6,sky:['#16284a','#3c4a78'],sea:['#283f60','#11283d'],hl:'#6c8fbd',tint:[18,24,66,.5],light:.95,stars:.7},
    {h:24, sky:['#081428','#1b2f52'],sea:['#1d3d5c','#0c2236'],hl:'#4f7fa6',tint:[14,22,60,.58],light:1,stars:1}
  ];
  function palette(hour){
    let i=0;while(i<KEYS.length-2&&hour>=KEYS[i+1].h)i++;
    const a=KEYS[i],b=KEYS[i+1],t=clamp((hour-a.h)/(b.h-a.h),0,1),s=t*t*(3-2*t);
    return {
      skyTop:mix(hex(a.sky[0]),hex(b.sky[0]),s),skyBot:mix(hex(a.sky[1]),hex(b.sky[1]),s),
      seaFar:mix(hex(a.sea[0]),hex(b.sea[0]),s),seaNear:mix(hex(a.sea[1]),hex(b.sea[1]),s),
      hl:mix(hex(a.hl),hex(b.hl),s),
      tint:[a.tint[0]+(b.tint[0]-a.tint[0])*s,a.tint[1]+(b.tint[1]-a.tint[1])*s,a.tint[2]+(b.tint[2]-a.tint[2])*s,a.tint[3]+(b.tint[3]-a.tint[3])*s],
      light:a.light+(b.light-a.light)*s,stars:a.stars+(b.stars-a.stars)*s,hour
    };
  }
  // Day and night follow Eorzea time (one Eorzean day = 70 real minutes); ?harbor-hour= overrides it.
  const nowHour=()=>{
    if(forcedHour!==null)return forcedHour;
    if(window.HarborEorzea)return window.HarborEorzea.eorzeaTime(Date.now()).hours;
    const d=new Date();return d.getHours()+d.getMinutes()/60;
  };

  /* ---------- weather of the chosen housing district ---------- */
  const PREFS_KEY='ff14_harbor_prefs';
  const readPrefs=()=>{try{return Object.assign({zone:'mist',sound:false},JSON.parse(localStorage.getItem(PREFS_KEY)||'{}'))}catch(e){return {zone:'mist',sound:false}}};
  const writePrefs=p=>{try{localStorage.setItem(PREFS_KEY,JSON.stringify(p))}catch(e){}};
  let prefs=readPrefs();
  let forcedWeather=(()=>{const v=new URLSearchParams(location.search).get('harbor-weather');return v||null})();
  // Targets per weather; the scene eases toward them so changes blend over a few seconds.
  const WEATHER_LOOK={
    clearSkies:{overcast:0,fog:0,rain:0,stars:1,glitter:1,clouds:2},
    fairSkies:{overcast:.12,fog:0,rain:0,stars:.75,glitter:.8,clouds:4},
    clouds:{overcast:.65,fog:0,rain:0,stars:0,glitter:0,clouds:8},
    fog:{overcast:.45,fog:1,rain:0,stars:0,glitter:0,clouds:3},
    rain:{overcast:.75,fog:.25,rain:1,stars:0,glitter:0,clouds:8}
  };
  let weatherId='clearSkies',wxReady=false,wxFastUntil=0;
  const WX={overcast:0,fog:0,rain:0,stars:1,glitter:1,clouds:2};
  function updateWeather(){
    const E=window.HarborEorzea;
    weatherId=forcedWeather&&WEATHER_LOOK[forcedWeather]?forcedWeather:E?E.weather(Date.now(),prefs.zone):'clearSkies';
  }
  function stepWeather(dt){
    const fast=performance.now()<wxFastUntil,target=WEATHER_LOOK[weatherId]||WEATHER_LOOK.clearSkies,k=dt>0?Math.min(1,dt*(fast?1.5:.15)):1;
    for(const key of ['overcast','fog','rain','stars','glitter'])WX[key]+=(target[key]-WX[key])*k;
    WX.clouds=target.clouds;
  }
  function applyWeather(P){
    const o=WX.overcast,grey=P.light>.5?[44,52,66]:[150,160,168];
    P.skyTop=mix(P.skyTop,grey,o*.7);P.skyBot=mix(P.skyBot,mix(grey,[220,224,226],.4),o*.6);
    // Under cloud the water goes slate and flat: muted colour, low-contrast and fewer wave crests.
    const slate=c=>{const l=(c[0]*.3+c[1]*.59+c[2]*.11)*.9;return [l*.94,l*.98,l*1.05]};
    const so=Math.min(1,o*1.15);
    P.seaFar=mix(P.seaFar,slate(P.seaFar),so);P.seaNear=mix(P.seaNear,mix(slate(P.seaNear),[0,0,0],.18),so);
    P.hl=mix(P.hl,mix(P.seaFar,P.seaNear,.3),so*.75);P.calm=o;
    const t=P.tint;P.tint=[t[0]*(1-o*.5)+60*o*.5,t[1]*(1-o*.5)+70*o*.5,t[2]*(1-o*.5)+86*o*.5,Math.min(.75,t[3]+o*.18)];
    P.stars*=WX.stars;P.glitter=WX.glitter;P.overcast=o;P.weather=weatherId;
    return P;
  }

  /* ---------- sprites (art pixels; '.' = transparent) ---------- */
  // Submarines (bow to the right): cigar hull riding low, conning tower with periscope and
  // sail planes, rudder and screw at the stern, a row of portholes, livery band at the tower base.
  const SUB_BIG=[
    '...........pp...........',
    '............p...........',
    '..........oooooo........',
    '..........oTTTTo........',
    '.........foTTTTof.......',
    '..........oTTTTo........',
    '..........oTTTTo........',
    '..........oTTTTo........',
    '....oooooooSSSSoooooo...',
    '.r.oLLLLLLLLLLLLLLLLLoo.',
    'rrrHHHwHHHHwHHHHwHHHHHHo',
    '.rrDDDDDDDDDDDDDDDDDDDDo',
    '..roDDDDDDDDDDDDDDDDDDo.',
    '....ooooooooooooooooo...'
  ];
  const SUB_SMALL=[
    '.....p......',
    '....ooo.....',
    '....oTo.....',
    '..oooSoooo..',
    'r.oLLLLLLLo.',
    'rrHHwHHwHHHo',
    '.roDDDDDDDo.',
    '...oooooo...'
  ];
  // Parts per class (1 鯊級 / 2 雲鯨級 / 3 鯨級 / 4 腔棘魚級 / 5 希爾德里昂級), keyed by slot:
  // hull, stern, bow, bridge — the same order as the planner's build codes (e.g. 1121, 3124).
  const SUB_PARTS={"hull":{"1":{"8":"....oooooooSSSSooooo....","9":"....LLLLLLLLLLLLLLLL....","10":"....HgHgHwHHHHwHHHwH....","11":"....DDDDDDDDDDDDDDDD....","12":"....DDDDDDDDDDDDDDDD....","13":"....oooooooooooooooo...."},"2":{"8":"....oooooooSSSSooooo....","9":"....LLLLLLLLLLLLLLLL....","10":"....HHwwHHHHwwHHHHww....","11":"....HHHHHHHHHHHHHHHH....","12":"....BBBBBBBBBBBBBBBB....","13":"....oooooooooooooooo...."},"3":{"8":"....oooooooSSSSooooo....","9":"....LLLLLLLLLLLLLLLL....","10":"....HHHwHHHHHHwHHHHH....","11":"....DDDDDDDDDDDDDDDD....","12":"....BDBDBDBDBDBDBDBD....","13":"....oooooooooooooooo...."},"4":{"8":"....oooooooSSSSooooo....","9":"....LALALALALALALALA....","10":"....HHwHHHHwHHHHwHHH....","11":"....DHDHDHDHDHDHDHDH....","12":"....DDDDDDDDDDDDDDDD....","13":"....oooooooooooooooo...."},"5":{"7":".....A.A.........A.A....","8":"....oooooooSSSSooooo....","9":"....LLLLLLLLLLLLLLLL....","10":"....HwHHAHHwHHAHHwHH....","11":"....DADDDADDDADDDADD....","12":"....BBBBBBBBBBBBBBBB....","13":"....oooooooooooooooo...."}},"stern":{"1":{"6":"D.......................","7":"DD......................","8":".DDDo...................","9":"..DDo...................","10":"..DDH...................","11":"..DDD...................","12":".DDDD...................","13":"DD..o..................."},"2":{"8":"....o...................","9":".ooAo...................","10":"oAAAo...................","11":".ooHo...................","12":"oAAAo...................","13":".oooo..................."},"3":{"8":"....o...................","9":"...oH...................","10":"DD.oH...................","11":"DDDDD...................","12":".D.oD...................","13":"....o..................."},"4":{"8":"....o...................","9":".AA.o...................","10":"AHHAH...................","11":"AHAHD...................","12":".AA.o...................","13":"....o..................."},"5":{"7":"A.......................","8":"AA......................","9":".AA.o...................","10":"..AoL...................","11":".oHHH...................","12":"oDo.D...................","13":".o..o..................."}},"bow":{"1":{"8":"...................oo...","9":"...................LLoo.","10":"...................HkHHo","11":"...................DtDto","12":"...................DDoo.","13":"...................oo..."},"2":{"8":"...................ooo..","9":"...................LwwAo","10":"...................HwwwA","11":"...................HHwwA","12":"...................BBAo.","13":"...................ooo.."},"3":{"8":"...................oooo.","9":"...................LLLLo","10":"...................HHkHo","11":"...................DDDDo","12":"...................BDBDo","13":"...................oooo."},"4":{"8":"...................oo...","9":"...................LAoo.","10":"...................HHAAo","11":"...................DHAAA","12":"...................DDoo.","13":"...................oo..."},"5":{"7":"....................A...","8":"...................oAA..","9":"...................LLoo.","10":"...................HkHAo","11":"...................DDDtA","12":"...................BBoo.","13":"...................oo..."}},"bridge":{"1":{"0":"...........pp...........","1":"............p...........","2":"..........ooooo.........","3":"..........oTTTTo........","4":".........ooTTTTo........","5":"........oAoTTTTo........","6":".......oAAoTTTTo........","7":"......oAAAoTTTTo........"},"2":{"0":"...........pp...........","1":"............p...........","2":"...........oooo.........","3":"..........oTTTTo........","4":".........AoTTTTwA.......","5":".........AoTTTTwA.......","6":"..........oTTTTo........","7":"..........oTTTTo........"},"3":{"0":"...........pp...........","1":"............p...........","2":".........oooooooo.......","3":".........oATTTTAo.......","4":".........oATTTTAo.......","5":".........oATTTTAo.......","6":".........oATTTTAo.......","7":".........oATTTTAo......."},"4":{"0":"...........pp...A.......","1":"............p..AA.......","2":"..........ooooAA........","3":"..........oTTTTo........","4":".........AoTTTToA.......","5":"..........oTTTTo........","6":".........AoTTTToA.......","7":"..........oTTTTo........"},"5":{"0":".........A.pp..A........","1":".........AA.p.AA........","2":"..........oooooo........","3":"..........oTTTTo........","4":".........AoTTTToA.......","5":"..........oTTTTo........","6":"..........oTTTTo........","7":"..........oTTTTo........"}}};
  const CLASS_PAL={
    1:{o:'#1a2f3c',L:'#b8ccd2',H:'#82a0ac',D:'#4f6a7a',B:'#dfe6e6',T:'#4f7183',A:'#e8eef0',g:'#2a4250',k:'#101820',t:'#f4f4ee'},
    2:{o:'#24343c',L:'#f2e8c9',H:'#cbbb8e',D:'#8f8a6a',B:'#fbf3dc',T:'#5e8f8a',A:'#5fb3a8',g:'#6b6650',k:'#101820',t:'#ffffff'},
    3:{o:'#121b27',L:'#7690ad',H:'#4a6584',D:'#2d4059',B:'#a7b9cc',T:'#365372',A:'#c8d6e6',g:'#1f2d40',k:'#0a0f16',t:'#ffffff'},
    4:{o:'#1f2a24',L:'#aebe8e',H:'#7f9361',D:'#52623e',B:'#c9d1aa',T:'#5d7148',A:'#d8bb63',g:'#3a4630',k:'#101410',t:'#ffffff'},
    5:{o:'#221a33',L:'#bcaee6',H:'#8172bd',D:'#4f437c',B:'#d8cff0',T:'#574b8a',A:'#5fd0c8',g:'#3a3060',k:'#120d1c',t:'#ffffff'}
  };
  const SLOT_PART=['hull','stern','bow','bridge'];
  const subCache=new Map();
  function subSprite(build,shipColor,night,flip){
    const key=build+shipColor+night+flip;
    if(subCache.has(key))return subCache.get(key);
    const c=document.createElement('canvas');c.width=24;c.height=14;const g=c.getContext('2d');
    SLOT_PART.forEach((part,slot)=>{
      const cls=String(build[slot]),rows=SUB_PARTS[part][cls]||SUB_PARTS[part]['1'];
      const pal={...CLASS_PAL[cls]||CLASS_PAL[1],w:night?'#ffd98a':'#e9e3b8',p:'#c9dcd6',S:shipColor};
      for(const [r,row] of Object.entries(rows))for(let x=0;x<24;x++){const ch=row[x];if(ch==='.'||!pal[ch])continue;g.fillStyle=pal[ch];g.fillRect(flip?23-x:x,+r,1,1)}
    });
    subCache.set(key,c);return c;
  }
  const haloCache=new WeakMap();
  function haloOf(spr){
    if(haloCache.has(spr))return haloCache.get(spr);
    const c=document.createElement('canvas');c.width=spr.width;c.height=spr.height;const g=c.getContext('2d');
    g.drawImage(spr,0,0);g.globalCompositeOperation='source-in';g.fillStyle='#fff6d0';g.fillRect(0,0,c.width,c.height);
    haloCache.set(spr,c);return c;
  }
  // Installed parts per submarine, read-only from the planner data (same fallback as the calculator).
  let builds=['1111','1111','1111','1111'];
  function readBuilds(){
    try{
      const ships=(JSON.parse(localStorage.getItem('ff14_submarine_planner_v1')||'{}').ships)||[];
      builds=[0,1,2,3].map(i=>{const s=ships[i]||{},b=String(s.currentBuild||'');return /^[1-5]{4}$/.test(b)?b:((Number(s.rank)||1)<15?'1111':'1121')});
    }catch(e){}
  }
  readBuilds();
  const DIGITS={0:['###','#.#','#.#','#.#','###'],1:['.#.','##.','.#.','.#.','###'],2:['##.','..#','.#.','#..','###'],3:['##.','..#','.#.','..#','##.'],4:['#.#','#.#','###','..#','..#'],5:['###','#..','##.','..#','##.'],6:['.##','#..','###','#.#','###'],7:['###','..#','.#.','.#.','.#.'],8:['###','#.#','###','#.#','###'],9:['###','#.#','###','..#','##.']};
  const SHIP_COLORS=['#e8b04a','#5bbfae','#e07a5f','#a493e6'];
  const BASE={o:'#1a2f3c',L:'#a7c6c8',H:'#709cab',D:'#41697b',T:'#4f7889',p:'#c9dcd6',w:'#e9e3b8',f:'#33586a',r:'#33586a'};
  const spriteCache=new Map();
  function sprite(rows,colors,flip){
    const key=rows.join('|')+':'+JSON.stringify(colors)+':'+flip;
    if(spriteCache.has(key))return spriteCache.get(key);
    const c=document.createElement('canvas');c.width=rows[0].length;c.height=rows.length;
    const g=c.getContext('2d');
    rows.forEach((row,y)=>[...row].forEach((ch,x)=>{
      const col=colors[ch];if(!col)return;
      g.fillStyle=col;g.fillRect(flip?row.length-1-x:x,y,1,1);
    }));
    spriteCache.set(key,c);return c;
  }

  /* ---------- geometry from the existing DOM anchors ---------- */
  const boats=[...dock.querySelectorAll('[data-harbor-ship]')];
  let W=0,H=0,w=0,h=0,G=null;
  const art=v=>Math.round(v/PX);
  function measure(){
    const r=dock.getBoundingClientRect();
    if(r.width<=0||r.height<=0)return false;
    W=r.width;H=r.height;w=Math.ceil(W/PX);h=Math.ceil(H/PX);
    canvas.width=w;canvas.height=h;fx.width=w;fx.height=h;
    const cs=getComputedStyle(dock),num=(name,fallback)=>parseFloat(cs.getPropertyValue(name))||fallback;
    const apron=num('--apron-top',73),quay=num('--quay-level',53),horizon=num('--horizon',apron+17);
    const piers=[...dock.querySelectorAll('.harbor-slip-wall')].map(p=>{const b=p.getBoundingClientRect();return art(b.left+b.width/2-r.left)});
    const lamps=[...dock.querySelectorAll('.harbor-lamp')].map(l=>{const b=l.getBoundingClientRect();return art(b.left+b.width/2-r.left)});
    const bottoms=boats.map(b=>parseFloat(getComputedStyle(b).bottom)||27);
    const big=boats.map(b=>b.offsetWidth>=36);
    const waterline=h-art(Math.min(...bottoms)+(big[0]?4:3));
    G={skyRows:26,apronY:h-art(apron),quayY:h-art(quay),horizonY:h-art(horizon),piers,lamps,bottoms,big,waterline,
      dockR:(piers[piers.length-1]||art(W*.36))+2,landR:Math.max(14,(piers[0]||20)-3),dockRectBottom:r.bottom,dockLeft:r.left};
    buildFar();staticDirty=true;
    return true;
  }

  /* ---------- far background (headland, lighthouse islet, town) ---------- */
  let far=null;
  function buildFar(){
    seed=4242;
    far={ridge:[],town:[],islet:w-9,clouds:[],stars:[]};
    let y=0;
    for(let x=0;x<w;x++){y+=(srand()-.5)*.9;y=clamp(y,-1,1);far.ridge.push(y)}
    for(let x=4;x<Math.min(w*.5,G.dockR+40);x+=4+Math.floor(srand()*5))far.town.push({x,hgt:2+Math.floor(srand()*4),wd:3+Math.floor(srand()*3),win:srand()<.45});
    for(let i=0;i<45;i++)far.stars.push({x:Math.floor(srand()*w),y:G.horizonY-G.skyRows+Math.floor(srand()*(G.skyRows-6)),ph:srand()*6.28,sp:.6+srand()*1.8});
    for(let i=0;i<4;i++)far.clouds.push(newCloud(srand()*w));
    // Low cloud deck: long flat streaks hugging the horizon, shown only under heavy cloud.
    far.stratus=[];
    for(let i=0,n=Math.ceil(w/12);i<n;i++)far.stratus.push({x:srand()*(w+60)-30,y:G.horizonY-3-Math.floor(Math.pow(srand(),1.6)*(G.skyRows-8)),wd:18+Math.floor(srand()*56),hg:1+Math.floor(srand()*3),a:.35+srand()*.45,speed:.15+srand()*.35});
  }
  // Clouds wanted on screen: the weather's count, scaled up for wide stages.
  const cloudsWanted=()=>Math.round(WX.clouds*Math.max(1,w/600));
  // snap: fill to the wanted count at once (first paint / forced weather) instead of drifting in.
  function syncClouds(dt,snap){
    const want=cloudsWanted(),live=far.clouds.filter(c=>!c.out);
    if(snap){
      far.clouds=live.slice(0,want);for(const c of far.clouds)c.f=1;
      while(far.clouds.length<want){const c=newCloud(Math.random()*w);c.f=1;far.clouds.push(c)}
      return;
    }
    if(live.length<want){
      const lack=want-live.length;
      if(lack>2&&Math.random()<dt*.6){const c=newCloud(Math.random()*(w-20));c.f=0;far.clouds.push(c)}       // form in place
      else if(Math.random()<dt*(lack>1?.25:.04)){const c=newCloud(wind<0?w+4:-30);far.clouds.push(c)}         // drift in
    }else if(live.length>want+1&&Math.random()<dt*.4)live[Math.floor(Math.random()*live.length)].out=true;  // thin out
  }
  function newCloud(x){
    const parts=[],n=3+Math.floor(Math.random()*4);
    for(let i=0;i<n;i++)parts.push({dx:i*4+Math.floor(Math.random()*3),dy:Math.floor(Math.random()*3),wd:6+Math.floor(Math.random()*8),hg:2+Math.floor(Math.random()*2)});
    const top=G.horizonY-G.skyRows+6;
    return {x,y:top+Math.floor(Math.random()*Math.max(2,G.skyRows-16)),parts,speed:.4+Math.random()*.7,shade:Math.random()};
  }

  /* ---------- static structures (cached, re-lit when the palette shifts) ---------- */
  const stat=document.createElement('canvas'),fx=document.createElement('canvas');
  let staticDirty=true,staticHour=-1,staticOvercast=0;
  function rect(g,c,x,y,ww,hh){g.fillStyle=c;g.fillRect(x,y,ww,hh)}
  function drawStatic(P){
    stat.width=w;stat.height=h;
    const g=stat.getContext('2d'),{apronY,quayY,waterline,piers,lamps,dockR,landR}=G;
    // Under-deck shade between the pilings (behind the boats).
    g.fillStyle='rgba(8,30,44,.38)';g.fillRect(landR,quayY,dockR-landR,waterline-quayY);
    // Pilings with fenders and an algae line at the waterline.
    for(const x of piers){
      rect(g,'#5f4a35',x-1,quayY,3,h-quayY);rect(g,'#8b6b4b',x,quayY,1,h-quayY);
      rect(g,'#2f4b3c',x-1,waterline-1,3,2);
      rect(g,'#30343a',x-2,waterline-7,1,4);rect(g,'#30343a',x+2,waterline-7,1,4);
    }
    // Stone embankment on the left (land side).
    for(let y=apronY;y<h;y++)for(let x=0;x<landR;x++){
      const row=Math.floor((y-apronY)/3),brick=Math.floor((x+(row%2)*3)/6);
      const mortar=(y-apronY)%3===0||(x+(row%2)*3)%6===0;
      g.fillStyle=mortar?'#5f6a66':(hash(brick,row)>.5?'#97a39a':'#8a968e');g.fillRect(x,y,1,1);
    }
    rect(g,'#c4c8b4',0,apronY-1,landR,2);
    // Two dark crevices near the waterline (crabs hide here).
    G.crevices=[Math.max(3,Math.round(landR*.25)),Math.max(8,Math.round(landR*.72))];
    for(const cx of G.crevices){rect(g,'#2c3432',cx,waterline-4,3,2);rect(g,'#3f4a47',cx-1,waterline-3,1,1)}
    // Wooden deck: planks on top, boarded face, dark beam.
    rect(g,'#d8c08e',landR,apronY-1,dockR-landR,1);rect(g,'#b99a6a',landR,apronY,dockR-landR,1);
    for(let y=apronY+1;y<quayY-1;y++)for(let x=landR;x<dockR;x++){
      const seam=(x-landR)%7===0;g.fillStyle=seam?'#6b5038':((y+(x>>3))%4===0?'#937252':'#9c7a57');g.fillRect(x,y,1,1);
    }
    rect(g,'#4a3828',landR,quayY-1,dockR-landR,2);
    // Bollards and berth plaques.
    G.bollards=[];
    for(let i=0;i<piers.length-1;i++){
      const cx=Math.round((piers[i]+piers[i+1])/2);G.bollards.push(piers[i+1]-3);
      rect(g,'#2f3337',piers[i+1]-4,apronY-3,3,2);rect(g,'#4a5056',piers[i+1]-4,apronY-3,3,1);
      rect(g,SHIP_COLORS[i],cx-3,apronY+1,7,7);rect(g,'#2e4a5a',cx-2,apronY+1,5,7);
      drawDigit(g,i+1,cx-1,apronY+2,'#efe2b8');
    }
    // Free company workshop on the embankment: stone base, timber walls, roll-up bay door,
    // a generic gear sign (no company crest) and a company chest beside it.
    const bw=Math.min(24,landR-3),bx=1,by=apronY-15;
    if(bw>=14){
      rect(g,'#3a4a52',bx-1,by-3,bw+2,3);rect(g,'#56707c',bx,by-4,bw,1);rect(g,'#2a363c',bx-1,by-1,bw+2,1);
      for(let y=by;y<apronY-1;y++)for(let x=bx;x<bx+bw;x++){g.fillStyle=y>=apronY-4?'#8a8f86':(x-bx)%4===0?'#6d5a44':'#93795a';g.fillRect(x,y,1,1)}
      // Bay door with slats (submersible parts go in and out here).
      rect(g,'#3b3f44',bx+2,apronY-10,9,9);for(let y=apronY-9;y<apronY-1;y+=2)rect(g,'#6a7178',bx+3,y,7,1);
      rect(g,'#c9a24a',bx+2,apronY-11,9,1);
      // Gear sign.
      const gx=bx+bw-6,gy=by+2;rect(g,'#2a363c',gx-1,gy-1,6,6);rect(g,'#d8b45c',gx+1,gy,2,4);rect(g,'#d8b45c',gx,gy+1,4,2);rect(g,'#2a363c',gx+1,gy+1,2,2);
      rect(g,'#2d4650',bx+bw-6,apronY-8,4,3);rect(g,'#bfe3e6',bx+bw-5,apronY-7,2,1);
      rect(g,'#5a4a42',bx+bw-5,by-8,3,5);
      G.office={x:bx,y:by,w:bw,door:bx+6,win:[bx+bw-5,apronY-7],chimney:[bx+bw-4,by-8]};
      if(landR-(bx+bw)>=7){const cx=bx+bw+2;G.chest=cx;
        rect(g,'#5b3a22',cx,apronY-5,6,4);rect(g,'#7a4f2c',cx,apronY-6,6,1);rect(g,'#d8b45c',cx,apronY-4,6,1);rect(g,'#d8b45c',cx+2,apronY-5,2,3);rect(g,'#3a2414',cx+1,apronY-1,4,1)}
      else G.chest=null;
    }else{G.office=null;G.chest=null}
    // Cargo: crates, barrels, rope coil, life ring.
    const crateX=Math.round(landR+(dockR-landR)*.12);G.crateX=crateX;
    rect(g,'#7a5530',crateX,apronY-5,5,5);rect(g,'#a7773f',crateX+1,apronY-4,3,3);rect(g,'#7a5530',crateX+2,apronY-4,1,3);
    rect(g,'#7a5530',crateX+5,apronY-4,4,4);rect(g,'#b88848',crateX+6,apronY-3,2,2);
    rect(g,'#7a5530',crateX+2,apronY-9,4,4);rect(g,'#c09050',crateX+3,apronY-8,2,2);
    const barrelX=Math.round(landR+(dockR-landR)*.62);G.barrelX=barrelX;
    for(const dx of [0,4]){rect(g,'#6e4a2f',barrelX+dx,apronY-5,3,5);rect(g,'#9a6a40',barrelX+dx+1,apronY-5,1,5);rect(g,'#3a3a3a',barrelX+dx,apronY-4,3,1);rect(g,'#3a3a3a',barrelX+dx,apronY-2,3,1)}
    rect(g,'#c9a86b',barrelX+9,apronY-2,4,2);rect(g,'#a88a52',barrelX+10,apronY-2,2,1);
    // Aetheryte: the first free gap on the deck wide enough for its pedestal.
    G.aetheryte=null;
    {const busy=[[crateX-2,crateX+10],[barrelX-2,barrelX+14],[dockR-10,dockR+2]].concat(lamps.map(x=>[x-3,x+3])).concat(G.bollards.map(x=>[x-3,x+2]));
     for(let x=landR+2;x<dockR-20;x++){if(!busy.some(([a,b])=>x+8>=a&&x<=b)){G.aetheryte={x:x+4,y:apronY-1};break}}}
    if(G.aetheryte){const ax=G.aetheryte.x;rect(g,'#6d7a80',ax-3,apronY-3,7,2);rect(g,'#9aa8ad',ax-2,apronY-4,5,1);rect(g,'#4f5b60',ax-3,apronY-2,7,1)}
    // Lamp posts at the DOM lamp anchors (the tit perches on them).
    for(const x of lamps){rect(g,'#33464c',x,apronY-14,1,14);rect(g,'#33464c',x-1,apronY-1,3,1);rect(g,'#33464c',x-1,apronY-16,3,1);rect(g,'#d9d1a8',x-1,apronY-15,3,2)}
    // Re-light structures for the current time of day.
    if(P.tint[3]>0){g.globalCompositeOperation='source-atop';g.fillStyle=css(P.tint,P.tint[3]);g.fillRect(0,0,w,h);g.globalCompositeOperation='source-over'}
    staticDirty=false;staticHour=P.hour;staticOvercast=P.overcast||0;
  }
  function drawDigit(g,n,x,y,color){
    const d=DIGITS[n];if(!d)return;g.fillStyle=color;
    d.forEach((row,yy)=>[...row].forEach((c,xx)=>{if(c==='#')g.fillRect(x+xx,y+yy,1,1)}));
  }

  /* ---------- sea (per-pixel, procedural; never a fixed loop) ---------- */
  let seaImg=null,noiseRow=null;
  function drawSea(P,t){
    const top=G.horizonY,rows=h-top;if(rows<=0)return;
    if(!seaImg||seaImg.width!==w||seaImg.height!==rows)seaImg=ctx.createImageData(w,rows);
    const calm=.48+(P.calm||0)*.22,data=seaImg.data,glitX=Math.round(w*(P.hour<12?.72:.8));
    const lampRefl=P.light>.2?G.lamps:[];
    const glitter=(P.glitter??1)>.4&&(P.light>.25||(P.hour>5.5&&P.hour<8.5)||(P.hour>16.5&&P.hour<19.5));
    const px32=new Uint32Array(data.buffer),pack=c=>(255<<24|(c[2]&255)<<16|(c[1]&255)<<8|(c[0]&255))>>>0;
    const steps=Math.ceil(w/8)+1;if(!noiseRow||noiseRow.length!==steps)noiseRow=new Float32Array(steps);
    for(let r=0;r<rows;r++){
      const d=r/Math.max(1,rows-1),swell=.035*Math.sin(r*.7+t*.35);
      const base=mix(mix(P.seaFar,P.seaNear,Math.pow(d,.75)),[255,255,255],Math.max(0,swell));
      const col=mix(base,P.skyBot,Math.pow(1-d,3)*.5);
      const f=(.55+(1-d)*.9)*.35,sp=(.5+d*1.3)*(r%3===1?-.6:1),ph=r*2.3+1.5*noise(r*.25,t*.07);
      const cCol=pack(col),cHl=pack(mix(col,P.hl,.4+d*.35)),cDk=pack(mix(col,[0,0,0],.2)),cGl=pack(mix(col,P.hl,.85)),gw=1+d*4;
      // Patchiness: low-frequency noise sampled every 8 px and interpolated.
      const ny=r*.5+t*.12;for(let k=0;k<steps;k++)noiseRow[k]=noise(k*8*.045,ny);
      // sin(x*f+phase) by angle-addition recurrence (one Math.sin per row).
      const cf=Math.cos(f),sf=Math.sin(f);let sv=Math.sin(t*sp+ph),cv=Math.cos(t*sp+ph);
      const rowBase=r*w;
      for(let x=0;x<w;x++){
        const k=x>>3,fr=(x&7)/8,m=noiseRow[k]+(noiseRow[k+1]-noiseRow[k])*fr;
        let c=cCol;
        if(sv>.95-.06*m&&m>calm)c=cHl;else if(sv<-.975&&m<.36)c=cDk;
        if(glitter&&sv>.5&&Math.abs(x-glitX)<gw)c=cGl;
        px32[rowBase+x]=c;
        const ns=sv*cf+cv*sf;cv=cv*cf-sv*sf;sv=ns;
      }
      const y=top+r;
      // Warm, broken lamp reflections at night.
      for(const lx of lampRefl){
        if(y<G.waterline)continue;
        const wob=Math.round(Math.sin(t*1.3+r*.8)*1.2);
        for(let x=lx+wob;x<=lx+wob;x++){
          if(x<0||x>=w||noise(x*.5,r*.6+t*1.4)<.55)continue;
          const i=(r*w+x)*4,a=P.light*.4*(1-d*.5);
          data[i]+=(255-data[i])*a;data[i+1]+=(214-data[i+1])*a;data[i+2]+=(140-data[i+2])*a;
        }
      }
    }
    ctx.putImageData(seaImg,0,top);
  }

  /* ---------- sky, stars, clouds, far land ---------- */
  function drawSky(P,t,dt){
    const top=G.horizonY,skyTop=Math.max(0,top-G.skyRows);
    const grad=ctx.createLinearGradient(0,skyTop,0,top);
    grad.addColorStop(0,css(P.skyTop,0));grad.addColorStop(.45,css(P.skyTop,.88));grad.addColorStop(1,css(P.skyBot,1));
    ctx.fillStyle=grad;ctx.fillRect(0,skyTop,w,top-skyTop);
    if(P.stars>.05)for(const s of far.stars){
      const a=P.stars*(.35+.65*Math.max(0,Math.sin(t*s.sp+s.ph)))*clamp((s.y-skyTop)/(G.skyRows*.45),0,1);
      if(a>.08){ctx.fillStyle='rgba(255,247,220,'+a.toFixed(2)+')';ctx.fillRect(s.x,s.y,1,1)}
    }
    if(P.stars>.4){ // moon
      const mx=Math.round(w*.8),my=top-Math.round(G.skyRows*.6);
      ctx.fillStyle='rgba(255,240,200,'+(P.stars*.95).toFixed(2)+')';ctx.fillRect(mx,my,3,4);ctx.fillRect(mx-1,my+1,1,2);
      ctx.fillStyle=css(P.skyTop,.95);ctx.fillRect(mx+2,my,1,2);
    }
    // Low sun at dawn and dusk, sitting on the horizon above its glitter path.
    const sunUp=P.hour>5.4&&P.hour<8.6?(P.hour-5.4)/3.2:P.hour>16.4&&P.hour<19.6?(19.6-P.hour)/3.2:-1;
    if(sunUp>=0&&(P.glitter??1)>.4){
      const sx=Math.round(w*(P.hour<12?.72:.8)),sy=top-1-Math.round(sunUp*8);
      ctx.fillStyle='rgba(255,226,160,.95)';ctx.fillRect(sx-2,sy-3,5,6);ctx.fillRect(sx-3,sy-2,7,4);
      ctx.fillStyle='rgba(255,246,214,.9)';ctx.fillRect(sx-1,sy-2,3,4);
      ctx.fillStyle=css(P.seaFar);ctx.fillRect(sx-4,top,9,1);
    }
    // Clouds drift with a slowly wandering wind; new ones form at random.
    const cloudCol=mix(mix(P.skyBot,[255,255,255],P.light>.6?.08:.45),[120,128,136],WX.overcast*.5),shadow=mix(cloudCol,P.skyTop,.35);
    const deck=clamp((WX.overcast-.15)/.35,0,1);
    if(deck>0){
      ctx.fillStyle=css(mix(cloudCol,P.skyTop,.2));const k=deck*(P.light>.6?.7:1);
      for(const s of far.stratus){
        s.x+=s.speed*wind*dt;if(s.x>w+10)s.x=-s.wd-10;else if(s.x<-s.wd-12)s.x=w+8;
        ctx.globalAlpha=k*s.a*clamp((s.y-skyTop)/(G.skyRows*.35),0,1);ctx.fillRect(Math.round(s.x),s.y,s.wd,s.hg);
      }
      ctx.globalAlpha=1;
    }
    for(const c of far.clouds){
      c.x+=c.speed*wind*dt;
      c.f=clamp((c.f??1)+(c.out?-dt*.3:dt*.25),0,1);
      for(const p of c.parts){
        const a=clamp((c.y+p.dy-skyTop)/(G.skyRows*.5),0,1)*(P.light>.6?.55:.8)*c.f;
        ctx.fillStyle=css(shadow,a);ctx.fillRect(Math.round(c.x+p.dx),c.y+p.dy+1,p.wd,p.hg);
        ctx.fillStyle=css(cloudCol,a);ctx.fillRect(Math.round(c.x+p.dx+1),c.y+p.dy,p.wd-2,p.hg);
      }
    }
    far.clouds=far.clouds.filter(c=>c.x<w+10&&c.x>-60&&!(c.out&&c.f<=0));
    syncClouds(dt,false);
    // Distant ridge and harbor town.
    const ridge=mix(P.skyBot,P.seaFar,.55),town=mix(ridge,[20,30,40],.25);
    ctx.fillStyle=css(ridge);
    for(let x=0;x<Math.min(w*.62,G.dockR+70);x++){const hh=3+Math.round(far.ridge[x]*1.5+Math.sin(x*.05)*2);ctx.fillRect(x,top-hh,1,hh)}
    for(const b of far.town){
      ctx.fillStyle=css(town);ctx.fillRect(b.x,top-3-b.hgt,b.wd,b.hgt+1);
      if(b.win&&P.light>.3){ctx.fillStyle='rgba(255,210,130,'+(P.light*.8).toFixed(2)+')';ctx.fillRect(b.x+1,top-2-b.hgt,1,1)}
    }
    // Lighthouse islet.
    const ix=far.islet;ctx.fillStyle=css(mix(ridge,[30,40,50],.3));ctx.fillRect(ix-7,top-2,15,2);ctx.fillRect(ix-4,top-3,9,1);
    ctx.fillStyle=css(mix([238,236,224],P.skyTop,P.light*.45));ctx.fillRect(ix,top-13,3,10);
    ctx.fillStyle=css(mix([200,82,70],P.skyTop,P.light*.45));ctx.fillRect(ix,top-11,3,2);ctx.fillRect(ix,top-6,3,2);
    ctx.fillStyle=css(mix([60,64,70],P.skyTop,.2));ctx.fillRect(ix-1,top-15,5,2);
  }

  /* ---------- dynamic actors ---------- */
  let wind=1,windTarget=1,windTimer=0,gust=0,gustLeft=0,seaT=0;
  const smoke=[],glints=[],ripples=[];
  const workers=[{x:0,dir:1,state:'idle',timer:2,target:0,frame:0,vest:'#d67e4b',carry:false},
                 {x:0,dir:-1,state:'idle',timer:5,target:0,frame:0,vest:'#5fa8a2',carry:false}];
  const fisher={bob:0,timer:6,state:'wait',catchT:0};
  const boatState=boats.map((_,i)=>({ph:Math.random()*6.28,ph2:Math.random()*6.28,f:.9+Math.random()*.6,lastX:null,vx:0,hover:false}));
  boats.forEach((b,i)=>{
    const on=()=>{boatState[i].hover=true},off=()=>{boatState[i].hover=false};
    b.addEventListener('mouseenter',on);b.addEventListener('mouseleave',off);b.addEventListener('focus',on);b.addEventListener('blur',off);
  });
  function placeWorkers(){
    const lo=G.landR+4,hi=G.dockR-4;
    workers.forEach((wk,i)=>{wk.x=lo+(hi-lo)*(i?.7:.3);wk.target=wk.x});
  }
  function updateWorker(wk,dt){
    const lo=G.landR+3,hi=G.dockR-5;
    wk.timer-=dt;
    if(wk.state==='walk'){
      const step=dt*(wk.carry?5:7);
      if(Math.abs(wk.target-wk.x)<=step){wk.x=wk.target;wk.state='idle';wk.timer=1.5+Math.random()*6;if(Math.random()<.35)wk.carry=!wk.carry}
      else{wk.x+=Math.sign(wk.target-wk.x)*step;wk.frame+=dt*8}
    }else if(wk.timer<=0){
      const r=Math.random();
      if(r<.55){
        let target=clamp(lo+Math.random()*(hi-lo),lo,hi);
        for(let k=0;k<6&&blockedAt(target);k++)target=clamp(lo+Math.random()*(hi-lo),lo,hi);
        if(blockedAt(target)){wk.timer=2;return}
        wk.target=target;wk.dir=Math.sign(wk.target-wk.x)||wk.dir;wk.state='walk'}
      else if(r<.8){wk.dir*=-1;wk.timer=1+Math.random()*3}      // glance the other way
      else{wk.state='idle';wk.timer=3+Math.random()*7}          // take a longer break
    }
  }
  // Deck space held by an event: workers keep clear, and step aside if already inside.
  let blocked=[];
  const blockedAt=x=>blocked.some(([a,b])=>x>=a-3&&x<=b+3);
  function setBlocked(list){
    blocked=list;
    const lo=G.landR+3,hi=G.dockR-5;
    for(const wk of workers)for(const [a,b] of blocked)if(wk.x>=a-3&&wk.x<=b+3){
      const left=a-6,right=b+6,target=(wk.x-left<right-wk.x&&left>=lo)||right>hi?left:right;
      wk.target=clamp(target,lo,hi);wk.dir=Math.sign(wk.target-wk.x)||wk.dir;wk.state='walk';
    }
  }
  function drawWorker(g,wk){
    const x=Math.round(wk.x),y=G.apronY-1,step=wk.state==='walk'?Math.floor(wk.frame)%2:0;
    rect(g,'#2f4a57',x,y-2,1,2+0);rect(g,'#2f4a57',x+2,y-2+step,1,2-step);
    rect(g,wk.vest,x,y-6,3,4);rect(g,'#f0d2a8',x+(wk.dir>0?1:0),y-8,2,2);rect(g,'#f1c45a',x,y-9,3,1);
    if(wk.carry){rect(g,'#8a5d33',x+(wk.dir>0?2:-2),y-7,3,3);rect(g,'#b07a42',x+(wk.dir>0?3:-1),y-6,1,1)}
  }
  function drawFisher(g,t,dt){
    const x=G.dockR-3,y=G.apronY-1;
    rect(g,'#3b5566',x-2,y-3,4,3);rect(g,'#c86f4a',x-2,y-6,3,3);rect(g,'#f0d2a8',x-1,y-8,2,2);rect(g,'#2d5a4a',x-2,y-9,4,1);
    // Rod and line: a bite shows its tell (! / !! / !!!), then the hook lands a fish or misses.
    fisher.timer-=dt;
    if(fisher.state==='wait'&&fisher.timer<=0){
      let r=Math.random(),k=0;while(k<2&&r>TELL[k][1]){r-=TELL[k][1];k++}
      fisher.tell=k+1;fisher.state='bite';fisher.timer=1.3;
    }else if(fisher.state==='bite'&&fisher.timer<=0){fisher.state=Math.random()<.7?'catch':'miss';fisher.timer=fisher.state==='catch'?2.2:.8}
    else if((fisher.state==='catch'||fisher.state==='miss')&&fisher.timer<=0){fisher.state='wait';fisher.timer=6+Math.random()*12}
    if(fisher.state==='bite')tellBubble(g,x,y-10,fisher.tell);
    const lift=fisher.state==='catch'?Math.min(1,(2.2-fisher.timer)/.6):0;
    const tipX=x+6,tipY=y-12+Math.round(lift*-2);
    g.fillStyle='#5a4532';for(let i=0;i<7;i++)g.fillRect(x+i,y-6-Math.round(i*.9+lift*i*.3),1,1);
    const bx=tipX+4,by=G.waterline+(fisher.state==='bite'?Math.round(Math.sin(t*(10+fisher.tell*4))*fisher.tell*.6):0)-Math.round(lift*(G.waterline-y+6));
    g.fillStyle='rgba(225,225,215,.7)';for(let s=0;s<=10;s++){g.fillRect(Math.round(tipX+(bx-tipX)*s/10),Math.round(tipY+(by-tipY)*s/10+Math.sin(s/10*3.14)*2),1,1)}
    if(lift>.5){const len=fisher.tell+1;rect(g,'#9cc7d6',bx-(len>>1),by,len,2);rect(g,'#e8f4f6',bx-(len>>1),by,1,1)}
    else rect(g,'#e04f3f',bx,by-1,1,1);
  }
  // Floating aether crystal with two counter-rotating rings.
  function drawAetheryte(g,t){
    const a=G.aetheryte;if(!a)return;
    const x=a.x,base=a.y-6,bob=Math.round(Math.sin(t*1.3)*1);
    const ring=(r,sp,ph,col)=>{for(let k=0;k<14;k++){const ang=k/14*6.283+t*sp+ph,px=Math.round(x+Math.cos(ang)*r),py=Math.round(base-6+Math.sin(ang)*1.3);if(Math.sin(ang)<0)continue;g.fillStyle=col;g.fillRect(px,py,1,1)}};
    ring(4,1.6,0,'#9fe8ff');
    const cy=base-11+bob;
    g.fillStyle='#2f7fb0';g.fillRect(x-1,cy,3,1);g.fillRect(x-2,cy+1,5,6);g.fillRect(x-1,cy+7,3,2);g.fillRect(x,cy+9,1,1);
    g.fillStyle='#6fd0f4';g.fillRect(x-1,cy+1,2,5);g.fillStyle='#d8f6ff';g.fillRect(x-1,cy+1,1,3);
    ring(5,-1.1,1.4,'#c9f2ff');
  }
  // Splash and bubbles when a submarine dives (leaving) or surfaces (coming home).
  const splashes=[];
  function splashAt(x,y,surfacing){
    for(let k=0;k<(surfacing?16:10);k++)splashes.push({x:x+(Math.random()-.5)*10,y,vx:(Math.random()-.5)*14,vy:-(surfacing?14:9)-Math.random()*10,life:0,max:.7+Math.random()*.5});
  }
  function drawSplashes(dt){
    for(const q of splashes){q.life+=dt;q.vy+=40*dt;q.x+=q.vx*dt;q.y+=q.vy*dt}
    for(let i=splashes.length-1;i>=0;i--)if(splashes[i].life>=splashes[i].max)splashes.splice(i,1);
    for(const q of splashes){ctx.fillStyle='rgba(235,250,248,'+(1-q.life/q.max).toFixed(2)+')';ctx.fillRect(Math.round(q.x),Math.round(q.y),1,1)}
  }
  // Fisher bite tells: ! light, !! medium, !!! heavy (heavier tells land bigger fish).
  const TELL=[['!',.55],['!!',.35],['!!!',.1]];
  function tellBubble(g,x,y,count){
    const wd=count*2+3,bx=x-(wd>>1),by=y-8;
    rect(g,'#33424a',bx,by,wd,7);rect(g,'#fffbea',bx+1,by+1,wd-2,5);rect(g,'#fffbea',x,by+7,1,1);
    for(let i=0;i<count;i++){rect(g,'#d0402e',bx+2+i*2,by+1,1,3);rect(g,'#d0402e',bx+2+i*2,by+5,1,1)}
  }
  function drawSmoke(g,P,dt){
    const o=G.office;if(!o)return;
    if(Math.random()<dt*2.2)smoke.push({x:o.chimney[0],y:o.chimney[1],life:0,max:3+Math.random()*2});
    for(const s of smoke){s.life+=dt;s.y-=dt*2.6;s.x+=dt*wind*1.8+Math.sin(s.life*2)*dt}
    for(let i=smoke.length-1;i>=0;i--)if(smoke[i].life>smoke[i].max)smoke.splice(i,1);
    for(const s of smoke){const a=(1-s.life/s.max)*.45;g.fillStyle='rgba(205,210,214,'+a.toFixed(2)+')';const sz=1+Math.floor(s.life);g.fillRect(Math.round(s.x),Math.round(s.y),sz,sz)}
  }
  function boatsInfo(){
    const r=dock.getBoundingClientRect();
    return boats.map((b,i)=>{
      if(b.hidden)return null;
      const br=b.getBoundingClientRect(),scale=b.offsetWidth?br.width/b.offsetWidth:1;
      const restBottom=r.bottom-G.bottoms[i];
      return {i,x:(br.left+br.width/2-r.left)/PX,dy:(br.bottom-restBottom)/PX,scale,
        sailing:b.classList.contains('is-sailing'),returning:b.classList.contains('is-returning'),awaiting:b.classList.contains('is-awaiting'),
        big:G.big[i]&&b.offsetWidth*scale>=36};
    });
  }
  function drawBoat(g,lights,info,P,t,dt){
    const st=boatState[info.i],flip=info.returning;
    const nowAtSea=info.dy<-2;
    if(st.wasAtSea!==undefined&&st.wasAtSea!==nowAtSea&&!reduced())splashAt(info.x,G.waterline+info.dy,!nowAtSea);
    st.wasAtSea=nowAtSea;
    if(st.wasAwaiting===false&&info.awaiting)arrived(info.i);
    st.wasAwaiting=info.awaiting;
    if(st.lastX!==null)st.vx=st.vx*.8+((info.x-st.lastX)/Math.max(dt,.001))*.2;st.lastX=info.x;
    const moving=Math.abs(st.vx)>.6,atSea=info.dy<-2,moored=!info.sailing&&!atSea;
    const colors={...BASE,S:SHIP_COLORS[info.i],w:P.light>.3?'#ffd98a':BASE.w};
    const big=info.big||atSea,rows=big?SUB_BIG:SUB_SMALL,spr=big?subSprite(builds[info.i],SHIP_COLORS[info.i],P.light>.3,flip):sprite(rows,colors,flip);
    // Surfaced and moored: hull and portholes above water, periscope retracted.
    // Out at sea: periscope depth, only the tower, its number and the hull's crown show.
    const top=moored&&big?2:0,wl=atSea?(big?8.5:4.5):moored?(big?12.5:6.5):(big?11.5:5.5),visible=atSea?(big?9:5):spr.height;
    const bob=Math.round(Math.sin(t*st.f+st.ph)*(atSea?.5:.6)+Math.sin(t*st.f*2.3+st.ph2)*.4);
    const cx=Math.round(info.x),waterY=Math.round(G.waterline+info.dy);
    const x0=cx-Math.floor(spr.width/2),y0=waterY-Math.ceil(wl)+bob;
    const towerX=x0+(flip?spr.width-1-12:12);
    st.draw=null;
    // Wake: from the stern when surfaced, from the conning tower at periscope depth.
    if(info.sailing&&!info.awaiting){
      const dir=flip?-1:1,len=moving?8:5,from=atSea?towerX-dir*3:cx-dir*Math.floor(spr.width/2);
      g.fillStyle='rgba(225,247,245,.55)';
      for(let k=1;k<=len;k++){if(hash(k,Math.floor(t*6))<.35)continue;g.fillRect(from-dir*k,waterY+Math.round(k*.25),1,1);g.fillRect(from-dir*k,waterY-Math.round(k*.15),1,1)}
      if(atSea){g.fillRect(towerX+dir*4,waterY,1,1);g.fillRect(towerX-dir*3,waterY-1,1,1)}
      else g.fillRect(cx+dir*Math.floor(spr.width/2),waterY,1,1);
    }else if(moored&&Math.sin(t*.7+st.ph)>.6){g.fillStyle='rgba(225,247,245,.35)';g.fillRect(x0-1,waterY+1,1,1);g.fillRect(x0+spr.width,waterY+1,1,1)}
    // Mooring line from the bow to the bollard when docked.
    if(moored){
      const bx=G.piers.find(px=>px>cx)||cx+10,by=G.apronY-3,sx=flip?x0+1:x0+spr.width-3,sy=y0+9;
      g.fillStyle='#c9a86b';
      for(let s=0;s<=12;s++){const tt=s/12;g.fillRect(Math.round(sx+(bx-3-sx)*tt),Math.round(sy+(by-sy)*tt+Math.sin(tt*3.14)*2),1,1)}
    }
    if(st.hover){ // selection halo
      const halo=haloOf(spr);
      g.globalAlpha=.9;for(const [ox,oy] of [[-1,0],[1,0],[0,-1],[0,1]])g.drawImage(halo,0,top,spr.width,visible-top,x0+ox,y0+top+oy,spr.width,visible-top);g.globalAlpha=1;
    }
    g.drawImage(spr,0,top,spr.width,visible-top,x0,y0+top,spr.width,visible-top);
    st.draw={i:info.i,x0,y0,w:spr.width,h:spr.height,flip,big,moored,awaiting:info.awaiting,waterY,cx,towerX};
    if(atSea){g.fillStyle='rgba(225,247,245,.5)';g.fillRect(towerX-4,waterY,1,1);g.fillRect(towerX+3,waterY,1,1)}
    // Hull number painted on the conning tower.
    if(big)drawDigit(g,info.i+1,x0+(flip?10:11),y0+3,'#f3e7c4');
    // Screw turning at the stern while under way on the surface.
    if(info.sailing&&!info.awaiting&&big&&!atSea){g.fillStyle=Math.floor(t*12)%2?'#3b5a68':'#86a8b0';g.fillRect(flip?x0+spr.width:x0-1,y0+10,1,2)}
    // Arrived and waiting for settlement: a small bobbing "!" beside the bow (or above the tower at sea).
    if(info.awaiting){
      const ax=moored?(flip?x0-4:x0+spr.width+1):towerX-1,ay=(moored?y0+5:y0-6)+Math.round(Math.sin(t*2.4)*.8);
      g.fillStyle='#fff3c4';g.fillRect(ax,ay-1,3,5);g.fillStyle='#b5452e';g.fillRect(ax+1,ay,1,2);g.fillRect(ax+1,ay+3,1,1);
    }
    // Salvage crates stacked on the deck while the haul waits to be settled.
    if(info.awaiting&&moored&&big){
      const sx=flip?x0+15:x0+5;
      g.fillStyle='#7a5530';g.fillRect(sx,y0+5,3,3);g.fillRect(sx+3,y0+6,3,2);g.fillStyle='#d8b45c';g.fillRect(sx,y0+6,3,1);
      if(Math.sin(t*3+info.i)>.85){g.fillStyle='#fff6c8';g.fillRect(sx+1,y0+4,1,1)}
    }
    if(P.light>.3&&!atSea)lights.push([x0+12,y0+(info.big?10:5),3,.5]);
  }

  /* ---------- frame ---------- */
  let last=0,acc=0,raf=0,t=Math.random()*100,frameMs=[],P=palette(nowHour()),paletteAt=0;
  function frame(dt){
    const t0=performance.now();
    if(performance.now()-paletteAt>(performance.now()<wxFastUntil?250:3000)||!paletteAt){
      paletteAt=performance.now();updateWeather();
      if(!wxReady){Object.assign(WX,WEATHER_LOOK[weatherId]);syncClouds(0,true);wxReady=true}   // no fade on first paint
      P=applyWeather(palette(nowHour()));
      if(Math.abs(P.hour-staticHour)>.25||Math.abs((P.overcast||0)-staticOvercast)>.08)staticDirty=true;
    }
    stepWeather(dt);
    windTimer-=dt;if(windTimer<=0){windTarget=.4+Math.random()*1.1;windTimer=6+Math.random()*12}
    gustLeft=Math.max(0,gustLeft-dt);const gustTarget=gustLeft>0?gust:0;
    wind+=(windTarget+gustTarget-wind)*Math.min(1,dt*(gustLeft>0?1.6:.3));
    seaT+=dt*(.75+wind*.25);
    if(staticDirty)drawStatic(P);
    const env=events?eventEnv(dt):null;
    if(events)events.update(dt,env);
    ctx.clearRect(0,0,w,h);
    drawSea(P,seaT);
    drawSky(P,t,dt);
    layer('far',env);
    drawFog(dt);
    ctx.drawImage(stat,0,0);
    layer('underwater',env);
    // Actors are drawn on their own layer so the time-of-day tint applies to them too.
    const g=fx.getContext('2d'),lights=[];g.clearRect(0,0,w,h);
    drawAetheryte(g,t);
    for(const wk of workers){updateWorker(wk,dt);drawWorker(g,wk)}
    drawFisher(g,t,dt);drawSmoke(g,P,dt);
    for(const info of (env?env.boats:boatsInfo()))if(info)drawBoat(g,lights,info,P,t,dt);
    if(events)events.draw('actors',g,env);
    if(P.tint[3]>0){g.globalCompositeOperation='source-atop';g.fillStyle=css(P.tint,P.tint[3]*.85);g.fillRect(0,0,w,h);g.globalCompositeOperation='source-over'}
    ctx.drawImage(fx,0,0);
    // Front water: the near band overlaps pilings and hulls so they read as floating.
    for(let y=G.waterline;y<h;y++){const d=(y-G.waterline)/Math.max(1,h-G.waterline);ctx.fillStyle=css(P.seaNear,.32+d*.35);ctx.fillRect(0,y,w,1)}
    ctx.fillStyle=css(P.hl,.55);
    for(let x=0;x<w;x++)if(noise(x*.35,t*1.6)>.68)ctx.fillRect(x,G.waterline,1,1);
    for(const px of G.piers)if(hash(px,Math.floor(t*5))>.4){ctx.fillStyle='rgba(235,250,248,.6)';ctx.fillRect(px-2,G.waterline,1,1);ctx.fillRect(px+2,G.waterline,1,1)}
    // Daytime sparkles on the open water.
    if(P.light<.5&&Math.random()<dt*6*(P.glitter??1))glints.push({x:G.dockR+Math.floor(Math.random()*(w-G.dockR)),y:G.horizonY+2+Math.floor(Math.random()*(h-G.horizonY-3)),life:.25+Math.random()*.4});
    for(const s of glints){s.life-=dt;ctx.fillStyle='rgba(255,255,245,.9)';ctx.fillRect(s.x,s.y,1,1);if(s.life>.2){ctx.fillRect(s.x-1,s.y,3,1)}}
    for(let i=glints.length-1;i>=0;i--)if(glints[i].life<=0)glints.splice(i,1);
    // Channel buoy with its night light.
    const bx=Math.round(G.dockR+Math.max(8,(w-G.dockR)*.08)),bwy=G.waterline-2+Math.round(Math.sin(t*1.7)*.7);
    rect(ctx,'#b84a3a',bx-1,bwy-3,3,3);rect(ctx,'#e6d6b4',bx-1,bwy-1,3,1);rect(ctx,'#3c3c3c',bx,bwy-6,1,3);
    layer('surface',env);
    drawSplashes(dt);
    drawRain(dt);
    // Lights (additive): lamps, windows, lighthouse, buoy.
    if(P.light>.05){
      ctx.globalCompositeOperation='lighter';
      const flick=.92+Math.sin(t*9.1)*.03+Math.sin(t*23.3)*.03;
      for(const lx of G.lamps)glow(lx,G.apronY-15,11,.55*P.light*flick,[255,200,120]);
      if(G.aetheryte)glow(G.aetheryte.x,G.aetheryte.y-12,9,.45*P.light,[150,225,255]);
      if(G.office)glow(G.office.win[0]+1,G.office.win[1]+1,6,.5*P.light,[255,190,110]);
      for(const [lx,ly,r,a] of lights)glow(lx,ly,r,a*P.light,[255,210,130]);
      const lhx=far.islet+1,lhy=G.horizonY-14,beam=Math.cos(t*.9);
      glow(lhx,lhy,4+Math.max(0,beam)*5,(.35+Math.max(0,beam)*.55)*P.light,[255,236,170]);
      if(beam>0){const grd=ctx.createLinearGradient(lhx,lhy,lhx-40*beam,lhy);grd.addColorStop(0,'rgba(255,236,170,'+(.22*P.light*beam).toFixed(2)+')');grd.addColorStop(1,'rgba(255,236,170,0)');ctx.fillStyle=grd;ctx.fillRect(lhx-40*beam,lhy-1,40*beam,2)}
      if(Math.sin(t*1.9)>.2)glow(bx,bwy-6,3,.7*P.light,[140,255,170]);
      ctx.globalCompositeOperation='source-over';
    }
    if(G.aetheryte&&P.light<=.05){ctx.globalCompositeOperation='lighter';glow(G.aetheryte.x,G.aetheryte.y-12,6,.18,[150,225,255]);ctx.globalCompositeOperation='source-over'}
    if(events&&events.has('light')){ctx.globalCompositeOperation='lighter';events.draw('light',ctx,env);ctx.globalCompositeOperation='source-over'}
    t+=dt;
    frameMs.push(performance.now()-t0);if(frameMs.length>120)frameMs.shift();
  }
  function eventEnv(dt){
    // boatDraw is read live: events drawn after the submarines see this frame's positions.
    return {G,P,t,dt,w,h,wind,night:P.light>.55,day:P.light<.3,weather:weatherId,raining:WX.rain>.5,clear:weatherId==='clearSkies'||weatherId==='fairSkies',boats:boatsInfo(),get boatDraw(){return boatState.map(s=>s.draw||null)},
      workers:workers.map(wk=>({x:wk.x,dir:wk.dir,state:wk.state})),fisherX:G.dockR-3};
  }
  // Event layers that are not lights get the same time-of-day tint as the scene.
  function layer(name,env){
    if(!events||!events.has(name))return;
    const g=fx.getContext('2d');g.clearRect(0,0,w,h);
    events.draw(name,g,env);
    if(P.tint[3]>0){g.globalCompositeOperation='source-atop';g.fillStyle=css(P.tint,P.tint[3]*.85);g.fillRect(0,0,w,h);g.globalCompositeOperation='source-over'}
    ctx.drawImage(fx,0,0);
  }
  function glowOn(g,x,y,r,a,c){
    const grd=g.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0,'rgba('+c+','+a.toFixed(2)+')');grd.addColorStop(1,'rgba('+c+',0)');
    g.fillStyle=grd;g.fillRect(x-r,y-r,r*2,r*2);
  }
  let frozen=false;
  const sceneApi={
    sprite,rect,hash,noise,mix,hex,css,clamp,drawDigit,glow:glowOn,SHIP_COLORS,
    gust(strength,seconds){gust=strength;gustLeft=seconds},
    setBlocked,
    setHour(hourOrNull){forcedHour=hourOrNull===null?null:((hourOrNull%24)+24)%24;paletteAt=0;if(G&&!reduced())return;if(G)frame(0)},
    freeze(on){frozen=Boolean(on)},
    setWeather(id){forcedWeather=id&&WEATHER_LOOK[id]?id:null;paletteAt=0;if(G){updateWeather();const target=WEATHER_LOOK[weatherId];Object.assign(WX,target);syncClouds(0,true);staticDirty=true}},
    weather:()=>weatherId,
    redraw(){if(G)frame(0)}
  };
  const events=window.HarborEvents&&typeof window.HarborEvents.create==='function'?window.HarborEvents.create(sceneApi):null;
  // Fog: a haze over the far sea and horizon with slow drifting banks.
  const fogBanks=[];
  function drawFog(dt){
    if(WX.fog<.03)return;
    const top=G.horizonY-G.skyRows+8,grd=ctx.createLinearGradient(0,top,0,h);
    grd.addColorStop(0,'rgba(214,222,226,0)');grd.addColorStop(.35,'rgba(214,222,226,'+(.6*WX.fog).toFixed(2)+')');grd.addColorStop(1,'rgba(200,210,216,'+(.2*WX.fog).toFixed(2)+')');
    ctx.fillStyle=grd;ctx.fillRect(0,top,w,h-top);
    if(!fogBanks.length)for(let i=0;i<5;i++)fogBanks.push({x:Math.random()*w,y:G.horizonY-6+Math.random()*16,len:30+Math.random()*50,sp:.6+Math.random()});
    for(const b of fogBanks){b.x+=b.sp*wind*dt;if(b.x>w+10)b.x=-b.len;ctx.fillStyle='rgba(232,238,240,'+(.35*WX.fog).toFixed(2)+')';ctx.fillRect(Math.round(b.x),Math.round(b.y),Math.round(b.len),2)}
  }
  // Rain: slanted streaks and small rings on the water.
  const drops=[],rings=[];
  function drawRain(dt){
    if(WX.rain<.03){drops.length=0;rings.length=0;return}
    const want=Math.round(90*WX.rain*(w/360));
    const rainTop=G.horizonY-G.skyRows+6;
    while(drops.length<want)drops.push({x:Math.random()*(w+20)-10,y:rainTop+Math.random()*(h-rainTop),v:70+Math.random()*30});
    const slant=.25+wind*.12;ctx.fillStyle='rgba(205,220,232,'+(.5*WX.rain).toFixed(2)+')';
    for(const d of drops){d.y+=d.v*dt;d.x+=d.v*slant*dt;
      if(d.y>h||d.x>w+10){if(d.y>G.waterline&&rings.length<40)rings.push({x:d.x,y:G.waterline+Math.random()*(h-G.waterline-2),life:0});d.y=G.horizonY-G.skyRows+6-Math.random()*6;d.x=Math.random()*(w+20)-30}
      if(d.y>=G.horizonY-G.skyRows+6)ctx.fillRect(Math.round(d.x),Math.round(d.y),1,3);}
    for(const r of rings)r.life+=dt;
    for(let i=rings.length-1;i>=0;i--)if(rings[i].life>.5)rings.splice(i,1);
    ctx.fillStyle='rgba(220,236,240,.5)';for(const r of rings){const k=Math.round(1+r.life*4);ctx.fillRect(Math.round(r.x-k),Math.round(r.y),1,1);ctx.fillRect(Math.round(r.x+k),Math.round(r.y),1,1)}
  }
  // Return chime (only when the player has turned sound on): a soft three-note arpeggio.
  let audio=null;
  function arrived(i){
    window.dispatchEvent(new CustomEvent('harbor-submarine-arrived',{detail:{index:i}}));
    if(!prefs.sound)return;
    try{
      audio=audio||new (window.AudioContext||window.webkitAudioContext)();
      const now=audio.currentTime;
      [659.25,783.99,1046.5].forEach((f,k)=>{const o=audio.createOscillator(),gn=audio.createGain();o.type='triangle';o.frequency.value=f;
        gn.gain.setValueAtTime(0,now+k*.12);gn.gain.linearRampToValueAtTime(.08,now+k*.12+.02);gn.gain.exponentialRampToValueAtTime(.0001,now+k*.12+.6);
        o.connect(gn).connect(audio.destination);o.start(now+k*.12);o.stop(now+k*.12+.65)});
    }catch(e){}
  }
  function glow(x,y,r,a,c){
    const grd=ctx.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0,'rgba('+c+','+a.toFixed(2)+')');grd.addColorStop(1,'rgba('+c+',0)');
    ctx.fillStyle=grd;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  function loop(ts){
    raf=0;
    if(document.hidden||reduced())return;
    const dt=last?Math.min(.25,(ts-last)/1000):1/FPS;
    acc+=dt;last=ts;
    if(acc>=1/FPS){frame(frozen?0:acc);acc=0}
    raf=requestAnimationFrame(loop);
  }
  function start(){
    // Apply the scene layout first (boat size), then measure; undo if the stage has no size yet.
    dock.classList.add('has-scene');
    if(!G&&!measure()){dock.classList.remove('has-scene');return}
    if(!far.placed){placeWorkers();far.placed=true}
    buildControls();
    if(reduced()){frame(0);return}            // still image; refreshed on data updates
    if(!raf){last=0;raf=requestAnimationFrame(loop)}
  }
  function stop(){if(raf){cancelAnimationFrame(raf);raf=0}}
  /* ---------- controls: Eorzea clock, weather, housing district, sound ---------- */
  let controls=null;
  function buildControls(){
    if(controls||!window.HarborEorzea)return;
    const E=window.HarborEorzea;
    controls=document.createElement('div');
    controls.className='harbor-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','碼頭顯示設定');
    controls.innerHTML='<span class="harbor-et" aria-label="艾歐澤亞時間"></span><span class="harbor-wx"></span>'
      +'<select class="harbor-zone" aria-label="天氣依據的住宅區">'+Object.entries(E.ZONES).map(([id,z])=>'<option value="'+id+'">'+z.name+'</option>').join('')+'</select>'
      +'<button type="button" class="harbor-sound" aria-label="返航提示音"></button>';
    dock.appendChild(controls);
    controls.querySelector('.harbor-zone').addEventListener('change',e=>{prefs.zone=e.target.value;writePrefs(prefs);paletteAt=0;wxFastUntil=performance.now()+4000;syncControls();if(reduced())frame(0)});
    controls.querySelector('.harbor-sound').addEventListener('click',()=>{prefs.sound=!prefs.sound;writePrefs(prefs);syncControls()});
    syncControls();
    window.setInterval(()=>{if(!document.hidden)syncControls()},1000);
  }
  function syncControls(){
    if(!controls)return;
    const E=window.HarborEorzea,et=forcedHour!==null?{hour:Math.floor(forcedHour),minute:Math.floor(forcedHour%1*60)}:E.eorzeaTime(Date.now());
    if(!forcedWeather)updateWeather();
    controls.querySelector('.harbor-et').textContent='ET '+String(et.hour).padStart(2,'0')+':'+String(et.minute).padStart(2,'0');
    const wx=controls.querySelector('.harbor-wx');wx.textContent=E.WEATHER_NAMES[weatherId]||'';wx.dataset.weather=weatherId;
    controls.querySelector('.harbor-zone').value=prefs.zone in E.ZONES?prefs.zone:'mist';
    const snd=controls.querySelector('.harbor-sound');snd.textContent=prefs.sound?'音效 開':'音效 關';snd.setAttribute('aria-pressed',String(Boolean(prefs.sound)));
  }
  function remeasure(){if(measure()){placeWorkers();if(reduced()||document.hidden)frame(0)}}
  if(window.ResizeObserver)new ResizeObserver(()=>remeasure()).observe(dock);
  else window.addEventListener('resize',remeasure);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else start()});
  if(motion&&motion.addEventListener)motion.addEventListener('change',()=>{stop();start()});
  // Still image mode: repaint when the fleet changes.
  ['submarine-state-updated','submarine-build-state-updated','submarine-settlement-saved','submarine-data-imported','submarine-voyage-started']
    .forEach(name=>window.addEventListener(name,()=>{readBuilds();if(reduced())setTimeout(()=>frame(0),50)}));
  window.addEventListener('storage',e=>{if(e.key==='ff14_submarine_planner_v1'||e.key===null)readBuilds();if(e.key===PREFS_KEY){prefs=readPrefs();paletteAt=0;syncControls()}});
  window.setInterval(()=>{if(reduced()&&!document.hidden)frame(0)},10000);
  // Read-only diagnostics for performance checks.
  window.HarborScene={events:events?events.publicApi:null,
    time:()=>{const E=window.HarborEorzea;return {et:E?E.eorzeaTime(Date.now()):null,hour:nowHour(),weather:weatherId,zone:prefs.zone,sound:Boolean(prefs.sound),builds:builds.slice()}},
    stats:()=>{const s=frameMs.slice().sort((a,b)=>a-b);return {frames:s.length,medianMs:s[s.length>>1]||0,p95Ms:s[Math.floor(s.length*.95)]||0,artSize:[w,h]}}};
  if(document.readyState==='complete')start();else window.addEventListener('load',start);
})();
