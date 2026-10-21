// Harbor scene v4 regression tests (Playwright + Chromium): interaction, voyage display, fallback.
// Run: node tests/submarine-harbor-scene-playwright.cjs
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
const HOUR=3600e3;
function fleetSeed(){
  const now=Date.now();
  return {fuel:1600,repair:300,parts:{'1111':4,'0020':4,'3004':4,'0003':0},ships:[
    {registered:true,rank:20,exp:0,name:'鸚鵡螺',currentBuild:'1121'},
    {registered:true,rank:30,exp:0,voyaging:true,voyage:{departedAt:now-2*HOUR,etaAt:now+20*HOUR,route:'溺沒海 A → B'}},
    {registered:true,rank:40,exp:0,voyaging:true,voyage:{departedAt:now-30*HOUR,etaAt:now+3*HOUR,route:'灰海 O → J'}},
    {registered:true,rank:50,exp:0,voyaging:true,voyage:{departedAt:now-30*HOUR,etaAt:now-HOUR,route:'翠浪海 A → C'}}],
    unlocks:{},logs:[],activeSectorMap:1};
}
let browser,base,passed=0;const results=[];
async function open(seed,opts={}){
  const ctx=await browser.newContext({viewport:opts.viewport||{width:1440,height:900},reducedMotion:opts.reducedMotion||'no-preference'});
  await ctx.route(/imgur|universalis/,route=>route.abort());
  await ctx.addInitScript(([key,value,noCanvas])=>{
    if(!localStorage.getItem('__harbor_seeded')){localStorage.setItem('__harbor_seeded','1');localStorage.setItem(key,value)}
    if(noCanvas)HTMLCanvasElement.prototype.getContext=()=>null;
  },[KEY,JSON.stringify(seed),Boolean(opts.noCanvas)]);
  const page=await ctx.newPage();page.errors=[];
  page.on('pageerror',e=>page.errors.push(e.message));
  page.on('dialog',d=>d.accept());
  await page.goto(base+'/submarine.html');
  await page.waitForFunction(()=>document.readyState==='complete');
  await page.waitForTimeout(800);
  return {ctx,page};
}
const boatBox=(page,i)=>page.evaluate(i=>{const b=document.querySelector('[data-harbor-ship="'+i+'"]'),r=b.getBoundingClientRect();return {hidden:b.hidden,cx:r.left+r.width/2,bottom:r.bottom,width:r.width,cls:b.className}},i);
async function tooltipFor(page,i){
  await page.hover('[data-harbor-ship="'+i+'"]',{force:true});await page.waitForTimeout(120);
  const text=await page.evaluate(()=>{const t=document.getElementById('harbor-tooltip');return t.hidden?null:t.innerText.replace(/\s+/g,' ')});
  await page.mouse.move(3,3);return text;
}
async function test(name,fn){
  const started=Date.now();
  try{await fn();passed++;results.push('PASS '+name+' ('+(Date.now()-started)+'ms)')}
  catch(e){results.push('FAIL '+name+'\n     '+String(e.stack||e).split('\n').slice(0,3).join('\n     '));process.exitCode=1}
}

