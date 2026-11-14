/* Section folding v1 (phones): the page is one long scroll, and on a 390px screen it ran to about ten
   screens. Reference sections start folded there and every section heading folds on tap; the four
   per-ship build cards become one swipeable row (CSS only). Presentation only: nothing is removed
   from the DOM, no fleet data is read or written, and wider screens are never folded. */
(function(){
  'use strict';
  const KEY='ff14_sub_folded';
  const DEFAULT_FOLDED=['sector-panel','routes-panel'];
  const phone=window.matchMedia?window.matchMedia('(max-width: 740px)'):null;
  if(!phone)return;
  const panels=[...document.querySelectorAll('main > section.panel[id]')];
  if(!panels.length)return;
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch{saved={}}
  const store=()=>{try{localStorage.setItem(KEY,JSON.stringify(saved))}catch{}};
  const entries=new Map();
  const isFolded=panel=>panel.classList.contains('is-folded');
  function apply(panel,folded,remember){
    const entry=entries.get(panel);if(!entry)return;
    const opening=!folded&&isFolded(panel);
    panel.classList.toggle('is-folded',folded);
    if(opening){panel.classList.add('fold-opening');window.setTimeout(()=>panel.classList.remove('fold-opening'),320)}
    entry.button.setAttribute('aria-expanded',String(!folded));
    entry.button.setAttribute('aria-label',(folded?'展開':'收合')+'「'+entry.title+'」');
    entry.button.title=folded?'展開':'收合';
    if(remember){saved[panel.id]=folded;store()}
    window.dispatchEvent(new CustomEvent('submarine-fold-changed',{detail:{id:panel.id,folded}}));
  }
  // Opening is never remembered when the page itself asked for it (a link, a jump, a search hit):
  // only the person's own tap on the heading changes what the next visit looks like.
  const reveal=node=>{const panel=node&&node.closest&&node.closest('section.panel.is-folded');if(panel&&entries.has(panel))apply(panel,false,false)};
  panels.forEach(panel=>{
    const heading=panel.querySelector(':scope > h2, :scope > .section-title h2');
    if(!heading)return;
    const head=heading.closest('.section-title')||heading;
    const button=document.createElement('button');
    button.type='button';button.className='fold-toggle';
    button.innerHTML='<span aria-hidden="true"></span>';
    head.classList.add('fold-head');
    head.insertAdjacentElement('afterend',button);
    entries.set(panel,{button,head,title:heading.textContent.replace(/^[^\p{L}\p{N}]+/u,'').trim()});
    const folded=panel.id in saved?Boolean(saved[panel.id]):DEFAULT_FOLDED.includes(panel.id);
    apply(panel,folded,false);
    button.addEventListener('click',()=>apply(panel,!isFolded(panel),true));
    // The whole heading row is the tap target on phones (controls inside it keep working).
    head.addEventListener('click',event=>{
      if(!phone.matches||event.target.closest('button,a,input,select,label,summary'))return;
      apply(panel,!isFolded(panel),true);
    });
  });
  // Anything that points into a folded section opens it first.
  function revealHash(){
    let target=null;
    try{target=location.hash.length>1?document.getElementById(decodeURIComponent(location.hash.slice(1))):null}catch{}
    if(target)reveal(target.matches('section.panel')?target.firstElementChild:target);
  }
  document.addEventListener('click',event=>{
    const link=event.target.closest&&event.target.closest('a[href^="#"]');
    if(!link)return;
    let target=null;
    try{target=document.getElementById(decodeURIComponent(link.getAttribute('href').slice(1)))}catch{}
    if(target)reveal(target.matches('section.panel')?target.firstElementChild:target);
  },true);
  window.addEventListener('hashchange',revealHash);
  document.addEventListener('focusin',event=>{if(!event.target.closest('.fold-toggle,.fold-head'))reveal(event.target)});
  const nativeScroll=Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView=function(){
    reveal(this.matches&&this.matches('section.panel')?this.firstElementChild:this);
    return nativeScroll.apply(this,arguments);
  };
  window.addEventListener('beforeprint',()=>panels.forEach(panel=>{if(isFolded(panel))apply(panel,false,false)}));
  revealHash();
  document.documentElement.classList.add('fold-ready');
  window.SubmarineFold={folded:()=>panels.filter(isFolded).map(panel=>panel.id),set:(id,folded)=>{const panel=document.getElementById(id);if(panel)apply(panel,Boolean(folded),false)}};
})();
