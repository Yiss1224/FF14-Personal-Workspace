// "畢業船撥去開圖" check for submarine.html (Playwright + Chromium).
// Graduated ships normally run O → J; the setting sends the chosen number of them to open the next sea.
// Run: node tests/submarine-explorers-playwright.cjs
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
// 溺沒海、灰海全開，翠浪海未開：三艘 Rank 85+ 畢業船跑 O → J，一艘還在練等。
const seed=(explorers,extra={})=>({fuel:1600,repair:300,parts:{'1111':4,'0020':4,'3004':4,'0003':2},...(extra.partStock&&{partStock:extra.partStock}),
  ships:[ship(88,{currentBuild:'3124'}),ship(86,{currentBuild:'3124'}),ship(85,{currentBuild:'3124'}),ship(60,{currentBuild:'1121'})],
  unlocks:Object.fromEntries((extra.unlocked||range(1,51)).map(id=>['sector-'+id,true])),logs:[],activeSectorMap:1,
  plannerSettings:{maxHours:72,targetRank:85,dailyPickup:true,pickupStart:'19:00',pickupEnd:'22:00',departureTime:'20:00',manualDeparture:true,expandedLongRoutes:true,explorers,...extra.settings}});

async function run(browser,base,explorers,extra){
  const ctx=await browser.newContext();
  await ctx.route(/imgur|universalis/,route=>route.abort());
  await ctx.addInitScript(([key,value])=>{
    if(localStorage.getItem('__seeded'))return;
    localStorage.setItem('__seeded','1');localStorage.setItem(key,value);
  },[KEY,JSON.stringify(seed(explorers,extra))]);
  const page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/submarine.html');
  await page.waitForFunction(()=>document.getElementById('calc-result').children.length>0,null,{timeout:30000})
    .catch(e=>{throw new Error('計算結果沒有出現；頁面錯誤：'+errors.join(' | ')+'（'+e.message+'）')});
  const read=()=>page.evaluate(()=>[...document.querySelectorAll('#calc-result .route-card h3')].map(h=>h.textContent));
  const result={select:await page.$eval('#calc-explorers',el=>el.value),titles:await read()};
  // 在畫面上改設定後要即時重算並保存。
  await page.selectOption('#calc-explorers','0');
  result.afterReset=await read();
  result.saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).plannerSettings.explorers,KEY);
  assert.deepStrictEqual(errors,[],'page errors');
  await ctx.close();
  return result;
}
// 每種型號、每個槽位各 4 件：自動模式會比較大量組合。
const fullStock=Object.fromEntries(range(1,5).flatMap(cls=>range(0,3).map(slot=>[cls+':'+slot,4])));
const count=(titles,text)=>titles.filter(t=>t.includes(text)).length;

(async()=>{
  const server=await serve(),base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium')?{executablePath:'/opt/pw-browsers/chromium'}:{});
  try{
    const none=await run(browser,base,0);
    assert.strictEqual(none.select,'0');
    assert.strictEqual(count(none.titles,'O → J 收益'),3,'預設三艘畢業船都跑 O → J');
    assert.strictEqual(count(none.titles,'畢業船開圖'),0);

    const two=await run(browser,base,2);
    assert.strictEqual(two.select,'2');
    assert.strictEqual(count(two.titles,'畢業船開圖'),2,'撥出兩艘畢業船開圖：'+two.titles.join(' | '));
    assert.strictEqual(count(two.titles,'O → J 收益'),1,'剩一艘畢業船跑 O → J');
    assert.ok(two.titles.some(t=>t.includes('潛水艇 1')&&t.includes('畢業船開圖')),'Rank 最高的船優先撥出');
    assert.ok(two.titles.some(t=>t.includes('潛水艇 4')&&t.includes('升等優先')),'練等船不必再負責開圖');
    assert.strictEqual(count(two.afterReset,'畢業船開圖'),0,'改回 0 艘後即時重算');
    assert.strictEqual(two.afterReset.length,4);
    assert.strictEqual(two.saved,0,'設定保存在 plannerSettings');

    const four=await run(browser,base,4);
    assert.strictEqual(count(four.titles,'畢業船開圖'),3,'只有三艘畢業船可撥');
    // 回歸：撥出的船有些配置在回航上限內到不了開圖前置點時，不能讓計算中斷。
    // 溺沒海 AA、AC 未開、24 小時上限、撥 1 艘、部件齊全。
    const short=await run(browser,base,1,{unlocked:range(1,30).filter(id=>id!==27&&id!==29),settings:{maxHours:24},partStock:fullStock});
    assert.strictEqual(count(short.titles,'畢業船開圖'),1,'撥出一艘開圖：'+short.titles.join(' | '));
    assert.strictEqual(short.titles.length,4,'四艘都有建議卡片');
    console.log('submarine explorers: ok');
  }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
