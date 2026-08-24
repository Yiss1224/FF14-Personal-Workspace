const LEVEL_JOB_DEFAULTS=[
  {id:'mnk',name:'MNK',role:'dps',level:65,exp:0,target:71,armoury:true,queueMin:10}
];
const LEVEL_ROLE_LABELS={tank:'TANK',healer:'HEALER',dps:'DPS'};
const DUNGEON_EXP_CACHE_MS=7*24*60*60*1000;
const DUNGEON_EXP_API='https://ffxiv.consolegameswiki.com/mediawiki/api.php';
let dungeonExpCatalog=[];

function lvlEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function lvlUid(){return 'j'+Math.random().toString(36).slice(2,9)}
function getLevelJobs(){
  const saved=store.get('levelJobs',null);if(Array.isArray(saved)&&saved.length)return saved;
  const initial=LEVEL_JOB_DEFAULTS.map(x=>({...x,id:lvlUid()}));store.set('levelJobs',initial);return initial
}
function saveLevelJobs(v){store.set('levelJobs',v)}
function getLevelSchedulerSettings(){return {...{mode:'focus',dungeonRuns:0,useRemainingToday:true,includeDungeonExp:true},...(store.get('levelSchedulerSettings',{})||{})}}
function saveLevelSchedulerSettings(v){store.set('levelSchedulerSettings',v)}

function normalizeLevelJob(j){return {
  id:j.id||lvlUid(),name:String(j.name||'').trim(),role:['tank','healer','dps'].includes(j.role)?j.role:'dps',
  level:Math.max(1,Math.min(99,Number(j.level)||1)),exp:Math.max(0,Number(j.exp)||0),target:Math.max(2,Math.min(100,Number(j.target)||100)),
  armoury:j.armoury!==false,queueMin:Math.max(0,Number(j.queueMin)||0)
}}
function cloneLevelJobs(){return getLevelJobs().map(normalizeLevelJob).map(x=>({...x}))}
function levelNeed(level){return Number(EXP_TO_NEXT[level])||0}
function isJobDone(j){return j.level>=j.target}
function addAbsoluteExp(job,amount){
  let gain=Math.max(0,Number(amount)||0),earned=0;
  while(gain>0&&job.level<job.target){const need=levelNeed(job.level);if(!need)break;job.exp=Math.max(0,Math.min(job.exp,need));const room=need-job.exp;if(gain>=room){gain-=room;earned+=room;job.level++;job.exp=0}else{job.exp+=gain;earned+=gain;gain=0}}
  return earned;
}
function addPercentBar(job,pct){const need=levelNeed(job.level);if(!need||isJobDone(job))return 0;return addAbsoluteExp(job,need*Math.max(0,Number(pct)||0)/100)}
function armouryMultiplier(job){if(!job.armoury)return 1;return job.level<=89?2:1.5}

function smwValue(v){if(v==null)return null;if(typeof v==='number'||typeof v==='string')return v;if(typeof v==='object')return v.fulltext??v.raw??v.value??v.displaytitle??null;return null}
function firstNumber(a){for(const v of (Array.isArray(a)?a:[a])){const n=Number(smwValue(v));if(Number.isFinite(n))return n}return 0}
function textList(a){return (Array.isArray(a)?a:[a]).map(smwValue).filter(v=>v!=null).map(String)}
async function loadDungeonExpCatalog(force=false){
  const status=document.getElementById('dungeon-exp-status'),cached=store.get('dungeonExpCatalog',null);
  if(!force&&cached?.ts&&Date.now()-cached.ts<DUNGEON_EXP_CACHE_MS&&Array.isArray(cached.rows)&&cached.rows.length){dungeonExpCatalog=cached.rows;if(status)status.textContent=`已載入 ${dungeonExpCatalog.length} 筆副本 EXP（快取）`;renderDungeonPreview();return dungeonExpCatalog}
  if(status)status.textContent='正在從 FFXIV Wiki 讀取副本 EXP…';
  try{
    const query='[[Category:Dungeons]][[Has duty experience::+]]|?Has duty experience|?Has duty level requirement|?Is available for duty roulette|limit=500';
    const url=DUNGEON_EXP_API+'?'+new URLSearchParams({action:'ask',format:'json',origin:'*',query});
    const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const json=await r.json();
    const src=json?.query?.results||{};const rows=[];
    for(const [key,val] of Object.entries(src)){
      const p=val?.printouts||{};const exp=firstNumber(p['Has duty experience']),level=firstNumber(p['Has duty level requirement']);if(!exp||!level)continue;
      rows.push({name:val?.fulltext||key,level,baseExp:exp,roulette:textList(p['Is available for duty roulette']).join(', ')})
    }
    rows.sort((a,b)=>a.level-b.level||a.name.localeCompare(b.name));if(rows.length<10)throw new Error('回傳資料筆數異常');
    dungeonExpCatalog=rows;store.set('dungeonExpCatalog',{ts:Date.now(),rows});if(status)status.textContent=`已載入 ${rows.length} 筆副本 EXP（FFXIV Wiki）`;renderDungeonPreview();return rows;
  }catch(e){dungeonExpCatalog=Array.isArray(cached?.rows)?cached.rows:[];if(status)status.textContent=`副本 EXP 讀取失敗：${e.message}${dungeonExpCatalog.length?'；改用舊快取':''}`;renderDungeonPreview();return dungeonExpCatalog}
}
function dungeonIsLeveling(d){const r=String(d.roulette||'').toLowerCase();return r.includes('leveling')||r.includes('level')&&!r.includes('cap')}
function bestDungeonForLevel(level){
  const eligible=dungeonExpCatalog.filter(d=>d.level<=level&&d.level<100&&d.baseExp>0&&d.level%10!==0);
  const leveling=eligible.filter(dungeonIsLeveling);const pool=leveling.length?leveling:eligible;
  return pool.slice().sort((a,b)=>b.level-a.level||b.baseExp-a.baseExp)[0]||null
}
function dungeonGainForJob(job,d){return d?Math.round(d.baseExp*armouryMultiplier(job)):0}

