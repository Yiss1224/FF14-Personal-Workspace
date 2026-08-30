// Rank maps by remaining always-available white fish.
(function(){
  'use strict';

  const LIMIT=8;
  let renderToken=0;
  let timer=0;

  function read(key,def){try{return JSON.parse(localStorage.getItem(key))??def}catch{return def}}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function placeText(v){const s=String(v||'');try{return typeof window.ff14TcPlaceText==='function'?window.ff14TcPlaceText(s):s}catch{return s}}
  function itemText(v){const s=String(v||'');try{return typeof window.ff14TcItemText==='function'?window.ff14TcItemText(s):s}catch{return s}}
  function idOf(v){return Number(v&&typeof v==='object'?(v.id??v.itemId??v.fishId):v)}
  function uniqueInts(values){return new Set((values||[]).map(idOf).filter(Number.isFinite))}
  function caught(){
    try{if(typeof window.getCaughtIds==='function')return uniqueInts(window.getCaughtIds())}catch{}
    return uniqueInts([...(read('fishcakeCaughtIds',[])||[]),...(read('fishCaughtIds',[])||[])]);
  }
  function skipped(){
    try{if(typeof window.getSkippedIds==='function')return uniqueInts(window.getSkippedIds())}catch{}
    return uniqueInts(read('fishSkippedIds',[])||[]);
  }
  function fishLocations(fish){
    if(typeof window.fishLocations==='function')return window.fishLocations(fish);
    return Array.isArray(fish?.spots)&&fish.spots.length?fish.spots:[fish];
  }
  function mapKey(loc){return `${loc?.regionName||''}|${loc?.zoneName||''}`}

  function ensureBox(){
    let section=document.getElementById('fish-whitefish-hotspot');
    if(section)return section.querySelector('#fish-whitefish-hotspot-result');
    const anchor=document.querySelector('.fish-today-card')||document.getElementById('fish-map-summary');
    if(!anchor)return null;
    section=document.createElement('div');
    section.id='fish-whitefish-hotspot';
    section.className='fish-whitefish-hotspot';
    section.innerHTML=`<div class="fish-whitefish-head"><div><strong>🐟 剩餘白魚最多的地圖</strong><div class="muted">只算未釣、非魚王、非刺魚、非窗口、非先跳過；同一魚在同一張地圖只算一次。</div></div><button id="fish-whitefish-refresh" type="button">重算</button></div><div id="fish-whitefish-hotspot-result" class="fish-whitefish-result"><span class="muted">正在統計…</span></div>`;
    anchor.insertAdjacentElement('afterend',section);
    section.querySelector('#fish-whitefish-refresh')?.addEventListener('click',render);
    return section.querySelector('#fish-whitefish-hotspot-result');
  }

  function addStyles(){
    if(document.getElementById('fish-whitefish-hotspot-style'))return;
    const s=document.createElement('style');
    s.id='fish-whitefish-hotspot-style';
    s.textContent=`
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
    document.head.appendChild(s);
  }

  async function render(){
    const box=ensureBox();if(!box)return;
    const my=++renderToken;
    const catalog=read('fishCatalog',[])||[],done=caught(),skip=skipped();
    if(typeof window.ff14FishingWindowInfo!=='function'){
      box.innerHTML='<span class="muted">魚窗資料尚未準備好，稍後再重算一次。</span>';return;
    }
    box.innerHTML='<span class="muted">正在排除窗口魚並統計各地圖…</span>';
    const maps=new Map();
    for(const fish of catalog){
      const id=Number(fish?.itemId);
      if(!Number.isFinite(id)||id<=0||fish?.type==='spearfishing'||fish?.bigFish||done.has(id)||skip.has(id))continue;
      const info=await window.ff14FishingWindowInfo(id,Date.now());
      if(my!==renderToken)return;
      // Unknown fish are excluded conservatively so a window fish can never leak into this list.
      if(!info||info.restricted)continue;
      const seenMaps=new Set();
      for(const loc of fishLocations(fish)){
        const zone=String(loc?.zoneName||'').trim();
        if(!zone)continue;
        const key=mapKey(loc);if(seenMaps.has(key))continue;seenMaps.add(key);
        if(!maps.has(key))maps.set(key,{region:String(loc?.regionName||''),zone,fish:new Map(),sampleLoc:loc});
        maps.get(key).fish.set(id,fish);
      }
    }
    if(my!==renderToken)return;
    const rows=[...maps.values()].filter(x=>x.fish.size).sort((a,b)=>b.fish.size-a.fish.size||a.zone.localeCompare(b.zone)).slice(0,LIMIT);
    if(!rows.length){box.innerHTML='<span class="muted">沒有找到符合條件的剩餘白魚。QAQ</span>';return;}
    box.innerHTML=rows.map((row,i)=>{
      const names=[...row.fish.values()].slice(0,8).map(f=>esc(itemText(f.name||`Item ${f.itemId}`))).join('、');
      const more=row.fish.size>8?`、…另 ${row.fish.size-8} 種`:'';
      return `<div class="whitefish-map-row"><div class="whitefish-rank">#${i+1}</div><div><div class="whitefish-map-name">${esc(placeText(row.zone))}</div><div class="whitefish-region muted">${esc(placeText(row.region))}</div></div><div class="whitefish-count">${row.fish.size} 種</div><div class="whitefish-names muted">${names}${more}</div></div>`;
    }).join('');
  }

  function schedule(){clearTimeout(timer);timer=setTimeout(render,120)}
  function init(){
    addStyles();ensureBox();schedule();
    document.addEventListener('ff14-fish-catalog-rendered',schedule);
    document.addEventListener('click',e=>{if(e.target?.closest?.('[data-caught],[data-skip]'))setTimeout(schedule,60)},true);
  }

  window.renderWhitefishHotspots=render;
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
