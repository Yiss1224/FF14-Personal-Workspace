// 釣魚資料只在釣魚分頁第一次打開後才下載，而且每份只抓一次。
// 以前：只開首頁也會抓 XIVAPI 三張表、台服 Item.csv 等，第一次造訪還各抓兩次。
// Run: node tests/fishing-lazy-load-playwright.cjs
'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
function loadPlaywright(){for(const id of ['playwright','/opt/node22/lib/node_modules/playwright']){try{return require(id)}catch(e){}}throw new Error('playwright missing')}
const {chromium}=loadPlaywright();
const ROOT=path.resolve(__dirname,'..');
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
function serve(){const server=http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return}res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res)});return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)))}
const fishRows=Array.from({length:40},(_,i)=>({row_id:i+1,fields:{IsInLog:true,IsHidden:false,AchievementCredit:0,Item:{row_id:1000+i,fields:{Name:`Fish ${i}`}},FishingSpot:{row_id:1,fields:{PlaceName:{fields:{Name:'Bronze Lake'}},TerritoryType:{fields:{PlaceName:{fields:{Name:'Upper La Noscea'}},PlaceNameRegion:{fields:{Name:'La Noscea'}}}},X:0,Z:0}}}}));
const CSV='key,0\n#,Name\nint32,str\n1000,"魚"\n';
async function open(browser,base,url){
  const ctx=await browser.newContext(),page=await ctx.newPage(),hits=[];
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,async route=>{
    const u=new URL(route.request().url());
    // 分頁查詢的後續頁（after=…）不算重複下載，只記每份資料的第一頁。
    if(!u.searchParams.get('after'))hits.push(u.host+u.pathname);
    if(/xivapi/.test(u.host)){
      await new Promise(r=>setTimeout(r,600));   // 模擬真實下載時間，讓「下載中又被觸發一次」的情況會發生
      const sheet=u.pathname.split('/').pop();
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({rows:!u.searchParams.get('after')&&sheet==='FishParameter'?fishRows:[]})});
    }
    if(u.pathname.endsWith('.csv'))return route.fulfill({status:200,contentType:'text/plain',body:CSV});
    return route.abort();
  });
  await page.goto(base+url);
  return {ctx,page,hits};
}
const count=(hits,part)=>hits.filter(h=>h.includes(part)).length;
(async()=>{
  const server=await serve(),base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({args:['--no-proxy-server']});
  try{
    // 1. 首頁：停留期間不向外部要任何釣魚資料。
    const a=await open(browser,base,'/index.html');
    await a.page.waitForTimeout(9500);
    const early=a.hits.filter(h=>!/ContentFinderCondition|consolegameswiki/.test(h));   // 練等分頁的副本資料不在這次範圍
    assert.deepStrictEqual(early,[],'只開首頁不應下載釣魚資料：'+early.join(', '));
    assert.strictEqual(await a.page.evaluate(()=>window.FF14Fishing.isActive()),false);

    // 2. 點進釣魚分頁才開始，而且第一次造訪每份資料只抓一次。
    await a.page.click('nav button[data-tab="fishing"]');
    await a.page.waitForFunction(()=>window.__fishCatalogState==='ready',null,{timeout:15000});
    await a.page.waitForTimeout(11000);
    for(const sheet of ['/sheet/FishParameter','/sheet/SpearfishingItem','/sheet/FishingSpot'])
      assert.strictEqual(count(a.hits,sheet),1,`${sheet} 應只下載一次，實際 ${count(a.hits,sheet)}`);
    assert.strictEqual(count(a.hits,'ffxiv-datamining-tc/main/Item.csv'),1,'台服 Item.csv 應只下載一次，實際 '+count(a.hits,'ffxiv-datamining-tc/main/Item.csv'));
    assert.strictEqual(count(a.hits,'js-yaml'),1,'js-yaml 應在需要時載入一次');
    assert.strictEqual(await a.page.evaluate(()=>JSON.parse(localStorage.getItem('fishCatalog')||'[]').length),40,'圖鑑應完整存下');
    assert.strictEqual(await a.page.evaluate(()=>localStorage.getItem('fishCatalogMapGroupingVersion')),'map-groups-v1','新下載的圖鑑已是地圖分組，應直接標記');
    await a.ctx.close();

    // 3. 直接開 #fishing：不用點，馬上開始下載。
    const b=await open(browser,base,'/index.html#fishing');
    await b.page.waitForFunction(()=>window.__fishCatalogState==='ready',null,{timeout:15000});
    assert.strictEqual(count(b.hits,'/sheet/FishParameter'),1);
    await b.page.waitForTimeout(10000);
    // 4. 再開一次（快取都還新鮮）：不重抓任何大檔。
    b.hits.length=0;
    await b.page.reload();
    await b.page.waitForTimeout(10000);
    const again=b.hits.filter(h=>/xivapi\.com\/api\/sheet\/(FishParameter|SpearfishingItem|FishingSpot)$|ffxiv-datamining-tc\/main\/(Item|PlaceName|Weather)\.csv$/.test(h));
    assert.deepStrictEqual(again,[],'快取新鮮時不應重抓：'+again.join(', '));
    // 連不上的資料（這裡的天氣資料被擋掉）不可以連續重試。
    assert.ok(count(b.hits,'fish-tracker-app')<=1,'下載失敗後不應連續重試，實際 '+count(b.hits,'fish-tracker-app')+' 次');
    await b.ctx.close();
    console.log('fishing lazy load ok');
  }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
