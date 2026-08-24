// Simple fishing map: plot fishing spots in the selected zone using catalog X/Y data.
(function(){
  'use strict';

  function readStore(key,def=[]){try{return JSON.parse(localStorage.getItem(key))??def}catch{return def}}
  function catalog(){return readStore('fishCatalog',[])}
  function val(id){return document.getElementById(id)?.value||''}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function tc(v){try{return typeof ff14TcText==='function'?ff14TcText(v):String(v||'')}catch{return String(v||'')}}

  function ensureMap(){
    const picker=document.getElementById('fish-location-picker');
    if(!picker||document.getElementById('fish-zone-map'))return;
    const box=document.createElement('div');
    box.id='fish-zone-map';
    box.className='fish-zone-map';
    box.innerHTML='<div class="fish-map-head"><strong>釣點地圖</strong><span class="muted">先選到「地圖」，就會把這張圖的釣點畫出來；點圓點可直接切到該釣場。</span></div><div id="fish-zone-map-body" class="fish-zone-map-body"><div class="muted">先選地區與地圖。</div></div>';
    picker.appendChild(box);
  }

  function groupedSpots(region,zone){
    const rows=catalog().filter(x=>(!region||x.regionName===region)&&x.zoneName===zone);
    const by=new Map();
    for(const x of rows){
      const key=`${x.spotId}|||${x.spotName}`;
      if(!by.has(key))by.set(key,{spotId:Number(x.spotId)||0,name:x.spotName,x:Number(x.x),y:Number(x.y),fish:0});
      const s=by.get(key);s.fish++;
      if(!Number.isFinite(s.x)&&Number.isFinite(Number(x.x)))s.x=Number(x.x);
      if(!Number.isFinite(s.y)&&Number.isFinite(Number(x.y)))s.y=Number(x.y);
    }
    return [...by.values()];
  }

  function renderMap(){
    ensureMap();
    const body=document.getElementById('fish-zone-map-body');if(!body)return;
    const region=val('fish-picker-region'),zone=val('fish-picker-zone'),selected=val('fish-picker-spot');
    if(!zone){body.innerHTML='<div class="muted">先選地區與地圖。</div>';return}
    const spots=groupedSpots(region,zone);
    if(!spots.length){body.innerHTML='<div class="muted">這張地圖沒有可顯示的釣點。</div>';return}

    const plotted=spots.filter(s=>Number.isFinite(s.x)&&Number.isFinite(s.y));
    if(!plotted.length){
      body.innerHTML=`<div class="muted">${esc(tc(zone))} 的釣點資料沒有座標；先用下方按鈕選擇。</div><div class="fish-map-fallback">${spots.map(s=>`<button type="button" data-map-spot="${esc(s.name)}">${esc(tc(s.name))} <span>${s.fish}</span></button>`).join('')}</div>`;
      bindSpotButtons(body);return;
    }

    let minX=Math.min(...plotted.map(s=>s.x)),maxX=Math.max(...plotted.map(s=>s.x)),minY=Math.min(...plotted.map(s=>s.y)),maxY=Math.max(...plotted.map(s=>s.y));
    if(minX===maxX){minX-=1;maxX+=1}if(minY===maxY){minY-=1;maxY+=1}
    const padX=(maxX-minX)*0.14,padY=(maxY-minY)*0.14;minX-=padX;maxX+=padX;minY-=padY;maxY+=padY;
    const W=760,H=420,P=34;
    const sx=x=>P+(x-minX)/(maxX-minX)*(W-P*2);
    const sy=y=>H-P-(y-minY)/(maxY-minY)*(H-P*2);
    const circles=plotted.map((s,i)=>{
      const x=sx(s.x),y=sy(s.y),sel=s.name===selected?' selected':'';
      return `<g class="fish-map-point${sel}" data-map-spot="${esc(s.name)}" tabindex="0" role="button" aria-label="${esc(tc(s.name))}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10"></circle><text x="${(x+14).toFixed(1)}" y="${(y+5).toFixed(1)}">${esc(tc(s.name))}</text><title>${esc(tc(s.name))} · X ${s.x.toFixed(1)} Y ${s.y.toFixed(1)} · ${s.fish} 種</title></g>`;
    }).join('');
    const grid=[0,1,2,3,4].map(i=>{const x=P+i*(W-P*2)/4,y=P+i*(H-P*2)/4;return `<line x1="${x}" y1="${P}" x2="${x}" y2="${H-P}"></line><line x1="${P}" y1="${y}" x2="${W-P}" y2="${y}"></line>`}).join('');
    body.innerHTML=`<div class="fish-map-title">${esc(tc(region))} / <strong>${esc(tc(zone))}</strong> · ${spots.length} 個釣點</div><div class="fish-map-scroll"><svg class="fish-map-svg" viewBox="0 0 ${W} ${H}" aria-label="${esc(tc(zone))} 釣點示意地圖"><rect x="1" y="1" width="${W-2}" height="${H-2}" rx="12"></rect><g class="fish-map-grid">${grid}</g>${circles}</svg></div><div class="muted fish-map-note">依遊戲資料 X/Y 畫出的釣點位置示意；不是遊戲原版地圖貼圖。</div>`;
    bindSpotButtons(body);
  }

  function chooseSpot(name){
    const spot=document.getElementById('fish-picker-spot');
    if(spot&&[...spot.options].some(o=>o.value===name)){
      spot.value=name;
      spot.dispatchEvent(new Event('change',{bubbles:true}));
    }else{
      const q=document.getElementById('fish-search');if(q){q.value=name;q.dispatchEvent(new Event('input',{bubbles:true}))}
    }
    renderMap();
  }
  function bindSpotButtons(root){
    root.querySelectorAll('[data-map-spot]').forEach(el=>{
      const go=()=>chooseSpot(el.dataset.mapSpot);
      el.addEventListener('click',go);
      el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}});
    });
  }

  function addStyles(){
    if(document.getElementById('fish-zone-map-style'))return;
    const s=document.createElement('style');s.id='fish-zone-map-style';s.textContent=`
      .fish-zone-map{margin-top:14px;padding-top:14px;border-top:1px solid var(--border,#d8d8df)}
      .fish-map-head{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:10px}
      .fish-map-body{min-width:0}.fish-map-title{margin-bottom:8px}
      .fish-map-scroll{overflow:auto;border:1px solid var(--border,#d8d8df);border-radius:12px;background:rgba(127,127,127,.04)}
      .fish-map-svg{display:block;width:100%;min-width:620px;height:auto}
      .fish-map-svg>rect{fill:transparent;stroke:transparent}
      .fish-map-grid line{stroke:currentColor;opacity:.08;stroke-width:1}
      .fish-map-point{cursor:pointer}.fish-map-point circle{fill:currentColor;opacity:.65;stroke:Canvas;stroke-width:3}
      .fish-map-point text{font-size:13px;fill:currentColor;paint-order:stroke;stroke:Canvas;stroke-width:3px;stroke-linejoin:round}
      .fish-map-point.selected circle{opacity:1;r:13}.fish-map-point:focus{outline:none}.fish-map-point:focus circle{stroke-width:5}
      .fish-map-note{margin-top:7px}.fish-map-fallback{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.fish-map-fallback button span{opacity:.6;margin-left:5px}
      @media(max-width:760px){.fish-map-svg{min-width:560px}}
    `;document.head.appendChild(s);
  }

  window.addEventListener('DOMContentLoaded',()=>{
    addStyles();
    setTimeout(()=>{ensureMap();renderMap()},300);
    document.addEventListener('change',e=>{if(['fish-picker-region','fish-picker-zone','fish-picker-spot'].includes(e.target?.id))setTimeout(renderMap,0)});
    const target=document.getElementById('fish-catalog');
    if(target)new MutationObserver(()=>{clearTimeout(window.__fishMapTimer);window.__fishMapTimer=setTimeout(renderMap,100)}).observe(target,{childList:true,subtree:true});
  });
})();
