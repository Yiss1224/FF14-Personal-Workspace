// "海圖開完後，撥出船" check for submarine.html (Playwright + Chromium).
// Once every sea entry is open, graduated ships set aside for exploring can open the remaining sectors,
// either favouring the most unlock chances or keeping the best revenue proxy among routes that touch a frontier.
// Run: node tests/submarine-frontier-playwright.cjs
'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');
const assert=require('assert');

function loadPlaywright(){
  for(const id of ['playwright','/opt/node22/lib/node_modules/playwright']){
    try{return require(id)}catch(e){}
  }
  throw new Error('找不到 playwright 套件，請先安裝：npm i -D playwright');
}
const {chromium}=loadPlaywright();
const ROOT=path.resolve(__dirname,'..');
const KEY='ff14_submarine_planner_v1';
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
function serve(){
  const server=http.createServer((req,res)=>{
    const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));
    if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return}
    res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server)));
}
const range=(a,b)=>Array.from({length:b-a+1},(_,i)=>a+i);
const ship=(rank,extra={})=>({registered:true,rank,exp:0,name:'',...extra});
// 七張海圖入口都已開：只剩灰海以外的幾個航點未開（翡翠海 K、M 與最後一張圖 D 以後）。
// 三艘 Rank 140 畢業船（三艘金策＋一艘探索的情境），一艘還在練等。
const closed=new Set([126,128,...range(140,149)]);
const seed=(explorers,exploreMode)=>({fuel:1600,repair:300,parts:{'1111':4,'0020':4,'3004':4,'0003':2},
  ships:[ship(140,{currentBuild:'3124'}),ship(140,{currentBuild:'3124'}),ship(140,{currentBuild:'3124'}),ship(60,{currentBuild:'1121'})],
  unlocks:Object.fromEntries(range(1,149).filter(id=>!closed.has(id)).map(id=>['sector-'+id,true])),logs:[],activeSectorMap:1,
  plannerSettings:{maxHours:72,targetRank:85,dailyPickup:true,pickupStart:'19:00',pickupEnd:'22:00',departureTime:'20:00',manualDeparture:true,expandedLongRoutes:true,explorers,exploreMode}});

async function run(browser,base,explorers,exploreMode){
  const ctx=await browser.newContext();
  await ctx.route(/imgur|universalis/,route=>route.abort());
  await ctx.addInitScript(([key,value])=>{
    if(localStorage.getItem('__seeded'))return;
    localStorage.setItem('__seeded','1');localStorage.setItem(key,value);
  },[KEY,JSON.stringify(seed(explorers,exploreMode))]);
  const page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/submarine.html');
  await page.waitForFunction(()=>document.getElementById('calc-result').children.length>0,null,{timeout:60000});
  const read=()=>page.evaluate(()=>({
    hint:[...document.querySelectorAll('#calc-result > p.hint')].map(p=>p.textContent).join(' '),
    cards:[...document.querySelectorAll('#calc-result .route-card')].map(c=>({title:c.querySelector('h3').textContent,text:c.textContent}))
  }));
  const result={mode:await page.$eval('#calc-explore-mode',el=>el.value),...await read()};
  if(exploreMode!=='next'){
    await page.selectOption('#calc-explore-mode','next');
    result.afterReset=await read();
    result.saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).plannerSettings.exploreMode,KEY);
  }
  assert.deepStrictEqual(errors,[],'page errors');
  await ctx.close();
  return result;
}
const explorerCards=r=>r.cards.filter(c=>c.title.includes('畢業船開圖'));
const opens=c=>Number(/共 (\d+) 個未開航點/.exec(c.text)?.[1]);
const rate=c=>Number(/([\d,]+) EXP／收船日/.exec(c.text)?.[1].replace(/,/g,''));

(async()=>{
  const server=await serve(),base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium')?{executablePath:'/opt/pw-browsers/chromium'}:{});
  try{
    // 預設「待命」：與以前相同，海圖入口都開後撥出船不出動，但會提示還有未開航點。
    const idle=await run(browser,base,1,'next');
    assert.strictEqual(idle.mode,'next');
    assert.strictEqual(explorerCards(idle).length,0,'待命模式不派開圖');
    assert.ok(idle.hint.includes('還有 12 個航點未開'),idle.hint);

    const balanced=await run(browser,base,1,'balanced');
    const b=explorerCards(balanced);
    assert.strictEqual(b.length,1,'撥出一艘開剩餘航點：'+balanced.cards.map(c=>c.title).join(' | '));
    assert.ok(b[0].title.includes('潛水艇 1'));
    assert.ok(opens(b[0])>=1&&rate(b[0])>0,b[0].text);
    assert.strictEqual(balanced.cards.filter(c=>c.title.includes('已達 Rank 85')).length,2,'其他兩艘畢業船照常 O → J');
    assert.ok(balanced.cards.some(c=>c.title.includes('潛水艇 4')&&c.title.includes('升等優先')),'練等船不受影響');
    assert.ok(balanced.hint.includes('其中 4 個的前置點已開'),balanced.hint);
    assert.strictEqual(explorerCards(balanced.afterReset).length,0,'改回待命後即時重算');
    assert.strictEqual(balanced.saved,'next','設定保存在 plannerSettings');

    const frontier=await run(browser,base,1,'frontier');
    const f=explorerCards(frontier);
    assert.strictEqual(f.length,1);
    assert.ok(opens(f[0])>=opens(b[0]),'開圖優先的可開航點數不少於兼顧收益：'+opens(f[0])+' vs '+opens(b[0]));
    assert.ok(rate(b[0])>=rate(f[0]),'兼顧收益的收益指標不低於開圖優先：'+rate(b[0])+' vs '+rate(f[0]));
    console.log('submarine frontier: ok','balanced',opens(b[0]),rate(b[0]),'frontier',opens(f[0]),rate(f[0]));
    console.log(b[0].title);console.log(f[0].title);
  }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
