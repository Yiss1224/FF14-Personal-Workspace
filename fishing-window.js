(function(){'use strict';
const SOURCE='https://raw.githubusercontent.com/icykoneko/ff14-fish-tracker-app/5b293c630987f816ad76bab52cae2c0d5d016c9a/js/app/data.js';
const WEATHER_PERIOD_SEC=1400,EORZEA_HOUR_SEC=175,EORZEA_DAY_SEC=4200,MAX_PERIODS=2500;
const WINDOW_CACHE_BUCKET_MS=60*1000,WINDOW_CACHE_MAX=4096,WEATHER_CACHE_MAX=50000;
let data=null,dataPromise=null,refreshTimer=null,catalogObserver=null,observedCatalog=null;
const windowCache=new Map(),weatherCache=new Map(),prereqCache=new Map();
function tc(v){const s=String(v??'').trim();try{return typeof window.ff14TcText==='function'?window.ff14TcText(s):s}catch{return s}}
function weatherName(id){const w=data?.WEATHER_TYPES?.[id]??data?.WEATHER_TYPES?.[String(id)],raw=String(w?.name_en||w?.name||w?.Name||id||'—');return tc(raw)}
function weatherTarget(ms){const unix=Math.floor(ms/1000),bell=unix/EORZEA_HOUR_SEC,inc=(bell+8-(bell%8))%24,totalDays=Math.floor(unix/EORZEA_DAY_SEC)>>>0,base=(totalDays*100)+inc,step1=((base<<11)^base)>>>0,step2=((step1>>>8)^step1)>>>0;return step2%100}
function weatherAt(territoryId,ms){
  const period=Math.floor(Number(ms)/(WEATHER_PERIOD_SEC*1000)),key=`${Number(territoryId)||0}:${period}`;
  if(weatherCache.has(key))return weatherCache.get(key);
  const wr=data?.WEATHER_RATES?.[territoryId]??data?.WEATHER_RATES?.[String(territoryId)],target=weatherTarget(ms),hit=(wr?.weather_rates||[]).find(r=>target<Number(r?.[1])),value=Number(hit?.[0]||0);
  if(weatherCache.size>=WEATHER_CACHE_MAX)weatherCache.clear();
  weatherCache.set(key,value);return value;
}
function territoryForFish(f){const spot=data?.FISHING_SPOTS?.[f?.location]??data?.FISHING_SPOTS?.[String(f?.location)];return Number(spot?.territory_id)||0}
function timeIntervalsForDay(dayStart,f){const a=Number(f?.startHour),b=Number(f?.endHour);if(!Number.isFinite(a)||!Number.isFinite(b))return[];if(a===0&&b===24)return[[dayStart,dayStart+EORZEA_DAY_SEC*1000]];const start=dayStart+a*EORZEA_HOUR_SEC*1000,end=(b>a?dayStart:dayStart+EORZEA_DAY_SEC*1000)+b*EORZEA_HOUR_SEC*1000;return[[start,end]]}
function intersect(a,b){const s=Math.max(a[0],b[0]),e=Math.min(a[1],b[1]);return e>s?[s,e]:null}
function mergeIntervals(rows){const sorted=rows.filter(Boolean).sort((a,b)=>a[0]-b[0]),out=[];for(const x of sorted){const last=out[out.length-1];if(last&&x[0]<=last[1]+1)last[1]=Math.max(last[1],x[1]);else out.push([x[0],x[1]])}return out}
function conditions(f){return{prev:Array.isArray(f?.previousWeatherSet)?f.previousWeatherSet.map(Number).filter(Number.isFinite):[],now:Array.isArray(f?.weatherSet)?f.weatherSet.map(Number).filter(Number.isFinite):[]}}
function predatorRows(f){
  const raw=f?.predators,out=[];
  const push=(id,count=1)=>{id=Number(id);count=Math.max(1,Number(count)||1);if(Number.isFinite(id)&&id>0&&!out.some(x=>x.itemId===id))out.push({itemId:id,count})};
  if(Array.isArray(raw)){
    for(const row of raw){
      if(Array.isArray(row))push(row[0],row[1]);
      else if(row&&typeof row==='object')push(row.itemId??row.fishId??row.id,row.count??row.amount??row.qty??1);
      else push(row,1);
    }
  }else if(raw&&typeof raw==='object'){
    for(const[k,v]of Object.entries(raw)){
      if(v&&typeof v==='object')push(v.itemId??v.fishId??v.id??k,v.count??v.amount??v.qty??1);
      else push(k,v);
    }
  }
  return out;
}
function windowIntervals(f,fromMs=Date.now()){const c=conditions(f),territory=territoryForFish(f),weatherLimited=c.prev.length||c.now.length,nowSec=fromMs/1000;if(!weatherLimited){const day=Math.floor(nowSec/EORZEA_DAY_SEC)*EORZEA_DAY_SEC*1000,rows=[];for(let d=-1;d<=2;d++)rows.push(...timeIntervalsForDay(day+d*EORZEA_DAY_SEC*1000,f));return mergeIntervals(rows)}if(!territory)return[];const period0=Math.floor(nowSec/WEATHER_PERIOD_SEC)-1,rows=[];let foundFuture=false;for(let i=0;i<MAX_PERIODS;i++){const p=(period0+i)*WEATHER_PERIOD_SEC*1000,prevP=p-WEATHER_PERIOD_SEC*1000,wid=weatherAt(territory,p+1),prevWid=weatherAt(territory,prevP+1);if(c.now.length&&!c.now.includes(wid))continue;if(c.prev.length&&!c.prev.includes(prevWid))continue;const wr=[p,p+WEATHER_PERIOD_SEC*1000],di=Math.floor((p/1000)/EORZEA_DAY_SEC);for(let d=di-1;d<=di+1;d++)for(const t of timeIntervalsForDay(d*EORZEA_DAY_SEC*1000,f)){const hit=intersect(wr,t);if(hit){rows.push(hit);if(hit[0]>fromMs)foundFuture=true}}if(foundFuture&&rows.length>4)break}return mergeIntervals(rows)}
function cachedWindowIntervals(itemId,f,fromMs){
  const bucket=Math.floor(Number(fromMs)/WINDOW_CACHE_BUCKET_MS),key=`${Number(itemId)||0}:${bucket}`;
  if(windowCache.has(key))return windowCache.get(key);
  const anchor=bucket*WINDOW_CACHE_BUCKET_MS,ranges=windowIntervals(f,anchor);
  if(windowCache.size>=WINDOW_CACHE_MAX)windowCache.clear();
  windowCache.set(key,ranges);return ranges;
}
function fmtDuration(ms){if(!Number.isFinite(ms)||ms<0)return'—';const min=Math.max(0,Math.round(ms/60000));if(min<60)return`${min} 分`;const h=Math.floor(min/60),m=min%60;if(h<24)return m?`${h} 小時 ${m} 分`:`${h} 小時`;const d=Math.floor(h/24),rh=h%24;return rh?`${d} 天 ${rh} 小時`:`${d} 天`}
function fmtClock(ms){return new Date(ms).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}
function etClock(ms=Date.now()){const h=((ms/1000)/EORZEA_HOUR_SEC)%24,hh=Math.floor((h+24)%24),mm=Math.floor((h-Math.floor(h))*60);return`ET ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`}
function info(itemId,now=Date.now()){
  const id=Number(itemId)||0,f=data?.FISH?.[id]??data?.FISH?.[String(id)];if(!f)return null;
  const c=conditions(f),weatherLimited=!!(c.prev.length||c.now.length),timeUnlimited=Number(f?.startHour)===0&&Number(f?.endHour)===24,restricted=!timeUnlimited||weatherLimited,territory=territoryForFish(f),ranges=restricted?cachedWindowIntervals(id,f,now):[],current=ranges.find(r=>r[0]<=now&&now<r[1])||null,next=ranges.find(r=>r[0]>now)||null;
  return{itemId:id,locationId:Number(f?.location)||0,territoryId:territory,restricted,timeUnlimited,weatherLimited,startHour:Number(f?.startHour),endHour:Number(f?.endHour),current,next,waitMs:current?0:(next?next[0]-now:null),currentLeftMs:current?current[1]-now:null,nextDurationMs:next?next[1]-next[0]:null};
}
function prerequisites(itemId){const id=Number(itemId)||0;if(prereqCache.has(id))return prereqCache.get(id);const f=data?.FISH?.[id]??data?.FISH?.[String(id)],rows=f?predatorRows(f):[];prereqCache.set(id,rows);return rows}
function describe(itemId,now=Date.now(),knownInfo=null){const id=Number(itemId)||0,f=data?.FISH?.[id]??data?.FISH?.[String(id)],i=knownInfo||info(id,now);if(!f||!i)return null;const c=conditions(f);if(!i.restricted)return`🟢 隨時可釣 · ${etClock(now)} · 天氣無限制`;let weather='天氣無限制';if(i.weatherLimited){if(i.territoryId){const p=Math.floor((now/1000)/WEATHER_PERIOD_SEC)*WEATHER_PERIOD_SEC*1000,wid=weatherAt(i.territoryId,p+1),prev=weatherAt(i.territoryId,p-WEATHER_PERIOD_SEC*1000+1);weather=`目前 ${weatherName(wid)}`;if(c.prev.length)weather+=`（前置 ${weatherName(prev)}）`}else weather='天氣區域資料不足'}if(i.current){const total=i.current[1]-i.current[0];return`🟢 現在可釣 · ${etClock(now)} · ${weather} · 本窗 ${fmtDuration(total)} · 剩 ${fmtDuration(i.currentLeftMs)}`}if(i.next){return`⏳ ${fmtDuration(i.waitMs)}後開窗（${fmtClock(i.next[0])}）· ${weather} · 持續 ${fmtDuration(i.nextDurationMs)}`}return`⚪ 未找到未來窗口 · ${etClock(now)} · ${weather}`}
async function loadData(){if(data)return data;if(dataPromise)return dataPromise;dataPromise=(async()=>{const r=await fetch(SOURCE,{cache:'force-cache'});if(!r.ok)throw new Error(`weather data HTTP ${r.status}`);const text=await r.text();if(!text.startsWith('const DATA = {')||text.length<100000)throw new Error('weather data format mismatch');data=Function(`${text}\nreturn DATA;`)();return data})().catch(e=>{console.warn('fishing window data failed',e);return null}).finally(()=>{dataPromise=null});return dataPromise}
function itemIdFromRow(row){const href=row.querySelector('a[href*="/fish/"]')?.getAttribute('href')||'',m=href.match(/\/fish\/(\d+)/);return m?Number(m[1]):0}
function visibleRows(){const root=document.getElementById('fish-catalog');if(!root)return[];return[...root.querySelectorAll('.fish-row')].filter(row=>row.getClientRects().length>0)}
function applyRows(){if(!data)return;const now=Date.now();for(const row of visibleRows()){const grid=row.querySelector('.fish-method-grid');if(!grid)continue;const id=itemIdFromRow(row),i=info(id,now),text=i?describe(id,now,i):null;if(!text)continue;let el=grid.querySelector('.fish-window-live');if(!el){el=document.createElement('span');el.className='fish-window-live';grid.appendChild(el)}if(el.textContent!==text)el.textContent=text}}
async function refresh(){await loadData();if(data)applyRows()}
async function sharedInfo(itemId,now=Date.now()){
  await loadData();if(!data)return null;
  const known=info(itemId,now);if(known)return known;
  const id=Number(itemId)||0;
  return{itemId:id,locationId:0,territoryId:0,restricted:false,timeUnlimited:true,weatherLimited:false,startHour:0,endHour:24,current:null,next:null,waitMs:0,currentLeftMs:null,nextDurationMs:null,fallback:true};
}
async function sharedDescribe(itemId,now=Date.now()){await loadData();if(!data)return null;const i=info(itemId,now);return i?describe(itemId,now,i):null}
async function sharedPrerequisites(itemId){await loadData();return data?prerequisites(itemId):[]}
function schedule(delay=60){clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,delay)}
function bindCatalogObserver(){
  const root=document.getElementById('fish-catalog');if(!root||root===observedCatalog)return;
  catalogObserver?.disconnect();observedCatalog=root;
  catalogObserver=new MutationObserver(records=>{
    const meaningful=records.some(r=>!r.target?.closest?.('.fish-window-live'));
    if(meaningful)schedule(80);
  });
  catalogObserver.observe(root,{childList:true,subtree:true});
}
function preload(){const run=()=>loadData();if(typeof requestIdleCallback==='function')requestIdleCallback(run,{timeout:1200});else setTimeout(run,80)}
function init(){
  preload();
  document.addEventListener('ff14-fish-catalog-rendered',()=>{bindCatalogObserver();schedule(20)});
  document.addEventListener('toggle',e=>{if(e.target?.closest?.('#fish-catalog'))schedule(20)},true);
  setInterval(()=>{if(document.getElementById('fishing')?.classList.contains('active'))applyRows()},15000);
}
window.ff14FishingWindowInfo=sharedInfo;window.ff14FishingWindowDescribe=sharedDescribe;window.ff14FishingPrerequisites=sharedPrerequisites;window.preloadFishingWindows=loadData;
window.addEventListener('DOMContentLoaded',init);window.refreshFishingWindows=refresh;
})();