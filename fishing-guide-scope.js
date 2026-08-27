// Fishing guide scope controller: scope fish methods to a selected map/spot and keep shopping optional.
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

  function setShoppingOpen(open){
    const root=document.getElementById('fishing'),btn=document.getElementById('fish-shopping-toggle');
    root?.classList.toggle('fish-shopping-open',!!open);
    if(btn){btn.setAttribute('aria-expanded',open?'true':'false');btn.textContent=open?'收起採買清單':'展開採買清單'}
    if(open&&isActive()&&typeof window.renderFishingGuide==='function')window.renderFishingGuide();
  }

  function ensureShoppingToggle(){
    const required=document.getElementById('fish-bait-only-required'),toolbar=required?.closest('.bait-toolbar');
    if(!toolbar)return;
    toolbar.classList.add('fish-shopping-toolbar');
    let btn=document.getElementById('fish-shopping-toggle');
    if(!btn){
      btn=document.createElement('button');btn.type='button';btn.id='fish-shopping-toggle';btn.className='fish-shopping-toggle';btn.setAttribute('aria-controls','fish-bait-summary fish-bait-list fish-vendor-plan');
      toolbar.prepend(btn);btn.addEventListener('click',()=>setShoppingOpen(!document.getElementById('fishing')?.classList.contains('fish-shopping-open')));
    }
    setShoppingOpen(false);
  }

  function addEarlyStyle(){
    if(document.getElementById('fish-guide-scope-style'))return;
    const style=document.createElement('style');
    style.id='fish-guide-scope-style';
    style.textContent=`
      #fishing:not(.fish-guide-scope-active) #fish-catalog .fish-method{display:none!important}
      #fishing:not(.fish-shopping-open) #fish-bait-summary,
      #fishing:not(.fish-shopping-open) #fish-bait-list,
      #fishing:not(.fish-shopping-open) #fish-vendor-plan,
      #fishing:not(.fish-shopping-open) .fish-method-source{display:none!important}
      #fishing:not(.fish-shopping-open) .fish-shopping-toolbar>:not(#fish-shopping-toggle){display:none!important}
      .fish-shopping-toolbar{align-items:center}.fish-shopping-toggle{min-height:36px}
    `;
    document.head.appendChild(style);
  }

  function init(){
    const root=document.getElementById('fishing');if(!root)return;
    bindPicker();ensureShoppingToggle();schedule(0);
  }

  addEarlyStyle();
  window.refreshFishingGuideScope=renderScoped;
  window.toggleFishingShopping=open=>setShoppingOpen(open===undefined?!document.getElementById('fishing')?.classList.contains('fish-shopping-open'):!!open);
  window.addEventListener('DOMContentLoaded',init);
})();
