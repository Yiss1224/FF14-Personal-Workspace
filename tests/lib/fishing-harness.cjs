// 釣魚頁測試共用工具：起本機靜態伺服器、用假世界回應所有外部請求、把時間固定住、擷取畫面快照。
'use strict';
const http=require('http'),fs=require('fs'),path=require('path');
function loadPlaywright(){for(const id of ['playwright','/opt/node22/lib/node_modules/playwright']){try{return require(id)}catch(e){}}throw new Error('playwright missing')}
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg'};

function serve(root){
  root=path.resolve(root);
  const server=http.createServer((req,res)=>{
    const file=path.join(root,decodeURIComponent(new URL(req.url,'http://x').pathname));
    if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return}
    res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r=>server.listen(0,'127.0.0.1',()=>r({server,base:`http://127.0.0.1:${server.address().port}`})));
}
const launch=()=>loadPlaywright().chromium.launch({args:['--no-proxy-server']});

// 頁面內：把 Date 固定在 T0（計時器照常跑），並在第一次載入前放進指定的 localStorage。
function initScript({T0,storage}){
  const RealDate=Date;
  class FrozenDate extends RealDate{constructor(...a){if(a.length)super(...a);else super(T0)}static now(){return T0}}
  window.Date=FrozenDate;
  // 亂數也固定（練等分頁會用亂數產生職業 id）。
  let seed=20261114;Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  try{
    if(storage&&!localStorage.getItem('__fishingTestSeeded')){
      for(const[k,v]of Object.entries(storage))localStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v));
      localStorage.setItem('__fishingTestSeeded','1');
    }
  }catch{}
}

// options: world（假世界模組）、url、viewport、storage（預先放進 localStorage 的資料）、
//          fail（RegExp：符合的外部請求一律連不上）、delay（外部回應延遲毫秒）
async function open(browser,base,options={}){
  const{world,url='/index.html',viewport={width:1280,height:900},storage=null,delay=0}=options;
  const ctx=await browser.newContext({viewport,locale:'zh-TW',timezoneId:'Asia/Taipei',acceptDownloads:true});
  const page=await ctx.newPage(),state={fail:options.fail||null,requests:[],errors:[],unknown:[]};
  await page.addInitScript(initScript,{T0:world.T0,storage});
  page.on('pageerror',e=>state.errors.push(String(e&&e.message||e)));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,async route=>{
    const raw=route.request().url(),u=new URL(raw);
    state.requests.push(u.host+u.pathname+u.search);
    if(state.fail&&state.fail.test(raw))return route.abort();
    const hit=world.respond(raw);
    if(!hit){if(!/ContentFinderCondition|consolegameswiki/.test(raw))state.unknown.push(raw);return route.abort()}
    if(delay)await new Promise(r=>setTimeout(r,delay));
    return route.fulfill({status:hit.status,contentType:hit.contentType,body:hit.body,headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto(base+url);
  return{ctx,page,state};
}

// 頁面內執行：回傳目前畫面的快照。html 給重構時逐字比對，text／controls／storage 給 CI 的回歸基準。
function snapshotInPage(roots){
  const collapse=s=>String(s||'').replace(/\s+/g,' ').trim();
  function cleanHtml(el){
    const c=el.cloneNode(true);
    for(const n of [c,...c.querySelectorAll('*')]){
      // 另一串的動態效果只會加 fx- 開頭的 class 與 --fx- 開頭的變數，不算畫面內容。
      if(n.classList){for(const k of [...n.classList])if(k.startsWith('fx-'))n.classList.remove(k);if(!n.classList.length)n.removeAttribute('class')}
      if(n.style){for(const p of [...n.style])if(p.startsWith('--fx-'))n.style.removeProperty(p);if(!n.getAttribute('style'))n.removeAttribute('style')}
    }
    // 路線描線動畫的進度跟實際經過時間有關，不是內容。
    for(const svg of c.querySelectorAll('.ff14-route-line-layer')){
      svg.classList.remove('is-drawing');
      for(const p of svg.querySelectorAll('path')){p.style.removeProperty('animation-delay');p.style.removeProperty('animation-duration');p.style.removeProperty('--len');if(!p.getAttribute('style'))p.removeAttribute('style')}
    }
    return c.outerHTML;
  }
  function controls(el){
    const out=[];
    for(const n of el.querySelectorAll('input,select,textarea,button,details')){
      const key=n.id?`#${n.id}`:[n.tagName.toLowerCase(),...[...n.attributes].filter(a=>a.name.startsWith('data-')).map(a=>`${a.name}=${a.value}`)].join('|');
      let v;
      if(n.tagName==='DETAILS'){if(!n.open)continue;v='open '+collapse(n.querySelector('summary')?.textContent)}
      else if(n.tagName==='BUTTON'){if(!n.disabled&&!n.hidden)continue;v=(n.disabled?'disabled ':'')+(n.hidden?'hidden':'')}
      else if(n.type==='checkbox'||n.type==='radio')v=n.checked?'checked':'unchecked';
      else if(n.type==='file')continue;
      else v='value='+n.value;
      if(n.tagName!=='BUTTON'&&n.tagName!=='DETAILS'&&n.disabled)v+=' disabled';
      out.push(`${key} ${v}`);
    }
    return out;
  }
  const html={},text={},ctl={};
  for(const[key,sel]of Object.entries(roots)){
    const el=document.querySelector(sel);
    if(!el){html[key]=null;text[key]=null;continue}
    html[key]=cleanHtml(el);text[key]=collapse(el.innerText);ctl[key]=controls(el);
  }
  // 物件的鍵依字母排序：有些快取是好幾個下載同時寫的，鍵的先後每次不同，但內容一樣。
  const canon=v=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
  const storage={};
  for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k==='__fishingTestSeeded')continue;const raw=localStorage.getItem(k);try{storage[k]=JSON.stringify(canon(JSON.parse(raw)))}catch{storage[k]=raw}}
  const styles=[...document.head.querySelectorAll('style[id]')].map(s=>s.id).sort();
  return{html,text,controls:ctl,storage:Object.fromEntries(Object.entries(storage).sort(([a],[b])=>a<b?-1:1)),styles,
    globals:{catalogState:window.__fishCatalogState||null,routeModel:window.__fishingSessionRouteModel?JSON.stringify(window.__fishingSessionRouteModel):null}};
}
const ROOTS={fishing:'#fishing',dashboardFish:'#fish-summary',dock:'#fish-floating-planner-dock',npcDialog:'#ff14-npc-map-dialog[open]',nav:'nav',sync:'#sync-status'};
const snapshot=page=>page.evaluate(snapshotInPage,ROOTS);

// 等畫面靜下來：連續 quiet 毫秒沒有任何變化才算。
async function settle(page,{min=0,quiet=1500,max=30000}={}){
  if(min)await page.waitForTimeout(min);
  const started=Date.now();let last='',since=Date.now();
  for(;;){
    const now=JSON.stringify(await snapshot(page));
    if(now!==last){last=now;since=Date.now()}
    else if(Date.now()-since>=quiet)return JSON.parse(now);
    if(Date.now()-started>max)throw new Error('畫面在 '+max+'ms 內沒有靜下來');
    await page.waitForTimeout(200);
  }
}

module.exports={serve,launch,open,snapshot,settle,ROOTS,loadPlaywright};
