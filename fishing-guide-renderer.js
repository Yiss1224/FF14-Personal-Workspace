// Single renderer for fishing method panels.
// Lookup is anchored by Item ID -> English official name; display may stay Traditional Chinese.
(function(){
  'use strict';

  const EN_ITEM_URL='https://raw.githubusercontent.com/xivapi/ffxiv-datamining/master/csv/en/Item.csv';
  const EN_CACHE_KEY='ff14FishEnglishNamesV2';
  let enById=readJson(EN_CACHE_KEY,{})||{};
  let enLoadPromise=null;

  function readJson(key,def){try{return JSON.parse(localStorage.getItem(key)||'null')??def}catch{return def}}
  function writeJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
  function catalog(){return readJson('fishCatalog',[])||[]}
  function norm(v){return String(v??'').trim().toLowerCase()}
  function tc(v){try{return typeof window.ff14TcText==='function'?window.ff14TcText(v):String(v??'')}catch{return String(v??'')}}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}

  function csvLine(line){
    const out=[];let cur='',quoted=false;
    for(let i=0;i<line.length;i++){
      const c=line[i];
      if(c==='"'){
        if(quoted&&line[i+1]==='"'){cur+='"';i++}else quoted=!quoted;
      }else if(c===','&&!quoted){out.push(cur);cur=''}
      else cur+=c;
    }
    out.push(cur);return out;
  }

  async function ensureEnglishNames(){
    if(enLoadPromise)return enLoadPromise;
    const needed=new Set(catalog().map(x=>Number(x.itemId)).filter(Number.isFinite));
    const missing=[...needed].filter(id=>!enById[String(id)]);
    if(!missing.length)return enById;

    enLoadPromise=(async()=>{
      try{
        const status=document.getElementById('fish-method-status');
        if(status&&!status.textContent.includes('英文名稱'))status.textContent+=' · 正在建立釣法英文名稱索引…';
        const r=await fetch(EN_ITEM_URL,{cache:'force-cache'});
        if(!r.ok)throw new Error(`Item.csv ${r.status}`);
        const text=await r.text(),lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/);
        const heads=csvLine(lines[0]||'');
        let nameIndex=heads.indexOf('Name');
        if(nameIndex<0)nameIndex=heads.indexOf('Singular');
        if(nameIndex<0)nameIndex=1;
        const need=new Set(missing);
        for(let i=1;i<lines.length&&need.size;i++){
          const line=lines[i];if(!line)continue;
          const comma=line.indexOf(',');if(comma<1)continue;
          const id=Number(line.slice(0,comma));if(!need.has(id))continue;
          const row=csvLine(line),name=String(row[nameIndex]||'').trim();
          if(name){enById[String(id)]=name;need.delete(id)}
        }
        writeJson(EN_CACHE_KEY,enById);
        return enById;
      }catch(e){
        console.warn('English fish name map failed',e);
        return enById;
      }finally{enLoadPromise=null}
    })();
    return enLoadPromise;
  }

  function itemIdFromRow(row){
    const caught=row?.querySelector?.('[data-caught]')?.dataset?.caught;
    if(caught&&Number(caught))return Number(caught);
    const skip=row?.querySelector?.('[data-skip]')?.dataset?.skip;
    if(skip&&Number(skip))return Number(skip);
    const href=row?.querySelector?.('a[href*="/fish/"]')?.getAttribute('href')||'';
    const m=href.match(/\/fish\/(\d+)/);return m?Number(m[1])||0:0;
  }

  function catalogRow(itemId){return catalog().find(x=>Number(x.itemId)===Number(itemId))||null}
  function rowMeta(row){
    const visibleName=row?.querySelector?.(':scope > div:first-child > strong')?.textContent?.trim()||'';
    const itemId=itemIdFromRow(row),cat=catalogRow(itemId);
    const english=String(enById[String(itemId)]||'').trim();
    const catalogName=String(cat?.name||'').trim();
    return {itemId,catalog:cat,englishName:english,catalogName,visibleName};
  }

  function methodFor(meta){
    if(typeof fgMethodForName!=='function')return null;
    const candidates=[meta.englishName,meta.catalogName,meta.visibleName].filter(Boolean);
    for(const name of candidates){const m=fgMethodForName(name);if(m)return m}
    return null;
  }

  // Every guide feature that asks row metadata gets a stable lookup name when available.
  window.fgFishMetaFromRow=function(row){
    const meta=rowMeta(row);
    return {
      name:meta.englishName||meta.catalogName||meta.visibleName,
      displayName:meta.visibleName||tc(meta.englishName||meta.catalogName),
      itemId:meta.itemId,
      catalog:meta.catalog
    };
  };

  function weatherTc(m){
    const prev=Array.isArray(m?.previousWeatherSet)?m.previousWeatherSet.filter(Boolean).map(tc):[];
    const now=Array.isArray(m?.weatherSet)?m.weatherSet.filter(Boolean).map(tc):[];
    if(!prev.length&&!now.length)return '無限制';
    if(prev.length&&now.length)return `${prev.join('/')} → ${now.join('/')}`;
    return (now.length?now:prev).join('/');
  }

  function bindPanelActions(root=document){
    root.querySelectorAll('[data-fg-universal]').forEach(s=>s.onchange=()=>{
      if(typeof fgSetUniversalState==='function')fgSetUniversalState(+s.dataset.fgUniversal,s.value);
    });
    root.querySelectorAll('[data-fg-bite]').forEach(b=>b.onclick=()=>{
      if(typeof fgLoadFishBite==='function')fgLoadFishBite(b,+b.dataset.fgBite,+b.dataset.fgSpot,b.dataset.fgBait,false);
    });
    root.querySelectorAll('[data-fg-bite-edit]').forEach(b=>b.onclick=()=>{
      const id=+b.dataset.fgBiteEdit;
      const cur=typeof fgBiteOverride==='function'?fgBiteOverride(id):'';
      const v=prompt('手動秒數，例如 8–12s；留空可清除手動值',cur);
      if(v!==null&&typeof fgSetBiteOverride==='function')fgSetBiteOverride(id,v);
    });
  }

  // Replace the original renderer. It only fills missing panels; it never tears down an existing one.
  window.augmentFishMethodRows=function(){
    document.querySelectorAll('#fish-catalog .fish-row').forEach(row=>{
      if(row.querySelector('.fish-method'))return;
      const meta=rowMeta(row);
      if(!meta.itemId||meta.catalog?.type==='spearfishing')return;
      const m=methodFor(meta);if(!m)return;

      const path=typeof fgPathNames==='function'?fgPathNames(m.bestCatchPath):[];
      const first=path[0]||'未提供';
      const state=typeof fgUniversalState==='function'?fgUniversalState(meta.itemId):'unknown';
      const manual=typeof fgBiteOverride==='function'?fgBiteOverride(meta.itemId):'';
      const spotId=Number(meta.catalog?.spotId)||0;
      const cachedBite=spotId&&typeof biteSpotMemory!=='undefined'?biteSpotMemory.get(spotId)?.data:null;
      const panel=document.createElement('div');panel.className='fish-method';
      const display=meta.visibleName||tc(meta.englishName||meta.catalogName);
      const route=path.length?`${path.map(x=>esc(tc(x))).join(' → ')} → <strong>${esc(display)}</strong>`:`<strong>${esc(display)}</strong>`;
      const tug=typeof fgTugText==='function'?fgTugText(m.tug):(m.tug||'—');
      const hook=typeof fgHookText==='function'?fgHookText(m.hookset):(m.hookset||'—');
      const time=typeof fgTimeText==='function'?fgTimeText(m):'—';
      const lodinn=typeof fgLodinnUrl==='function'?fgLodinnUrl(meta.catalog?.spotName||m.location):'#';

      panel.innerHTML=`<div class="fish-method-grid"><span>🪱 <b>推薦路線</b> ${route}</span><span>🎣 <b>咬鉤</b> ${esc(tug)} · ${esc(hook)}</span><span>⏰ <b>時間</b> ${esc(time)}</span><span>🌦 <b>天氣</b> ${esc(weatherTc(m))}</span>${m.snagging===true?'<span>🧲 <b>Snagging</b> ON</span>':''}${m.folklore?'<span>📖 <b>傳承錄</b> 需要</span>':''}<span class="fish-bite-line">⏱ <b>秒數</b> <span class="fish-bite-value">${manual?`${esc(manual)}（手動）`:(cachedBite?'已載入釣點資料，按「算秒數」':'尚未載入')}</span> ${spotId&&first!=='未提供'?`<button type="button" class="mini-btn" data-fg-bite="${meta.itemId}" data-fg-spot="${spotId}" data-fg-bait="${esc(first)}">算秒數</button>`:''} <button type="button" class="mini-btn" data-fg-bite-edit="${meta.itemId}">手動</button> <a href="${esc(lodinn)}" target="_blank" rel="noopener">Lodinn</a></span></div><label class="universal-lure-select">萬能餌 <select data-fg-universal="${meta.itemId}"><option value="unknown" ${state==='unknown'?'selected':''}>未確認／先試萬能餌</option><option value="yes" ${state==='yes'?'selected':''}>可用</option><option value="no" ${state==='no'?'selected':''}>不可用／要指定餌</option></select></label>`;
      row.querySelector(':scope > div:first-child')?.appendChild(panel);
    });
    bindPanelActions(document.getElementById('fish-catalog')||document);
  };

  // If the current browser has a translated fishCatalog cache, build the English ID map
  // and only fill the missing panels afterwards. No catalog re-render / no collapsed spots.
  ensureEnglishNames().then(()=>{
    try{window.augmentFishMethodRows()}catch(e){console.warn('guide panel fill failed',e)}
    try{if(typeof renderBaitShoppingList==='function')renderBaitShoppingList()}catch{}
    try{if(typeof renderRoutePlanner==='function')renderRoutePlanner()}catch{}
  });

  // Existing rows may already be present before this final override loads.
  queueMicrotask(()=>{try{window.augmentFishMethodRows()}catch{}});
})();
