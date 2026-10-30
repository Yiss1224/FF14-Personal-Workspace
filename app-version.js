// 在頁首顯示目前載入的版本（version.js），並向伺服器確認是否已有更新的部署（version.json）。
(()=>{
  const loaded=window.FF14_BUILD||{};
  const fmt=build=>{
    if(!build.short)return '版本：未標記（本機或尚未部署）';
    const parts=[build.pr?`#${build.pr}`:null,build.short];
    const t=new Date(build.time);
    if(!isNaN(t))parts.push(`${t.getMonth()+1}/${t.getDate()} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`);
    return '版本 '+parts.filter(Boolean).join(' · ');
  };
  const style=document.createElement('style');
  style.textContent='.app-version{display:block;margin-top:6px;font-size:12px;line-height:1.4;opacity:.62;font-variant-numeric:tabular-nums}.app-version a{color:inherit;text-decoration:underline;cursor:pointer}.app-version .app-version-new{opacity:1;font-weight:700;color:#ffd479}';
  document.head.appendChild(style);
  const el=document.createElement('small');
  el.className='app-version';
  el.textContent=fmt(loaded);
  if(loaded.sha)el.title=`commit ${loaded.sha}`;
  const host=document.querySelector('header .header-copy')||document.querySelector('header > div')||document.querySelector('header');
  if(host)host.appendChild(el);
  let notified=false;
  const check=async()=>{
    if(notified||!loaded.sha)return;
    try{
      const res=await fetch(`version.json?t=${Date.now()}`,{cache:'no-store'});
      if(!res.ok)return;
      const live=await res.json();
      if(!live.sha||live.sha===loaded.sha)return;
      notified=true;
      const note=document.createElement('span');
      note.className='app-version-new';
      note.append(` · 已有新版本 ${live.pr?'#'+live.pr:live.short}，`);
      const link=document.createElement('a');
      link.textContent='重新整理';
      link.addEventListener('click',()=>location.reload());
      note.append(link);
      el.append(note);
    }catch{}
  };
  check();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});
})();
