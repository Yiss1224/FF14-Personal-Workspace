// Today fishing recommendations: recommend productive fishing spots, with nearby windows as a bonus.
(function(){
  'use strict';

  const LIMIT=5;
  const SOON_MS=90*60*1000;
  let renderToken=0;

  function read(key,def){try{return JSON.parse(localStorage.getItem(key))??def}catch{return def}}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function itemText(v){const s=String(v||'');try{return typeof window.ff14TcItemText==='function'?window.ff14TcItemText(s):s}catch{return s}}
  function placeText(v){const s=String(v||'');try{return typeof window.ff14TcPlaceText==='function'?window.ff14TcPlaceText(s):s}catch{return s}}
  function fmtDuration(ms){if(!Number.isFinite(ms)||ms<0)return'—';const min=Math.max(0,Math.round(ms/60000));if(min<60)return`${min} 分`;const h=Math.floor(min/60),m=min%60;return m?`${h} 小時 ${m} 分`:`${h} 小時`}
  function fmtClock(ms){return new Date(ms).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}
  function dayEnd(now){const d=new Date(now);d.setHours(24,0,0,0);return d.getTime()}
  function uniqueInts(values){return new Set((values||[]).map(Number).filter(Number.isFinite))}
  function caught(){return uniqueInts([...(read('fishcakeCaughtIds',[])||[]),...(read('fishCaughtIds',[])||[])])}
  function skipped(){return uniqueInts(read('fishSkippedIds',[])||[])}

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

  function ensureBox(){
    let box=document.getElementById('fish-today-result');
    if(box)return box;
    const summary=document.getElementById('fish-map-summary');if(!summary)return null;
    const section=document.createElement('div');section.className='fish-today-card';
    section.innerHTML=`<div class="fish-today-head"><div><strong>今天釣什麼</strong><div class="muted">推薦現在最值得清的漁場；同場若有快開窗的魚會一起提醒。</div></div><div class="fish-today-actions"><label class="inline-check"><input id="fish-today-big" type="checkbox"> 包含魚王</label><button id="fish-today-refresh" type="button">今天釣什麼</button></div></div><div id="fish-today-result" class="fish-today-result"><span class="muted">要開始釣時再按「今天釣什麼」計算。</span></div>`;
    summary.insertAdjacentElement('afterend',section);
    section.querySelector('#fish-today-refresh').addEventListener('click',render);
    return section.querySelector('#fish-today-result');
  }

  function addStyles(){
    if(document.getElementById('fish-today-style'))return;
    const s=document.createElement('style');s.id='fish-today-style';s.textContent=`
      .fish-today-card{margin:14px 0;padding:14px;border:1px solid var(--border,#d8d8df);border-radius:12px}.fish-today-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}.fish-today-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.fish-today-result{margin-top:12px;display:grid;gap:9px}.today-spot-row{padding:11px 12px;border-radius:10px;background:rgba(127,127,127,.07)}.today-spot-top{display:flex;gap:10px;align-items:baseline;justify-content:space-between;flex-wrap:wrap}.today-spot-name{font-weight:800}.today-spot-place{font-size:13px}.today-spot-count{font-weight:800}.today-spot-fish{margin-top:5px;font-size:13px}.today-spot-soon{margin-top:5px;font-size:13px}.today-spot-window{font-weight:700}.today-fish-king{font-size:11px;padding:2px 6px;border:1px solid currentColor;border-radius:999px;margin-left:4px}.today-fish-empty{padding:8px 0}.today-fish-summary{font-size:13px}
    `;document.head.appendChild(s);
  }

  function fishLabel(fish){return `${esc(itemText(fish.name||`Item ${fish.itemId}`))}${fish.bigFish?'<span class="today-fish-king">魚王</span>':''}`}

  async function render(){
    const box=ensureBox();if(!box)return;
    const my=++renderToken,includeBig=!!document.getElementById('fish-today-big')?.checked,now=Date.now(),end=dayEnd(now),catalog=read('fishCatalog',[])||[],done=caught(),skip=skipped();
    if(typeof window.ff14FishingWindowInfo!=='function'){
      box.innerHTML='<span class="muted">魚窗資料尚未準備好，請稍後再按一次。</span>';return;
    }
    box.innerHTML='<span class="muted">正在找現在最值得去的漁場…</span>';

    const base=catalog.filter(f=>Number(f?.itemId)>0&&f?.type!=='spearfishing'&&!done.has(Number(f.itemId))&&!skip.has(Number(f.itemId))&&(includeBig||!f.bigFish));
    const groups=new Map();

    for(const fish of base){
      const info=await window.ff14FishingWindowInfo(Number(fish.itemId),now);if(my!==renderToken)return;
      if(!info)continue;
      const availableNow=!info.restricted||!!info.current;
      const soon=!!(info.restricted&&!info.current&&info.next&&info.next[0]<end&&info.waitMs<=SOON_MS);
      if(!availableNow&&!soon)continue;

      for(const loc of locationsFor(fish,info)){
        const key=spotKey(loc);
        if(!groups.has(key))groups.set(key,{loc,nowFish:new Map(),soonFish:new Map(),earliestSoon:Infinity});
        const g=groups.get(key),id=Number(fish.itemId);
        if(availableNow)g.nowFish.set(id,{fish,info});
        if(soon){g.soonFish.set(id,{fish,info});g.earliestSoon=Math.min(g.earliestSoon,info.next[0])}
      }
    }

    const spots=[...groups.values()].filter(g=>g.nowFish.size>0).sort((a,b)=>
      b.nowFish.size-a.nowFish.size||
      b.soonFish.size-a.soonFish.size||
      a.earliestSoon-b.earliestSoon||
      String(a.loc?.spotName||'').localeCompare(String(b.loc?.spotName||''))
    );

    if(my!==renderToken)return;
    if(!spots.length){
      box.innerHTML=`<div class="today-fish-empty">現在沒有找到可清的${includeBig?'漁場':'白魚漁場'}。<br><span class="muted">${includeBig?'目前連魚王一起算也沒有合適的點 QAQ':'想把魚王也算進去，可以勾「包含魚王」後再按一次。'}</span></div>`;return;
    }

    const shown=spots.slice(0,LIMIT);
    box.innerHTML=`<div class="today-fish-summary muted">以 ${esc(fmtClock(now))} 為基準 · 先列現在可清魚種最多的 ${shown.length} 個漁場；90 分內開窗會作為同分優先提示。</div>${shown.map(g=>{
      const loc=g.loc||{},region=placeText(loc.regionName||''),zone=placeText(loc.zoneName||''),spot=placeText(loc.spotName||'未知釣點');
      const nowFish=[...g.nowFish.values()].sort((a,b)=>Number(a.fish.bigFish)-Number(b.fish.bigFish)||String(a.fish.name||'').localeCompare(String(b.fish.name||'')));
      const soonFish=[...g.soonFish.values()].filter(x=>!g.nowFish.has(Number(x.fish.itemId))).sort((a,b)=>(a.info.next?.[0]??Infinity)-(b.info.next?.[0]??Infinity));
      const nowNames=nowFish.slice(0,8).map(x=>fishLabel(x.fish)).join('、')+(nowFish.length>8?`、…共 ${nowFish.length} 條`:'');
      const soonHtml=soonFish.length?`<div class="today-spot-soon">⏳ 快開窗：${soonFish.slice(0,3).map(x=>`<span class="today-spot-window">${fishLabel(x.fish)} ${esc(fmtDuration(x.info.waitMs))}後（${esc(fmtClock(x.info.next[0]))}）</span>`).join('、')}</div>`:'';
      return `<div class="today-spot-row"><div class="today-spot-top"><div><span class="today-spot-name">${esc(spot)}</span><div class="today-spot-place">${[region,zone].filter(Boolean).map(esc).join(' / ')}</div></div><div class="today-spot-count">現在可釣 ${g.nowFish.size} 條</div></div><div class="today-spot-fish">${nowNames}</div>${soonHtml}</div>`;
    }).join('')}`;
  }

  function init(){addStyles();ensureBox()}
  window.renderTodayFishing=render;
  window.addEventListener('DOMContentLoaded',init);
})();
