// 掃圖導航：地區 → 地圖 → 釣點選擇器，依選到的範圍列出魚，以及在清單上標記已釣／先跳過。
//
// 整份圖鑑有一千多條魚，全部畫出來很慢，所以 #fish-catalog 平常是從頁面上拿掉的，
// 選到地圖／釣點或輸入搜尋字（範圍夠小）才掛回去並畫出清單。
//
// 對外：
//   window.renderFishCatalog()      重畫摘要與魚清單（清單畫完會發 ff14-fish-catalog-rendered 事件）
//   window.refreshFishingPicker()   依目前圖鑑重建三個下拉選單（保留已選的值）
//   window.selectFishingSpot(地區,地圖,釣點)  其他區塊的「前往釣點」按鈕用；值都是英文原名
//   window.fishFilters()            目前的篩選條件
// 下拉選單的 value 一律是英文原名，顯示文字才是台服譯名。
(function(){
  'use strict';

  const shared=window.FF14Fishing;
  const $=id=>document.getElementById(id);
  const value=id=>String($(id)?.value||'').trim();
  function tc(v){try{return typeof ff14TcText==='function'?ff14TcText(v):String(v||'')}catch{return String(v||'')}}
  function validName(v){const s=String(v||'').trim();return s&&!/^\d+$/.test(s)?s:''}
  const uniqueFishCount=rows=>window.FF14FishCatalog.uniqueFishCount(rows);
  const catalogLocations=()=>window.expandFishLocations(shared.catalog());

  // ---- 魚清單的掛上／拿掉 ----
  let anchor=null,catalogNode=null,mounted=false,scopeSyncTimer=null,catalogRenderTask=null;

  function detachInitialCatalog(){
    const node=$('fish-catalog');
    if(!node||!node.parentNode)return;
    anchor=document.createComment('fish-catalog-deferred');
    node.parentNode.insertBefore(anchor,node);
    catalogNode=node;
    node.remove();
    mounted=false;
  }
  function mountCatalog(){
    if(mounted||!catalogNode||!anchor?.parentNode)return;
    anchor.parentNode.insertBefore(catalogNode,anchor.nextSibling);
    mounted=true;
  }
  function cancelCatalogRender(){
    if(catalogRenderTask===null)return;
    if(typeof cancelIdleCallback==='function')cancelIdleCallback(catalogRenderTask);
    else clearTimeout(catalogRenderTask);
    catalogRenderTask=null;
  }
  function unmountCatalog(){
    if(!catalogNode)return;
    cancelCatalogRender();
    if(mounted){
      // 先清空再拿掉，下次掛回來才不用處理一大堆舊節點。
      catalogNode.replaceChildren();
      catalogNode.remove();
      mounted=false;
    }
    renderSummary(HINT_PICK);
  }

  // 範圍夠小才畫清單：選了地圖或釣點，或搜尋字至少兩個字。
  // 選擇器會把選到的地區名填進搜尋框，只選地區還是太大，那種不算。
  function hasNarrowScope(){
    if(value('fish-picker-zone')||value('fish-picker-spot'))return true;
    const q=value('fish-search');
    if(!q)return false;
    const region=value('fish-picker-region');
    if(region&&q===region)return false;
    return q.length>=2;
  }

  function renderScopedCatalog(){
    scopeSyncTimer=null;
    if(!hasNarrowScope()){unmountCatalog();return}
    mountCatalog();
    const run=()=>{catalogRenderTask=null;renderFishCatalog()};
    cancelCatalogRender();
    if(typeof requestIdleCallback==='function')catalogRenderTask=requestIdleCallback(run,{timeout:120});
    else catalogRenderTask=setTimeout(run,0);
  }
  function syncScopeNow(){if(!hasNarrowScope())unmountCatalog()}
  function scheduleScopeSync(delay=0){
    if(scopeSyncTimer!==null)clearTimeout(scopeSyncTimer);
    scopeSyncTimer=setTimeout(renderScopedCatalog,delay);
  }

  // ---- 摘要 ----
  const HINT_PICK='先選一張地圖，或直接搜尋魚名／釣點，下面就會列出魚。';
  const HINT_LIST='同一魚種可出現在多個釣場，但圖鑑總數只算一次。魚糕可能漏記，所以「未記錄」不等於一定沒釣過。';
  function renderSummary(hint){
    const summary=$('fish-map-summary');if(!summary)return;
    const catalog=shared.catalog(),caught=shared.caughtIds(),skipped=shared.skippedIds();
    const ordinaryRemaining=uniqueFishCount(catalog.filter(x=>!caught.has(Number(x.itemId))&&!x.bigFish&&!skipped.has(Number(x.itemId))));
    summary.innerHTML=`圖鑑：${uniqueFishCount(catalog)} 種　｜　已釣：${caught.size}　｜　<strong>還沒釣的一般魚：${ordinaryRemaining}</strong>　｜　先跳過：${skipped.size}<br><span class="muted">${hint}</span>`;
  }

  // ---- 魚清單 ----
  function fishFilters(){
    return{
      missing:$('fish-only-missing')?.checked??true,
      hideBig:$('fish-hide-big')?.checked??true,
      includeSpear:$('fish-include-spear')?.checked??true,
      hideSkipped:$('fish-hide-skipped')?.checked??true,
      q:($('fish-search')?.value||'').trim().toLowerCase()
    };
  }
  function fishCakeUrl(x){return `https://fish.ffmomola.com/ng/#/wiki/${x.type==='spearfishing'?'spearfishing':'fishing'}/spot/${x.spotId}/fish/${x.itemId}`}
  const CAUGHT_ON='✓ 已釣到（再按取消）',CAUGHT_OFF='標記已釣';
  function fishRowHtml(x){
    const caughtButton=x.caught
      ?`<button type="button" data-caught="${x.itemId}" data-caught-state="1" aria-pressed="true">${CAUGHT_ON}</button>`
      :`<button data-caught="${x.itemId}">${CAUGHT_OFF}</button>`;
    return `<div class="fish-row ${x.skipped?'skipped':''}"><div><strong>${esc(x.name)}</strong> ${x.bigFish?'<span class="tag">魚王</span>':''} ${x.type==='spearfishing'?'<span class="tag">刺魚</span>':''}<small>${esc(x.regionName)} / ${esc(x.zoneName)} / ${esc(x.spotName)}</small></div><div class="fish-actions">${caughtButton}<button data-skip="${x.itemId}">${x.skipped?'取消跳過':'先跳過'}</button><a href="${fishCakeUrl(x)}" target="_blank" rel="noopener">魚糕</a></div></div>`;
  }
  // 地圖（依缺魚數多到少）→ 釣點（依魚數多到少）→ 魚（魚王排後面，再依名稱）。
  function renderList(box){
    const summary=$('fish-map-summary');if(!summary)return;
    const catalog=shared.catalog();
    if(!catalog.length){summary.innerHTML='尚未載入 XIVAPI 魚類資料。';box.innerHTML='';return}
    const caught=shared.caughtIds(),skipped=shared.skippedIds(),fl=fishFilters();
    let fishRows=catalog.map(x=>({...x,caught:caught.has(x.itemId),skipped:skipped.has(x.itemId)}));
    if(fl.missing)fishRows=fishRows.filter(x=>!x.caught);
    if(fl.hideBig)fishRows=fishRows.filter(x=>!x.bigFish);
    if(!fl.includeSpear)fishRows=fishRows.filter(x=>x.type!=='spearfishing');
    if(fl.hideSkipped)fishRows=fishRows.filter(x=>!x.skipped);
    let rows=window.expandFishLocations(fishRows);
    if(fl.q)rows=rows.filter(x=>[x.name,x.spotName,x.zoneName,x.regionName].some(v=>String(v||'').toLowerCase().includes(fl.q)));
    renderSummary(HINT_LIST);
    if(!rows.length){box.innerHTML='<div class="empty">目前篩選條件下沒有魚。</div>';return}

    const groups=new Map();
    for(const x of rows){
      const zone=`${x.regionName}|||${x.zoneName}`;
      if(!groups.has(zone))groups.set(zone,[]);
      groups.get(zone).push(x);
    }
    const zones=[...groups.entries()].map(([key,items])=>({key,items,missing:uniqueFishCount(items.filter(x=>!x.caught&&!x.skipped))})).sort((a,b)=>b.missing-a.missing||a.key.localeCompare(b.key));
    box.innerHTML=zones.map((z,zi)=>{
      const[region,zone]=z.key.split('|||'),spots=new Map();
      for(const x of z.items){
        const key=`${x.spotId}|||${x.spotName}`;
        if(!spots.has(key))spots.set(key,[]);
        spots.get(key).push(x);
      }
      const spotHtml=[...spots.entries()].sort((a,b)=>uniqueFishCount(b[1])-uniqueFishCount(a[1])).map(([key,items])=>{
        const[,spotName]=key.split('|||');
        return `<details class="spot"><summary>${esc(spotName)} <span class="badge">${uniqueFishCount(items)}</span></summary><div class="fish-list">${items.sort((a,b)=>Number(a.bigFish)-Number(b.bigFish)||a.name.localeCompare(b.name)).map(fishRowHtml).join('')}</div></details>`;
      }).join('');
      return `<details class="zone" ${zi<3?'open':''}><summary><strong>${esc(zone)}</strong> <span>${esc(region)}</span><span class="badge">${uniqueFishCount(z.items)}</span></summary>${spotHtml}</details>`;
    }).join('');
  }

  function notifyRendered(){try{document.dispatchEvent(new CustomEvent('ff14-fish-catalog-rendered'))}catch{}}
  function renderFishCatalog(){
    const box=$('fish-catalog');
    // 清單沒掛在頁面上（還沒選地圖）時只更新摘要。
    if(!box){renderSummary(HINT_PICK);return}
    if(!hasNarrowScope()){
      renderSummary(HINT_PICK);
      box.innerHTML='<div class="empty">先選到地圖／釣點，或搜尋魚名，再顯示魚清單。</div>';
      notifyRendered();
      return;
    }
    renderList(box);
    // 每列魚的釣法面板與採買清單由 fishing-guide.js 接著補上。
    queueMicrotask(()=>window.renderFishingGuideLayer?.());
    notifyRendered();
  }

  // ---- 地區／地圖／釣點選擇器 ----
  function distinct(values){
    const seen=new Set(),out=[];
    for(const en of values){const key=validName(en);if(!key||seen.has(key))continue;seen.add(key);out.push({en:key,tc:tc(key)})}
    return out.sort((a,b)=>a.tc.localeCompare(b.tc,'zh-Hant'));
  }
  function ensurePicker(){
    const status=$('fish-catalog-status');
    if(!status||$('fish-location-picker'))return;
    const box=document.createElement('div');box.id='fish-location-picker';box.className='fish-location-picker result';
    box.innerHTML=`<div class="fish-picker-head"><div><strong>想去哪裡釣？</strong><div class="muted">照順序選：地區 → 地圖 → 釣點。選好後，下方只顯示那個範圍。</div></div><button type="button" id="fish-picker-reset">清除選擇</button></div><div class="fish-picker-grid"><label><span>① 地區</span><select id="fish-picker-region"><option value="">全部地區</option></select></label><label><span>② 地圖</span><select id="fish-picker-zone" disabled><option value="">先選地區</option></select></label><label><span>③ 釣點</span><select id="fish-picker-spot" disabled><option value="">先選地圖</option></select></label></div><div id="fish-picker-current" class="fish-picker-current muted">目前：全部地區</div>`;
    status.insertAdjacentElement('afterend',box);
    $('fish-picker-region').addEventListener('change',()=>{fillZones();fillSpots();applyPicker()});
    $('fish-picker-zone').addEventListener('change',()=>{fillSpots();applyPicker()});
    $('fish-picker-spot').addEventListener('change',applyPicker);
    $('fish-picker-reset').addEventListener('click',resetPicker);
  }
  function fillSelect(el,rows,placeholder){
    if(!el)return;const old=el.value;
    el.innerHTML=`<option value="">${esc(placeholder)}</option>`+rows.map(x=>`<option value="${esc(x.en)}">${esc(x.tc)}</option>`).join('');
    if(rows.some(x=>x.en===old))el.value=old;
  }
  function fillZones(){
    const region=$('fish-picker-region'),zone=$('fish-picker-zone');if(!region||!zone)return;
    const selected=region.value||'',rows=catalogLocations().filter(x=>!selected||x.regionName===selected);
    fillSelect(zone,distinct(rows.map(x=>x.zoneName)),selected?'全部地圖':'先選地區');zone.disabled=!selected;if(!selected)zone.value='';
  }
  function fillSpots(){
    const region=$('fish-picker-region')?.value||'',zone=$('fish-picker-zone')?.value||'',spot=$('fish-picker-spot');if(!spot)return;
    const rows=catalogLocations().filter(x=>(!region||x.regionName===region)&&(!zone||x.zoneName===zone));
    fillSelect(spot,distinct(rows.map(x=>x.spotName)),zone?'全部釣點':'先選地圖');spot.disabled=!zone;if(!zone)spot.value='';
  }
  function updateCurrent(){
    const out=$('fish-picker-current');if(!out)return;
    const parts=['fish-picker-region','fish-picker-zone','fish-picker-spot'].map(id=>$(id)?.value||'').filter(Boolean).map(tc);
    out.innerHTML=parts.length?`目前：<strong>${parts.map(esc).join(' → ')}</strong>`:'目前：全部地區';
  }
  function refreshPicker(){
    ensurePicker();const region=$('fish-picker-region');if(!region)return;
    fillSelect(region,distinct(catalogLocations().map(x=>x.regionName)),'全部地區');fillZones();fillSpots();updateCurrent();
  }
  // 選到的範圍用搜尋框傳給清單：填進最細的那一層名稱。
  function setSearch(text){const q=$('fish-search');if(q){q.value=text;q.dispatchEvent(new Event('input',{bubbles:true}))}}
  function applyPicker(){
    updateCurrent();
    setSearch(($('fish-picker-spot')?.value||'')||($('fish-picker-zone')?.value||'')||($('fish-picker-region')?.value||''));
  }
  function resetPicker(){
    const r=$('fish-picker-region');if(r)r.value='';
    fillZones();fillSpots();setSearch('');updateCurrent();
  }
  function selectFishingSpot(regionName,zoneName,spotName){
    const tab=document.querySelector('nav button[data-tab="fishing"]');if(tab&&!tab.classList.contains('active'))tab.click();
    ensurePicker();refreshPicker();
    const region=$('fish-picker-region'),zone=$('fish-picker-zone'),spot=$('fish-picker-spot');
    if(!region||!zone||!spot)return false;
    const has=(el,v)=>[...el.options].some(o=>o.value===v);
    if(has(region,regionName))region.value=regionName;else return false;
    fillZones();
    if(has(zone,zoneName))zone.value=zoneName;else return false;
    fillSpots();
    if(has(spot,spotName))spot.value=spotName;else return false;
    spot.dispatchEvent(new Event('change',{bubbles:true}));
    setTimeout(()=>$('fish-location-picker')?.scrollIntoView({behavior:'smooth',block:'start'}),30);
    return true;
  }

  // 釣點標題跟著每列魚下面那行小字（台服名詞套用後會變中文）顯示同一個名字。
  function fixSpotSummaryNames(){
    document.querySelectorAll('#fish-catalog details.spot').forEach(details=>{
      const summary=details.querySelector(':scope > summary'),small=details.querySelector('.fish-row small');
      if(!summary||!small)return;
      const parts=small.textContent.split('/').map(x=>x.trim()).filter(Boolean),spotName=parts[parts.length-1];
      if(!spotName||/^\d+$/.test(spotName))return;
      const textNode=[...summary.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);
      if(textNode&&textNode.nodeValue.trim()!==spotName)textNode.nodeValue=spotName+' ';
    });
  }
  function refreshPickerAndNames(){refreshPicker();fixSpotSummaryNames()}

  // ---- 標記已釣／先跳過 ----
  function decrementBadge(details){
    const badge=details?.querySelector?.(':scope > summary .badge');if(!badge)return;
    badge.textContent=String(Math.max(0,(Number(badge.textContent)||0)-1));
  }
  // 直接改畫面上那幾列，不重畫整份清單（同一條魚可能出現在好幾個釣點）。
  function toggleCaught(itemId){
    itemId=Number(itemId);if(!Number.isFinite(itemId))return;
    const current=window.getCaughtIds().map(Number),wasCaught=current.includes(itemId);
    window.setCaughtIds(wasCaught?current.filter(x=>x!==itemId):[...current,itemId]);
    try{window.renderFish?.()}catch{}
    renderSummary(HINT_LIST);

    const onlyMissing=$('fish-only-missing')?.checked??true;
    const buttons=[...document.querySelectorAll(`#fish-catalog [data-caught="${itemId}"]`)];
    const setState=on=>buttons.forEach(b=>{b.dataset.caughtState=on?'1':'0';b.setAttribute('aria-pressed',on?'true':'false');b.textContent=on?CAUGHT_ON:CAUGHT_OFF});
    if(wasCaught)setState(false);
    else if(!onlyMissing)setState(true);
    else{
      // 「只看未記錄」時，剛標成已釣的魚直接從清單拿掉，空掉的釣點／地圖也一起拿掉。
      const seenZones=new Set();
      for(const b of buttons){
        const row=b.closest('.fish-row');if(!row)continue;
        const spot=row.closest('details.spot'),zone=row.closest('details.zone');
        row.remove();decrementBadge(spot);if(zone&&!seenZones.has(zone)){decrementBadge(zone);seenZones.add(zone)}
        const list=spot?.querySelector('.fish-list');if(list&&!list.querySelector('.fish-row'))spot.remove();
        if(zone&&!zone.querySelector('details.spot'))zone.remove();
      }
    }
    try{window.renderBaitShoppingList?.()}catch{}
    try{window.renderRoutePlanner?.()}catch{}
    try{window.refreshFishingSessionRouteMap?.()}catch{}
  }
  function toggleSkipped(itemId){
    const ids=window.getSkippedIds(),next=ids.includes(itemId)?ids.filter(x=>x!==itemId):[...ids,itemId];
    store.set('fishSkippedIds',next);
    renderFishCatalog();
  }

  // ---- 事件 ----
  detachInitialCatalog();
  Object.assign(window,{renderFishCatalog,refreshFishingPicker:refreshPicker,selectFishingSpot,fishFilters});

  document.addEventListener('click',e=>{
    // 打開釣魚分頁本身要快：只更新摘要，不掛清單。
    if(e.target?.closest?.('nav button[data-tab="fishing"]')){renderSummary(HINT_PICK);return}
    const button=e.target?.closest?.('#fish-catalog [data-caught]');if(!button)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    toggleCaught(button.dataset.caught);
  },true);
  document.addEventListener('click',e=>{
    const button=e.target?.closest?.('#fish-catalog [data-skip]');
    if(button)toggleSkipped(+button.dataset.skip);
  });
  // 搜尋：範圍一變大就先把清單拿掉，打字停 80ms 才畫最後的結果。
  document.addEventListener('input',e=>{
    if(e.target?.id!=='fish-search')return;
    syncScopeNow();
    scheduleScopeSync(80);
  },true);
  document.addEventListener('change',e=>{
    const id=e.target?.id||'';
    if(!['fish-picker-region','fish-picker-zone','fish-picker-spot','fish-only-missing','fish-hide-big','fish-include-spear','fish-hide-skipped'].includes(id))return;
    if(id==='fish-picker-region'&&!value('fish-picker-region'))unmountCatalog();
    scheduleScopeSync();
  },true);

  let pickerTimer=0;
  window.addEventListener('DOMContentLoaded',()=>{
    renderSummary(HINT_PICK);
    // 這一輪 DOMContentLoaded 期間先把（空的）清單掛著，讓其他腳本找得到 #fish-catalog 來安插自己的區塊，
    // 結束後如果還沒選範圍就再拿掉。
    mountCatalog();
    setTimeout(()=>{if(!hasNarrowScope())unmountCatalog()},0);

    addStyles();ensurePicker();refreshPickerAndNames();
    // 圖鑑與台服名詞是之後才陸續下載好的，補幾次讓選單內容與譯名跟上。
    for(const delay of[1500,2500,7000])setTimeout(refreshPickerAndNames,delay);
    const target=$('fish-catalog');
    if(target)new MutationObserver(()=>{clearTimeout(pickerTimer);pickerTimer=setTimeout(refreshPickerAndNames,120)}).observe(target,{childList:true,subtree:true});
  });

  function addStyles(){
    if($('fish-picker-style'))return;const s=document.createElement('style');s.id='fish-picker-style';s.textContent=`.fish-location-picker{margin:12px 0 16px;padding:14px}.fish-picker-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.fish-picker-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.fish-picker-grid label{display:flex;flex-direction:column;gap:6px;font-weight:600}.fish-picker-grid select{width:100%;min-height:40px}.fish-picker-current{margin-top:10px}@media(max-width:980px){.fish-picker-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.fish-picker-grid label:nth-child(3){grid-column:1/-1}.fish-location-picker{padding:12px}}@media(max-width:700px){.fish-picker-grid{grid-template-columns:1fr}.fish-picker-grid label:nth-child(3){grid-column:auto}.fish-picker-head{flex-direction:column}.fish-picker-head button{width:100%;min-height:40px}.fish-location-picker{padding:10px}}`;document.head.appendChild(s);
  }
})();