async function main(){
  const server=await serve();base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}
    :fs.existsSync('/opt/pw-browsers/chromium')?{executablePath:'/opt/pw-browsers/chromium'}:{});

  for(const [label,viewport] of [['桌面',{width:1440,height:900}],['手機',{width:390,height:844}]]){
    await test(label+'：場景啟動、四艘船可見且提示框狀態正確',async()=>{
      const {ctx,page}=await open(fleetSeed(),{viewport});
      assert.ok(await page.evaluate(()=>document.getElementById('mini-harbor').classList.contains('has-scene')),'場景未啟動');
      const painted=await page.evaluate(()=>{const c=document.querySelector('.harbor-scene'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n/(c.width*c.height)});
      assert.ok(painted>.4,'畫布幾乎空白：'+painted);
      const expect=['停泊待命','出航中','返航中','預計返航時間已到・待結算'];
      for(let i=0;i<4;i++){
        assert.strictEqual((await boatBox(page,i)).hidden,false);
        const tip=await tooltipFor(page,i);
        assert.ok(tip&&tip.includes(expect[i]),'第 '+(i+1)+' 艘提示框：'+tip);
      }
      assert.ok((await tooltipFor(page,0)).includes('鸚鵡螺'));
      assert.deepStrictEqual(page.errors,[]);
      await ctx.close();
    });

    await test(label+'：海上船隻各自分道、縮小，不重疊；停泊船回到泊位',async()=>{
      const {ctx,page}=await open(fleetSeed(),{viewport});
      const boxes=[];for(let i=0;i<4;i++)boxes.push(await boatBox(page,i));
      const atSea=[boxes[1],boxes[2]];
      for(const b of atSea)assert.ok(b.width<40,'海上船應縮小：'+b.width);
      assert.ok(Math.abs(atSea[0].cx-atSea[1].cx)>atSea[0].width,'海上兩艘船重疊：'+atSea.map(b=>b.cx));
      for(const i of [0,3]){
        const berth=await page.evaluate(i=>{const walls=[...document.querySelectorAll('.harbor-slip-wall')].map(w=>{const r=w.getBoundingClientRect();return r.left+r.width/2});return (walls[i]+walls[i+1])/2},i);
        assert.ok(Math.abs(boxes[i].cx-berth)<3,'第 '+(i+1)+' 艘未停在泊位');
      }
      await ctx.close();
    });
  }

  await test('鍵盤：Tab 聚焦潛水艇會顯示提示框，離開後隱藏',async()=>{
    const {ctx,page}=await open(fleetSeed());
    await page.focus('[data-harbor-ship="2"]');await page.waitForTimeout(120);
    const shown=await page.evaluate(()=>!document.getElementById('harbor-tooltip').hidden&&document.getElementById('harbor-tooltip').innerText);
    assert.ok(shown&&shown.includes('返航中'),'聚焦未顯示提示框');
    await page.evaluate(()=>document.activeElement.blur());await page.waitForTimeout(80);
    assert.ok(await page.evaluate(()=>document.getElementById('harbor-tooltip').hidden));
    await ctx.close();
  });

  await test('確認出航後，船隻離開泊位並開始移動',async()=>{
    const seed=fleetSeed();seed.ships[0].voyaging=false;
    const {ctx,page}=await open(seed);
    const before=await boatBox(page,0);
    await page.waitForSelector('[data-depart-ship="0"]',{timeout:20000});
    await page.click('[data-depart-ship="0"]');
    await page.waitForTimeout(2500);
    const mid=await boatBox(page,0);
    assert.ok(mid.cls.includes('is-sailing'),'未標記為出航');
    assert.ok(mid.bottom!==before.bottom||mid.cx!==before.cx,'出航後船隻未移動');
    await page.waitForTimeout(3000);
    const later=await boatBox(page,0);
    assert.ok(later.cx>mid.cx,'船隻應向外海移動：'+mid.cx+' → '+later.cx);
    await ctx.close();
  });

  await test('隨機事件仍會出現（既有 harbor-event）',async()=>{
    const {ctx,page}=await open(fleetSeed());
    await page.waitForSelector('#harbor-ambient .harbor-event',{timeout:15000,state:'attached'});
    await ctx.close();
  });

  await test('減少動態偏好：畫面為靜態圖，無動畫循環',async()=>{
    const {ctx,page}=await open(fleetSeed(),{reducedMotion:'reduce'});
    assert.ok(await page.evaluate(()=>document.getElementById('mini-harbor').classList.contains('has-scene')));
    const a=await page.evaluate(()=>window.HarborScene.stats().frames);
    await page.waitForTimeout(1500);
    const b=await page.evaluate(()=>window.HarborScene.stats().frames);
    assert.ok(b-a<=1,'reduced motion 仍持續繪製：'+(b-a));
    assert.strictEqual(await page.evaluate(()=>document.getAnimations().filter(x=>x.playState==='running').length),0);
    assert.ok((await tooltipFor(page,1)).includes('出航中'));
    await ctx.close();
  });

  await test('畫布無法使用時保留原本碼頭（不隱藏舊版元素）',async()=>{
    const {ctx,page}=await open(fleetSeed(),{noCanvas:true});
    const state=await page.evaluate(()=>({scene:document.getElementById('mini-harbor').classList.contains('has-scene'),
      quay:getComputedStyle(document.querySelector('.harbor-quay')).visibility,sprite:getComputedStyle(document.querySelector('.harbor-sprite')).visibility}));
    assert.deepStrictEqual(state,{scene:false,quay:'visible',sprite:'visible'});
    assert.ok((await tooltipFor(page,1)).includes('出航中'));
    assert.deepStrictEqual(page.errors,[]);
    await ctx.close();
  });

  await browser.close();server.close();
  console.log(results.join('\n'));
  console.log(passed+' passed, '+results.filter(r=>r.startsWith('FAIL')).length+' failed');
}
main().catch(e=>{console.error(e);process.exit(1)});
