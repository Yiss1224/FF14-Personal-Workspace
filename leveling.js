const LEVEL_JOB_DEFAULTS=[{id:'mnk',name:'MNK',role:'dps',level:65,exp:0,target:71,armoury:true,queueMin:10}];
const LEVEL_ROLE_LABELS={tank:'TANK',healer:'HEALER',dps:'DPS'};
const DUNGEON_EXP_CACHE_MS=7*24*60*60*1000;
const DUNGEON_EXP_API='https://ffxiv.consolegameswiki.com/mediawiki/api.php';
const DUNGEON_TC_CACHE_KEY='ff14DungeonTcNamesV2';
const DUNGEON_TC_BASE='https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-tc/main';
const DUNGEON_EN_BASE='https://raw.githubusercontent.com/xivapi/ffxiv-datamining/master/csv/en';

const LEVELING_DUNGEON_LADDER=[
  {level:51,name:'The Dusk Vigil'},
  {level:53,name:'Sohm Al'},
  {level:55,name:'The Aery'},
  {level:57,name:'The Vault'},
  {level:59,name:'The Great Gubal Library'},
  {level:61,name:'The Sirensong Sea'},
  {level:63,name:'Shisui of the Violet Tides'},
  {level:65,name:"Bardam's Mettle"},
  {level:67,name:'Doma Castle'},
  {level:69,name:'Castrum Abania'},
  {level:71,name:'Holminster Switch'},
  {level:73,name:'Dohn Mheg'},
  {level:75,name:'The Qitana Ravel'},
  {level:77,name:"Malikah's Well"},
  {level:79,name:'Mt. Gulg'},
  {level:81,name:'The Tower of Zot'},
  {level:83,name:'The Tower of Babil'},
  {level:85,name:'Vanaspati'},
  {level:87,name:'Ktisis Hyperboreia'},
  {level:89,name:'The Aitiascope'},
  {level:91,name:'Ihuykatumu'},
  {level:93,name:'Worqor Zormor'},
  {level:95,name:'The Skydeep Cenote'},
  {level:97,name:'Vanguard'},
  {level:99,name:'Origenics'}
];

let dungeonExpCatalog=[];
let dungeonTcNames={};

function lvlEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}
function lvlUid(){return 'j'+Math.random().toString(36).slice(2,9)}
function normalizeLevelJob(j={}){return{id:String(j.id||lvlUid()),name:String(j.name||'').trim(),role:['tank','healer','dps'].includes(j.role)?j.role:'dps',level:Math.max(1,Math.min(99,Number(j.level)||1)),exp:Math.max(0,Number(j.exp)||0),target:Math.max(2,Math.min(100,Number(j.target)||100)),armoury:j.armoury!==false,queueMin:Math.max(0,Number(j.queueMin)||0)}}
function getLevelJobs(){const saved=store.get('levelJobs',null);let rows=Array.isArray(saved)?saved.filter(x=>x&&typeof x==='object').map(normalizeLevelJob):[];if(!rows.length)rows=LEVEL_JOB_DEFAULTS.map(x=>normalizeLevelJob({...x,id:lvlUid()}));return rows}
function saveLevelJobs(v){store.set('levelJobs',(Array.isArray(v)?v:[]).filter(Boolean).map(normalizeLevelJob))}
function cloneLevelJobs(){return getLevelJobs().map(x=>({...x}))}
function getLevelSchedulerSettings(){return{mode:'focus',dungeonRuns:0,useRemainingToday:true,includeDungeonExp:true,...(store.get('levelSchedulerSettings',{})||{})}}
function saveLevelSchedulerSettings(v){store.set('levelSchedulerSettings',v)}
function levelNeed(level){return Number(EXP_TO_NEXT[level])||0}
function isJobDone(j){return j.level>=j.target}
function addAbsoluteExp(job,amount){let gain=Math.max(0,Number(amount)||0),earned=0;while(gain>0&&job.level<job.target){const need=levelNeed(job.level);if(!need)break;job.exp=Math.max(0,Math.min(job.exp,need));const room=need-job.exp;if(gain>=room){gain-=room;earned+=room;job.level++;job.exp=0}else{job.exp+=gain;earned+=gain;gain=0}}return earned}
function addPercentBar(job,pct){const need=levelNeed(job.level);if(!need||isJobDone(job))return 0;return addAbsoluteExp(job,need*Math.max(0,Number(pct)||0)/100)}
function armouryMultiplier(job){if(!job.armoury)return 1;return job.level<=89?2:1.5}

