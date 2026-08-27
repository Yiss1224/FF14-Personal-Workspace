// Today fishing recommendations: focus on uncaught window-limited fish, with optional big fish.
(function(){
  'use strict';

  const LIMIT=5;
  let renderToken=0,timer=null;

  function read(key,def){try{return JSON.parse(localStorage.getItem(key))??def}catch{return def}}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function itemText(v){const s=String(v||'');try{return typeof window.ff14TcItemText==='function'?window.ff14TcItemText(s):s}catch{return s}}
  function placeText(v){const s=String(v||'');try{return typeof window.ff14TcPlaceText==='function'?window.ff14TcPlaceText(s):s}catch{return s}}
  function fmtDuration(ms){if(!Number.isFinite(ms)||ms<0)return'—';const min=Math.max(0,Math.round(ms/60000));if(min<60)return`${min} 分`;const h=Math.floor(min/60),m=min%60;if(h<24)return m?`${h} 小時 ${m} 分`:`${h} 小時`;const d=Math.floor(h/24),rh=h%24;return rh?`${d} 天 ${rh} 小時`:`${d} 天`}
  function fmtClock(ms){return new Date(ms).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}
  function dayEnd(now){const d=new Date(now);d.setHours(24,0,0,0);return d.getTime()}

  function fishLocations(fish){
    if(typeof window.fishLocations==='function')return window.fishLocations(fish);
    return Array.isArray(fish?.spots)&&fish.spots.length?fish.spots:[fish];
  }

  function locationFor(fish,locationId){
    const spots=fishLocations(fish),hit=spots.find(x=>Number(x?.spotId)===Number(locationId));
    return hit||spots[0]||fish||{};
  }

  function uniqueInts(values){return new Set((values||[]).map(Number).filter(Number.isFinite))}
  function caught(){return uniqueInts([...(read('fishcakeCaughtIds',[])||[]),...(read('fishCaughtIds',[])||[])])}
  function skipped(){return uniqueInts(read('fishSkippedIds',[])||[])}

  function statusHtml(info){
    if(info.current)return `<span class="today-fish-now">現在可釣</span><span class="muted">剩 ${esc(fmtDuration(info.currentLeftMs))}</span>`;
    if(info.next)return `<span class="today-fish-wait">${esc(fmtDuration(info.waitMs))}後</span><span class="muted">${esc(fmtClock(info.next[0]))} 開窗 · 持續 ${esc(fmtDuration(info.nextDurationMs))}</span>`;
    return '<span class="muted">今天沒有找到窗口</span>';
  }

  function ensureBox(){
    let box=document.getElementById('fish-today-result');
    if(box)return box;
    const summary=document.getElementById('fish-map-summary');if(!summary)return null;
    const section=document.createElement('div');section.className='fish-today-card';
    section.innerHTML=`<div class="fish-today-head"><div><strong>今天釣什麼</strong><div class="muted">只抓今天有窗口的未釣魚；普通隨時魚留給掃圖清場。</div></div><div class="fish-today-actions"><label class="inline-check"><input id="fish-today-big" type="checkbox"> 包含魚王</label><button id="fish-today-refresh" type="button">更新推薦</button></div></div><div id="fish-today-result" class="fish-today-result"><span class="muted">正在整理今天的魚窗…</span></div>`;
    summary.insertAdjacentElement('afterend',section);
    section.querySelector('#fish-today-big').addEventListener('change',render);
    section.querySelector('#fish-today-refresh').addEventListener('click',render);
    return section.querySelector('#fish-today-result');
  }

  function addStyles(){
    if(document.getElementById('fish-today-style'))return;
    const s=document.createElement('style');s.id='fish-today-style';s.textContent=`
      .fish-today-card{margin:14px 0;padding:14px;border:1px solid var(--border,#d8d8df);border-radius:12px}.fish-today-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}.fish-today-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.fish-today-result{margin-top:12px;display:grid;gap:8px}.today-fish-row{display:grid;grid-template-columns:minmax(170px,1.2fr) minmax(180px,1fr) auto;gap:10px;align-items:center;padding:9px 10px;border-radius:9px;background:rgba(127,127,127,.07)}.today-fish-name{font-weight:700}.today-fish-place{font-size:13px}.today-fish-status{display:flex;gap:7px;align-items:center;justify-content:flex-end;flex-wrap:wrap;text-align:right}.today-fish-now{font-weight:800}.today-fish-wait{font-weight:700}.today-fish-king{font-size:11px;padding:2px 6px;border:1px solid currentColor;border-radius:999px;margin-left:5px}.today-fish-empty{padding:8px 0}.today-fish-summary{font-size:13px}
      @media(max-width:720px){.today-fish-row{grid-template-columns:1fr}.today-fish-status{justify-content:flex-start;text-align:left}}
    `;document.head.appendChild(s);
  }

  async function render(){
    const box=ensureBox();if(!box)return;
    const my=++renderToken,includeBig=!!document.getElementById('fish-today-big')?.checked,now=Date.now(),end=dayEnd(now),catalog=read('fishCatalog',[])||[],done=caught(),skip=skipped();
    if(typeof window.ff14FishingWindowInfo!=='function'){
      box.innerHTML='<span class="muted">魚窗資料尚未準備好，請稍後再更新。</span>';return;
    }
    box.innerHTML='<span class="muted">正在計算今天剩下的魚窗…</span>';
    const base=catalog.filter(f=>Number(f?.itemId)>0&&f?.type!=='spearfishing'&&!done.has(Number(f.itemId))&&!skip.has(Number(f.itemId))&&(includeBig||!f.bigFish));
    const rows=[];
    for(const fish of base){
      const info=await window.ff14FishingWindowInfo(Number(fish.itemId),now);if(my!==renderToken)return;
      if(!info?.restricted)continue;
      if(!info.current&&(!info.next||info.next[0]>=end))continue;
      const loc=locationFor(fish,info.locationId);
      rows.push({fish,info,loc});
    }
    rows.sort((a,b)=>{
      const ac=a.info.current?0:1,bc=b.info.current?0:1;if(ac!==bc)return ac-bc;
      const at=a.info.current?a.info.current[1]:a.info.next?.[0]??Infinity,bt=b.info.current?b.info.current[1]:b.info.next?.[0]??Infinity;
      if(at!==bt)return at-bt;
      return Number(a.fish.bigFish)-Number(b.fish.bigFish)||String(a.fish.name||'').localeCompare(String(b.fish.name||''));
    });
    if(my!==renderToken)return;
    if(!rows.length){
      box.innerHTML=`<div class="today-fish-empty">今天剩下的時間沒有符合條件的${includeBig?'窗口魚':'窗口白魚'}。<br><span class="muted">${includeBig?'連魚王也暫時沒有好時機 QAQ':'想看看魚王的話，可以勾「包含魚王」。'}</span></div>`;return;
    }
    const shown=rows.slice(0,LIMIT);
    box.innerHTML=`<div class="today-fish-summary muted">今天符合條件 ${rows.length} 條，先列最接近的 ${shown.length} 條。</div>${shown.map(({fish,info,loc})=>{
      const name=itemText(fish.name||`Item ${fish.itemId}`),region=placeText(loc.regionName||fish.regionName||''),zone=placeText(loc.zoneName||fish.zoneName||''),spot=placeText(loc.spotName||fish.spotName||'');
      return `<div class="today-fish-row"><div><span class="today-fish-name">${esc(name)}</span>${fish.bigFish?'<span class="today-fish-king">魚王</span>':''}</div><div class="today-fish-place">${[region,zone,spot].filter(Boolean).map(esc).join(' / ')}</div><div class="today-fish-status">${statusHtml(info)}</div></div>`;
    }).join('')}`;
  }

  function schedule(){clearTimeout(timer);timer=setTimeout(render,180)}
  function init(){addStyles();ensureBox();render();const root=document.getElementById('fishing');if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});setInterval(()=>{if(document.getElementById('fishing')?.classList.contains('active'))render()},60000)}
  window.renderTodayFishing=render;
  window.addEventListener('DOMContentLoaded',init);
})();