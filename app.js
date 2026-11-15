// 首頁與練等分頁：分頁切換、每日隨機（Daily）勾選、單職業練等估算。
// 也提供其他腳本共用的小工具：store（讀寫 localStorage，經 ff14-data.js）、today、dailyDay、addDays、esc、uniqInts。
// 釣魚分頁的程式在 fishing-*.js。
const EXP_TO_NEXT={1:300,2:450,3:630,4:970,5:1440,6:1940,7:3000,8:3920,9:4970,10:5900,11:7430,12:8620,13:10200,14:11300,15:13100,16:15200,17:17400,18:19600,19:21900,20:24300,21:27400,22:30600,23:33900,24:37300,25:40800,26:49200,27:54600,28:61900,29:65600,30:68400,31:74000,32:82700,33:88700,34:95000,35:102000,36:113000,37:121000,38:133000,39:142000,40:155000,41:163000,42:171000,43:179000,44:187000,45:195000,46:214000,47:229000,48:244000,49:259000,50:421000,51:500000,52:580000,53:663000,54:749000,55:837000,56:927000,57:1019000,58:1114000,59:1211000,60:1387000,61:1456000,62:1534000,63:1621000,64:1720000,65:1834000,66:1968000,67:2126000,68:2317000,69:2550000,70:2923000,71:3018000,72:3153000,73:3324000,74:3532000,75:3770600,76:4066000,77:4377000,78:4777000,79:5256000,80:5992000,81:6171000,82:6942000,83:7205000,84:7948000,85:8287000,86:9231000,87:9529000,88:10459000,89:10838000,90:13278000,91:13659000,92:15348000,93:15912000,94:17534000,95:18263000,96:20322000,97:20957000,98:22979000,99:23789000};
const DEFAULT_ROULETTES=[
  {id:'leveling',name:'練等隨機',pct:33,enabled:true,note:'社群實測起始值；實際會依抽到的副本與等級變動'},
  {id:'msq',name:'主線隨機',pct:45,enabled:true,note:'三種主線內容差異很大，這只是中間估值'},
  {id:'alliance',name:'團隊任務',pct:40,enabled:true,note:'社群實測起始值；實際依內容浮動'},
  {id:'normal',name:'普通大型任務',pct:7,enabled:false,note:'粗估起始值'},
  {id:'trial',name:'討伐／殲滅',pct:12,enabled:false,note:'粗估起始值'},
  {id:'frontline',name:'紛爭前線',pct:50,enabled:true,note:'粗估起始值，勝敗與對局獎勵會造成差異'}
];
// 讀寫統一經過 ff14-data.js 資料層。
const store={get:(k,d)=>FF14Data.read(k,d),set:(k,v)=>FF14Data.write(k,v)};
function today(){const d=new Date();const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
// 日課在每天 15:00 UTC（台灣 23:00）重置，不是本地午夜。回傳目前這個日課週期的日期標籤：
// 取週期起點再加 12 小時的本地日期，所以台灣 23:00 之後就算「明天」，白天則與 today() 相同。
function dailyDay(now=Date.now()){const H=3600e3,start=Math.floor((now-15*H)/(24*H))*24*H+15*H,d=new Date(start+12*H);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function addDays(days){const d=new Date();d.setDate(d.getDate()+days);return d.toLocaleDateString('zh-TW')}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function uniqInts(values){return [...new Set((values||[]).map(v=>typeof v==='object'?(v.id??v.itemId??v.fishId):v).map(Number).filter(Number.isFinite))]}
function initTabs(){document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('nav button,.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.getElementById(b.dataset.tab).classList.add('active');try{history.replaceState(null,'',b.dataset.tab==='dashboard'?location.pathname+location.search:'#'+b.dataset.tab)}catch{}});
 // 網址帶 #fishing、#leveling 等就直接開那個分頁；等所有腳本載完再點，讓各分頁自己的點擊處理也會跑到。
 const openFromHash=()=>{const id=decodeURIComponent(location.hash.slice(1));if(!id)return;const b=[...document.querySelectorAll('nav button[data-tab]')].find(x=>x.dataset.tab===id);if(b&&!b.classList.contains('active'))b.click()};
 if(document.readyState==='complete')setTimeout(openFromHash,0);else window.addEventListener('load',()=>setTimeout(openFromHash,0),{once:true});
 window.addEventListener('hashchange',openFromHash)}
function getRoulettes(){const saved=store.get('roulettes',null);if(!saved)return DEFAULT_ROULETTES.map(x=>({...x}));return DEFAULT_ROULETTES.map(def=>({...def,...(saved.find(x=>x.id===def.id)||{})}))}
function saveRoulettes(v){store.set('roulettes',v)}
function renderRouletteConfig(){const data=getRoulettes(),box=document.getElementById('roulette-config');box.innerHTML='<h3>每天會打哪些</h3>'+data.map((r,i)=>`<div class="roulette-row"><input type="checkbox" data-i="${i}" class="r-en" aria-label="每天會打：${esc(r.name)}" ${r.enabled?'checked':''}><span><strong>${esc(r.name)}</strong><small>${esc(r.note||'')}</small></span><label><input class="r-pct" data-i="${i}" type="number" min="0" max="200" step="1" value="${Number(r.pct)||0}"> % EXP條</label></div>`).join('')+'<p class="muted">這裡的 % 是估算參數，不是官方固定獎勵。遊戲的每日隨機 EXP 會依角色等級與抽到的內容變動，所以工具用比例做逐日／逐級模擬；之後可再加入你的個人實測校正。</p>';box.querySelectorAll('input').forEach(el=>el.onchange=()=>{const v=getRoulettes(),i=+el.dataset.i;if(el.classList.contains('r-en'))v[i].enabled=el.checked;else v[i].pct=Math.max(0,+el.value||0);saveRoulettes(v);renderDaily();calcLevel(false)})}
function dailyState(){const done=store.get('dailyDone',{}),day=dailyDay();if(done.date!==day)return {date:day,items:{}};return {date:done.date,items:done.items||{}}}
function roulettePctForDay(roulettes,dayIndex,useRemainingToday){const done=dailyState();return roulettes.filter(r=>r.enabled&&!(dayIndex===0&&useRemainingToday&&done.items[r.id])).reduce((s,r)=>s+(Number(r.pct)||0)/100,0)}
function simulateLevel(startLevel,startExp,target,roulettes,useRemainingToday=true){let level=startLevel,exp=startExp,days=0;const trace=[];while(level<target&&days<3650){let remainingDaily=roulettePctForDay(roulettes,days,useRemainingToday),gained=0;days++;if(remainingDaily<=0){trace.push({day:days,level,exp,gained});continue}while(remainingDaily>0&&level<target){const need=EXP_TO_NEXT[level];if(!need)break;const room=Math.max(0,need-exp),award=need*remainingDaily;if(award>=room){const used=room/need;gained+=room;remainingDaily=Math.max(0,remainingDaily-used);level++;exp=0}else{exp+=award;gained+=award;remainingDaily=0}}trace.push({day:days,level,exp,gained})}return {days,level,exp,trace}}
function calcLevel(show=true){const job=document.getElementById('job-name').value.trim()||'職業',level=+document.getElementById('level-current').value,exp=Math.max(0,+document.getElementById('level-exp').value||0),target=+document.getElementById('level-target').value,useRemaining=document.getElementById('level-use-remaining')?.checked??true,out=document.getElementById('level-result');if(target<=level){out.innerHTML='已達目標。';return}if(!EXP_TO_NEXT[level]){out.innerHTML='目前只支援 Lv1–99 起始的戰鬥職業 EXP 表。';return}const roulettes=getRoulettes(),r=simulateLevel(level,exp,target,roulettes,useRemaining);const fullPct=roulettes.filter(x=>x.enabled).reduce((s,x)=>s+(Number(x.pct)||0),0),todayPct=roulettePctForDay(roulettes,0,useRemaining)*100;out.innerHTML=`<strong>${esc(job)} Lv${level} → Lv${target}</strong><br>完整一天模型：約 ${fullPct.toFixed(0)}% EXP條${useRemaining?`；今天剩餘約 ${todayPct.toFixed(0)}%`:''}<br><span class="good">預估 ${r.days} 天</span>（約 ${addDays(r.days)}）<br><span class="muted">逐日逐級重算。這是規劃用估值，不是遊戲精確公式。</span>`;store.set('levelPlan',{job,level,exp,target,days:r.days,useRemaining});renderLevelSummary()}
function renderDaily(){const data=getRoulettes(),done=dailyState();if(store.get('dailyDone',{}).date!==dailyDay())store.set('dailyDone',done);const box=document.getElementById('daily-list');box.innerHTML=data.filter(r=>r.enabled).map(r=>`<label class="daily-item"><input type="checkbox" data-id="${r.id}" ${done.items[r.id]?'checked':''}> ${esc(r.name)}</label>`).join('')||'<span class="muted">沒有啟用的每日隨機。</span>';box.querySelectorAll('input').forEach(x=>x.onchange=()=>{const d=dailyState();d.items[x.dataset.id]=x.checked;store.set('dailyDone',d);calcLevel(false)})}
function renderLevelSummary(){const p=store.get('levelPlan',null);document.getElementById('level-summary').innerHTML=p?`<strong>${esc(p.job)}</strong> Lv${p.level} → ${p.target}<br>約 <strong>${p.days} 天</strong>`:'尚未建立練等計畫'}
// 釣魚的部分在 fishing-progress.js／fishing-browse.js（比這支晚載入，所以用到時才找）。
function renderAll(){renderRouletteConfig();renderDaily();renderLevelSummary();window.renderFish?.();window.renderFishCatalog?.()}
window.renderFF14All=renderAll;
initTabs();renderAll();
document.getElementById('calc-level').onclick=()=>calcLevel(true);
document.getElementById('level-use-remaining').onchange=()=>calcLevel(false);
