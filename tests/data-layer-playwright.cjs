// 統一資料層：首頁備份匯出／匯入、移除 Supabase，以及自架伺服器同步（首頁與潛水艇頁）。
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'ff14-data-'));
process.env.FF14_TOKEN='test-token';
process.env.FF14_DATA_DIR=DATA_DIR;
process.env.FF14_STATIC_DIR=ROOT;
const server=require('../server/server.js');

(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch();
  // 外部資料來源與本測試無關，全部擋掉以免拖慢或不穩定。
  const isolate=async ctx=>ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
  const localOnly=async ctx=>ctx.route('**/ff14-config.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.FF14_CONFIG={apiBase:""};'}));
  // 過渡期 Supabase 同步：以假的 supabase-js 取代 CDN 套件，資料列存在測試程序的記憶體裡。
  const fakeDb={row:null};
  const FAKE_LIB=`window.supabase={createClient(){const listeners=[];let session=JSON.parse(localStorage.getItem('fake-session')||'null');
   const db=async(method,body)=>{const r=await fetch('/__fakedb',{method,body:body&&JSON.stringify(body)});return r.json()};
   return{auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange(fn){listeners.push(fn)},
    signInWithPassword:async({email})=>{session={user:{id:'u1',email}};localStorage.setItem('fake-session',JSON.stringify(session));listeners.forEach(f=>f('SIGNED_IN',session));return{data:{user:session.user,session},error:null}},
    signOut:async()=>{session=null;localStorage.removeItem('fake-session');listeners.forEach(f=>f('SIGNED_OUT',null));return{error:null}}},
    from(){return{select(){return{eq(){return{maybeSingle:async()=>({data:await db('GET'),error:null})}}}},upsert:async row=>{await db('POST',row);return{error:null}}}}}}};`;
  const withFakeSupabase=async ctx=>{
    await ctx.route(/supabase-js/,r=>r.fulfill({contentType:'text/javascript',body:FAKE_LIB}));
    await ctx.route('**/__fakedb',r=>{if(r.request().method()==='POST')fakeDb.row=JSON.parse(r.request().postData());r.fulfill({contentType:'application/json',body:JSON.stringify(fakeDb.row)})});
  };
  const withSync=async ctx=>{
    await ctx.route('**/ff14-config.js*',r=>r.fulfill({contentType:'text/javascript',body:`window.FF14_CONFIG={apiBase:${JSON.stringify(base)}};`}));
    await ctx.addInitScript(()=>localStorage.setItem('ff14ApiToken','test-token'));
  };
  let failed=false;
  const step=async(name,fn)=>{try{await fn();console.log('PASS',name)}catch(e){failed=true;console.error('FAIL',name,'\n',e)}};
  try{
    await step('未設定同步時為純本機模式，不載入 Supabase',async()=>{
      const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
      assert.ok(!/supabase-js|supabase\.co/i.test(html),'index.html 不應直接載入 Supabase');
      assert.ok(!fs.existsSync(path.join(ROOT,'cloud.js')),'cloud.js 應已移除');
      const ctx=await browser.newContext();await isolate(ctx);await localOnly(ctx);
      const page=await ctx.newPage(),requests=[],errors=[];
      page.on('request',r=>requests.push(r.url()));
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base+'/index.html');
      await page.waitForFunction(()=>window.FF14Data&&document.getElementById('sync-status'));
      assert.equal(await page.textContent('#sync-status'),'本機模式');
      assert.ok(!requests.some(u=>/supabase-js|supabase\.co/i.test(u)),'仍有 Supabase 請求');
      assert.equal(await page.evaluate(()=>typeof window.ff14TcItemText),'function','台服繁中名詞層應保留');
      await page.waitForTimeout(500);
      assert.deepEqual(errors.filter(m=>/supabase|FF14Data|sync-|auth-/i.test(m)),[],'資料層相關錯誤：'+errors.join(' | '));
      console.log('  其他頁面錯誤（外部資料被擋，供參考）：',errors.length);
      await ctx.close();
    });

    await step('首頁完整備份可匯出再匯入到另一台裝置',async()=>{
      const ctx=await browser.newContext({acceptDownloads:true});await isolate(ctx);await localOnly(ctx);
      const page=await ctx.newPage();
      await page.addInitScript(()=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('fishCaughtIds','[101,202]');localStorage.setItem('levelPlan','{"job":"PLD","from":50,"to":60}');localStorage.setItem('fishCatalog','[]');sessionStorage.setItem('seeded','1')}});
      await page.goto(base+'/index.html');await page.waitForFunction(()=>window.FF14Data);
      const [dl]=await Promise.all([page.waitForEvent('download'),page.click('#workspace-export')]);
      const file=path.join(DATA_DIR,'backup.json');await dl.saveAs(file);
      const backup=JSON.parse(fs.readFileSync(file,'utf8'));
      assert.equal(backup.app,'ff14-personal-workspace');
      assert.deepEqual(backup.data.fishCaughtIds,[101,202]);
      assert.deepEqual(backup.data.levelPlan,{job:'PLD',from:50,to:60});
      assert.ok(!('fishCatalog' in backup.data),'快取資料不應進備份');
      await ctx.close();

      const other=await browser.newContext();await isolate(other);await localOnly(other);
      const p2=await other.newPage();await p2.goto(base+'/index.html');await p2.waitForFunction(()=>window.FF14Data);
      p2.on('dialog',d=>d.accept());
      await p2.setInputFiles('#workspace-backup-file',file);
      await p2.waitForFunction(()=>localStorage.getItem('fishCaughtIds')==='[101,202]');
      assert.equal(await p2.evaluate(()=>localStorage.getItem('levelPlan')),'{"job":"PLD","from":50,"to":60}');
      await other.close();
    });

    await step('舊 Supabase 同步格式（資料鍵在最上層）也能匯入',async()=>{
      const ctx=await browser.newContext();await isolate(ctx);
      const page=await ctx.newPage();await page.goto(base+'/index.html');await page.waitForFunction(()=>window.FF14Data);
      const out=await page.evaluate(()=>FF14Data.parseBackup({fishSkippedIds:[7],unrelated:1},'workspace'));
      assert.deepEqual(out,{fishSkippedIds:[7]});
      await ctx.close();
    });

    await step('首頁設定伺服器後：第一台上傳，第二台載入',async()=>{
      const a=await browser.newContext();await isolate(a);await withSync(a);
      await a.addInitScript(()=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('fishSkippedIds','[11,22]');sessionStorage.setItem('seeded','1')}});
      const pa=await a.newPage();await pa.goto(base+'/index.html');
      await pa.waitForFunction(()=>/已同步/.test(document.getElementById('sync-status').textContent));
      const saved=JSON.parse(fs.readFileSync(path.join(DATA_DIR,'workspace.json'),'utf8'));
      assert.deepEqual(saved.data.fishSkippedIds,[11,22]);
      // 之後的修改會自動送上伺服器。
      await pa.evaluate(()=>localStorage.setItem('fishSkippedIds','[11,22,33]'));
      await new Promise(r=>setTimeout(r,1500));
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(DATA_DIR,'workspace.json'),'utf8')).data.fishSkippedIds,[11,22,33]);
      await a.close();

      const b=await browser.newContext();await isolate(b);await withSync(b);
      const pb=await b.newPage();await pb.goto(base+'/index.html');
      await pb.waitForFunction(()=>localStorage.getItem('fishSkippedIds')==='[11,22,33]');
      await b.close();
    });

    await step('同步金鑰錯誤時不會覆寫伺服器資料',async()=>{
      const before=fs.readFileSync(path.join(DATA_DIR,'workspace.json'),'utf8');
      const c=await browser.newContext();await isolate(c);await withSync(c);
      await c.addInitScript(()=>localStorage.setItem('ff14ApiToken','wrong'));
      const pc=await c.newPage();await pc.goto(base+'/index.html');
      await pc.waitForFunction(()=>/金鑰/.test(document.getElementById('sync-status').textContent));
      assert.equal(fs.readFileSync(path.join(DATA_DIR,'workspace.json'),'utf8'),before);
      await c.close();
    });

    await step('潛水艇頁經由資料層同步船隊資料',async()=>{
      const a=await browser.newContext();await isolate(a);await withSync(a);
      const pa=await a.newPage();await pa.goto(base+'/submarine.html');
      await pa.waitForFunction(()=>window.FF14Data&&localStorage.getItem('ff14_submarine_planner_v1'));
      // 透過畫面改名第一艘船，等待自動上傳。
      const renamed=await pa.evaluate(()=>{const s=JSON.parse(localStorage.getItem('ff14_submarine_planner_v1'));s.ships[0].name='同步測試號';FF14Data.write('ff14_submarine_planner_v1',s);return s.ships.length});
      assert.equal(renamed,4);
      const file=path.join(DATA_DIR,'submarine.json');
      for(let i=0;i<40&&!(fs.existsSync(file)&&fs.readFileSync(file,'utf8').includes('同步測試號'));i++)await new Promise(r=>setTimeout(r,150));
      assert.ok(fs.readFileSync(file,'utf8').includes('同步測試號'),'潛水艇資料未上傳');
      await a.close();

      const b=await browser.newContext();await isolate(b);await withSync(b);
      const pb=await b.newPage();await pb.goto(base+'/submarine.html');
      await pb.waitForFunction(()=>(localStorage.getItem('ff14_submarine_planner_v1')||'').includes('同步測試號'));
      await b.close();
    });
    await step('過渡期 Supabase：登入後載入舊雲端資料，兩頁共用同一列且互不覆寫',async()=>{
      // 舊版 cloud.js 存的格式：首頁資料鍵直接放在 payload 最上層。
      fakeDb.row={user_id:'u1',payload:{fishSkippedIds:[5],roulettes:{expert:true}},updated_at:'2026-10-01T00:00:00Z'};
      const a=await browser.newContext();await isolate(a);await withFakeSupabase(a);
      const pa=await a.newPage();await pa.goto(base+'/index.html');
      await pa.waitForFunction(()=>/未登入/.test(document.getElementById('sync-status').textContent));
      assert.equal(await pa.isVisible('#sync-login'),true);
      await pa.click('#sync-login');await pa.fill('#auth-email','me@example.com');await pa.fill('#auth-password','secret1');await pa.click('#auth-signin');
      await pa.waitForFunction(()=>localStorage.getItem('fishSkippedIds')==='[5]');
      assert.equal(await pa.isVisible('#sync-logout'),true);
      // 同一個瀏覽器開潛水艇頁：沿用登入，伺服器尚無潛艇資料，就把本機資料上傳。
      const ps=await a.newPage();await ps.goto(base+'/submarine.html');
      for(let i=0;i<40&&!fakeDb.row.payload.ff14_submarine_planner_v1;i++)await new Promise(r=>setTimeout(r,150));
      assert.ok(fakeDb.row.payload.ff14_submarine_planner_v1,'潛艇資料未上傳');
      assert.deepEqual(fakeDb.row.payload.fishSkippedIds,[5],'潛艇頁上傳覆寫了首頁資料');
      // 首頁修改後上傳，潛艇資料保留。
      await pa.evaluate(()=>FF14Data.write('fishSkippedIds',[5,6]));
      for(let i=0;i<40&&JSON.stringify(fakeDb.row.payload.fishSkippedIds)!=='[5,6]';i++)await new Promise(r=>setTimeout(r,150));
      assert.deepEqual(fakeDb.row.payload.fishSkippedIds,[5,6]);
      assert.ok(fakeDb.row.payload.ff14_submarine_planner_v1,'首頁上傳覆寫了潛艇資料');
      await a.close();
      // 另一台已登入的裝置開潛水艇頁，取得船隊資料。
      fakeDb.row.payload.ff14_submarine_planner_v1.ships[0].name='過渡同步號';
      const b=await browser.newContext();await isolate(b);await withFakeSupabase(b);
      await b.addInitScript(()=>localStorage.setItem('fake-session',JSON.stringify({user:{id:'u1',email:'me@example.com'}})));
      const pb=await b.newPage();await pb.goto(base+'/submarine.html');
      await pb.waitForFunction(()=>(localStorage.getItem('ff14_submarine_planner_v1')||'').includes('過渡同步號'));
      await b.close();
    });
  }finally{
    await browser.close();server.close();fs.rmSync(DATA_DIR,{recursive:true,force:true});
  }
  if(failed)process.exit(1);
  console.log('data layer tests passed');
})().catch(e=>{console.error(e);process.exit(1)});
