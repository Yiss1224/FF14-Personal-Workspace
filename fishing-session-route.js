// Window-aware fishing session route planner. Heavy analysis is explicit and map-scoped.
(function(){
  'use strict';

  const DEFAULT_SESSION_MIN=90;
  const ORDINARY_FISH_MIN=5;
  const MOVE_MIN=3;
  const STAY_FOR_WINDOW_MIN=20;
  const MAX_STOPS=10;
  const YIELD_EVERY=4;
  let renderToken=0;
  let restoreTimer=null;
  let restoreObserver=null;

  function read(key,def){try{return JSON.parse(localStorage.getItem(key))??def}catch{return def}}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function idOf(v){return Number(v&&typeof v==='object'?(v.id??v.itemId??v.fishId):v)}
  function intSet(values){return new Set((values||[]).map(idOf).filter(Number.isFinite))}
  function itemText(v){const s=String(v||'');try{return typeof window.ff14TcItemText==='function'?window.ff14TcItemText(s):s}catch{return s}}
  function placeText(v){const s=String(v||'');try{return typeof window.ff14TcPlaceText==='function'?window.ff14TcPlaceText(s):s}catch{return s}}
  function fmtClock(ms){return new Date(ms).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}
  function fmtMin(ms){if(!Number.isFinite(ms))return'—';return`${Math.max(0,Math.round(ms/60000))} 分`}
  function yieldUi(){return new Promise(resolve=>setTimeout(resolve,0))}
  function caught(){try{if(typeof window.getCaughtIds==='function')return intSet(window.getCaughtIds())}catch{}return intSet([...(read('fishcakeCaughtIds',[])||[]),...(read('fishCaughtIds',[])||[])])}
  function skipped(){try{if(typeof window.getSkippedIds==='function')return intSet(window.getSkippedIds())}catch{}return intSet(read('fishSkippedIds',[])||[])}
  function catalog(){return read('fishCatalog',[])||[]}
  function fishLocations(fish){if(typeof window.fishLocations==='function')return window.fishLocations(fish);return Array.isArray(fish?.spots)&&fish.spots.length?fish.spots:[fish]}
  function pickerMap(){return{region:String(document.getElementById('fish-picker-region')?.value||''),zone:String(document.getElementById('fish-picker-zone')?.value||'')}}
  function routeMinutes(){const own=Number(document.getElementById('fish-route-session')?.value),today=Number(document.getElementById('fish-today-session')?.value);return Number.isFinite(own)&&own>0?own:(Number.isFinite(today)&&today>0?today:DEFAULT_SESSION_MIN)}
  function spotKey(loc){const id=Number(loc?.spotId)||0;return id?`id:${id}`:`name:${loc?.regionName||''}|${loc?.zoneName||''}|${loc?.spotName||''}`}
  function matchesMap(loc,p){if(p.region&&String(loc?.regionName||'')!==p.region)return false;if(p.zone&&String(loc?.zoneName||'')!==p.zone)return false;return true}
  function locationsFor(fish,info,p){const spots=fishLocations(fish).filter(loc=>matchesMap(loc,p));if(!info?.restricted||!Number(info.locationId))return spots;return spots.filter(x=>Number(x?.spotId)===Number(info.locationId))}
  function fishName(f){return itemText(f?.name||`Item ${f?.itemId||''}`)}

  function ensureUi(){
    const result=document.getElementById('fish-route-result');if(!result)return null;
    const section=result.closest('.fishing-route-section'),head=section?.querySelector('.section-head');
    const title=head?.querySelector('h3');if(title)title.textContent='Session 路線';
    const hint=head?.querySelector('.hint');if(hint)hint.textContent='先決定要刷哪張圖，再按按鈕才分析這張圖的魚窗與建議順序。';
    const button=document.getElementById('refresh-route-plan');if(button)button.textContent='規劃這張圖路線';
    const toolbar=section?.querySelector('.bait-toolbar');
    if(toolbar&&!document.getElementById('fish-route-session')){
      const label=document.createElement('label');label.className='fish-route-session-label';
      label.innerHTML='<span>可釣時間</span><select id="fish-route-session"><option value="60">60 分</option><option value="90">90 分</option><option value="120">120 分</option></select>';
      toolbar.prepend(label);
      const sel=label.querySelector('select'),today=document.getElementById('fish-today-session');
      if(sel)sel.value=String(Number(today?.value)||DEFAULT_SESSION_MIN);
      sel?.addEventListener('change',()=>{if(today)today.value=sel.value;markStale()});
      today?.addEventListener('change',()=>{if(sel)sel.value=today.value;markStale()});
    }
    if(!document.getElementById('fish-session-route-style')){
      const style=document.createElement('style');style.id='fish-session-route-style';style.textContent=`
        .fish-route-session-label{display:flex;align-items:center;gap:6px;font-size:13px}.fish-route-session-label select{padding:7px 8px}
        .session-route-summary{margin-bottom:10px;font-size:13px}.session-route-list{display:grid;gap:9px}
        .session-route-stop{padding:11px 12px;border-radius:10px;background:rgba(127,127,127,.07)}
        .session-route-stop.urgent{background:rgba(52,168,83,.09);outline:1px solid rgba(52,168,83,.25)}
        .session-route-stop.prep{background:rgba(245,166,35,.10)}
        .session-route-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
        .session-route-time,.session-route-name{font-weight:800}.session-route-time{white-space:nowrap}.session-route-place{font-size:12px}
        .session-route-reason,.session-route-windows{margin-top:6px;font-size:13px;line-height:1.5}
        .session-route-window{display:flex;gap:6px;align-items:baseline;flex-wrap:wrap}
        .session-route-window-time{font-weight:800}.session-route-fish{margin-top:5px;font-size:12px;line-height:1.5}
        .session-route-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;flex-wrap:wrap}
        .session-route-actions button{font-size:12px}.session-route-arrow{text-align:center;opacity:.55;font-size:13px}
        .session-route-badge{display:inline-block;margin-right:5px;padding:2px 6px;border-radius:999px;background:rgba(127,127,127,.12);font-size:11px;font-weight:700}
        .session-route-note{margin-top:8px;font-size:12px}
        @media(max-width:700px){.fish-route-session-label{width:100%;justify-content:space-between}.fish-route-session-label select{min-height:40px}.session-route-top{display:grid;grid-template-columns:1fr}.session-route-time{order:-1}.session-route-actions button{min-height:40px;width:100%}}
      `;document.head.appendChild(style);
    }
    return result;
  }

  function readyText(){const p=pickerMap();return p.zone?`已選 <strong>${esc(placeText(p.zone))}</strong>。決定要刷這張圖後，再按「規劃這張圖路線」。`:'先選一張地圖；選圖本身不會進行 Session 路線計算。'}
  function showReady(){const box=ensureUi();if(box)box.innerHTML=`<span class="muted">${readyText()}</span>`}
  function cancelCurrent(){renderToken++}

  function snapshotMatchesCurrent(){
    const snap=window.__fishingSessionRouteSnapshot,p=pickerMap();
    return !!(snap?.html&&snap?.model?.stops?.length&&(!p.region||!snap.region||snap.region===p.region)&&(!p.zone||!snap.zone||snap.zone===p.zone));
  }
  function bindRouteButtons(root){root.querySelectorAll('[data-session-route-spot]').forEach(btn=>btn.addEventListener('click',()=>{if(typeof window.selectFishingSpot==='function')window.selectFishingSpot(btn.dataset.region||'',btn.dataset.zone||'',btn.dataset.spot||'')}))}
  function restoreSnapshot(){
    if(!snapshotMatchesCurrent())return false;
    const box=ensureUi(),snap=window.__fishingSessionRouteSnapshot;if(!box||!snap)return false;
    window.__fishingSessionRouteModel=snap.model;
    if(!box.querySelector('.session-route-list')){box.innerHTML=snap.html;bindRouteButtons(box)}
    try{window.refreshFishingSessionRouteMap?.()}catch{}
    return true;
  }
  function preserveOrReady(){if(!restoreSnapshot())showReady()}
  function clearRouteState(){window.__fishingSessionRouteModel=null;window.__fishingSessionRouteSnapshot=null;try{window.refreshFishingSessionRouteMap?.()}catch{}}
  function markStale(){cancelCurrent();clearRouteState();showReady()}

  async function buildModel(now,end,p,includeBig,token,box){
    const done=caught(),skip=skipped(),rows=catalog(),byId=new Map(rows.map(f=>[Number(f?.itemId),f]).filter(([id])=>id>0)),groups=new Map(),tasks=[],taskKeys=new Set(),infoCache=new Map();
    const getInfo=async id=>{if(infoCache.has(id))return infoCache.get(id);const v=await window.ff14FishingWindowInfo(id,now);infoCache.set(id,v);return v};
    const groupFor=loc=>{const key=spotKey(loc);if(!groups.has(key))groups.set(key,{key,loc,ordinary:new Map()});return groups.get(key)};
    const base=rows.filter(f=>Number(f?.itemId)>0&&f?.type!=='spearfishing'&&!done.has(Number(f.itemId))&&!skip.has(Number(f.itemId))&&(includeBig||!f.bigFish)&&fishLocations(f).some(loc=>matchesMap(loc,p)));
    for(let i=0;i<base.length;i++){
      if(token!==renderToken)return null;
      const fish=base[i],id=Number(fish.itemId),info=await getInfo(id);if(token!==renderToken)return null;
      if(info){
        const locs=locationsFor(fish,info,p);
        if(!info.restricted){for(const loc of locs)groupFor(loc).ordinary.set(id,fish)}
        else{
          const win=info.current||((info.next&&info.next[0]<end)?info.next:null);
          if(win)for(const loc of locs){const g=groupFor(loc),k=`target:${id}:${win[0]}:${g.key}`;if(taskKeys.has(k))continue;taskKeys.add(k);tasks.push({key:k,kind:'target',fish,spot:g,start:Number(win[0]),end:Number(win[1]),served:false})}
        }
      }
      if(typeof window.ff14FishingPrerequisites==='function'){
        const reqs=await window.ff14FishingPrerequisites(id);if(token!==renderToken)return null;
        for(const req of reqs||[]){
          const predId=Number(req?.itemId);if(!predId||!done.has(predId)||skip.has(predId))continue;
          const pred=byId.get(predId);if(!pred)continue;
          const predInfo=await getInfo(predId);if(token!==renderToken)return null;if(!predInfo?.restricted)continue;
          const win=predInfo.current||((predInfo.next&&predInfo.next[0]<end)?predInfo.next:null);if(!win)continue;
          for(const loc of locationsFor(pred,predInfo,p)){
            const g=groupFor(loc),k=`prep:${predId}:${win[0]}:${g.key}`;let task=tasks.find(x=>x.key===k);
            if(!task){task={key:k,kind:'prep',fish:pred,spot:g,start:Number(win[0]),end:Number(win[1]),served:false,targets:new Map()};tasks.push(task)}
            task.targets.set(id,{fish,count:Math.max(1,Number(req?.count)||1)});
          }
        }
      }
      if((i+1)%YIELD_EVERY===0||i===base.length-1){if(box)box.innerHTML=`<span class="muted">正在分析 ${esc(placeText(p.zone))}：${i+1} / ${base.length}…</span>`;await yieldUi()}
    }
    return{groups,tasks,checked:base.length};
  }

  function activeTasks(tasks,cursor){return tasks.filter(t=>!t.served&&t.start<=cursor&&cursor<t.end).sort((a,b)=>a.end-b.end||(a.kind==='target'?0:1)-(b.kind==='target'?0:1))}
  function futureTasks(tasks,cursor,end){return tasks.filter(t=>!t.served&&t.start>cursor&&t.start<end).sort((a,b)=>a.start-b.start||a.end-b.end)}
  function remainingOrdinaryCount(group,remaining){let n=0;for(const id of group.ordinary.keys())if(remaining.has(id))n++;return n}
  function takeOrdinary(group,remaining,count){const out=[];for(const[id,fish]of group.ordinary){if(!remaining.has(id))continue;remaining.delete(id);out.push(fish);if(out.length>=count)break}return out}
  function bestFiller(groups,remaining,nextTask,currentSpot){
    let best=null,bestScore=-Infinity;
    for(const g of groups.values()){
      const n=remainingOrdinaryCount(g,remaining);if(!n)continue;
      let score=n;if(currentSpot&&g.key===currentSpot)score+=2.5;if(nextTask&&g.key===nextTask.spot.key)score+=2;
      if(score>bestScore){bestScore=score;best=g}
    }
    return best;
  }
  function mergeWindows(a,b){const out=new Map();for(const w of [...(a||[]),...(b||[])]){const key=`${w.kind}|${Number(w.fish?.itemId)||0}|${w.start}|${w.end}`;if(!out.has(key))out.set(key,w)}return[...out.values()].sort((x,y)=>x.start-y.start||x.end-y.end)}
  function mergeStop(route,stop){
    stop.fish=Array.isArray(stop.fish)?stop.fish.filter(Boolean):[];
    if(stop.kind==='filler'&&!stop.fish.length)return null;
    stop.modes=[...new Set(stop.modes||[stop.kind])];stop.windows=mergeWindows([],stop.windows);
    const last=route[route.length-1];
    if(last&&last.spot.key===stop.spot.key){
      last.end=Math.max(last.end,stop.end);last.modes=[...new Set([...(last.modes||[last.kind]),...stop.modes])];
      last.kind=last.modes.includes('urgent')?'urgent':last.modes.includes('prep')?'prep':'filler';
      const fishById=new Map([...(last.fish||[]),...stop.fish].map(f=>[Number(f?.itemId)||String(f?.name||''),f]));last.fish=[...fishById.values()];
      last.windows=mergeWindows(last.windows,stop.windows);if(stop.reason&&!String(last.reason||'').includes(stop.reason))last.reason=`${last.reason||''}${last.reason?'；':''}${stop.reason}`;return last;
    }
    route.push(stop);return stop;
  }

  function safeMinutesAtCurrentSpot(cursor,next,currentSpot){
    const until=next?Math.max(0,Math.floor((next.start-cursor)/60000)):Infinity;
    const moveOut=next&&currentSpot!==next.spot.key?MOVE_MIN:0;
    return Number.isFinite(until)?Math.max(0,until-moveOut):Infinity;
  }
  function clearCurrentSpotOrdinary(route,groups,remaining,currentSpot,cursor,end,next){
    if(!currentSpot)return null;
    const here=groups.get(currentSpot);if(!here)return null;
    const n=remainingOrdinaryCount(here,remaining);if(!n)return null;
    const safe=safeMinutesAtCurrentSpot(cursor,next,currentSpot);
    const available=Math.min(Math.floor((end-cursor)/60000),Number.isFinite(safe)?safe:9999);
    if(available<ORDINARY_FISH_MIN)return null;
    const count=Math.max(1,Math.min(n,Math.floor(available/ORDINARY_FISH_MIN),4));
    const dwell=Math.min(count*ORDINARY_FISH_MIN,20,available),fish=takeOrdinary(here,remaining,count);
    if(!fish.length)return null;
    const reason=next?`窗口後先清本釣點普通魚；預留 ${currentSpot===next.spot.key?0:MOVE_MIN} 分前往下一窗（${fmtClock(next.start)}）`:'窗口後先把本釣點普通魚清掉';
    mergeStop(route,{spot:here,start:cursor,end:Math.min(end,cursor+dwell*60000),kind:'filler',reason,fish});
    return Math.min(end,cursor+dwell*60000);
  }

  function plan(model,now,end){
    const groups=model.groups,tasks=model.tasks,remaining=new Set();for(const g of groups.values())for(const id of g.ordinary.keys())remaining.add(id);
    const route=[];let cursor=now,currentSpot=null,guard=0,justHandledWindow=false;
    while(cursor<end&&route.length<MAX_STOPS&&guard++<80){
      for(const t of tasks)if(!t.served&&t.end<=cursor)t.served=true;
      const active=activeTasks(tasks,cursor);
      if(active.length){
        const first=active[0];if(currentSpot&&currentSpot!==first.spot.key)cursor=Math.min(end,cursor+MOVE_MIN*60000);if(cursor>=end)break;
        const same=activeTasks(tasks,cursor).filter(t=>t.spot.key===first.spot.key);if(!same.length)continue;
        const minEnd=Math.min(...same.map(t=>t.end)),available=Math.max(2,Math.floor((minEnd-cursor)/60000)),dwell=Math.max(2,Math.min(15,available,5+Math.max(0,same.length-1)*3)),target=same.filter(t=>t.kind==='target');
        same.forEach(t=>t.served=true);
        const names=[...new Map(same.map(t=>[Number(t.fish.itemId),t.fish])).values()],windows=same.map(t=>({kind:t.kind,fish:t.fish,start:t.start,end:t.end}));
        const reason=target.length?`先救正在開的窗口；最早 ${fmtMin(minEnd-cursor)}後關`:`先處理直感前置窗口；最早 ${fmtMin(minEnd-cursor)}後關`;
        mergeStop(route,{spot:first.spot,start:cursor,end:Math.min(end,cursor+dwell*60000),kind:target.length?'urgent':'prep',reason,fish:names,windows});
        cursor=Math.min(end,cursor+dwell*60000);currentSpot=first.spot.key;justHandledWindow=true;continue;
      }

      const future=futureTasks(tasks,cursor,end),next=future[0]||null;

      if(justHandledWindow){
        const nextCursor=clearCurrentSpotOrdinary(route,groups,remaining,currentSpot,cursor,end,next);
        if(nextCursor!=null){cursor=nextCursor;continue}
        justHandledWindow=false;
      }

      const gap=next?Math.max(0,next.start-cursor):Math.max(0,end-cursor);
      if(next&&currentSpot&&next.spot.key===currentSpot&&gap<=STAY_FOR_WINDOW_MIN*60000){
        const nextCursor=clearCurrentSpotOrdinary(route,groups,remaining,currentSpot,cursor,end,next);
        if(nextCursor!=null){cursor=nextCursor;continue}
        cursor=Math.min(end,next.start);continue;
      }

      const filler=bestFiller(groups,remaining,next,currentSpot);
      if(filler){
        const travelIn=currentSpot&&currentSpot!==filler.key?MOVE_MIN:0,travelOut=next&&filler.key!==next.spot.key?MOVE_MIN:0,availableMin=Math.floor(gap/60000)-travelIn-travelOut,n=remainingOrdinaryCount(filler,remaining);
        if(availableMin>=ORDINARY_FISH_MIN&&n){
          if(travelIn)cursor=Math.min(end,cursor+travelIn*60000);
          const count=Math.max(1,Math.min(n,Math.floor(availableMin/ORDINARY_FISH_MIN),4)),dwell=Math.min(count*ORDINARY_FISH_MIN,20,availableMin),fish=takeOrdinary(filler,remaining,count);
          if(fish.length){mergeStop(route,{spot:filler,start:cursor,end:Math.min(end,cursor+dwell*60000),kind:'filler',reason:next?`用窗口前空檔清普通魚；下一窗約 ${fmtClock(next.start)} 開`:'目前沒有更急窗口，先清普通魚',fish});cursor=Math.min(end,cursor+dwell*60000);currentSpot=filler.key;continue}
        }
      }
      if(next){if(currentSpot&&currentSpot!==next.spot.key)cursor=Math.max(cursor,next.start-MOVE_MIN*60000);cursor=Math.min(end,next.start);currentSpot=next.spot.key;continue}
      break;
    }
    return route;
  }

  function windowHtml(stop){const windows=stop.windows||[];if(!windows.length)return'';return `<div class="session-route-windows">${windows.map(w=>`<div class="session-route-window"><span>${w.kind==='prep'?'🧩 前置窗口':'🕒 窗口'}　${esc(fishName(w.fish))}</span><span class="session-route-window-time">${esc(fmtClock(w.start))}–${esc(fmtClock(w.end))}</span></div>`).join('')}</div>`}
  function stopHtml(stop,index){
    const loc=stop.spot.loc||{},region=placeText(loc.regionName||''),zone=placeText(loc.zoneName||''),spot=placeText(loc.spotName||'未知釣點'),minutes=Math.max(1,Math.round((stop.end-stop.start)/60000)),modes=stop.modes||[stop.kind];
    const badges=[modes.includes('filler')?'<span class="session-route-badge">🧹 普通魚</span>':'',modes.includes('urgent')?'<span class="session-route-badge">🟢 窗口</span>':'',modes.includes('prep')?'<span class="session-route-badge">🧩 前置</span>':''].filter(Boolean).join('');
    const fish=Array.isArray(stop.fish)?stop.fish:[],names=fish.slice(0,5).map(f=>esc(fishName(f))).join('、')+(fish.length>5?'…':'');
    return `<div class="session-route-stop ${stop.kind}"><div class="session-route-top"><div><div class="session-route-name">${index+1}. ${esc(spot)}</div><div class="session-route-place muted">${[region,zone].filter(Boolean).map(esc).join(' / ')}</div></div><div class="session-route-time">約 ${esc(fmtClock(stop.start))}</div></div><div class="session-route-reason">${badges}${esc(stop.reason)}</div>${windowHtml(stop)}${names?`<div class="session-route-fish">目標：${names}</div>`:''}<div class="session-route-actions"><span class="muted">建議停留約 ${minutes} 分${modes.includes('filler')?'（普通魚每條先估 5 分）':''}</span><button type="button" data-session-route-spot="1" data-region="${esc(loc.regionName||'')}" data-zone="${esc(loc.zoneName||'')}" data-spot="${esc(loc.spotName||'')}">前往釣點</button></div></div>`;
  }

  function publishRouteSnapshot(route,p,html){
    const model={region:p.region||'',zone:p.zone||'',stops:route.map((stop,index)=>{const loc=stop.spot?.loc||{};return{order:index+1,region:loc.regionName||p.region||'',zone:loc.zoneName||p.zone||'',spot:loc.spotName||'',spotKey:stop.spot?.key||'',start:stop.start,end:stop.end}})};
    window.__fishingSessionRouteModel=model;window.__fishingSessionRouteSnapshot={region:p.region||'',zone:p.zone||'',html,model,createdAt:Date.now()};try{window.refreshFishingSessionRouteMap?.()}catch{}
  }

  async function render(){
    const box=ensureUi();if(!box)return;const p=pickerMap(),minutes=routeMinutes();
    if(!p.zone){clearRouteState();showReady();return}
    if(typeof window.ff14FishingWindowInfo!=='function'){box.innerHTML='<span class="muted">魚窗資料尚未準備好，請稍後再按一次。</span>';return}
    clearRouteState();const token=++renderToken,now=Date.now(),end=now+minutes*60000,includeBig=!(document.getElementById('fish-hide-big')?.checked??true);box.innerHTML=`<span class="muted">正在分析 ${esc(placeText(p.zone))} 的 Session 路線…</span>`;
    try{
      const model=await buildModel(now,end,p,includeBig,token,box);if(!model||token!==renderToken)return;const route=plan(model,now,end);if(token!==renderToken)return;
      if(!route.length){box.innerHTML=`<span class="muted">${esc(placeText(p.zone))} 在接下來 ${minutes} 分鐘沒有找到可安排的未釣魚／前置窗口。</span>`;return}
      const currentTasks=model.tasks.filter(t=>t.start<=now&&now<t.end).length,futureCount=model.tasks.filter(t=>t.start>now&&t.start<end).length;
      const html=`<div class="session-route-summary muted"><strong>${esc(placeText(p.zone))}</strong> · ${minutes} 分鐘 Session（${esc(fmtClock(now))}–${esc(fmtClock(end))}） · 分析 ${model.checked} 條未釣魚 · 目前窗口 ${currentTasks} · Session 內將開 ${futureCount}<br>只分析你按下按鈕時選定的這張圖；普通魚估 ${ORDINARY_FISH_MIN} 分／條、真的換點才算 ${MOVE_MIN} 分。</div><div class="session-route-list">${route.map((s,i)=>stopHtml(s,i)+(i<route.length-1?'<div class="session-route-arrow">↓</div>':'')).join('')}</div><div class="session-route-note muted">窗口站會顯示實際開窗／關窗時間。窗口處理完會先清目前釣點剩餘普通魚，再依下一窗時間決定是否換點。標記釣到或切換釣點不會自動洗掉這份路線；要依最新進度更新時再按一次「規劃這張圖路線」。</div>`;
      box.innerHTML=html;bindRouteButtons(box);publishRouteSnapshot(route,p,html);
    }catch(e){if(token!==renderToken)return;clearRouteState();console.warn('session route failed',e);box.innerHTML=`<span class="muted">路線計算失敗：${esc(e?.message||e)}。頁面仍可繼續使用。</span>`}
  }

  function init(){
    ensureUi();document.addEventListener('click',e=>{const btn=e.target?.closest?.('#refresh-route-plan');if(!btn)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();render()},true);
    document.getElementById('fish-picker-region')?.addEventListener('change',markStale);document.getElementById('fish-picker-zone')?.addEventListener('change',markStale);document.getElementById('fish-hide-big')?.addEventListener('change',markStale);
    const result=document.getElementById('fish-route-result');if(result){restoreObserver=new MutationObserver(()=>{if(snapshotMatchesCurrent()&&!result.querySelector('.session-route-list'))queueMicrotask(restoreSnapshot)});restoreObserver.observe(result,{childList:true})}
    restoreTimer=setInterval(()=>{if(snapshotMatchesCurrent()){const box=document.getElementById('fish-route-result');if(box&&!box.querySelector('.session-route-list'))restoreSnapshot()}},1000);preserveOrReady();
  }

  window.renderSessionFishingRoute=render;window.renderRoutePlanner=preserveOrReady;window.resetSessionFishingRoute=preserveOrReady;window.preserveSessionFishingRoute=restoreSnapshot;
  window.addEventListener('DOMContentLoaded',init);window.addEventListener('pagehide',()=>{if(restoreTimer)clearInterval(restoreTimer);restoreObserver?.disconnect()},{once:true});
})();
