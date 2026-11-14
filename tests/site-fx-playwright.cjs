// Site FX: interactive motion on the home page (dashboard, leveling, fishing tabs).
// Presentation only: text, structure and saved data must stay exactly as the app wrote them.
const assert=require('assert'),http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const ROOT=path.join(__dirname,'..');
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
async function open(opts={}){
  const ctx=await browser.newContext({viewport:opts.viewport||{width:1280,height:800},reducedMotion:opts.reducedMotion||'no-preference'});
  // No outside requests: the fishing data sources are not needed for these checks.
  await ctx.route(url=>!url.href.startsWith(base),route=>route.abort());
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/index.html');
  await page.waitForFunction(()=>window.SiteFx&&document.documentElement.classList.contains('fx-ready'));
  await page.waitForTimeout(opts.settle===false?0:1700);   // effects stay quiet during the first render
  return {ctx,page,errors};
}
const overlays=page=>page.evaluate(()=>document.querySelectorAll('.fx-ripple,.fx-spark,.fx-splash,.fx-burst,.fx-banner').length);
(async()=>{
  const server=await serve();base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch();

  await test('1 頁首：粒子動畫啟動並隨分頁換樣式；標題與版本號不變',async()=>{
    const {ctx,page,errors}=await open();
    assert.strictEqual((await page.textContent('header h1')).trim(),'FF14 Personal Workspace');
    assert.ok(/版本/.test(await page.textContent('header')),'版本號應保留');
    const sky=await page.evaluate(()=>SiteFx.sky());
    assert.ok(sky.running&&sky.motes>=12&&sky.theme==='dashboard',JSON.stringify(sky));
    await page.mouse.click(640,40);
    assert.ok((await page.evaluate(()=>SiteFx.sky())).rings>=1,'點頁首應出現波紋');
    await page.click('nav button[data-tab="fishing"]');
    await page.waitForFunction(()=>SiteFx.sky().theme==='fishing');
    assert.ok(await page.isVisible('#fishing'));
    await page.click('nav button[data-tab="leveling"]');
    await page.waitForFunction(()=>SiteFx.sky().theme==='leveling');
    assert.deepStrictEqual(errors,[]);await ctx.close();
  });

  await test('2 頁首閒置降速：一分鐘沒操作變慢，一動就恢復',async()=>{
    const {ctx,page}=await open({settle:false});
    await page.evaluate(()=>SiteFx.idleFor(600000));
    await page.waitForFunction(()=>SiteFx.sky().slow===250,null,{timeout:3000});
    await page.mouse.move(200,200);
    await page.waitForFunction(()=>SiteFx.sky().slow===0,null,{timeout:2000});
    await ctx.close();
  });

  await test('3 分頁：亮塊滑到目前分頁，分頁切換功能照常',async()=>{
    const {ctx,page}=await open();
    const gap=()=>page.evaluate(()=>{const p=document.querySelector('.fx-tab-pill').getBoundingClientRect(),a=document.querySelector('nav button.active').getBoundingClientRect();return Math.abs(p.left-a.left)+Math.abs(p.width-a.width)});
    assert.ok(await gap()<2);
    await page.click('nav button[data-tab="leveling"]');
    assert.ok(await page.isVisible('#leveling')&&!(await page.isVisible('#dashboard')));
    await page.waitForFunction(()=>{const p=document.querySelector('.fx-tab-pill').getBoundingClientRect(),a=document.querySelector('nav button.active').getBoundingClientRect();return Math.abs(p.left-a.left)<2},null,{timeout:3000});
    assert.strictEqual(await page.evaluate(()=>document.querySelectorAll('nav button').length),3,'導覽內不可多出按鈕');
    await ctx.close();
  });

  await test('4 按鈕水波畫在按鈕上方，不改按鈕內容，結束後清掉',async()=>{
    const {ctx,page}=await open();
    const html=await page.innerHTML('#workspace-export');
    const box=await page.locator('nav button[data-tab="leveling"]').boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    assert.strictEqual(await page.evaluate(()=>document.querySelectorAll('body > .fx-ripple').length),1);
    await page.mouse.up();
    assert.strictEqual(await page.innerHTML('#workspace-export'),html);
    assert.strictEqual(await page.evaluate(()=>document.querySelector('nav button[data-tab="leveling"]').children.length),0);
    await page.waitForFunction(()=>!document.querySelector('.fx-ripple'),null,{timeout:3000});
    await ctx.close();
  });

  await test('5 Daily：打勾有火花、全部勾完有慶祝；勾選狀態照常儲存，特效結束後清乾淨',async()=>{
    const {ctx,page,errors}=await open();
    const count=await page.evaluate(()=>document.querySelectorAll('#daily-list input').length);
    assert.ok(count>=2,'預設應有多個 Daily');
    await page.click('#daily-list input >> nth=0');
    assert.ok(await page.evaluate(()=>document.querySelectorAll('.fx-spark').length)>=5,'打勾應有火花');
    assert.strictEqual(await page.evaluate(()=>document.querySelectorAll('.fx-banner').length),0);
    for(let i=1;i<count;i++)await page.click('#daily-list input >> nth='+i);
    await page.waitForSelector('.fx-banner',{state:'attached',timeout:2000});
    assert.strictEqual(await page.evaluate(()=>[...document.querySelectorAll('#daily-list input')].every(b=>b.checked)),true);
    await page.reload();await page.waitForFunction(()=>window.SiteFx);
    assert.strictEqual(await page.evaluate(()=>[...document.querySelectorAll('#daily-list input')].every(b=>b.checked)),true,'勾選應已儲存');
    assert.strictEqual(await overlays(page),0,'重新整理後不該自己放特效');
    assert.deepStrictEqual(errors,[]);await ctx.close();
  });

  await test('6 Daily 特效會自己結束，不留殘骸',async()=>{
    const {ctx,page}=await open();
    await page.click('#daily-list input >> nth=0');
    await page.waitForFunction(()=>!document.querySelector('.fx-spark'),null,{timeout:3000});
    await page.evaluate(()=>SiteFx.celebrate(300,300,'DAILY CLEAR','test'));
    await page.waitForFunction(()=>!document.querySelector('.fx-burst,.fx-banner'),null,{timeout:6000});
    await ctx.close();
  });

  await test('7 釣魚：按「已釣到」類的按鈕會在點的位置出現水花，不擋原本的點擊',async()=>{
    const {ctx,page}=await open();
    await page.click('nav button[data-tab="fishing"]');
    // A stand-in for a catalog row button: the hook is the data-caught attribute the fishing scripts render.
    await page.evaluate(()=>{const b=document.createElement('button');b.id='t-caught';b.dataset.caught='1';b.textContent='標記已釣';b.onclick=()=>{window.__clicked=(window.__clicked||0)+1};document.getElementById('fishing').prepend(b)});
    await page.click('#t-caught');
    assert.strictEqual(await page.evaluate(()=>window.__clicked),1);
    assert.strictEqual(await page.evaluate(()=>document.querySelectorAll('body > .fx-splash').length),3);
    await page.waitForFunction(()=>!document.querySelector('.fx-splash,.fx-spark'),null,{timeout:4000});
    await ctx.close();
  });

  await test('8 減少動態：沒有粒子、水波、火花與慶祝，功能與內容照常',async()=>{
    const {ctx,page,errors}=await open({reducedMotion:'reduce'});
    assert.strictEqual((await page.evaluate(()=>SiteFx.sky())).running,false);
    assert.strictEqual(await page.evaluate(()=>getComputedStyle(document.querySelector('.fx-sky')).display),'none');
    const count=await page.evaluate(()=>document.querySelectorAll('#daily-list input').length);
    for(let i=0;i<count;i++)await page.click('#daily-list input >> nth='+i);
    await page.click('nav button[data-tab="leveling"]');
    assert.ok(await page.isVisible('#leveling'));
    assert.strictEqual(await overlays(page),0);
    assert.strictEqual(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length),0,'不該有進行中的動畫');
    assert.deepStrictEqual(errors,[]);await ctx.close();
  });

  await test('9 手機寬度：三個分頁都不會橫向捲動',async()=>{
    const {ctx,page,errors}=await open({viewport:{width:390,height:844}});
    for(const tab of ['dashboard','leveling','fishing']){
      await page.click('nav button[data-tab="'+tab+'"]');await page.waitForTimeout(400);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),tab+' 出現橫向捲動');
    }
    assert.deepStrictEqual(errors,[]);await ctx.close();
  });

  await browser.close();server.close();
  console.log(passed+' passed');
})();
