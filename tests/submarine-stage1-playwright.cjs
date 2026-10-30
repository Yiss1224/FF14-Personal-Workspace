// Stage-1 data-correctness regression tests for submarine.html (Playwright + Chromium).
// Run: node tests/submarine-stage1-playwright.cjs
// Needs the `playwright` package (local or global). Set CHROMIUM_PATH to use a specific browser binary.
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
const baseSeed=()=>({
  fuel:1600,repair:300,parts:{'1111':4,'0020':4,'3004':4,'0003':0},
  ships:[
    {registered:true,rank:20,exp:0,name:'',currentBuild:'1121'},
    {registered:true,rank:10,exp:0,name:''},
    {registered:false,rank:1,exp:0,name:''},
    {registered:false,rank:1,exp:0,name:''}
  ],
  unlocks:{},logs:[],activeSectorMap:1
});

let browser,base,passed=0;
const results=[];
async function context(seed){
  const ctx=await browser.newContext();
  await ctx.route(/imgur|universalis/,route=>route.abort());
  if(seed!==undefined){
    // Seed once per context; later navigations and other tabs keep the stored data.
    await ctx.addInitScript(([key,value])=>{
      if(localStorage.getItem('__stage1_seeded'))return;
      localStorage.setItem('__stage1_seeded','1');
      if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);
    },[KEY,seed===null?null:typeof seed==='string'?seed:JSON.stringify(seed)]);
  }
  return ctx;
}
async function open(ctx){
  const page=await ctx.newPage();
  page.errors=[];page.dialogs=[];
  page.on('pageerror',e=>page.errors.push(e.message));
  page.on('dialog',async d=>{page.dialogs.push(d.message());await d.accept()});
  await page.goto(base+'/submarine.html');
  await page.waitForFunction(()=>document.querySelector('#calc-result .route-card')||/失敗/.test(document.getElementById('calc-result').textContent),null,{timeout:20000});
  return page;
}
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
async function setField(page,selector,value){
  await page.evaluate(([sel,val])=>{
    const el=document.querySelector(sel);
    if(el.type==='checkbox')el.checked=val;else el.value=String(val);
    el.dispatchEvent(new Event('change',{bubbles:true}));
  },[selector,value]);
}
// 出航、刪除結算等確認改用頁面內對話框；點按鈕後按「確認」，並記下訊息內容。
async function depart(page,selector){
  await page.click(selector);
  await page.waitForSelector('#sub-dialog[open]');
  page.dialogs.push(await page.evaluate(()=>[...document.querySelectorAll('#sub-dialog-message p')].map(p=>p.textContent).join('\n')));
  await page.click('#sub-dialog [data-dialog-ok]');
  await page.waitForFunction(()=>!document.querySelector('#sub-dialog[open]'));
}
async function tooltip(page,index){
  await page.hover('[data-harbor-ship="'+index+'"]',{force:true});
  await page.waitForTimeout(100);
  const text=await page.evaluate(()=>document.getElementById('harbor-tooltip').innerText.replace(/\s+/g,' '));
  await page.mouse.move(2,2);
  return text;
}
async function test(name,fn){
  const started=Date.now();
  try{await fn();passed++;results.push('PASS '+name+' ('+(Date.now()-started)+'ms)')}
  catch(e){results.push('FAIL '+name+'\n     '+String(e.stack||e).split('\n').slice(0,3).join('\n     '));process.exitCode=1}
}

