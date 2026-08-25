// Recovery layer for the leveling page. Keeps one bad saved row from disabling the whole module.
(function(){
  'use strict';

  function readJson(key,def){try{return JSON.parse(localStorage.getItem(key)||'null')??def}catch{return def}}
  function writeJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch(e){console.error('leveling save failed',e)}}
  function uid(){return 'j'+Math.random().toString(36).slice(2,9)}

  function sanitizeJobs(){
    const raw=readJson('levelJobs',[]);
    const rows=(Array.isArray(raw)?raw:[]).filter(x=>x&&typeof x==='object').map(j=>({
      id:String(j.id||uid()),
      name:String(j.name||''),
      role:['tank','healer','dps'].includes(j.role)?j.role:'dps',
      level:Math.max(1,Math.min(99,Number(j.level)||1)),
      exp:Math.max(0,Number(j.exp)||0),
      target:Math.max(2,Math.min(100,Number(j.target)||100)),
      armoury:j.armoury!==false,
      queueMin:Math.max(0,Number(j.queueMin)||0)
    }));
    if(!rows.length)rows.push({id:uid(),name:'MNK',role:'dps',level:65,exp:0,target:71,armoury:true,queueMin:10});
    writeJson('levelJobs',rows);
    return rows;
  }

  function safeRenderJobs(){
    sanitizeJobs();
    try{if(typeof window.renderLevelJobs==='function')window.renderLevelJobs()}
    catch(e){console.error('level job render failed',e)}
  }

  function robustAddJob(){
    const rows=sanitizeJobs();
    rows.push({id:uid(),name:'',role:'dps',level:1,exp:0,target:100,armoury:true,queueMin:10});
    writeJson('levelJobs',rows);
    safeRenderJobs();
  }

  async function robustLoadDungeonExp(force=false){
    const status=document.getElementById('dungeon-exp-status');
    try{
      if(typeof window.loadDungeonExpCatalog!=='function')throw new Error('leveling.js 尚未就緒');
      await window.loadDungeonExpCatalog(force);
    }catch(e){
      console.error('dungeon EXP recovery failed',e);
      if(status)status.textContent=`副本 EXP 讀取失敗：${e.message}`;
    }
  }

  // Override the cloud rerender hook with a version that cannot die on malformed jobs.
  window.renderLevelScheduler=function(){
    safeRenderJobs();
    try{if(typeof loadSchedulerSettingsToUi==='function')loadSchedulerSettingsToUi()}catch(e){console.error(e)}
    try{if(typeof renderMultiSummary==='function')renderMultiSummary()}catch(e){console.error(e)}
    try{if(typeof renderDungeonPreview==='function')renderDungeonPreview()}catch(e){console.error(e)}
  };

  window.addEventListener('DOMContentLoaded',()=>{
    safeRenderJobs();

    // Capture phase makes these controls work even if leveling.js's own DOMContentLoaded
    // handler aborted before it could attach listeners. Stop the old listener to avoid doubles.
    document.addEventListener('click',e=>{
      const add=e.target.closest?.('#add-level-job');
      if(add){e.preventDefault();e.stopImmediatePropagation();robustAddJob();return}
      const refresh=e.target.closest?.('#refresh-dungeon-exp');
      if(refresh){e.preventDefault();e.stopImmediatePropagation();robustLoadDungeonExp(true)}
    },true);

    // Retry the automatic dungeon EXP load independently of the original init sequence.
    setTimeout(()=>robustLoadDungeonExp(false),100);
  });
})();
