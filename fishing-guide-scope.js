// Fishing guide scope controller: keep bait/method recommendations off until a map or spot is selected.
(function(){
  'use strict';

  let timer=null;

  function pickerValue(id){return String(document.getElementById(id)?.value||'').trim()}
  function isActive(){return !!(pickerValue('fish-picker-zone')||pickerValue('fish-picker-spot'))}
  function statusText(){return '先選地圖或釣點，再自動顯示該範圍的魚餌／釣法。'}
  function setHtmlIfChanged(el,html){if(el&&el.innerHTML!==html)el.innerHTML=html}

  function clearGuide(){
    document.querySelectorAll('#fish-catalog .fish-method').forEach(x=>x.remove());
    const hint=`<span class="muted">${statusText()}</span>`;
    setHtmlIfChanged(document.getElementById('fish-bait-summary'),hint);
    setHtmlIfChanged(document.getElementById('fish-bait-list'),'');
    setHtmlIfChanged(document.getElementById('fish-vendor-plan'),'');
    setHtmlIfChanged(document.getElementById('fish-route-result'),hint);
  }

  function renderScoped(){
    const active=isActive();
    document.getElementById('fishing')?.classList.toggle('fish-guide-scope-active',active);
    if(!active){clearGuide();return}
    if(typeof window.renderFishingGuide==='function')window.renderFishingGuide();
  }

  function schedule(delay=40){clearTimeout(timer);timer=setTimeout(renderScoped,delay)}

  function bindPicker(){
    for(const id of ['fish-picker-region','fish-picker-zone','fish-picker-spot']){
      const el=document.getElementById(id);
      if(el&&!el.dataset.guideScopeBound){
        el.dataset.guideScopeBound='1';
        el.addEventListener('change',()=>schedule(20));
      }
    }
  }

  function init(){
    const root=document.getElementById('fishing');if(!root)return;
    if(!document.getElementById('fish-guide-scope-style')){
      const style=document.createElement('style');style.id='fish-guide-scope-style';style.textContent=`
        #fishing:not(.fish-guide-scope-active) #fish-catalog .fish-method{display:none!important}
      `;document.head.appendChild(style);
    }
    // Picker is created by fishing-ui-v2 before this DOMContentLoaded listener runs.
    // Do not observe the whole fishing subtree: clearGuide() changes that subtree itself
    // and would recursively wake a MutationObserver until the page becomes unresponsive.
    bindPicker();
    schedule(0);
  }

  window.refreshFishingGuideScope=renderScoped;
  window.addEventListener('DOMContentLoaded',init);
})();
