// Fishing map: overlay fishing spots on official FFXIV map assets from XIVAPI.
(function(){
  'use strict';

  const XIVAPI='https://v2.xivapi.com/api';
  const MAP_CACHE_KEY='ff14FishingMapIndexV1';
  const MAP_CACHE_MS=30*24*60*60*1000;
  let mapIndex=null;
  let mapIndexPromise=null;

  function readStore(key,def=[]){try{return JSON.parse(localStorage.getItem(key))??def}catch{return def}}
  function catalog(){return readStore('fishCatalog',[])}
  function val(id){return document.getElementById(id)?.value||''}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function tc(v){try{return typeof ff14TcText==='function'?ff14TcText(v):String(v||'')}catch{return String(v||'')}}
  function relationName(v){return String(v?.fields?.Name??v?.Name??'').trim()}

  function ensureMap(){
    const picker=document.getElementById('fish-location-picker');
    if(!picker||document.getElementById('fish-zone-map'))return;
    const box=document.createElement('div');
    box.id='fish-zone-map';
    box.className='fish-zone-map';
    box.innerHTML='<div class="fish-map-head"><strong>釣點地圖</strong><span class="muted">選到地圖後顯示 FF14 原版地圖；點釣點可直接切換。</span></div><div id="fish-zone-map-body" class="fish-zone-map-body"><div class="muted">先選地區與地圖。</div></div>';
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

  async function fetchMapIndex(){
    if(mapIndex)return mapIndex;
    if(mapIndexPromise)return mapIndexPromise;
    mapIndexPromise=(async()=>{
      const cached=readStore(MAP_CACHE_KEY,null);
      if(cached?.ts&&cached?.rows&&Date.now()-cached.ts<MAP_CACHE_MS){mapIndex=cached.rows;return mapIndex}
      let after=null,guard=0,rows=[];
      while(guard++<10){
        const p=new URLSearchParams({fields:'Id,PlaceName.Name,PlaceNameRegion.Name,PlaceNameSub.Name',language:'en',limit:'500'});
        if(after!==null)p.set('after',String(after));
        const r=await fetch(`${XIVAPI}/sheet/Map?${p}`);if(!r.ok)throw new Error(`Map API ${r.status}`);
        const j=await r.json(),batch=Array.isArray(j.rows)?j.rows:[];if(!batch.length)break;
        rows.push(...batch.map(row=>({
          rowId:Number(row.row_id)||0,
          id:String(row.fields?.Id||''),
          place:relationName(row.fields?.PlaceName),
          region:relationName(row.fields?.PlaceNameRegion),
          sub:relationName(row.fields?.PlaceNameSub)
        })).filter(x=>x.id));
        const last=Number(batch[batch.length-1].row_id);if(!Number.isFinite(last)||last===after)break;after=last;
      }
      mapIndex=rows;
      try{localStorage.setItem(MAP_CACHE_KEY,JSON.stringify({ts:Date.now(),rows}))}catch{}
      return rows;
    })().finally(()=>{mapIndexPromise=null});
    return mapIndexPromise;
  }

  async function resolveMapId(zone){
    if(!zone)return '';
    const rows=await fetchMapIndex();
    const exact=rows.find(x=>x.place===zone)||rows.find(x=>x.sub===zone);
    if(exact)return exact.id;
    const needle=zone.toLowerCase();
    const loose=rows.find(x=>x.place.toLowerCase()===needle||x.sub.toLowerCase()===needle);
    return loose?.id||'';
  }

  function mapAssetUrl(mapId){
    const m=String(mapId||'').match(/^([^/]+)\/(\d{2})$/);if(!m)return '';
    return `${XIVAPI}/asset/map/${encodeURIComponent(m[1])}/${encodeURIComponent(m[2])}`;
  }

  // FFXIV field map coordinates normally occupy roughly 0–42 on both axes.
  // Keep values clamped so bad/missing data cannot place markers outside the map.
  function coordPct(n){return Math.max(0,Math.min(100,(Number(n)/42)*100))}

  function renderFallback(body,region,zone,spots){
    const plotted=spots.filter(s=>Number.isFinite(s.x)&&Number.isFinite(s.y));
    if(!plotted.length){
      body.innerHTML=`<div class="muted">${esc(tc(zone))} 的釣點資料沒有座標；先用下方按鈕選擇。</div><div class="fish-map-fallback">${spots.map(s=>`<button type="button" data-map-spot="${esc(s.name)}">${esc(tc(s.name))} <span>${s.fish}</span></button>`).join('')}</div>`;
      bindSpotButtons(body);return;
    }
    const W=760,H=420,P=34;
    let minX=Math.min(...plotted.map(s=>s.x)),maxX=Math.max(...plotted.map(s=>s.x)),minY=Math.min(...plotted.map(s=>s.y)),maxY=Math.max(...plotted.map(s=>s.y));
    if(minX===maxX){minX-=1;maxX+=1}if(minY===maxY){minY-=1;maxY+=1}
    const padX=(maxX-minX)*.14,padY=(maxY-minY)*.14;minX-=padX;maxX+=padX;minY-=padY;maxY+=padY;
    const sx=x=>P+(x-minX)/(maxX-minX)*(W-P*2),sy=y=>H-P-(y-minY)/(maxY-minY)*(H-P*2);
    const circles=plotted.map(s=>`<g class="fish-map-point" data-map-spot="${esc(s.name)}" tabindex="0" role="button"><circle cx="${sx(s.x).toFixed(1)}" cy="${sy(s.y).toFixed(1)}" r="10"></circle><text x="${(sx(s.x)+14).toFixed(1)}" y="${(sy(s.y)+5).toFixed(1)}">${esc(tc(s.name))}</text></g>`).join('');
    body.innerHTML=`<div class="fish-map-title">${esc(tc(region))} / <strong>${esc(tc(zone))}</strong> · ${spots.length} 個釣點</div><div class="fish-map-scroll"><svg class="fish-map-svg" viewBox="0 0 ${W} ${H}"><rect x="1" y="1" width="${W-2}" height="${H-2}" rx="12"></rect>${circles}</svg></div><div class="muted fish-map-note">找不到原版地圖素材，暫時使用座標示意圖。</div>`;
    bindSpotButtons(body);
  }

  async function renderMap(){
    ensureMap();
    const body=document.getElementById('fish-zone-map-body');if(!body)return;
    const region=val('fish-picker-region'),zone=val('fish-picker-zone'),selected=val('fish-picker-spot');
    if(!zone){body.innerHTML='<div class="muted">先選地區與地圖。</div>';return}
    const spots=groupedSpots(region,zone);
    if(!spots.length){body.innerHTML='<div class="muted">這張地圖沒有可顯示的釣點。</div>';return}
    const token=`${region}|||${zone}`;body.dataset.renderToken=token;
    body.innerHTML=`<div class="muted">正在載入 ${esc(tc(zone))} 原版地圖…</div>`;
    let mapId='';try{mapId=await resolveMapId(zone)}catch(e){console.warn('map id lookup failed',e)}
    if(body.dataset.renderToken!==token)return;
    const url=mapAssetUrl(mapId);
    if(!url){renderFallback(body,region,zone,spots);return}

    const plotted=spots.filter(s=>Number.isFinite(s.x)&&Number.isFinite(s.y));
    const markers=plotted.map(s=>{
      const left=coordPct(s.x),top=coordPct(s.y),sel=s.name===selected?' selected':'';
      return `<button type="button" class="ff14-map-marker${sel}" data-map-spot="${esc(s.name)}" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%" title="${esc(tc(s.name))} · X ${s.x.toFixed(1)} Y ${s.y.toFixed(1)} · ${s.fish} 種"><span class="ff14-map-dot"></span><span class="ff14-map-label">${esc(tc(s.name))}</span></button>`;
    }).join('');
    body.innerHTML=`<div class="fish-map-title">${esc(tc(region))} / <strong>${esc(tc(zone))}</strong> · ${spots.length} 個釣點</div><div class="ff14-map-wrap"><img class="ff14-map-image" src="${esc(url)}" alt="${esc(tc(zone))} FF14 地圖"><div class="ff14-map-markers">${markers}</div></div><div class="muted fish-map-note">底圖：FF14 遊戲地圖素材（由 XIVAPI 合成）；圓點為魚圖鑑釣點座標。</div>`;
    const img=body.querySelector('.ff14-map-image');if(img)img.addEventListener('error',()=>renderFallback(body,region,zone,spots),{once:true});
    bindSpotButtons(body);
  }

  function chooseSpot(name){
    const spot=document.getElementById('fish-picker-spot');
    if(spot&&[...spot.options].some(o=>o.value===name)){spot.value=name;spot.dispatchEvent(new Event('change',{bubbles:true}))}
    else{const q=document.getElementById('fish-search');if(q){q.value=name;q.dispatchEvent(new Event('input',{bubbles:true}))}}
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
      .fish-map-head{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:10px}.fish-map-title{margin-bottom:8px}
      .ff14-map-wrap{position:relative;width:min(100%,760px);margin:auto;border:1px solid var(--border,#d8d8df);border-radius:12px;overflow:hidden;background:#222}
      .ff14-map-image{display:block;width:100%;height:auto}.ff14-map-markers{position:absolute;inset:0;pointer-events:none}
      .ff14-map-marker{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;border:0;background:transparent;padding:0;display:flex;align-items:center;gap:5px;cursor:pointer;z-index:2}
      .ff14-map-dot{width:15px;height:15px;border-radius:50%;background:#fff;border:3px solid #222;box-shadow:0 1px 4px rgba(0,0,0,.65);flex:0 0 auto}
      .ff14-map-label{font-weight:700;font-size:12px;white-space:nowrap;color:#fff;text-shadow:-1px -1px 2px #000,1px -1px 2px #000,-1px 1px 2px #000,1px 1px 2px #000}
      .ff14-map-marker.selected .ff14-map-dot{width:20px;height:20px}.ff14-map-marker:focus-visible{outline:2px solid currentColor;outline-offset:3px;border-radius:4px}
      .fish-map-scroll{overflow:auto;border:1px solid var(--border,#d8d8df);border-radius:12px;background:rgba(127,127,127,.04)}.fish-map-svg{display:block;width:100%;min-width:620px;height:auto}.fish-map-point{cursor:pointer}.fish-map-point circle{fill:currentColor;opacity:.65;stroke:Canvas;stroke-width:3}.fish-map-point text{font-size:13px;fill:currentColor;paint-order:stroke;stroke:Canvas;stroke-width:3px}.fish-map-note{margin-top:7px}.fish-map-fallback{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.fish-map-fallback button span{opacity:.6;margin-left:5px}
      @media(max-width:760px){.ff14-map-label{font-size:11px}.ff14-map-dot{width:13px;height:13px}.fish-map-svg{min-width:560px}}
    `;document.head.appendChild(s);
  }

  window.addEventListener('DOMContentLoaded',()=>{
    addStyles();setTimeout(()=>{ensureMap();renderMap()},300);
    document.addEventListener('change',e=>{if(['fish-picker-region','fish-picker-zone','fish-picker-spot'].includes(e.target?.id))setTimeout(renderMap,0)});
    const target=document.getElementById('fish-catalog');if(target)new MutationObserver(()=>{clearTimeout(window.__fishMapTimer);window.__fishMapTimer=setTimeout(renderMap,100)}).observe(target,{childList:true,subtree:true});
  });
})();
