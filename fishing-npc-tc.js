// Taiwan Traditional Chinese NPC localization for fishing bait vendors.
// ENpcResident is a separate game-data sheet from Item, so NPC names must never use the fish/item dictionary.
(function(){
  'use strict';

  const NPC_TC_URL='https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-tc/main/ENpcResident.csv';
  const NPC_TC_CACHE_KEY='ff14TcNpcResidentV1';
  const NPC_TC_CACHE_MS=30*24*60*60*1000;
  let npcById=new Map();
  let loadPromise=null;

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

  function parseNpcCsv(text){
    const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/),out={};
    // TC sheet layout: Key,0,1 / #,Singular,Title / int32,str,string / data...
    const header=csvLine(lines[1]||'');
    const nameIndex=header.indexOf('Singular');
    const titleIndex=header.indexOf('Title');
    if(nameIndex<0)throw new Error('ENpcResident 欄位格式異常');
    for(let i=2;i<lines.length;i++){
      if(!lines[i])continue;
      const row=csvLine(lines[i]),id=Number(row[0]);
      if(!Number.isFinite(id))continue;
      const name=String(row[nameIndex]||'').trim(),title=titleIndex>=0?String(row[titleIndex]||'').trim():'';
      if(name||title)out[String(id)]={name,title};
    }
    return out;
  }

  function readCache(){
    try{
      const x=JSON.parse(localStorage.getItem(NPC_TC_CACHE_KEY)||'null');
      if(x?.rows&&typeof x.rows==='object'){
        npcById=new Map(Object.entries(x.rows));
        return x;
      }
    }catch{}
    return null;
  }

  function saveCache(rows){
    try{localStorage.setItem(NPC_TC_CACHE_KEY,JSON.stringify({ts:Date.now(),rows}))}catch{}
  }

  function npcText(v){
    const id=String(Number(v?.id)||'');
    return (id&&npcById.get(id)?.name)||String(v?.name||'');
  }
  function npcTitle(v){
    const id=String(Number(v?.id)||'');
    return (id&&npcById.get(id)?.title)||String(v?.title||'');
  }
  function placeText(v){
    const s=String(v||'');
    try{return typeof window.ff14TcPlaceText==='function'?window.ff14TcPlaceText(s):s}catch{return s}
  }
  function esc(v){
    if(typeof window.fgEsc==='function')return window.fgEsc(v);
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function npcMapButton(v,name,title=''){
    const rawZone=String(v?.zone||''),coords=String(v?.coords||'');
    if(!rawZone||!coords)return `${esc(name)}${title?` &lt;${esc(title)}&gt;`:''}`;
    return `<button type="button" class="npc-map-link" data-npc-map-zone="${esc(rawZone)}" data-npc-map-coords="${esc(coords)}" data-npc-map-name="${esc(name)}" title="在地圖上查看 ${esc(name)}">${esc(name)}${title?` &lt;${esc(title)}&gt;`:''}</button>`;
  }

  function installRenderer(){
    if(typeof window.fgVendorLocationText==='function'){
      window.fgVendorLocationText=function(v){
        const zone=placeText(v?.zone||''),area=placeText(v?.area||''),name=npcText(v),title=npcTitle(v);
        return `${zone?`<strong>${esc(zone)}</strong> · `:''}${npcMapButton(v,name,title)}${v?.coords?` · X/Y ${esc(v.coords)}`:''}${area?` <span class="muted">(${esc(area)})</span>`:''}`;
      };
    }

    if(typeof window.renderVendorPlan==='function'&&typeof window.fgVendorZones==='function'){
      window.renderVendorPlan=function(){
        const box=document.getElementById('fish-vendor-plan');if(!box)return;
        const zones=window.fgVendorZones();
        if(!zones.length){box.innerHTML='<span class="muted">解析魚餌來源後，這裡會依大地區整理能一次買多種餌的 NPC。</span>';return}
        box.innerHTML=`<div class="vendor-plan-title">採買點合併</div>${zones.slice(0,8).map(z=>`<div class="vendor-plan-row"><strong>${esc(placeText(z.zone))}</strong><span class="badge">可處理 ${z.baits.size} 種</span>${z.npcs.map(v=>{const name=npcText(v),title=npcTitle(v);return `<div>• ${npcMapButton(v,name,title)}${v.shop?` · ${esc(v.shop)}`:''}${v.coords?` · X/Y ${esc(v.coords)}`:''}${v.area?` <span class="muted">(${esc(placeText(v.area))})</span>`:''}<div class="muted">${[...new Set(v.baits)].map(esc).join('、')}</div></div>`}).join('')}</div>`).join('')}`;
      };
    }
  }

  function addStyles(){
    if(document.getElementById('ff14-npc-tc-style'))return;
    const s=document.createElement('style');s.id='ff14-npc-tc-style';s.textContent=`
      .npc-map-link{appearance:none;border:0;background:transparent;color:inherit;font:inherit;padding:0;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px;cursor:pointer}
      .npc-map-link:hover{text-decoration-style:solid}.npc-map-link:focus-visible{outline:2px solid currentColor;outline-offset:2px;border-radius:3px}
    `;document.head.appendChild(s);
  }

  function rerender(){
    installRenderer();
    try{if(typeof window.renderBaitShoppingList==='function')window.renderBaitShoppingList()}catch(e){console.warn('NPC TC bait rerender failed',e)}
    try{if(typeof window.renderVendorPlan==='function')window.renderVendorPlan()}catch(e){console.warn('NPC TC vendor rerender failed',e)}
  }

  async function load(force=false){
    if(loadPromise)return loadPromise;
    const cached=readCache();
    if(!force&&cached?.ts&&Date.now()-Number(cached.ts)<NPC_TC_CACHE_MS){installRenderer();return npcById}
    loadPromise=(async()=>{
      try{
        const r=await fetch(NPC_TC_URL,{cache:'force-cache'});
        if(!r.ok)throw new Error(`ENpcResident ${r.status}`);
        const rows=parseNpcCsv(await r.text());
        npcById=new Map(Object.entries(rows));
        saveCache(rows);
        rerender();
      }catch(e){console.warn('NPC TC data load failed',e);installRenderer()}
      finally{loadPromise=null}
      return npcById;
    })();
    return loadPromise;
  }

  window.ff14TcNpcText=v=>npcText(v);
  window.refreshFF14TcNpc=()=>load(true);

  window.addEventListener('DOMContentLoaded',()=>{
    addStyles();readCache();installRenderer();
    document.addEventListener('click',e=>{
      const el=e.target?.closest?.('.npc-map-link');if(!el)return;
      if(typeof window.openFF14MapAt==='function')window.openFF14MapAt(el.dataset.npcMapZone,el.dataset.npcMapCoords,el.dataset.npcMapName||'NPC');
    });
    load(false).then(rerender);
  });
})();
