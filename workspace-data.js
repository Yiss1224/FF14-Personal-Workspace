// 首頁的資料工具列：完整備份匯出／匯入，以及（設定 apiBase 後）自架伺服器同步狀態。
(function(){
const SCOPE='workspace';
const $=id=>document.getElementById(id);
function status(text){const el=$('sync-status');if(el)el.textContent=text}
function rerender(){
 for(const name of['renderFF14All','renderLevelScheduler','renderTonightPlanner','renderFishingGuide']){
  try{const fn=window[name];if(typeof fn==='function')fn()}catch(e){console.error(`workspace rerender failed: ${name}`,e)}
 }
}
// 備份還原或伺服器資料載入後，重畫各分頁。
window.addEventListener('ff14-data-restored',e=>{if(!e.detail?.scope||e.detail.scope===SCOPE)rerender()});
window.addEventListener('ff14-sync-status',e=>status(e.detail.text));
window.addEventListener('DOMContentLoaded',()=>{
 const data=window.FF14Data,file=$('workspace-backup-file');
 status(data.sync.enabled?data.sync.status:(data.config.apiBase?'尚未設定同步金鑰':'本機模式'));
 $('workspace-export').onclick=()=>{const p=data.downloadBackup(SCOPE,`ff14-workspace-backup-${new Date().toISOString().slice(0,10)}.json`);status(`已匯出 ${Object.keys(p.data).length} 項資料`)};
 $('workspace-import').onclick=()=>file.click();
 file.onchange=async e=>{
  const f=e.target.files?.[0];e.target.value='';if(!f)return;
  try{
   const incoming=data.parseBackup(JSON.parse(await f.text()),SCOPE);
   if(!window.confirm(`要用備份覆蓋這台裝置的 ${Object.keys(incoming).length} 項首頁資料嗎？`))return;
   // 匯入屬於使用者操作，同步開啟時要把結果送上伺服器，所以以 local 來源寫入。
   for(const[k,v]of Object.entries(incoming))data.write(k,v);
   rerender();status(`已匯入 ${Object.keys(incoming).length} 項資料`);
  }catch(err){window.alert('匯入失敗，原始資料未變更：'+err.message)}
 };
 const tokenBtn=$('sync-token');
 if(data.config.apiBase&&tokenBtn){
  tokenBtn.hidden=false;
  tokenBtn.onclick=()=>{const t=window.prompt('輸入自架伺服器的同步金鑰（留空即清除）',data.sync.getToken());if(t===null)return;data.sync.setToken(t);location.reload()};
 }
});
})();