function csvLine(line){const out=[];let cur='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){out.push(cur);cur=''}else cur+=c}out.push(cur);return out}
function dungeonNameKey(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'')}
function dungeonDisplayName(name){return dungeonTcNames[dungeonNameKey(name)]||name}
function contentFinderNames(text){const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/),heads=csvLine(lines[1]||''),idx=heads.indexOf('Name'),out={};for(let i=3;i<lines.length;i++){if(!lines[i])continue;const r=csvLine(lines[i]),id=Number(r[0]);if(Number.isFinite(id)&&idx>=0&&r[idx])out[id]=String(r[idx]).trim()}return out}
function refreshRenderedScheduleNames(){
  renderDungeonPreview();
  const out=document.getElementById('multi-level-result');
  if(out&&out.textContent.trim())safeLevelInitStep('translated multi schedule',renderMultiSchedule);
}
async function loadDungeonTcNames(){
  try{const cached=JSON.parse(localStorage.getItem(DUNGEON_TC_CACHE_KEY)||'null');if(cached?.names&&Date.now()-(cached.ts||0)<30*24*60*60*1000)dungeonTcNames=cached.names}catch{}
  if(Object.keys(dungeonTcNames).length){refreshRenderedScheduleNames();return dungeonTcNames}
  try{
    const [enR,tcR]=await Promise.all([fetch(`${DUNGEON_EN_BASE}/ContentFinderCondition.csv`,{cache:'no-store'}),fetch(`${DUNGEON_TC_BASE}/ContentFinderCondition.csv`,{cache:'no-store'})]);
    if(!enR.ok||!tcR.ok)throw new Error('ContentFinderCondition.csv');
    const [enText,tcText]=await Promise.all([enR.text(),tcR.text()]),en=contentFinderNames(enText),tc=contentFinderNames(tcText),map={};
    for(const[id,enName]of Object.entries(en)){const tcName=tc[id];if(enName&&tcName)map[dungeonNameKey(enName)]=tcName}
    dungeonTcNames=map;localStorage.setItem(DUNGEON_TC_CACHE_KEY,JSON.stringify({ts:Date.now(),names:map}));refreshRenderedScheduleNames();return map
  }catch(e){console.warn('dungeon TC names load failed',e);return dungeonTcNames}
}

