// 過渡期同步：自架伺服器上線前，讓資料層透過原本的 Supabase 專案同步。
// 只在 ff14-config.js 設定 supabase 且沒有設定 apiBase 時啟用；Supabase 套件也只在這時才載入。
// 沿用原本的 user_workspace_state 資料表（每個帳號一列 payload），不需要改資料庫：
// 首頁與潛水艇頁的資料鍵不重疊，各頁上傳時只合併自己的鍵，不會覆寫另一頁。
(function(){
'use strict';
const data=window.FF14Data,cfg=data?.config?.supabase;
if(!data||data.config.apiBase||!cfg?.url||!cfg?.key)return;
// 與原本 cloud.js 使用的同一個 CDN 位址。
const LIB='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const TABLE='user_workspace_state';
let client=null,user=null,ready=null;

function loadLib(){
 if(window.supabase?.createClient)return Promise.resolve();
 return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=LIB;s.onload=resolve;s.onerror=()=>reject(new Error('Supabase 套件載入失敗'));document.head.appendChild(s)});
}
async function ensureClient(){
 if(!ready)ready=loadLib().then(()=>{client=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});return client});
 return ready;
}
function pick(payload,scope){const out={};for(const k of data.keys(scope))if(payload&&Object.prototype.hasOwnProperty.call(payload,k))out[k]=payload[k];return out}
async function readRow(){
 const{data:row,error}=await client.from(TABLE).select('payload,updated_at').eq('user_id',user.id).maybeSingle();
 if(error)throw error;return row;
}
const remote={
 async pull(scope){const row=await readRow(),picked=pick(row?.payload,scope);return Object.keys(picked).length?{data:picked,updatedAt:row.updated_at}:null},
 async push(scope,snapshot){
  const row=await readRow(),payload=Object.assign({},row?.payload||{},pick(snapshot,scope)),updatedAt=new Date().toISOString();
  const{error}=await client.from(TABLE).upsert({user_id:user.id,payload,updated_at:updatedAt},{onConflict:'user_id'});
  if(error)throw error;return{updatedAt};
 }
};
function startSync(){if(user&&data.pageScope)data.sync.connect(remote,data.pageScope)}
function authUi(){
 const $=id=>document.getElementById(id),login=$('sync-login'),logout=$('sync-logout'),now=$('sync-now');
 if(login)login.hidden=!!user;if(logout)logout.hidden=!user;if(now)now.hidden=!user;
}

async function init(){
 try{
  await ensureClient();
  const{data:s,error}=await client.auth.getSession();if(error)throw error;
  user=s.session?.user||null;authUi();
  if(user)startSync();else data.sync.setStatus('未登入（Supabase 過渡同步）');
  client.auth.onAuthStateChange((event,session)=>{
   const was=user;user=session?.user||null;authUi();
   if(event==='SIGNED_IN'&&user&&!was)startSync();
   if(event==='SIGNED_OUT')data.sync.disconnect('未登入（Supabase 過渡同步）');
  });
 }catch(e){console.error('Supabase sync init failed',e);data.sync.setStatus('同步初始化失敗，資料仍存在本機')}
}

// 首頁的登入面板；潛水艇頁沒有面板，沿用首頁登入的同一個帳號。
function bindPanel(){
 const $=id=>document.getElementById(id),panel=$('auth-panel');
 if(!panel)return;
 const email=$('auth-email'),password=$('auth-password'),msg=$('auth-message');
 $('sync-login').onclick=()=>{panel.hidden=false};
 $('auth-cancel').onclick=()=>{panel.hidden=true};
 $('sync-now').onclick=()=>data.sync.push();
 $('sync-logout').onclick=async()=>{await client?.auth.signOut()};
 $('auth-signin').onclick=async()=>{
  msg.textContent='登入中…';
  try{await ensureClient()}catch(e){msg.textContent=e.message;return}
  const{error}=await client.auth.signInWithPassword({email:email.value.trim(),password:password.value});
  if(error){msg.textContent=error.message;return}
  msg.textContent='登入成功';panel.hidden=true;
 };
 authUi();
}
window.addEventListener('DOMContentLoaded',()=>{bindPanel();init()});
})();
