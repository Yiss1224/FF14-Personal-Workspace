const TONIGHT_DEFAULTS={
  minutes:120,
  mode:'balanced',
  focusJobId:'',
  fishPerHour:10,
  extraDungeonLimit:2,
  dungeonMinutes:20,
  activities:{
    leveling:{minutes:20,willingness:100},
    msq:{minutes:20,willingness:70},
    alliance:{minutes:30,willingness:80},
    normal:{minutes:12,willingness:90},
    trial:{minutes:12,willingness:90},
    frontline:{minutes:20,willingness:55}
  }
};

function tonightSettings(){
  const saved=store.get('tonightSettings',{})||{};
  const activities={...TONIGHT_DEFAULTS.activities,...(saved.activities||{})};
  if(Number(activities.msq?.minutes)===35)activities.msq={...activities.msq,minutes:20};
  return {...TONIGHT_DEFAULTS,...saved,activities}
}
function saveTonightSettings(s){store.set('tonightSettings',s)}
function tonightJobs(){return getLevelJobs().map(normalizeLevelJob).filter(j=>j.name&&j.level<j.target)}
function tonightFocusJob(settings){
  const jobs=tonightJobs();
  return jobs.find(j=>j.id===settings.focusJobId)||jobs[0]||null
}
function pctOfCurrentLevel(job,gain){const need=levelNeed(job.level);return need?gain/need*100:0}
function activityDuration(roulette,job,settings){
  const cfg=settings.activities?.[roulette.id]||{minutes:20,willingness:100};
  return {active:Math.max(1,Number(cfg.minutes)||20),queue:Math.max(0,Number(job.queueMin)||0),willingness:Math.max(0,Math.min(100,Number(cfg.willingness)||0))}
}
function remainingRouletteActivities(){
  const done=typeof dailyState==='function'?dailyState():{items:{}};
  return getRoulettes().filter(r=>r.enabled&&!done.items?.[r.id])
}
function makeRouletteCandidate(r,job,settings){
  const dur=activityDuration(r,job,settings),pct=typeof roulettePctAtLevel==='function'?roulettePctAtLevel(r,job.level):Math.max(0,Number(r.pct)||0),gain=levelNeed(job.level)*(pct/100),barPct=pctOfCurrentLevel(job,gain),total=dur.active+dur.queue;
  return {id:'roulette:'+r.id,kind:'roulette',name:r.name,job:job.name,jobId:job.id,gain,barPct,activeMin:dur.active,queueMin:dur.queue,totalMin:total,willingness:dur.willingness,repeatable:false,source:r,pct}
}
function makeDungeonCandidate(job,settings,index=0){
  const d=bestDungeonForLevel(job.level);if(!d)return null;
  const gain=dungeonGainForJob(job,d),active=Math.max(5,Number(settings.dungeonMinutes)||20),queue=Math.max(0,Number(job.queueMin)||0),barPct=pctOfCurrentLevel(job,gain);
  return {id:'dungeon:'+index,kind:'dungeon',name:d.name,job:job.name,jobId:job.id,gain,barPct,activeMin:active,queueMin:queue,totalMin:active+queue,willingness:85,repeatable:true,source:d}
}
function tonightCandidateDisplayName(c){
  if(c?.kind==='dungeon'&&typeof dungeonDisplayName==='function')return dungeonDisplayName(c.name);
  return c?.name||''
}
function candidateScore(c,mode){
  const efficiency=c.totalMin>0?c.barPct/c.totalMin:0;
  if(mode==='grind')return efficiency*1.15+c.barPct/100;
  if(mode==='chill'){
    if(c.willingness<65||c.totalMin>45)return -1;
    return efficiency*(0.5+c.willingness/100)*1.25;
  }
  return efficiency*(0.65+c.willingness/200)
}
function buildTonightCandidates(job,settings){
  const out=remainingRouletteActivities().map(r=>makeRouletteCandidate(r,job,settings));
  const limit=Math.max(0,Math.min(20,Number(settings.extraDungeonLimit)||0));
  for(let i=0;i<limit;i++){const d=makeDungeonCandidate(job,settings,i);if(d)out.push(d)}
  return out
}
function simulateTonight(){
  const settings=tonightSettings(),job=tonightFocusJob(settings);
  if(!job)return {error:'先在多職業排程新增至少一個尚未達標的職業。'};
  let remaining=Math.max(10,Number(settings.minutes)||120),queueFishing=0,totalGain=0,totalBar=0;
  const candidates=buildTonightCandidates(job,settings).map(c=>({...c,score:candidateScore(c,settings.mode)})).filter(c=>c.score>=0).sort((a,b)=>b.score-a.score||b.barPct-a.barPct);
  const picked=[],skipped=[];
  for(const c of candidates){
    if(c.totalMin<=remaining){picked.push(c);remaining-=c.totalMin;queueFishing+=c.queueMin;totalGain+=c.gain;totalBar+=c.barPct}else skipped.push(c)
  }
  const fishPerHour=Math.max(0,Number(settings.fishPerHour)||0),fishEstimate=queueFishing/60*fishPerHour;
  return {settings,job,candidates,picked,skipped,remaining,queueFishing,totalGain,totalBar,fishEstimate}
}
function modeLabel(mode){return mode==='chill'?'今天只想混':mode==='grind'?'今天要肝':'平衡'}
function renderTonightActivitySettings(){
  const box=document.getElementById('tonight-activity-settings');if(!box)return;
  const settings=tonightSettings(),roulettes=getRoulettes();
  box.innerHTML=roulettes.map(r=>{const a=settings.activities[r.id]||{minutes:20,willingness:100};return `<div class="tonight-setting-row"><strong>${lvlEsc(r.name)}</strong><label>本體 min<input class="ta-min" data-id="${r.id}" type="number" min="5" max="120" value="${Number(a.minutes)||20}"></label><label>想打程度<input class="ta-will" data-id="${r.id}" type="number" min="0" max="100" step="5" value="${Number(a.willingness)||0}"></label></div>`}).join('');
  box.querySelectorAll('input').forEach(x=>x.onchange=()=>{const s=tonightSettings(),id=x.dataset.id;s.activities[id]={...(s.activities[id]||{})};if(x.classList.contains('ta-min'))s.activities[id].minutes=Math.max(5,+x.value||20);else s.activities[id].willingness=Math.max(0,Math.min(100,+x.value||0));saveTonightSettings(s)})
}
function renderTonightJobOptions(){
  const sel=document.getElementById('tonight-focus-job');if(!sel)return;const settings=tonightSettings(),jobs=tonightJobs();
  sel.innerHTML=jobs.map(j=>`<option value="${lvlEsc(j.id)}" ${j.id===settings.focusJobId?'selected':''}>${lvlEsc(j.name)} Lv${j.level} → ${j.target} · ${LEVEL_ROLE_LABELS[j.role]}</option>`).join('')||'<option value="">沒有可練職業</option>';
  if(!settings.focusJobId&&jobs[0]){settings.focusJobId=jobs[0].id;saveTonightSettings(settings);sel.value=jobs[0].id}
}
function loadTonightUi(){
  const s=tonightSettings();
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v};
  set('tonight-minutes',s.minutes);set('tonight-mode',s.mode);set('tonight-fish-rate',s.fishPerHour);set('tonight-dungeon-limit',s.extraDungeonLimit);set('tonight-dungeon-minutes',s.dungeonMinutes);
  renderTonightJobOptions();renderTonightActivitySettings();renderTonightSummary()
}
function syncTonightUi(){
  const s=tonightSettings();
  s.minutes=Math.max(10,+document.getElementById('tonight-minutes')?.value||120);
  s.mode=document.getElementById('tonight-mode')?.value||'balanced';
  s.focusJobId=document.getElementById('tonight-focus-job')?.value||'';
  s.fishPerHour=Math.max(0,+document.getElementById('tonight-fish-rate')?.value||0);
  s.extraDungeonLimit=Math.max(0,+document.getElementById('tonight-dungeon-limit')?.value||0);
  s.dungeonMinutes=Math.max(5,+document.getElementById('tonight-dungeon-minutes')?.value||20);
  saveTonightSettings(s);return s
}
function renderTonightPlan(){
  syncTonightUi();const r=simulateTonight(),out=document.getElementById('tonight-result');if(!out)return;
  if(r.error){out.innerHTML=r.error;return}
  const rows=r.picked.map((c,i)=>`<tr><td>${i+1}</td><td>${c.kind==='roulette'?'🎲':'🏰'} ${lvlEsc(tonightCandidateDisplayName(c))}${c.kind==='roulette'&&c.name==='練等隨機'?` <span class="muted">(${Number(c.pct||0).toFixed(0)}%)</span>`:''}</td><td>${lvlEsc(c.job)}</td><td>${c.barPct.toFixed(1)}%</td><td>${c.activeMin}+${c.queueMin}</td><td>${(c.barPct/Math.max(1,c.totalMin)).toFixed(2)}%/min</td></tr>`).join('');
  const skip=r.skipped.slice(0,4).map(c=>`${lvlEsc(tonightCandidateDisplayName(c))}（還要 ${c.totalMin}m）`).join('、')||'—';
  out.innerHTML=`<div class="scenario-callout"><strong>${modeLabel(r.settings.mode)} · ${r.job.name}</strong><br>預算 ${r.settings.minutes} 分鐘；排入 ${r.picked.length} 項，剩 ${r.remaining} 分鐘。<br>預估推進約 <strong>${r.totalBar.toFixed(1)}% 經驗條</strong>（以各項執行當下等級估算）。</div><table><tr><th>#</th><th>內容</th><th>職業</th><th>約進度</th><th>本體+排隊</th><th>效率</th></tr>${rows||'<tr><td colspan="6">時間內沒有排入項目。</td></tr>'}</table><div class="scenario-callout">預估排隊時間共 <strong>${r.queueFishing} 分</strong>。若排隊都拿去釣魚，照 ${r.settings.fishPerHour} 種/小時估算，可處理約 <strong>${r.fishEstimate.toFixed(1)} 種</strong>。<br><span class="muted">塞不下的前幾項：${skip}</span></div>`;
  store.set('tonightPlan',{generatedAt:new Date().toISOString(),job:r.job.name,mode:r.settings.mode,minutes:r.settings.minutes,remaining:r.remaining,queueFishing:r.queueFishing,fishEstimate:r.fishEstimate,totalBar:r.totalBar,items:r.picked.map(c=>({kind:c.kind,name:tonightCandidateDisplayName(c),job:c.job,totalMin:c.totalMin,barPct:c.barPct}))});renderTonightSummary()
}
function renderTonightSummary(){
  const box=document.getElementById('tonight-summary');if(!box)return;const p=store.get('tonightPlan',null);
  box.innerHTML=p?`<strong>${lvlEsc(p.job)}</strong> · ${modeLabel(p.mode)}<br>${p.items?.length||0} 項 / ${p.minutes} 分鐘<br>約 ${Number(p.totalBar||0).toFixed(0)}% EXP條 · 排隊 ${p.queueFishing||0}m`:'尚未產生今晚排程'
}

window.addEventListener('DOMContentLoaded',()=>{
  loadTonightUi();
  document.getElementById('calc-tonight')?.addEventListener('click',renderTonightPlan);
  document.querySelectorAll('#tonight-minutes,#tonight-mode,#tonight-focus-job,#tonight-fish-rate,#tonight-dungeon-limit,#tonight-dungeon-minutes').forEach(x=>x.addEventListener('change',syncTonightUi));
});
window.renderTonightPlanner=()=>{loadTonightUi()};
