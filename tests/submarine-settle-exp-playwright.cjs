// 返航結算 EXP check for submarine.html (Playwright + Chromium).
// Each route point gets its own EXP field; the sum fills 本趟合計 EXP and the Rank/EXP after return.
// Run: node tests/submarine-settle-exp-playwright.cjs
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
const seed={fuel:1600,repair:300,
  ships:[{registered:true,rank:1,exp:5000,name:''},{registered:true,rank:61,exp:0,name:''},{registered:false},{registered:false}],
  unlocks:{},logs:[],activeSectorMap:1};

(async()=>{
  const server=await serve(),base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch();
  try{
    const ctx=await browser.newContext();
    await ctx.route(/imgur|universalis/,route=>route.abort());
    await ctx.addInitScript(([key,value])=>{
      if(localStorage.getItem('__seeded'))return;
      localStorage.setItem('__seeded','1');localStorage.setItem(key,value);
    },[KEY,JSON.stringify(seed)]);
    const page=await ctx.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/submarine.html');
    await page.waitForFunction(()=>/6,180/.test(document.getElementById('settle-ship-progress').textContent));
    const form=()=>page.evaluate(()=>({gain:document.getElementById('settle-gain').value,
      rank:document.getElementById('settle-rank').value,exp:document.getElementById('settle-exp').value}));

    assert.match(await page.textContent('#settle-ship-progress'),/Rank 1 · 5,000 \/ 6,180 EXP（還差 1,180）/);
    await page.fill('#loot-route-input','AB');
    await page.waitForFunction(()=>document.querySelectorAll('#settle-exp-points input').length===2);
    const fields=page.locator('#settle-exp-points input');
    await fields.nth(0).fill('4000');await fields.nth(1).fill('3000');
    // 5,000 + 7,000 passes Rank 1's 6,180, so the ship lands on Rank 2 with 5,820 carried over.
    assert.deepStrictEqual(await form(),{gain:'7000',rank:'2',exp:'5820'});
    assert.match(await page.textContent('#settle-after'),/升 1 級/);
    console.log('PASS 各航點 EXP 加總並推算升級');

    await fields.nth(0).fill('');await fields.nth(1).fill('');
    assert.deepStrictEqual(await form(),{gain:'',rank:'1',exp:'5000'});
    console.log('PASS 清空航點 EXP 時還原目前進度');

    await page.fill('#settle-gain','100');
    assert.deepStrictEqual(await form(),{gain:'100',rank:'1',exp:'5100'});
    console.log('PASS 直接輸入合計 EXP 也會推算');

    await page.selectOption('#settle-ship','2');
    await page.fill('#loot-route-input','AB');
    await page.waitForFunction(()=>document.querySelectorAll('#settle-exp-points input').length===2);
    await fields.nth(0).fill('800000');
    await page.click('#settle-save');
    await page.waitForFunction(()=>/已結算/.test(document.getElementById('settle-status').textContent));
    const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
    assert.strictEqual(saved.ships[1].rank,62);
    assert.strictEqual(saved.ships[1].exp,74219);
    assert.strictEqual(saved.logs.at(-1).exp,800000);
    assert.strictEqual(await page.locator('#settle-exp-points').isHidden(),true);
    assert.match(await page.textContent('#settle-ship-progress'),/Rank 62 · 74,219/);
    console.log('PASS 結算後存入新 Rank／EXP 並清空航點欄位');

    assert.deepStrictEqual(errors,[]);
    console.log('submarine settle exp: ok');
  }finally{
    await browser.close();server.close();
  }
})().catch(e=>{console.error(e);process.exit(1)});
