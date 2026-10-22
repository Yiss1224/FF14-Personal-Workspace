/* Bridge-styled replacements for window.confirm / window.alert, plus toasts with an undo action.
   SubDialog.confirm / alert return Promises; without <dialog> support they fall back to the native boxes. */
(function(){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let box=null,region=null,queue=Promise.resolve();
const supported=()=>typeof HTMLDialogElement==='function'&&typeof document.createElement('dialog').showModal==='function';
function ensureBox(){
 if(box)return box;
 box=document.createElement('dialog');
 box.id='sub-dialog';box.className='sub-dialog';
 box.setAttribute('aria-labelledby','sub-dialog-title');box.setAttribute('aria-describedby','sub-dialog-message');
 box.innerHTML='<form method="dialog" class="sub-dialog-shell">'
  +'<h2 id="sub-dialog-title"></h2><div id="sub-dialog-message" class="sub-dialog-message"></div>'
  +'<dl class="sub-dialog-details" hidden></dl>'
  +'<div class="sub-dialog-actions"><button type="submit" value="cancel" data-dialog-cancel>取消</button>'
  +'<button type="submit" value="ok" class="primary-action" data-dialog-ok>確認</button></div></form>';
 document.body.appendChild(box);
 return box;
}
// One dialog at a time; later requests wait for the open one to close.
function open({title,message,details,ok='確認',cancel='取消',danger=false,alertOnly=false}){
 const run=()=>new Promise(resolve=>{
  const d=ensureBox();
  d.querySelector('#sub-dialog-title').textContent=title||(alertOnly?'提示':'請確認');
  d.querySelector('#sub-dialog-message').innerHTML=String(message||'').split('\n').map(line=>'<p>'+esc(line)+'</p>').join('');
  const dl=d.querySelector('.sub-dialog-details'),rows=(details||[]).filter(r=>r&&r[1]!==undefined&&r[1]!=='');
  dl.innerHTML=rows.map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('');dl.hidden=!rows.length;
  const okBtn=d.querySelector('[data-dialog-ok]'),cancelBtn=d.querySelector('[data-dialog-cancel]');
  okBtn.textContent=ok;cancelBtn.textContent=cancel;cancelBtn.hidden=alertOnly;
  okBtn.classList.toggle('is-danger',danger);
  d.returnValue='';
  const done=()=>{d.removeEventListener('close',done);resolve(d.returnValue==='ok')};
  d.addEventListener('close',done);
  d.showModal();okBtn.focus();
 });
 const next=queue.then(run,run);queue=next.catch(()=>{});
 return next;
}
function confirmBox(opts){
 opts=typeof opts==='string'?{message:opts}:opts||{};
 if(!supported())return Promise.resolve(window.confirm([opts.title,opts.message].filter(Boolean).join('\n')));
 return open(opts);
}
function alertBox(opts){
 opts=typeof opts==='string'?{message:opts}:opts||{};
 if(!supported()){window.alert([opts.title,opts.message].filter(Boolean).join('\n'));return Promise.resolve(true)}
 return open({...opts,alertOnly:true,ok:opts.ok||'知道了'});
}
function ensureRegion(){
 if(region)return region;
 region=document.createElement('div');
 region.className='sub-toasts';region.setAttribute('role','status');region.setAttribute('aria-live','polite');
 document.body.appendChild(region);
 return region;
}
// toast('訊息',{action:{label:'復原',run(){…}},timeout:8000,tone:'success'|'error'})
function toast(message,opts={}){
 const host=ensureRegion(),node=document.createElement('div');
 node.className='sub-toast'+(opts.tone?' is-'+opts.tone:'');
 node.innerHTML='<span>'+esc(message)+'</span>';
 let timer=null;
 const close=()=>{if(timer)clearTimeout(timer);node.classList.add('is-leaving');setTimeout(()=>node.remove(),200)};
 if(opts.action){
  const btn=document.createElement('button');btn.type='button';btn.textContent=opts.action.label;
  btn.onclick=()=>{close();try{opts.action.run()}catch(e){console.error(e)}};
  node.appendChild(btn);
 }
 const x=document.createElement('button');x.type='button';x.className='sub-toast-close';x.setAttribute('aria-label','關閉通知');x.textContent='×';x.onclick=close;
 node.appendChild(x);
 host.appendChild(node);
 const ms=opts.timeout??(opts.action?8000:4500);
 const arm=()=>{timer=setTimeout(close,ms)};
 // Keep the toast while the pointer or focus is on it, so the undo button stays reachable.
 node.addEventListener('mouseenter',()=>{if(timer)clearTimeout(timer)});node.addEventListener('mouseleave',arm);
 node.addEventListener('focusin',()=>{if(timer)clearTimeout(timer)});node.addEventListener('focusout',arm);
 arm();
 return {close};
}
window.SubDialog={confirm:confirmBox,alert:alertBox,toast};
})();
