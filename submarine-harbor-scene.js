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
  const forcedHour=(()=>{const v=parseFloat(new URLSearchParams(location.search).get('harbor-hour'));return Number.isFinite(v)?((v%24)+24)%24:null})();

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
  const nowHour=()=>{if(forcedHour!==null)return forcedHour;const d=new Date();return d.getHours()+d.getMinutes()/60};

  /* ---------- sprites (art pixels; '.' = transparent) ---------- */
  const SUB_BIG=[
    '..........pp..........',
    '..........p...........',
    '........oooooo........',
    '........oTTwTo........',
    '........oTTTTo........',
    '...oooooSSSSSSoooo....',
    '..oLLLLLLLLLLLLLLLLo..',
    '.oHHHwHHHHwHHHHwHHHHo.',
    'oHHHHHHHHHHHHHHHHHHHHo',
    'oDDDDDDDDDDDDDDDDDDDDo',
    '.oDDDDDDDDDDDDDDDDDDo.',
    '..oooooooooooooooooo..'
  ];
  const SUB_SMALL=[
    '....oo......',
    '....oTo.....',
    '.oooSSoooo..',
    'oLLLLwLLLLo.',
    'oHHHHHHHHHHo',
    '.oDDDDDDDDo.'
  ];
  const DIGITS={1:['.#.','##.','.#.','.#.','###'],2:['##.','..#','.#.','#..','###'],3:['##.','..#','.#.','..#','##.'],4:['#.#','#.#','###','..#','..#']};
  const SHIP_COLORS=['#e8b04a','#5bbfae','#e07a5f','#a493e6'];
  const BASE={o:'#1c3442',L:'#d6ece7',H:'#8db8c0',D:'#4e7b8d',T:'#a3c8cb',p:'#c9dcd6',w:'#cfe8ea'};
  const spriteCache=new Map();
  function sprite(rows,colors,flip){
    const key=rows.length+':'+JSON.stringify(colors)+':'+flip;
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
  }
  function newCloud(x){
    const parts=[],n=3+Math.floor(Math.random()*4);
    for(let i=0;i<n;i++)parts.push({dx:i*4+Math.floor(Math.random()*3),dy:Math.floor(Math.random()*3),wd:6+Math.floor(Math.random()*8),hg:2+Math.floor(Math.random()*2)});
    const top=G.horizonY-G.skyRows+6;
    return {x,y:top+Math.floor(Math.random()*Math.max(2,G.skyRows-16)),parts,speed:.4+Math.random()*.7,shade:Math.random()};
  }

  /* ---------- static structures (cached, re-lit when the palette shifts) ---------- */
  const stat=document.createElement('canvas'),fx=document.createElement('canvas');
  let staticDirty=true,staticHour=-1;
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
    // Wooden deck: planks on top, boarded face, dark beam.
    rect(g,'#d8c08e',landR,apronY-1,dockR-landR,1);rect(g,'#b99a6a',landR,apronY,dockR-landR,1);
    for(let y=apronY+1;y<quayY-1;y++)for(let x=landR;x<dockR;x++){
      const seam=(x-landR)%7===0;g.fillStyle=seam?'#6b5038':((y+(x>>3))%4===0?'#937252':'#9c7a57');g.fillRect(x,y,1,1);
    }
    rect(g,'#4a3828',landR,quayY-1,dockR-landR,2);
    // Bollards and berth plaques.
    for(let i=0;i<piers.length-1;i++){
      const cx=Math.round((piers[i]+piers[i+1])/2);
      rect(g,'#2f3337',piers[i+1]-4,apronY-3,3,2);rect(g,'#4a5056',piers[i+1]-4,apronY-3,3,1);
      rect(g,SHIP_COLORS[i],cx-3,apronY+1,7,7);rect(g,'#2e4a5a',cx-2,apronY+1,5,7);
      drawDigit(g,i+1,cx-1,apronY+2,'#efe2b8');
    }
    // Harbor office on the embankment.
    const bw=Math.min(24,landR-3),bx=1,by=apronY-15;
    if(bw>=14){
      rect(g,'#2d4650',bx-1,by-3,bw+2,3);rect(g,'#3f5f6b',bx,by-4,bw,1);
      for(let y=by;y<apronY-1;y++)for(let x=bx;x<bx+bw;x++){g.fillStyle=(y-by)%3===0?'#7fa3a4':'#91b5b2';g.fillRect(x,y,1,1)}
      rect(g,'#53413a',bx+3,apronY-8,4,7);rect(g,'#e5c578',bx+6,apronY-5,1,1);
      rect(g,'#2d4650',bx+bw-8,by+3,5,4);rect(g,'#bfe3e6',bx+bw-7,by+4,3,2);
      rect(g,'#e3aa35',bx+2,by+1,bw-4,2);
      rect(g,'#5a4a42',bx+bw-5,by-8,3,5);
      G.office={x:bx,y:by,w:bw,win:[bx+bw-7,by+4],chimney:[bx+bw-4,by-8]};
    }else G.office=null;
    // Cargo: crates, barrels, rope coil, life ring.
    const crateX=Math.round(landR+(dockR-landR)*.12);
    rect(g,'#7a5530',crateX,apronY-5,5,5);rect(g,'#a7773f',crateX+1,apronY-4,3,3);rect(g,'#7a5530',crateX+2,apronY-4,1,3);
    rect(g,'#7a5530',crateX+5,apronY-4,4,4);rect(g,'#b88848',crateX+6,apronY-3,2,2);
    rect(g,'#7a5530',crateX+2,apronY-9,4,4);rect(g,'#c09050',crateX+3,apronY-8,2,2);
    const barrelX=Math.round(landR+(dockR-landR)*.62);
    for(const dx of [0,4]){rect(g,'#6e4a2f',barrelX+dx,apronY-5,3,5);rect(g,'#9a6a40',barrelX+dx+1,apronY-5,1,5);rect(g,'#3a3a3a',barrelX+dx,apronY-4,3,1);rect(g,'#3a3a3a',barrelX+dx,apronY-2,3,1)}
    rect(g,'#c9a86b',barrelX+9,apronY-2,4,2);rect(g,'#a88a52',barrelX+10,apronY-2,2,1);
    // Lamp posts at the DOM lamp anchors (the tit perches on them).
    for(const x of lamps){rect(g,'#33464c',x,apronY-14,1,14);rect(g,'#33464c',x-1,apronY-1,3,1);rect(g,'#33464c',x-1,apronY-16,3,1);rect(g,'#d9d1a8',x-1,apronY-15,3,2)}
    // Re-light structures for the current time of day.
    if(P.tint[3]>0){g.globalCompositeOperation='source-atop';g.fillStyle=css(P.tint,P.tint[3]);g.fillRect(0,0,w,h);g.globalCompositeOperation='source-over'}
    staticDirty=false;staticHour=P.hour;
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
    const data=seaImg.data,glitX=Math.round(w*(P.hour<12?.72:.8));
    const lampRefl=P.light>.2?G.lamps:[];
    const glitter=P.light>.25||(P.hour>5.5&&P.hour<8.5)||(P.hour>16.5&&P.hour<19.5);
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
        if(sv>.95-.06*m&&m>.48)c=cHl;else if(sv<-.975&&m<.36)c=cDk;
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
    if(sunUp>=0){
      const sx=Math.round(w*(P.hour<12?.72:.8)),sy=top-1-Math.round(sunUp*8);
      ctx.fillStyle='rgba(255,226,160,.95)';ctx.fillRect(sx-2,sy-3,5,6);ctx.fillRect(sx-3,sy-2,7,4);
      ctx.fillStyle='rgba(255,246,214,.9)';ctx.fillRect(sx-1,sy-2,3,4);
      ctx.fillStyle=css(P.seaFar);ctx.fillRect(sx-4,top,9,1);
    }
    // Clouds drift with a slowly wandering wind; new ones form at random.
    const cloudCol=mix(P.skyBot,[255,255,255],P.light>.6?.08:.45),shadow=mix(cloudCol,P.skyTop,.35);
    for(const c of far.clouds){
      c.x+=c.speed*wind*dt;
      for(const p of c.parts){
        const a=clamp((c.y+p.dy-skyTop)/(G.skyRows*.5),0,1)*(P.light>.6?.55:.8);
        ctx.fillStyle=css(shadow,a);ctx.fillRect(Math.round(c.x+p.dx),c.y+p.dy+1,p.wd,p.hg);
        ctx.fillStyle=css(cloudCol,a);ctx.fillRect(Math.round(c.x+p.dx+1),c.y+p.dy,p.wd-2,p.hg);
      }
    }
    far.clouds=far.clouds.filter(c=>c.x<w+10);
    if(far.clouds.length<5&&Math.random()<dt*.04)far.clouds.push(newCloud(-30));
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
  let wind=1,windTarget=1,windTimer=0;
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
      if(r<.55){wk.target=clamp(lo+Math.random()*(hi-lo),lo,hi);wk.dir=Math.sign(wk.target-wk.x)||wk.dir;wk.state='walk'}
      else if(r<.8){wk.dir*=-1;wk.timer=1+Math.random()*3}      // glance the other way
      else{wk.state='idle';wk.timer=3+Math.random()*7}          // take a longer break
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
    // Rod and line; the bobber dips at random, sometimes landing a fish.
    fisher.timer-=dt;
    if(fisher.state==='wait'&&fisher.timer<=0){fisher.state=Math.random()<.3?'catch':'nibble';fisher.timer=fisher.state==='catch'?2.2:.9}
    else if(fisher.state!=='wait'&&fisher.timer<=0){fisher.state='wait';fisher.timer=5+Math.random()*12}
    const lift=fisher.state==='catch'?Math.min(1,(2.2-fisher.timer)/.6):0;
    const tipX=x+6,tipY=y-12+Math.round(lift*-2);
    g.fillStyle='#5a4532';for(let i=0;i<7;i++)g.fillRect(x+i,y-6-Math.round(i*.9+lift*i*.3),1,1);
    const bx=tipX+4,by=G.waterline+(fisher.state==='nibble'?Math.round(Math.sin(t*14)):0)-Math.round(lift*(G.waterline-y+6));
    g.fillStyle='rgba(225,225,215,.7)';for(let s=0;s<=10;s++){g.fillRect(Math.round(tipX+(bx-tipX)*s/10),Math.round(tipY+(by-tipY)*s/10+Math.sin(s/10*3.14)*2),1,1)}
    rect(g,lift>.5?'#9cc7d6':'#e04f3f',bx,by-1,1,lift>.5?2:1);
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
    if(st.lastX!==null)st.vx=st.vx*.8+((info.x-st.lastX)/Math.max(dt,.001))*.2;st.lastX=info.x;
    const moving=Math.abs(st.vx)>.6,atSea=info.dy<-2;
    const colors={...BASE,S:SHIP_COLORS[info.i],w:P.light>.3?'#ffd98a':BASE.w};
    const rows=info.big?SUB_BIG:SUB_SMALL,spr=sprite(rows,colors,flip);
    const wl=info.big?9.5:3.5;
    const bob=Math.round(Math.sin(t*st.f+st.ph)*(atSea?.9:.6)+Math.sin(t*st.f*2.3+st.ph2)*.4);
    const cx=Math.round(info.x),waterY=Math.round(G.waterline+info.dy+(G.big[info.i]?0:0));
    const x0=cx-Math.floor(spr.width/2),y0=waterY-Math.ceil(wl)+bob;
    // Wake and bow wave when under way; soft ripples when moored.
    if(info.sailing&&!info.awaiting){
      const dir=flip?-1:1,len=moving?8:4;
      g.fillStyle='rgba(225,247,245,.55)';
      for(let k=1;k<=len;k++){if(hash(k,Math.floor(t*6))<.35)continue;g.fillRect(cx-dir*(spr.width/2+k),waterY+Math.round(k*.25),1,1);g.fillRect(cx-dir*(spr.width/2+k),waterY-Math.round(k*.15),1,1)}
      g.fillRect(cx+dir*(spr.width/2),waterY,1,1);
    }else if(Math.sin(t*.7+st.ph)>.6){g.fillStyle='rgba(225,247,245,.35)';g.fillRect(x0-1,waterY+1,1,1);g.fillRect(x0+spr.width,waterY+1,1,1)}
    // Mooring line to the bollard when docked.
    if(!atSea&&!info.sailing){
      const bx=G.piers.find(px=>px>cx)||cx+10,by=G.apronY-3,sx=flip?x0:x0+spr.width-2,sy=y0+6;
      g.fillStyle='#c9a86b';
      for(let s=0;s<=12;s++){const tt=s/12;g.fillRect(Math.round(sx+(bx-3-sx)*tt),Math.round(sy+(by-sy)*tt+Math.sin(tt*3.14)*2),1,1)}
    }
    if(st.hover){ // selection halo
      g.globalAlpha=.9;for(const [ox,oy] of [[-1,0],[1,0],[0,-1],[0,1]])g.drawImage(sprite(rows,Object.fromEntries(Object.keys(colors).map(k=>[k,'#fff6d0'])),flip),x0+ox,y0+oy);g.globalAlpha=1;
    }
    g.drawImage(spr,x0,y0);
    // Submerged hull tint for boats out at sea (docked boats sit in the front-water band).
    if(atSea){g.fillStyle=css(P.seaFar,.55);g.fillRect(x0,waterY+1,spr.width,spr.height)}
    // Propeller blur when moving.
    if(info.sailing&&!info.awaiting&&info.big){g.fillStyle=Math.floor(t*12)%2?'#3b5a68':'#86a8b0';g.fillRect(flip?x0+spr.width:x0-1,y0+8,1,2)}
    // Pennant with the berth number.
    // Moored boats lower the mast; the berth plaque (in the boat's colour) identifies them.
    const moored=!info.sailing&&!atSea,tall=info.big&&!moored,poleX=x0+Math.floor(spr.width/2)+(flip?-1:1),poleTop=y0-(tall?8:moored?0:6);
    if(!moored){g.fillStyle='#e6e1cf';g.fillRect(poleX,poleTop,1,tall?8:6)}
    if(info.big&&(info.sailing||atSea)){
      const flag=info.awaiting?'#ff9a6b':SHIP_COLORS[info.i],flut=Math.round((Math.sin(t*3*wind+st.ph)+1)*.7);
      const fx0=flip?poleX-5:poleX+1;
      g.fillStyle=flag;g.fillRect(fx0,poleTop,5,7);g.fillStyle=css(mix(hex(flag),[0,0,0],.25));g.fillRect(flip?fx0:fx0+4,poleTop+flut+1,1,7-flut-2);
      drawDigit(g,info.i+1,fx0+1,poleTop+1,'#3a2a1c');
    }else if(!moored){
      const flut=Math.round((Math.sin(t*3*wind+st.ph)+1)*.5);
      g.fillStyle=info.awaiting?'#ff9a6b':SHIP_COLORS[info.i];g.fillRect(flip?poleX-3:poleX+1,poleTop,3,2);g.fillRect(flip?poleX-4-flut:poleX+4,poleTop+flut,1+flut,1);
    }
    // Arrived and waiting for settlement: a small bobbing "!" marker.
    if(info.awaiting){ // beside the bow when moored, above the mast at sea
      const ax=moored?(flip?x0-4:x0+spr.width+1):poleX-1,ay=(moored?y0+1:poleTop-5)+Math.round(Math.sin(t*2.4)*.8);
      g.fillStyle='#fff3c4';g.fillRect(ax,ay-1,3,5);g.fillStyle='#b5452e';g.fillRect(ax+1,ay,1,2);g.fillRect(ax+1,ay+3,1,1);
    }
    if(P.light>.3)lights.push([x0+(info.big?11:5),y0+(info.big?7:3),3,.5]);
  }

  /* ---------- frame ---------- */
  let last=0,acc=0,raf=0,t=Math.random()*100,frameMs=[],P=palette(nowHour()),paletteAt=0;
  function frame(dt){
    const t0=performance.now();
    if(performance.now()-paletteAt>30000||!paletteAt){P=palette(nowHour());paletteAt=performance.now();if(Math.abs(P.hour-staticHour)>.05)staticDirty=true}
    windTimer-=dt;if(windTimer<=0){windTarget=.4+Math.random()*1.1;windTimer=6+Math.random()*12}
    wind+=(windTarget-wind)*Math.min(1,dt*.3);
    if(staticDirty)drawStatic(P);
    ctx.clearRect(0,0,w,h);
    drawSea(P,t);
    drawSky(P,t,dt);
    ctx.drawImage(stat,0,0);
    // Actors are drawn on their own layer so the time-of-day tint applies to them too.
    const g=fx.getContext('2d'),lights=[];g.clearRect(0,0,w,h);
    for(const wk of workers){updateWorker(wk,dt);drawWorker(g,wk)}
    drawFisher(g,t,dt);drawSmoke(g,P,dt);
    for(const info of boatsInfo())if(info)drawBoat(g,lights,info,P,t,dt);
    if(P.tint[3]>0){g.globalCompositeOperation='source-atop';g.fillStyle=css(P.tint,P.tint[3]*.85);g.fillRect(0,0,w,h);g.globalCompositeOperation='source-over'}
    ctx.drawImage(fx,0,0);
    // Front water: the near band overlaps pilings and hulls so they read as floating.
    for(let y=G.waterline;y<h;y++){const d=(y-G.waterline)/Math.max(1,h-G.waterline);ctx.fillStyle=css(P.seaNear,.32+d*.35);ctx.fillRect(0,y,w,1)}
    ctx.fillStyle=css(P.hl,.55);
    for(let x=0;x<w;x++)if(noise(x*.35,t*1.6)>.68)ctx.fillRect(x,G.waterline,1,1);
    for(const px of G.piers)if(hash(px,Math.floor(t*5))>.4){ctx.fillStyle='rgba(235,250,248,.6)';ctx.fillRect(px-2,G.waterline,1,1);ctx.fillRect(px+2,G.waterline,1,1)}
    // Daytime sparkles on the open water.
    if(P.light<.5&&Math.random()<dt*6)glints.push({x:G.dockR+Math.floor(Math.random()*(w-G.dockR)),y:G.horizonY+2+Math.floor(Math.random()*(h-G.horizonY-3)),life:.25+Math.random()*.4});
    for(const s of glints){s.life-=dt;ctx.fillStyle='rgba(255,255,245,.9)';ctx.fillRect(s.x,s.y,1,1);if(s.life>.2){ctx.fillRect(s.x-1,s.y,3,1)}}
    for(let i=glints.length-1;i>=0;i--)if(glints[i].life<=0)glints.splice(i,1);
    // Channel buoy with its night light.
    const bx=Math.round(G.dockR+Math.max(8,(w-G.dockR)*.08)),bwy=G.waterline-2+Math.round(Math.sin(t*1.7)*.7);
    rect(ctx,'#b84a3a',bx-1,bwy-3,3,3);rect(ctx,'#e6d6b4',bx-1,bwy-1,3,1);rect(ctx,'#3c3c3c',bx,bwy-6,1,3);
    // Lights (additive): lamps, windows, lighthouse, buoy.
    if(P.light>.05){
      ctx.globalCompositeOperation='lighter';
      const flick=.92+Math.sin(t*9.1)*.03+Math.sin(t*23.3)*.03;
      for(const lx of G.lamps)glow(lx,G.apronY-15,11,.55*P.light*flick,[255,200,120]);
      if(G.office)glow(G.office.win[0]+1,G.office.win[1]+1,6,.5*P.light,[255,190,110]);
      for(const [lx,ly,r,a] of lights)glow(lx,ly,r,a*P.light,[255,210,130]);
      const lhx=far.islet+1,lhy=G.horizonY-14,beam=Math.cos(t*.9);
      glow(lhx,lhy,4+Math.max(0,beam)*5,(.35+Math.max(0,beam)*.55)*P.light,[255,236,170]);
      if(beam>0){const grd=ctx.createLinearGradient(lhx,lhy,lhx-40*beam,lhy);grd.addColorStop(0,'rgba(255,236,170,'+(.22*P.light*beam).toFixed(2)+')');grd.addColorStop(1,'rgba(255,236,170,0)');ctx.fillStyle=grd;ctx.fillRect(lhx-40*beam,lhy-1,40*beam,2)}
      if(Math.sin(t*1.9)>.2)glow(bx,bwy-6,3,.7*P.light,[140,255,170]);
      ctx.globalCompositeOperation='source-over';
    }
    t+=dt;
    frameMs.push(performance.now()-t0);if(frameMs.length>120)frameMs.shift();
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
    if(acc>=1/FPS){frame(acc);acc=0}
    raf=requestAnimationFrame(loop);
  }
  function start(){
    // Apply the scene layout first (boat size), then measure; undo if the stage has no size yet.
    dock.classList.add('has-scene');
    if(!G&&!measure()){dock.classList.remove('has-scene');return}
    if(!far.placed){placeWorkers();far.placed=true}
    if(reduced()){frame(0);return}            // still image; refreshed on data updates
    if(!raf){last=0;raf=requestAnimationFrame(loop)}
  }
  function stop(){if(raf){cancelAnimationFrame(raf);raf=0}}
  function remeasure(){if(measure()){placeWorkers();if(reduced()||document.hidden)frame(0)}}
  if(window.ResizeObserver)new ResizeObserver(()=>remeasure()).observe(dock);
  else window.addEventListener('resize',remeasure);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else start()});
  if(motion&&motion.addEventListener)motion.addEventListener('change',()=>{stop();start()});
  // Still image mode: repaint when the fleet changes.
  ['submarine-state-updated','submarine-build-state-updated','submarine-settlement-saved','submarine-data-imported','submarine-voyage-started']
    .forEach(name=>window.addEventListener(name,()=>{if(reduced())setTimeout(()=>frame(0),50)}));
  window.setInterval(()=>{if(reduced()&&!document.hidden)frame(0)},10000);
  // Read-only diagnostics for performance checks.
  window.HarborScene={stats:()=>{const s=frameMs.slice().sort((a,b)=>a-b);return {frames:s.length,medianMs:s[s.length>>1]||0,p95Ms:s[Math.floor(s.length*.95)]||0,artSize:[w,h]}}};
  if(document.readyState==='complete')start();else window.addEventListener('load',start);
})();
