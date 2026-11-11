// Bridge FX: interactive motion on the submarine page. Presentation only; must never touch saved data.
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
    {registered:true,rank:30,exp:0,voyaging:true,voyage:{departedAt:now-10*HOUR,etaAt:now+9*HOUR,route:'溺沒海 A → B'}},{},{}],
    unlocks:{},logs:[],activeSectorMap:1};
}
let browser,base,passed=0;
async function open(opts={}){
  const ctx=await browser.newContext({viewport:opts.viewport||{width:1280,height:800},reducedMotion:opts.reducedMotion||'no-preference'});
  await ctx.route(/imgur|universalis/,route=>route.abort());
  await ctx.addInitScript(([key,value])=>{if(!localStorage.getItem('__fx_seeded')){localStorage.setItem('__fx_seeded','1');localStorage.setItem(key,value)}},[KEY,JSON.stringify(seed())]);
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/submarine.html');
  await page.waitForFunction(()=>window.BridgeFx&&document.documentElement.classList.contains('fx-ready'));
  return {ctx,page,errors};
}
async function test(name,fn){try{await fn();passed++;console.log('ok  '+name)}catch(e){console.error('FAIL '+name+'\n'+e.stack);process.exitCode=1}}
(async()=>{
  const server=await serve();base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch();

  await test('1 標題：泡泡動畫啟動，點一下出現聲納波；標題文字與版本號不變',async()=>{
    const {ctx,page,errors}=await open();
    assert.strictEqual((await page.textContent('header h1')).trim(),'⚓ 潛水艇養成計畫');
    assert.ok(/版本/.test(await page.textContent('header')),'版本號應保留');
    const before=await page.evaluate(()=>BridgeFx.hero());
    assert.ok(before.running&&before.bubbles>10,JSON.stringify(before));
    await page.mouse.click(600,150);
    const after=await page.evaluate(()=>BridgeFx.hero());
    assert.ok(after.pings>=1&&after.bubbles>before.bubbles,JSON.stringify(after));
    // Header buttons still work as buttons and do not trigger the effect.
    const box=await page.locator('#import-data-button').boundingBox();
    const n=(await page.evaluate(()=>BridgeFx.hero())).pings;
    await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
    assert.ok((await page.evaluate(()=>BridgeFx.hero())).pings<=n);
    assert.deepStrictEqual(errors,[]);await ctx.close();
  });

  await test('2 導覽：亮塊跟著目前區段滑動，進度線隨捲動變長',async()=>{
    const {ctx,page}=await open();
    const pillX=()=>page.evaluate(()=>document.querySelector('.fx-nav-pill').getBoundingClientRect().left);
    const linkX=sel=>page.evaluate(sel=>document.querySelector(sel).getBoundingClientRect().left,sel);
    assert.ok(Math.abs(await pillX()-await linkX('.bridge-nav a.is-active'))<2);
    await page.click('.bridge-nav a[href="#return-settlement"]');
    await page.waitForFunction(()=>scrollY>300);
    await page.waitForFunction(()=>{const a=document.querySelector('.bridge-nav a.is-active');if(!a||a.hash==='#overview-panel')return false;
      const p=document.querySelector('.fx-nav-pill').getBoundingClientRect(),r=a.getBoundingClientRect();return Math.abs(p.left-r.left)<2&&Math.abs(p.width-r.width)<2});
    await page.waitForFunction(()=>{const m=getComputedStyle(document.querySelector('.fx-scroll-progress')).transform.match(/matrix\(([^,]+)/);return m&&Number(m[1])>.1});
    await ctx.close();
  });

  await test('3 捲動顯示：畫面外的區塊先隱藏，捲到才浮現；跳錨點也不會留下看不到的區塊',async()=>{
    const {ctx,page}=await open();
    assert.ok(await page.evaluate(()=>document.querySelectorAll('.fx-reveal').length)>0);
    assert.strictEqual(await page.evaluate(()=>document.querySelector('#overview-panel').classList.contains('fx-reveal')),false,'一開始就在畫面上的區塊不該被隱藏');
    await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,document.documentElement.scrollHeight)});
    await page.waitForFunction(()=>[...document.querySelectorAll('main > .panel')].filter(el=>{const r=el.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0}).every(el=>!el.classList.contains('fx-reveal')));
    await page.waitForTimeout(700);
    const visible=await page.evaluate(()=>[...document.querySelectorAll('main > .panel')].filter(el=>{const r=el.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0}).map(el=>getComputedStyle(el).opacity));
    assert.ok(visible.length&&visible.every(o=>o==='1'),String(visible));
    await ctx.close();
  });

  await test('4 按鈕水波畫在按鈕上方，不改按鈕內容；功能照常',async()=>{
    const {ctx,page}=await open();
    const html=await page.innerHTML('#calc-routes');
    const box=await page.locator('#calc-routes').boundingBox();
    await page.locator('#calc-routes').scrollIntoViewIfNeeded();
    const b2=await page.locator('#calc-routes').boundingBox();
    await page.mouse.move(b2.x+20,b2.y+b2.height/2);await page.mouse.down();
    assert.strictEqual(await page.locator('.fx-ripple').count(),1);
    await page.mouse.up();
    assert.strictEqual(await page.innerHTML('#calc-routes'),html);
    await page.locator('.voyage-depart-button').first().waitFor();
    await page.waitForFunction(()=>!document.querySelector('.fx-ripple'));
    await ctx.close();
  });

  await test('5 數字變動時有滾動動畫，顯示的文字立刻就是正確值',async()=>{
    const {ctx,page}=await open();
    await page.fill('#fuel-stock','1234');await page.locator('#fuel-stock').blur();
    await page.waitForFunction(()=>document.getElementById('ui-fuel').textContent==='1,234');
    assert.ok(await page.evaluate(()=>document.getElementById('ui-fuel').getAnimations().length)>=1,'應有滾動動畫');
    await ctx.close();
  });

  await test('6 結算升級時出現慶祝特效，結束後自動清掉',async()=>{
    const {ctx,page}=await open();
    const before=await page.evaluate(k=>localStorage.getItem(k),KEY);
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('submarine-settlement-saved',{detail:{index:0,loot:[],rankBefore:20,rankAfter:21}})));
    await page.locator('.fx-rankup').waitFor({state:'attached'});
    assert.ok((await page.textContent('.fx-rankup')).includes('Rank 20 → 21'));
    assert.strictEqual(await page.locator('.fx-burst').count(),1);
    await page.waitForFunction(()=>!document.querySelector('.fx-rankup')&&!document.querySelector('.fx-burst'),null,{timeout:8000});
    // No rank change, no celebration.
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('submarine-settlement-saved',{detail:{index:0,loot:[],rankBefore:21,rankAfter:21}})));
    await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('.fx-rankup').count(),0);
    assert.strictEqual(await page.evaluate(k=>localStorage.getItem(k),KEY),before,'特效不得改動資料');
    await ctx.close();
  });

  await test('7 減少動態：沒有泡泡、水波、慶祝與浮現動畫，內容全部直接可見',async()=>{
    const {ctx,page}=await open({reducedMotion:'reduce'});
    assert.strictEqual((await page.evaluate(()=>BridgeFx.hero())).running,false);
    assert.strictEqual(await page.evaluate(()=>getComputedStyle(document.querySelector('.fx-hero')).display),'none');
    assert.strictEqual(await page.evaluate(()=>document.querySelectorAll('.fx-reveal').length),0);
    await page.locator('#calc-routes').scrollIntoViewIfNeeded();
    const b=await page.locator('#calc-routes').boundingBox();
    await page.mouse.move(b.x+20,b.y+10);await page.mouse.down();
    assert.strictEqual(await page.locator('.fx-ripple').count(),0);
    await page.mouse.up();
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('submarine-settlement-saved',{detail:{index:0,loot:[],rankBefore:20,rankAfter:21}})));
    await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('.fx-rankup').count(),0);
    await ctx.close();
  });

  await test('8 手機寬度：頁面不會橫向捲動，導覽會把目前區段捲進可見範圍',async()=>{
    const {ctx,page}=await open({viewport:{width:390,height:844}});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'出現橫向捲動');
    await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';document.getElementById('routes-panel').scrollIntoView()});
    await page.waitForFunction(()=>{const a=document.querySelector('.bridge-nav a.is-active');if(!a)return false;const r=a.getBoundingClientRect();return a.hash==='#routes-panel'&&r.left>=0&&r.right<=window.innerWidth+1},null,{timeout:8000});
    await ctx.close();
  });

  await browser.close();server.close();
  console.log(passed+' passed');
})();
