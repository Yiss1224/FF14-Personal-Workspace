// Map-level fishing recommendations: independent from the existing spot recommender.
(function(){
  'use strict';

  const LIMIT=5;
  const CURRENT_WINDOW_WEIGHT=3;
  const SOON_WINDOW_WEIGHT=2;
  const PREP_CURRENT_WEIGHT=2;
  const PREP_SOON_WEIGHT=1;
  let renderToken=0,initTimer=null;

  function read(key,def){try{return JSON.parse(localStorage.getItem(key))??def}catch{return def}}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function itemText(v){const s=String(v||'');try{return typeof window.ff14TcItemText==='function'?window.ff14TcItemText(s):s}catch{return s}}
  function placeText(v){const s=String(v||'');try{return typeof window.ff14TcPlaceText==='function'?window.ff14TcPlaceText(s):s}catch{return s}}
  function fmtDuration(ms){if(!Number.isFinite(ms)||ms<0)return'—';const min=Math.max(0,Math.round(ms/60000));if(min<60)return`${min} 分`;const h=Math.floor(min/60),m=min%60;return m?`${h} 小時 ${m} 分`:`${h} 小時`}
  function fmtClock(ms){return new Date(ms).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}
  function idOf(v){return Number(v&&typeof v==='object'?(v.id??v.itemId??v.fishId):v)}
  function intSet(values){return new Set((values||[]).map(idOf).filter(Number.isFinite))}
  function caught(){try{if(typeof window.getCaughtIds==='function')return intSet(window.getCaughtIds())}catch{}return intSet([...(read('fishcakeCaughtIds',[])||[]),...(read('fishCaughtIds',[])||[])])}
  function skipped(){try{if(typeof window.getSkippedIds==='function')return intSet(window.getSkippedIds())}catch{}return intSet(read('fishSkippedIds',[])||[])}
  function minutes(){const n=Number(document.getElementById('fish-today-session')?.value);return Number.isFinite(n)&&n>0?n:90}
  function fishLocations(fish){if(typeof window.fishLocations==='function')return window.fishLocations(fish);return Array.isArray(fish?.spots)&&fish.spots.length?fish.spots:[fish]}
  function locationsFor(fish,info){const spots=fishLocations(fish);if(!info?.restricted||!Number(info.locationId))return spots;const exact=spots.filter(x=>Number(x?.spotId)===Number(info.locationId));return exact.length?exact:spots}
  function zoneKey(loc){const z=String(loc?.zoneName||'').trim(),r=String(loc?.regionName||'').trim();return `${r}|${z}`}
  function spotKey(loc){const id=Number(loc?.spotId)||0;return id?`id:${id}`:`name:${loc?.spotName||''}`}
  function fishLabel(fish){return `${esc(itemText(fish?.name||`Item ${fish?.itemId||''}`))}${fish?.bigFish?'<span class="today-fish-king">魚王</span>':''}`}

  function mapFor(groups,loc){
    const key=zoneKey(loc);
    if(!groups.has(key))groups.set(key,{region:String(loc?.regionName||''),zone:String(loc?.zoneName||''),ordinary:new Map(),current:new Map(),soon:new Map(),prepCurrent:new Map(),prepSoon:new Map(),spots:new Map(),earliestSoon:Infinity,earliestClose:Infinity});
    const g=groups.get(key),sk=spotKey(loc);
    if(!g.spots.has(sk))g.spots.set(sk,{loc,fish:new Set(),current:new Set(),soon:new Set(),prep:new Set()});
    return [g,g.spots.get(sk)];
  }

  function mapScore(g){
    const activeSpots=[...g.spots.values()].filter(s=>s.fish.size||s.current.size||s.soon.size||s.prep.size).length;
    const concentration=activeSpots>=3?2:activeSpots>=2?1:0;
    return g.ordinary.size+g.current.size*CURRENT_WINDOW_WEIGHT+g.soon.size*SOON_WINDOW_WEIGHT+g.prepCurrent.size*PREP_CURRENT_WEIGHT+g.prepSoon.size*PREP_SOON_WEIGHT+concentration;
  }

  function ensureUi(){
    const card=document.querySelector('.fish-today-card'),actions=card?.querySelector('.fish-today-actions'),spotResult=document.getElementById('fish-today-result');
    if(!card||!actions||!spotResult)return false;
    if(!document.getElementById('fish-today-map-refresh')){
      const b=document.createElement('button');b.id='fish-today-map-refresh';b.type='button';b.textContent='現在去哪張圖';
      const spotButton=document.getElementById('fish-today-refresh');actions.insertBefore(b,spotButton||null);
      b.addEventListener('click',renderMap);
    }
    if(!document.getElementById('fish-today-map-result')){
      const box=document.createElement('div');box.id='fish-today-map-result';box.className='fish-today-result fish-map-recommend-result';box.innerHTML='<span class="muted">按「現在去哪張圖」看適合整晚待著清的地圖。</span>';
      spotResult.insertAdjacentElement('beforebegin',box);
    }
    ensureStyle();return true;
  }

  function ensureStyle(){
    if(document.getElementById('fish-map-recommend-style'))return;
    const s=document.createElement('style');s.id='fish-map-recommend-style';s.textContent=`
      .fish-map-recommend-result{margin-top:12px;padding-bottom:12px;border-bottom:1px solid rgba(127,127,127,.16)}
      .today-map-row{padding:12px;border-radius:10px;background:rgba(127,127,127,.07)}
      .today-map-row.top-pick{outline:2px solid rgba(52,168,83,.35);background:rgba(52,168,83,.06)}
      .today-map-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
      .today-map-name{font-weight:850;font-size:16px}.today-map-region{font-size:12px}.today-map-score{text-align:right;font-weight:800}.today-map-meta{margin-top:7px;font-size:13px;display:flex;gap:10px;flex-wrap:wrap}.today-map-spots{margin-top:8px;display:grid;gap:5px}.today-map-spot{font-size:13px;padding:6px 8px;border-radius:8px;background:rgba(127,127,127,.06)}
      .today-map-window{margin-top:7px;font-size:13px;line-height:1.5}.today-map-action{margin-top:8px}.today-map-action button{min-height:34px}
      @media(max-width:650px){.today-map-top{display:grid;grid-template-columns:1fr}.today-map-score{text-align:left}.today-map-meta{gap:7px}.today-map-action button{width:100%;min-height:42px}}
    `;document.head.appendChild(s);
  }

  function selectMap(region,zone){
    const tab=document.querySelector('nav button[data-tab="fishing"]');if(tab&&!tab.classList.contains('active'))tab.click();
    const regionEl=document.getElementById('fish-picker-region'),zoneEl=document.getElementById('fish-picker-zone');
    if(!regionEl||!zoneEl)return;
    if([...regionEl.options].some(o=>o.value===region)){regionEl.value=region;regionEl.dispatchEvent(new Event('change',{bubbles:true}))}
    setTimeout(()=>{if([...zoneEl.options].some(o=>o.value===zone)){zoneEl.value=zone;zoneEl.dispatchEvent(new Event('change',{bubbles:true}));setTimeout(()=>document.getElementById('fish-location-picker')?.scrollIntoView({behavior:'smooth',block:'start'}),30)}},20);
  }

  async function renderMap(){
    if(!ensureUi())return;
    const box=document.getElementById('fish-today-map-result'),my=++renderToken,includeBig=!!document.getElementById('fish-today-big')?.checked,mins=minutes(),now=Date.now(),end=now+mins*60000,catalog=read('fishCatalog',[])||[],done=caught(),skip=skipped();
    if(typeof window.ff14FishingWindowInfo!=='function'){box.innerHTML='<span class="muted">魚窗資料尚未準備好，請稍後再按一次。</span>';return}
    box.innerHTML='<span class="muted">正在比較哪張圖最值得待…</span>';
    const byId=new Map(catalog.map(f=>[Number(f?.itemId),f]).filter(([id])=>Number.isFinite(id)&&id>0));
    const base=catalog.filter(f=>Number(f?.itemId)>0&&f?.type!=='spearfishing'&&!done.has(Number(f.itemId))&&!skip.has(Number(f.itemId))&&(includeBig||!f.bigFish));
    const groups=new Map(),prereqNeeds=new Map();

    for(const fish of base){
      const id=Number(fish.itemId),info=await window.ff14FishingWindowInfo(id,now);if(my!==renderToken)return;
      if(info){
        const available=!info.restricted||!!info.current,soon=!!(info.restricted&&!info.current&&info.next&&info.next[0]<end&&info.waitMs<=mins*60000);
        for(const loc of locationsFor(fish,info)){
          const [g,s]=mapFor(groups,loc);
          if(available){s.fish.add(id);if(info.restricted){g.current.set(id,{fish,info});s.current.add(id);if(Number.isFinite(info.currentLeftMs))g.earliestClose=Math.min(g.earliestClose,info.currentLeftMs)}else g.ordinary.set(id,{fish,info})}
          if(soon){g.soon.set(id,{fish,info});s.soon.add(id);g.earliestSoon=Math.min(g.earliestSoon,info.next?.[0]??Infinity)}
        }
      }
      if(typeof window.ff14FishingPrerequisites==='function'){
        const reqs=await window.ff14FishingPrerequisites(id);if(my!==renderToken)return;
        for(const req of reqs||[]){const predId=Number(req?.itemId);if(!Number.isFinite(predId)||!done.has(predId)||skip.has(predId))continue;if(!prereqNeeds.has(predId))prereqNeeds.set(predId,{targets:new Map()});prereqNeeds.get(predId).targets.set(id,{fish,count:Math.max(1,Number(req?.count)||1)})}
      }
    }

    for(const [predId,need] of prereqNeeds){
      const fish=byId.get(predId);if(!fish)continue;const info=await window.ff14FishingWindowInfo(predId,now);if(my!==renderToken)return;if(!info?.restricted)continue;
      const current=!!info.current,soon=!!(!current&&info.next&&info.next[0]<end&&info.waitMs<=mins*60000);if(!current&&!soon)continue;
      const entry={fish,info,targets:[...need.targets.values()]};
      for(const loc of locationsFor(fish,info)){const [g,s]=mapFor(groups,loc);s.prep.add(predId);if(current){g.prepCurrent.set(predId,entry);if(Number.isFinite(info.currentLeftMs))g.earliestClose=Math.min(g.earliestClose,info.currentLeftMs)}else{g.prepSoon.set(predId,entry);g.earliestSoon=Math.min(g.earliestSoon,info.next?.[0]??Infinity)}}
    }

    const maps=[...groups.values()].filter(g=>mapScore(g)>0).sort((a,b)=>mapScore(b)-mapScore(a)||a.earliestClose-b.earliestClose||b.spots.size-a.spots.size||a.earliestSoon-b.earliestSoon||a.zone.localeCompare(b.zone));
    if(my!==renderToken)return;
    if(!maps.length){box.innerHTML=`<div class="today-fish-empty">接下來 ${mins} 分鐘沒有找到值得集中清的地圖。<br><span class="muted">已排除已釣 ${done.size} 種、先跳過 ${skip.size} 種。</span></div>`;return}

    box.innerHTML=`<div class="today-fish-summary muted">地圖模式 · ${fmtClock(now)} 起算 ${mins} 分鐘 · 同一條魚跨釣點只算一次；同圖 2 個有效釣點 +1、3 個以上 +2。</div>${maps.slice(0,LIMIT).map((g,index)=>{
      const active=[...g.spots.values()].filter(s=>s.fish.size||s.current.size||s.soon.size||s.prep.size).sort((a,b)=>(b.current.size*3+b.soon.size*2+b.fish.size+b.prep.size)-(a.current.size*3+a.soon.size*2+a.fish.size+a.prep.size));
      const score=mapScore(g),current=[...g.current.values()],soon=[...g.soon.values()].filter(x=>!g.current.has(Number(x.fish.itemId))).sort((a,b)=>(a.info.waitMs??Infinity)-(b.info.waitMs??Infinity));
      const pick=index===0?'<div class="today-pick-label">★ 現在最推薦地圖</div>':'';
      const windowText=current.length?`🟢 ${current.length} 條正在窗口${Number.isFinite(g.earliestClose)?` · 最快 ${esc(fmtDuration(g.earliestClose))}後關`:''}`:(soon.length?`⏳ 最近 ${esc(fmtDuration(soon[0].info.waitMs))}後開窗`:'');
      const spotsHtml=active.slice(0,4).map((s,i)=>`<div class="today-map-spot">${i+1}. <strong>${esc(placeText(s.loc?.spotName||'未知釣點'))}</strong> · 現在 ${s.fish.size} · 開窗 ${s.current.size}${s.soon.size?` · 將開 ${s.soon.size}`:''}${s.prep.size?` · 🧩前置 ${s.prep.size}`:''}</div>`).join('');
      return `<div class="today-map-row${index===0?' top-pick':''}">${pick}<div class="today-map-top"><div><div class="today-map-name">${esc(placeText(g.zone||'未知地圖'))}</div><div class="today-map-region muted">${esc(placeText(g.region))}</div></div><div class="today-map-score">地圖分數 ${score}</div></div><div class="today-map-meta"><span>現在可處理 ${new Set([...g.ordinary.keys(),...g.current.keys()]).size} 種</span><span>有效釣點 ${active.length}</span><span>Session 內將開 ${g.soon.size}</span></div>${windowText?`<div class="today-map-window">${windowText}</div>`:''}<div class="today-map-spots">${spotsHtml}</div><div class="today-map-action"><button type="button" data-map-region="${esc(g.region)}" data-map-zone="${esc(g.zone)}">前往這張圖</button></div></div>`;
    }).join('')}`;
    box.querySelectorAll('[data-map-zone]').forEach(b=>b.addEventListener('click',()=>selectMap(b.dataset.mapRegion||'',b.dataset.mapZone||'')));
  }

  function init(){
    if(ensureUi())return;
    clearInterval(initTimer);initTimer=setInterval(()=>{if(ensureUi())clearInterval(initTimer)},100);
    setTimeout(()=>{if(initTimer)clearInterval(initTimer)},10000);
  }
  window.renderTodayFishingMap=renderMap;
  window.addEventListener('DOMContentLoaded',init);
})();
