const FF14_SUPABASE_URL='https://sxfvfiukywcgteioxsva.supabase.co';
const FF14_SUPABASE_KEY='sb_publishable_lgNIyKPIds4TFc7H23xIlA_HSAv1Q9f';
const FF14_SYNC_KEYS=['roulettes','dailyDone','levelPlan','levelJobs','levelSchedulerSettings','levelMultiPlan','tonightSettings','tonightPlan','fishHistory','fishTarget','fishCurrentCount','fishcakeCaughtIds','fishCaughtIds','fishSkippedIds','fishUniversalLureOverrides','fishBaitOwned','fishBaitNotes'];
let ff14Client=null,ff14User=null,ff14Saving=false,ff14Loading=false,ff14SyncTimer=null;

function syncStatus(t){const el=document.getElementById('sync-status');if(el)el.textContent=t}
function ensureClient(){if(!ff14Client)ff14Client=window.supabase.createClient(FF14_SUPABASE_URL,FF14_SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});return ff14Client}
function cloudSnapshot(){const p={};for(const k of FF14_SYNC_KEYS){const raw=localStorage.getItem(k);if(raw!==null){try{p[k]=JSON.parse(raw)}catch{}}}return p}
function rerenderCloudState(){if(typeof window.renderFF14All==='function')window.renderFF14All();if(typeof window.renderLevelScheduler==='function')window.renderLevelScheduler();if(typeof window.renderTonightPlanner==='function')window.renderTonightPlanner();if(typeof window.renderFishingGuide==='function')window.renderFishingGuide()}
function applyCloudSnapshot(p){
  if(!p||typeof p!=='object')return false;let changed=false;
  for(const k of FF14_SYNC_KEYS){if(!Object.prototype.hasOwnProperty.call(p,k))continue;const next=JSON.stringify(p[k]),prev=localStorage.getItem(k);if(prev!==next){nativeSetItem(k,next);changed=true}}
  if(changed)rerenderCloudState();return changed;
}
function authUi(){
  const login=document.getElementById('sync-login'),now=document.getElementById('sync-now'),logout=document.getElementById('sync-logout');
  if(ff14User){login.hidden=true;now.hidden=false;logout.hidden=false;syncStatus(ff14User.email||'已登入')}
  else{login.hidden=false;now.hidden=true;logout.hidden=true;syncStatus('未登入')}
}
async function cloudSave(){
  const c=ensureClient();if(!ff14User||ff14Saving||ff14Loading)return;ff14Saving=true;syncStatus('同步中…');
  const {error}=await c.from('user_workspace_state').upsert({user_id:ff14User.id,payload:cloudSnapshot(),updated_at:new Date().toISOString()},{onConflict:'user_id'});
  ff14Saving=false;syncStatus(error?'同步失敗':`已同步 ${new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}`);if(error)console.error(error);
}
async function cloudLoad(){
  const c=ensureClient();if(!ff14User||ff14Loading)return;ff14Loading=true;syncStatus('讀取雲端…');
  const {data,error}=await c.from('user_workspace_state').select('payload,updated_at').eq('user_id',ff14User.id).maybeSingle();
  if(error){ff14Loading=false;syncStatus('讀取失敗');console.error(error);return}
  if(data?.payload){applyCloudSnapshot(data.payload);ff14Loading=false;syncStatus(`雲端已載入 ${data.updated_at?new Date(data.updated_at).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}):''}`)}
  else{ff14Loading=false;await cloudSave()}
}
async function initCloud(){
  const c=ensureClient(),{data}=await c.auth.getSession();ff14User=data.session?.user||null;authUi();if(ff14User)await cloudLoad();
  c.auth.onAuthStateChange((event,session)=>{ff14User=session?.user||null;authUi();if(event==='SIGNED_IN'&&ff14User)setTimeout(()=>cloudLoad(),0)});
}
window.addEventListener('DOMContentLoaded',()=>{
  const panel=document.getElementById('auth-panel'),email=document.getElementById('auth-email'),password=document.getElementById('auth-password'),msg=document.getElementById('auth-message');
  document.getElementById('sync-login').onclick=()=>panel.hidden=false;
  document.getElementById('auth-cancel').onclick=()=>panel.hidden=true;
  document.getElementById('sync-now').onclick=cloudSave;
  document.getElementById('sync-logout').onclick=async()=>{await ensureClient().auth.signOut();ff14User=null;authUi()};
  document.getElementById('auth-signin').onclick=async()=>{msg.textContent='登入中…';const {data,error}=await ensureClient().auth.signInWithPassword({email:email.value.trim(),password:password.value});if(error){msg.textContent=error.message;return}ff14User=data.user;msg.textContent='登入成功';panel.hidden=true;authUi();await cloudLoad()};
  document.getElementById('auth-signup').onclick=async()=>{msg.textContent='建立帳號中…';const {data,error}=await ensureClient().auth.signUp({email:email.value.trim(),password:password.value});if(error){msg.textContent=error.message;return}msg.textContent=data.session?'帳號已建立並登入。':'帳號已建立。若收到驗證信，完成驗證後再回來登入。';if(data.session){ff14User=data.user;panel.hidden=true;authUi();await cloudLoad()}};
  initCloud();
});
const nativeSetItem=localStorage.setItem.bind(localStorage);
localStorage.setItem=function(k,v){nativeSetItem(k,v);if(FF14_SYNC_KEYS.includes(k)&&ff14User&&!ff14Loading){clearTimeout(ff14SyncTimer);ff14SyncTimer=setTimeout(cloudSave,800)}};
