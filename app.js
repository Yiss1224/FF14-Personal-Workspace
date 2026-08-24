const EXP_TO_NEXT={1:300,2:450,3:630,4:970,5:1440,6:1940,7:3000,8:3920,9:4970,10:5900,11:7430,12:8620,13:10200,14:11300,15:13100,16:15200,17:17400,18:19600,19:21900,20:24300,21:27400,22:30600,23:33900,24:37300,25:40800,26:49200,27:54600,28:61900,29:65600,30:68400,31:74000,32:82700,33:88700,34:95000,35:102000,36:113000,37:121000,38:133000,39:142000,40:155000,41:163000,42:171000,43:179000,44:187000,45:195000,46:214000,47:229000,48:244000,49:259000,50:421000,51:500000,52:580000,53:663000,54:749000,55:837000,56:927000,57:1019000,58:1114000,59:1211000,60:1387000,61:1456000,62:1534000,63:1621000,64:1720000,65:1834000,66:1968000,67:2126000,68:2317000,69:2550000,70:2923000,71:3018000,72:3153000,73:3324000,74:3532000,75:3770600,76:4066000,77:4377000,78:4777000,79:5256000,80:5992000,81:6171000,82:6942000,83:7205000,84:7948000,85:8287000,86:9231000,87:9529000,88:10459000,89:10838000,90:13278000,91:13659000,92:15348000,93:15912000,94:17534000,95:18263000,96:20322000,97:20957000,98:22979000,99:23789000};

const DEFAULT_ROULETTES=[
 {id:'leveling',name:'練等隨機',pct:31,enabled:true},
 {id:'msq',name:'主線隨機',pct:55,enabled:true},
 {id:'alliance',name:'團隊任務',pct:25,enabled:true},
 {id:'normal',name:'普通大型任務',pct:5,enabled:false},
 {id:'trial',name:'討伐／殲滅',pct:10,enabled:false},
 {id:'frontline',name:'紛爭前線',pct:50,enabled:true}
];

const store={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))};

function today(){return new Date().toISOString().slice(0,10)}
function fmt(n){return Math.round(n).toLocaleString('zh-TW')}
function addDays(days){const d=new Date();d.setDate(d.getDate()+days);return d.toLocaleDateString('zh-TW')}