async function main(){
  const server=await serve();
  base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}
    :fs.existsSync('/opt/pw-browsers/chromium')?{executablePath:'/opt/pw-browsers/chromium'}:{});

  await test('1. 出航後修改燃料、修理材料、Rank、EXP、船名、登記、部件，voyage 都保留',async()=>{
    const ctx=await context(baseSeed()),page=await open(ctx);
    await depart(page,'[data-depart-ship="0"]');
    const voyage=(await stored(page)).ships[0].voyage;
    assert.ok(voyage&&voyage.etaAt>voyage.departedAt,'出航後應寫入 voyage');
    const edits=[
      ['燃料',()=>setField(page,'#fuel-stock',1500)],
      ['修理材料',()=>setField(page,'#repair-stock',250)],
      ['Rank',()=>setField(page,'[data-rank="1"]',12)],
      ['EXP',()=>setField(page,'[data-exp="0"]',345)],
      ['登記',()=>setField(page,'[data-registered="2"]',true)],
      ['部件庫存',()=>setField(page,'[data-part-stock="1:0"]',6)],
      ['船名',async()=>{
        await page.click('#open-inventory');
        await page.click('[data-edit-ship-name="0"]');
        await page.fill('[data-ship-name-input="0"]','鸚鵡螺');
        await page.click('[data-save-ship-name="0"]');
        await page.click('#close-inventory');
      }]
    ];
    for(const [label,edit] of edits){
      await edit();
      assert.deepStrictEqual((await stored(page)).ships[0].voyage,voyage,'修改'+label+'後 voyage 被覆寫');
    }
    const s=await stored(page);
    assert.strictEqual(s.fuel,1500);assert.strictEqual(s.repair,250);
    assert.strictEqual(s.ships[1].rank,12);assert.strictEqual(s.ships[0].exp,345);
    assert.strictEqual(s.ships[2].registered,true);assert.strictEqual(s.partStock['1:0'],6);
    assert.strictEqual(s.ships[0].name,'鸚鵡螺');
    const tip=await tooltip(page,0);
    assert.ok(!tip.includes('尚無航時紀錄')&&tip.includes('預計返航 ETA'),'碼頭應顯示航程時間：'+tip);
    assert.deepStrictEqual(page.errors,[]);
    await ctx.close();
  });

  await test('2. 確認出航對話框使用真正換行，不顯示字面 \\n',async()=>{
    const ctx=await context(baseSeed()),page=await open(ctx);
    await depart(page,'[data-depart-ship="0"]');
    const message=page.dialogs.at(-1);
    assert.ok(message.includes('嗎？\n確認後開始計時'),'應含換行：'+JSON.stringify(message));
    assert.ok(!message.includes('\\n'),'不應含字面 \\n');
    await ctx.close();
  });

  await test('3a. 舊版資料：已結束航程仍留在 voyage，手動勾選航行中不沿用舊計時',async()=>{
    const now=Date.now(),seed=baseSeed();
    seed.ships[1].voyaging=false;
    seed.ships[1].voyage={departedAt:now-72*HOUR,etaAt:now-48*HOUR,route:'溺沒海 A → B'};
    const ctx=await context(seed),page=await open(ctx);
    await page.check('[data-voyaging="1"]');
    const ship=(await stored(page)).ships[1];
    assert.strictEqual(ship.voyaging,true);
    assert.strictEqual(ship.voyage,undefined,'舊航程不應作為進行中航程');
    assert.deepStrictEqual(ship.lastVoyage,seed.ships[1].voyage,'舊航程應保留在 lastVoyage');
    const tip=await tooltip(page,1);
    assert.ok(tip.includes('航行中・尚無航時紀錄')&&!tip.includes('待結算'),tip);
    await ctx.close();
  });

  await test('3b. 進行中航程誤取消再勾回，計時保留',async()=>{
    const ctx=await context(baseSeed()),page=await open(ctx);
    await depart(page,'[data-depart-ship="0"]');
    const voyage=(await stored(page)).ships[0].voyage;
    await page.uncheck('[data-voyaging="0"]');
    await page.check('[data-voyaging="0"]');
    const ship=(await stored(page)).ships[0];
    assert.strictEqual(ship.voyaging,true);
    assert.deepStrictEqual(ship.voyage,voyage);
    await ctx.close();
  });

  await test('3c. 返航結算後，航程移至 lastVoyage；再手動勾選不會顯示舊航程',async()=>{
    const ctx=await context(baseSeed()),page=await open(ctx);
    await depart(page,'[data-depart-ship="0"]');
    const voyage=(await stored(page)).ships[0].voyage;
    await page.fill('#settle-rank','21');await page.fill('#settle-exp','0');
    await page.click('#settle-save');
    let ship=(await stored(page)).ships[0];
    assert.strictEqual(ship.voyaging,false);assert.strictEqual(ship.voyage,undefined);
    assert.strictEqual(ship.lastVoyage.etaAt,voyage.etaAt);assert.ok(ship.lastVoyage.settledAt>0);
    await page.check('[data-voyaging="0"]');
    ship=(await stored(page)).ships[0];
    assert.strictEqual(ship.voyage,undefined);
    assert.ok((await tooltip(page,0)).includes('尚無航時紀錄'));
    await ctx.close();
  });

  await test('4a. 雙分頁：B 返航結算後，A 用舊畫面改燃料，不會蓋掉 Rank 與紀錄',async()=>{
    const ctx=await context(baseSeed()),a=await open(ctx),b=await open(ctx);
    await b.fill('#settle-rank','21');await b.fill('#settle-exp','100');await b.click('#settle-save');
    await a.waitForTimeout(200);
    await setField(a,'#fuel-stock',1400);
    const s=await stored(a);
    assert.strictEqual(s.logs.length,1,'返航紀錄遺失');
    assert.strictEqual(s.ships[0].rank,21,'Rank 被舊狀態覆寫');
    assert.strictEqual(s.ships[0].exp,100);
    assert.strictEqual(s.fuel,1400);
    assert.ok((await a.textContent('#log-summary')).includes('1 趟'),'A 分頁應同步顯示新紀錄');
    await ctx.close();
  });

  await test('4b. 雙分頁：B 出航後，A 改 Rank 不會清掉 B 的 voyage',async()=>{
    const ctx=await context(baseSeed()),a=await open(ctx),b=await open(ctx);
    await depart(b,'[data-depart-ship="0"]');
    const voyage=(await stored(b)).ships[0].voyage;
    await a.waitForTimeout(200);
    await setField(a,'[data-rank="1"]',15);
    const s=await stored(a);
    assert.deepStrictEqual(s.ships[0].voyage,voyage);assert.strictEqual(s.ships[0].voyaging,true);
    assert.strictEqual(s.ships[1].rank,15);
    await ctx.close();
  });

  await test('4c. 雙分頁：B 新增紀錄後，A 刪除畫面上的舊紀錄仍刪對筆',async()=>{
    const seed=baseSeed();
    seed.logs=[{date:'2026-10-01',ship:1,route:'舊紀錄',exp:0,fuel:5,repair:0,note:'old'}];
    const ctx=await context(seed),a=await open(ctx),b=await open(ctx);
    await b.fill('#settle-rank','21');await b.fill('#settle-exp','0');await b.fill('#settle-note','new');await b.click('#settle-save');
    await a.waitForTimeout(200);
    await a.click('details.settlement-history:has(#log-table) > summary');
    await a.locator('#log-table tr',{hasText:'old'}).locator('[data-delete]').click();
    const s=await stored(a);
    assert.deepStrictEqual(s.logs.map(l=>l.note),['new']);
    await ctx.close();
  });

  await test('5. 舊版儲存格式（無 partStock／plannerSettings／name，含自訂欄位）可載入且修改不遺失資料',async()=>{
    const legacy={fuel:900,repair:120,parts:{'1111':3,'0020':2,'3004':1,'0003':1},
      ships:[{registered:true,rank:33,exp:5},{registered:true,rank:18,exp:0},{registered:false,rank:1,exp:0},{registered:false,rank:1,exp:0}],
      unlocks:{'u-0-1':true,'sector-5':true},logs:[{date:'2025-01-01',ship:1,route:'A → B',exp:100,fuel:3,repair:1,note:'legacy'}],
      customField:{keep:true}};
    const ctx=await context(legacy),page=await open(ctx);
    await setField(page,'#fuel-stock',880);
    const s=await stored(page);
    assert.strictEqual(s.fuel,880);assert.deepStrictEqual(s.customField,{keep:true});
    assert.deepStrictEqual(s.logs,legacy.logs);assert.deepStrictEqual(s.unlocks,legacy.unlocks);
    assert.strictEqual(s.ships[0].rank,33);assert.strictEqual(s.ships[0].exp,5);
    assert.strictEqual(s.partStock['1:0'],3);assert.strictEqual(s.partStock['3:3'],1);
    assert.deepStrictEqual(page.errors,[]);
    await ctx.close();
  });

  await test('6. 完整備份匯入仍正常',async()=>{
    const ctx=await context(baseSeed()),page=await open(ctx);
    const backup=baseSeed();backup.fuel=4321;backup.ships[3]={registered:true,rank:44,exp:7,name:'匯入艇'};
    backup.logs=[{date:'2026-09-09',ship:4,route:'X',exp:1,fuel:0,repair:0}];
    await page.setInputFiles('#import-data',{name:'backup.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify({schema:2,app:'ff14-submarine-planner',data:backup}))});
    await page.waitForFunction(()=>document.getElementById('fuel-stock').value==='4321');
    const s=await stored(page);
    assert.strictEqual(s.ships[3].name,'匯入艇');assert.strictEqual(s.logs.length,1);
    await ctx.close();
  });

  // Near-simultaneous writes from two tabs. localStorage has no cross-tab transaction:
  // writes landing within a few ms can still overwrite each other, so 0 ms is measured, not asserted.
  await test('7. 雙分頁近乎同時寫入不同欄位：0 ms 量測、100 ms 間隔須零遺失',async()=>{
    const ctx=await context(baseSeed()),a=await open(ctx),b=await open(ctx);
    const rounds=Number(process.env.STAGE1_ROUNDS)||15;
    // Fire inside each page at a shared wall-clock instant for precise offsets.
    const fire=(page,selector,value,at)=>page.evaluate(([sel,val,when])=>new Promise(done=>setTimeout(()=>{
      const el=document.querySelector(sel);el.value=String(val);el.dispatchEvent(new Event('change',{bubbles:true}));done();
    },Math.max(0,when-Date.now()))),[selector,value,at]);
    const report={};
    for(const gap of [0,100]){
      let lost=0;
      for(let i=1;i<=rounds;i++){
        const value=gap*1000+i,at=Date.now()+400;
        await Promise.all([fire(a,'#fuel-stock',value,at),fire(b,'[data-exp="1"]',value,at+gap)]);
        await a.waitForTimeout(600);
        const s=await stored(a);
        if(s.fuel!==value||s.ships[1].exp!==value)lost++;
      }
      report[gap+'ms']=lost+'/'+rounds+' 輪遺失';
    }
    results.push('     近乎同時寫入結果：'+JSON.stringify(report));
    assert.strictEqual(report['100ms'],'0/'+rounds+' 輪遺失','間隔 100 ms 的寫入不應遺失');
    assert.deepStrictEqual([...a.errors,...b.errors],[]);
    await ctx.close();
  });

  // Cross-tab sync must not discard what the user is still typing in this tab.
  const activeKey=page=>page.evaluate(()=>{const a=document.activeElement;return a?(a.id?'#'+a.id:[...a.attributes].map(x=>x.name+'='+x.value).filter(x=>x.startsWith('data-')).join(' ')):null});
  const typeInto=async(page,selector,text)=>{await page.focus(selector);await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type(text)};

  await test('8a. A 正在輸入燃料（未離開欄位）時 B 修改修理材料，A 的輸入與焦點保留，離開後兩者都寫入',async()=>{
    const ctx=await context(baseSeed()),a=await open(ctx),b=await open(ctx);
    await typeInto(a,'#fuel-stock','1700');
    await setField(b,'#repair-stock',222);
    await a.waitForFunction(()=>document.getElementById('repair-stock').value==='222');
    assert.strictEqual(await a.inputValue('#fuel-stock'),'1700','燃料草稿被重畫清掉');
    assert.strictEqual(await activeKey(a),'#fuel-stock','焦點遺失');
    await a.keyboard.press('Tab');
    const s=await stored(a);
    assert.strictEqual(s.fuel,1700);assert.strictEqual(s.repair,222);
    await ctx.close();
  });

  await test('8b. A 未修改但停在燃料欄位時，B 改了燃料，A 顯示新值（不保留過時數字）',async()=>{
    const ctx=await context(baseSeed()),a=await open(ctx),b=await open(ctx);
    await a.focus('#fuel-stock');
    await setField(b,'#fuel-stock',1234);
    await a.waitForFunction(()=>document.getElementById('fuel-stock').value==='1234');
    assert.strictEqual(await activeKey(a),'#fuel-stock');
    await ctx.close();
  });

  await test('8c. A 在管理視窗輸入 Rank／部件時 B 寫入，A 的輸入、焦點與游標位置保留',async()=>{
    const ctx=await context(baseSeed()),a=await open(ctx),b=await open(ctx);
    await a.click('#open-inventory');
    await typeInto(a,'[data-rank="1"]','33');
    await setField(b,'#fuel-stock',1111);
    await a.waitForFunction(()=>document.getElementById('fuel-stock').value==='1111');
    assert.strictEqual(await a.inputValue('[data-rank="1"]'),'33');
    assert.strictEqual(await activeKey(a),'data-rank=1');
    await a.keyboard.type('4');
    assert.strictEqual(await a.inputValue('[data-rank="1"]'),'334','重畫後應可在原欄位接續輸入');
    // 先離開 Rank 欄位完成儲存（本分頁 Tab 後焦點遺失屬階段 3 項目，不在此測試）。
    await a.keyboard.press('Tab');
    assert.strictEqual((await stored(a)).ships[1].rank,334);
    await typeInto(a,'[data-part-stock="2:2"]','9');
    await setField(b,'#repair-stock',99);
    await a.waitForFunction(()=>document.getElementById('repair-stock').value==='99');
    assert.strictEqual(await a.inputValue('[data-part-stock="2:2"]'),'9');
    await a.keyboard.press('Tab');
    const s=await stored(a);
    assert.strictEqual(s.partStock['2:2'],9);assert.strictEqual(s.fuel,1111);assert.strictEqual(s.repair,99);
    await ctx.close();
  });

  await test('8d. A 船名編輯中（含已移開焦點的草稿）時 B 寫入，編輯區、草稿與焦點保留，儲存後不蓋掉 B 的資料',async()=>{
    const ctx=await context(baseSeed()),a=await open(ctx),b=await open(ctx);
    await a.click('#open-inventory');
    await a.click('[data-edit-ship-name="0"]');
    await a.fill('[data-ship-name-input="0"]','草稿號');
    await setField(b,'#fuel-stock',1300);
    await a.waitForFunction(()=>document.getElementById('fuel-stock').value==='1300');
    assert.strictEqual(await a.isHidden('[data-ship-name-editor="0"]'),false,'船名編輯區被關閉');
    assert.strictEqual(await a.inputValue('[data-ship-name-input="0"]'),'草稿號');
    assert.strictEqual(await activeKey(a),'data-ship-name-input=0');
    await a.click('#sub-inventory-title');
    await setField(b,'#repair-stock',123);
    await a.waitForFunction(()=>document.getElementById('repair-stock').value==='123');
    assert.strictEqual(await a.inputValue('[data-ship-name-input="0"]'),'草稿號','未聚焦的船名草稿被清掉');
    await a.click('[data-save-ship-name="0"]');
    const s=await stored(a);
    assert.strictEqual(s.ships[0].name,'草稿號');assert.strictEqual(s.fuel,1300);assert.strictEqual(s.repair,123);
    assert.strictEqual(await a.isHidden('[data-ship-name-editor="0"]'),true,'儲存後編輯區應關閉');
    await ctx.close();
  });

  await test('8e. 同分頁：船名編輯中切換計算器配置，船名草稿保留',async()=>{
    const ctx=await context(baseSeed()),a=await open(ctx);
    await a.click('#open-inventory');
    await a.click('[data-edit-ship-name="1"]');
    await a.fill('[data-ship-name-input="1"]','二號草稿');
    await a.click('#close-inventory');
    await a.selectOption('[data-build="0"]','current');
    await a.click('#open-inventory');
    assert.strictEqual(await a.isHidden('[data-ship-name-editor="1"]'),false);
    assert.strictEqual(await a.inputValue('[data-ship-name-input="1"]'),'二號草稿');
    await ctx.close();
  });

  await test('8f. A 正在輸入計算器目標 Rank 時 B 寫入，目標 Rank 草稿保留',async()=>{
    const ctx=await context(baseSeed()),a=await open(ctx),b=await open(ctx);
    await typeInto(a,'#calc-target-rank','60');
    await setField(b,'#fuel-stock',1500);
    await a.waitForFunction(()=>document.getElementById('fuel-stock').value==='1500');
    assert.strictEqual(await a.inputValue('#calc-target-rank'),'60');
    assert.strictEqual(await activeKey(a),'#calc-target-rank');
    await a.keyboard.press('Tab');
    assert.strictEqual((await stored(a)).plannerSettings.targetRank,60);
    await ctx.close();
  });

  await test('9. 推薦模式：舊版固定配置保留為「舊設定」，「沿用目前配置」不建議換裝',async()=>{
    const seed=baseSeed();seed.ships[0].build='1121';seed.ships[1].build='current';
    const ctx=await context(seed),page=await open(ctx);
    const options=i=>page.evaluate(i=>[...document.querySelectorAll('[data-build="'+i+'"] option')].map(o=>o.value+'|'+o.textContent),i);
    assert.strictEqual(await page.inputValue('[data-build="0"]'),'1121');
    assert.deepStrictEqual(await options(0),['auto|自動擇優（依庫存比較全部組合）','current|沿用目前實際配置（不換裝）','1121|固定 1121（舊設定）']);
    assert.strictEqual(await page.inputValue('[data-build="1"]'),'current');
    const card=await page.evaluate(()=>[...document.querySelectorAll('#calc-result .route-card')].find(c=>c.querySelector('h3').textContent.startsWith('潛水艇 2')).textContent);
    assert.match(card,/本趟使用 1111，不用換裝/);
    await page.selectOption('[data-build="0"]','auto');
    assert.strictEqual((await stored(page)).ships[0].build,'auto');
    assert.deepStrictEqual((await options(0)).map(x=>x.split('|')[0]),['auto','current']);
    assert.deepStrictEqual(page.errors,[]);
    await ctx.close();
  });

  await test('10. 畢業船依庫存推薦 O → J 飾品估值最高的配置；收益資料載入失敗時不中斷',async()=>{
    const seed=baseSeed();seed.ships[0]={registered:true,rank:85,exp:0,name:'',currentBuild:'1121'};
    seed.unlocks=Object.fromEntries(Array.from({length:20},(_,i)=>['sector-'+(i+1),true]));seed.plannerSettings={targetRank:85};
    const card=page=>page.evaluate(()=>[...document.querySelectorAll('#calc-result .route-card')].find(c=>c.querySelector('h3').textContent.startsWith('潛水艇 1')).textContent);
    let ctx=await context(seed),page=await open(ctx);
    assert.match(await card(page),/跑 O → J 以 3124（.*）\s*平均每天的飾品估值最高：平均每天約 [\d,]+ Gil（每趟約 [\d,]+ Gil/);
    assert.match(await card(page),/建議換裝：1121 → 3124/);
    await page.click('[data-apply-build="0"][data-new-build="3124"]');
    assert.strictEqual((await stored(page)).ships[0].currentBuild,'3124');
    assert.match(await card(page),/已登記為 3124，無需換裝/);
    assert.deepStrictEqual(page.errors,[]);
    await ctx.close();
    ctx=await context(seed);await ctx.route(/submarine-yield-data/,route=>route.abort());page=await open(ctx);
    assert.match(await card(page),/收益資料未載入/);
    assert.deepStrictEqual(page.errors,[]);
    await ctx.close();
  });

  await test('11. 畢業船以平均每天收益比較：Rank 80 依收船窗口換算週期，只推庫存組得出、回航上限內的配置',async()=>{
    const full={};for(let c=1;c<=5;c++)for(let slot=0;slot<4;slot++)full[c+':'+slot]=4;
    const seed=(partStock,settings={})=>{
      const s=baseSeed();s.ships=[{registered:true,rank:80,exp:0,name:'',currentBuild:'3124'}];s.partStock=partStock;
      s.unlocks=Object.fromEntries(Array.from({length:20},(_,i)=>['sector-'+(i+1),true]));
      s.plannerSettings={targetRank:80,dailyPickup:true,pickupStart:'19:00',pickupEnd:'22:00',...settings};return s;
    };
    const card=page=>page.evaluate(()=>document.querySelector('#calc-result .route-card').textContent);
    // 5144 航行 26.2 小時：19:00 出航隔天 21:12 收、再出航就落在窗口外，平均每 36 小時一趟（約 7.1 萬／天），
    // 仍略高於 24.4 小時的 1124（收集只到「普」，約 6.8 萬／天）。
    let ctx=await context(seed(full)),page=await open(ctx);
    let text=await card(page);
    assert.match(text,/跑 O → J 以 5144（.*）\s*平均每天的飾品估值最高：平均每天約 70,830 Gil（每趟約 106,245 Gil、航行 26 小時 12 分，每天在窗口內收船時平均每 36 小時 0 分 收一趟）/);
    assert.match(text,/目前 3124 在回航上限內跑不到 O → J/);
    assert.deepStrictEqual(page.errors,[]);
    await ctx.close();
    // 沒有希爾德里昂級船體就不推 5144，改推同收益、庫存組得出的 3421。
    ctx=await context(seed({...full,'5:0':0}));page=await open(ctx);
    text=await card(page);
    assert.doesNotMatch(text,/5144/);
    assert.match(text,/以 3421（.*）\s*平均每天的飾品估值最高：平均每天約 70,830 Gil/);
    await ctx.close();
    // 回航上限 24 小時：Rank 80 沒有 24 小時內跑完 O → J 的配置。
    ctx=await context(seed(full,{maxHours:24}));page=await open(ctx);
    assert.match(await card(page),/回航上限或剩餘部件組不出能跑 O → J 的配置/);
    assert.deepStrictEqual(page.errors,[]);
    await ctx.close();
  });

  await test('12. 畢業船可直接確認出航 O → J（配置不符時先要求換裝）',async()=>{
    const seed=baseSeed();seed.ships=[{registered:true,rank:85,exp:0,name:'',currentBuild:'1121'}];
    seed.unlocks=Object.fromEntries(Array.from({length:20},(_,i)=>['sector-'+(i+1),true]));seed.plannerSettings={targetRank:85};
    const ctx=await context(seed),page=await open(ctx);
    assert.ok(await page.$('[data-depart-ship="0"]'));
    await page.click('[data-depart-ship="0"]');
    await page.waitForSelector('#sub-dialog[open]');
    assert.match(await page.textContent('#sub-dialog'),/請先在遊戲中完成換裝/);
    await page.click('#sub-dialog [data-dialog-ok]');
    assert.strictEqual((await stored(page)).ships[0].voyaging,undefined);
    await page.click('[data-apply-build="0"][data-new-build="3124"]');
    assert.match(await page.textContent('#calc-result'),/本輪建議消耗約 [1-9]\d* 罐燃料/);
    await depart(page,'[data-depart-ship="0"]');
    const ship=(await stored(page)).ships[0];
    assert.strictEqual(ship.voyaging,true);
    assert.strictEqual(ship.voyage.build,'3124');
    assert.match(ship.voyage.route,/O → J/);
    assert.ok(ship.voyage.durationSeconds>20*3600&&ship.voyage.durationSeconds<24*3600);
    assert.deepStrictEqual(page.errors,[]);
    await ctx.close();
  });

  await browser.close();server.close();
  console.log(results.join('\n'));
  console.log(passed+' passed, '+(results.filter(r=>r.startsWith('FAIL')).length)+' failed');
}
main().catch(e=>{console.error(e);process.exit(1)});
