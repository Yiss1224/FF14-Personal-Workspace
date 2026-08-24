// Keep fishing method / bait / bite-time panels stable, including fish not covered by fishData.yaml.
(function(){
  'use strict';

  function readJson(key,def){
    try{return JSON.parse(localStorage.getItem(key)||'null')??def}catch{return def}
  }
  function readCatalog(){return readJson('fishCatalog',[])||[]}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function norm(v){return String(v??'').trim().toLowerCase()}
  function tc(v){try{return typeof ff14TcText==='function'?ff14TcText(v):String(v??'')}catch{return String(v??'')}}

  function metaFromRow(row){
    const visibleName=row?.querySelector?.(':scope > div:first-child > strong')?.textContent?.trim()||'';
    const href=row?.querySelector?.('a[href*="/fish/"]')?.getAttribute('href')||'';
    const m=href.match(/\/fish\/(\d+)/),itemId=m?Number(m[1])||0:0;
    const catalog=readCatalog().find(x=>Number(x.itemId)===itemId)||null;
    const sourceName=String(catalog?.name||visibleName).trim();
    return {visibleName,sourceName,itemId,catalog};
  }

  function methodRows(){return readJson('fishMethodCatalog',{})?.rows||[]}
  function methodMap(){return new Map(methodRows().filter(x=>x?.name).map(x=>[norm(x.name),x]))}
  function methodFor(meta,map=methodMap()){
    const byCache=map.get(norm(meta.sourceName))||map.get(norm(meta.visibleName));
    if(byCache)return byCache;
    try{if(typeof fgMethodForName==='function')return fgMethodForName(meta.sourceName)||fgMethodForName(meta.visibleName)||null}catch{}
    return null;
  }

  // Make the original fishing-guide lookup independent from the translated visible fish name.
  try{
    if(typeof fgFishMetaFromRow==='function'){
      const originalMeta=fgFishMetaFromRow;
      fgFishMetaFromRow=function(row){
        const base=originalMeta(row)||{},stable=metaFromRow(row);
        return {...base,name:stable.sourceName||base.name||stable.visibleName,displayName:stable.visibleName,itemId:stable.itemId||Number(base.itemId)||0,catalog:stable.catalog||base.catalog||null};
      };
    }
  }catch(e){console.warn('fish guide meta patch failed',e)}

  function pathNames(value){
    const out=[];
    const walk=v=>{if(v==null)return;if(Array.isArray(v)){v.forEach(walk);return}if(typeof v==='object'){if(v.name)out.push(String(v.name));return}const s=String(v).trim();if(s)out.push(s)};
    walk(value);return out;
  }
  function tugText(v){const t=norm(v);if(t==='light')return '! 弱咬';if(t==='medium')return '!! 強咬';if(t==='heavy'||t==='legendary')return '!!! 大咬';return v?String(v):'—'}
  function hookText(v){const t=norm(v);if(t==='precision')return '精準提鉤';if(t==='powerful')return '強力提鉤';return v?String(v):'—'}
  function timeText(m){const a=Number(m?.startHour),b=Number(m?.endHour);if(a===0&&b===24)return '全天';if(Number.isFinite(a)&&Number.isFinite(b))return `ET ${String(a).padStart(2,'0')}:00–${String(b).padStart(2,'0')}:00`;return '—'}
  function weatherText(m){const prev=Array.isArray(m?.previousWeatherSet)?m.previousWeatherSet.filter(Boolean):[],now=Array.isArray(m?.weatherSet)?m.weatherSet.filter(Boolean):[];if(!prev.length&&!now.length)return '無限制';const p=prev.map(tc),n=now.map(tc);if(p.length&&n.length)return `${p.join('/')} → ${n.join('/')}`;return (n.length?n:p).join('/')}

  function universalState(itemId){return (readJson('fishUniversalLureOverrides',{})||{})[String(itemId)]||'unknown'}
  function saveUniversal(itemId,state){const map=readJson('fishUniversalLureOverrides',{})||{};map[String(itemId)]=['yes','no'].includes(state)?state:'unknown';localStorage.setItem('fishUniversalLureOverrides',JSON.stringify(map))}

  async function loadBite(button){
    const row=button.closest('.fish-row'),meta=metaFromRow(row),value=row?.querySelector('.fish-method .fish-bite-value');
    if(!meta.itemId||!meta.catalog?.spotId||!value)return;
    button.disabled=true;value.textContent='載入中…';
    try{
      if(typeof fgLoadBiteSpot!=='function'||typeof fgBestAvailableBite!=='function'||typeof fgFormatBiteStat!=='function')throw new Error('秒數模組尚未就緒');
      let preferred=0;
      const bait=button.dataset.fgsBait||'';
      if(bait&&typeof fgResolveBaitItemId==='function'){try{preferred=await fgResolveBaitItemId(bait)}catch{}}
      const data=await fgLoadBiteSpot(Number(meta.catalog.spotId),false),stat=fgBestAvailableBite(data,meta.itemId,preferred||0);
      value.textContent=fgFormatBiteStat(stat,data);
    }catch(e){value.textContent=`讀取失敗：${e.message}`}
    finally{button.disabled=false}
  }

  function makeRecoveredPanel(row,meta,m){
    const host=row.querySelector(':scope > div:first-child');if(!host)return;
    const path=pathNames(m.bestCatchPath),first=path[0]||'',rest=path.slice(1),spotId=Number(meta.catalog?.spotId)||0,state=universalState(meta.itemId),panel=document.createElement('div');
    panel.className='fish-method fish-method-recovered';
    const display=meta.visibleName||tc(meta.sourceName),route=path.length?(rest.length?`${path.map(x=>esc(tc(x))).join(' → ')} → <strong>${esc(display)}</strong>`:`${esc(tc(first))} → <strong>${esc(display)}</strong>`):'<span class="muted">來源未提供餌路線</span>';
    const biteButton=spotId?`<button type="button" class="mini-btn" data-fgs-bite data-fgs-bait="${esc(first)}">算秒數</button>`:'';
    const lodinn=`https://lodinn.github.io/biterates?spot=${encodeURIComponent(meta.catalog?.spotName||m.location||'')}`;
    panel.innerHTML=`<div class="fish-method-grid"><span>🪱 <b>推薦路線</b> ${route}</span><span>🎣 <b>咬鉤</b> ${esc(tugText(m.tug))} · ${esc(hookText(m.hookset))}</span><span>⏰ <b>時間</b> ${esc(timeText(m))}</span><span>🌦 <b>天氣</b> ${esc(weatherText(m))}</span>${m.snagging===true?'<span>🧲 <b>Snagging</b> ON</span>':''}${m.folklore?'<span>📖 <b>傳承錄</b> 需要</span>':''}<span class="fish-bite-line">⏱ <b>秒數</b> <span class="fish-bite-value">尚未載入</span> ${biteButton} <a href="${esc(lodinn)}" target="_blank" rel="noopener">Lodinn</a></span></div><label class="universal-lure-select">萬能餌 <select data-fgs-universal="${meta.itemId}"><option value="unknown" ${state==='unknown'?'selected':''}>未確認／先試萬能餌</option><option value="yes" ${state==='yes'?'selected':''}>可用</option><option value="no" ${state==='no'?'selected':''}>不可用／要指定餌</option></select></label>`;
    host.appendChild(panel);
  }

  function makeFallbackPanel(row,meta){
    const host=row.querySelector(':scope > div:first-child');if(!host)return;
    const panel=document.createElement('div');panel.className='fish-method fish-method-fallback';
    const spotId=Number(meta.catalog?.spotId)||0,spotName=meta.catalog?.spotName||'',biteButton=spotId?'<button type="button" class="mini-btn" data-fgs-bite>查秒數</button>':'';
    panel.innerHTML=`<div class="fish-method-grid"><span>🪱 <b>推薦路線</b> <span class="muted">目前釣法來源未收錄這隻魚</span></span><span>🎣 <b>咬鉤／提鉤</b> <span class="muted">來源未提供</span></span><span>⏰ <b>時間／天氣</b> <span class="muted">來源未提供</span></span><span class="fish-bite-line">⏱ <b>秒數</b> <span class="fish-bite-value">尚未載入</span> ${biteButton} <a href="https://lodinn.github.io/biterates?spot=${encodeURIComponent(spotName)}" target="_blank" rel="noopener">Lodinn</a></span></div>`;
    host.appendChild(panel);
  }

  function fillEveryMissingPanel(){
    const map=methodMap();
    document.querySelectorAll('#fish-catalog .fish-row').forEach(row=>{
      if(row.querySelector('.fish-method'))return;
      const meta=metaFromRow(row);if(!meta.itemId||meta.catalog?.type==='spearfishing')return;
      const m=methodFor(meta,map);if(m)makeRecoveredPanel(row,meta,m);else makeFallbackPanel(row,meta);
    });
  }

  let repairTimer=0,repairing=false;
  function repairPanels(){
    if(repairing)return;clearTimeout(repairTimer);
    repairTimer=setTimeout(()=>{
      repairing=true;
      try{
        // Give the original guide first chance to draw its richer panel.
        if(typeof window.renderFishingGuide==='function'){try{window.renderFishingGuide()}catch(e){console.warn('regular fishing guide render failed',e)}}
        // Then hard-guarantee that every ordinary fishing row has a panel.
        setTimeout(fillEveryMissingPanel,20);
      }finally{repairing=false}
    },60);
  }

  function addStyles(){
    if(document.getElementById('fish-guide-stability-style'))return;
    const s=document.createElement('style');s.id='fish-guide-stability-style';s.textContent='.fish-method-fallback{opacity:.9}.fish-method-recovered{opacity:.98}';document.head.appendChild(s);
  }

  window.addEventListener('DOMContentLoaded',()=>{
    addStyles();
    const catalog=document.getElementById('fish-catalog');
    if(catalog){
      catalog.addEventListener('click',e=>{const b=e.target.closest('[data-fgs-bite]');if(b){e.preventDefault();loadBite(b)}});
      catalog.addEventListener('change',e=>{const s=e.target.closest('[data-fgs-universal]');if(s)saveUniversal(Number(s.dataset.fgsUniversal),s.value)});
      new MutationObserver(repairPanels).observe(catalog,{childList:true,subtree:true,characterData:true});
    }
    repairPanels();[500,1200,2500,5000].forEach(ms=>setTimeout(repairPanels,ms));
  });
})();