function renderDungeonPreview(){
  const box=document.getElementById('dungeon-exp-preview');if(!box)return;if(!dungeonExpCatalog.length){box.innerHTML='<span class="muted">尚無副本 EXP 資料。</span>';return}
  const levels=[51,61,71,81,91,99];const rows=levels.map(l=>{const d=bestDungeonForLevel(l);return d?`<tr><td>Lv${l}</td><td>${lvlEsc(d.name)}</td><td>${Math.round(d.baseExp).toLocaleString('zh-TW')}</td></tr>`:''}).join('');
  box.innerHTML=`<table><tr><th>角色等級</th><th>自動推薦</th><th>Base EXP</th></tr>${rows}</table><div class="muted">Base EXP 先不含兵裝加成；排程時會依各職業設定自動套用。</div>`
}

function renderLevelJobs(){
  const box=document.getElementById('level-jobs');if(!box)return;const jobs=getLevelJobs();
  box.innerHTML=jobs.map((j,i)=>`<div class="job-row" data-id="${lvlEsc(j.id)}">
    <span class="job-order">${i+1}</span>
    <label>職業<input class="lj-name" value="${lvlEsc(j.name||'')}" placeholder="MNK / WAR / WHM"></label>
    <label>角色<select class="lj-role"><option value="tank" ${j.role==='tank'?'selected':''}>TANK</option><option value="healer" ${j.role==='healer'?'selected':''}>HEALER</option><option value="dps" ${j.role==='dps'?'selected':''}>DPS</option></select></label>
    <label>Lv<input class="lj-level" type="number" min="1" max="99" value="${Number(j.level)||1}"></label>
    <label>目前 EXP<input class="lj-exp" type="number" min="0" value="${Number(j.exp)||0}"></label>
    <label>目標<input class="lj-target" type="number" min="2" max="100" value="${Number(j.target)||100}"></label>
    <label>平均排隊 min<input class="lj-queue" type="number" min="0" max="120" value="${Number(j.queueMin)||0}"></label>
    <label class="inline-check job-armoury"><input class="lj-armoury" type="checkbox" ${j.armoury!==false?'checked':''}> 低於最高戰鬥職（兵裝加成）</label>
    <div class="job-buttons"><button class="lj-up" ${i===0?'disabled':''}>↑</button><button class="lj-down" ${i===jobs.length-1?'disabled':''}>↓</button><button class="lj-del">刪除</button></div>
  </div>`).join('');
  box.querySelectorAll('.job-row').forEach(row=>{
    const id=row.dataset.id;const mutate=()=>{const v=getLevelJobs(),j=v.find(x=>x.id===id);if(!j)return;j.name=row.querySelector('.lj-name').value;j.role=row.querySelector('.lj-role').value;j.level=+row.querySelector('.lj-level').value;j.exp=+row.querySelector('.lj-exp').value;j.target=+row.querySelector('.lj-target').value;j.queueMin=+row.querySelector('.lj-queue').value;j.armoury=row.querySelector('.lj-armoury').checked;saveLevelJobs(v)};
    row.querySelectorAll('input,select').forEach(x=>x.onchange=mutate);
    row.querySelector('.lj-del').onclick=()=>{const v=getLevelJobs().filter(x=>x.id!==id);saveLevelJobs(v.length?v:[{...LEVEL_JOB_DEFAULTS[0],id:lvlUid()}]);renderLevelJobs()};
    row.querySelector('.lj-up').onclick=()=>moveLevelJob(id,-1);row.querySelector('.lj-down').onclick=()=>moveLevelJob(id,1)
  })
}
function moveLevelJob(id,delta){const v=getLevelJobs(),i=v.findIndex(x=>x.id===id),j=i+delta;if(i<0||j<0||j>=v.length)return;[v[i],v[j]]=[v[j],v[i]];saveLevelJobs(v);renderLevelJobs()}
function addLevelJob(){const v=getLevelJobs();v.push({id:lvlUid(),name:'',role:'dps',level:1,exp:0,target:100,armoury:true,queueMin:10});saveLevelJobs(v);renderLevelJobs()}

