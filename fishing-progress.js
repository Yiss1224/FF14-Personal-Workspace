// 釣魚進度：已釣／先跳過的魚 ID、每日紀錄與完成日預估、魚糕 JSON 匯入匯出、第一次使用引導。
//
// localStorage（經 app.js 的 store → ff14-data.js）：
//   fishCaughtIds / fishcakeCaughtIds  已釣魚的 Item ID（兩個鍵內容相同，讀取時取聯集）
//   fishSkippedIds                     先跳過的魚
//   fishHistory                        [{date,count,target}] 每天按「記錄今天」存一筆
//   fishTarget / fishCurrentCount      目標數與目前數
//   fishOnboardingDismissed            '1' = 引導卡已收起（直接存字串，不經 store）
(function(){
  'use strict';
  const $=id=>document.getElementById(id);

  // ---- 已釣／先跳過 ----
  function getCaughtIds(){return uniqInts([...(store.get('fishcakeCaughtIds',[])||[]),...(store.get('fishCaughtIds',[])||[])])}
  function setCaughtIds(ids){const u=uniqInts(ids);store.set('fishCaughtIds',u);store.set('fishcakeCaughtIds',u)}
  function getSkippedIds(){return uniqInts(store.get('fishSkippedIds',[]))}

  // ---- 每日紀錄與預估 ----
  function getFishHistory(){return store.get('fishHistory',[])}
  function currentFishCount(){
    const explicit=Number(store.get('fishCurrentCount',0))||0,h=getFishHistory(),hist=h.length?Number(h[h.length-1].count)||0:0;
    return Math.max(explicit,hist,getCaughtIds().length);
  }
  function saveFish(){
    const entered=Math.max(0,+$('fish-count').value||0),count=Math.max(entered,getCaughtIds().length),target=Math.max(1,+$('fish-target').value||1140);
    const h=getFishHistory(),i=h.findIndex(x=>x.date===today()),rec={date:today(),count,target};
    if(i>=0)h[i]=rec;else h.push(rec);
    h.sort((a,b)=>a.date.localeCompare(b.date));
    store.set('fishHistory',h);store.set('fishTarget',target);store.set('fishCurrentCount',count);
    renderFish();
  }
  // 速度優先用 7 日平均，其次 3 日，最後才用全部紀錄。
  function fishStats(){
    const h=getFishHistory();if(!h.length)return null;
    const last=h[h.length-1],target=store.get('fishTarget',last.target||1140);
    function rate(days){
      const cutoff=new Date();cutoff.setDate(cutoff.getDate()-days);
      const rows=h.filter(x=>new Date(x.date+'T00:00:00')>=cutoff);
      if(rows.length<2)return null;
      const first=rows[0],end=rows[rows.length-1],span=Math.max(1,(new Date(end.date)-new Date(first.date))/86400000);
      return(end.count-first.count)/span;
    }
    const r3=rate(3),r7=rate(7),all=h.length>1?(last.count-h[0].count)/Math.max(1,(new Date(last.date)-new Date(h[0].date))/86400000):null,use=r7??r3??all;
    return{count:last.count,target,r3,r7,all,use,remaining:Math.max(0,target-last.count),days:use>0?Math.ceil(Math.max(0,target-last.count)/use):null};
  }

  // 進度卡（釣魚分頁）與首頁的「釣魚 ETA」。目前數取「最後一筆紀錄、手動輸入、已知魚 ID 數」三者最大值。
  function renderFish(){
    const result=$('fish-result'),sum=$('fish-summary'),hist=$('fish-history'),countInput=$('fish-count'),targetInput=$('fish-target');
    const s=fishStats(),known=getCaughtIds().length;
    if(!s){
      const count=currentFishCount();
      if(countInput)countInput.value=count||'';
      if(result)result.innerHTML=`已知已釣：<strong>${known}</strong> 種。按「記錄今天」開始記錄，累積幾天後就能估算完成日期。`;
      if(sum)sum.innerHTML='尚未建立 ETA';
      if(hist)hist.innerHTML='—';
      return;
    }
    const current=Math.max(Number(s.count)||0,Number(currentFishCount())||0,known);
    const target=Math.max(1,Number(s.target)||1140),remaining=Math.max(0,target-current),pct=Math.min(100,current/target*100);
    const days=Number(s.use)>0?Math.ceil(remaining/Number(s.use)):null,eta=days==null?'資料不足':`${days} 天（約 ${addDays(days)}）`;
    if(countInput)countInput.value=current;
    if(targetInput)targetInput.value=target;
    try{store.set('fishCurrentCount',current)}catch{}
    if(result)result.innerHTML=`<strong>${current} / ${target}</strong>　${pct.toFixed(1)}%<div class="progress"><div style="width:${pct}%"></div></div><br>魚種 ID 已知：${known}<br>3日平均：${s.r3==null?'—':s.r3.toFixed(1)+' 種/天'}<br>7日平均：${s.r7==null?'—':s.r7.toFixed(1)+' 種/天'}<br>剩餘：${remaining} 種<br><span class="good">預估：${eta}</span><br><span class="muted">魚糕可能漏記；而且越到後期通常越難，線性 ETA 可能偏樂觀。</span>`;
    if(sum)sum.innerHTML=`${current} / ${target}<br>7日平均 ${s.r7==null?'—':s.r7.toFixed(1)+'/天'}<br><strong>${eta}</strong>`;
    if(hist){
      const rows=getFishHistory().slice().reverse().slice(0,14);
      hist.innerHTML='<table><tr><th>日期</th><th>魚種</th></tr>'+rows.map(x=>`<tr><td>${esc(x.date)}</td><td>${x.count}</td></tr>`).join('')+'</table>';
    }
  }

  // ---- 魚糕 JSON ----
  // 匯入採聯集：魚糕偶爾漏記，不能因為下一次匯入少了就把手動勾的魚刪掉。
  function importFishcake(file){
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const raw=JSON.parse(reader.result);let ids=[];
        if(Array.isArray(raw))ids=raw;
        else for(const k of['completed','caught','caughtFish','fish','fishIds','caughtFishIds'])if(Array.isArray(raw?.[k])){ids=raw[k];break}
        const imported=uniqInts(ids);if(!imported.length)throw new Error('找不到 completed 魚 ID 陣列');
        const before=getCaughtIds(),merged=uniqInts([...before,...imported]),added=merged.length-before.length;
        setCaughtIds(merged);
        const keepCount=Math.max(+$('fish-count').value||0,currentFishCount(),merged.length);
        $('fish-count').value=keepCount;store.set('fishCurrentCount',keepCount);
        $('fish-import-status').innerHTML=`魚糕格式已辨識：<code>{"completed":[…]}</code>。本次讀到 ${imported.length} 個 ID，合併後 ${merged.length} 個（新增 ${added}）。<br><span class="muted">採聯集，不會因下一次魚糕漏記而把你手動確認的魚刪掉。未記錄仍只代表「待確認」。</span>`;
        saveFish();window.renderFishCatalog?.();
      }catch(e){$('fish-import-status').textContent='匯入失敗：'+e.message}
    };
    reader.readAsText(file);
  }
  function exportFishcake(){
    const completed=getCaughtIds().slice().sort((a,b)=>a-b),blob=new Blob([JSON.stringify({completed},null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`fishcake-completed-${today()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
    const status=$('fish-import-status');
    if(status)status.innerHTML=`已匯出 <strong>${completed.length}</strong> 個已知魚種 ID。<br><span class="muted">格式：<code>{"completed":[…]}</code>；包含魚糕匯入與本工具手動標記的聯集，不會因多釣場重複。</span>`;
  }

  // ---- 第一次使用引導：還沒有任何已釣紀錄、也沒按過「知道了」時顯示 ----
  const ONBOARD_KEY='fishOnboardingDismissed';
  let forceOpen=false;
  function dismissed(){try{return localStorage.getItem(ONBOARD_KEY)==='1'}catch{return false}}
  function setDismissed(v){try{if(v)localStorage.setItem(ONBOARD_KEY,'1');else localStorage.removeItem(ONBOARD_KEY)}catch{}}
  function updateOnboarding(){const box=$('fish-onboarding');if(box)box.hidden=!(forceOpen||(!dismissed()&&getCaughtIds().length===0))}
  function scrollToEl(el){if(el)el.scrollIntoView({behavior:'smooth',block:'start'})}
  function initOnboarding(){
    const box=$('fish-onboarding');if(!box)return;
    $('fish-onboard-close')?.addEventListener('click',()=>{forceOpen=false;setDismissed(true);updateOnboarding()});
    $('fish-onboard-open')?.addEventListener('click',()=>{forceOpen=true;setDismissed(false);updateOnboarding();scrollToEl(box)});
    box.addEventListener('click',e=>{
      const b=e.target.closest('[data-fish-onboard]');if(!b)return;
      const act=b.dataset.fishOnboard;
      if(act==='import')$('import-fishcake')?.click();
      else if(act==='today')scrollToEl(document.querySelector('.fish-today-card')||$('fish-today-slot'));
      else if(act==='map')scrollToEl($('fish-explore-title')?.closest('.section-head'));
    });
    // 進度卡一重畫（匯入、勾魚、還原備份）就重新判斷要不要顯示。
    const res=$('fish-result');if(res)new MutationObserver(updateOnboarding).observe(res,{childList:true});
    window.addEventListener('ff14-data-restored',updateOnboarding);
    updateOnboarding();
  }

  Object.assign(window,{getCaughtIds,setCaughtIds,getSkippedIds,getFishHistory,currentFishCount,fishStats,renderFish});

  $('save-fish').onclick=saveFish;
  $('import-fishcake').onclick=()=>$('fishcake-file').click();
  $('export-fishcake').onclick=exportFishcake;
  $('fishcake-file').onchange=e=>{if(e.target.files[0])importFishcake(e.target.files[0]);e.target.value=''};
  renderFish();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initOnboarding);else initOnboarding();
})();