function smwValue(v){if(v==null)return null;if(typeof v==='number'||typeof v==='string')return v;if(typeof v==='object')return v.fulltext??v.raw??v.value??v.displaytitle??null;return null}
function firstNumber(a){for(const v of(Array.isArray(a)?a:[a])){const n=Number(smwValue(v));if(Number.isFinite(n)&&n>0)return n}return 0}
function textList(a){return(Array.isArray(a)?a:[a]).map(smwValue).filter(v=>v!=null).map(String)}
function estimateBaseExp(level){const need=levelNeed(level);return need?Math.round((need*0.23)/1000)*1000:0}
function mergeLevelingCatalog(wikiRows){
  const byName=new Map(wikiRows.map(x=>[dungeonNameKey(x.name),x]));
  return LEVELING_DUNGEON_LADDER.map(x=>{
    const real=byName.get(dungeonNameKey(x.name));
    if(real?.baseExp)return{...x,baseExp:real.baseExp,estimated:false,roulette:real.roulette||'leveling'};
    return{...x,baseExp:estimateBaseExp(x.level),estimated:true,roulette:'leveling'};
  })
}
async function loadDungeonExpCatalog(force=false){
  const status=document.getElementById('dungeon-exp-status'),cached=store.get('dungeonExpCatalog',null);
  if(!force&&cached?.ts&&Date.now()-cached.ts<DUNGEON_EXP_CACHE_MS&&Array.isArray(cached.rows)&&cached.rows.length){
    const cachedWiki=cached.rows.filter(x=>!x.levelingFallback);dungeonExpCatalog=mergeLevelingCatalog(cachedWiki);
    if(status)status.textContent=`已載入 ${dungeonExpCatalog.length} 個練等副本（${cachedWiki.filter(x=>x.baseExp).length} 筆 Wiki 實值，其餘估算）`;
    renderDungeonPreview();return dungeonExpCatalog
  }
  if(status)status.textContent='正在讀取副本 EXP…';
  let wikiRows=[];
  try{
    const query='[[Category:Dungeons]][[Has duty experience::+]]|?Has duty experience|?Has duty level requirement|?Is available for duty roulette|limit=500';
    const url=DUNGEON_EXP_API+'?'+new URLSearchParams({action:'ask',format:'json',origin:'*',query});
    const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const json=await r.json(),src=json?.query?.results||{};
    for(const[key,val]of Object.entries(src)){const p=val?.printouts||{},exp=firstNumber(p['Has duty experience']),level=firstNumber(p['Has duty level requirement']);if(!exp||!level)continue;wikiRows.push({name:val?.fulltext||key,level,baseExp:exp,roulette:textList(p['Is available for duty roulette']).join(', ')})}
    wikiRows.sort((a,b)=>a.level-b.level||a.name.localeCompare(b.name));
    store.set('dungeonExpCatalog',{ts:Date.now(),rows:wikiRows});
  }catch(e){wikiRows=Array.isArray(cached?.rows)?cached.rows.filter(x=>!x.levelingFallback):[];console.warn('Wiki dungeon EXP load failed',e)}
  dungeonExpCatalog=mergeLevelingCatalog(wikiRows);
  const exact=dungeonExpCatalog.filter(x=>!x.estimated).length;
  if(status)status.textContent=`已載入 ${dungeonExpCatalog.length} 個練等副本（${exact} 筆 Base EXP 實值，${dungeonExpCatalog.length-exact} 筆估算）`;
  renderDungeonPreview();return dungeonExpCatalog
}
window.loadDungeonExpCatalog=loadDungeonExpCatalog;

function bestDungeonForLevel(level){const eligible=dungeonExpCatalog.filter(d=>d.level<=level&&d.level<100&&d.baseExp>0);return eligible.slice().sort((a,b)=>b.level-a.level||b.baseExp-a.baseExp)[0]||null}
function dungeonGainForJob(job,d){return d?Math.round(d.baseExp*armouryMultiplier(job)):0}
function renderDungeonPreview(){
  const box=document.getElementById('dungeon-exp-preview');if(!box)return;
  if(!dungeonExpCatalog.length){box.innerHTML='<span class="muted">尚無副本 EXP 資料。</span>';return}
  const levels=[51,61,67,69,71,81,91,99];
  const rows=levels.map(l=>{const d=bestDungeonForLevel(l);return d?`<tr><td>Lv${l}</td><td>${lvlEsc(dungeonDisplayName(d.name))}</td><td>Lv${d.level}</td><td>${d.estimated?'約 ':''}${Math.round(d.baseExp).toLocaleString('zh-TW')}</td></tr>`:''}).join('');
  box.innerHTML=`<table><tr><th>角色等級</th><th>自動推薦</th><th>副本等級</th><th>Base EXP</th></tr>${rows}</table><div class="muted">推薦固定依練等副本階梯選「目前可進的最高等級副本」。Wiki 現在只有少量 Base EXP 實值，缺少的數字會明確標成估算，不再因此漏掉副本。</div>`
}

