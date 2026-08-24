// Small compatibility guard for the first multi-job build: empty placeholder rows are UI-only.
const _renderMultiScheduleBase=renderMultiSchedule;
renderMultiSchedule=function(){
  const raw=getLevelJobs();
  const filled=raw.filter(j=>String(j?.name||'').trim());
  if(filled.length!==raw.length){saveLevelJobs(filled.length?filled:[{id:lvlUid(),name:'MNK',role:'dps',level:65,exp:0,target:71,armoury:true,queueMin:10}]);renderLevelJobs()}
  return _renderMultiScheduleBase()
};
window.addEventListener('DOMContentLoaded',()=>{
  const raw=getLevelJobs(),filled=raw.filter(j=>String(j?.name||'').trim());
  if(filled.length!==raw.length){saveLevelJobs(filled.length?filled:[{id:lvlUid(),name:'MNK',role:'dps',level:65,exp:0,target:71,armoury:true,queueMin:10}]);renderLevelJobs()}
});
