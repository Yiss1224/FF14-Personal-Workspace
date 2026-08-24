// Keep the live fishing progress card in sync with caught IDs and saved progress.
(function(){
  'use strict';

  window.renderFish=function(){
    const result=document.getElementById('fish-result');
    const sum=document.getElementById('fish-summary');
    const hist=document.getElementById('fish-history');
    const s=typeof fishStats==='function'?fishStats():null;
    const known=typeof getCaughtIds==='function'?getCaughtIds().length:0;

    if(!s){
      const count=typeof currentFishCount==='function'?currentFishCount():known;
      const countInput=document.getElementById('fish-count');
      if(countInput)countInput.value=count||300;
      if(result)result.innerHTML=`魚糕／手動已知 ID：<strong>${known}</strong>。先按「記錄今天」建立 ETA 基準。`;
      if(sum)sum.innerHTML='尚未建立 ETA';
      if(hist)hist.innerHTML='—';
      return;
    }

    const current=Math.max(
      Number(s.count)||0,
      typeof currentFishCount==='function'?(Number(currentFishCount())||0):0,
      known
    );
    const target=Math.max(1,Number(s.target)||1140);
    const remaining=Math.max(0,target-current);
    const pct=Math.min(100,current/target*100);
    const days=Number(s.use)>0?Math.ceil(remaining/Number(s.use)):null;
    const eta=days==null?'資料不足':`${days} 天（約 ${addDays(days)}）`;

    const countInput=document.getElementById('fish-count');
    const targetInput=document.getElementById('fish-target');
    if(countInput)countInput.value=current;
    if(targetInput)targetInput.value=target;

    // Preserve the highest known live count even when the latest history row is older.
    try{store.set('fishCurrentCount',current)}catch{}

    if(result)result.innerHTML=`<strong>${current} / ${target}</strong>　${pct.toFixed(1)}%<div class="progress"><div style="width:${pct}%"></div></div><br>魚種 ID 已知：${known}<br>3日平均：${s.r3==null?'—':s.r3.toFixed(1)+' 種/天'}<br>7日平均：${s.r7==null?'—':s.r7.toFixed(1)+' 種/天'}<br>剩餘：${remaining} 種<br><span class="good">預估：${eta}</span><br><span class="muted">魚糕可能漏記；而且越到後期通常越難，線性 ETA 可能偏樂觀。</span>`;
    if(sum)sum.innerHTML=`${current} / ${target}<br>7日平均 ${s.r7==null?'—':s.r7.toFixed(1)+'/天'}<br><strong>${eta}</strong>`;

    if(hist){
      const rows=(typeof getFishHistory==='function'?getFishHistory():[]).slice().reverse().slice(0,14);
      hist.innerHTML='<table><tr><th>日期</th><th>魚種</th></tr>'+rows.map(x=>`<tr><td>${esc(x.date)}</td><td>${x.count}</td></tr>`).join('')+'</table>';
    }
  };

  // Ocean Fishing is not an overworld "run from spot to spot" activity, so keep it
  // in the catalog/method panels but remove it from the normal route planner.
  const oceanNames=new Set([
    'the high seas','high seas','the endeavor','endeavor',
    'galadion bay','the southern strait of merlthor','southern strait of merlthor',
    'the northern strait of merlthor','northern strait of merlthor','rhotano sea',
    'the cieldalaes','cieldalaes','rothlyt sound','the bloodbrine sea','bloodbrine sea',
    'the sirensong sea','sirensong sea','公海','海釣','遠洋漁業'
  ]);
  const norm=v=>String(v??'').trim().toLowerCase();
  const oceanText=v=>{
    const s=norm(v);
    return !!s&&(oceanNames.has(s)||s.includes('ocean fishing')||s.includes('the endeavor')||s.includes('high seas'));
  };
  const oceanStop=stop=>!!stop&&(oceanText(stop.regionName)||oceanText(stop.zoneName)||oceanText(stop.spotName));

  // The location picker is authoritative. Search text is useful for free search, but
  // when a region/map/spot is selected the route planner must never leak in another map.
  function pickerSelection(){
    return {
      region:document.getElementById('fish-picker-region')?.value||'',
      zone:document.getElementById('fish-picker-zone')?.value||'',
      spot:document.getElementById('fish-picker-spot')?.value||''
    };
  }
  function matchesPicker(stop){
    const p=pickerSelection();
    if(p.region&&String(stop?.regionName||'')!==p.region)return false;
    if(p.zone&&String(stop?.zoneName||'')!==p.zone)return false;
    if(p.spot&&String(stop?.spotName||'')!==p.spot)return false;
    return true;
  }

  if(typeof window.fgBuildSpotPlan==='function'){
    const baseBuildSpotPlan=window.fgBuildSpotPlan;
    window.fgBuildSpotPlan=function(){
      return (baseBuildSpotPlan.apply(this,arguments)||[])
        .filter(stop=>!oceanStop(stop))
        .filter(matchesPicker);
    };
  }
  window.isOceanFishingRouteStop=oceanStop;

  // cloud.js used substring replacement, so "Thavnair" could turn
  // "The Thavnairian Coast" into "The 薩維奈島ian Coast". Keep replacement only
  // when the English term is not embedded inside another ASCII word.
  function regexEsc(v){return String(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
  if(typeof ff14TcReplaceTextNode==='function'&&typeof ff14TcCache!=='undefined'){
    ff14TcReplaceTextNode=function(node){
      const raw=node?.nodeValue;
      if(!raw||!/[A-Za-z]/.test(raw))return;
      let next=raw;
      const maps=[ff14TcCache.itemEnglish||{},ff14TcCache.places||{},ff14TcCache.weather||{}];
      for(const map of maps){
        for(const [en,tc] of Object.entries(map)){
          if(!en||!tc||!next.includes(en))continue;
          const re=new RegExp(`(^|[^A-Za-z])${regexEsc(en)}(?=$|[^A-Za-z])`,'g');
          next=next.replace(re,(match,prefix)=>prefix+tc);
        }
      }
      if(next!==raw)node.nodeValue=next;
    };
  }

  function rerenderRoute(){
    try{if(typeof window.renderRoutePlanner==='function')window.renderRoutePlanner()}catch(e){console.warn('route planner refresh failed',e)}
    // Re-apply TC after route HTML is freshly rebuilt.
    setTimeout(()=>{try{if(typeof ff14TcApply==='function')ff14TcApply()}catch{}},0);
  }

  document.addEventListener('change',e=>{
    if(['fish-picker-region','fish-picker-zone','fish-picker-spot'].includes(e.target?.id))setTimeout(rerenderRoute,0);
  });

  queueMicrotask(()=>{
    try{window.renderFish()}catch(e){console.warn('live fishing progress render failed',e)}
    rerenderRoute();
  });
})();
