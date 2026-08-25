const FF14_SUPABASE_URL='https://sxfvfiukywcgteioxsva.supabase.co';
const FF14_SUPABASE_KEY='sb_publishable_lgNIyKPIds4TFc7H23xIlA_HSAv1Q9f';
const FF14_SYNC_KEYS=['roulettes','dailyDone','levelPlan','levelJobs','levelSchedulerSettings','levelMultiPlan','tonightSettings','tonightPlan','fishHistory','fishTarget','fishCurrentCount','fishcakeCaughtIds','fishCaughtIds','fishSkippedIds','fishUniversalLureOverrides','fishBaitOwned','fishBaitNotes','fishBiteTimeOverrides','fishBaitOnlyRequired','fishRouteReadyOnly'];
let ff14Client=null,ff14User=null,ff14Saving=false,ff14Loading=false,ff14SyncTimer=null;

function syncStatus(t){const el=document.getElementById('sync-status');if(el)el.textContent=t}
function ensureClient(){if(!ff14Client)ff14Client=window.supabase.createClient(FF14_SUPABASE_URL,FF14_SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});return ff14Client}
function cloudSnapshot(){const p={};for(const k of FF14_SYNC_KEYS){const raw=localStorage.getItem(k);if(raw!==null){try{p[k]=JSON.parse(raw)}catch{}}}return p}
function rerenderCloudState(){
  for(const name of ['renderFF14All','renderLevelScheduler','renderTonightPlanner','renderFishingGuide']){
    try{const fn=window[name];if(typeof fn==='function')fn()}catch(e){console.error(`cloud rerender failed: ${name}`,e)}
  }
}
function applyCloudSnapshot(p){if(!p||typeof p!=='object')return false;let changed=false;for(const k of FF14_SYNC_KEYS){if(!Object.prototype.hasOwnProperty.call(p,k))continue;const next=JSON.stringify(p[k]),prev=localStorage.getItem(k);if(prev!==next){nativeSetItem(k,next);changed=true}}if(changed)rerenderCloudState();return changed}
function authUi(){const login=document.getElementById('sync-login'),now=document.getElementById('sync-now'),logout=document.getElementById('sync-logout');if(ff14User){login.hidden=true;now.hidden=false;logout.hidden=false;syncStatus(ff14User.email||'已登入')}else{login.hidden=false;now.hidden=true;logout.hidden=true;syncStatus('未登入')}}
async function cloudSave(){
  const c=ensureClient();if(!ff14User||ff14Saving||ff14Loading)return;ff14Saving=true;syncStatus('同步中…');
  try{const{error}=await c.from('user_workspace_state').upsert({user_id:ff14User.id,payload:cloudSnapshot(),updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error)throw error;syncStatus(`已同步 ${new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}`)}
  catch(e){console.error('cloud save failed',e);syncStatus('同步失敗')}
  finally{ff14Saving=false}
}
async function cloudLoad(){
  const c=ensureClient();if(!ff14User||ff14Loading)return;ff14Loading=true;syncStatus('讀取雲端…');let seedCloud=false;
  try{
    const{data,error}=await c.from('user_workspace_state').select('payload,updated_at').eq('user_id',ff14User.id).maybeSingle();if(error)throw error;
    if(data?.payload){applyCloudSnapshot(data.payload);syncStatus(`雲端已載入 ${data.updated_at?new Date(data.updated_at).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}):''}`)}else seedCloud=true;
  }catch(e){console.error('cloud load failed',e);syncStatus('讀取失敗')}
  finally{ff14Loading=false}
  if(seedCloud)await cloudSave();
}
async function initCloud(){
  try{const c=ensureClient(),{data,error}=await c.auth.getSession();if(error)throw error;ff14User=data.session?.user||null;authUi();if(ff14User)await cloudLoad();c.auth.onAuthStateChange((event,session)=>{ff14User=session?.user||null;authUi();if(event==='SIGNED_IN'&&ff14User)setTimeout(()=>cloudLoad(),0)})}
  catch(e){console.error('cloud init failed',e);ff14Loading=false;syncStatus('雲端初始化失敗')}
}
window.addEventListener('DOMContentLoaded',()=>{
  const panel=document.getElementById('auth-panel'),email=document.getElementById('auth-email'),password=document.getElementById('auth-password'),msg=document.getElementById('auth-message');
  document.getElementById('sync-login').onclick=()=>panel.hidden=false;
  document.getElementById('auth-cancel').onclick=()=>panel.hidden=true;
  document.getElementById('sync-now').onclick=cloudSave;
  document.getElementById('sync-logout').onclick=async()=>{await ensureClient().auth.signOut();ff14User=null;authUi()};
  document.getElementById('auth-signin').onclick=async()=>{msg.textContent='登入中…';const{data,error}=await ensureClient().auth.signInWithPassword({email:email.value.trim(),password:password.value});if(error){msg.textContent=error.message;return}ff14User=data.user;msg.textContent='登入成功';panel.hidden=true;authUi();await cloudLoad()};
  document.getElementById('auth-signup').onclick=async()=>{msg.textContent='建立帳號中…';const{data,error}=await ensureClient().auth.signUp({email:email.value.trim(),password:password.value});if(error){msg.textContent=error.message;return}msg.textContent=data.session?'帳號已建立並登入。':'帳號已建立。若收到驗證信，完成驗證後再回來登入。';if(data.session){ff14User=data.user;panel.hidden=true;authUi();await cloudLoad()}};
  initCloud();
});
const nativeSetItem=localStorage.setItem.bind(localStorage);
localStorage.setItem=function(k,v){nativeSetItem(k,v);if(FF14_SYNC_KEYS.includes(k)&&ff14User&&!ff14Loading){clearTimeout(ff14SyncTimer);ff14SyncTimer=setTimeout(cloudSave,800)}};

// ---- Taiwan Traditional Chinese display layer ----
const FF14_TC_CACHE_KEY='ff14TcTermCacheV1';
const FF14_TC_CACHE_MS=30*24*60*60*1000;
const FF14_TC_BASE='https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-tc/main';
const FF14_EN_BASE='https://raw.githubusercontent.com/xivapi/ffxiv-datamining/master/csv/en';
let ff14TcBusy=false,ff14TcObserver=null,ff14TcApplyTimer=null,ff14TcApplying=false;
let ff14TcCache={ts:0,items:{},places:{},weather:{},itemEnglish:{}};
function ff14TcLoadCache(){try{const x=JSON.parse(localStorage.getItem(FF14_TC_CACHE_KEY)||'null');if(x&&typeof x==='object')ff14TcCache={ts:Number(x.ts)||0,items:x.items||{},places:x.places||{},weather:x.weather||{},itemEnglish:x.itemEnglish||{}}}catch{}return ff14TcCache}
function ff14TcSaveCache(){try{nativeSetItem(FF14_TC_CACHE_KEY,JSON.stringify(ff14TcCache))}catch(e){console.warn('TC term cache save failed',e)}}
function ff14TcCsvLine(line){const out=[];let cur='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){out.push(cur);cur=''}else cur+=c}out.push(cur);return out}
function ff14TcCsvMeta(text){const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/),heads=ff14TcCsvLine(lines[1]||'');let nameIndex=heads.indexOf('Name');if(nameIndex<0)nameIndex=heads.indexOf('Singular');if(nameIndex<0)nameIndex=1;return{lines,nameIndex}}
function ff14TcNamesById(text,neededIds=null){const{lines,nameIndex}=ff14TcCsvMeta(text),out={};for(let i=3;i<lines.length;i++){if(!lines[i])continue;const row=ff14TcCsvLine(lines[i]),id=Number(row[0]);if(!Number.isFinite(id))continue;if(neededIds&&!neededIds.has(id))continue;const name=String(row[nameIndex]||'').trim();if(name)out[id]=name}return out}
function ff14TcPairNames(enText,tcText){const en=ff14TcNamesById(enText),tc=ff14TcNamesById(tcText),out={};for(const[id,enName]of Object.entries(en)){const tcName=tc[id];if(enName&&tcName&&enName!==tcName)out[enName]=tcName}return out}
async function ff14TcFetchText(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`${r.status} ${url.split('/').pop()}`);return r.text()}
function ff14TcNeededFishIds(){return new Set((store.get('fishCatalog',[])||[]).map(x=>Number(x.itemId)).filter(Number.isFinite))}
async function ff14TcResolveVisibleBaits(){if(typeof fgResolveBaitItemId!=='function'||typeof fgPathNames!=='function'||typeof fgMethodForName!=='function')return new Map();const names=new Set();for(const fish of(store.get('fishCatalog',[])||[])){const m=fgMethodForName(fish.name);if(!m)continue;for(const n of fgPathNames(m.bestCatchPath))if(n&&n!==fish.name)names.add(n)}const list=[...names].slice(0,180),result=new Map(),workers=6;let cursor=0;async function work(){while(cursor<list.length){const name=list[cursor++];try{const id=await fgResolveBaitItemId(name);if(id)result.set(name,id)}catch{}}}await Promise.all(Array.from({length:workers},work));return result}
async function ff14TcRefresh(force=false){if(ff14TcBusy)return;ff14TcBusy=true;const button=document.getElementById('refresh-tc-terms'),status=document.getElementById('fish-catalog-status');if(button)button.disabled=true;try{ff14TcLoadCache();const fishIds=ff14TcNeededFishIds(),baitIds=await ff14TcResolveVisibleBaits(),needed=new Set([...fishIds,...baitIds.values()]);const missing=[...needed].some(id=>!ff14TcCache.items[id]),stale=!ff14TcCache.ts||Date.now()-ff14TcCache.ts>FF14_TC_CACHE_MS;if(force||missing||stale){if(status)status.textContent='正在建立台服繁中名詞快取…（第一次會下載台服 Item 資料）';const[tcItem,enPlace,tcPlace,enWeather,tcWeather]=await Promise.all([ff14TcFetchText(`${FF14_TC_BASE}/Item.csv`),ff14TcFetchText(`${FF14_EN_BASE}/PlaceName.csv`),ff14TcFetchText(`${FF14_TC_BASE}/PlaceName.csv`),ff14TcFetchText(`${FF14_EN_BASE}/Weather.csv`),ff14TcFetchText(`${FF14_TC_BASE}/Weather.csv`)]);ff14TcCache.items={...ff14TcCache.items,...ff14TcNamesById(tcItem,needed)};ff14TcCache.places=ff14TcPairNames(enPlace,tcPlace);ff14TcCache.weather=ff14TcPairNames(enWeather,tcWeather);for(const[enName,id]of baitIds){const tc=ff14TcCache.items[id];if(tc)ff14TcCache.itemEnglish[enName]=tc}for(const fish of(store.get('fishCatalog',[])||[])){const tc=ff14TcCache.items[fish.itemId];if(tc)ff14TcCache.itemEnglish[fish.name]=tc}ff14TcCache.ts=Date.now();ff14TcSaveCache()}ff14TcApply();if(status)status.textContent=`台服繁中名詞已套用 · ${Object.keys(ff14TcCache.items).length} 個物品名稱已快取`}catch(e){console.error(e);if(status)status.textContent=`台服繁中名詞讀取失敗：${e.message}`}finally{ff14TcBusy=false;if(button)button.disabled=false}}
function ff14TcText(v){const s=String(v||'').trim();return ff14TcCache.itemEnglish[s]||ff14TcCache.places[s]||ff14TcCache.weather[s]||s}
function ff14TcReplaceTextNode(node){const raw=node.nodeValue;if(!raw||!/[A-Za-z]/.test(raw))return;let next=raw;const maps=[ff14TcCache.itemEnglish,ff14TcCache.places,ff14TcCache.weather];for(const map of maps)for(const[en,tc]of Object.entries(map)){if(!en||!tc)continue;const escaped=en.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');next=next.replace(new RegExp(`(^|[^A-Za-z])(${escaped})(?=$|[^A-Za-z])`,'g'),(_,prefix)=>prefix+tc)}if(next!==raw)node.nodeValue=next}
function ff14TcWalkText(root){const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(w.nextNode())nodes.push(w.currentNode);nodes.forEach(ff14TcReplaceTextNode)}
function ff14TcApplyFishRows(){const catalog=store.get('fishCatalog',[])||[],byId=new Map(catalog.map(x=>[Number(x.itemId),x]));document.querySelectorAll('#fish-catalog .fish-row').forEach(row=>{const href=row.querySelector('a[href*="/fish/"]')?.getAttribute('href')||'',m=href.match(/\/fish\/(\d+)/),id=m?Number(m[1]):0,fish=byId.get(id),name=row.querySelector(':scope > div:first-child > strong');if(name&&ff14TcCache.items[id]&&name.textContent!==ff14TcCache.items[id])name.textContent=ff14TcCache.items[id];const small=row.querySelector(':scope > div:first-child > small');if(small&&fish){const next=[fish.regionName,fish.zoneName,fish.spotName].map(ff14TcText).join(' / ');if(small.textContent!==next)small.textContent=next}const method=row.querySelector('.fish-method');if(method)ff14TcWalkText(method)});document.querySelectorAll('#fish-catalog details.zone > summary').forEach(s=>{const strong=s.querySelector('strong'),region=s.querySelector('span:not(.badge)');if(strong){const next=ff14TcText(strong.textContent);if(strong.textContent!==next)strong.textContent=next}if(region){const next=ff14TcText(region.textContent);if(region.textContent!==next)region.textContent=next}});document.querySelectorAll('#fish-catalog details.spot > summary').forEach(s=>{for(const n of[...s.childNodes])if(n.nodeType===Node.TEXT_NODE){const next=ff14TcText(n.nodeValue.trim())+' ';if(n.nodeValue!==next)n.nodeValue=next}})}
function ff14TcApply(){if(ff14TcApplying)return;ff14TcApplying=true;try{ff14TcLoadCache();ff14TcApplyFishRows();const bait=document.getElementById('fish-bait-list');if(bait)ff14TcWalkText(bait);const vendor=document.getElementById('fish-vendor-plan');if(vendor)ff14TcWalkText(vendor);const route=document.getElementById('fish-route-result');if(route)ff14TcWalkText(route)}finally{ff14TcApplying=false}}
function ff14TcScheduleApply(){if(ff14TcApplying)return;clearTimeout(ff14TcApplyTimer);ff14TcApplyTimer=setTimeout(ff14TcApply,40)}
function ff14TcInit(){ff14TcLoadCache();const refresh=document.getElementById('refresh-fish-data');if(refresh&&!document.getElementById('refresh-tc-terms')){const b=document.createElement('button');b.id='refresh-tc-terms';b.textContent='台服繁中名詞';b.title='重新下載台服繁中遊戲資料並更新顯示名稱';b.onclick=()=>ff14TcRefresh(true);refresh.insertAdjacentElement('afterend',b)}const target=document.getElementById('fishing');if(target){ff14TcObserver=new MutationObserver(ff14TcScheduleApply);ff14TcObserver.observe(target,{childList:true,subtree:true})}ff14TcApply();setTimeout(()=>ff14TcRefresh(false),1200);setTimeout(()=>ff14TcRefresh(false),8000)}
window.addEventListener('DOMContentLoaded',ff14TcInit);
window.refreshFF14TcTerms=()=>ff14TcRefresh(true);
