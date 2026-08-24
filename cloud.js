const FF14_SUPABASE_URL='https://sxfvfiukywcgteioxsva.supabase.co';
const FF14_SYNC_KEYS=['roulettes','dailyDone','levelPlan','fishHistory','fishTarget','fishcakeCaughtIds'];
let ff14Client=null;
let ff14User=null;
let ff14Saving=false;

function syncStatus(t){const el=document.getElementById('sync-status');if(el)el.textContent=t}
function getPublishableKey(){return localStorage.getItem('ff14SupabasePublishableKey')||''}
function setPublishableKey(v){localStorage.setItem('ff14SupabasePublishableKey',v)}
function ensureClient(){const key=getPublishableKey();if(!key)return null;if(!ff14Client)ff14Client=window.supabase.createClient(FF14_SUPABASE_URL,key);return ff14Client}
function cloudSnapshot(){const p={};for(const k of FF14_SYNC_KEYS){const raw=localStorage.getItem(k);if(raw!==null){try{p[k]=JSON.parse(raw)}catch{}}}return p}
function applyCloudSnapshot(p){if(!p||typeof p!=='object')return;for(const k of FF14_SYNC_KEYS){if(Object.prototype.hasOwnProperty.call(p,k))localStorage.setItem(k,JSON.stringify(p[k]))}location.reload()}
function authUi(){const login=document.getElementById('sync-login'),now=document.getElementById('sync-now'),logout=document.getElementById('sync-logout');if(ff14User){login.hidden=true;now.hidden=false;logout.hidden=false;syncStatus(ff14User.email||'已登入')}else{login.hidden=false;now.hidden=true;logout.hidden=true;syncStatus('未登入')}}

async function cloudSave(){const c=ensureClient();if(!c||!ff14User||ff14Saving)return;ff14Saving=true;syncStatus('同步中…');const {error}=await c.from('user_workspace_state').upsert({user_id:ff14User.id,payload:cloudSnapshot()},{onConflict:'user_id'});ff14Saving=false;syncStatus(error?'同步失敗':'已同步');if(error)console.error(error)}
async function cloudLoad(){const c=ensureClient();if(!c||!ff14User)return;syncStatus('讀取雲端…');const {data,error}=await c.from('user_workspace_state').select('payload').eq('user_id',ff14User.id).maybeSingle();if(error){syncStatus('讀取失敗');console.error(error);return}if(data?.payload)applyCloudSnapshot(data.payload);else await cloudSave()}
async function initCloud(){const c=ensureClient();if(!c){authUi();return}const {data}=await c.auth.getSession();ff14User=data.session?.user||null;authUi();if(ff14User)await cloudLoad();c.auth.onAuthStateChange(async(_event,session)=>{ff14User=session?.user||null;authUi()})}

window.addEventListener('DOMContentLoaded',()=>{
 const key=document.getElementById('auth-key');if(key)key.value=getPublishableKey();
 document.getElementById('sync-login').onclick=()=>document.getElementById('auth-panel').hidden=false;
 document.getElementById('auth-cancel').onclick=()=>document.getElementById('auth-panel').hidden=true;
 document.getElementById('sync-now').onclick=cloudSave;
 document.getElementById('sync-logout').onclick=async()=>{const c=ensureClient();if(c)await c.auth.signOut();ff14User=null;authUi()};
 document.getElementById('auth-signin').onclick=async()=>{const k=document.getElementById('auth-key').value.trim();setPublishableKey(k);ff14Client=null;const c=ensureClient();const email=document.getElementById('auth-email').value.trim();const password=document.getElementById('auth-password').value;const msg=document.getElementById('auth-message');if(!c){msg.textContent='請先輸入 Publishable Key';return}const {data,error}=await c.auth.signInWithPassword({email,password});if(error){msg.textContent=error.message;return}ff14User=data.user;msg.textContent='登入成功';document.getElementById('auth-panel').hidden=true;authUi();await cloudLoad()};
 document.getElementById('auth-signup').onclick=async()=>{const k=document.getElementById('auth-key').value.trim();setPublishableKey(k);ff14Client=null;const c=ensureClient();const email=document.getElementById('auth-email').value.trim();const password=document.getElementById('auth-password').value;const msg=document.getElementById('auth-message');if(!c){msg.textContent='請先輸入 Publishable Key';return}const {error}=await c.auth.signUp({email,password,options:{emailRedirectTo:location.href}});msg.textContent=error?error.message:'帳號已建立；若 Supabase 要求 Email 驗證，請先完成驗證。'};
 initCloud();
});

let ff14SyncTimer=null;
const originalSetItem=localStorage.setItem.bind(localStorage);
localStorage.setItem=function(k,v){originalSetItem(k,v);if(FF14_SYNC_KEYS.includes(k)&&ff14User){clearTimeout(ff14SyncTimer);ff14SyncTimer=setTimeout(cloudSave,800)}};
