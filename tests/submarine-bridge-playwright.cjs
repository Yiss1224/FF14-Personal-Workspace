// Bridge additions on submarine.html: overview countdown, settlement prefill, dialogs with undo,
// fleet cards, sea-map tips, ledger insights and the harbor's fleet moments (crane, signals, salvage).
// Run: node tests/submarine-bridge-playwright.cjs   (Playwright + Chromium; CHROMIUM_PATH optional)
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

const HOUR=3600e3,DAY=24*HOUR;
const isoDay=ms=>{const d=new Date(ms);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
function seed(){
  const now=Date.now();
  return {
    fuel:100,repair:300,parts:{'1111':4,'0020':4,'3004':4,'0003':2},
    ships:[
      {registered:true,rank:20,exp:3000,name:'鸚鵡螺',currentBuild:'1121',voyaging:true,
       voyage:{departedAt:now-30*HOUR,etaAt:now-HOUR,durationSeconds:29*3600,route:'溺沒海 I → K → J',build:'1121',fuelEstimate:6}},
      {registered:true,rank:10,exp:0,name:'',voyaging:true,
       voyage:{departedAt:now-2*HOUR,etaAt:now+20*HOUR,durationSeconds:22*3600,route:'溺沒海 A → C → D',build:'1111',fuelEstimate:4}},
      {registered:true,rank:30,exp:100,name:'',currentBuild:'1121'},
      {registered:false,rank:1,exp:0,name:''}
    ],
    unlocks:{},activeSectorMap:1,
    logs:[
      {kind:'settlement',date:isoDay(now-DAY),ship:1,route:'溺沒海 I → K → J',exp:180000,fuel:6,repair:0,durationSeconds:100000,loot:[{name:'沉船戒指',qty:3}]},
      {kind:'settlement',date:isoDay(now-3*DAY),ship:2,route:'溺沒海 A → C → D',exp:60000,fuel:4,repair:0,loot:[{name:'上等沉船項鍊',qty:1}]},
      {date:isoDay(now-2*DAY),ship:3,route:'手動',exp:0,fuel:2,repair:0,note:'manual'}
    ]
  };
}

let browser,base,passed=0;
const results=[];
async function open(data,query=''){
  const ctx=await browser.newContext({viewport:{width:1440,height:900}});
  await ctx.route(/imgur|universalis/,route=>route.abort());
  await ctx.addInitScript(([key,value])=>{
    if(sessionStorage.getItem('__bridge_seeded'))return;
    sessionStorage.setItem('__bridge_seeded','1');localStorage.setItem(key,value);
  },[KEY,JSON.stringify(data)]);
  const page=await ctx.newPage();
  page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));
  await page.goto(base+'/submarine.html'+query);
  await page.waitForFunction(()=>document.querySelector('#calc-result .route-card'),null,{timeout:20000});
  return {ctx,page};
}
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
async function test(name,fn){
  const started=Date.now();
  try{await fn();passed++;results.push('PASS '+name+' ('+(Date.now()-started)+'ms)')}
  catch(e){results.push('FAIL '+name+'\n     '+String(e.stack||e).split('\n').slice(0,3).join('\n     '));process.exitCode=1}
}

