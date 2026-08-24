// Fishing UI v2: safer Taiwan Traditional Chinese item names + simpler location picker.
(function(){
  'use strict';

  // The datamining Item sheet uses Singular as the canonical display name.
  // Override the older parser after cloud.js loads so TC fish/item names prefer Singular.
  window.ff14TcCsvMeta=function(text){
    const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/);
    const heads=typeof ff14TcCsvLine==='function'?ff14TcCsvLine(lines[1]||''):(lines[1]||'').split(',');
    let nameIndex=heads.indexOf('Singular');
    if(nameIndex<0)nameIndex=heads.indexOf('Name');
    if(nameIndex<0)nameIndex=1;
    return {lines,nameIndex};
  };

  function tc(v){
    try{return typeof ff14TcText==='function'?ff14TcText(v):String(v||'')}catch{return String(v||'')}
  }
  function esc(v){
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function catalog(){return (window.store?.get?.('fishCatalog',[])||[])}
  function value(el){return el?.value||''}
  function byEnglishOrTc(list,selected){return list.find(x=>x.en===selected||x.tc===selected)}

  function distinct(values){
    const seen=new Set(),out=[];
    for(const en of values){
      const key=String(en||'').trim();if(!key||seen.has(key))continue;seen.add(key);out.push({en:key,tc:tc(key)});
    }
    return out.sort((a,b)=>a.tc.localeCompare(b.tc,'zh-Hant'));
  }

  function ensurePicker(){
    const status=document.getElementById('fish-catalog-status');
    if(!status||document.getElementById('fish-location-picker'))return;
    const box=document.createElement('div');
    box.id='fish-location-picker';
    box.className='fish-location-picker result';
    box.innerHTML=`
      <div class="fish-picker-head">
        <div><strong>想去哪裡釣？</strong><div class="muted">照順序選：地區 → 地圖 → 釣點。選好後，下方只顯示那個釣點的魚。</div></div>
        <button type="button" id="fish-picker-reset">清除選擇</button>
      </div>
      <div class="fish-picker-grid">
        <label><span>① 地區</span><select id="fish-picker-region"><option value="">全部地區</option></select></label>
        <label><span>② 地圖</span><select id="fish-picker-zone" disabled><option value="">先選地區</option></select></label>
        <label><span>③ 釣點</span><select id="fish-picker-spot" disabled><option value="">先選地圖</option></select></label>
      </div>
      <div id="fish-picker-current" class="fish-picker-current muted">目前：全部地區</div>`;
    status.insertAdjacentElement('afterend',box);
    document.getElementById('fish-picker-region').addEventListener('change',()=>{fillZones();applyPicker()});
    document.getElementById('fish-picker-zone').addEventListener('change',()=>{fillSpots();applyPicker()});
    document.getElementById('fish-picker-spot').addEventListener('change',applyPicker);
    document.getElementById('fish-picker-reset').addEventListener('click',resetPicker);
    refreshPicker();
  }

  function fillSelect(el,rows,placeholder){
    if(!el)return;
    const old=el.value;
    el.innerHTML=`<option value="">${esc(placeholder)}</option>`+rows.map(x=>`<option value="${esc(x.en)}">${esc(x.tc)}</option>`).join('');
    if(rows.some(x=>x.en===old))el.value=old;
  }
  function refreshPicker(){
    ensurePicker();
    const region=document.getElementById('fish-picker-region');if(!region)return;
    fillSelect(region,distinct(catalog().map(x=>x.regionName)),'全部地區');
    fillZones();
    fillSpots();
    updateCurrent();
  }
  function fillZones(){
    const region=document.getElementById('fish-picker-region'),zone=document.getElementById('fish-picker-zone');if(!region||!zone)return;
    const selected=value(region);const rows=catalog().filter(x=>!selected||x.regionName===selected);
    fillSelect(zone,distinct(rows.map(x=>x.zoneName)),selected?'全部地圖':'先選地區');
    zone.disabled=!selected;
    if(!selected)zone.value='';
  }
  function fillSpots(){
    const region=value(document.getElementById('fish-picker-region')),zoneEl=document.getElementById('fish-picker-zone'),spot=document.getElementById('fish-picker-spot');if(!spot)return;
    const zone=value(zoneEl);const rows=catalog().filter(x=>(!region||x.regionName===region)&&(!zone||x.zoneName===zone));
    fillSelect(spot,distinct(rows.map(x=>x.spotName)),zone?'全部釣點':'先選地圖');
    spot.disabled=!zone;
    if(!zone)spot.value='';
  }
  function updateCurrent(){
    const region=value(document.getElementById('fish-picker-region')),zone=value(document.getElementById('fish-picker-zone')),spot=value(document.getElementById('fish-picker-spot'));
    const out=document.getElementById('fish-picker-current');if(!out)return;
    const parts=[region,zone,spot].filter(Boolean).map(tc);
    out.innerHTML=parts.length?`目前：<strong>${parts.map(esc).join(' → ')}</strong>`:'目前：全部地區';
  }
  function applyPicker(){
    updateCurrent();
    const region=value(document.getElementById('fish-picker-region')),zone=value(document.getElementById('fish-picker-zone')),spot=value(document.getElementById('fish-picker-spot'));
    const q=document.getElementById('fish-search');
    if(q){q.value=spot||zone||region||'';q.dispatchEvent(new Event('input',{bubbles:true}))}
  }
  function resetPicker(){
    const r=document.getElementById('fish-picker-region');if(r)r.value='';
    fillZones();fillSpots();
    const q=document.getElementById('fish-search');if(q){q.value='';q.dispatchEvent(new Event('input',{bubbles:true}))}
    updateCurrent();
  }

  // Re-apply TC terms after the canonical Singular parser is installed.
  function refreshTc(){
    try{
      if(typeof ff14TcRefresh==='function')ff14TcRefresh(true);
      else if(typeof refreshFF14TcTerms==='function')refreshFF14TcTerms();
    }catch(e){console.warn('TC refresh failed',e)}
  }

  function addStyles(){
    if(document.getElementById('fish-picker-style'))return;
    const s=document.createElement('style');s.id='fish-picker-style';s.textContent=`
      .fish-location-picker{margin:12px 0 16px;padding:14px}
      .fish-picker-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}
      .fish-picker-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .fish-picker-grid label{display:flex;flex-direction:column;gap:6px;font-weight:600}
      .fish-picker-grid select{width:100%;min-height:40px}
      .fish-picker-current{margin-top:10px}
      @media(max-width:760px){.fish-picker-grid{grid-template-columns:1fr}.fish-picker-head{flex-direction:column}}
    `;document.head.appendChild(s);
  }

  window.addEventListener('DOMContentLoaded',()=>{
    addStyles();ensurePicker();refreshPicker();
    setTimeout(refreshPicker,1500);
    setTimeout(()=>{refreshTc();refreshPicker()},2500);
    setTimeout(refreshPicker,7000);
  });

  // Translation refreshes can happen after the picker was rendered.
  const observer=new MutationObserver(()=>{clearTimeout(window.__fishPickerTimer);window.__fishPickerTimer=setTimeout(refreshPicker,120)});
  window.addEventListener('DOMContentLoaded',()=>{const target=document.getElementById('fish-catalog');if(target)observer.observe(target,{childList:true,subtree:true})});
})();
