// Fishing map: overlay fishing spots on official FFXIV map assets from XIVAPI.
(function(){
  'use strict';
  let renderTimer=0,catalogObserver=null;

  const XIVAPI='https://v2.xivapi.com/api';
  const MAP_CACHE_KEY='ff14FishingMapIndexV3';
  const MAP_CACHE_MS=30*24*60*60*1000;
  let mapIndex=null;
  let mapIndexPromise=null;

  function readStore(key,def=[]){try{return JSON.parse(localStorage.getItem(key))??def}catch{return def}}
  function catalog(){return window.FF14Fishing?window.FF14Fishing.catalog():readStore('fishCatalog',[])}
  function catalogLocations(){const rows=catalog();if(typeof window.expandFishLocations==='function')return window.expandFishLocations(rows);const out=[];for(const fish of rows){const spots=Array.isArray(fish?.spots)&&fish.spots.length?fish.spots:[fish];spots.forEach(loc=>out.push({...fish,...loc}))}return out}
  function val(id){return document.getElementById(id)?.value||''}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function tc(v){try{return typeof ff14TcText==='function'?ff14TcText(v):String(v||'')}catch{return String(v||'')}}
  function relationName(v){return String(v?.fields?.Name??v?.Name??'').trim()}
  function norm(v){return String(v||'').trim().toLowerCase()}
  function refreshSessionOverlay(){try{if(typeof window.refreshFishingSessionRouteMap==='function')queueMicrotask(()=>window.refreshFishingSessionRouteMap())}catch(e){console.warn('session route map refresh failed',e)}}

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
    const rows=catalogLocations().filter(x=>(!region||x.regionName===region)&&x.zoneName===zone);
    const by=new Map();
    for(const x of rows){
      const key=`${x.spotId}|||${x.spotName}`;
      if(!by.has(key))by.set(key,{spotId:Number(x.spotId)||0,name:x.spotName,x:Number.isFinite(Number(x.x))?Number(x.x):null,y:Number.isFinite(Number(x.y))?Number(x.y):null,fish:0,fishIds:new Set()});
      const s=by.get(key);s.fishIds.add(`${x.type||'fish'}:${Number(x.itemId)||0}`);s.fish=s.fishIds.size;
      if(s.x===null&&Number.isFinite(Number(x.x)))s.x=Number(x.x);
      if(s.y===null&&Number.isFinite(Number(x.y)))s.y=Number(x.y);
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
        const p=new URLSearchParams({fields:'Id,SizeFactor,PlaceName.Name,PlaceNameRegion.Name,PlaceNameSub.Name',language:'en',limit:'500'});
        if(after!==null)p.set('after',String(after));
        const r=await fetch(`${XIVAPI}/sheet/Map?${p}`);if(!r.ok)throw new Error(`Map API ${r.status}`);
        const j=await r.json(),batch=Array.isArray(j.rows)?j.rows:[];if(!batch.length)break;
        rows.push(...batch.map(row=>({
          rowId:Number(row.row_id)||0,
          id:String(row.fields?.Id||''),
          sizeFactor:Number(row.fields?.SizeFactor)||100,
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

  function mapCandidateScore(row,zone,hints=[]){
    let score=0;
    const id=String(row.id||''),hintSet=new Set((hints||[]).map(norm).filter(Boolean));
    if(row.place===zone)score+=100;
    if(row.sub===zone)score+=70;
    if(hintSet.has(norm(row.sub)))score+=300;
    if(hintSet.has(norm(row.place)))score+=220;
    if(/^[a-z0-9]+f\d+\/\d{2}$/i.test(id))score+=80;
    else if(/[a-z0-9]f\d+\/\d{2}$/i.test(id))score+=60;
    if(/\/00$/i.test(id))score+=20;
    if(/^[a-z0-9]+(?:w|t|m)\d+\/\d{2}$/i.test(id))score-=35;
    return score;
  }

  async function resolveMapRecord(zone,hints=[]){
    if(!zone)return null;
    const rows=await fetchMapIndex();
    const needle=norm(zone);
    const candidates=rows.filter(x=>x.place===zone||x.sub===zone||norm(x.place)===needle||norm(x.sub)===needle);
    if(!candidates.length)return null;
    candidates.sort((a,b)=>mapCandidateScore(b,zone,hints)-mapCandidateScore(a,zone,hints)||a.rowId-b.rowId);
    return candidates[0]||null;
  }

  function mapAssetUrl(mapId){
    const m=String(mapId||'').match(/^([^/]+)\/(\d{2})$/);if(!m)return '';
    return `${XIVAPI}/asset/map/${encodeURIComponent(m[1])}/${encodeURIComponent(m[2])}`;
  }

  function coordPct(n){return Math.max(0,Math.min(100,(Number(n)/2048)*100))}
  function gameCoordPct(n,sizeFactor){const coord=Number(n),factor=Number(sizeFactor)||100;if(!Number.isFinite(coord))return null;return coordPct((coord-1)*factor/2)}

  function spotButtons(spots){return `<div class="fish-map-fallback">${spots.map(s=>`<button type="button" data-map-spot="${esc(s.name)}">${esc(tc(s.name))} <span>${s.fish}</span></button>`).join('')}</div>`}

  function renderFallback(body,region,zone,spots,note='找不到原版地圖素材，暫時使用座標示意圖。'){
    const plotted=spots.filter(s=>Number.isFinite(s.x)&&Number.isFinite(s.y));
    if(!plotted.length){body.innerHTML=`<div class="muted">${esc(tc(zone))} 的釣點資料沒有可用座標；可直接用下面的釣場按鈕。</div>${spotButtons(spots)}`;bindSpotButtons(body);refreshSessionOverlay();return}
    const W=760,H=420,P=34;
    let minX=Math.min(...plotted.map(s=>s.x)),maxX=Math.max(...plotted.map(s=>s.x)),minY=Math.min(...plotted.map(s=>s.y)),maxY=Math.max(...plotted.map(s=>s.y));
    if(minX===maxX){minX-=1;maxX+=1}if(minY===maxY){minY-=1;maxY+=1}
    const padX=(maxX-minX)*.14,padY=(maxY-minY)*.14;minX-=padX;maxX+=padX;minY-=padY;maxY+=padY;
    const sx=x=>P+(x-minX)/(maxX-minX)*(W-P*2),sy=y=>H-P-(y-minY)/(maxY-minY)*(H-P*2);
    const circles=plotted.map(s=>`<g class="fish-map-point" data-map-spot="${esc(s.name)}" tabindex="0" role="button"><circle cx="${sx(s.x).toFixed(1)}" cy="${sy(s.y).toFixed(1)}" r="10"></circle><text x="${(sx(s.x)+14).toFixed(1)}" y="${(sy(s.y)+5).toFixed(1)}">${esc(tc(s.name))}</text></g>`).join('');
    body.innerHTML=`<div class="fish-map-title">${esc(tc(region))} / <strong>${esc(tc(zone))}</strong> · ${spots.length} 個釣點</div><div class="fish-map-scroll"><svg class="fish-map-svg" viewBox="0 0 ${W} ${H}"><rect x="1" y="1" width="${W-2}" height="${H-2}" rx="12"></rect>${circles}</svg></div><div class="muted fish-map-note">${esc(note)}</div>${spotButtons(spots)}`;
    bindSpotButtons(body);refreshSessionOverlay();
  }

  // 地圖放大到釣點範圍：回傳以整張地圖為 0–100 的裁切框。
  const ZOOM_KEY='fishMapFitSpots';
  function zoomPref(){try{return localStorage.getItem(ZOOM_KEY)!=='0'}catch{return true}}
  function setZoomPref(on){try{localStorage.setItem(ZOOM_KEY,on?'1':'0')}catch{}}
  function fitBox(points){
    if(!points.length)return null;
    let x0=Math.min(...points.map(p=>p.x)),x1=Math.max(...points.map(p=>p.x)),y0=Math.min(...points.map(p=>p.y)),y1=Math.max(...points.map(p=>p.y));
    const PAD=9,MIN=34;
    x0-=PAD;x1+=PAD;y0-=PAD;y1+=PAD;
    const grow=(a,b,min)=>{const d=b-a;if(d>=min)return[a,b];const m=(min-d)/2;return[a-m,b+m]};
    [x0,x1]=grow(x0,x1,MIN);[y0,y1]=grow(y0,y1,MIN);
    // 長寬比限制在 0.75–1.6，太扁或太高就補另一邊
    let w=x1-x0,h=y1-y0;
    if(w/h>1.6)[y0,y1]=grow(y0,y1,w/1.6);else if(w/h<.75)[x0,x1]=grow(x0,x1,h*.75);
    const clamp=(a,b)=>{const d=Math.min(100,b-a);let s=Math.max(0,Math.min(100-d,a));return[s,s+d]};
    [x0,x1]=clamp(x0,x1);[y0,y1]=clamp(y0,y1);
    w=x1-x0;h=y1-y0;
    if(w>82&&h>82)return null; // 放大不到 1.2 倍就直接看全圖
    return{x0,y0,w,h};
  }
  function applyZoom(body){
    const wrap=body.querySelector('.ff14-map-wrap'),canvas=wrap?.querySelector('.ff14-map-canvas'),btn=body.querySelector('[data-map-zoom]');
    if(!wrap||!canvas)return;
    let box=null;try{box=JSON.parse(wrap.dataset.fit||'null')}catch{}
    const on=!!box&&zoomPref();
    if(on){
      wrap.style.aspectRatio=`${box.w} / ${box.h}`;
      Object.assign(canvas.style,{width:`${10000/box.w}%`,height:`${10000/box.h}%`,left:`${-box.x0/box.w*100}%`,top:`${-box.y0/box.h*100}%`});
    }else{
      wrap.style.aspectRatio='1 / 1';
      Object.assign(canvas.style,{width:'100%',height:'100%',left:'0',top:'0'});
    }
    wrap.classList.toggle('is-zoomed',on);
    if(btn){btn.hidden=!box;btn.textContent=on?'顯示全圖':'放大到釣點';btn.setAttribute('aria-pressed',on?'true':'false')}
  }
  // 名稱互相壓到時，依序改放右、左、上、下。
  function rectsOverlap(a,b){return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top}
  function declutterLabels(root){
    const layer=root?.querySelector?.('.ff14-map-markers');if(!layer)return;
    const markers=[...layer.querySelectorAll('.ff14-map-marker')];
    markers.sort((a,b)=>(b.classList.contains('session-route')?1:0)-(a.classList.contains('session-route')?1:0));
    const sides=['label-right','label-left','label-top','label-bottom'];
    const taken=markers.map(m=>(m.querySelector('.ff14-route-orders')||m.querySelector('.ff14-map-dot')||m).getBoundingClientRect());
    const view=(layer.closest('.ff14-map-wrap')||layer).getBoundingClientRect();
    const inside=r=>r.left>=view.left+2&&r.right<=view.right-2&&r.top>=view.top+2&&r.bottom<=view.bottom-2;
    for(const m of markers){
      const label=m.querySelector('.ff14-map-label');if(!label)continue;
      let chosen=sides[0];
      for(const side of sides){
        m.classList.remove(...sides);m.classList.add(side);
        const r=label.getBoundingClientRect();
        if(inside(r)&&!taken.some(t=>rectsOverlap(r,t))){chosen=side;break}
      }
      m.classList.remove(...sides);m.classList.add(chosen);
      taken.push(label.getBoundingClientRect());
    }
  }
  window.ff14DeclutterMapLabels=()=>declutterLabels(document.getElementById('fish-zone-map-body'));

  async function renderMap(){
    ensureMap();
    const body=document.getElementById('fish-zone-map-body');if(!body)return;
    const region=val('fish-picker-region'),zone=val('fish-picker-zone'),selected=val('fish-picker-spot');
    if(!zone){body.innerHTML='<div class="muted">先選地區與地圖。</div>';refreshSessionOverlay();return}
    const spots=groupedSpots(region,zone);
    if(!spots.length){body.innerHTML='<div class="muted">這張地圖沒有可顯示的釣點。</div>';refreshSessionOverlay();return}
    const token=`${region}|||${zone}`;body.dataset.renderToken=token;
    body.innerHTML=`<div class="muted">正在載入 ${esc(tc(zone))} 原版地圖…</div>`;
    let map=null;try{map=await resolveMapRecord(zone,spots.map(s=>s.name))}catch(e){console.warn('map id lookup failed',e)}
    if(body.dataset.renderToken!==token)return;
    const mapId=map?.id||'',url=mapAssetUrl(mapId);
    if(!url){renderFallback(body,region,zone,spots);return}

    const plotted=spots.filter(s=>Number.isFinite(s.x)&&Number.isFinite(s.y)&&s.x>0&&s.y>0);
    const markers=plotted.map(s=>{const left=coordPct(s.x),top=coordPct(s.y),sel=s.name===selected?' selected':'';return `<button type="button" class="ff14-map-marker label-right${sel}" data-map-spot="${esc(s.name)}" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%" title="${esc(tc(s.name))} · X ${s.x.toFixed(0)} Z ${s.y.toFixed(0)} · ${s.fish} 種"><span class="ff14-map-dot"></span><span class="ff14-map-label">${esc(tc(s.name))}</span></button>`}).join('');
    const fit=fitBox(plotted.map(s=>({x:coordPct(s.x),y:coordPct(s.y)})));
    const noCoords=!plotted.length?`<div class="muted fish-map-warning">這批釣點目前沒有可用 X/Z，所以先顯示釣場按鈕。</div>${spotButtons(spots)}`:'';
    body.innerHTML=`<div class="fish-map-title"><span>${esc(tc(region))} / <strong>${esc(tc(zone))}</strong> · ${spots.length} 個釣點</span><button type="button" class="fish-map-zoom" data-map-zoom hidden>顯示全圖</button></div><div class="ff14-map-wrap" data-fit="${esc(JSON.stringify(fit))}"><div class="ff14-map-canvas"><img class="ff14-map-image" src="${esc(url)}" alt="${esc(tc(zone))} FF14 地圖"><div class="ff14-map-markers">${markers}</div></div></div><div class="muted fish-map-note">底圖：FF14 遊戲地圖素材（XIVAPI） · Map.Id: <code>${esc(mapId)}</code> · 釣點：${plotted.length}/${spots.length}</div>${noCoords}`;
    const img=body.querySelector('.ff14-map-image');if(img){img.addEventListener('error',()=>renderFallback(body,region,zone,spots,`Map.Id ${mapId} 圖片載入失敗。`),{once:true});img.addEventListener('load',()=>{declutterLabels(body);refreshSessionOverlay()},{once:true})}
    applyZoom(body);
    body.querySelector('[data-map-zoom]')?.addEventListener('click',()=>{setZoomPref(!zoomPref());applyZoom(body);requestAnimationFrame(()=>{declutterLabels(body);refreshSessionOverlay()})});
    bindSpotButtons(body);declutterLabels(body);refreshSessionOverlay();
  }

  function ensureNpcMapDialog(){
    let dialog=document.getElementById('ff14-npc-map-dialog');if(dialog)return dialog;
    dialog=document.createElement('dialog');dialog.id='ff14-npc-map-dialog';dialog.className='ff14-npc-map-dialog';dialog.innerHTML='<div class="ff14-npc-map-head"><strong id="ff14-npc-map-title">NPC 地圖</strong><button type="button" data-npc-map-close aria-label="關閉">×</button></div><div id="ff14-npc-map-body" class="ff14-npc-map-body"></div>';document.body.appendChild(dialog);
    dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});dialog.querySelector('[data-npc-map-close]').addEventListener('click',()=>dialog.close());return dialog;
  }

  function parseVisibleCoords(coords){if(Array.isArray(coords)&&coords.length>=2)return [Number(coords[0]),Number(coords[1])];if(coords&&typeof coords==='object')return [Number(coords.x??coords.X),Number(coords.y??coords.Y)];const nums=String(coords||'').match(/-?\d+(?:\.\d+)?/g)||[];return [Number(nums[0]),Number(nums[1])]}

  async function openNpcMap(zone,coords,label='NPC',area=''){
    const dialog=ensureNpcMapDialog(),body=document.getElementById('ff14-npc-map-body'),title=document.getElementById('ff14-npc-map-title'),[x,y]=parseVisibleCoords(coords),zoneLabel=tc(zone)||zone;
    title.textContent=`${label} · ${zoneLabel}`;body.innerHTML=`<div class="muted">正在載入 ${esc(zoneLabel)} 地圖…</div>`;if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();else dialog.setAttribute('open','');
    if(!zone||!Number.isFinite(x)||!Number.isFinite(y)){body.innerHTML='<div class="muted">這個 NPC 沒有足夠的地圖座標資料。</div>';return}
    let map=null;try{map=await resolveMapRecord(zone,[area])}catch(e){console.warn('NPC map lookup failed',e)}
    if(!map){body.innerHTML=`<div class="muted">找不到 ${esc(zoneLabel)} 對應的 FF14 地圖。</div>`;return}
    const url=mapAssetUrl(map.id);if(!url){body.innerHTML='<div class="muted">這張地圖沒有可用的底圖素材。</div>';return}
    const left=gameCoordPct(x,map.sizeFactor),top=gameCoordPct(y,map.sizeFactor);if(left===null||top===null){body.innerHTML='<div class="muted">NPC 座標格式無法辨識。</div>';return}
    body.innerHTML=`<div class="fish-map-title"><strong>${esc(zoneLabel)}</strong> · ${esc(label)} · X/Y ${esc(x.toFixed(1))}, ${esc(y.toFixed(1))}</div><div class="ff14-map-wrap ff14-npc-map-wrap"><img class="ff14-map-image" src="${esc(url)}" alt="${esc(zoneLabel)} FF14 地圖"><div class="ff14-map-markers"><div class="ff14-map-marker ff14-npc-map-marker" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%"><span class="ff14-map-dot"></span><span class="ff14-map-label">${esc(label)}</span></div></div></div><div class="muted fish-map-note">Map.Id: <code>${esc(map.id)}</code> · X/Y ${esc(x.toFixed(1))}, ${esc(y.toFixed(1))}</div><div class="muted fish-map-note">地圖僅供區域參考，請在標點周圍尋找一下。</div>`;
    const img=body.querySelector('.ff14-map-image');if(img)img.addEventListener('error',()=>{body.innerHTML='<div class="muted">FF14 地圖圖片載入失敗。</div>'},{once:true});
  }

  function chooseSpot(name){const spot=document.getElementById('fish-picker-spot');if(spot&&[...spot.options].some(o=>o.value===name)){spot.value=name;spot.dispatchEvent(new Event('change',{bubbles:true}))}else{const q=document.getElementById('fish-search');if(q){q.value=name;q.dispatchEvent(new Event('input',{bubbles:true}))}}renderMap()}
  function bindSpotButtons(root){root.querySelectorAll('[data-map-spot]').forEach(el=>{const go=()=>chooseSpot(el.dataset.mapSpot);el.addEventListener('click',go);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}})})}

  function addStyles(){
    if(document.getElementById('fish-zone-map-style'))return;
    const s=document.createElement('style');s.id='fish-zone-map-style';s.textContent=`
      .fish-zone-map{margin-top:14px;padding-top:14px;border-top:1px solid var(--border,#d8d8df)}
      .fish-map-head{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:10px}.fish-map-title{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}.fish-map-zoom{padding:5px 10px;font-size:13px}
      .ff14-map-wrap{position:relative;width:min(100%,760px);aspect-ratio:1/1;margin:auto;border:1px solid var(--border,#d8d8df);border-radius:12px;overflow:hidden;background:#222}
      .ff14-map-canvas{position:absolute;left:0;top:0;width:100%;height:100%}
      .ff14-map-image{display:block;width:100%;height:100%}.ff14-map-markers{position:absolute;inset:0;pointer-events:none}
      .ff14-map-marker{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;border:0;background:transparent;padding:0;display:block;cursor:pointer;z-index:2;color:#fff}
      .ff14-map-dot{display:block;width:15px;height:15px;border-radius:50%;background:#fff;border:3px solid #222;box-shadow:0 1px 4px rgba(0,0,0,.65)}
      .ff14-map-label{position:absolute;top:50%;left:calc(100% + 5px);transform:translateY(-50%);font-weight:700;font-size:12px;white-space:nowrap;color:#fff;padding:1px 6px;border-radius:6px;background:rgba(20,22,26,.62);text-shadow:0 1px 2px #000}
      .ff14-map-marker.label-left .ff14-map-label{left:auto;right:calc(100% + 5px)}
      .ff14-map-marker.label-top .ff14-map-label{top:auto;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%)}
      .ff14-map-marker.label-bottom .ff14-map-label{top:calc(100% + 4px);left:50%;transform:translateX(-50%)}
      .ff14-map-marker:hover{z-index:6}.ff14-map-marker:hover .ff14-map-label{background:rgba(20,22,26,.9)}
      .ff14-map-marker.selected .ff14-map-dot{width:20px;height:20px;border-color:#1f6f8b}.ff14-map-marker.selected .ff14-map-label{background:#1f6f8b}.ff14-map-marker:focus-visible{outline:2px solid #fff;outline-offset:3px;border-radius:50%}
      .fish-map-scroll{overflow:auto;border:1px solid var(--border,#d8d8df);border-radius:12px;background:rgba(127,127,127,.04)}.fish-map-svg{display:block;width:100%;min-width:620px;height:auto}.fish-map-point{cursor:pointer}.fish-map-point circle{fill:currentColor;opacity:.65;stroke:Canvas;stroke-width:3}.fish-map-point text{font-size:13px;fill:currentColor;paint-order:stroke;stroke:Canvas;stroke-width:3px}.fish-map-note{margin-top:7px}.fish-map-warning{margin-top:9px}.fish-map-fallback{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.fish-map-fallback button span{opacity:.6;margin-left:5px}
      .ff14-npc-map-dialog{width:min(94vw,820px);max-width:820px;border:1px solid var(--border,#d8d8df);border-radius:14px;padding:14px;background:Canvas;color:CanvasText}.ff14-npc-map-dialog::backdrop{background:rgba(0,0,0,.58)}
      .ff14-npc-map-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}.ff14-npc-map-head button{font-size:24px;line-height:1;border:0;background:transparent;color:inherit;cursor:pointer;padding:2px 8px}.ff14-npc-map-body{min-height:80px}.ff14-npc-map-marker{cursor:default}.ff14-npc-map-marker .ff14-map-dot{width:20px;height:20px}
      @media(max-width:760px){.ff14-map-label{font-size:11px}.ff14-map-dot{width:13px;height:13px}.fish-map-svg{min-width:560px}.ff14-npc-map-dialog{width:96vw;padding:10px}}
    `;document.head.appendChild(s);
  }

  window.openFF14MapAt=(zone,coords,label,area)=>openNpcMap(zone,coords,label,area);

  window.addEventListener('DOMContentLoaded',()=>{
    addStyles();setTimeout(()=>{ensureMap();renderMap()},300);
    document.addEventListener('change',e=>{if(['fish-picker-region','fish-picker-zone','fish-picker-spot'].includes(e.target?.id))setTimeout(renderMap,0)});
    const target=document.getElementById('fish-catalog');if(target){catalogObserver=new MutationObserver(()=>{clearTimeout(renderTimer);renderTimer=setTimeout(renderMap,100)});catalogObserver.observe(target,{childList:true})}
    window.addEventListener('pagehide',()=>{clearTimeout(renderTimer);catalogObserver?.disconnect()},{once:true});
  });
})();
