// Keep the live fishing progress card in sync with caught IDs and saved progress.
(function(){
  'use strict';

  const APP_VERSION='v2026.09.07.54';
  const version=document.querySelector('header p');
  if(version)version.textContent=version.textContent.replace(/v\d{4}\.\d{2}\.\d{2}\.\d+$/,APP_VERSION);

  window.renderFish=function(){
    const result=document.getElementById('fish-result');
    const sum=document.getElementById('fish-summary');
    const hist=document.getElementById('fish-history');
    const s=typeof fishStats==='function'?fishStats():null;
    const known=typeof getCaughtIds==='function'?getCaughtIds().length:0;

    if(!s){
      const count=typeof currentFishCount==='function'?currentFishCount():known;
      const countInput=document.getElementById('fish-count');
      if(countInput)countInput.value=count||'';
      if(result)result.innerHTML=`已知已釣：<strong>${known}</strong> 種。按「記錄今天」開始記錄，累積幾天後就能估算完成日期。`;
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

    try{store.set('fishCurrentCount',current)}catch{}

    if(result)result.innerHTML=`<strong>${current} / ${target}</strong>　${pct.toFixed(1)}%<div class="progress"><div style="width:${pct}%"></div></div><br>魚種 ID 已知：${known}<br>3日平均：${s.r3==null?'—':s.r3.toFixed(1)+' 種/天'}<br>7日平均：${s.r7==null?'—':s.r7.toFixed(1)+' 種/天'}<br>剩餘：${remaining} 種<br><span class="good">預估：${eta}</span><br><span class="muted">魚糕可能漏記；而且越到後期通常越難，線性 ETA 可能偏樂觀。</span>`;
    if(sum)sum.innerHTML=`${current} / ${target}<br>7日平均 ${s.r7==null?'—':s.r7.toFixed(1)+'/天'}<br><strong>${eta}</strong>`;

    if(hist){
      const rows=(typeof getFishHistory==='function'?getFishHistory():[]).slice().reverse().slice(0,14);
      hist.innerHTML='<table><tr><th>日期</th><th>魚種</th></tr>'+rows.map(x=>`<tr><td>${esc(x.date)}</td><td>${x.count}</td></tr>`).join('')+'</table>';
    }
  };

  // Compatibility alias; policy and matching live in the shared fishing runtime.
  window.isOceanFishingRouteStop=window.FF14Fishing.isOceanLocation;

  // ff14TcReplaceTextNode lives in tc-terms.js (longest-name-first). An older override here
  // replaced names in ID order and produced "Northeast 石綠湖"; do not re-add it.

  // The picker lives in fishing-ui-v2.js; read its selects directly. (This used to call a helper that
  // was never defined, so every picker change threw before the route refresh below could run.)
  function pickerSelection(){
    const v=id=>String(document.getElementById(id)?.value||'');
    return {region:v('fish-picker-region'),zone:v('fish-picker-zone'),spot:v('fish-picker-spot')};
  }

  function hasCurrentSessionRoute(){
    const model=window.__fishingSessionRouteModel,p=pickerSelection();
    return !!(model?.stops?.length&&(!p.region||!model.region||model.region===p.region)&&(!p.zone||!model.zone||model.zone===p.zone));
  }

  function rerenderRoute(){
    try{
      if(hasCurrentSessionRoute())window.refreshFishingSessionRouteMap?.();
      else if(typeof window.renderRoutePlanner==='function')window.renderRoutePlanner();
    }catch(e){console.warn('route planner refresh failed',e)}
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
