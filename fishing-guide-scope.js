// Fishing guide scope controller: keep bait/method recommendations off until a map or spot is selected.
(function(){
  'use strict';

  let observer=null,timer=null,lastActive=null;

  function pickerValue(id){return String(document.getElementById(id)?.value||'').trim()}
  function isActive(){return !!(pickerValue('fish-picker-zone')||pickerValue('fish-picker-spot'))}
  function statusText(){return '先選地圖或釣點，再自動顯示該範圍的魚餌／釣法。'}

  function clearGuide(){
    document.querySelectorAll('#fish-catalog .fish-method').forEach(x=>x.remove());
    const baitSummary=document.getElementById('fish-bait-summary');if(baitSummary)baitSummary.innerHTML=`<span class="muted">${statusText()}</span>`;
    const baitList=document.getElementById('fish-bait-list');if(baitList)baitList.innerHTML='';
    const vendor=document.getElementById('fish-vendor-plan');if(vendor)vendor.innerHTML='';
    const route=document.getElementById('fish-route-result');if(route)route.innerHTML=`<span class="muted">${statusText()}</span>`;
  }

  function renderScoped(){
    const active=isActive();
    document.getElementById('fishing')?.classList.toggle('fish-guide-scope-active',active);
    if(!active){clearGuide();lastActive=false;return}
    if(typeof window.renderFishingGuide==='function')window.renderFishingGuide();
    lastActive=true;
  }

  function schedule(delay=40){clearTimeout(timer);timer=setTimeout(renderScoped,delay)}

  function bindPicker(){
    for(const id of ['fish-picker-region','fish-picker-zone','fish-picker-spot']){
      const el=document.getElementById(id);if(el&&!el.dataset.guideScopeBound){el.dataset.guideScopeBound='1';el.addEventListener('change',()=>schedule(20))}
    }
  }

  function init(){
    const root=document.getElementById('fishing');if(!root)return;
    const style=document.createElement('style');style.id='fish-guide-scope-style';style.textContent=`
      #fishing:not(.fish-guide-scope-active) #fish-catalog .fish-method{display:none!important}
    `;document.head.appendChild(style);
    observer=new MutationObserver(()=>{bindPicker();if(!isActive())clearGuide();else if(lastActive!==true)schedule(30)});
    observer.observe(root,{childList:true,subtree:true});
    bindPicker();
    schedule(0);
  }

  window.refreshFishingGuideScope=renderScoped;
  window.addEventListener('DOMContentLoaded',init);
})();
