// Regression: the spearfishing patch used to race app.js's catalog download and overwrite ~1800 fish with
// the stale/empty snapshot + spearfish, then mark that tiny catalog as a fresh schema-2 cache for 7 days.
// Run: node tests/fish-catalog-race-playwright.cjs
'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
function loadPlaywright(){for(const id of ['playwright','/opt/node22/lib/node_modules/playwright']){try{return require(id)}catch(e){}}throw new Error('playwright missing')}
const {chromium}=loadPlaywright();
const ROOT=path.resolve(__dirname,'..');
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
function serve(){const server=http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return}res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res)});return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)))}
const FISH=60,SPEAR=5;
const fishRows=Array.from({length:FISH},(_,i)=>({row_id:i+1,fields:{IsInLog:true,IsHidden:false,AchievementCredit:0,Item:{row_id:1000+i,fields:{Name:`Fish ${i}`}},FishingSpot:{row_id:1,fields:{PlaceName:{fields:{Name:'Bronze Lake'}},TerritoryType:{fields:{PlaceName:{fields:{Name:'Upper La Noscea'}},PlaceNameRegion:{fields:{Name:'La Noscea'}}}},X:0,Z:0}}}}));
const notebook=[{row_id:1,fields:{PlaceName:{fields:{Name:'Spear Spot'}},TerritoryType:{fields:{PlaceName:{fields:{Name:'The Ruby Sea'}},PlaceNameRegion:{fields:{Name:'Othard'}}}},X:1,Y:1,GatheringPointBase:{fields:{Item:Array.from({length:SPEAR},(_,i)=>({row_id:i+1,fields:{Item:{row_id:9000+i,fields:{Name:`Spear ${i}`}}}}))}}}}];
async function run(browser,base,seed,{mainDelay=0,spearDelay=0}={}){
  const page=await browser.newPage();
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,async route=>{
    const u=new URL(route.request().url());
    if(!/xivapi/.test(u.host))return route.abort();
    const sheet=u.pathname.split('/').pop(),after=u.searchParams.get('after');
    let rows=[];
    if(!after){if(sheet==='FishParameter'){await new Promise(r=>setTimeout(r,mainDelay));rows=fishRows}else if(sheet==='SpearfishingNotebook'){await new Promise(r=>setTimeout(r,spearDelay));rows=notebook}}
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({rows})});
  });
  await page.addInitScript(seed=>{if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.clear();localStorage.setItem('fishCatalogMapGroupingVersion','map-groups-v1');for(const[k,v]of Object.entries(seed))localStorage.setItem(k,JSON.stringify(v))}},seed);
  await page.goto(base+'/index.html#fishing');
  await page.waitForFunction(()=>window.__fishCatalogState==='ready',null,{timeout:15000});
  await page.waitForTimeout(Math.max(mainDelay,spearDelay)+1500);
  const out=await page.evaluate(()=>{const c=JSON.parse(localStorage.getItem('fishCatalog')||'[]');return{fish:c.filter(x=>x.type!=='spearfishing').length,spear:c.filter(x=>x.type==='spearfishing').length,schema:JSON.parse(localStorage.getItem('fishCatalogSchema')||'0')}});
  await page.close();return out;
}
(async()=>{
  const server=await serve(),base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({args:['--no-proxy-server']});
  try{
    const stuck=Array.from({length:SPEAR},(_,i)=>({itemId:9000+i,type:'spearfishing',name:`Spear ${i}`,spots:[]}));
    const expired=Date.now()-8*24*3600e3;
    // 1. Returning user, catalog expired; main download finishes before the slower spear notebook.
    //    Old code: spear merged into its pre-download snapshot (empty) and overwrote the 60 fresh fish.
    let r=await run(browser,base,{fishCatalog:[],fishCatalogUpdatedAt:expired,fishCatalogSchema:2},{mainDelay:200,spearDelay:2000});
    assert.equal(r.fish,FISH,`main download survives a slower spear repair (got ${r.fish})`);
    assert.equal(r.spear,SPEAR,'spearfish kept');
    // 2. Opposite order: spear first, main later.
    r=await run(browser,base,{fishCatalogUpdatedAt:expired,fishCatalogSchema:2},{mainDelay:2000,spearDelay:0});
    assert.equal(r.fish,FISH,`slower main download kept (got ${r.fish})`);
    assert.equal(r.spear,SPEAR,`spearfish re-merged after main download (got ${r.spear})`);
    // 3. A user stuck with the old clobbered cache (spear-only, schema 2, fresh timestamp) re-downloads automatically.
    r=await run(browser,base,{fishCatalog:stuck,fishCatalogUpdatedAt:Date.now(),fishCatalogSchema:2,fishSpearCatalogSchema:2});
    assert.equal(r.fish,FISH,`stuck cache self-heals (got ${r.fish})`);
    assert.equal(r.spear,SPEAR);
    console.log('fish catalog race playwright passed');
  }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
