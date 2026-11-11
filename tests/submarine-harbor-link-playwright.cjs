// Harbor link: captions, departure trail, and the "waiting for settlement" shortcut. Display only.
const assert=require('assert'),http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const ROOT=path.join(__dirname,'..'),KEY='ff14_submarine_planner_v1',HOUR=3600e3;
const TYPES={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
function serve(){
  const server=http.createServer((req,res)=>{
    const file=path.join(ROOT,decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'')||'index.html');
    if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return}
    res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server)));
}
function seed(){
  const now=Date.now();
  return {fuel:1600,repair:300,parts:{'1111':4,'0020':4,'3004':4,'0003':0},ships:[
    {registered:true,rank:20,exp:0,name:'鸚鵡螺',currentBuild:'1121'},
    {registered:true,rank:30,exp:0,name:'海燕',voyaging:true,voyage:{departedAt:now-10*HOUR,etaAt:now+20*HOUR,route:'溺沒海 A → B'}},
    {registered:true,rank:40,exp:0,voyaging:true,voyage:{departedAt:now-30*HOUR,etaAt:now+3*HOUR,route:'灰海 O → J'}},
    {registered:true,rank:50,exp:0,name:'白鯨',voyaging:true,voyage:{departedAt:now-30*HOUR,etaAt:now-HOUR,route:'翠浪海 A → C'}}],
    unlocks:{},logs:[],activeSectorMap:1};
}
let browser,base,passed=0;
async function open(opts={}){
  const ctx=await browser.newContext({viewport:opts.viewport||{width:1280,height:800},reducedMotion:opts.reducedMotion||'no-preference'});
  await ctx.route(/imgur|universalis/,route=>route.abort());
  await ctx.addInitScript(([key,value])=>{
    if(!localStorage.getItem('__link_seeded')){localStorage.setItem('__link_seeded','1');localStorage.setItem(key,value)}
    window.__trails=0;
    new MutationObserver(list=>list.forEach(m=>m.addedNodes.forEach(n=>{if(n.classList&&n.classList.contains('harbor-trail'))window.__trails++})))
      .observe(document,{childList:true,subtree:true});
  },[KEY,JSON.stringify(seed())]);
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/submarine.html');
  await page.waitForFunction(()=>window.HarborLink&&document.getElementById('mini-harbor').classList.contains('has-scene'));
  return {ctx,page,errors};
}
async function depart(page,confirm=true){
  await page.click('#calc-routes');
  const button=page.locator('.voyage-depart-button').first();
  await button.waitFor();await button.click();
  await page.click(confirm?'[data-dialog-ok]':'[data-dialog-cancel]');
}
async function test(name,fn){try{await fn();passed++;console.log('ok  '+name)}catch(e){console.error('FAIL '+name+'\n'+e.stack);process.exitCode=1}}
(async()=>{
  const server=await serve();base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch();

  await test('1 出航後船上出現字幕，並有光點從按鈕飛向碼頭',async()=>{
    const {ctx,page,errors}=await open();
    await depart(page);
    const cap=page.locator('.harbor-caption.is-depart');
    await cap.waitFor();
    const text=await cap.textContent();
    assert.ok(text.includes('鸚鵡螺')&&text.includes('出航')&&text.includes('返航'),text);
    await page.waitForFunction(()=>window.__trails===1);
    const state=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
    assert.strictEqual(state.ships[0].voyaging,true);
    // The caption sits above its boat, inside the viewport.
    const box=await cap.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=1280&&box.y>0,JSON.stringify(box));
    assert.deepStrictEqual(errors,[]);await ctx.close();
  });

  await test('2 取消確認視窗：沒有字幕也沒有光點',async()=>{
    const {ctx,page}=await open();
    await depart(page,false);
    await page.waitForTimeout(400);
    assert.strictEqual(await page.locator('.harbor-caption').count(),0);
    assert.strictEqual(await page.evaluate(()=>window.__trails),0);
    await ctx.close();
  });

  await test('3 復原出航時，出航字幕跟著消失',async()=>{
    const {ctx,page}=await open();
    await depart(page);
    await page.locator('.harbor-caption.is-depart').waitFor();
    await page.locator('.sub-toast button',{hasText:'復原出航'}).click();
    await page.waitForFunction(()=>!document.querySelector('.harbor-caption.is-depart'));
    assert.strictEqual(await page.evaluate(k=>Boolean(JSON.parse(localStorage.getItem(k)).ships[0].voyaging),KEY),false);
    await ctx.close();
  });

  await test('4 待結算的船點一下跳到返航結算並選好那艘船，不改資料',async()=>{
    const {ctx,page}=await open();
    const boat=page.locator('[data-harbor-ship="3"]');
    await page.waitForFunction(()=>document.querySelector('[data-harbor-ship="3"]').classList.contains('is-awaiting'));
    assert.strictEqual(await boat.evaluate(el=>getComputedStyle(el).cursor),'pointer');
    const before=await page.evaluate(k=>localStorage.getItem(k),KEY);
    await boat.click();
    await page.waitForFunction(()=>{const r=document.getElementById('return-settlement').getBoundingClientRect();return r.top<200&&r.bottom>200});
    assert.strictEqual(await page.inputValue('#settle-ship'),'4');
    assert.strictEqual(await page.evaluate(k=>localStorage.getItem(k),KEY),before);
    // A boat that is not waiting does nothing on click.
    await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(700);
    await page.locator('[data-harbor-ship="0"]').click();await page.waitForTimeout(300);
    assert.ok(await page.evaluate(()=>window.scrollY)<5);
    await ctx.close();
  });

  await test('5 結算升級時字幕顯示 Rank 變化',async()=>{
    const {ctx,page}=await open();
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('submarine-settlement-saved',{detail:{index:3,loot:[],rankBefore:50,rankAfter:51}})));
    const cap=page.locator('.harbor-caption.is-rankup');await cap.waitFor();
    assert.ok((await cap.textContent()).includes('Rank 50 → 51'));
    await ctx.close();
  });

  await test('6 減少動態：字幕照常顯示，但沒有飛行光點與動畫',async()=>{
    const {ctx,page}=await open({reducedMotion:'reduce'});
    await depart(page);
    const cap=page.locator('.harbor-caption.is-depart');await cap.waitFor();
    assert.strictEqual(await cap.evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(()=>window.__trails),0);
    await ctx.close();
  });

  await test('7 手機寬度：字幕不超出畫面',async()=>{
    const {ctx,page}=await open({viewport:{width:390,height:844}});
    await depart(page);
    const cap=page.locator('.harbor-caption.is-depart');await cap.waitFor();await page.waitForTimeout(400);
    const box=await cap.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390,JSON.stringify(box));
    await ctx.close();
  });

  await test('8 海上的位置等於航程進度：去程往右、回程往左，資訊框顯示百分比',async()=>{
    for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
      const xs=[];
      for(const f of [.1,.3,.5,.7,.9]){
        const ctx=await browser.newContext({viewport});
        await ctx.addInitScript(([key,f])=>{
          const now=Date.now(),D=20*3600e3;
          localStorage.setItem(key,JSON.stringify({fuel:1600,repair:300,parts:{},ships:[0,1,2,3].map(i=>({registered:true,rank:30,exp:0,currentBuild:'1121',
            voyaging:true,voyage:{departedAt:now-D*f,etaAt:now+D*(1-f),route:'A → B'}})),unlocks:{},logs:[],activeSectorMap:1}));
        },[KEY,f]);
        const page=await ctx.newPage();await page.goto(base+'/submarine.html');
        await page.waitForFunction(()=>document.querySelector('[data-harbor-ship="0"]').classList.contains('is-sailing'));
        await page.waitForTimeout(300);
        const info=await page.evaluate(()=>[...document.querySelectorAll('[data-harbor-ship]')].map(b=>{const r=b.getBoundingClientRect();
          return {cx:r.left+r.width/2,bottom:r.bottom,progress:Number(b.style.getPropertyValue('--progress')),bar:getComputedStyle(b.querySelector('.harbor-progress')).display}}));
        xs.push(info[0].cx);
        assert.ok(Math.abs(info[0].progress-f)<.01,'進度條數值 '+info[0].progress);
        assert.strictEqual(info[0].bar,'none'); // drawn on the canvas when the scene runs
        // A convoy that left together: every boat on screen, each in its own lane.
        for(const b of info)assert.ok(b.cx>0&&b.cx<viewport.width,'超出畫面 '+b.cx);
        for(let i=1;i<4;i++)assert.ok(info[i-1].bottom-info[i].bottom>=6,'航道沒有分開');
        await page.locator('[data-harbor-ship="0"]').focus();
        const tip=await page.locator('#harbor-tooltip').textContent();
        assert.ok(tip.includes(Math.floor(f*100)+'%')||tip.includes(Math.floor(f*100-1)+'%')||tip.includes(Math.floor(f*100+1)+'%'),tip);
        assert.ok(tip.includes(f<.5?'去程':'回程'),tip);
        await ctx.close();
      }
      assert.ok(xs[0]<xs[1]&&xs[1]<xs[2],'去程應一路往右：'+xs);
      assert.ok(xs[2]>xs[3]&&xs[3]>xs[4],'回程應一路往左：'+xs);
      assert.ok(Math.abs(xs[0]-xs[4])<3&&Math.abs(xs[1]-xs[3])<3,'去回程同進度應在同一位置：'+xs);
      assert.ok(xs[2]-xs[0]>viewport.width*.1,'航道太短看不出進度：'+xs);
    }
  });

  await browser.close();server.close();
  console.log(passed+' passed');
})();