function schedulerDailyActivities(roulettes,day,useRemaining){const done=(typeof dailyState==='function')?dailyState():{items:{}};return roulettes.filter(r=>r.enabled&&!(day===0&&useRemaining&&done.items?.[r.id]))}
function chooseFocusJob(jobs){return jobs.find(j=>!isJobDone(j))||null}
function chooseRoundJob(jobs,pointer){const active=jobs.filter(j=>!isJobDone(j));if(!active.length)return {job:null,pointer};const idx=pointer%active.length;return {job:active[idx],pointer:pointer+1}}
function simulateMultiJobs(inputJobs,roulettes,settings){
  const jobs=inputJobs.map(normalizeLevelJob).filter(j=>j.name).map(x=>({...x})),completed={},trace=[];let day=0,pointer=0,totalDungeonRuns=0;
  while(jobs.some(j=>!isJobDone(j))&&day<3650){
    const events=[],acts=schedulerDailyActivities(roulettes,day,settings.useRemainingToday);
    for(const a of acts){let job;if(settings.mode==='round'){const pick=chooseRoundJob(jobs,pointer);job=pick.job;pointer=pick.pointer}else job=chooseFocusJob(jobs);if(!job)break;const before=`Lv${job.level}`;const earned=addPercentBar(job,Number(a.pct)||0);events.push({kind:'daily',name:a.name,job:job.name,before,after:`Lv${job.level}`,earned});if(isJobDone(job)&&completed[job.id]==null)completed[job.id]=day+1}
    for(let n=0;n<(Number(settings.dungeonRuns)||0);n++){
      let job;if(settings.mode==='round'){const pick=chooseRoundJob(jobs,pointer);job=pick.job;pointer=pick.pointer}else job=chooseFocusJob(jobs);if(!job)break;const d=settings.includeDungeonExp?bestDungeonForLevel(job.level):null;if(!d)break;const before=`Lv${job.level}`,earned=addAbsoluteExp(job,dungeonGainForJob(job,d));totalDungeonRuns++;events.push({kind:'dungeon',name:d.name,job:job.name,before,after:`Lv${job.level}`,earned});if(isJobDone(job)&&completed[job.id]==null)completed[job.id]=day+1
    }
    day++;if(day<=14)trace.push({day,events,jobs:jobs.map(j=>({name:j.name,level:j.level,exp:j.exp,target:j.target}))})
  }
  jobs.forEach(j=>{if(isJobDone(j)&&completed[j.id]==null)completed[j.id]=day});return {days:day,jobs,completed,trace,totalDungeonRuns}
}
function scenarioRoulettes(base,id,enabled){return base.map(r=>r.id===id?{...r,enabled}:({...r}))}
function simulateScenarioDiffs(jobs,roulettes,settings,baseline){
  return roulettes.map(r=>{const v=simulateMultiJobs(jobs,scenarioRoulettes(roulettes,r.id,!r.enabled),settings);return {id:r.id,name:r.name,currently:r.enabled,days:v.days,delta:v.days-baseline.days,pct:r.pct}})
}
function renderMultiSchedule(){
  const out=document.getElementById('multi-level-result');if(!out)return;const jobs=cloneLevelJobs().filter(j=>j.name&&j.target>j.level),roulettes=getRoulettes(),settings=getLevelSchedulerSettings();
  if(!jobs.length){out.innerHTML='至少要有一個「目前等級低於目標」的職業。';return}
  const baseline=simulateMultiJobs(jobs,roulettes,settings),diffs=simulateScenarioDiffs(jobs,roulettes,settings,baseline),noDungeon=settings.dungeonRuns?simulateMultiJobs(jobs,roulettes,{...settings,dungeonRuns:0}):null;
  const jobRows=jobs.map(j=>{const d=baseline.completed[j.id];return `<tr><td>${lvlEsc(j.name)}</td><td>${LEVEL_ROLE_LABELS[j.role]}</td><td>Lv${j.level} → ${j.target}</td><td>${d??'—'} 天</td><td>${d?addDays(d):'—'}</td></tr>`}).join('');
  const diffRows=diffs.map(x=>`<tr><td>${lvlEsc(x.name)}</td><td>${x.currently?'目前有打':'目前沒打'}</td><td>${x.currently?'不打':'加入'}</td><td>${x.delta===0?'±0':(x.delta>0?`+${x.delta}`:`${x.delta}`)} 天</td></tr>`).join('');
  const dungeonLine=noDungeon?`<div class="scenario-callout">每天 ${settings.dungeonRuns} 本最高可用練等副本：總畢業約 <strong>${baseline.days} 天</strong>；若完全不刷副本約 <strong>${noDungeon.days} 天</strong>，差 ${Math.max(0,noDungeon.days-baseline.days)} 天。</div>`:'';
  const trace=baseline.trace.slice(0,7).map(d=>`<details class="schedule-day"><summary>Day ${d.day} · ${d.events.length} 項</summary>${d.events.map(e=>`<div>${e.kind==='daily'?'🎲':'🏰'} ${lvlEsc(e.name)} → <strong>${lvlEsc(e.job)}</strong> ${e.before}→${e.after}　+${Math.round(e.earned).toLocaleString('zh-TW')} EXP</div>`).join('')||'<div class="muted">今天沒有可用項目。</div>'}</details>`).join('');
  out.innerHTML=`<div class="scenario-callout"><strong>全部目標：約 ${baseline.days} 天</strong>（${addDays(baseline.days)}）<br><span class="muted">模式：${settings.mode==='round'?'日隨輪替分配':'照上方順序集中練'}。日隨 % 目前視為「該日隨一次的平均總收益」；額外刷副本則使用 Wiki Base EXP，並另套兵裝加成。</span></div>${dungeonLine}<h3>各職業 ETA</h3><table><tr><th>職業</th><th>角色</th><th>目標</th><th>完成</th><th>日期</th></tr>${jobRows}</table><h3>打／不打差多少</h3><table><tr><th>項目</th><th>狀態</th><th>假設</th><th>全部目標差</th></tr>${diffRows}</table><h3>前 7 天排程預覽</h3>${trace}`;
  store.set('levelMultiPlan',{days:baseline.days,generatedAt:new Date().toISOString(),jobs:jobs.map(j=>({name:j.name,level:j.level,target:j.target,etaDays:baseline.completed[j.id]})),settings});
  renderMultiSummary()
}
function renderMultiSummary(){const box=document.getElementById('level-multi-summary');if(!box)return;const p=store.get('levelMultiPlan',null);box.innerHTML=p?`多職業：<strong>${p.days} 天</strong><br>${(p.jobs||[]).slice(0,4).map(j=>`${lvlEsc(j.name)} ${j.etaDays||'—'}d`).join(' · ')}`:'尚未建立多職業排程'}
}
function syncSchedulerSettingsFromUi(){const s=getLevelSchedulerSettings();s.mode=document.getElementById('multi-mode')?.value||'focus';s.dungeonRuns=Math.max(0,+document.getElementById('multi-dungeon-runs')?.value||0);s.useRemainingToday=document.getElementById('multi-use-remaining')?.checked??true;s.includeDungeonExp=document.getElementById('multi-use-dungeon-exp')?.checked??true;saveLevelSchedulerSettings(s);return s}
function loadSchedulerSettingsToUi(){const s=getLevelSchedulerSettings();const mode=document.getElementById('multi-mode'),runs=document.getElementById('multi-dungeon-runs'),rem=document.getElementById('multi-use-remaining'),dex=document.getElementById('multi-use-dungeon-exp');if(mode)mode.value=s.mode;if(runs)runs.value=s.dungeonRuns;if(rem)rem.checked=s.useRemainingToday;if(dex)dex.checked=s.includeDungeonExp}

window.addEventListener('DOMContentLoaded',()=>{
  renderLevelJobs();loadSchedulerSettingsToUi();renderMultiSummary();
  document.getElementById('add-level-job')?.addEventListener('click',addLevelJob);
  document.getElementById('calc-multi-level')?.addEventListener('click',()=>{syncSchedulerSettingsFromUi();renderMultiSchedule()});
  document.querySelectorAll('#multi-mode,#multi-dungeon-runs,#multi-use-remaining,#multi-use-dungeon-exp').forEach(x=>x.addEventListener('change',syncSchedulerSettingsFromUi));
  document.getElementById('refresh-dungeon-exp')?.addEventListener('click',()=>loadDungeonExpCatalog(true));
  loadDungeonExpCatalog(false)
});
window.renderLevelScheduler=()=>{renderLevelJobs();loadSchedulerSettingsToUi();renderMultiSummary();renderDungeonPreview()};
