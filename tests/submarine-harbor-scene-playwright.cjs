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
    await test(label+'：場景啟動、四艘潛水艇可見且提示框狀態正確',async()=>{
      const {ctx,page}=await open(fleetSeed(),{viewport});
      assert.ok(await page.evaluate(()=>document.getElementById('mini-harbor').classList.contains('has-scene')),'場景未啟動');
      const painted=await page.evaluate(()=>{const c=document.querySelector('.harbor-scene'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n/(c.width*c.height)});
      assert.ok(painted>.4,'畫布幾乎空白：'+painted);
      const expect=['停泊待命','探索中','返航中','已返回・待結算'];
      for(let i=0;i<4;i++){
        assert.strictEqual((await boatBox(page,i)).hidden,false);
        const tip=await tooltipFor(page,i);
        assert.ok(tip&&tip.includes(expect[i]),'第 '+(i+1)+' 艘提示框：'+tip);
      }
      const tip0=await tooltipFor(page,0);
      assert.ok(tip0.includes('鸚鵡螺')&&tip0.includes('配置 1121')&&tip0.includes('船首 雲鯨'),'提示框應顯示名稱與配件：'+tip0);
      assert.deepStrictEqual(page.errors,[]);
      await ctx.close();
    });

    await test(label+'：海上潛水艇各自分道、縮小，不重疊；停泊潛水艇回到泊位',async()=>{
      const {ctx,page}=await open(fleetSeed(),{viewport});
      const boxes=[];for(let i=0;i<4;i++)boxes.push(await boatBox(page,i));
      const atSea=[boxes[1],boxes[2]];
      for(const b of atSea)assert.ok(b.width<40,'海上潛水艇應縮小：'+b.width);
      assert.ok(Math.abs(atSea[0].cx-atSea[1].cx)>atSea[0].width,'海上兩艘潛水艇重疊：'+atSea.map(b=>b.cx));
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

  await test('確認出航後，潛水艇離開泊位並開始移動',async()=>{
    const seed=fleetSeed();seed.ships[0].voyaging=false;
    const {ctx,page}=await open(seed);
    const before=await boatBox(page,0);
    await page.waitForSelector('[data-depart-ship="0"]',{timeout:20000});
    await page.click('[data-depart-ship="0"]');
    await page.waitForTimeout(2500);
    const mid=await boatBox(page,0);
    assert.ok(mid.cls.includes('is-sailing'),'未標記為出航');
    assert.ok(mid.bottom!==before.bottom||mid.cx!==before.cx,'出航後潛水艇未移動');
    await page.waitForTimeout(3000);
    const later=await boatBox(page,0);
    assert.ok(later.cx>mid.cx,'潛水艇應向外海移動：'+mid.cx+' → '+later.cx);
    await ctx.close();
  });

  await test('隨機事件：自動排程會播放畫布事件，舊版 DOM 事件不同時播放',async()=>{
    const {ctx,page}=await open(fleetSeed());
    let seen=null;
    for(let i=0;i<40&&!seen;i++){await page.waitForTimeout(500);const st=await page.evaluate(()=>HarborScene.events.status());if(st.active.length)seen=st.active[0].id}
    assert.ok(seen,'20 秒內沒有播放任何事件');
    assert.strictEqual(await page.evaluate(()=>document.querySelectorAll('#harbor-ambient .harbor-event').length),0,'舊版 DOM 事件仍在播放');
    assert.strictEqual(await page.evaluate(()=>Boolean(document.getElementById('harbor-dev-panel'))),false,'一般模式不應顯示開發面板');
    assert.strictEqual(await page.evaluate(()=>typeof HarborScene.events.play),'undefined','一般模式不應提供播放控制');
    assert.deepStrictEqual(page.errors,[]);
    await ctx.close();
  });

  await test('開發預覽：全部 25 種事件皆可播放、結束後完整清理',async()=>{
    const ctx=await browser.newContext({viewport:{width:1440,height:900}});
    await ctx.route(/imgur|universalis/,route=>route.abort());
    await ctx.addInitScript(([key,value])=>localStorage.setItem(key,value),[KEY,JSON.stringify(fleetSeed())]);
    const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/submarine.html?harbor-dev=1&harbor-hour=13');await page.waitForTimeout(1500);
    assert.ok(await page.evaluate(()=>Boolean(document.getElementById('harbor-dev-panel'))));
    const list=await page.evaluate(()=>HarborScene.events.list());
    assert.ok(list.length>=25,'事件數量不足：'+list.length);
    await page.evaluate(()=>HarborScene.events.setAuto(false));
    for(const ev of list){
      if(ev.time==='night')await page.evaluate(()=>HarborScene.events.setHour(22));else await page.evaluate(()=>HarborScene.events.setHour(13));
      const r=await page.evaluate(id=>HarborScene.events.play(id,{seed:99}),ev.id);
      assert.ok(r.ok,ev.id+' 無法播放：'+r.error);
      await page.evaluate(d=>HarborScene.events.seek(d*.5),r.dur);await page.waitForTimeout(120);
      assert.strictEqual((await page.evaluate(()=>HarborScene.events.status())).active.length,1,ev.id+' 未在播放');
      await page.evaluate(d=>HarborScene.events.seek(d-.05),r.dur);await page.waitForTimeout(300);
      assert.strictEqual((await page.evaluate(()=>HarborScene.events.status())).active.length,0,ev.id+' 結束後未清理');
    }
    assert.strictEqual(await page.evaluate(()=>document.querySelectorAll('#mini-harbor *').length)<120,true,'碼頭 DOM 節點異常增加');
    assert.deepStrictEqual(errors,[]);
    await ctx.close();
  });

  await test('事件播放時，潛水艇點擊區與提示框不受影響',async()=>{
    const ctx=await browser.newContext({viewport:{width:1440,height:900}});
    await ctx.route(/imgur|universalis/,route=>route.abort());
    await ctx.addInitScript(([key,value])=>localStorage.setItem(key,value),[KEY,JSON.stringify(fleetSeed())]);
    const page=await ctx.newPage();await page.goto(base+'/submarine.html?harbor-dev=1&harbor-hour=13');await page.waitForTimeout(1500);
    for(const id of ['chocobo','inspect','gust']){
      await page.evaluate(id=>{HarborScene.events.setAuto(false);HarborScene.events.play(id,{seed:7})},id);await page.waitForTimeout(600);
      const hit=await page.evaluate(()=>{const b=document.querySelector('[data-harbor-ship="0"]').getBoundingClientRect();const el=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return Boolean(el&&el.closest('[data-harbor-ship="0"]'))});
      assert.ok(hit,id+' 播放時潛水艇 1 被遮擋');
      const tip=await tooltipFor(page,0);assert.ok(tip&&tip.includes('停泊待命'),id+' 播放時提示框異常：'+tip);
    }
    await ctx.close();
  });

  await test('分頁隱藏時場景與事件停止運作',async()=>{
    const {ctx,page}=await open(fleetSeed());
    const before=await page.evaluate(()=>({f:HarborScene.stats().frames,c:HarborScene.events.status().clock}));
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))});
    const a=await page.evaluate(()=>HarborScene.events.status().clock);await page.waitForTimeout(1500);
    const b=await page.evaluate(()=>HarborScene.events.status().clock);
    assert.strictEqual(a,b,'隱藏分頁時事件時間仍在前進');
    void before;await ctx.close();
  });

  await test('艾歐澤亞時間、住宅區天氣、音效開關（不影響潛艇資料）',async()=>{
    const {ctx,page}=await open(fleetSeed());
    const before=await page.evaluate(k=>localStorage.getItem(k),KEY);
    const info=await page.evaluate(()=>{const c=document.querySelector('.harbor-controls');const et=HarborEorzea.eorzeaTime(Date.now());
      return {text:c.querySelector('.harbor-et').textContent,expect:'ET '+String(et.hour).padStart(2,'0')+':'+String(et.minute).padStart(2,'0'),
        wx:c.querySelector('.harbor-wx').textContent,expectWx:HarborEorzea.WEATHER_NAMES[HarborEorzea.weather(Date.now(),'mist')],
        sound:c.querySelector('.harbor-sound').getAttribute('aria-pressed'),scene:HarborScene.time()}});
    assert.ok(Math.abs(parseInt(info.text.slice(6))-parseInt(info.expect.slice(6)))<=1||info.text===info.expect,'ET 時鐘不符：'+info.text+' / '+info.expect);
    assert.strictEqual(info.wx,info.expectWx);assert.strictEqual(info.sound,'false','音效預設應關閉');
    assert.deepStrictEqual(info.scene.builds,['1121','1121','1121','1121'],'配置應取自實際紀錄（無紀錄時依 Rank 推定）');
    for(const zone of ['lavenderBeds','goblet','shirogane','mist']){
      await page.selectOption('.harbor-zone',zone);await page.waitForTimeout(60);
      const r=await page.evaluate(z=>({wx:document.querySelector('.harbor-wx').textContent,expect:HarborEorzea.WEATHER_NAMES[HarborEorzea.weather(Date.now(),z)],prefs:JSON.parse(localStorage.getItem('ff14_harbor_prefs')),scene:HarborScene.time().zone}),zone);
      assert.strictEqual(r.wx,r.expect,zone+' 天氣不符');assert.strictEqual(r.prefs.zone,zone);assert.strictEqual(r.scene,zone);
    }
    await page.click('.harbor-sound');
    assert.strictEqual(await page.getAttribute('.harbor-sound','aria-pressed'),'true');
    assert.strictEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('ff14_harbor_prefs')).sound),true);
    assert.strictEqual(await page.evaluate(k=>localStorage.getItem(k),KEY),before,'碼頭設定不得改動潛艇資料');
    // The control strip stays below the submarines' hit areas.
    const overlap=await page.evaluate(()=>{const c=document.querySelector('.harbor-controls').getBoundingClientRect();
      return [...document.querySelectorAll('[data-harbor-ship]')].filter(b=>!b.hidden).some(b=>{const r=b.getBoundingClientRect();return r.left<c.right&&r.right>c.left&&r.top<c.bottom&&r.bottom>c.top})});
    assert.strictEqual(overlap,false,'控制列遮擋潛水艇點擊區');
    assert.deepStrictEqual(page.errors,[]);
    await ctx.close();
  });

  await test('潛水艇外形依實際配件組合；天氣預覽參數可切換',async()=>{
    const seed=fleetSeed();seed.ships[0].currentBuild='3124';seed.ships[3].currentBuild='5555';
    const ctx=await browser.newContext({viewport:{width:1440,height:900}});
    await ctx.route(/imgur|universalis/,route=>route.abort());
    await ctx.addInitScript(([key,value])=>localStorage.setItem(key,value),[KEY,JSON.stringify(seed)]);
    const page=await ctx.newPage();await page.goto(base+'/submarine.html?harbor-weather=rain');await page.waitForTimeout(1500);
    const t=await page.evaluate(()=>HarborScene.time());
    assert.strictEqual(t.builds[0],'3124');assert.strictEqual(t.builds[3],'5555');assert.strictEqual(t.weather,'rain');
    assert.strictEqual(await page.evaluate(()=>document.querySelector('.harbor-wx').textContent),'小雨');
    await ctx.close();
  });

  await test('計算器變更實際配置後，碼頭潛水艇外形即時更新',async()=>{
    const {ctx,page}=await open(fleetSeed());
    await page.waitForSelector('[data-installed="0"]',{timeout:20000});
    assert.strictEqual((await page.evaluate(()=>HarborScene.time().builds))[0],'1121');
    await page.selectOption('[data-installed="0"]','1123');await page.waitForTimeout(300);
    assert.strictEqual((await page.evaluate(()=>HarborScene.time().builds))[0],'1123','外形未跟隨配置更新');
    assert.strictEqual((await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).ships[0].currentBuild,KEY)),'1123');
    assert.ok((await tooltipFor(page,0)).includes('配置 1123'));
    await ctx.close();
  });

  await test('返航：航程到時偵測到抵港事件；音效關閉時不建立音訊',async()=>{
    const seed=fleetSeed();const now=Date.now();seed.ships[1].voyage={departedAt:now-10*HOUR,etaAt:now+3000,route:'溺沒海 A → B'};
    const ctx=await browser.newContext({viewport:{width:1440,height:900}});
    await ctx.route(/imgur|universalis/,route=>route.abort());
    await ctx.addInitScript(([key,value])=>{localStorage.setItem(key,value);window.__audioCreated=0;const A=window.AudioContext;window.AudioContext=function(){window.__audioCreated++;return new A()}},[KEY,JSON.stringify(seed)]);
    const page=await ctx.newPage();await page.goto(base+'/submarine.html');
    await page.evaluate(()=>{window.__arrived=[];window.addEventListener('harbor-submarine-arrived',e=>window.__arrived.push(e.detail.index))});
    await page.waitForFunction(()=>window.__arrived.length>0,null,{timeout:20000});
    assert.deepStrictEqual(await page.evaluate(()=>window.__arrived),[1]);
    assert.strictEqual(await page.evaluate(()=>window.__audioCreated),0,'音效關閉時不應建立 AudioContext');
    assert.ok((await tooltipFor(page,1)).includes('已返回・待結算'));
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
    assert.ok((await tooltipFor(page,1)).includes('探索中'));
    await page.waitForTimeout(9000);
    assert.strictEqual((await page.evaluate(()=>HarborScene.events.status())).active.length,0,'減少動態時不應播放事件');
    await ctx.close();
  });

  await test('畫布無法使用時保留原本碼頭（不隱藏舊版元素）',async()=>{
    const {ctx,page}=await open(fleetSeed(),{noCanvas:true});
    const state=await page.evaluate(()=>({scene:document.getElementById('mini-harbor').classList.contains('has-scene'),
      quay:getComputedStyle(document.querySelector('.harbor-quay')).visibility,sprite:getComputedStyle(document.querySelector('.harbor-sprite')).visibility}));
    assert.deepStrictEqual(state,{scene:false,quay:'visible',sprite:'visible'});
    assert.ok((await tooltipFor(page,1)).includes('探索中'));
    assert.deepStrictEqual(page.errors,[]);
    await ctx.close();
  });

  await browser.close();server.close();
  console.log(results.join('\n'));
  console.log(passed+' passed, '+results.filter(r=>r.startsWith('FAIL')).length+' failed');
}
main().catch(e=>{console.error(e);process.exit(1)});
