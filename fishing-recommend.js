// 去哪裡釣：三種推薦，都只看還沒釣到、沒被「先跳過」的魚，不含刺魚與出海垂釣。
//   「現在去哪張圖」  接下來這段時間，哪張地圖最值得待（同一條魚跨釣點只算一次）
//   「現在去哪釣」    哪個釣點最值得去
//   「一般魚剩最多的地圖」  只算隨時釣得到的一般魚，適合不想等時間的時候
// 計分：一般魚 1 分、正在開窗的限時魚 3 分、這段時間內會開窗 2 分；
//       已經釣過但別的魚需要它當直感前置的，只在它自己開窗時算（正在開 2 分、將開 1 分）。
// 魚什麼時候開窗由 fishing-window.js 提供（window.ff14FishingWindowInfo / ff14FishingPrerequisites）。
//
// 對外：window.renderTodayFishingMap()（首頁「今天釣什麼」按鈕用）
(function(){
  'use strict';

  const LIMIT=5,WHITEFISH_LIMIT=8,DEFAULT_SESSION_MIN=90;
  const CURRENT_WINDOW_WEIGHT=3,SOON_WINDOW_WEIGHT=2,PREP_CURRENT_WEIGHT=2,PREP_SOON_WEIGHT=1;
  let spotToken=0,mapToken=0,whitefishToken=0,whitefishTimer=0;

  const shared=window.FF14Fishing;
  const $=id=>document.getElementById(id);
  const caught=shared.caughtIds,skipped=shared.skippedIds,fishLocations=shared.locations,locationsFor=shared.locationsForWindow;
  function itemText(v){const s=String(v||'');try{return typeof window.ff14TcItemText==='function'?window.ff14TcItemText(s):s}catch{return s}}
  function placeText(v){const s=String(v||'');try{return typeof window.ff14TcPlaceText==='function'?window.ff14TcPlaceText(s):s}catch{return s}}
  function fmtDuration(ms){if(!Number.isFinite(ms)||ms<0)return'—';const min=Math.max(0,Math.round(ms/60000));if(min<60)return`${min} 分`;const h=Math.floor(min/60),m=min%60;return m?`${h} 小時 ${m} 分`:`${h} 小時`}
  function fmtClock(ms){return new Date(ms).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}
  function sessionMinutes(){const n=Number($('fish-today-session')?.value);return Number.isFinite(n)&&n>0?n:DEFAULT_SESSION_MIN}
  function fishLabel(fish){return `${esc(itemText(fish.name||`Item ${fish.itemId}`))}${fish.bigFish?'<span class="today-fish-king">魚王</span>':''}`}
  function prepTargetsText(targets){return targets.map(x=>`${fishLabel(x.fish)}${x.count>1?` ×${x.count}`:''}`).join('、')}
  function bindSpotTags(root){
    root.querySelectorAll('[data-today-spot]').forEach(tag=>tag.addEventListener('click',()=>{
      if(typeof window.selectFishingSpot==='function')window.selectFishingSpot(tag.dataset.region||'',tag.dataset.zone||'',tag.dataset.spot||'');
    }));
  }

  // ---- 「今天釣什麼」卡片 ----
  function ensureCard(){
    if($('fish-today-result'))return true;
    const slot=$('fish-today-slot'),summary=$('fish-map-summary');if(!slot&&!summary)return false;
    const section=document.createElement('div');section.className='fish-today-card';
    section.innerHTML=`<div class="fish-today-head"><div><strong class="fish-today-title">🎣 今天釣什麼</strong><div class="muted">選這次能玩多久，挑出現在最值得去的地圖和釣點。正在開窗的限時魚最優先，接著是這段時間內會開窗的，最後才是一般魚；已經釣到的不算。</div></div><div class="fish-today-actions"><label class="fish-today-session-label">可釣時間<select id="fish-today-session"><option value="60">60 分</option><option value="90" selected>90 分</option><option value="120">120 分</option></select></label><label class="inline-check"><input id="fish-today-big" type="checkbox"> 包含魚王</label><button id="fish-today-map-refresh" type="button">現在去哪張圖</button><button id="fish-today-refresh" type="button">現在去哪釣</button></div></div><div id="fish-today-map-result" class="fish-today-result fish-map-recommend-result"><span class="muted">按「現在去哪張圖」看適合整晚待著清的地圖。</span></div><div id="fish-today-result" class="fish-today-result"><span class="muted">要開始釣時再按「現在去哪釣」計算。</span></div>`;
    if(slot)slot.appendChild(section);else summary.insertAdjacentElement('afterend',section);
    $('fish-today-map-refresh').addEventListener('click',renderMap);
    $('fish-today-refresh').addEventListener('click',renderSpots);
    return true;
  }

  // ---- 現在去哪釣（釣點） ----
  function spotGroupKey(loc){
    const id=Number(loc?.spotId)||0;
    return id?`id:${id}`:`name:${loc?.regionName||''}|${loc?.zoneName||''}|${loc?.spotName||''}`;
  }

  function spotGroupFor(groups,loc){
    const key=spotGroupKey(loc);
    if(!groups.has(key))groups.set(key,{loc,nowFish:new Map(),soonFish:new Map(),windowFish:new Map(),prepCurrent:new Map(),prepSoon:new Map(),earliestSoon:Infinity});
    return groups.get(key);
  }

  function spotScore(g){
    let ordinaryNow=0,currentWindow=0;
    for(const x of g.nowFish.values()){
      if(x.info?.restricted)currentWindow++;
      else ordinaryNow++;
    }
    let soonWindow=0;
    for(const id of g.soonFish.keys())if(!g.nowFish.has(id))soonWindow++;
    return ordinaryNow+
      currentWindow*CURRENT_WINDOW_WEIGHT+
      soonWindow*SOON_WINDOW_WEIGHT+
      g.prepCurrent.size*PREP_CURRENT_WEIGHT+
      g.prepSoon.size*PREP_SOON_WEIGHT;
  }

  function earliestCurrentClose(g){
    let out=Infinity;
    for(const x of g.nowFish.values())if(x.info?.restricted&&x.info?.currentLeftMs!=null)out=Math.min(out,Number(x.info.currentLeftMs));
    for(const x of g.prepCurrent.values())if(x.info?.currentLeftMs!=null)out=Math.min(out,Number(x.info.currentLeftMs));
    return out;
  }

  async function renderSpots(){
    if(!ensureCard())return;
    const box=$('fish-today-result'),my=++spotToken,includeBig=!!document.getElementById('fish-today-big')?.checked,minutes=sessionMinutes(),now=Date.now(),sessionEnd=now+minutes*60000,catalog=shared.catalog(),done=caught(),skip=skipped();
    if(typeof window.ff14FishingWindowInfo!=='function'){
      box.innerHTML='<span class="muted">魚窗資料尚未準備好，請稍後再按一次。</span>';return;
    }
    box.innerHTML='<span class="muted">正在判斷現在去哪裡最划算…</span>';

    const catalogById=new Map(catalog.map(f=>[Number(f?.itemId),f]).filter(([id])=>Number.isFinite(id)&&id>0));
    const base=catalog.filter(f=>shared.recommendationEligible(f)&&!done.has(Number(f.itemId))&&!skip.has(Number(f.itemId))&&(includeBig||!f.bigFish));
    const groups=new Map(),prereqNeeds=new Map();

    for(const fish of base){
      const fishId=Number(fish.itemId),info=await window.ff14FishingWindowInfo(fishId,now);if(my!==spotToken)return;
      if(info){
        const availableNow=!info.restricted||!!info.current;
        const soon=!!(info.restricted&&!info.current&&info.next&&info.next[0]<sessionEnd&&info.waitMs<=minutes*60000);
        for(const loc of locationsFor(fish,info)){
          const g=spotGroupFor(groups,loc),id=fishId;
          if(info.restricted)g.windowFish.set(id,{fish,info});
          if(availableNow)g.nowFish.set(id,{fish,info});
          if(soon){g.soonFish.set(id,{fish,info});g.earliestSoon=Math.min(g.earliestSoon,info.next[0])}
        }
      }

      if(typeof window.ff14FishingPrerequisites==='function'){
        const reqs=await window.ff14FishingPrerequisites(fishId);if(my!==spotToken)return;
        for(const req of reqs||[]){
          const predId=Number(req?.itemId),count=Math.max(1,Number(req?.count)||1);
          if(!Number.isFinite(predId)||predId<=0||!done.has(predId)||skip.has(predId))continue;
          if(!prereqNeeds.has(predId))prereqNeeds.set(predId,{targets:new Map()});
          prereqNeeds.get(predId).targets.set(fishId,{fish,count});
        }
      }
    }

    for(const[predId,need]of prereqNeeds){
      const fish=catalogById.get(Number(predId));if(!fish)continue;
      const info=await window.ff14FishingWindowInfo(Number(predId),now);if(my!==spotToken)return;
      if(!info?.restricted)continue;
      const current=!!info.current,soon=!!(!current&&info.next&&info.next[0]<sessionEnd&&info.waitMs<=minutes*60000);
      if(!current&&!soon)continue;
      const entry={fish,info,targets:[...need.targets.values()]};
      for(const loc of locationsFor(fish,info)){
        const g=spotGroupFor(groups,loc);
        if(current)g.prepCurrent.set(Number(predId),entry);
        else{g.prepSoon.set(Number(predId),entry);g.earliestSoon=Math.min(g.earliestSoon,info.next?.[0]??Infinity)}
      }
    }

    const spots=[...groups.values()].filter(g=>g.nowFish.size>0||g.soonFish.size>0||g.prepCurrent.size>0||g.prepSoon.size>0).sort((a,b)=>
      spotScore(b)-spotScore(a)||
      earliestCurrentClose(a)-earliestCurrentClose(b)||
      b.nowFish.size-a.nowFish.size||
      b.soonFish.size-a.soonFish.size||
      b.prepCurrent.size-a.prepCurrent.size||
      a.earliestSoon-b.earliestSoon||
      String(a.loc?.spotName||'').localeCompare(String(b.loc?.spotName||''))
    );

    if(my!==spotToken)return;
    if(!spots.length){
      box.innerHTML=`<div class="today-fish-empty">接下來 ${minutes} 分鐘沒有找到可清的${includeBig?'漁場':'白魚漁場'}。<br><span class="muted">已排除已釣 ${done.size} 種。${includeBig?'目前連魚王一起算也沒有合適的點 QAQ':'想把魚王也算進去，可以勾「包含魚王」後再按一次。'}</span></div>`;return;
    }

    const shown=spots.slice(0,LIMIT);
    box.innerHTML=`<div class="today-fish-summary muted">以 ${esc(fmtClock(now))} 起算接下來 ${minutes} 分鐘 · 已排除已釣 ${done.size} 種、先跳過 ${skip.size} 種。未釣普通魚 1 分、正在窗口 ${CURRENT_WINDOW_WEIGHT} 分、時段內會開窗 ${SOON_WINDOW_WEIGHT} 分；已釣直感前置魚僅在自己有窗口時例外，正在窗口 ${PREP_CURRENT_WEIGHT} 分、將開 ${PREP_SOON_WEIGHT} 分。</div>${shown.map((g,index)=>{
      const loc=g.loc||{},regionRaw=String(loc.regionName||''),zoneRaw=String(loc.zoneName||''),spotRaw=String(loc.spotName||'未知釣點'),region=placeText(regionRaw),zone=placeText(zoneRaw),spot=placeText(spotRaw);
      const nowFish=[...g.nowFish.values()].sort((a,b)=>Number(a.fish.bigFish)-Number(b.fish.bigFish)||String(a.fish.name||'').localeCompare(String(b.fish.name||'')));
      const currentWindowFish=nowFish.filter(x=>x.info?.restricted&&x.info?.current).sort((a,b)=>(a.info.currentLeftMs??Infinity)-(b.info.currentLeftMs??Infinity));
      const ordinaryNowFish=nowFish.filter(x=>!(x.info?.restricted&&x.info?.current));
      const soonFish=[...g.soonFish.values()].filter(x=>!g.nowFish.has(Number(x.fish.itemId))).sort((a,b)=>(a.info.next?.[0]??Infinity)-(b.info.next?.[0]??Infinity));
      const prepCurrent=[...g.prepCurrent.values()].sort((a,b)=>(a.info.currentLeftMs??Infinity)-(b.info.currentLeftMs??Infinity));
      const prepSoon=[...g.prepSoon.values()].sort((a,b)=>(a.info.next?.[0]??Infinity)-(b.info.next?.[0]??Infinity));
      const ordinaryNames=ordinaryNowFish.slice(0,8).map(x=>fishLabel(x.fish)).join('、')+(ordinaryNowFish.length>8?`、…共 ${ordinaryNowFish.length} 條`:'');
      const currentHtml=currentWindowFish.length?`<div class="today-spot-current"><span class="today-spot-current-label">🟢 未釣正在窗口：</span>${currentWindowFish.map(x=>`${fishLabel(x.fish)}（剩 ${esc(fmtDuration(x.info.currentLeftMs))}）`).join('、')}</div>`:'';
      const ordinaryHtml=ordinaryNames?`<div class="today-spot-fish">${ordinaryNames}</div>`:'';
      const soonHtml=soonFish.length?`<div class="today-spot-soon">⏳ 未釣這次會開窗：${soonFish.slice(0,3).map(x=>`<span class="today-spot-window">${fishLabel(x.fish)} ${esc(fmtDuration(x.info.waitMs))}後（${esc(fmtClock(x.info.next[0]))}）</span>`).join('、')}</div>`:'';
      const prepCurrentHtml=prepCurrent.length?`<div class="today-spot-prep"><span class="today-spot-prep-label">🧩 前置窗口：</span>${prepCurrent.map(x=>`${fishLabel(x.fish)}（已釣；目標 ${prepTargetsText(x.targets)}；剩 ${esc(fmtDuration(x.info.currentLeftMs))}）`).join('、')}</div>`:'';
      const prepSoonHtml=prepSoon.length?`<div class="today-spot-prep"><span class="today-spot-prep-label">🧩 前置將開：</span>${prepSoon.map(x=>`${fishLabel(x.fish)}（已釣；目標 ${prepTargetsText(x.targets)}；${esc(fmtDuration(x.info.waitMs))}後）`).join('、')}</div>`:'';
      const hasWindow=g.windowFish.size>0,prepCount=g.prepCurrent.size+g.prepSoon.size,score=spotScore(g),pick=index===0?'<div class="today-pick-label">★ 現在最推薦</div>':'';
      const tags=`<button type="button" class="today-spot-tag ${hasWindow?'has-window':'no-window'}" data-today-spot="1" data-region="${esc(regionRaw)}" data-zone="${esc(zoneRaw)}" data-spot="${esc(spotRaw)}" title="跳到這個釣場">${hasWindow?`未釣窗口魚 ${g.windowFish.size}`:'無未釣窗口魚'}</button>${prepCount?`<button type="button" class="today-spot-tag prep-window" data-today-spot="1" data-region="${esc(regionRaw)}" data-zone="${esc(zoneRaw)}" data-spot="${esc(spotRaw)}" title="跳到這個釣場">前置窗口 ${prepCount}</button>`:''}`;
      return `<div class="today-spot-row${index===0?' top-pick':''}">${pick}<div class="today-spot-top"><div><span class="today-spot-name">${esc(spot)}</span><div class="today-spot-place">${[region,zone].filter(Boolean).map(esc).join(' / ')}</div><div class="today-spot-tags">${tags}</div></div><div class="today-spot-count">未釣現在可清 ${g.nowFish.size} 條<div class="today-spot-score muted">推薦分數 ${score}</div></div></div>${currentHtml}${ordinaryHtml}${soonHtml}${prepCurrentHtml}${prepSoonHtml}</div>`;
    }).join('')}`;
    bindSpotTags(box);
  }

  // ---- 現在去哪張圖（地圖） ----
  function zoneKey(loc){const z=String(loc?.zoneName||'').trim(),r=String(loc?.regionName||'').trim();return `${r}|${z}`}
  function mapSpotKey(loc){const id=Number(loc?.spotId)||0;return id?`id:${id}`:`name:${loc?.spotName||''}`}

  function mapFor(groups,loc){
    const key=zoneKey(loc);
    if(!groups.has(key))groups.set(key,{region:String(loc?.regionName||''),zone:String(loc?.zoneName||''),ordinary:new Map(),current:new Map(),soon:new Map(),prepCurrent:new Map(),prepSoon:new Map(),spots:new Map(),earliestSoon:Infinity,earliestClose:Infinity});
    const g=groups.get(key),sk=mapSpotKey(loc);
    if(!g.spots.has(sk))g.spots.set(sk,{loc,fish:new Set(),current:new Set(),soon:new Set(),prep:new Set()});
    return [g,g.spots.get(sk)];
  }

  function mapScore(g){
    const activeSpots=[...g.spots.values()].filter(s=>s.fish.size||s.current.size||s.soon.size||s.prep.size).length;
    const concentration=activeSpots>=3?2:activeSpots>=2?1:0;
    return g.ordinary.size+g.current.size*CURRENT_WINDOW_WEIGHT+g.soon.size*SOON_WINDOW_WEIGHT+g.prepCurrent.size*PREP_CURRENT_WEIGHT+g.prepSoon.size*PREP_SOON_WEIGHT+concentration;
  }

  function selectMap(region,zone){
    const tab=document.querySelector('nav button[data-tab="fishing"]');if(tab&&!tab.classList.contains('active'))tab.click();
    const regionEl=document.getElementById('fish-picker-region'),zoneEl=document.getElementById('fish-picker-zone');
    if(!regionEl||!zoneEl)return;
    if([...regionEl.options].some(o=>o.value===region)){regionEl.value=region;regionEl.dispatchEvent(new Event('change',{bubbles:true}))}
    setTimeout(()=>{if([...zoneEl.options].some(o=>o.value===zone)){zoneEl.value=zone;zoneEl.dispatchEvent(new Event('change',{bubbles:true}));setTimeout(()=>document.getElementById('fish-location-picker')?.scrollIntoView({behavior:'smooth',block:'start'}),30)}},20);
  }

  async function renderMap(){
    if(!ensureCard())return;
    const box=$('fish-today-map-result'),my=++mapToken,includeBig=!!$('fish-today-big')?.checked,mins=sessionMinutes(),now=Date.now(),end=now+mins*60000,catalog=shared.catalog(),done=caught(),skip=skipped();
    if(typeof window.ff14FishingWindowInfo!=='function'){box.innerHTML='<span class="muted">魚窗資料尚未準備好，請稍後再按一次。</span>';return}
    box.innerHTML='<span class="muted">正在比較哪張圖最值得待…</span>';
    const byId=new Map(catalog.map(f=>[Number(f?.itemId),f]).filter(([id])=>Number.isFinite(id)&&id>0));
    const base=catalog.filter(f=>shared.recommendationEligible(f)&&!done.has(Number(f.itemId))&&!skip.has(Number(f.itemId))&&(includeBig||!f.bigFish));
    const groups=new Map(),prereqNeeds=new Map();

    for(const fish of base){
      const id=Number(fish.itemId),info=await window.ff14FishingWindowInfo(id,now);if(my!==mapToken)return;
      if(info){
        const available=!info.restricted||!!info.current,soon=!!(info.restricted&&!info.current&&info.next&&info.next[0]<end&&info.waitMs<=mins*60000);
        for(const loc of locationsFor(fish,info)){
          const [g,s]=mapFor(groups,loc);
          if(available){s.fish.add(id);if(info.restricted){g.current.set(id,{fish,info});s.current.add(id);if(Number.isFinite(info.currentLeftMs))g.earliestClose=Math.min(g.earliestClose,info.currentLeftMs)}else g.ordinary.set(id,{fish,info})}
          if(soon){g.soon.set(id,{fish,info});s.soon.add(id);g.earliestSoon=Math.min(g.earliestSoon,info.next?.[0]??Infinity)}
        }
      }
      if(typeof window.ff14FishingPrerequisites==='function'){
        const reqs=await window.ff14FishingPrerequisites(id);if(my!==mapToken)return;
        for(const req of reqs||[]){const predId=Number(req?.itemId);if(!Number.isFinite(predId)||!done.has(predId)||skip.has(predId))continue;if(!prereqNeeds.has(predId))prereqNeeds.set(predId,{targets:new Map()});prereqNeeds.get(predId).targets.set(id,{fish,count:Math.max(1,Number(req?.count)||1)})}
      }
    }

    for(const [predId,need] of prereqNeeds){
      const fish=byId.get(predId);if(!fish)continue;const info=await window.ff14FishingWindowInfo(predId,now);if(my!==mapToken)return;if(!info?.restricted)continue;
      const current=!!info.current,soon=!!(!current&&info.next&&info.next[0]<end&&info.waitMs<=mins*60000);if(!current&&!soon)continue;
      const entry={fish,info,targets:[...need.targets.values()]};
      for(const loc of locationsFor(fish,info)){const [g,s]=mapFor(groups,loc);s.prep.add(predId);if(current){g.prepCurrent.set(predId,entry);if(Number.isFinite(info.currentLeftMs))g.earliestClose=Math.min(g.earliestClose,info.currentLeftMs)}else{g.prepSoon.set(predId,entry);g.earliestSoon=Math.min(g.earliestSoon,info.next?.[0]??Infinity)}}
    }

    const maps=[...groups.values()].filter(g=>mapScore(g)>0).sort((a,b)=>mapScore(b)-mapScore(a)||a.earliestClose-b.earliestClose||b.spots.size-a.spots.size||a.earliestSoon-b.earliestSoon||a.zone.localeCompare(b.zone));
    if(my!==mapToken)return;
    if(!maps.length){box.innerHTML=`<div class="today-fish-empty">接下來 ${mins} 分鐘沒有找到值得集中清的地圖。<br><span class="muted">已排除已釣 ${done.size} 種、先跳過 ${skip.size} 種。</span></div>`;return}

    box.innerHTML=`<div class="today-fish-summary muted">地圖模式 · ${fmtClock(now)} 起算 ${mins} 分鐘 · 同一條魚跨釣點只算一次；同圖 2 個有效釣點 +1、3 個以上 +2。</div>${maps.slice(0,LIMIT).map((g,index)=>{
      const active=[...g.spots.values()].filter(s=>s.fish.size||s.current.size||s.soon.size||s.prep.size).sort((a,b)=>(b.current.size*3+b.soon.size*2+b.fish.size+b.prep.size)-(a.current.size*3+a.soon.size*2+a.fish.size+a.prep.size));
      const score=mapScore(g),current=[...g.current.values()],soon=[...g.soon.values()].filter(x=>!g.current.has(Number(x.fish.itemId))).sort((a,b)=>(a.info.waitMs??Infinity)-(b.info.waitMs??Infinity));
      const pick=index===0?'<div class="today-pick-label">★ 現在最推薦地圖</div>':'';
      const windowText=current.length?`🟢 ${current.length} 條正在窗口${Number.isFinite(g.earliestClose)?` · 最快 ${esc(fmtDuration(g.earliestClose))}後關`:''}`:(soon.length?`⏳ 最近 ${esc(fmtDuration(soon[0].info.waitMs))}後開窗`:'');
      const spotsHtml=active.slice(0,4).map((s,i)=>`<div class="today-map-spot">${i+1}. <strong>${esc(placeText(s.loc?.spotName||'未知釣點'))}</strong> · 現在 ${s.fish.size} · 開窗 ${s.current.size}${s.soon.size?` · 將開 ${s.soon.size}`:''}${s.prep.size?` · 🧩前置 ${s.prep.size}`:''}</div>`).join('');
      return `<div class="today-map-row${index===0?' top-pick':''}">${pick}<div class="today-map-top"><div><div class="today-map-name">${esc(placeText(g.zone||'未知地圖'))}</div><div class="today-map-region muted">${esc(placeText(g.region))}</div></div><div class="today-map-score">地圖分數 ${score}</div></div><div class="today-map-meta"><span>現在可處理 ${new Set([...g.ordinary.keys(),...g.current.keys()]).size} 種</span><span>有效釣點 ${active.length}</span><span>這段時間內會開 ${g.soon.size}</span></div>${windowText?`<div class="today-map-window">${windowText}</div>`:''}<div class="today-map-spots">${spotsHtml}</div><div class="today-map-action"><button type="button" data-map-region="${esc(g.region)}" data-map-zone="${esc(g.zone)}">前往這張圖</button></div></div>`;
    }).join('')}`;
    box.querySelectorAll('[data-map-zone]').forEach(b=>b.addEventListener('click',()=>selectMap(b.dataset.mapRegion||'',b.dataset.mapZone||'')));
  }

  // ---- 一般魚剩最多的地圖 ----
  function ensureWhitefishBox(){
    if($('fish-whitefish-hotspot'))return $('fish-whitefish-hotspot-result');
    const slot=$('fish-more-tools-body'),anchor=document.querySelector('.fish-today-card')||$('fish-map-summary');
    if(!slot&&!anchor)return null;
    const section=document.createElement('div');
    section.id='fish-whitefish-hotspot';
    section.className='fish-whitefish-hotspot';
    section.innerHTML=`<div class="fish-whitefish-head"><div><strong>🐟 一般魚剩最多的地圖</strong><div class="muted">只算隨時都釣得到的一般魚（不含魚王、刺魚、限時魚和先跳過的），適合想慢慢清圖、不想等時間的時候。</div></div><button id="fish-whitefish-refresh" type="button">重算</button></div><div id="fish-whitefish-hotspot-result" class="fish-whitefish-result"><span class="muted">正在統計…</span></div>`;
    if(slot)slot.appendChild(section);else anchor.insertAdjacentElement('afterend',section);
    $('fish-whitefish-refresh')?.addEventListener('click',renderWhitefish);
    return $('fish-whitefish-hotspot-result');
  }
  async function renderWhitefish(){
    const box=ensureWhitefishBox();if(!box)return;
    const my=++whitefishToken;
    const catalog=shared.read('fishCatalog',[])||[],done=caught(),skip=skipped();
    if(!catalog.length){box.innerHTML='<span class="muted">魚資料還在讀取中，讀好後會自動統計。</span>';return;}
    if(typeof window.ff14FishingWindowInfo!=='function'){
      box.innerHTML='<span class="muted">魚窗資料尚未準備好，稍後再重算一次。</span>';return;
    }
    box.innerHTML='<span class="muted">正在排除窗口魚並統計各地圖…</span>';
    const maps=new Map();
    for(const fish of catalog){
      const id=Number(fish?.itemId);
      if(!shared.recommendationEligible(fish)||fish?.bigFish||done.has(id)||skip.has(id))continue;
      const info=await window.ff14FishingWindowInfo(id,Date.now());
      if(my!==whitefishToken)return;
      // Unknown fish are excluded conservatively so a window fish can never leak into this list.
      if(!info||info.restricted)continue;
      const seenMaps=new Set();
      for(const loc of fishLocations(fish)){
        const zone=String(loc?.zoneName||'').trim();
        if(!zone)continue;
        const key=`${loc?.regionName||''}|${loc?.zoneName||''}`;if(seenMaps.has(key))continue;seenMaps.add(key);
        if(!maps.has(key))maps.set(key,{region:String(loc?.regionName||''),zone,fish:new Map(),sampleLoc:loc});
        maps.get(key).fish.set(id,fish);
      }
    }
    if(my!==whitefishToken)return;
    const rows=[...maps.values()].filter(x=>x.fish.size).sort((a,b)=>b.fish.size-a.fish.size||a.zone.localeCompare(b.zone)).slice(0,WHITEFISH_LIMIT);
    if(!rows.length){box.innerHTML='<span class="muted">目前範圍內沒有剩下的一般魚，可以去追限時魚了。</span>';return;}
    box.innerHTML=rows.map((row,i)=>{
      const names=[...row.fish.values()].slice(0,8).map(f=>esc(itemText(f.name||`Item ${f.itemId}`))).join('、');
      const more=row.fish.size>8?`、…另 ${row.fish.size-8} 種`:'';
      return `<div class="whitefish-map-row"><div class="whitefish-rank">#${i+1}</div><div><div class="whitefish-map-name">${esc(placeText(row.zone))}</div><div class="whitefish-region muted">${esc(placeText(row.region))}</div></div><div class="whitefish-count">${row.fish.size} 種</div><div class="whitefish-names muted">${names}${more}</div></div>`;
    }).join('');
  }
  function scheduleWhitefish(){clearTimeout(whitefishTimer);whitefishTimer=setTimeout(renderWhitefish,120)}

  // ---- 圖鑑還沒下載好就按了推薦按鈕 ----
  // 魚圖鑑還沒從 XIVAPI 讀完時，推薦按鈕先顯示「讀取中」，讀好自動重算；讀取失敗就給重試按鈕。
  const GUARDED={'fish-today-map-refresh':'fish-today-map-result','fish-today-refresh':'fish-today-result','fish-whitefish-refresh':'fish-whitefish-hotspot-result'};
  const WAIT_LIMIT_MS=180000;
  let waitTimer=0,waitFor=null;
  function catalogCount(){try{return window.FF14Fishing?.catalog()?.length||0}catch{return 0}}
  function loadFailed(){return window.__fishCatalogState==='failed'}
  function showWaiting(id){
    const box=$(GUARDED[id]);if(!box)return;
    box.innerHTML=loadFailed()
      ?'<div class="fish-wait">魚圖鑑資料讀取失敗，所以還沒辦法推薦。可能是 XIVAPI 暫時連不上。<button type="button" class="fish-primary" data-fish-retry>重新讀取魚資料</button></div>'
      :'<div class="fish-wait"><span class="fish-spinner" aria-hidden="true"></span>正在下載魚圖鑑資料（第一次開啟需要一點時間），讀好後會自動幫你算。</div>';
  }
  function waitThenRun(id){
    waitFor=id;showWaiting(id);clearInterval(waitTimer);const started=Date.now();let failedShown=loadFailed();
    waitTimer=setInterval(()=>{
      if(catalogCount()){clearInterval(waitTimer);const b=$(waitFor);waitFor=null;b?.click();return}
      const failed=loadFailed();if(failed!==failedShown){failedShown=failed;showWaiting(waitFor)}
      if(Date.now()-started>WAIT_LIMIT_MS)clearInterval(waitTimer);
    },800);
  }
  document.addEventListener('click',e=>{
    const retry=e.target.closest?.('[data-fish-retry]');
    if(retry){e.preventDefault();const id=waitFor||'fish-today-map-refresh';try{if(typeof refreshFishCatalog==='function')refreshFishCatalog(true)}catch{}waitThenRun(id);return}
    const b=e.target.closest?.('button');if(!b||!GUARDED[b.id]||catalogCount())return;
    e.preventDefault();e.stopImmediatePropagation();waitThenRun(b.id);
  },true);

  // 「沒有限時魚的時候」那個摺疊區塊，裡面有東西才顯示。
  const moreBody=$('fish-more-tools-body'),more=$('fish-more-tools');
  if(moreBody&&more){const sync=()=>{more.hidden=!moreBody.children.length};new MutationObserver(sync).observe(moreBody,{childList:true});sync()}

  // ---- 樣式 ----
  function addStyle(id,css){if($(id))return;const s=document.createElement('style');s.id=id;s.textContent=css;document.head.appendChild(s)}
  const TODAY_CSS=`
      .fish-today-card{margin:14px 0;padding:14px;border:1px solid var(--border,#d8d8df);border-radius:12px}.fish-today-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}.fish-today-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.fish-today-session-label{display:flex;flex-direction:row;align-items:center;gap:6px;font-size:13px}.fish-today-session-label select{padding:7px 8px}.fish-today-result{margin-top:12px;display:grid;gap:9px}.today-spot-row{padding:11px 12px;border-radius:10px;background:rgba(127,127,127,.07)}.today-spot-row.top-pick{outline:2px solid rgba(52,168,83,.35);background:rgba(52,168,83,.06)}.today-pick-label{display:inline-block;margin-bottom:7px;padding:3px 8px;border-radius:999px;background:rgba(52,168,83,.14);font-size:12px;font-weight:800}.today-spot-top{display:flex;gap:10px;align-items:baseline;justify-content:space-between;flex-wrap:wrap}.today-spot-name{font-weight:800}.today-spot-place{font-size:13px}.today-spot-count{font-weight:800;text-align:right}.today-spot-score{font-size:12px;font-weight:600}.today-spot-fish{margin-top:5px;font-size:13px}.today-spot-current{margin-top:8px;padding:7px 9px;border-radius:8px;background:rgba(52,168,83,.10);font-size:13px;line-height:1.5}.today-spot-current-label{font-weight:800}.today-spot-soon{margin-top:5px;font-size:13px}.today-spot-window{font-weight:700}.today-spot-prep{margin-top:8px;padding:7px 9px;border-radius:8px;background:rgba(245,166,35,.12);font-size:13px;line-height:1.5}.today-spot-prep-label{font-weight:800}.today-fish-king{font-size:11px;padding:2px 6px;border:1px solid currentColor;border-radius:999px;margin-left:4px}.today-fish-empty{padding:8px 0}.today-fish-summary{font-size:13px}.today-spot-tags{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:5px}.today-spot-tag{appearance:none;border:1px solid currentColor;background:transparent;color:inherit;border-radius:999px;padding:3px 8px;font:inherit;font-size:12px;cursor:pointer}.today-spot-tag:hover{text-decoration:underline}.today-spot-tag.has-window{font-weight:800}.today-spot-tag.prep-window{font-weight:700}.today-spot-tag.no-window{opacity:.68}
      @media(max-width:980px){.fish-today-card{padding:12px}.fish-today-head{gap:10px}.fish-today-actions{width:100%;justify-content:space-between}.today-spot-top{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start}.today-spot-fish{line-height:1.55}.today-spot-current,.today-spot-soon,.today-spot-prep{line-height:1.55}}
      @media(max-width:650px){.fish-today-card{margin-inline:-2px;padding:11px}.fish-today-actions{align-items:stretch;display:grid;grid-template-columns:1fr 1fr}.fish-today-session-label{grid-column:1/-1;justify-content:space-between}.fish-today-session-label select{min-height:40px}.fish-today-actions button{min-height:42px}.today-spot-row{padding:12px}.today-spot-top{grid-template-columns:1fr}.today-spot-count{text-align:left;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.today-spot-score{display:inline}.today-spot-tag{min-height:34px;padding:6px 10px}.today-spot-fish{margin-top:8px}.today-spot-current,.today-spot-soon,.today-spot-prep{margin-top:8px}.today-spot-soon{padding-top:7px;border-top:1px solid rgba(127,127,127,.18)}}
    `;
  const MAP_CSS=`
      .fish-map-recommend-result{margin-top:12px;padding-bottom:12px;border-bottom:1px solid rgba(127,127,127,.16)}
      .today-map-row{padding:12px;border-radius:10px;background:rgba(127,127,127,.07)}
      .today-map-row.top-pick{outline:2px solid rgba(52,168,83,.35);background:rgba(52,168,83,.06)}
      .today-map-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
      .today-map-name{font-weight:850;font-size:16px}.today-map-region{font-size:12px}.today-map-score{text-align:right;font-weight:800}.today-map-meta{margin-top:7px;font-size:13px;display:flex;gap:10px;flex-wrap:wrap}.today-map-spots{margin-top:8px;display:grid;gap:5px}.today-map-spot{font-size:13px;padding:6px 8px;border-radius:8px;background:rgba(127,127,127,.06)}
      .today-map-window{margin-top:7px;font-size:13px;line-height:1.5}.today-map-action{margin-top:8px}.today-map-action button{min-height:34px}
      @media(max-width:650px){.today-map-top{display:grid;grid-template-columns:1fr}.today-map-score{text-align:left}.today-map-meta{gap:7px}.today-map-action button{width:100%;min-height:42px}}
    `;
  const WHITEFISH_CSS=`
      .fish-whitefish-hotspot{margin:14px 0;padding:14px;border:1px solid var(--border,#d8d8df);border-radius:12px}
      .fish-whitefish-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
      .fish-whitefish-result{margin-top:10px;display:grid;gap:7px}
      .whitefish-map-row{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 11px;border-radius:10px;background:rgba(127,127,127,.07)}
      .whitefish-map-row:first-child{outline:2px solid rgba(52,168,83,.35);background:rgba(52,168,83,.06)}
      .whitefish-rank{font-size:12px;font-weight:800;text-align:center}
      .whitefish-map-name{font-weight:800}.whitefish-region{font-size:12px}.whitefish-count{font-size:18px;font-weight:900;white-space:nowrap}
      .whitefish-names{grid-column:2/-1;font-size:12px;line-height:1.45}
      @media(max-width:650px){.whitefish-map-row{grid-template-columns:30px minmax(0,1fr) auto;padding:10px}.whitefish-count{font-size:16px}.fish-whitefish-head button{min-height:40px}}
    `;

  window.renderTodayFishingMap=renderMap;
  window.addEventListener('DOMContentLoaded',()=>{
    addStyle('fish-today-style',TODAY_CSS);addStyle('fish-map-recommend-style',MAP_CSS);ensureCard();
    addStyle('fish-whitefish-hotspot-style',WHITEFISH_CSS);ensureWhitefishBox();scheduleWhitefish();
    document.addEventListener('ff14-fish-catalog-rendered',scheduleWhitefish);
    document.addEventListener('click',e=>{if(e.target?.closest?.('[data-caught],[data-skip]'))setTimeout(scheduleWhitefish,60)},true);
  });
})();
