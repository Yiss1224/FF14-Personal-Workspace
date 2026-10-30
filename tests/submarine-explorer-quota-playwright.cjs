// 回歸：「畢業船撥去開圖」名額要算進已出港開圖的船 (Playwright + Chromium)。
// 四艘都畢業、撥 1 艘：QA1 換裝出航去開圖後重算，不能再叫 QA2 去開同一處。
// Run: node tests/submarine-explorer-quota-playwright.cjs
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
const ship=(rank,extra={})=>({registered:true,rank,exp:0,name:'QA'+extra.n,currentBuild:'3124',...extra});
// 每種型號、每個槽位各 4 件，讓撥出的船可以換裝。
const fullStock=Object.fromEntries(range(1,5).flatMap(cls=>range(0,3).map(slot=>[cls+':'+slot,4])));
// frontier：海圖入口都開、只剩幾個航點；next：翠浪海還沒開，撥出船去開下一張海圖的前置點。
const unlocked={
  frontier:range(1,149).filter(id=>![126,128,...range(140,149)].includes(id)),
  next:range(1,51)
};
const seed=(explorers,exploreMode,scene)=>({fuel:1600,repair:300,partStock:fullStock,
  ships:[ship(140,{n:1}),ship(130,{n:2}),ship(120,{n:3}),ship(110,{n:4})],
  unlocks:Object.fromEntries(unlocked[scene].map(id=>['sector-'+id,true])),logs:[],activeSectorMap:1,
  plannerSettings:{maxHours:72,targetRank:85,dailyPickup:true,pickupStart:'19:00',pickupEnd:'22:00',departureTime:'20:00',manualDeparture:true,expandedLongRoutes:true,explorers,exploreMode}});

async function run(browser,base,{explorers,exploreMode,scene}){
  const ctx=await browser.newContext();
  await ctx.route(/imgur|universalis/,route=>route.abort());
  await ctx.addInitScript(([key,value])=>{
    if(localStorage.getItem('__seeded'))return;
    localStorage.setItem('__seeded','1');localStorage.setItem(key,value);
  },[KEY,JSON.stringify(seed(explorers,exploreMode,scene))]);
  const page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/submarine.html');
  await page.waitForFunction(()=>document.getElementById('calc-result').children.length>0,null,{timeout:60000});
  const read=()=>page.evaluate(()=>({
    hint:[...document.querySelectorAll('#calc-result > p.hint')].map(p=>p.textContent).join(' '),
    cards:[...document.querySelectorAll('#calc-result .route-card')].map(c=>({title:c.querySelector('h3').textContent,text:c.textContent}))
  }));
  const before=await read();
  // 依建議換裝（若需要）並確認出航第一艘撥出的船。
  const card=page.locator('#calc-result .route-card',{has:page.locator('h3',{hasText:'畢業船開圖'})}).first();
  const swap=card.locator('[data-apply-build]');
  if(await swap.count()){await swap.click();await page.waitForTimeout(300)}
  const fresh=page.locator('#calc-result .route-card',{has:page.locator('h3',{hasText:'畢業船開圖'})}).first();
  const afterSwap=await fresh.textContent();
  await fresh.locator('[data-depart-ship]').click();
  await page.locator('[data-dialog-ok]').click();
  await page.waitForFunction(()=>document.querySelector('#calc-result')?.textContent.includes('配件已占用'),null,{timeout:60000});
  const after=await read();
  const voyage=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).ships[0].voyage,KEY);
  assert.deepStrictEqual(errors,[],'page errors');
  await ctx.close();
  return {before,afterSwap,after,voyage};
}
const explorerCards=r=>r.cards.filter(c=>c.title.includes('畢業船開圖'));

(async()=>{
  const server=await serve(),base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium')?{executablePath:'/opt/pw-browsers/chromium'}:{});
  try{
    for(const [scene,exploreMode] of [['frontier','frontier'],['frontier','balanced'],['next','next']]){
      const tag=scene+'/'+exploreMode;
      const one=await run(browser,base,{explorers:1,exploreMode,scene});
      assert.strictEqual(explorerCards(one.before).length,1,tag+' 撥 1 艘：'+one.before.cards.map(c=>c.title).join(' | '));
      assert.ok(explorerCards(one.before)[0].title.includes('QA1'),tag+' Rank 最高的 QA1 先撥出');
      assert.strictEqual(one.voyage.purpose,'explore',tag+' 出航紀錄標記為撥出開圖');
      assert.strictEqual(explorerCards(one.after).length,0,tag+' QA1 出港後名額已滿，不能再撥 QA2：'+one.after.cards.map(c=>c.title).join(' | '));
      assert.strictEqual(one.after.cards.filter(c=>c.title.includes('O → J 收益')).length,3,tag+' 其他三艘照常 O → J');
      assert.ok(one.after.cards[0].text.includes('開圖中（計入「畢業船撥去開圖」名額）'),one.after.cards[0].text);
      assert.ok(one.after.hint.includes('已有 1 艘撥出的畢業船出港開圖'),tag+' '+one.after.hint);
      // 換成建議配置後不再顯示換裝比較（以前會拿開圖航線去比練等航線，顯示 -96%）。
      assert.ok(!/比目前|相較目前配置/.test(one.afterSwap),tag+' 已是建議配置時不顯示換裝比較：'+one.afterSwap);
    }
    // 撥 2 艘：QA1 出港後只再補 1 艘。
    const two=await run(browser,base,{explorers:2,exploreMode:'frontier',scene:'frontier'});
    assert.strictEqual(explorerCards(two.before).length,2);
    assert.strictEqual(explorerCards(two.after).length,1,'撥 2 艘、已出港 1 艘：只再補 1 艘');
    assert.ok(explorerCards(two.after)[0].title.includes('QA2'));
    console.log('submarine explorer quota: ok');
  }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
