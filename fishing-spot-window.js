// Fishing spot window summaries: aggregate existing fish-window data onto each fishing-spot summary.
(function(){
  'use strict';

  let refreshToken=0,observerTimer=null;

  function idOf(v){return Number(v&&typeof v==='object'?(v.id??v.itemId??v.fishId):v)}
  function intSet(values){return new Set((values||[]).map(idOf).filter(Number.isFinite))}
  function caught(){
    try{if(typeof window.getCaughtIds==='function')return intSet(window.getCaughtIds())}catch{}
    try{return intSet([...(JSON.parse(localStorage.getItem('fishcakeCaughtIds')||'[]')||[]),...(JSON.parse(localStorage.getItem('fishCaughtIds')||'[]')||[])])}catch{return new Set()}
  }
  function skipped(){
    try{if(typeof window.getSkippedIds==='function')return intSet(window.getSkippedIds())}catch{}
    try{return intSet(JSON.parse(localStorage.getItem('fishSkippedIds')||'[]')||[])}catch{return new Set()}
  }
  function catalogMap(){
    try{return new Map((JSON.parse(localStorage.getItem('fishCatalog')||'[]')||[]).map(f=>[Number(f?.itemId),f]).filter(([id])=>Number.isFinite(id)&&id>0))}
    catch{return new Map()}
  }
  function itemIdFromRow(row){
    const href=row?.querySelector?.('a[href*="/fish/"]')?.getAttribute('href')||'',m=href.match(/\/fish\/(\d+)/);
    return m?Number(m[1]):0;
  }
  function fmtDuration(ms){
    if(!Number.isFinite(ms)||ms<0)return'—';
    const min=Math.max(0,Math.round(ms/60000));
    if(min<60)return`${min} 分`;
    const h=Math.floor(min/60),m=min%60;
    return m?`${h} 小時 ${m} 分`:`${h} 小時`;
  }
  function ensureStyle(){
    if(document.getElementById('fish-spot-window-style'))return;
    const style=document.createElement('style');style.id='fish-spot-window-style';style.textContent=`
      .fish-spot-window-summary{margin-left:auto;display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap;background:rgba(127,127,127,.10)}
      .fish-spot-window-summary.current{background:rgba(52,168,83,.13)}
      .fish-spot-window-summary.soon{background:rgba(245,166,35,.13)}
      .fish-spot-window-summary.none{opacity:.62;font-weight:600}
      @media(max-width:700px){.fish-spot-window-summary{margin-left:0;flex-basis:auto;max-width:100%;white-space:normal}}
    `;document.head.appendChild(style);
  }
  function setSummary(details,text,state='none'){
    const summary=details?.querySelector?.(':scope > summary');if(!summary)return;
    let el=summary.querySelector('.fish-spot-window-summary');
    if(!el){el=document.createElement('span');el.className='fish-spot-window-summary';summary.appendChild(el)}
    el.className=`fish-spot-window-summary ${state}`;
    if(el.textContent!==text)el.textContent=text;
  }

  async function refresh(){
    if(typeof window.ff14FishingWindowInfo!=='function')return;
    const token=++refreshToken,done=caught(),skip=skipped(),byId=catalogMap(),hideBig=!!document.getElementById('fish-hide-big')?.checked,now=Date.now();
    const spots=[...document.querySelectorAll('#fish-catalog details.spot')];
    for(const details of spots){
      if(token!==refreshToken)return;
      const ids=[...new Set([...details.querySelectorAll('.fish-row')].map(itemIdFromRow).filter(id=>id>0&&!done.has(id)&&!skip.has(id)&&!(hideBig&&byId.get(id)?.bigFish)))];
      if(!ids.length){setSummary(details,'⚪ 無待處理窗口魚','none');continue}
      const infos=(await Promise.all(ids.map(async id=>({id,info:await window.ff14FishingWindowInfo(id,now)})))).filter(x=>x.info?.restricted);
      if(token!==refreshToken)return;
      if(!infos.length){setSummary(details,'⚪ 無窗口魚','none');continue}
      const current=infos.filter(x=>x.info.current),future=infos.filter(x=>!x.info.current&&x.info.next).sort((a,b)=>(a.info.waitMs??Infinity)-(b.info.waitMs??Infinity));
      if(current.length){
        const close=Math.min(...current.map(x=>Number(x.info.currentLeftMs)).filter(Number.isFinite));
        let text=`🟢 ${current.length} 條開窗`;
        if(Number.isFinite(close))text+=` · 最快 ${fmtDuration(close)}後關`;
        if(future.length)text+=` · ⏳ ${fmtDuration(future[0].info.waitMs)}後`;
        setSummary(details,text,'current');
      }else if(future.length){
        setSummary(details,`⏳ ${fmtDuration(future[0].info.waitMs)}後開窗`,'soon');
      }else setSummary(details,'⚪ 暫無未來窗口','none');
    }
  }

  function schedule(){clearTimeout(observerTimer);observerTimer=setTimeout(refresh,100)}
  function init(){
    ensureStyle();
    const root=document.getElementById('fish-catalog');if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
    for(const id of ['fish-hide-big','fish-only-missing','fish-hide-skipped','fish-search','fish-picker-region','fish-picker-zone','fish-picker-spot'])document.getElementById(id)?.addEventListener('change',schedule);
    document.getElementById('fish-search')?.addEventListener('input',schedule);
    schedule();
    setInterval(()=>{if(document.getElementById('fishing')?.classList.contains('active'))refresh()},15000);
  }
  window.refreshFishingSpotWindows=refresh;
  window.addEventListener('DOMContentLoaded',init);
})();