function initTabs(){document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('nav button,.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.getElementById(b.dataset.tab).classList.add('active')})}

function getRoulettes(){return store.get('roulettes',DEFAULT_ROULETTES)}
function saveRoulettes(v){store.set('roulettes',v)}

function renderRouletteConfig(){const data=getRoulettes();const box=document.getElementById('roulette-config');box.innerHTML='<h3>每天會打哪些</h3>'+data.map((r,i)=>`<div class="roulette-row"><input type="checkbox" data-i="${i}" class="r-en" ${r.enabled?'checked':''}><span>${r.name}</span><label><input class="r-pct" data-i="${i}" type="number" min="0" max="200" step="1" value="${r.pct}"> % EXP條</label></div>`).join('')+'<p class="muted">% 是「約佔目前等級升級所需 EXP 的比例」。目前預設值是研究/實測起始值，不宣稱是官方固定值；抽到的副本不同會浮動，可自行校正。</p>';
 box.querySelectorAll('input').forEach(el=>el.onchange=()=>{const v=getRoulettes();const i=+el.dataset.i;if(el.classList.contains('r-en'))v[i].enabled=el.checked;else v[i].pct=+el.value;saveRoulettes(v);renderDaily();calcLevel(false)})}

function simulateLevel(startLevel,startExp,target,roulettes){let level=startLevel,exp=startExp,days=0;const trace=[];while(level<target&&days<3650){days++;let remainingDaily=roulettes.filter(r=>r.enabled).reduce((s,r)=>s+r.pct/100,0);let gained=0;while(remainingDaily>0&&level<target){const need=EXP_TO_NEXT[level];if(!need)break;const award=need*remainingDaily;const room=need-exp;if(award>=room){const used=room/need;gained+=room;remainingDaily-=used;level++;exp=0}else{exp+=award;gained+=award;remainingDaily=0}}trace.push({day:days,level,exp,gained});}return{days,level,exp,trace}}

function calcLevel(show=true){const job=document.getElementById('job-name').value.trim()||'職業';const level=+document.getElementById('level-current').value;const exp=+document.getElementById('level-exp').value;const target=+document.getElementById('level-target').value;const out=document.getElementById('level-result');if(target<=level){out.innerHTML='已達目標。';return}if(!EXP_TO_NEXT[level]){out.innerHTML='目前只支援 Lv1–100 的戰鬥職業 EXP 表。';return}const r=simulateLevel(level,exp,target,getRoulettes());const totalPct=getRoulettes().filter(x=>x.enabled).reduce((s,x)=>s+x.pct,0);out.innerHTML=`<strong>${job} Lv${level} → Lv${target}</strong><br>每日模型：約 ${totalPct.toFixed(0)}% 當前等級 EXP 條<br><span class="good">預估 ${r.days} 天</span>（約 ${addDays(r.days)}）<br><span class="muted">逐日逐級重算，不是拿固定 EXP/day 直接相除。</span>`;store.set('levelPlan',{job,level,exp,target,days:r.days});renderLevelSummary();}

function renderDaily(){const data=getRoulettes();const done=store.get('dailyDone',{});if(done.date!==today()){done.date=today();done.items={};store.set('dailyDone',done)}const box=document.getElementById('daily-list');box.innerHTML=data.filter(r=>r.enabled).map(r=>`<label class="daily-item"><input type="checkbox" data-id="${r.id}" ${done.items?.[r.id]?'checked':''}> ${r.name}</label>`).join('');box.querySelectorAll('input').forEach(x=>x.onchange=()=>{const d=store.get('dailyDone',{date:today(),items:{}});d.items[x.dataset.id]=x.checked;store.set('dailyDone',d)})}

function renderLevelSummary(){const p=store.get('levelPlan',null);document.getElementById('level-summary').innerHTML=p?`<strong>${p.job}</strong> Lv${p.level} → ${p.target}<br>約 <strong>${p.days} 天</strong>`:'尚未建立練等計畫'}

function getFishHistory(){return store.get('fishHistory',[])}
function saveFish(){const count=+document.getElementById('fish-count').value;const target=+document.getElementById('fish-target').value;let h=getFishHistory();const i=h.findIndex(x=>x.date===today());const rec={date:today(),count,target};if(i>=0)h[i]=rec;else h.push(rec);h.sort((a,b)=>a.date.localeCompare(b.date));store.set('fishHistory',h);store.set('fishTarget',target);renderFish()}

function fishStats(){const h=getFishHistory();if(!h.length)return null;const last=h[h.length-1],target=store.get('fishTarget',last.target||1140);function rate(days){const cutoff=new Date();cutoff.setDate(cutoff.getDate()-days);const rows=h.filter(x=>new Date(x.date)>=cutoff);if(rows.length<2)return null;const first=rows[0],end=rows[rows.length-1];const span=Math.max(1,(new Date(end.date)-new Date(first.date))/86400000);return(end.count-first.count)/span}const r3=rate(3),r7=rate(7),all=h.length>1?(last.count-h[0].count)/Math.max(1,(new Date(last.date)-new Date(h[0].date))/86400000):null;const use=r7||r3||all;return{count:last.count,target,r3,r7,all,use,remaining:Math.max(0,target-last.count),days:use>0?Math.ceil(Math.max(0,target-last.count)/use):null}}

function renderFish(){const s=fishStats();const result=document.getElementById('fish-result'),sum=document.getElementById('fish-summary'),hist=document.getElementById('fish-history');if(!s){result.innerHTML='先記錄一次目前魚種數，之後每天更新就會開始算速度。';sum.innerHTML='尚未建立進度';hist.innerHTML='—';return}document.getElementById('fish-count').value=s.count;document.getElementById('fish-target').value=s.target;const pct=Math.min(100,s.count/s.target*100);const eta=s.days==null?'資料不足':`${s.days} 天（約 ${addDays(s.days)}）`;result.innerHTML=`<strong>${s.count} / ${s.target}</strong>　${pct.toFixed(1)}%<div class="progress"><div style="width:${pct}%"></div></div><br>3日平均：${s.r3==null?'—':s.r3.toFixed(1)+' 種/天'}<br>7日平均：${s.r7==null?'—':s.r7.toFixed(1)+' 種/天'}<br>剩餘：${s.remaining} 種<br><span class="good">預估：${eta}</span><br><span class="muted">後期剩餘魚通常更難，線性 ETA 可能偏樂觀。</span>`;sum.innerHTML=`${s.count} / ${s.target}<br>7日平均 ${s.r7==null?'—':s.r7.toFixed(1)+'/天'}<br><strong>${eta}</strong>`;const h=getFishHistory().slice().reverse().slice(0,14);hist.innerHTML='<table><tr><th>日期</th><th>魚種</th></tr>'+h.map(x=>`<tr><td>${x.date}</td><td>${x.count}</td></tr>`).join('')+'</table>'}

function importFishcake(file){const reader=new FileReader();reader.onload=()=>{try{const raw=JSON.parse(reader.result);let ids=[];if(Array.isArray(raw))ids=raw;else{const candidates=['caught','caughtFish','fish','fishIds','caughtFishIds'];for(const k of candidates)if(Array.isArray(raw[k])){ids=raw[k];break}}if(!ids.length)throw new Error('找不到魚 ID 陣列');const unique=[...new Set(ids.map(x=>typeof x==='object'?(x.id??x.itemId??x.fishId):x).filter(x=>x!=null))];store.set('fishcakeCaughtIds',unique);document.getElementById('fish-count').value=unique.length;document.getElementById('fish-import-status').innerHTML=`已匯入 ${unique.length} 個唯一 ID。因魚糕可能漏記，這裡把它當作「至少已釣到」的保守基準。`;saveFish()}catch(e){document.getElementById('fish-import-status').textContent='匯入失敗：'+e.message+'。把魚糕輸出的格式給我，我再補 parser。'}};reader.readAsText(file)}

initTabs();renderRouletteConfig();renderDaily();renderLevelSummary();renderFish();
document.getElementById('calc-level').onclick=()=>calcLevel(true);document.getElementById('save-fish').onclick=saveFish;document.getElementById('import-fishcake').onclick=()=>document.getElementById('fishcake-file').click();document.getElementById('fishcake-file').onchange=e=>{if(e.target.files[0])importFishcake(e.target.files[0])};
