// Harbor pacing, phone lanes and phone section folding on the submarine page.
// Presentation only: none of this may touch saved fleet data.
const assert=require('assert'),http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const ROOT=path.join(__dirname,'..'),HOUR=3600e3;
const TYPES={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
function serve(){
  const server=http.createServer((req,res)=>{
    const file=path.join(ROOT,decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'')||'index.html');
    if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return}
    res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server)));
}
let browser,base,passed=0;
async function test(name,fn){try{await fn();passed++;console.log('ok  '+name)}catch(e){console.error('FAIL '+name+'\n'+e.stack);process.exitCode=1}}
const KEY='ff14_submarine_planner_v1';
function convoy(){
  const now=Date.now(),v=(a,b,route)=>({departedAt:now-a*HOUR,etaAt:now+b*HOUR,route});
  return {fuel:1600,repair:300,parts:{'1111':4,'0020':4,'3004':4,'0003':0},ships:[
    {registered:true,rank:62,exp:0,name:'鸚鵡螺',currentBuild:'1121',voyaging:true,voyage:v(9,15,'溺沒海 A → B')},
    {registered:true,rank:60,exp:0,currentBuild:'2223',voyaging:true,voyage:v(9,15,'溺沒海 A → B')},
    {registered:true,rank:55,exp:0,currentBuild:'3324',voyaging:true,voyage:v(9,15,'灰海 O → J')},
    {registered:true,rank:50,exp:0,currentBuild:'4445',voyaging:true,voyage:v(9,15,'翠浪海 A → C')}],
    unlocks:{},logs:[],activeSectorMap:1};
}
async function open(opts={}){
  const ctx=await browser.newContext({viewport:opts.viewport||{width:1280,height:800},reducedMotion:opts.reducedMotion||'no-preference'});
  await ctx.route(/imgur|universalis/,route=>route.abort());
  await ctx.addInitScript(([key,value])=>{if(!localStorage.getItem('__seeded')){localStorage.setItem('__seeded','1');localStorage.setItem(key,value)}},[KEY,JSON.stringify(convoy())]);
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/submarine.html'+(opts.query||''));
  await page.waitForFunction(()=>window.HarborScene&&window.SubmarineFold&&document.getElementById('mini-harbor').classList.contains('has-scene'));
  await page.waitForTimeout(500);
  return {ctx,page,errors};
}
const PHONE={width:390,height:844};
const pace=page=>page.evaluate(()=>HarborScene.stats().paceMs);
(async()=>{
  const server=await serve();base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch();

  await test('1 碼頭閒置降速：沒人操作一分鐘後變慢、五分鐘後更慢，一動滑鼠立刻恢復',async()=>{
    const {ctx,page,errors}=await open();
    const saved=await page.evaluate(k=>localStorage.getItem(k),KEY);
    assert.strictEqual(await pace(page),50);
    await page.evaluate(()=>HarborScene.idleFor(120000));
    await page.waitForFunction(()=>HarborScene.stats().paceMs===100,null,{timeout:3000});
    await page.evaluate(()=>HarborScene.idleFor(600000));
    await page.waitForFunction(()=>HarborScene.stats().paceMs===250,null,{timeout:3000});
    await page.mouse.move(300,300);
    await page.waitForFunction(()=>HarborScene.stats().paceMs===50,null,{timeout:2000});
    assert.strictEqual(await page.evaluate(k=>localStorage.getItem(k),KEY),saved,'不可改動潛艇資料');
    assert.deepStrictEqual(errors,[]);await ctx.close();
  });

  await test('2 收合碼頭：一秒只算一次，展開後立刻回到正常速度',async()=>{
    const {ctx,page}=await open();
    await page.click('.harbor-toggle');
    await page.waitForFunction(()=>HarborScene.stats().paceMs===1000,null,{timeout:3000});
    const count=()=>page.evaluate(()=>new Promise(resolve=>{let n=0;const raf=window.requestAnimationFrame;window.requestAnimationFrame=cb=>{n++;return raf(cb)};
      setTimeout(()=>{window.requestAnimationFrame=raf;resolve(n)},2000)}));
    await page.evaluate(()=>scrollTo(0,1200));await page.waitForTimeout(300);
    assert.ok(await count()<=6,'收合時不該每一格畫面都被叫醒');
    await page.click('.harbor-toggle');
    await page.waitForFunction(()=>HarborScene.stats().paceMs===50,null,{timeout:2000});
    await ctx.close();
  });

  await test('3 被畫布取代的舊碼頭圖層沒有在背景無限循環的動畫',async()=>{
    const {ctx,page}=await open();
    const loops=await page.evaluate(()=>document.getAnimations().filter(a=>a.effect&&a.effect.getTiming().iterations===Infinity&&
      a.effect.target.closest('#mini-harbor')&&getComputedStyle(a.effect.target).visibility==='hidden').map(a=>a.animationName));
    assert.deepStrictEqual(loops,[]);
    await ctx.close();
  });

  await test('4 手機：四艘一起出航時在海上排開、互不重疊，各有編號牌；桌機維持原樣',async()=>{
    const {ctx,page,errors}=await open({viewport:PHONE,query:'?harbor-hour=10&harbor-weather=clearSkies'});
    const boats=await page.evaluate(()=>[...document.querySelectorAll('[data-harbor-ship]')].map(b=>{const r=b.getBoundingClientRect();return {cx:r.left+r.width/2,bottom:r.bottom,sailing:b.classList.contains('is-sailing')}}));
    assert.ok(boats.every(b=>b.sailing));
    // The drawn boat and its plate are 28px wide: centres at least that far apart never overlap.
    for(let i=1;i<4;i++)assert.ok(boats[i].cx-boats[i-1].cx>=28,'第 '+i+' 與 '+(i+1)+' 艘水平間距不足：'+JSON.stringify(boats));
    for(let i=1;i<4;i++)assert.ok(boats[i-1].bottom-boats[i].bottom>=10,'航道垂直間距不足：'+JSON.stringify(boats));
    assert.ok(boats[3].cx<=390-12,'最遠的船不可超出畫面');
    for(let i=0;i<4;i++){
      await page.hover('[data-harbor-ship="'+i+'"]',{force:true});await page.waitForTimeout(100);
      const tip=await page.evaluate(()=>{const t=document.getElementById('harbor-tooltip');return t.hidden?'':t.innerText});
      assert.ok(tip.includes(i===0?'鸚鵡螺':'潛水艇 '+(i+1)),'第 '+(i+1)+' 艘的資訊框：'+tip);
    }
    assert.deepStrictEqual(errors,[]);await ctx.close();
    const d=await open({viewport:{width:1440,height:900}});
    const wide=await d.page.evaluate(()=>[...document.querySelectorAll('[data-harbor-ship]')].map(b=>b.getBoundingClientRect().left));
    for(let i=1;i<4;i++)assert.ok(wide[i]>wide[i-1]);
    await d.ctx.close();
  });

  await test('5 手機：參考區塊預設收合，點標題展開並記住；頁面明顯變短',async()=>{
    const {ctx,page,errors}=await open({viewport:PHONE});
    const saved=await page.evaluate(k=>localStorage.getItem(k),KEY);
    assert.deepStrictEqual(await page.evaluate(()=>SubmarineFold.folded()),['sector-panel','routes-panel']);
    assert.ok(await page.evaluate(()=>document.getElementById('routes-panel').getBoundingClientRect().height)<90);
    assert.strictEqual(await page.isVisible('#routes-panel .table-wrap'),false);
    const short=await page.evaluate(()=>document.documentElement.scrollHeight);
    await page.click('#routes-panel > h2');
    assert.strictEqual(await page.isVisible('#routes-panel .table-wrap'),true);
    assert.strictEqual(await page.getAttribute('#routes-panel > .fold-toggle','aria-expanded'),'true');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight)>short+500);
    await page.reload();await page.waitForFunction(()=>window.SubmarineFold);
    assert.deepStrictEqual(await page.evaluate(()=>SubmarineFold.folded()),['sector-panel'],'展開狀態應該記住');
    await page.click('#calculator-panel > .fold-toggle');
    assert.strictEqual(await page.isVisible('#calc-routes'),false);
    await page.click('#calculator-panel > .fold-toggle');
    assert.strictEqual(await page.isVisible('#calc-routes'),true);
    assert.strictEqual(await page.evaluate(k=>localStorage.getItem(k),KEY),saved,'不可改動潛艇資料');
    assert.deepStrictEqual(errors,[]);await ctx.close();
  });

  await test('6 手機：從導覽或程式跳到收合的區塊會自動展開；四艘配件卡改成一排左右滑',async()=>{
    const {ctx,page}=await open({viewport:PHONE});
    await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto'});
    await page.evaluate(()=>document.querySelector('.bridge-nav a[href="#sector-panel"]').click());
    assert.strictEqual(await page.isVisible('#sector-unlocks'),true);
    await page.evaluate(()=>document.getElementById('routes-panel').scrollIntoView());
    assert.strictEqual(await page.isVisible('#routes-panel .table-wrap'),true);
    await page.goto(base+'/submarine.html');await page.waitForFunction(()=>window.SubmarineFold);
    assert.deepStrictEqual(await page.evaluate(()=>SubmarineFold.folded()),['sector-panel','routes-panel'],'自動展開不該被記住');
    const grid=await page.evaluate(()=>{const g=document.getElementById('ship-builds');return {scroll:g.scrollWidth,client:g.clientWidth,cards:g.children.length,h:g.getBoundingClientRect().height,page:document.documentElement.scrollWidth}});
    assert.ok(grid.cards===4&&grid.scroll>grid.client*2,JSON.stringify(grid));
    assert.ok(grid.page<=391,'頁面本身不可橫向捲動');
    await ctx.close();
  });

  await test('7 桌機不收合：內容全部可見、沒有收合鈕，配件卡維持格狀',async()=>{
    const {ctx,page}=await open();
    assert.strictEqual(await page.isVisible('#routes-panel .table-wrap'),true);
    assert.strictEqual(await page.isVisible('#sector-unlocks'),true);
    assert.strictEqual(await page.isVisible('#routes-panel > .fold-toggle'),false);
    assert.strictEqual(await page.evaluate(()=>getComputedStyle(document.getElementById('ship-builds')).display),'grid');
    await ctx.close();
  });

  await browser.close();server.close();
  console.log(passed+' passed');
})();
