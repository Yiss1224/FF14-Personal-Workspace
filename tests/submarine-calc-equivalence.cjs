// Calculator equivalence + timing check for submarine.html (Playwright + Chromium).
// Compares rendered recommendations for fixed seeds against tests/fixtures/submarine-calc-baseline.json.
// Run:     node tests/submarine-calc-equivalence.cjs
// Refresh: node tests/submarine-calc-equivalence.cjs --update   (only from a trusted baseline commit)
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
const FIXTURE=path.join(__dirname,'fixtures','submarine-calc-baseline.json');
const KEY='ff14_submarine_planner_v1';
const UPDATE=process.argv.includes('--update');
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

const open=ids=>Object.fromEntries(ids.map(id=>['sector-'+id,true]));
const range=(a,b)=>Array.from({length:b-a+1},(_,i)=>a+i);
const settings=(extra={})=>({maxHours:72,targetRank:85,dailyPickup:true,pickupStart:'19:00',pickupEnd:'22:00',
  departureTime:'20:00',manualDeparture:true,expandedLongRoutes:true,...extra});
// Deterministic pseudo-random logs so every run builds identical seeds.
function makeLogs(count){
  let x=12345;const rnd=()=>(x=(x*1103515245+12345)%2147483648)/2147483648;
  const routes=['溺沒海 A → B','A → B','溺沒海 A → C → D','灰海 A → B','B → A → C','溺沒海 O → J','翠浪海 A → C','  溺沒海   A → B  ','溺沒海 G → H'];
  return Array.from({length:count},(_,i)=>({kind:'settlement',date:'2026-0'+(1+i%9)+'-1'+(i%9),ship:1+(i%4),
    route:routes[Math.floor(rnd()*routes.length)],exp:i%7===0?0:(i%11===0?Math.round(rnd()*1e6)/10:Math.floor(rnd()*90000)),
    fuel:2+(i%5),repair:i%3,loot:[{name:'沉船戒指',qty:1+(i%3)}]}));
}
const ship=(rank,extra={})=>({registered:true,rank,exp:0,name:'',...extra});
const parts=(a,b,c,d)=>({'1111':a,'0020':b,'3004':c,'0003':d});
const SEEDS={
  starter:{fuel:1600,repair:300,parts:parts(4,4,4,0),ships:[ship(20,{currentBuild:'1121'}),ship(10),{registered:false},{registered:false}],
    unlocks:{},logs:[],activeSectorMap:1,plannerSettings:settings()},
  gateOpening:{fuel:1600,repair:300,parts:parts(4,4,4,2),ships:[ship(48,{exp:1200,currentBuild:'1121'}),ship(42),ship(36,{build:'1123'}),ship(30,{voyaging:true,currentBuild:'1121'})],
    unlocks:open([...range(1,24),26,27]),logs:makeLogs(40),activeSectorMap:1,plannerSettings:settings()},
  allMaps:{fuel:900,repair:50,parts:parts(4,4,4,2),ships:[ship(78,{currentBuild:'1123'}),ship(65,{build:'3123'}),ship(55),ship(86,{currentBuild:'3124'})],
    unlocks:open(range(1,65)),logs:makeLogs(300),activeSectorMap:3,plannerSettings:settings({maxHours:48,targetRank:90})},
  noDaily:{fuel:1600,repair:300,parts:parts(4,3,2,1),ships:[ship(25),ship(25,{exp:3000}),ship(15,{build:'1111'}),ship(60)],
    unlocks:open(range(1,40)),logs:makeLogs(120),activeSectorMap:2,plannerSettings:settings({dailyPickup:false,maxHours:24,targetRank:70})},
  heavyLogs:{fuel:1600,repair:300,parts:parts(4,4,4,2),ships:[ship(40,{currentBuild:'1121'}),ship(30),ship(20),ship(10)],
    unlocks:open(range(1,30)),logs:makeLogs(2000),activeSectorMap:1,plannerSettings:settings()},
  stockConflict:{fuel:10,repair:0,parts:parts(1,0,0,0),ships:[ship(20,{voyaging:true,currentBuild:'1121'}),ship(18),{registered:false},{registered:false}],
    unlocks:{},logs:[],activeSectorMap:1,plannerSettings:settings()}
};
// Settings the user can switch at runtime, applied after the seeded render.
const VARIANTS=[
  {name:'default',apply:null},
  {name:'hours36',apply:{'calc-hours':'36'}},
  {name:'window18-23_depart21',apply:{'pickup-start':'18:00','pickup-end':'23:00','calc-departure-time':'21:00'}}
];
const ITEMS=[['12220','24'],['22500','48'],['5665','24']];

