// Prevent one broken UI renderer from leaving cloud sync stuck in "loading" forever.
(function(){
  'use strict';

  function safeCall(name){
    try{
      const fn=window[name];
      if(typeof fn==='function')fn();
      return true;
    }catch(e){
      console.error(`cloud rerender failed: ${name}`,e);
      return false;
    }
  }

  // Cloud state is shared by several independent panels. One panel must never
  // prevent the others from rendering or keep ff14Loading locked forever.
  rerenderCloudState=function(){
    safeCall('renderFF14All');
    safeCall('renderLevelScheduler');
    safeCall('renderTonightPlanner');
    safeCall('renderFishingGuide');
  };

  cloudLoad=async function(){
    const c=ensureClient();
    if(!ff14User||ff14Loading)return;

    ff14Loading=true;
    syncStatus('讀取雲端…');
    let seedCloud=false;

    try{
      const {data,error}=await c.from('user_workspace_state')
        .select('payload,updated_at')
        .eq('user_id',ff14User.id)
        .maybeSingle();

      if(error)throw error;

      if(data?.payload){
        applyCloudSnapshot(data.payload);
        const stamp=data.updated_at
          ? new Date(data.updated_at).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})
          : '';
        syncStatus(`雲端已載入 ${stamp}`);
      }else{
        seedCloud=true;
      }
    }catch(e){
      console.error('cloud load failed',e);
      syncStatus('讀取失敗');
    }finally{
      // Critical: never let a renderer/network exception permanently lock sync.
      ff14Loading=false;
    }

    if(seedCloud){
      try{await cloudSave()}catch(e){
        console.error('initial cloud save failed',e);
        syncStatus('同步失敗');
      }
    }
  };
})();