async function main(){
  const server=await serve();
  base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}
    :fs.existsSync('/opt/pw-browsers/chromium')?{executablePath:'/opt/pw-browsers/chromium'}:{});

  await test('概況：待結算優先顯示，分頁標題與燃料可撐天數',async()=>{
    const {ctx,page}=await open(seed());
    assert.ok((await page.textContent('#ui-next-return')).includes('1 艘待結算'));
    assert.ok(await page.evaluate(()=>document.getElementById('ui-next-return-card').classList.contains('is-alert')));
    assert.ok((await page.title()).startsWith('⚓1 待結算'),await page.title());
    // 近 4 天用了 12 罐 → 每天 3 罐，庫存 100 罐約 33 天。
    const fuel=await page.textContent('#ui-fuel-note');
    assert.ok(fuel.includes('約可撐 33 天'),fuel);
    assert.ok(await page.evaluate(()=>/^data:image\/svg/.test(document.getElementById('sub-favicon').href)));
    assert.deepStrictEqual(page.errors,[]);
    await ctx.close();
  });

  await test('概況：沒有待結算時顯示下一艘返航倒數',async()=>{
    const data=seed();delete data.ships[0].voyage;data.ships[0].voyaging=false;
    const {ctx,page}=await open(data);
    const value=await page.textContent('#ui-next-return');
    assert.ok(/19 小時 \d+ 分|20 小時 0 分/.test(value),value);
    assert.ok((await page.textContent('#ui-next-return-note')).includes('潛水艇 2'));
    assert.ok(/^\(\d+:\d\d\) /.test(await page.title()),await page.title());
    await ctx.close();
  });

  await test('結算預填：點「前往結算」帶入航線、燃料、日期，結算紀錄含航行時間',async()=>{
    const {ctx,page}=await open(seed());
    await page.click('#ui-next-return-card');
    await page.waitForFunction(()=>document.getElementById('loot-route-input').value==='I,K,J');
    assert.strictEqual(await page.inputValue('#settle-ship'),'1');
    assert.strictEqual(await page.inputValue('#loot-map'),'1');
    assert.ok(Number(await page.inputValue('#settle-fuel'))>0,'燃料應依航線估算');
    assert.strictEqual(await page.inputValue('#settle-date'),isoDay(Date.now()-HOUR));
    assert.ok(!(await page.isHidden('#settle-prefill-note')));
    await page.fill('#settle-rank','21');await page.fill('#settle-exp','0');
    await page.click('#settle-save');
    const s=await stored(page),log=s.logs.at(-1);
    assert.strictEqual(log.route,'溺沒海 I → K → J');
    assert.strictEqual(log.durationSeconds,29*3600);assert.strictEqual(log.build,'1121');
    assert.strictEqual(s.ships[0].voyaging,false);
    await ctx.close();
  });

  await test('結算預填：沒有航程的船不預填；跨海圖航線只帶燃料',async()=>{
    const data=seed();data.ships[1].voyage.route='溺沒海 A → 灰海 B';
    const {ctx,page}=await open(data);
    await page.selectOption('#settle-ship','3');
    assert.strictEqual(await page.inputValue('#loot-route-input'),'');
    assert.ok(await page.isHidden('#settle-prefill-note'));
    await page.selectOption('#settle-ship','2');
    assert.strictEqual(await page.inputValue('#loot-route-input'),'');
    assert.strictEqual(await page.inputValue('#settle-fuel'),'4');
    await ctx.close();
  });

  await test('對話框：取消不出航；確認後可在通知中復原出航',async()=>{
    const {ctx,page}=await open(seed());
    await page.click('[data-depart-ship="2"]');
    await page.waitForSelector('#sub-dialog[open]');
    assert.ok((await page.textContent('#sub-dialog')).includes('預計返航'));
    await page.click('#sub-dialog [data-dialog-cancel]');
    assert.strictEqual((await stored(page)).ships[2].voyaging,undefined);
    await page.click('[data-depart-ship="2"]');
    await page.click('#sub-dialog [data-dialog-ok]');
    await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).ships[2].voyaging===true,KEY);
    await page.click('.sub-toast button:has-text("復原出航")');
    const ship=(await stored(page)).ships[2];
    assert.strictEqual(ship.voyaging,undefined);assert.strictEqual(ship.voyage,undefined);
    assert.deepStrictEqual(page.errors,[]);
    await ctx.close();
  });

  await test('復原：換裝紀錄與刪除出航紀錄都可復原',async()=>{
    const {ctx,page}=await open(seed());
    await page.evaluate(()=>window.SubDialog.toast('x').close());
    await page.selectOption('[data-installed="2"]','1123');
    assert.strictEqual((await stored(page)).ships[2].currentBuild,'1123');
    await page.click('details.settlement-history:has(#log-table) > summary');
    const before=await stored(page);
    await page.locator('#log-table tr',{hasText:'manual'}).locator('[data-delete]').click();
    let s=await stored(page);
    assert.strictEqual(s.logs.length,before.logs.length-1);assert.strictEqual(s.fuel,before.fuel+2);
    await page.click('.sub-toast button:has-text("復原")');
    s=await stored(page);
    assert.deepStrictEqual(s.logs,before.logs);assert.strictEqual(s.fuel,before.fuel);
    await ctx.close();
  });

  await test('船隊卡片：狀態、經驗條與前往結算',async()=>{
    const {ctx,page}=await open(seed());
    await page.waitForFunction(()=>document.querySelectorAll('.fleet-card .fleet-bar').length>=3);
    const cards=await page.$$eval('.fleet-card',els=>els.map(e=>e.className+'|'+e.querySelector('.fleet-chip').textContent));
    assert.ok(cards[0].includes('is-awaiting')&&cards[0].includes('待結算'),cards[0]);
    assert.ok(cards[1].includes('is-exploring'),cards[1]);
    assert.ok(cards[2].includes('is-idle'),cards[2]);
    assert.ok(cards[3].includes('is-empty'),cards[3]);
    await page.click('[data-card-settle="0"]');
    await page.waitForFunction(()=>document.getElementById('loot-route-input').value==='I,K,J');
    await ctx.close();
  });

  await test('海圖：圓點顯示字母，滑鼠移上顯示代碼與中文點名',async()=>{
    const {ctx,page}=await open(seed());
    assert.strictEqual(await page.evaluate(()=>document.querySelector('[data-sector="10"]').textContent),'J');
    // 乾淨海圖：依遊戲座標繪製，不再依賴外部底圖；第 3 張海圖每個點都有座標。
    assert.ok(await page.evaluate(()=>document.querySelector('.map-stage.is-chart svg.map-chart')&&!document.querySelector('.map-stage img')));
    assert.strictEqual(await page.evaluate(()=>document.querySelector('[data-sector="10"]').style.left),'90%');
    await page.click('[data-map-tab="3"]');
    assert.ok(await page.evaluate(()=>[...document.querySelectorAll('.map-point')].every(b=>!(b.style.left==='50%'&&b.style.top==='50%'))),'有航點落在預設位置');
    await page.click('[data-map-tab="1"]');
    await page.hover('[data-sector="10"]');
    const tip=await page.textContent('.map-tip');
    assert.ok(tip.includes('J')&&tip.includes('無名沉船')&&tip.includes('Rank 20'),tip);
    assert.ok(!(await page.isHidden('.map-tip')));
    await page.mouse.move(2,2);
    assert.ok(await page.isHidden('.map-tip'));
    await ctx.close();
  });

  await test('收益帳本：每月估值長條與航線實測效率',async()=>{
    const {ctx,page}=await open(seed());
    await page.click('#ledger-details > summary');
    await page.waitForSelector('.trend-bar');
    assert.strictEqual(await page.locator('.trend-bar').count(),6);
    const rows=await page.$$eval('.route-efficiency-table tbody tr',trs=>trs.map(t=>t.textContent));
    const ikj=rows.find(r=>r.includes('I → K → J'));
    assert.ok(ikj&&ikj.includes('6,480'),'EXP／小時應為 180000／(100000/3600)：'+ikj);
    await ctx.close();
  });

  await test('碼頭：換裝時吊車送部件，送達前維持舊外形',async()=>{
    const {ctx,page}=await open(seed(),'?harbor-hour=13');
    await page.waitForTimeout(800);
    await page.selectOption('[data-installed="2"]','1123');
    await page.waitForFunction(()=>HarborScene.fleet().crane.stage!==null);
    assert.deepStrictEqual(await page.evaluate(()=>[HarborScene.time().builds[2],HarborScene.time().shown[2]]),['1123','1121']);
    await page.waitForFunction(()=>HarborScene.time().shown[2]==='1123',null,{timeout:30000});
    await page.waitForFunction(()=>HarborScene.fleet().crane.stage===null,null,{timeout:30000});
    assert.deepStrictEqual(page.errors,[]);
    await ctx.close();
  });

  await test('碼頭：出航時泊位信號轉綠、汽笛白煙、工人揮手',async()=>{
    const {ctx,page}=await open(seed(),'?harbor-hour=13');
    await page.waitForTimeout(800);
    await page.click('[data-depart-ship="2"]');await page.click('#sub-dialog [data-dialog-ok]');
    await page.waitForFunction(()=>HarborScene.fleet().signals.some(s=>s.i===2&&s.color==='#5fe08a'));
    await page.waitForFunction(()=>HarborScene.fleet().waving);
    await page.waitForFunction(()=>HarborScene.fleet().puffs>0);
    await ctx.close();
  });

  await test('碼頭：結算登記掉落物後播放打撈品出艙',async()=>{
    const {ctx,page}=await open(seed(),'?harbor-hour=13');
    await page.waitForTimeout(800);
    await page.click('[data-card-settle="0"]');
    await page.waitForFunction(()=>document.getElementById('loot-route-input').value==='I,K,J');
    await page.fill('#settle-rank','21');await page.fill('#settle-exp','0');
    await page.evaluate(()=>window.SubmarineLootDraft.addItem('上等沉船項鍊',1));
    await page.click('#settle-save');
    await page.waitForFunction(()=>HarborScene.events.status().active.some(a=>a.id==='salvage'),null,{timeout:15000});
    await ctx.close();
  });

  await test('減少動態偏好：不排吊車與出航動畫，外形立即更新',async()=>{
    const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
    await ctx.route(/imgur|universalis/,route=>route.abort());
    await ctx.addInitScript(([key,value])=>{if(!sessionStorage.getItem('s')){sessionStorage.setItem('s','1');localStorage.setItem(key,value)}},[KEY,JSON.stringify(seed())]);
    const page=await ctx.newPage();await page.goto(base+'/submarine.html');
    await page.waitForSelector('[data-installed="2"]',{timeout:20000});
    await page.selectOption('[data-installed="2"]','1123');await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(()=>HarborScene.time().shown[2]),'1123');
    assert.strictEqual(await page.evaluate(()=>HarborScene.fleet().crane.stage),null);
    await ctx.close();
  });

  await browser.close();server.close();
  console.log(results.join('\n'));
  console.log(passed+' passed, '+(results.filter(r=>r.startsWith('FAIL')).length)+' failed');
}
main().catch(e=>{console.error(e);process.exit(1)});