async function capture(browser,base,name,seed){
  const ctx=await browser.newContext();
  await ctx.route(/imgur|universalis/,route=>route.abort());
  await ctx.addInitScript(([key,value])=>{
    Date.now=()=>1790000000000;
    if(localStorage.getItem('__calc_seeded'))return;
    localStorage.setItem('__calc_seeded','1');localStorage.setItem(key,value);
  },[KEY,JSON.stringify(seed)]);
  const page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/submarine.html');
  await page.waitForFunction(()=>document.getElementById('calc-result').children.length>0,null,{timeout:30000});
  const out={},timing={};
  for(const variant of VARIANTS){
    if(variant.apply){
      await page.evaluate(apply=>{for(const [id,value] of Object.entries(apply)){const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('change'))}},variant.apply);
    }
    out[variant.name]={calc:await page.evaluate(()=>{
      // The departure step list is presentation only; recommendations are compared without it.
      const copy=document.getElementById('calc-result').cloneNode(true);
      copy.querySelectorAll('.depart-steps').forEach(x=>x.remove());
      return copy.innerHTML;
    }),
      builds:await page.evaluate(()=>document.getElementById('ship-builds').innerHTML)};
  }
  // Timing: full refresh triggered by a state change (renderBuilds + renderSectors + calculate), median of 7.
  timing.stateUpdateMs=await page.evaluate(()=>{const r=[];for(let i=0;i<7;i++){const t=performance.now();window.dispatchEvent(new Event('submarine-state-updated'));r.push(performance.now()-t)}r.sort((a,b)=>a-b);return +r[3].toFixed(1)});
  timing.fuelEditMs=await page.evaluate(()=>{const r=[];for(let i=0;i<5;i++){const el=document.getElementById('fuel-stock');el.value=String(1000+i);const t=performance.now();el.dispatchEvent(new Event('change'));r.push(performance.now()-t)}r.sort((a,b)=>a-b);return +r[2].toFixed(1)});
  // Voyage log table: opened after the edits above, then edited again while open.
  const logTable=()=>page.evaluate(()=>document.getElementById('log-summary').innerHTML+'\n'+document.getElementById('log-table').innerHTML);
  await page.evaluate(()=>{const d=document.getElementById('log-table').closest('details');d.open=true;d.dispatchEvent(new Event('toggle'))});
  await page.waitForTimeout(50);
  out.logs={opened:await logTable()};
  await page.evaluate(()=>{const el=document.getElementById('repair-stock');el.value='77';el.dispatchEvent(new Event('change'))});
  out.logs.editedWhileOpen=await logTable();
  await page.evaluate(()=>document.querySelector('details.item-planner').open=true);
  out.items={};const itemTimes=[];
  for(const [item,hours] of ITEMS){
    await page.selectOption('#target-item',item).catch(()=>{});
    await page.selectOption('#target-item-hours',hours);
    itemTimes.push(await page.evaluate(()=>{const t=performance.now();document.getElementById('calc-item-routes').click();return performance.now()-t}));
    out.items[item+'@'+hours]=await page.evaluate(()=>document.getElementById('item-route-result').innerHTML);
  }
  timing.itemRoutesMs=+itemTimes.reduce((a,b)=>a+b,0).toFixed(1);
  // Unrelated localStorage key written by another tab must not trigger a recalculation here.
  const other=await ctx.newPage();await other.goto(base+'/submarine.html');
  await page.evaluate(()=>{
    window.__calcRenders=0;
    new MutationObserver(()=>window.__calcRenders++).observe(document.getElementById('calc-result'),{childList:true});
  });
  await other.evaluate(()=>localStorage.setItem('unrelated-module-key',String(Math.random())));
  await page.waitForTimeout(400);
  timing.unrelatedKeyRecalcs=await page.evaluate(()=>window.__calcRenders);
  assert.deepStrictEqual(errors,[],name+' page errors');
  await ctx.close();
  return {out,timing};
}

async function main(){
  const server=await serve(),base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}
    :fs.existsSync('/opt/pw-browsers/chromium')?{executablePath:'/opt/pw-browsers/chromium'}:{});
  const outputs={},timings={};
  for(const [name,seed] of Object.entries(SEEDS)){
    const {out,timing}=await capture(browser,base,name,seed);
    outputs[name]=out;timings[name]=timing;
  }
  await browser.close();server.close();
  console.log('timings(ms): '+JSON.stringify(timings,null,1));
  if(UPDATE){
    fs.mkdirSync(path.dirname(FIXTURE),{recursive:true});
    fs.writeFileSync(FIXTURE,JSON.stringify(outputs,null,1)+'\n');
    console.log('fixture updated: '+path.relative(ROOT,FIXTURE));
    return;
  }
  const expected=JSON.parse(fs.readFileSync(FIXTURE,'utf8'));
  let compared=0,failed=0;
  for(const seed of Object.keys(expected))for(const group of Object.keys(expected[seed]))for(const field of Object.keys(expected[seed][group])){
    compared++;
    if(outputs[seed]?.[group]?.[field]!==expected[seed][group][field]){failed++;console.log('DIFF '+seed+'/'+group+'/'+field)}
  }
  console.log(compared+' outputs compared, '+(compared-failed)+' identical, '+failed+' different');
  if(failed)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exit(1)});