function persistRow(row){const id=row.dataset.id,v=getLevelJobs(),j=v.find(x=>x.id===id);if(!j)return;j.name=row.querySelector('.lj-name')?.value||'';j.role=row.querySelector('.lj-role')?.value||'dps';j.level=+row.querySelector('.lj-level')?.value||1;j.exp=+row.querySelector('.lj-exp')?.value||0;j.target=+row.querySelector('.lj-target')?.value||100;j.queueMin=+row.querySelector('.lj-queue')?.value||0;j.armoury=!!row.querySelector('.lj-armoury')?.checked;saveLevelJobs(v)}
function renderLevelJobs(){
  const box=document.getElementById('level-jobs');if(!box)return;const jobs=getLevelJobs();
  box.innerHTML=jobs.map((j,i)=>`<div class="job-row" data-id="${lvlEsc(j.id)}"><span class="job-order">${i+1}</span><label>職業<input class="lj-name" value="${lvlEsc(j.name)}" placeholder="MNK / WAR / WHM"></label><label>角色<select class="lj-role"><option value="tank" ${j.role==='tank'?'selected':''}>TANK</option><option value="healer" ${j.role==='healer'?'selected':''}>HEALER</option><option value="dps" ${j.role==='dps'?'selected':''}>DPS</option></select></label><label>Lv<input class="lj-level" type="number" min="1" max="99" value="${j.level}"></label><label>目前 EXP<input class="lj-exp" type="number" min="0" value="${j.exp}"></label><label>目標<input class="lj-target" type="number" min="2" max="100" value="${j.target}"></label><label>平均排隊 min<input class="lj-queue" type="number" min="0" max="120" value="${j.queueMin}"></label><label class="inline-check job-armoury"><input class="lj-armoury" type="checkbox" ${j.armoury?'checked':''}> 低於最高戰鬥職（兵裝加成）</label><div class="job-buttons"><button class="lj-up" ${i===0?'disabled':''}>↑</button><button class="lj-down" ${i===jobs.length-1?'disabled':''}>↓</button><button class="lj-del">刪除</button></div></div>`).join('');
  box.querySelectorAll('.job-row').forEach(row=>{row.querySelectorAll('input,select').forEach(x=>x.addEventListener('change',()=>persistRow(row)));row.querySelector('.lj-del')?.addEventListener('click',()=>{const v=getLevelJobs().filter(x=>x.id!==row.dataset.id);saveLevelJobs(v.length?v:LEVEL_JOB_DEFAULTS.map(x=>({...x,id:lvlUid()})));renderLevelJobs()});row.querySelector('.lj-up')?.addEventListener('click',()=>moveLevelJob(row.dataset.id,-1));row.querySelector('.lj-down')?.addEventListener('click',()=>moveLevelJob(row.dataset.id,1))})
}
window.renderLevelJobs=renderLevelJobs;
function moveLevelJob(id,delta){const v=getLevelJobs(),i=v.findIndex(x=>x.id===id),j=i+delta;if(i<0||j<0||j>=v.length)return;[v[i],v[j]]=[v[j],v[i]];saveLevelJobs(v);renderLevelJobs()}
function addLevelJob(){const v=getLevelJobs();v.push(normalizeLevelJob({id:lvlUid(),name:'',role:'dps',level:1,exp:0,target:100,armoury:true,queueMin:10}));saveLevelJobs(v);renderLevelJobs()}

