// Window-aware fishing session route planner.
(function(){
  'use strict';

  const DEFAULT_SESSION_MIN=90;
  const ORDINARY_FISH_MIN=5;
  const MOVE_MIN=3;
  const MAX_STOPS=10;
  let renderToken=0;

  function read(key,def){try{return JSON.parse(localStorage.getItem(key))??def}catch{return def}}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function idOf(v){return Number(v&&typeof v==='object'?(v.id??v.itemId??v.fishId):v)}
  function intSet(values){return new Set((values||[]).map(idOf).filter(Number.isFinite))}
  function itemText(v){const s=String(v||'');try{return typeof window.ff14TcItemText==='function'?window.ff14TcItemText(s):s}catch{return s}}
  function placeText(v){const s=String(v||'');try{return typeof window.ff14TcPlaceText==='function'?window.ff14TcPlaceText(s):s}catch{return s}}
  function fmtClock(ms){return new Date(ms).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}
  function fmtMin(ms){if(!Number.isFinite(ms))return'—';return`${Math.max(0,Math.round(ms/60000))} 分`}
  function caught(){try{if(typeof window.getCaughtIds==='function')return intSet(window.getCaughtIds())}catch{}return intSet([...(read('fishcakeCaughtIds',[])||[]),...(read('fishCaughtIds',[])||[])])}
  function skipped(){try{if(typeof window.getSkippedIds==='function')return intSet(window.getSkippedIds())}catch{}return intSet(read('fishSkippedIds',[])||[])}
  function catalog(){return read('fishCatalog',[])||[]}
  function fishLocations(fish){if(typeof window.fishLocations==='function')return window.fishLocations(fish);return Array.isArray(fish?.spots)&&fish.spots.length?fish.spots:[fish]}
  function picker(){return{region:String(document.getElementById('fish-picker-region')?.value||''),zone:String(document.getElementById('fish-picker-zone')?.value||''),spot:String(document.getElementById('fish-picker-spot')?.value||'')}}
  function routeMinutes(){const own=Number(document.getElementById('fish-route-session')?.value),today=Number(document.getElementById('fish-today-session')?.value);return Number.isFinite(own)&&own>0?own:(Number.isFinite(today)&&today>0?today:DEFAULT_SESSION_MIN)}
  function spotKey(loc){const id=Number(loc?.spotId)||0;return id?`id:${id}`:`name:${loc?.regionName||''}|${loc?.zoneName||''}|${loc?.spotName||''}`}
  function matchesPicker(loc,p){if(p.region&&String(loc?.regionName||'')!==p.region)return false;if(p.zone&&String(loc?.zoneName||'')!==p.zone)return false;if(p.spot&&String(loc?.spotName||'')!==p.spot)return false;return true}
  function locationsFor(fish,info,p){const spots=fishLocations(fish).filter(loc=>matchesPicker(loc,p));if(!info?.restricted||!Number(info.locationId))return spots;return spots.filter(x=>Number(x?.spotId)===Number(info.locationId))}
  function fishName(f){return itemText(f?.name||`Item ${f?.itemId||''}`)}

  function ensureUi(){
    const result=document.getElementById('fish-route-result');if(!result)return null;
    const section=result.closest('.fishing-route-section');
    const head=section?.querySelector('.section-head');
    const title=head?.querySelector('h3');if(title)title.textContent='Session 路線';
    const hint=head?.querySelector('.hint');if(hint)hint.textContent='窗口急迫度決定先後；普通未釣魚拿來填窗口之間的空檔。時間是規劃估算，不代表一定能在該時間內釣到。';
    const button=document.getElementById('refresh-route-plan');if(button)button.textContent='依窗口重算路線';
    const toolbar=section?.querySelector('.bait-toolbar');
    if(toolbar&&!document.getElementById('fish-route-session')){
      const label=document.createElement('label');label.className='fish-route-session-label';label.innerHTML='<span>可釣時間</span><select id="fish-route-session"><option value="60">60 分</option><option value="90">90 分</option><option value="120">120 分</option></select>';
      toolbar.prepend(label);
      const sel=label.querySelector('select'),today=document.getElementById('fish-today-session');
      if(sel)sel.value=String(Number(today?.value)||DEFAULT_SESSION_MIN);
      sel?.addEventListener('change',()=>{if(today)today.value=sel.value;render()});
      today?.addEventListener('change',()=>{if(sel)sel.value=today.value;render()});
    }
    if(!document.getElementById('fish-session-route-style')){
      const style=document.createElement('style');style.id='fish-session-route-style';style.textContent=`
        .fish-route-session-label{display:flex;align-items:center;gap:6px;font-size:13px}.fish-route-session-label select{padding:7px 8px}.session-route-summary{margin-bottom:10px;font-size:13px}.session-route-list{display:grid;gap:9px}.session-route-stop{padding:11px 12px;border-radius:10px;background:rgba(127,127,127,.07)}.session-route-stop.urgent{background:rgba(52,168,83,.09);outline:1px solid rgba(52,168,83,.25)}.session-route-stop.prep{background:rgba(245,166,35,.10)}.session-route-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.session-route-time{font-weight:800;white-space:nowrap}.session-route-name{font-weight:800}.session-route-place{font-size:12px}.session-route-reason{margin-top:6px;font-size:13px;line-height:1.5}.session-route-fish{margin-top:5px;font-size:12px;line-height:1.5}.session-route-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;flex-wrap:wrap}.session-route-actions button{font-size:12px}.session-route-arrow{text-align:center;opacity:.55;font-size:13px}.session-route-badge{display:inline-block;margin-right:5px;padding:2px 6px;border-radius:999px;background:rgba(127,127,127,.12);font-size:11px;font-weight:700}.session-route-note{margin-top:8px;font-size:12px}
        @media(max-width:700px){.fish-route-session-label{width:100%;justify-content:space-between}.fish-route-session-label select{min-height:40px}.session-route-top{display:grid;grid-template-columns:1fr}.session-route-time{order:-1}.session-route-actions button{min-height:40px;width:100%}}
      `;document.head.appendChild(style);
    }
    return result;
  }

  function readyAllowedKeys(){
    if(!document.getElementById('fish-route-ready-only')?.checked||typeof window.fgBuildSpotPlan!=='function')return null;
    try{return new Set((window.fgBuildSpotPlan()||[]).map(x=>spotKey(x)).filter(Boolean))}catch{return null}
  }

  async function buildModel(now,end,p,includeBig,token){
    const done=caught(),skip=skipped(),rows=catalog(),byId=new Map(rows.map(f=>[Number(f?.itemId),f]).filter(([id])=>id>0)),groups=new Map(),tasks=[],taskKeys=new Set(),infoCache=new Map(),allowed=readyAllowedKeys();
    const getInfo=async(id,t=now)=>{const k=`${id}@${t}`;if(infoCache.has(k))return infoCache.get(k);const v=await window.ff14FishingWindowInfo(id,t);infoCache.set(k,v);return v};
    const groupFor=loc=>{const key=spotKey(loc);if(allowed&&!allowed.has(key))return null;if(!groups.has(key))groups.set(key,{key,loc,ordinary:new Map()});return groups.get(key)};
    const base=rows.filter(f=>Number(f?.itemId)>0&&f?.type!=='spearfishing'&&!done.has(Number(f.itemId))&&!skip.has(Number(f.itemId))&&(includeBig||!f.bigFish)&&fishLocations(f).some(loc=>matchesPicker(loc,p)));

    const checked=await Promise.all(base.map(async fish=>({fish,info:await getInfo(Number(fish.itemId)),reqs:typeof window.ff14FishingPrerequisites==='function'?await window.ff14FishingPrerequisites(Number(fish.itemId)):[]})));
    if(token!==renderToken)return null;

    for(const row of checked){
      const fish=row.fish,id=Number(fish.itemId),info=row.info;if(!info)continue;
      const locs=locationsFor(fish,info,p);
      if(!info.restricted){for(const loc of locs){const g=groupFor(loc);if(g)g.ordinary.set(id,fish)}}
      else{
        const win=info.current||((info.next&&info.next[0]<end)?info.next:null);
        if(win){for(const loc of locs){const g=groupFor(loc);if(!g)continue;const k=`target:${id}:${win[0]}:${g.key}`;if(taskKeys.has(k))continue;taskKeys.add(k);tasks.push({key:k,kind:'target',fish,spot:g,start:Number(win[0]),end:Number(win[1]),served:false})}}
      }
      for(const req of row.reqs||[]){
        const predId=Number(req?.itemId);if(!predId||!done.has(predId)||skip.has(predId))continue;
        const pred=byId.get(predId);if(!pred)continue;
        const predInfo=await getInfo(predId);if(token!==renderToken)return null;if(!predInfo?.restricted)continue;
        const win=predInfo.current||((predInfo.next&&predInfo.next[0]<end)?predInfo.next:null);if(!win)continue;
        for(const loc of locationsFor(pred,predInfo,p)){
          const g=groupFor(loc);if(!g)continue;const k=`prep:${predId}:${win[0]}:${g.key}`;let task=tasks.find(x=>x.key===k);if(!task){task={key:k,kind:'prep',fish:pred,spot:g,start:Number(win[0]),end:Number(win[1]),served:false,targets:new Map()};tasks.push(task)}task.targets.set(id,{fish,count:Math.max(1,Number(req?.count)||1)});
        }
      }
    }
    return{groups,tasks,done,skip};
  }

  function activeTasks(tasks,cursor){return tasks.filter(t=>!t.served&&t.start<=cursor&&cursor<t.end).sort((a,b)=>a.end-b.end||(a.kind==='target'?0:1)-(b.kind==='target'?0:1))}
  function futureTasks(tasks,cursor,end){return tasks.filter(t=>!t.served&&t.start>cursor&&t.start<end).sort((a,b)=>a.start-b.start||a.end-b.end)}
  function remainingOrdinaryCount(group,remaining){let n=0;for(const id of group.ordinary.keys())if(remaining.has(id))n++;return n}
  function bestFiller(groups,remaining,nextTask,currentSpot){
    let best=null,bestScore=-1;
    for(const g of groups.values()){
      const n=remainingOrdinaryCount(g,remaining);if(!n)continue;
      let score=n;
      if(nextTask&&g.key===nextTask.spot.key)score+=1.5;
      if(currentSpot&&g.key===currentSpot)score+=.25;
      if(score>bestScore){bestScore=score;best=g}
    }
    return best;
  }
  function takeOrdinary(group,remaining,count){const out=[];for(const[id,fish]of group.ordinary){if(!remaining.has(id))continue;remaining.delete(id);out.push(fish);if(out.length>=count)break}return out}
  function mergeStop(route,stop){const last=route[route.length-1];if(last&&last.spot.key===stop.spot.key&&last.kind===stop.kind&&Math.abs(stop.start-last.end)<=MOVE_MIN*60000){last.end=stop.end;last.fish.push(...stop.fish);last.reason+='；'+stop.reason;return}route.push(stop)}

  function plan(model,now,end){
    const groups=model.groups,tasks=model.tasks,remaining=new Set();for(const g of groups.values())for(const id of g.ordinary.keys())remaining.add(id);
    const route=[];let cursor=now,currentSpot=null,guard=0;
    while(cursor<end&&route.length<MAX_STOPS&&guard++<40){
      for(const t of tasks)if(!t.served&&t.end<=cursor)t.served=true;
      const active=activeTasks(tasks,cursor);
      if(active.length){
        const first=active[0],same=active.filter(t=>t.spot.key===first.spot.key),minEnd=Math.min(...same.map(t=>t.end)),available=Math.max(2,Math.floor((minEnd-cursor)/60000)),dwell=Math.max(2,Math.min(15,available,5+Math.max(0,same.length-1)*3)),target=same.filter(t=>t.kind==='target'),prep=same.filter(t=>t.kind==='prep');
        same.forEach(t=>t.served=true);
        const names=[...new Map(same.map(t=>[Number(t.fish.itemId),t.fish])).values()];
        const reason=target.length?`先救正在開的窗口；最早 ${fmtMin(minEnd-cursor)}後關`:`先處理直感前置窗口；最早 ${fmtMin(minEnd-cursor)}後關`;
        mergeStop(route,{spot:first.spot,start:cursor,end:Math.min(end,cursor+dwell*60000),kind:target.length?'urgent':'prep',reason,fish:names,targetCount:target.length,prepCount:prep.length});
        cursor=Math.min(end,cursor+dwell*60000);currentSpot=first.spot.key;if(cursor<end)cursor+=MOVE_MIN*60000;continue;
      }

      const future=futureTasks(tasks,cursor,end),next=future[0]||null,gap=next?Math.max(0,next.start-cursor):Math.max(0,end-cursor),filler=bestFiller(groups,remaining,next,currentSpot);
      if(filler&&gap>=(ORDINARY_FISH_MIN+MOVE_MIN)*60000){
        const n=remainingOrdinaryCount(filler,remaining),maxByGap=Math.max(1,Math.floor((gap-MOVE_MIN*60000)/(ORDINARY_FISH_MIN*60000))),count=Math.max(1,Math.min(n,maxByGap,4)),dwell=Math.min(count*ORDINARY_FISH_MIN,20,Math.max(ORDINARY_FISH_MIN,Math.floor(gap/60000)-MOVE_MIN)),fish=takeOrdinary(filler,remaining,count);
        mergeStop(route,{spot:filler,start:cursor,end:Math.min(end,cursor+dwell*60000),kind:'filler',reason:next?`用窗口前的空檔清普通魚；下一個窗口約 ${fmtClock(next.start)} 開`:'目前沒有更急的窗口，先清這裡的普通魚',fish,ordinaryCount:fish.length});
        cursor=Math.min(end,cursor+dwell*60000);currentSpot=filler.key;if(cursor<end)cursor+=MOVE_MIN*60000;continue;
      }
      if(next){cursor=Math.max(cursor,next.start);continue}
      if(filler){const n=remainingOrdinaryCount(filler,remaining),count=Math.max(1,Math.min(n,4)),dwell=Math.min(count*ORDINARY_FISH_MIN,20,Math.max(2,Math.floor((end-cursor)/60000))),fish=takeOrdinary(filler,remaining,count);mergeStop(route,{spot:filler,start:cursor,end:Math.min(end,cursor+dwell*60000),kind:'filler',reason:'剩餘時間用來清普通魚',fish,ordinaryCount:fish.length});cursor=Math.min(end,cursor+dwell*60000);currentSpot=filler.key;if(cursor<end)cursor+=MOVE_MIN*60000;continue}
      break;
    }
    return route;
  }

  function stopHtml(stop,index){
    const loc=stop.spot.loc||{},region=placeText(loc.regionName||''),zone=placeText(loc.zoneName||''),spot=placeText(loc.spotName||'未知釣點'),minutes=Math.max(1,Math.round((stop.end-stop.start)/60000));
    const badge=stop.kind==='urgent'?`<span class="session-route-badge">🟢 窗口優先</span>`:stop.kind==='prep'?`<span class="session-route-badge">🧩 前置窗口</span>`:`<span class="session-route-badge">🧹 填時間</span>`;
    const names=stop.fish.slice(0,5).map(f=>esc(fishName(f))).join('、')+(stop.fish.length>5?'…':'');
    return `<div class="session-route-stop ${stop.kind}"><div class="session-route-top"><div><div class="session-route-name">${index+1}. ${esc(spot)}</div><div class="session-route-place muted">${[region,zone].filter(Boolean).map(esc).join(' / ')}</div></div><div class="session-route-time">約 ${esc(fmtClock(stop.start))}</div></div><div class="session-route-reason">${badge}${esc(stop.reason)}</div>${names?`<div class="session-route-fish">目標：${names}</div>`:''}<div class="session-route-actions"><span class="muted">建議停留約 ${minutes} 分${stop.kind==='filler'?'（普通魚每條先估 5 分）':''}</span><button type="button" data-session-route-spot="1" data-region="${esc(loc.regionName||'')}" data-zone="${esc(loc.zoneName||'')}" data-spot="${esc(loc.spotName||'')}">前往釣點</button></div></div>`;
  }

  function bindRouteButtons(root){root.querySelectorAll('[data-session-route-spot]').forEach(btn=>btn.addEventListener('click',()=>{if(typeof window.selectFishingSpot==='function')window.selectFishingSpot(btn.dataset.region||'',btn.dataset.zone||'',btn.dataset.spot||'')}))}

  async function render(){
    const box=ensureUi();if(!box)return;
    const p=picker(),minutes=routeMinutes();
    if(!p.zone){box.innerHTML='<span class="muted">先選一張地圖（或直接選釣點），再幫你排窗口優先的 Session 路線。</span>';return}
    if(typeof window.ff14FishingWindowInfo!=='function'){box.innerHTML='<span class="muted">魚窗資料尚未準備好，請稍後再重算。</span>';return}
    const token=++renderToken,now=Date.now(),end=now+minutes*60000,includeBig=!(document.getElementById('fish-hide-big')?.checked??true);
    box.innerHTML='<span class="muted">正在把窗口塞進這次 Session…</span>';
    const model=await buildModel(now,end,p,includeBig,token);if(!model||token!==renderToken)return;
    const route=plan(model,now,end);if(token!==renderToken)return;
    if(!route.length){box.innerHTML=`<span class="muted">${esc(placeText(p.zone))} 在接下來 ${minutes} 分鐘沒有找到可安排的未釣魚／前置窗口。</span>`;return}
    const currentTasks=model.tasks.filter(t=>t.start<=now&&now<t.end).length,futureTasksCount=model.tasks.filter(t=>t.start>now&&t.start<end).length;
    box.innerHTML=`<div class="session-route-summary muted"><strong>${esc(placeText(p.zone))}</strong> · ${minutes} 分鐘 Session（${esc(fmtClock(now))}–${esc(fmtClock(end))}） · 目前窗口事件 ${currentTasks} · Session 內將開 ${futureTasksCount}<br>規劃假設：普通魚約 ${ORDINARY_FISH_MIN} 分／條、換釣點預留 ${MOVE_MIN} 分；實際釣況不同時請直接按「依窗口重算路線」。</div><div class="session-route-list">${route.map((s,i)=>stopHtml(s,i)+(i<route.length-1?'<div class="session-route-arrow">↓</div>':'')).join('')}</div><div class="session-route-note muted">路線原則：快關窗口 ＞ 前置窗口 ＞ 用普通魚填空檔 ＞ Session 尾段清普通魚。窗口急迫度與清圖收益分開處理。</div>`;
    bindRouteButtons(box);
  }

  function init(){
    ensureUi();
    document.addEventListener('click',e=>{const btn=e.target?.closest?.('#refresh-route-plan');if(!btn)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();render()},true);
    for(const id of ['fish-picker-region','fish-picker-zone','fish-picker-spot','fish-hide-big','fish-route-ready-only'])document.getElementById(id)?.addEventListener('change',()=>setTimeout(render,20));
    setTimeout(render,80);
  }

  window.renderSessionFishingRoute=render;
  window.renderRoutePlanner=render;
  window.addEventListener('DOMContentLoaded',init);
})();
