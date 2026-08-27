// Today fishing recommendations: recommend productive fishing spots for the current play session.
(function(){
  'use strict';

  const LIMIT=5;
  const DEFAULT_SESSION_MIN=90;
  const CURRENT_WINDOW_WEIGHT=3;
  const SOON_WINDOW_WEIGHT=2;
  const PREP_CURRENT_WEIGHT=2;
  const PREP_SOON_WEIGHT=1;
  let renderToken=0;

  function read(key,def){try{return JSON.parse(localStorage.getItem(key))??def}catch{return def}}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function itemText(v){const s=String(v||'');try{return typeof window.ff14TcItemText==='function'?window.ff14TcItemText(s):s}catch{return s}}
  function placeText(v){const s=String(v||'');try{return typeof window.ff14TcPlaceText==='function'?window.ff14TcPlaceText(s):s}catch{return s}}
  function fmtDuration(ms){if(!Number.isFinite(ms)||ms<0)return'—';const min=Math.max(0,Math.round(ms/60000));if(min<60)return`${min} 分`;const h=Math.floor(min/60),m=min%60;return m?`${h} 小時 ${m} 分`:`${h} 小時`}
  function fmtClock(ms){return new Date(ms).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}
  function idOf(v){return Number(v&&typeof v==='object'?(v.id??v.itemId??v.fishId):v)}
  function uniqueInts(values){return new Set((values||[]).map(idOf).filter(Number.isFinite))}
  function caught(){
    try{if(typeof window.getCaughtIds==='function')return uniqueInts(window.getCaughtIds())}catch{}
    return uniqueInts([...(read('fishcakeCaughtIds',[])||[]),...(read('fishCaughtIds',[])||[])])
  }
  function skipped(){
    try{if(typeof window.getSkippedIds==='function')return uniqueInts(window.getSkippedIds())}catch{}
    return uniqueInts(read('fishSkippedIds',[])||[])
  }
  function sessionMinutes(){const n=Number(document.getElementById('fish-today-session')?.value);return Number.isFinite(n)&&n>0?n:DEFAULT_SESSION_MIN}

  function fishLocations(fish){
    if(typeof window.fishLocations==='function')return window.fishLocations(fish);
    return Array.isArray(fish?.spots)&&fish.spots.length?fish.spots:[fish];
  }

  function locationsFor(fish,info){
    const spots=fishLocations(fish);
    if(!info?.restricted||!Number(info.locationId))return spots;
    const exact=spots.filter(x=>Number(x?.spotId)===Number(info.locationId));
    return exact.length?exact:spots;
  }

  function spotKey(loc){
    const id=Number(loc?.spotId)||0;
    return id?`id:${id}`:`name:${loc?.regionName||''}|${loc?.zoneName||''}|${loc?.spotName||''}`;
  }

  function groupFor(groups,loc){
    const key=spotKey(loc);
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

  function ensureBox(){
    let box=document.getElementById('fish-today-result');
    if(box)return box;
    const summary=document.getElementById('fish-map-summary');if(!summary)return null;
    const section=document.createElement('div');section.className='fish-today-card';
    section.innerHTML=`<div class="fish-today-head"><div><strong>今天釣什麼</strong><div class="muted">用你這次能玩的時間，直接判斷現在先去哪個漁場；未釣正在窗口 ×${CURRENT_WINDOW_WEIGHT}、時段內會開窗 ×${SOON_WINDOW_WEIGHT}、普通魚 ×1。已釣魚排除，只有未完成目標需要的直感前置窗口會例外提醒。</div></div><div class="fish-today-actions"><label class="fish-today-session-label">可釣時間<select id="fish-today-session"><option value="60">60 分</option><option value="90" selected>90 分</option><option value="120">120 分</option></select></label><label class="inline-check"><input id="fish-today-big" type="checkbox"> 包含魚王</label><button id="fish-today-refresh" type="button">現在去哪釣</button></div></div><div id="fish-today-result" class="fish-today-result"><span class="muted">要開始釣時再按「現在去哪釣」計算。</span></div>`;
    summary.insertAdjacentElement('afterend',section);
    section.querySelector('#fish-today-refresh').addEventListener('click',render);
    return section.querySelector('#fish-today-result');
  }

  function addStyles(){
    if(document.getElementById('fish-today-style'))return;
    const s=document.createElement('style');s.id='fish-today-style';s.textContent=`
      .fish-today-card{margin:14px 0;padding:14px;border:1px solid var(--border,#d8d8df);border-radius:12px}.fish-today-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}.fish-today-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.fish-today-session-label{display:flex;flex-direction:row;align-items:center;gap:6px;font-size:13px}.fish-today-session-label select{padding:7px 8px}.fish-today-result{margin-top:12px;display:grid;gap:9px}.today-spot-row{padding:11px 12px;border-radius:10px;background:rgba(127,127,127,.07)}.today-spot-row.top-pick{outline:2px solid rgba(52,168,83,.35);background:rgba(52,168,83,.06)}.today-pick-label{display:inline-block;margin-bottom:7px;padding:3px 8px;border-radius:999px;background:rgba(52,168,83,.14);font-size:12px;font-weight:800}.today-spot-top{display:flex;gap:10px;align-items:baseline;justify-content:space-between;flex-wrap:wrap}.today-spot-name{font-weight:800}.today-spot-place{font-size:13px}.today-spot-count{font-weight:800;text-align:right}.today-spot-score{font-size:12px;font-weight:600}.today-spot-fish{margin-top:5px;font-size:13px}.today-spot-current{margin-top:8px;padding:7px 9px;border-radius:8px;background:rgba(52,168,83,.10);font-size:13px;line-height:1.5}.today-spot-current-label{font-weight:800}.today-spot-soon{margin-top:5px;font-size:13px}.today-spot-window{font-weight:700}.today-spot-prep{margin-top:8px;padding:7px 9px;border-radius:8px;background:rgba(245,166,35,.12);font-size:13px;line-height:1.5}.today-spot-prep-label{font-weight:800}.today-fish-king{font-size:11px;padding:2px 6px;border:1px solid currentColor;border-radius:999px;margin-left:4px}.today-fish-empty{padding:8px 0}.today-fish-summary{font-size:13px}.today-spot-tags{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:5px}.today-spot-tag{appearance:none;border:1px solid currentColor;background:transparent;color:inherit;border-radius:999px;padding:3px 8px;font:inherit;font-size:12px;cursor:pointer}.today-spot-tag:hover{text-decoration:underline}.today-spot-tag.has-window{font-weight:800}.today-spot-tag.prep-window{font-weight:700}.today-spot-tag.no-window{opacity:.68}
      @media(max-width:980px){.fish-today-card{padding:12px}.fish-today-head{gap:10px}.fish-today-actions{width:100%;justify-content:space-between}.today-spot-top{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start}.today-spot-fish{line-height:1.55}.today-spot-current,.today-spot-soon,.today-spot-prep{line-height:1.55}}
      @media(max-width:650px){.fish-today-card{margin-inline:-2px;padding:11px}.fish-today-actions{align-items:stretch;display:grid;grid-template-columns:1fr 1fr}.fish-today-session-label{grid-column:1/-1;justify-content:space-between}.fish-today-session-label select{min-height:40px}.fish-today-actions button{min-height:42px}.today-spot-row{padding:12px}.today-spot-top{grid-template-columns:1fr}.today-spot-count{text-align:left;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.today-spot-score{display:inline}.today-spot-tag{min-height:34px;padding:6px 10px}.today-spot-fish{margin-top:8px}.today-spot-current,.today-spot-soon,.today-spot-prep{margin-top:8px}.today-spot-soon{padding-top:7px;border-top:1px solid rgba(127,127,127,.18)}}
    `;document.head.appendChild(s);
  }

  function fishLabel(fish){return `${esc(itemText(fish.name||`Item ${fish.itemId}`))}${fish.bigFish?'<span class="today-fish-king">魚王</span>':''}`}
  function prepTargetsText(targets){return targets.map(x=>`${fishLabel(x.fish)}${x.count>1?` ×${x.count}`:''}`).join('、')}
  function bindSpotTags(root){
    root.querySelectorAll('[data-today-spot]').forEach(tag=>tag.addEventListener('click',()=>{
      if(typeof window.selectFishingSpot==='function')window.selectFishingSpot(tag.dataset.region||'',tag.dataset.zone||'',tag.dataset.spot||'');
    }));
  }

  async function render(){
    const box=ensureBox();if(!box)return;
    const my=++renderToken,includeBig=!!document.getElementById('fish-today-big')?.checked,minutes=sessionMinutes(),now=Date.now(),sessionEnd=now+minutes*60000,catalog=read('fishCatalog',[])||[],done=caught(),skip=skipped();
    if(typeof window.ff14FishingWindowInfo!=='function'){
      box.innerHTML='<span class="muted">魚窗資料尚未準備好，請稍後再按一次。</span>';return;
    }
    box.innerHTML='<span class="muted">正在判斷現在去哪裡最划算…</span>';

    const catalogById=new Map(catalog.map(f=>[Number(f?.itemId),f]).filter(([id])=>Number.isFinite(id)&&id>0));
    const base=catalog.filter(f=>Number(f?.itemId)>0&&f?.type!=='spearfishing'&&!done.has(Number(f.itemId))&&!skip.has(Number(f.itemId))&&(includeBig||!f.bigFish));
    const groups=new Map(),prereqNeeds=new Map();

    for(const fish of base){
      const fishId=Number(fish.itemId),info=await window.ff14FishingWindowInfo(fishId,now);if(my!==renderToken)return;
      if(info){
        const availableNow=!info.restricted||!!info.current;
        const soon=!!(info.restricted&&!info.current&&info.next&&info.next[0]<sessionEnd&&info.waitMs<=minutes*60000);
        for(const loc of locationsFor(fish,info)){
          const g=groupFor(groups,loc),id=fishId;
          if(info.restricted)g.windowFish.set(id,{fish,info});
          if(availableNow)g.nowFish.set(id,{fish,info});
          if(soon){g.soonFish.set(id,{fish,info});g.earliestSoon=Math.min(g.earliestSoon,info.next[0])}
        }
      }

      if(typeof window.ff14FishingPrerequisites==='function'){
        const reqs=await window.ff14FishingPrerequisites(fishId);if(my!==renderToken)return;
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
      const info=await window.ff14FishingWindowInfo(Number(predId),now);if(my!==renderToken)return;
      if(!info?.restricted)continue;
      const current=!!info.current,soon=!!(!current&&info.next&&info.next[0]<sessionEnd&&info.waitMs<=minutes*60000);
      if(!current&&!soon)continue;
      const entry={fish,info,targets:[...need.targets.values()]};
      for(const loc of locationsFor(fish,info)){
        const g=groupFor(groups,loc);
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

    if(my!==renderToken)return;
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

  function init(){addStyles();ensureBox()}
  window.renderTodayFishing=render;
  window.addEventListener('DOMContentLoaded',init);
})();
