// 魚餌／釣法／秒數：每列魚底下的釣法面板、社群咬鉤秒數、魚餌採買清單與買餌 NPC。
//
// 資料來源：
//   釣法（推薦餌、咬鉤強度、ET 時間、天氣）  ff14-fish-tracker-app 的 fishData.yaml，快取 7 天
//   咬鉤秒數                              Lodinn 的每個釣點統計（只放記憶體）
//   魚餌 Item ID                          XIVAPI 搜尋
//   魚餌哪裡買                            Garland Tools，快取 30 天
//
// localStorage（經 app.js 的 store）：
//   fishMethodCatalog {ts,rows}           釣法資料
//   fishUniversalLureOverrides {itemId: 'yes'|'no'|'unknown'}   每條魚「萬能餌可不可用」
//   fishBaitOwned {餌名:bool} / fishBaitNotes {餌名:備註} / fishBaitOnlyRequired
//   fishBaitItemIds {餌名:itemId} / fishBaitSourceCache {餌名:來源}
//   fishBiteTimeOverrides {itemId:文字}     手動填的秒數
//   ff14FishEnglishNamesV2 {itemId:英文名}  （不經 store）
//
// 只有選了地圖或釣點才顯示釣法與採買清單；採買清單另外要按「展開採買清單」。
//
// 對外：
//   window.renderFishingGuideLayer()   魚清單剛重畫完，補上釣法面板並更新採買清單
//   window.renderFishingGuide()        重新讀取快取後全部重畫（備份還原後用）
//   window.renderBaitShoppingList() / window.renderVendorPlan()
//   window.FF14FishGuide               {methodForName,pathNames,resolveBaitItemId} 給 tc-terms.js 查魚餌譯名
(function(){
  'use strict';

  const shared=window.FF14Fishing;
  const $=id=>document.getElementById(id);
  const XIVAPI='https://v2.xivapi.com/api';
  const FISH_METHOD_SOURCE='https://raw.githubusercontent.com/icykoneko/ff14-fish-tracker-app/5b293c630987f816ad76bab52cae2c0d5d016c9a/private/fishData.yaml';
  const FISH_METHOD_CACHE_MS=7*24*60*60*1000;
  const GARLAND_ITEM_BASE='https://www.garlandtools.org/db/doc/item/en/3';
  const GARLAND_CORE_URL='https://www.garlandtools.org/db/doc/core/en/3/data.json';
  const LODINN_ASSET_BASE='https://lodinn.github.io/assets';
  const BAIT_SOURCE_CACHE_MS=30*24*60*60*1000;
  const BAIT_SOURCE_SCHEMA=2;
  const BITE_SPOT_CACHE_MS=14*24*60*60*1000;
  let fishMethodByName=new Map();
  let garlandPlaceMap=null;
  const biteSpotMemory=new Map();

  // ---- 小工具 ----
  const fgEsc=esc;
  function fgNorm(v){return String(v??'').trim().toLowerCase()}
  function fgPathNames(value){const out=[];const walk=v=>{if(v==null)return;if(Array.isArray(v)){v.forEach(walk);return}if(typeof v==='object'){if(v.name)out.push(String(v.name));return}const s=String(v).trim();if(s)out.push(s)};walk(value);return out}
  function tc(v){try{return typeof window.ff14TcText==='function'?window.ff14TcText(v):String(v??'')}catch{return String(v??'')}}
  function placeText(v){const s=String(v||'');try{return typeof window.ff14TcPlaceText==='function'?window.ff14TcPlaceText(s):s}catch{return s}}
  function readJson(key,def){try{return JSON.parse(localStorage.getItem(key)||'null')??def}catch{return def}}
  function writeJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
  const pickerValue=id=>String($(id)?.value||'').trim();
  const refreshRoutePanel=()=>window.renderRoutePlanner?.();   // 路線面板在 fishing-session-route.js

  // ---- 使用者設定與快取 ----
  function fgUiPref(key,def){const v=store.get(key,null);return v===null?def:!!v}
  function fgUniversalMap(){return store.get('fishUniversalLureOverrides',{})||{}}
  function fgUniversalState(itemId){return fgUniversalMap()[String(itemId)]||'unknown'}
  function fgSetUniversalState(itemId,state){const m=fgUniversalMap();m[String(itemId)]=['yes','no'].includes(state)?state:'unknown';store.set('fishUniversalLureOverrides',m);window.renderFishCatalog();refreshRoutePanel()}
  function fgOwnedMap(){return store.get('fishBaitOwned',{})||{}}
  function fgSetOwned(name,owned){const m=fgOwnedMap();m[name]=!!owned;store.set('fishBaitOwned',m);renderBaitShoppingList();refreshRoutePanel()}
  function fgNoteMap(){return store.get('fishBaitNotes',{})||{}}
  function fgSetNote(name,note){const m=fgNoteMap();m[name]=String(note||'').trim();store.set('fishBaitNotes',m)}
  function fgItemIdMap(){return store.get('fishBaitItemIds',{})||{}}
  function fgSetItemId(name,id){const m=fgItemIdMap();m[name]=id;store.set('fishBaitItemIds',m)}
  function fgSourceCache(){const raw=store.get('fishBaitSourceCache',{})||{},out={};for(const [k,v] of Object.entries(raw))if(v?.schema===BAIT_SOURCE_SCHEMA)out[k]=v;return out}
  function fgSetSourceCache(name,value){const raw=store.get('fishBaitSourceCache',{})||{};raw[name]={...value,schema:BAIT_SOURCE_SCHEMA,ts:Date.now()};store.set('fishBaitSourceCache',raw)}
  function fgBiteOverrideMap(){return store.get('fishBiteTimeOverrides',{})||{}}
  function fgBiteOverride(itemId){return fgBiteOverrideMap()[String(itemId)]||''}
  function fgSetBiteOverride(itemId,value){const m=fgBiteOverrideMap(),v=String(value||'').trim();if(v)m[String(itemId)]=v;else delete m[String(itemId)];store.set('fishBiteTimeOverrides',m);window.renderFishCatalog()}

  // ---- 釣法資料 ----
  function fgMethodCache(){return store.get('fishMethodCatalog',null)}
  function fgSetMethodData(rows,ts=Date.now()){const clean=(Array.isArray(rows)?rows:[]).filter(x=>x&&x.name);fishMethodByName=new Map(clean.map(x=>[fgNorm(x.name),x]));store.set('fishMethodCatalog',{ts,rows:clean});return clean}
  function fgLoadCachedMethodData(){const c=fgMethodCache();if(c?.rows?.length){fishMethodByName=new Map(c.rows.map(x=>[fgNorm(x.name),x]));return c}return null}
  // js-yaml 只有解析釣法資料時用得到，需要時才載入，不再擋住整頁的第一次繪製。
  // 檔案放在本站 vendor/（4.1.0，MIT），不再依賴外部 CDN。
  const FG_YAML_URL='vendor/js-yaml-4.1.0.min.js';
  let fgYamlPromise=null;
  function fgEnsureYaml(){if(window.jsyaml)return Promise.resolve();if(fgYamlPromise)return fgYamlPromise;fgYamlPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=FG_YAML_URL;s.async=true;s.onload=()=>window.jsyaml?resolve():reject(new Error('外部元件載入後無法使用'));s.onerror=()=>reject(new Error('解析釣法資料用的元件沒有載入，請重新整理後再按「更新釣法資料」'));document.head.appendChild(s)}).catch(e=>{fgYamlPromise=null;throw e});return fgYamlPromise}
  async function loadFishMethodData(force=false){const status=document.getElementById('fish-method-status'),cached=fgLoadCachedMethodData();if(!force&&cached?.ts&&Date.now()-cached.ts<FISH_METHOD_CACHE_MS){if(status)status.textContent=`釣法資料：${cached.rows.length} 筆（快取）`;window.renderFishCatalog();return cached.rows}if(status)status.textContent='正在讀取魚糕釣法資料…';try{await fgEnsureYaml();const r=await fetch(FISH_METHOD_SOURCE,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const text=await r.text(),rows=window.jsyaml.load(text);if(!Array.isArray(rows)||rows.length<100)throw new Error('釣法資料格式異常');fgSetMethodData(rows);if(status)status.textContent=`釣法資料已更新：${rows.length} 筆`;window.renderFishCatalog();return rows}catch(e){if(status)status.textContent=`釣法資料讀取失敗：${e.message}${cached?.rows?.length?'；沿用舊快取':''}`;if(cached?.rows?.length){window.renderFishCatalog();return cached.rows}return []}}
  function fgTugText(tug){const t=fgNorm(tug);if(t==='light')return '! 弱咬';if(t==='medium')return '!! 強咬';if(t==='heavy'||t==='legendary')return '!!! 大咬';return tug?String(tug):'—'}
  function fgHookText(h){const t=fgNorm(h);if(t==='precision')return '精準提鉤';if(t==='powerful')return '強力提鉤';return h?String(h):'—'}
  function fgTimeText(m){const a=Number(m?.startHour),b=Number(m?.endHour);if(a===0&&b===24)return '全天';if(Number.isFinite(a)&&Number.isFinite(b))return `ET ${String(a).padStart(2,'0')}:00–${String(b).padStart(2,'0')}:00`;return '—'}
  function fgLodinnUrl(spot){return `https://lodinn.github.io/biterates?spot=${encodeURIComponent(spot||'')}`}
  function fgMethodForName(name){return fishMethodByName.get(fgNorm(name))||null}
  function weatherTc(m){
    const prev=Array.isArray(m?.previousWeatherSet)?m.previousWeatherSet.filter(Boolean).map(tc):[];
    const now=Array.isArray(m?.weatherSet)?m.weatherSet.filter(Boolean).map(tc):[];
    if(!prev.length&&!now.length)return '無限制';
    if(prev.length&&now.length)return `${prev.join('/')} → ${now.join('/')}`;
    return (now.length?now:prev).join('/');
  }

  // ---- 魚清單的每一列是哪條魚 ----
  // 用 Item ID 找英文正式名稱去對釣法資料（畫面上的名字可能已經換成中文）。
  const EN_ITEM_URL='https://raw.githubusercontent.com/xivapi/ffxiv-datamining/master/csv/en/Item.csv';
  const EN_CACHE_KEY='ff14FishEnglishNamesV2';
  const PANEL_OWNER='single-v3';
  let enById=readJson(EN_CACHE_KEY,{})||{},enLoadPromise=null,fillTimer=0;
  const catalog=()=>shared.catalog();
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
        await window.FF14Fishing.whenActive();   // 英文 Item.csv 很大，釣魚分頁打開後才抓
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

  function rowSpotName(row){
    const small=row?.querySelector?.(':scope > div:first-child > small')?.textContent||'';
    const parts=small.split('/').map(x=>x.trim()).filter(Boolean);
    return parts[parts.length-1]||'';
  }
  function locationsFor(fish){
    if(!fish)return [];
    return window.fishLocations(fish);
  }
  function itemIdFromRow(row){
    const explicit=row?.dataset?.itemId;
    if(explicit&&Number(explicit))return Number(explicit);
    const caught=row?.querySelector?.('[data-caught]')?.dataset?.caught;
    if(caught&&Number(caught))return Number(caught);
    const skip=row?.querySelector?.('[data-skip]')?.dataset?.skip;
    if(skip&&Number(skip))return Number(skip);
    const href=row?.querySelector?.('a[href*="/fish/"]')?.getAttribute('href')||'';
    const m=href.match(/\/fish\/(\d+)/);
    if(m&&Number(m[1]))return Number(m[1]);

    // Last-resort fallback: match the row's visible spot/fish text against catalog.
    const visible=row?.querySelector?.(':scope > div:first-child > strong')?.textContent?.trim()||'';
    const spot=rowSpotName(row),rows=catalog();
    let hit=rows.find(fish=>locationsFor(fish).some(loc=>(String(loc.spotName||'')===spot||tc(loc.spotName)===spot)&&(String(fish.name||'')===visible||tc(fish.name)===visible)));
    if(!hit)hit=rows.find(x=>String(x.name||'')===visible||tc(x.name)===visible);
    return Number(hit?.itemId)||0;
  }

  function catalogRow(itemId,row){
    const fish=catalog().find(x=>Number(x.itemId)===Number(itemId))||null;
    if(!fish)return null;
    const spot=rowSpotName(row),locations=locationsFor(fish),loc=locations.find(x=>String(x.spotName||'')===spot||tc(x.spotName)===spot)||locations[0];
    return loc?{...fish,...loc}:fish;
  }
  function rowMeta(row){
    const visibleName=row?.querySelector?.(':scope > div:first-child > strong')?.textContent?.trim()||'';
    const itemId=itemIdFromRow(row),cat=catalogRow(itemId,row);
    const english=String(enById[String(itemId)]||'').trim();
    const catalogName=String(cat?.name||'').trim();
    return {itemId,catalog:cat,englishName:english,catalogName,visibleName};
  }

  function methodFor(meta){
    const candidates=[meta.englishName,meta.catalogName,meta.visibleName].filter(Boolean);
    for(const name of candidates){const m=fgMethodForName(name);if(m)return m}
    return null;
  }

  function fgFishMetaFromRow(row){
    const meta=rowMeta(row);
    return {
      name:meta.englishName||meta.catalogName||meta.visibleName,
      displayName:meta.visibleName||tc(meta.englishName||meta.catalogName),
      itemId:meta.itemId,
      catalog:meta.catalog
    };
  }

  // ---- 咬鉤秒數（Lodinn） ----
  async function fgLoadBiteSpot(spotId,force=false){const key=Number(spotId),entry=biteSpotMemory.get(key);if(!force&&entry?.data&&entry.ts&&Date.now()-entry.ts<BITE_SPOT_CACHE_MS)return entry.data;const r=await fetch(`${LODINN_ASSET_BASE}/spot_data/${key}.json`,{cache:'no-store'});if(!r.ok)throw new Error(`Lodinn ${r.status}`);const data=await r.json();biteSpotMemory.set(key,{ts:Date.now(),data});return data}
  function fgRoundHalf(n){return Math.round(Number(n)*2)/2}
  function fgAggregateBite(data,baitId,fishId){if(!data?.rates)return null;let weightedLow=0,weightedHigh=0,samples=0,catches=0,misses=0;for(const patch of Object.keys(data.rates||{})){const perBait=data.rates[patch]?.[String(baitId)]??data.rates[patch]?.[Number(baitId)];if(!perBait)continue;const f=perBait[String(fishId)]??perBait[Number(fishId)];if(!f)continue;const c=Number(f.catches)||0,m=Number(f.bayesian_misses)||0;catches+=c;misses+=m;if(Number.isFinite(Number(f.bitetime_low))&&Number.isFinite(Number(f.bitetime_high))&&c>0){weightedLow+=Number(f.bitetime_low)*c;weightedHigh+=Number(f.bitetime_high)*c;samples+=c}}if(samples<=0)return null;return{low:fgRoundHalf(weightedLow/samples),high:fgRoundHalf(weightedHigh/samples),samples,catches,misses,baitId:Number(baitId)}}
  function fgBestAvailableBite(data,fishId,preferredBaitId){if(preferredBaitId){const exact=fgAggregateBite(data,preferredBaitId,fishId);if(exact)return exact}const baitIds=new Set();for(const patch of Object.values(data?.rates||{}))for(const baitId of Object.keys(patch||{}))if((patch[baitId]||{})[String(fishId)])baitIds.add(baitId);let best=null;for(const baitId of baitIds){const x=fgAggregateBite(data,baitId,fishId);if(x&&(!best||x.samples>best.samples))best=x}return best}
  function fgFormatBiteStat(stat,data){if(!stat)return '無社群秒數資料';const baitName=data?.bait?.[String(stat.baitId)]?.name||data?.bait?.[stat.baitId]?.name||'';return `${stat.low}–${stat.high}s${baitName?`（${baitName}）`:''} · ${Math.round(stat.samples)} 筆`}
  async function fgLoadFishBite(button,itemId,spotId,baitName,force=false){const status=button?.closest('.fish-method')?.querySelector('.fish-bite-value');if(status)status.textContent='載入中…';if(button)button.disabled=true;try{const baitId=await fgResolveBaitItemId(baitName),data=await fgLoadBiteSpot(spotId,force),stat=fgBestAvailableBite(data,itemId,baitId);if(status)status.textContent=fgFormatBiteStat(stat,data)}catch(e){if(status)status.textContent=`讀取失敗：${e.message}`}if(button)button.disabled=false}
  async function fgLoadVisibleBiteTimes(){const btn=document.getElementById('load-visible-bite-times'),status=document.getElementById('fish-method-status');if(btn)btn.disabled=true;const rows=[...document.querySelectorAll('#fish-catalog .fish-row')].slice(0,60),tasks=[];for(const row of rows){const meta=fgFishMetaFromRow(row),m=fgMethodForName(meta.name),bait=fgPathNames(m?.bestCatchPath)[0];if(!meta.itemId||!meta.catalog?.spotId||!bait)continue;tasks.push({row,itemId:meta.itemId,spotId:meta.catalog.spotId,bait})}const spots=[...new Set(tasks.map(x=>x.spotId))].slice(0,30);if(status)status.textContent=`正在載入目前畫面秒數：${spots.length} 個釣點…`;for(const spotId of spots){try{await fgLoadBiteSpot(spotId,false)}catch{}await new Promise(r=>setTimeout(r,80))}for(const t of tasks){const cache=biteSpotMemory.get(Number(t.spotId))?.data;if(!cache)continue;const baitId=await fgResolveBaitItemId(t.bait),stat=fgBestAvailableBite(cache,t.itemId,baitId),el=t.row.querySelector('.fish-bite-value');if(el)el.textContent=fgFormatBiteStat(stat,cache)}if(status)status.textContent=`秒數已嘗試載入：${spots.length} 個釣點（最多處理目前前 30 個釣點）`;if(btn)btn.disabled=false}

  // ---- 每列魚的釣法面板 ----
  function bindPanelActions(root=document){
    root.querySelectorAll('[data-fg-universal]').forEach(s=>s.onchange=()=>{
      fgSetUniversalState(+s.dataset.fgUniversal,s.value);
    });
    root.querySelectorAll('[data-fg-bite]').forEach(b=>b.onclick=()=>{
      fgLoadFishBite(b,+b.dataset.fgBite,+b.dataset.fgSpot,b.dataset.fgBait,false);
    });
    root.querySelectorAll('[data-fg-bite-edit]').forEach(b=>b.onclick=()=>{
      const id=+b.dataset.fgBiteEdit;
      const v=prompt('手動秒數，例如 8–12s；留空可清除手動值',fgBiteOverride(id));
      if(v!==null)fgSetBiteOverride(id,v);
    });
  }

  function buildPanel(row,meta,m){
    const path=fgPathNames(m.bestCatchPath);
    const first=path[0]||'未提供';
    const state=fgUniversalState(meta.itemId);
    const manual=fgBiteOverride(meta.itemId);
    const spotId=Number(meta.catalog?.spotId)||0;
    const cachedBite=spotId?biteSpotMemory.get(spotId)?.data:null;
    const panel=document.createElement('div');
    panel.className='fish-method';
    panel.dataset.fgOwner=PANEL_OWNER;
    const display=meta.visibleName||tc(meta.englishName||meta.catalogName);
    const route=path.length?`${path.map(x=>esc(tc(x))).join(' → ')} → <strong>${esc(display)}</strong>`:`<strong>${esc(display)}</strong>`;
    const tug=fgTugText(m.tug);
    const hook=fgHookText(m.hookset);
    const time=fgTimeText(m);
    const lodinn=fgLodinnUrl(meta.catalog?.spotName||m.location);

    panel.innerHTML=`<div class="fish-method-grid"><span>🪱 <b>推薦路線</b> ${route}</span><span>🎣 <b>咬鉤</b> ${esc(tug)} · ${esc(hook)}</span><span>⏰ <b>時間</b> ${esc(time)}</span><span>🌦 <b>天氣</b> ${esc(weatherTc(m))}</span>${m.snagging===true?'<span>🧲 <b>Snagging</b> ON</span>':''}${m.folklore?'<span>📖 <b>傳承錄</b> 需要</span>':''}<span class="fish-bite-line">⏱ <b>秒數</b> <span class="fish-bite-value">${manual?`${esc(manual)}（手動）`:(cachedBite?'已載入釣點資料，按「算秒數」':'尚未載入')}</span> ${spotId&&first!=='未提供'?`<button type="button" class="mini-btn" data-fg-bite="${meta.itemId}" data-fg-spot="${spotId}" data-fg-bait="${esc(first)}">算秒數</button>`:''} <button type="button" class="mini-btn" data-fg-bite-edit="${meta.itemId}">手動</button> <a href="${esc(lodinn)}" target="_blank" rel="noopener">Lodinn</a></span></div><label class="universal-lure-select">萬能餌 <select data-fg-universal="${meta.itemId}"><option value="unknown" ${state==='unknown'?'selected':''}>未確認／先試萬能餌</option><option value="yes" ${state==='yes'?'selected':''}>可用</option><option value="no" ${state==='no'?'selected':''}>不可用／要指定餌</option></select></label>`;
    return panel;
  }

  // 還沒有面板的列才補；已經有的不動（面板上可能正顯示載入好的秒數）。
  function fillPanels(){
    const root=document.getElementById('fish-catalog');if(!root)return;
    root.querySelectorAll('.fish-row').forEach(row=>{
      const existing=row.querySelector('.fish-method');
      if(existing?.dataset?.fgOwner===PANEL_OWNER)return;
      const meta=rowMeta(row);
      if(!meta.itemId||meta.catalog?.type==='spearfishing')return;
      const m=methodFor(meta);if(!m)return;
      if(existing)existing.remove();
      const host=row.querySelector(':scope > div:first-child')||row;
      host.appendChild(buildPanel(row,meta,m));
    });
    bindPanelActions(root);
  }

  function scheduleFill(delay=30){
    clearTimeout(fillTimer);
    fillTimer=setTimeout(()=>{try{fillPanels()}catch(e){console.warn('guide panel fill failed',e)}},delay);
  }

  // ---- 魚餌採買清單 ----
  function fgFilteredMissingFish(){const caught=shared.caughtIds(),skipped=shared.skippedIds(),fl=window.fishFilters();let rows=catalog().filter(x=>x.type==='fishing').map(x=>({...x,caught:caught.has(x.itemId),skipped:skipped.has(x.itemId)}));if(fl.missing)rows=rows.filter(x=>!x.caught);if(fl.hideBig)rows=rows.filter(x=>!x.bigFish);if(fl.hideSkipped)rows=rows.filter(x=>!x.skipped);if(fl.q)rows=rows.filter(x=>[x.name,...shared.locations(x).flatMap(loc=>[loc.spotName,loc.zoneName,loc.regionName])].some(v=>fgNorm(v).includes(fl.q)));return rows}
  function fgBuildBaitGroups(){const groups=new Map();for(const fish of fgFilteredMissingFish()){const m=fgMethodForName(fish.name);if(!m)continue;const path=fgPathNames(m.bestCatchPath),bait=path[0];if(!bait)continue;const universal=fgUniversalState(fish.itemId);if(universal==='yes')continue;if(!groups.has(bait))groups.set(bait,{name:bait,fish:[],required:0,unknown:0});const g=groups.get(bait);g.fish.push(fish);if(universal==='no')g.required++;else g.unknown++}return [...groups.values()].sort((a,b)=>b.required-a.required||b.fish.length-a.fish.length||a.name.localeCompare(b.name))}
  async function fgResolveBaitItemId(name){const known=Number(fgItemIdMap()[name]);if(known)return known;const escaped=String(name).replace(/\\/g,'\\\\').replace(/"/g,'\\"');for(const query of [`Name="${escaped}"`,`Name~"${escaped}"`]){try{const p=new URLSearchParams({sheets:'Item',query,fields:'Name',language:'en',limit:'10'}),r=await fetch(`${XIVAPI}/search?${p}`);if(!r.ok)continue;const j=await r.json(),results=Array.isArray(j.results)?j.results:[],exact=results.find(x=>fgNorm(x?.fields?.Name)===fgNorm(name))||results[0];if(exact?.row_id){fgSetItemId(name,Number(exact.row_id));return Number(exact.row_id)}}catch{}}return 0}

  // 魚餌哪裡買（Garland Tools）
  function fgIndexGarlandPlaces(root){const out=new Map(),seen=new Set();const walk=v=>{if(v==null||typeof v!=='object'||seen.has(v))return;seen.add(v);if(Array.isArray(v)){v.forEach(walk);return}const id=Number(v.i??v.id),name=v.n??v.name;if(Number.isFinite(id)&&typeof name==='string'&&name.trim())out.set(id,name.trim());for(const [k,x] of Object.entries(v)){if(/^\d+$/.test(k)&&typeof x==='string')out.set(Number(k),x);else walk(x)}};walk(root);return out}
  async function fgLoadGarlandCore(){if(garlandPlaceMap)return garlandPlaceMap;try{const r=await fetch(GARLAND_CORE_URL,{cache:'force-cache'});if(!r.ok)throw new Error(`Garland core ${r.status}`);const j=await r.json();garlandPlaceMap=fgIndexGarlandPlaces(j);return garlandPlaceMap}catch{garlandPlaceMap=new Map();return garlandPlaceMap}}
  function fgCoords(c){if(Array.isArray(c)&&c.length>=2){const x=Number(c[0]),y=Number(c[1]);if(Number.isFinite(x)&&Number.isFinite(y))return `${x.toFixed(1)}, ${y.toFixed(1)}`}if(c&&typeof c==='object'){const x=c.x??c.X??c[0],y=c.y??c.Y??c[1];if(Number.isFinite(Number(x))&&Number.isFinite(Number(y)))return `${Number(x).toFixed(1)}, ${Number(y).toFixed(1)}`}return''}
  async function fgFetchBaitSource(name,force=false){const cached=fgSourceCache()[name];if(!force&&cached?.ts&&Date.now()-cached.ts<BAIT_SOURCE_CACHE_MS)return cached;const id=await fgResolveBaitItemId(name);if(!id)throw new Error('找不到 Item ID');const [core,r]=await Promise.all([fgLoadGarlandCore(),fetch(`${GARLAND_ITEM_BASE}/${id}.json`,{cache:'force-cache'})]);if(!r.ok)throw new Error(`Garland ${r.status}`);const j=await r.json(),item=j.item||{},partials=Array.isArray(j.partials)?j.partials:[],npcMap=new Map(partials.filter(x=>x.type==='npc').map(x=>[Number(x.id),x.obj||{}]));const npcInfo=npcId=>{const n=npcMap.get(Number(npcId))||{},zoneId=Number(n.l??n.zone??n.zoneid??0)||0,areaId=Number(n.a??n.area??n.areaid??0)||0;return{id:Number(n.i??npcId)||Number(npcId),name:n.n||`NPC ${npcId}`,title:n.t||'',zoneId,zone:core.get(zoneId)||'',areaId,area:core.get(areaId)||'',coords:fgCoords(n.c)}};const vendors=[...new Set((item.vendors||[]).map(Number).filter(Boolean))].map(npcInfo);const tradeShops=(item.tradeShops||[]).map(s=>({shop:s.shop||'特殊商店',npcs:(s.npcs||[]).map(npcInfo),listings:s.listings||[]}));const source={id,name:item.name||name,price:Number(item.price)||0,vendors,tradeShops,craftCount:Array.isArray(item.craft)?item.craft.length:0,nodeCount:Array.isArray(item.nodes)?item.nodes.length:0,reducedCount:Array.isArray(item.reducedFrom)?item.reducedFrom.length:0,dropCount:Array.isArray(item.drops)?item.drops.length:0};fgSetSourceCache(name,source);return{...source,schema:BAIT_SOURCE_SCHEMA,ts:Date.now()}}
  // NPC 名稱與稱號用台服譯名（tc-terms.js）；有地圖和座標的 NPC 做成按鈕，點了開地圖。
  const npcName=v=>window.ff14TcNpc?window.ff14TcNpc.name(v):String(v?.name||'');
  const npcTitle=v=>window.ff14TcNpc?window.ff14TcNpc.title(v):String(v?.title||'');
  function npcMapButton(v){
    const name=npcName(v),title=npcTitle(v),label=`${fgEsc(name)}${title?` &lt;${fgEsc(title)}&gt;`:''}`;
    const rawZone=String(v?.zone||''),rawArea=String(v?.area||''),coords=String(v?.coords||'');
    if(!rawZone||!coords)return label;
    return `<button type="button" class="npc-map-link" data-npc-map-zone="${fgEsc(rawZone)}" data-npc-map-area="${fgEsc(rawArea)}" data-npc-map-coords="${fgEsc(coords)}" data-npc-map-name="${fgEsc(name)}" title="在地圖上查看 ${fgEsc(name)}">${label}</button>`;
  }
  function fgVendorLocationText(v){
    const zone=placeText(v?.zone||''),area=placeText(v?.area||'');
    return `${zone?`<strong>${fgEsc(zone)}</strong> · `:''}${npcMapButton(v)}${v?.coords?` · X/Y ${fgEsc(v.coords)}`:''}${area?` <span class="muted">(${fgEsc(area)})</span>`:''}`;
  }
  function fgSourceSummaryHtml(src){if(!src)return'<span class="muted">尚未解析。</span>';const parts=[];if(src.vendors?.length){parts.push(`<div><b>Gil 商店${src.price?` · ${Number(src.price).toLocaleString('zh-TW')} Gil`:''}</b>${src.vendors.map(v=>`<div>• ${fgVendorLocationText(v)}</div>`).join('')}</div>`)}if(src.tradeShops?.length){parts.push(`<div><b>特殊商店</b>${src.tradeShops.map(s=>`<div>• ${fgEsc(s.shop)}${s.npcs?.length?`<div class="muted">${s.npcs.map(n=>fgVendorLocationText(n)).join('<br>')}</div>`:''}</div>`).join('')}</div>`)}const other=[];if(src.craftCount)other.push(`製作 ${src.craftCount}`);if(src.nodeCount)other.push(`採集 ${src.nodeCount}`);if(src.reducedCount)other.push(`精選 ${src.reducedCount}`);if(src.dropCount)other.push(`掉落 ${src.dropCount}`);if(other.length)parts.push(`<div><b>其他來源</b> ${other.join(' / ')}</div>`);if(!parts.length)parts.push('<div class="muted">Garland 沒列到一般 NPC 商店；可能是市場、特殊取得或資料缺漏。</div>');return parts.join('')}
  async function fgLoadSourceIntoRow(button,name,force=false){const row=button.closest('.bait-shopping-row'),box=row?.querySelector('.bait-source-detail');if(box)box.innerHTML='解析中…';button.disabled=true;try{const src=await fgFetchBaitSource(name,force);if(box)box.innerHTML=fgSourceSummaryHtml(src);renderVendorPlan()}catch(e){if(box)box.innerHTML=`<span class="muted">解析失敗：${fgEsc(e.message)}。可先用 Teamcraft / Garland 查。</span>`}button.disabled=false}
  async function fgResolveShoppingSources(){const btn=document.getElementById('resolve-bait-sources'),groups=fgShoppingGroupsToShow().filter(g=>!fgOwnedMap()[g.name]);if(btn)btn.disabled=true;for(let i=0;i<groups.length;i++){if(btn)btn.textContent=`解析中 ${i+1}/${groups.length}`;try{await fgFetchBaitSource(groups[i].name,false)}catch{}await new Promise(r=>setTimeout(r,180))}if(btn){btn.disabled=false;btn.textContent='解析購物清單 NPC'}renderBaitShoppingList();renderVendorPlan()}
  function fgShoppingGroupsToShow(){const groups=fgBuildBaitGroups(),onlyRequired=document.getElementById('fish-bait-only-required')?.checked??fgUiPref('fishBaitOnlyRequired',true);return onlyRequired?groups.filter(g=>g.required>0):groups}
  function renderBaitShoppingList(){const summary=document.getElementById('fish-bait-summary'),box=document.getElementById('fish-bait-list');if(!summary||!box)return;if(!fishMethodByName.size){summary.innerHTML='釣法資料尚未載入。';box.innerHTML='';return}const groups=fgBuildBaitGroups(),owned=fgOwnedMap(),notes=fgNoteMap(),show=fgShoppingGroupsToShow(),requiredFish=groups.reduce((s,g)=>s+g.required,0),unknownFish=groups.reduce((s,g)=>s+g.unknown,0),needBaits=show.filter(g=>!owned[g.name]).length,sourceCache=fgSourceCache();summary.innerHTML=`目前篩選範圍：<strong>${groups.length}</strong> 種推薦起始餌；購物清單顯示 ${show.length} 種，未標記持有 ${needBaits} 種。<br><span class="muted">萬能餌已確認不可用：${requiredFish} 隻；尚未確認：${unknownFish} 隻。未確認預設當作「先試萬能餌」，不會硬判成一定要買。</span>`;if(!show.length){box.innerHTML='<div class="empty">目前沒有需要列入購物清單的魚餌。</div>';renderVendorPlan();return}box.innerHTML=show.map(g=>{const fishNames=g.fish.slice(0,6).map(x=>fgEsc(x.name)).join('、'),more=g.fish.length>6?`＋${g.fish.length-6}`:'',src=sourceCache[g.name];return `<div class="bait-shopping-row ${owned[g.name]?'bait-owned':''}" data-bait-name="${fgEsc(g.name)}"><label class="inline-check"><input type="checkbox" data-fg-owned="${fgEsc(g.name)}" ${owned[g.name]?'checked':''}> 已有</label><div class="bait-shopping-main"><strong>${fgEsc(g.name)}</strong><div class="muted">對應 ${g.fish.length} 隻｜明確需要 ${g.required}｜未確認 ${g.unknown}<br>${fishNames}${more}</div><input class="bait-note" data-fg-note="${fgEsc(g.name)}" value="${fgEsc(notes[g.name]||'')}" placeholder="自己的備註"></div><div class="bait-source-actions"><button data-fg-source="${fgEsc(g.name)}">${src?'重新解析':'查 NPC／取得方式'}</button>${src?.id?`<a href="https://ffxivteamcraft.com/db/en/item/${src.id}" target="_blank" rel="noopener">Teamcraft</a><a href="https://garlandtools.org/db/#item/${src.id}" target="_blank" rel="noopener">Garland</a>`:''}</div><div class="bait-source-detail">${src?fgSourceSummaryHtml(src):'<span class="muted">尚未解析取得方式。</span>'}</div></div>`}).join('');box.querySelectorAll('[data-fg-owned]').forEach(x=>x.onchange=()=>fgSetOwned(x.dataset.fgOwned,x.checked));box.querySelectorAll('[data-fg-note]').forEach(x=>x.onchange=()=>fgSetNote(x.dataset.fgNote,x.value));box.querySelectorAll('[data-fg-source]').forEach(b=>b.onclick=()=>fgLoadSourceIntoRow(b,b.dataset.fgSource,true));renderVendorPlan()}

  // 採買點合併：同一個大地區能一次買幾種餌
  function fgVendorCandidates(){const owned=fgOwnedMap(),groups=fgShoppingGroupsToShow().filter(g=>!owned[g.name]),cache=fgSourceCache(),vendors=new Map();for(const g of groups){const src=cache[g.name];if(!src)continue;for(const v of src.vendors||[]){const key=`${v.id}|${v.zoneId}|${v.coords}`;if(!vendors.has(key))vendors.set(key,{...v,baits:[]});vendors.get(key).baits.push(g.name)}for(const shop of src.tradeShops||[])for(const v of shop.npcs||[]){const key=`trade:${shop.shop}|${v.id}|${v.zoneId}|${v.coords}`;if(!vendors.has(key))vendors.set(key,{...v,shop:shop.shop,baits:[]});vendors.get(key).baits.push(g.name)}}return [...vendors.values()].sort((a,b)=>b.baits.length-a.baits.length||String(a.zone).localeCompare(String(b.zone))||String(a.name).localeCompare(String(b.name)))}
  function fgVendorZones(){const groups=new Map();for(const v of fgVendorCandidates()){const zone=tc(v.zone||'')||'地區未明',key=v.zoneId?`id:${v.zoneId}`:`name:${fgNorm(zone)}`;if(!groups.has(key))groups.set(key,{zone,zoneId:v.zoneId||0,npcs:[],baits:new Set()});const g=groups.get(key);g.npcs.push(v);for(const b of v.baits)g.baits.add(b)}return[...groups.values()].sort((a,b)=>b.baits.size-a.baits.size||a.zone.localeCompare(b.zone))}
  function renderVendorPlan(){
    const box=$('fish-vendor-plan');if(!box)return;
    const zones=fgVendorZones();
    if(!zones.length){box.innerHTML='<span class="muted">解析魚餌來源後，這裡會依大地區整理能一次買多種餌的 NPC。</span>';return}
    box.innerHTML=`<div class="vendor-plan-title">採買點合併</div>${zones.slice(0,8).map(z=>`<div class="vendor-plan-row"><strong>${fgEsc(placeText(z.zone))}</strong><span class="badge">可處理 ${z.baits.size} 種</span>${z.npcs.map(v=>`<div>• ${npcMapButton(v)}${v.shop?` · ${fgEsc(v.shop)}`:''}${v.coords?` · X/Y ${fgEsc(v.coords)}`:''}${v.area?` <span class="muted">(${fgEsc(placeText(v.area))})</span>`:''}<div class="muted">${[...new Set(v.baits)].map(fgEsc).join('、')}</div></div>`).join('')}</div>`).join('')}`;
  }

  function renderFishingGuideLayer(){fillPanels();renderBaitShoppingList();refreshRoutePanel()}
  function renderFishingGuide(){fgLoadCachedMethodData();renderFishingGuideLayer()}

  // ---- 秒數自動載入：使用者展開哪個釣點，就載入那個釣點的秒數 ----
  // 每個釣點排一條佇列（第一條魚抓資料，其餘共用），同時最多跑 3 個釣點。
  const biteQueued=new WeakSet(),biteRunningSpots=new Set(),biteSpotQueues=new Map();
  const MAX_SPOT_WORKERS=3;
  let activeSpotWorkers=0,biteScanTimer=0;
  function canAutoLoadBite(button){return !!(button&&button.dataset?.fgBite&&button.dataset?.fgSpot&&button.dataset?.fgBait)}
  async function autoLoadBite(button){
    if(!canAutoLoadBite(button)||button.dataset.biteAutoLoaded==='1'||button.dataset.biteAutoLoading==='1')return;
    button.dataset.biteAutoLoading='1';
    button.hidden=true;
    const value=button.closest('.fish-method')?.querySelector('.fish-bite-value');
    if(value&&!String(value.textContent||'').includes('手動'))value.textContent='載入中…';
    try{
      await fgLoadFishBite(button,+button.dataset.fgBite,+button.dataset.fgSpot,button.dataset.fgBait,false);
      button.dataset.biteAutoLoaded='1';
    }catch(e){
      if(value)value.textContent='無社群秒數資料';
    }finally{
      button.dataset.biteAutoLoading='0';
      button.hidden=true;
    }
  }
  function pumpBiteQueues(){
    if(activeSpotWorkers>=MAX_SPOT_WORKERS)return;
    for(const[spotId,buttons]of biteSpotQueues){
      if(activeSpotWorkers>=MAX_SPOT_WORKERS)break;
      if(biteRunningSpots.has(spotId)||!buttons.length)continue;
      biteRunningSpots.add(spotId);
      activeSpotWorkers++;
      biteSpotQueues.delete(spotId);
      (async()=>{
        try{for(const button of buttons)await autoLoadBite(button)}
        finally{
          biteRunningSpots.delete(spotId);
          activeSpotWorkers--;
          pumpBiteQueues();
        }
      })();
    }
  }
  function queueBiteButtons(root){
    for(const button of[...(root?.querySelectorAll?.('[data-fg-bite]')||[])]){
      button.hidden=true;
      if(biteQueued.has(button)||button.dataset.biteAutoLoaded==='1'||button.dataset.biteAutoLoading==='1')continue;
      biteQueued.add(button);
      const spotId=String(button.dataset.fgSpot||'');
      if(!spotId)continue;
      if(!biteSpotQueues.has(spotId))biteSpotQueues.set(spotId,[]);
      biteSpotQueues.get(spotId).push(button);
    }
    pumpBiteQueues();
  }
  // 只處理使用者真的展開的區塊，不預先載入收起來的地圖。
  function scanOpenBiteLists(){
    const root=$('fish-catalog');if(!root)return;
    root.querySelectorAll('details.spot[open]').forEach(queueBiteButtons);
    root.querySelectorAll('details.zone[open]').forEach(zone=>{if(!zone.querySelector('details.spot'))queueBiteButtons(zone)});
  }
  function scheduleBiteScan(){clearTimeout(biteScanTimer);biteScanTimer=setTimeout(scanOpenBiteLists,20)}
  function initBiteAutoLoad(){
    const root=$('fish-catalog');if(!root)return;
    root.addEventListener('toggle',e=>{
      const details=e.target;
      if(!(details instanceof HTMLDetailsElement)||!details.open)return;
      if(details.matches('details.spot'))queueBiteButtons(details);
      else if(details.matches('details.zone')){
        details.querySelectorAll('details.spot[open]').forEach(queueBiteButtons);
        if(!details.querySelector('details.spot'))queueBiteButtons(details);
      }
    },true);
    new MutationObserver(scheduleBiteScan).observe(root,{childList:true,subtree:true});
    document.addEventListener('ff14-fish-catalog-rendered',scheduleBiteScan);
    scanOpenBiteLists();
  }

  // ---- 顯示範圍：選了地圖／釣點才顯示釣法；採買清單另外要展開 ----
  let scopeTimer=null;
  const scopeActive=()=>!!(pickerValue('fish-picker-zone')||pickerValue('fish-picker-spot'));
  function setHtmlIfChanged(el,html){if(el&&el.innerHTML!==html)el.innerHTML=html}
  function clearGuide(){
    document.querySelectorAll('#fish-catalog .fish-method').forEach(x=>x.remove());
    setHtmlIfChanged($('fish-bait-summary'),'<span class="muted">先選地圖或釣點，再自動顯示該範圍的魚餌／釣法。</span>');
    setHtmlIfChanged($('fish-bait-list'),'');
    setHtmlIfChanged($('fish-vendor-plan'),'');
  }
  function renderScoped(){
    const active=scopeActive();
    $('fishing')?.classList.toggle('fish-guide-scope-active',active);
    if(!active){clearGuide();return}
    renderFishingGuide();
  }
  function scheduleScoped(delay=40){clearTimeout(scopeTimer);scopeTimer=setTimeout(renderScoped,delay)}
  function shoppingOpen(){return !!$('fishing')?.classList.contains('fish-shopping-open')}
  function setShoppingOpen(open){
    const btn=$('fish-shopping-toggle');
    $('fishing')?.classList.toggle('fish-shopping-open',!!open);
    if(btn){btn.setAttribute('aria-expanded',open?'true':'false');btn.textContent=open?'收起採買清單':'展開採買清單'}
    if(open&&scopeActive())renderFishingGuide();
  }
  function ensureShoppingToggle(){
    const toolbar=$('fish-bait-only-required')?.closest('.bait-toolbar');
    if(!toolbar)return;
    toolbar.classList.add('fish-shopping-toolbar');
    if(!$('fish-shopping-toggle')){
      const btn=document.createElement('button');btn.type='button';btn.id='fish-shopping-toggle';btn.className='fish-shopping-toggle';btn.setAttribute('aria-controls','fish-bait-summary fish-bait-list fish-vendor-plan');
      toolbar.prepend(btn);btn.addEventListener('click',()=>setShoppingOpen(!shoppingOpen()));
    }
    setShoppingOpen(false);
  }
  function initScope(){
    if(!$('fishing'))return;
    for(const id of['fish-picker-region','fish-picker-zone','fish-picker-spot'])$(id)?.addEventListener('change',()=>scheduleScoped(20));
    ensureShoppingToggle();scheduleScoped(0);
  }

  // ---- 樣式 ----
  function addStyle(id,css){if($(id))return;const s=document.createElement('style');s.id=id;s.textContent=css;document.head.appendChild(s)}
  const SCOPE_CSS=`
      #fishing:not(.fish-guide-scope-active) #fish-catalog .fish-method{display:none!important}
      #fishing:not(.fish-shopping-open) #fish-bait-summary,
      #fishing:not(.fish-shopping-open) #fish-bait-list,
      #fishing:not(.fish-shopping-open) #fish-vendor-plan,
      #fishing:not(.fish-shopping-open) .fish-method-source{display:none!important}
      #fishing:not(.fish-shopping-open) .fish-shopping-toolbar>:not(#fish-shopping-toggle){display:none!important}
      .fish-shopping-toolbar{align-items:center}.fish-shopping-toggle{min-height:36px}
    `;
  const NPC_LINK_CSS=`
      .npc-map-link{appearance:none;border:0;background:transparent;color:inherit;font:inherit;padding:0;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px;cursor:pointer}
      .npc-map-link:hover{text-decoration-style:solid}.npc-map-link:focus-visible{outline:2px solid currentColor;outline-offset:2px;border-radius:3px}
    `;

  // ---- 啟動 ----
  // 頁面上固定的按鈕與容器（之後會搬進 index.html）。
  function fgEnsureUi(){
    const refresh=document.getElementById('refresh-fish-methods');
    if(refresh&&!document.getElementById('load-visible-bite-times')){const b=document.createElement('button');b.id='load-visible-bite-times';b.textContent='載入目前畫面秒數';refresh.insertAdjacentElement('afterend',b)}
    const toolbar=document.querySelector('.bait-toolbar');
    const required=document.getElementById('fish-bait-only-required');
    if(required){required.checked=fgUiPref('fishBaitOnlyRequired',true);const text=required.parentElement;if(text)text.lastChild.textContent=' 購物清單只看「已確認萬能餌不可用」'}
    if(toolbar&&!document.getElementById('resolve-bait-sources')){const b=document.createElement('button');b.id='resolve-bait-sources';b.textContent='解析購物清單 NPC';toolbar.appendChild(b)}
    const baitList=document.getElementById('fish-bait-list');
    if(baitList&&!document.getElementById('fish-vendor-plan')){const v=document.createElement('div');v.id='fish-vendor-plan';v.className='result vendor-plan';baitList.insertAdjacentElement('afterend',v)}
  }

  Object.assign(window,{renderFishingGuideLayer,renderFishingGuide,renderBaitShoppingList,renderVendorPlan,FF14FishGuide:Object.freeze({methodForName:fgMethodForName,pathNames:fgPathNames,resolveBaitItemId:fgResolveBaitItemId})});

  addStyle('fish-guide-scope-style',SCOPE_CSS);
  ensureEnglishNames().then(()=>scheduleFill(0));
  queueMicrotask(()=>scheduleFill(0));

  window.addEventListener('DOMContentLoaded',()=>{
    fgEnsureUi();
    $('refresh-fish-methods')?.addEventListener('click',()=>loadFishMethodData(true));
    $('load-visible-bite-times')?.addEventListener('click',fgLoadVisibleBiteTimes);
    $('fish-bait-only-required')?.addEventListener('change',e=>{store.set('fishBaitOnlyRequired',e.target.checked);renderBaitShoppingList();renderVendorPlan()});
    $('resolve-bait-sources')?.addEventListener('click',fgResolveShoppingSources);
    fgLoadCachedMethodData();
    shared.whenActive().then(()=>loadFishMethodData(false));
    renderFishingGuideLayer();

    addStyle('ff14-npc-tc-style',NPC_LINK_CSS);
    document.addEventListener('click',e=>{
      const el=e.target?.closest?.('.npc-map-link');if(!el)return;
      window.openFF14MapAt?.(el.dataset.npcMapZone,el.dataset.npcMapCoords,el.dataset.npcMapName||'NPC',el.dataset.npcMapArea||'');
    });

    initScope();

    // 魚清單一有變動就補釣法面板；資料陸續到齊，前幾秒多補幾次。
    const root=$('fish-catalog');
    if(root)new MutationObserver(()=>scheduleFill(20)).observe(root,{childList:true,subtree:true});
    scheduleFill(0);
    for(const delay of[400,1200,3000])setTimeout(()=>scheduleFill(0),delay);

    initBiteAutoLoad();
  });
})();
