// FF14 統一資料層：所有頁面的使用者資料都經過這裡讀寫。
// 資料一律先存在瀏覽器 localStorage；ff14-config.js 設定 apiBase 後，才會另外與自架伺服器同步。
(function(){
'use strict';
const APP='ff14-personal-workspace',SCHEMA=1;
// 每個 scope 對應一個頁面，伺服器端也以 scope 分開存放，避免一頁的同步覆寫另一頁的資料。
const SCOPES={
 workspace:['roulettes','dailyDone','levelPlan','levelJobs','levelSchedulerSettings','levelMultiPlan','tonightSettings','tonightPlan','fishHistory','fishTarget','fishCurrentCount','fishcakeCaughtIds','fishCaughtIds','fishSkippedIds','fishUniversalLureOverrides','fishBaitOwned','fishBaitNotes','fishBiteTimeOverrides','fishBaitOnlyRequired','fishRouteReadyOnly'],
 submarine:['ff14_submarine_planner_v1','ff14_harbor_prefs']
};
const TOKEN_KEY='ff14ApiToken';
const config=Object.assign({apiBase:''},window.FF14_CONFIG||{});
// 頁面以 <script src="ff14-data.js" data-scope="…"> 指定自己的資料範圍。
const pageScope=document.currentScript?.dataset.scope||'';
const ls=window.localStorage;
const native={get:ls.getItem.bind(ls),set:ls.setItem.bind(ls),remove:ls.removeItem.bind(ls)};
const listeners=new Set();
let applying=false;

function scopeOf(key){for(const[s,keys]of Object.entries(SCOPES))if(keys.includes(key))return s;return null}
function keys(scope){if(!scope)return Object.values(SCOPES).flat();if(!SCOPES[scope])throw new Error('未知的資料範圍：'+scope);return SCOPES[scope].slice()}
function emit(key,source){
 const detail={key,scope:scopeOf(key),source};
 for(const fn of listeners){try{fn(detail)}catch(e){console.error('FF14Data listener failed',e)}}
 window.dispatchEvent(new CustomEvent('ff14-data-changed',{detail}));
}
function isQuotaError(e){return e instanceof DOMException&&(e.name==='QuotaExceededError'||e.name==='NS_ERROR_DOM_QUOTA_REACHED'||e.code===22||e.code===1014)}
// 儲存空間已滿時，使用者資料寫入會失敗；跳出提示請使用者先匯出備份，避免默默遺失變更。
let quotaNotice=null;
function notifyQuota(key){
 window.dispatchEvent(new CustomEvent('ff14-storage-full',{detail:{key,scope:scopeOf(key)}}));
 if(quotaNotice?.isConnected||!document.body)return;
 const box=document.createElement('div');
 box.className='ff14-storage-full';box.setAttribute('role','alert');
 box.style.cssText='position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;max-width:640px;margin:0 auto;padding:12px 16px;border-radius:8px;background:#7f1d1d;color:#fff;font:14px/1.5 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35);display:flex;gap:12px;align-items:flex-start';
 const text=document.createElement('div');text.style.flex='1';
 text.textContent='瀏覽器儲存空間已滿，剛才的變更沒有存到。請先匯出備份，再清除網站資料或刪除舊紀錄後重新整理。';
 const close=document.createElement('button');close.type='button';close.textContent='知道了';
 close.style.cssText='flex:none;border:0;border-radius:6px;padding:4px 10px;background:#fff;color:#7f1d1d;cursor:pointer';
 close.onclick=()=>box.remove();
 box.append(text,close);document.body.appendChild(box);quotaNotice=box;
}
// 舊模組仍直接呼叫 localStorage.setItem；在這裡統一攔截，登記過的資料鍵就會通知同步層。
ls.setItem=function(k,v){
 try{native.set(k,v)}
 catch(e){if(isQuotaError(e)){if(scopeOf(k))notifyQuota(k);else console.warn('FF14 快取寫入失敗：儲存空間已滿',k)}throw e}
 if(scopeOf(k))emit(k,applying?'restore':'local');
};
ls.removeItem=function(k){native.remove(k);if(scopeOf(k))emit(k,applying?'restore':'local')};

function readRaw(key){return native.get(key)}
function read(key,fallback=null){try{const v=JSON.parse(native.get(key));return v??fallback}catch{return fallback}}
function writeRaw(key,raw){ls.setItem(key,raw)}
function write(key,value){ls.setItem(key,JSON.stringify(value))}
function remove(key){ls.removeItem(key)}

function snapshot(scope){const out={};for(const k of keys(scope)){const raw=native.get(k);if(raw===null)continue;try{out[k]=JSON.parse(raw)}catch{}}return out}
// 只還原已登記的資料鍵；回傳實際有變更的鍵。
function restore(data,{scope,source='restore'}={}){
 if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('資料格式不正確');
 const allowed=keys(scope),changed=[];
 applying=true;
 try{for(const k of allowed){if(!Object.prototype.hasOwnProperty.call(data,k))continue;const next=JSON.stringify(data[k]);if(native.get(k)!==next){ls.setItem(k,next);changed.push(k)}}}
 finally{applying=false}
 if(changed.length)window.dispatchEvent(new CustomEvent('ff14-data-restored',{detail:{scope:scope||null,keys:changed,source}}));
 return changed;
}

function exportBackup(scope){return{app:APP,schema:SCHEMA,scope:scope||'all',exportedAt:new Date().toISOString(),data:snapshot(scope)}}
// 接受本工具的備份格式，也接受舊 Supabase 同步存的「資料鍵在最上層」格式。
function parseBackup(obj,scope){
 if(!obj||typeof obj!=='object'||Array.isArray(obj))throw new Error('不是有效的 JSON 備份');
 const data=obj.app===APP&&obj.data&&typeof obj.data==='object'?obj.data:obj;
 const allowed=keys(scope),found=allowed.filter(k=>Object.prototype.hasOwnProperty.call(data,k));
 if(!found.length)throw new Error('備份裡找不到這一頁可用的資料');
 return Object.fromEntries(found.map(k=>[k,data[k]]));
}
function downloadBackup(scope,filename){
 const payload=exportBackup(scope),blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=filename||`ff14-${scope||'all'}-backup-${new Date().toISOString().slice(0,10)}.json`;
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
 return payload;
}

// ---- 遠端同步（自架伺服器） ----
// adapter 介面：pull(scope) → {data,updatedAt}|null；push(scope,data) → {updatedAt}
function createHttpRemote({base,getToken}){
 const root=String(base||'').replace(/\/+$/,'');
 async function call(method,scope,body){
  const token=getToken?.()||'',headers={'Accept':'application/json'};
  if(token)headers.Authorization='Bearer '+token;
  if(body!==undefined)headers['Content-Type']='application/json';
  const r=await fetch(`${root}/api/state/${encodeURIComponent(scope)}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  if(r.status===404)return null;
  if(r.status===401)throw new Error('同步金鑰錯誤或未設定');
  if(!r.ok)throw new Error(`伺服器回應 ${r.status}`);
  return r.json();
 }
 return{pull:scope=>call('GET',scope),push:(scope,data)=>call('PUT',scope,{data})};
}

const sync={remote:null,scope:null,timer:null,busy:false,status:'本機模式'};
function setStatus(text){sync.status=text;window.dispatchEvent(new CustomEvent('ff14-sync-status',{detail:{text}}))}
function stamp(iso){return iso?new Date(iso).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}):''}
async function push(){
 if(!sync.remote||sync.busy)return;sync.busy=true;setStatus('同步中…');
 try{const r=await sync.remote.push(sync.scope,snapshot(sync.scope));setStatus(`已同步 ${stamp(r?.updatedAt||new Date().toISOString())}`)}
 catch(e){console.error('FF14 sync push failed',e);setStatus('同步失敗：'+e.message)}
 finally{sync.busy=false}
}
async function pull(){
 if(!sync.remote)return;sync.busy=true;setStatus('讀取伺服器…');let seed=false;
 try{const r=await sync.remote.pull(sync.scope);if(r&&r.data&&Object.keys(r.data).length){restore(r.data,{scope:sync.scope,source:'remote'});setStatus(`伺服器已載入 ${stamp(r.updatedAt)}`)}else seed=true}
 catch(e){console.error('FF14 sync pull failed',e);setStatus('讀取失敗：'+e.message)}
 finally{sync.busy=false}
 // 伺服器上還沒有資料時，以這台裝置的資料做為初始值。
 if(seed)await push();
}
function connect(remote,scope){
 sync.remote=remote;sync.scope=scope;
 listeners.add(d=>{if(d.scope===scope&&d.source==='local'&&sync.remote){clearTimeout(sync.timer);sync.timer=setTimeout(push,800)}});
 return pull();
}
function getToken(){return native.get(TOKEN_KEY)||''}
function setToken(token){if(token)native.set(TOKEN_KEY,String(token).trim());else native.remove(TOKEN_KEY)}

window.FF14Data={
 APP,SCHEMA,SCOPES,config,pageScope,
 keys,scopeOf,read,readRaw,write,writeRaw,remove,snapshot,restore,
 exportBackup,parseBackup,downloadBackup,
 onChange(fn){listeners.add(fn);return()=>listeners.delete(fn)},
 sync:{
  get enabled(){return!!sync.remote},
  get status(){return sync.status},
  connect,pull,push,createHttpRemote,getToken,setToken
 }
};

// 請瀏覽器把本站資料標記為持久保存，降低空間不足時被自動清除的機會；不支援或被拒絕都不影響使用。
const storage={persisted:null};
try{navigator.storage?.persist?.().then(ok=>{storage.persisted=!!ok},()=>{storage.persisted=false})}catch{}
window.FF14Data.storage={get persisted(){return storage.persisted}};

// 頁面在 ff14-config.js 之後、各功能模組之前載入本檔。
if(config.apiBase&&SCOPES[pageScope]){
 const start=()=>{if(getToken())connect(createHttpRemote({base:config.apiBase,getToken}),pageScope);else setStatus('尚未設定同步金鑰')};
 if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start);else start();
}
})();
