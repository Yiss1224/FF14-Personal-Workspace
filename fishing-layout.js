// 釣魚頁版面：第一次使用引導、「更多找釣場工具」只在有內容時顯示。
// 「今天釣什麼」與「一般魚剩最多的地圖」由各自的腳本直接放進 #fish-today-slot／#fish-more-tools-body。
(function(){
  'use strict';
  const KEY='fishOnboardingDismissed';
  const $=id=>document.getElementById(id);
  let forceOpen=false;

  function known(){try{return typeof getCaughtIds==='function'?getCaughtIds().length:0}catch{return 0}}
  function dismissed(){try{return localStorage.getItem(KEY)==='1'}catch{return false}}
  function setDismissed(v){try{if(v)localStorage.setItem(KEY,'1');else localStorage.removeItem(KEY)}catch{}}
  function update(){const box=$('fish-onboarding');if(box)box.hidden=!(forceOpen||(!dismissed()&&known()===0))}
  function scrollToEl(el){if(el)el.scrollIntoView({behavior:'smooth',block:'start'})}

  function init(){
    const box=$('fish-onboarding');
    if(box){
      $('fish-onboard-close')?.addEventListener('click',()=>{forceOpen=false;setDismissed(true);update()});
      $('fish-onboard-open')?.addEventListener('click',()=>{forceOpen=true;setDismissed(false);update();scrollToEl(box)});
      box.addEventListener('click',e=>{
        const b=e.target.closest('[data-fish-onboard]');if(!b)return;
        const act=b.dataset.fishOnboard;
        if(act==='import')$('import-fishcake')?.click();
        else if(act==='today')scrollToEl(document.querySelector('.fish-today-card')||$('fish-today-slot'));
        else if(act==='map')scrollToEl($('fish-explore-title')?.closest('.section-head'));
      });
      const res=$('fish-result');if(res)new MutationObserver(update).observe(res,{childList:true});
      window.addEventListener('ff14-data-restored',update);
      update();
    }
    const body=$('fish-more-tools-body'),more=$('fish-more-tools');
    if(body&&more){const sync=()=>{more.hidden=!body.children.length};new MutationObserver(sync).observe(body,{childList:true});sync()}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