function schedulerDailyActivities(roulettes,day,useRemaining){const done=typeof dailyState==='function'?dailyState():{items:{}};return roulettes.filter(r=>r.enabled&&!(day===0&&useRemaining&&done.items?.[r.id]))}
function chooseFocusJob(jobs){return jobs.find(j=>!isJobDone(j))||null}
function chooseRoundJob(jobs,pointer){const active=jobs.filter(j=>!isJobDone(j));if(!active.length)return{job:null,pointer};return{job:active[pointer%active.length],pointer:pointer+1}}
function simulateMultiJobs(inputJobs,roulettes,settings){
  const jobs=inputJobs.map(normalizeLevelJob).filter(j=>j.name).map(x=>({...x})),completed={},trace=[];let day=0,pointer=0,totalDungeonRuns=0;
  while(jobs.some(j=>!isJobDone(j))&&day<3650){
    const events=[],acts=schedulerDailyActivities(roulettes,day,settings.useRemainingToday);
    for(const a of acts){let job;if(settings.mode==='round'){const p=chooseRoundJob(jobs,pointer);job=p.job;pointer=p.pointer}else job=chooseFocusJob(jobs);if(!job)break;const before=`Lv${job.level}`,earned=addPercentBar(job,Number(a.pct)||0);events.push({kind:'daily',name:a.name,job:job.name,before,after:`Lv${job.level}`,earned});if(isJobDone(job)&&completed[job.id]==null)completed[job.id]=day+1}
    for(let n=0;n<(Number(settings.dungeonRuns)||0);n++){let job;if(settings.mode==='round'){const p=chooseRoundJob(jobs,pointer);job=p.job;pointer=p.pointer}else job=chooseFocusJob(jobs);if(!job)break;const d=settings.includeDungeonExp?bestDungeonForLevel(job.level):null;if(!d)break;const before=`Lv${job.level}`,earned=addAbsoluteExp(job,dungeonGainForJob(job,d));totalDungeonRuns++;events.push({kind:'dungeon',name:d.name,estimated:d.estimated,job:job.name,before,after:`Lv${job.level}`,earned});if(isJobDone(job)&&completed[job.id]==null)completed[job.id]=day+1}
    day++;if(day<=14)trace.push({day,events,jobs:jobs.map(j=>({name:j.name,level:j.level,exp:j.exp,target:j.target}))})
  }
  jobs.forEach(j=>{if(isJobDone(j)&&completed[j.id]==null)completed[j.id]=day});return{days:day,jobs,completed,trace,totalDungeonRuns}
}
function scenarioRoulettes(base,id,enabled){return base.map(r=>r.id===id?{...r,enabled}:{...r})}
function simulateScenarioDiffs(jobs,roulettes,settings,baseline){return roulettes.map(r=>{const v=simulateMultiJobs(jobs,scenarioRoulettes(roulettes,r.id,!r.enabled),settings);return{id:r.id,name:r.name,currently:r.enabled,days:v.days,delta:v.days-baseline.days,pct:r.pct}})}
function renderMultiSchedule(){
  const out=document.getElementById('multi-level-result');if(!out)return;const jobs=cloneLevelJobs().filter(j=>j.name&&j.target>j.level),roulettes=getRoulettes(),settings=getLevelSchedulerSettings();
  if(!jobs.length){out.innerHTML='至少要有一個「目前等級低於目標」的職業。';return}
  const baseline=simulateMultiJobs(jobs,roulettes,settings),diffs=simulateScenarioDiffs(jobs,roulettes,settings,baseline),noDungeon=settings.dungeonRuns?simulateMultiJobs(jobs,roulettes,{...settings,dungeonRuns:0}):null;
  const jobRows=jobs.map(j=>{const d=baseline.completed[j.id];return`<tr><td>${lvlEsc(j.name)}</td><td>${LEVEL_ROLE_LABELS[j.role]}</td><td>Lv${j.level} → ${j.target}</td><td>${d??'—'} 天</td><td>${d?addDays(d):'—'}</td></tr>`}).join('');
  const diffRows=diffs.map(x=>`<tr><td>${lvlEsc(x.name)}</td><td>${x.currently?'目前有打':'目前沒打'}</td><td>${x.currently?'不打':'加入'}</td><td>${x.delta===0?'±0':x.delta>0?`+${x.delta}`:x.delta} 天</td></tr>`).join('');
  const dungeonLine=noDungeon?`<div class="scenario-callout">每天 ${settings.dungeonRuns} 本最高可用練等副本：總畢業約 <strong>${baseline.days} 天</strong>；若完全不刷副本約 <strong>${noDungeon.days} 天</strong>，差 ${Math.max(0,noDungeon.days-baseline.days)} 天。</div>`:'';
  const trace=baseline.trace.slice(0,7).map(d=>`<details class="schedule-day"><summary>Day ${d.day} · ${d.events.length} 項</summary>${d.events.map(e=>`<div>${e.kind==='daily'?'🎲':'🏰'} ${lvlEsc(e.kind==='dungeon'?dungeonDisplayName(e.name):e.name)}${e.kind==='dungeon'&&e.estimated?'（EXP估算）':''} → <strong>${lvlEsc(e.job)}</strong> ${e.before}→${e.after}　+${Math.round(e.earned).toLocaleString('zh-TW')} EXP</div>`).join('')||'<div class="muted">今天沒有可用項目。</div>'}</details>`).join('');
  out.innerHTML=`<div class="scenario-callout"><strong>全部目標：約 ${baseline.days} 天</strong>（${addDays(baseline.days)}）<br><span class="muted">模式：${settings.mode==='round'?'日隨輪替分配':'照上方順序集中練'}。副本推薦使用完整練等副本階梯；Wiki 缺少的 Base EXP 會標為估算。</span></div>${dungeonLine}<h3>各職業 ETA</h3><table><tr><th>職業</th><th>角色</th><th>目標</th><th>完成</th><th>日期</th></tr>${jobRows}</table><h3>打／不打差多少</h3><table><tr><th>項目</th><th>狀態</th><th>假設</th><th>全部目標差</th></tr>${diffRows}</table><h3>前 7 天排程預覽</h3>${trace}`;
  store.set('levelMultiPlan',{days:baseline.days,generatedAt:new Date().toISOString(),jobs:jobs.map(j=>({name:j.name,level:j.level,target:j.target,etaDays:baseline.completed[j.id]})),settings});renderMultiSummary()
}
function renderMultiSummary(){const box=document.getElementById('level-multi-summary');if(!box)return;const p=store.get('levelMultiPlan',null);box.innerHTML=p?`多職業：<strong>${p.days} 天</strong><br>${(p.jobs||[]).slice(0,4).map(j=>`${lvlEsc(j.name)} ${j.etaDays||'—'}d`).join(' · ')}`:'尚未建立多職業排程'}
function syncSchedulerSettingsFromUi(){const s=getLevelSchedulerSettings();s.mode=document.getElementById('multi-mode')?.value||'focus';s.dungeonRuns=Math.max(0,+document.getElementById('multi-dungeon-runs')?.value||0);s.useRemainingToday=document.getElementById('multi-use-remaining')?.checked??true;s.includeDungeonExp=document.getElementById('multi-use-dungeon-exp')?.checked??true;saveLevelSchedulerSettings(s);return s}
function loadSchedulerSettingsToUi(){const s=getLevelSchedulerSettings(),mode=document.getElementById('multi-mode'),runs=document.getElementById('multi-dungeon-runs'),rem=document.getElementById('multi-use-remaining'),dex=document.getElementById('multi-use-dungeon-exp');if(mode)mode.value=s.mode;if(runs)runs.value=s.dungeonRuns;if(rem)rem.checked=s.useRemainingToday;if(dex)dex.checked=s.includeDungeonExp}
function safeLevelInitStep(name,fn){try{return fn()}catch(e){console.error(`leveling init failed: ${name}`,e);return null}}

window.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('add-level-job')?.addEventListener('click',addLevelJob);
  document.getElementById('calc-multi-level')?.addEventListener('click',()=>{syncSchedulerSettingsFromUi();renderMultiSchedule()});
  document.querySelectorAll('#multi-mode,#multi-dungeon-runs,#multi-use-remaining,#multi-use-dungeon-exp').forEach(x=>x.addEventListener('change',syncSchedulerSettingsFromUi));
  document.getElementById('refresh-dungeon-exp')?.addEventListener('click',()=>loadDungeonExpCatalog(true));
  safeLevelInitStep('jobs',renderLevelJobs);safeLevelInitStep('settings',loadSchedulerSettingsToUi);safeLevelInitStep('summary',renderMultiSummary);
  Promise.allSettled([loadDungeonTcNames(),loadDungeonExpCatalog(false)]).then(()=>refreshRenderedScheduleNames())
});
window.renderLevelScheduler=()=>{safeLevelInitStep('jobs',renderLevelJobs);safeLevelInitStep('settings',loadSchedulerSettingsToUi);safeLevelInitStep('summary',renderMultiSummary);safeLevelInitStep('dungeon preview',renderDungeonPreview)};
