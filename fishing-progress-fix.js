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

  queueMicrotask(()=>{try{window.renderFish()}catch(e){console.warn('live fishing progress render failed',e)}});
})();
