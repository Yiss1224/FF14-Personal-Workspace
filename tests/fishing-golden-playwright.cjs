// 釣魚頁回歸測試：照 tests/lib/fishing-scenarios.cjs 的劇本操作，
// 把每一步的畫面文字、控制項狀態與 localStorage 跟 tests/fixtures/fishing-golden.json 比對。
// 外部資料全部由 tests/fixtures/fishing-world.cjs 的假世界回應，時間固定，所以結果每次都一樣。
//
//   node tests/fishing-golden-playwright.cjs                 跑全部劇本並比對
//   node tests/fishing-golden-playwright.cjs --update        畫面是故意改的：重寫基準檔（請檢查 diff 再提交）
//   node tests/fishing-golden-playwright.cjs --only phone    只跑名稱含 phone 的劇本
//   node tests/fishing-golden-playwright.cjs --root DIR --dump FILE   對另一份程式碼跑，並把完整快照（含 HTML）寫到 FILE
'use strict';
const fs=require('fs'),path=require('path');
const H=require('./lib/fishing-harness.cjs'),world=require('./fixtures/fishing-world.cjs'),{scenarios}=require('./lib/fishing-scenarios.cjs');
const GOLDEN=path.join(__dirname,'fixtures','fishing-golden.json');
const arg=name=>{const i=process.argv.indexOf('--'+name);return i<0?null:(process.argv[i+1]&&!process.argv[i+1].startsWith('--')?process.argv[i+1]:true)};
const lines=s=>s==null?null:String(s).split(/\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);

async function runScenario(browser,base,sc){
  const t=await H.open(browser,base,{world,...(sc.options||{})}),steps=[],notes={};
  t.note=(k,v)=>{notes[k]=v};
  t.step=async(name,opts={})=>{
    let snap;
    try{snap=await H.settle(t.page,opts)}catch(e){if(!opts.loose)throw new Error(`${sc.name}/${name}: ${e.message}`);snap=await H.snapshot(t.page)}
    snap.text=await t.page.evaluate(roots=>Object.fromEntries(Object.entries(roots).map(([k,sel])=>[k,document.querySelector(sel)?.innerText??null])),H.ROOTS);
    steps.push({name,...snap});
  };
  try{await sc.run(t)}
  catch(e){
    if(process.env.FISH_DEBUG_DIR){try{await t.page.screenshot({path:path.join(process.env.FISH_DEBUG_DIR,`fail-${sc.name}.png`),fullPage:true});fs.writeFileSync(path.join(process.env.FISH_DEBUG_DIR,`fail-${sc.name}.html`),await t.page.content())}catch{}}
    e.message=`[${sc.name} 第 ${steps.length+1} 步，前一步 ${steps[steps.length-1]?.name||'—'}] ${e.message}`;throw e}
  finally{await t.ctx.close()}
  const requests={};for(const r of t.state.requests)requests[r]=(requests[r]||0)+1;
  return{name:sc.name,steps,notes,errors:t.state.errors,unknown:t.state.unknown,requests:Object.fromEntries(Object.entries(requests).sort())};
}

// CI 基準只留文字、控制項、儲存內容；儲存內容只記跟上一步不同的鍵，檔案才不會太大。
function project(result){
  let prev={};
  const steps=result.steps.map(s=>{
    const changed={};
    for(const k of new Set([...Object.keys(prev),...Object.keys(s.storage)]))if(prev[k]!==s.storage[k])changed[k]=s.storage[k]??null;
    prev=s.storage;
    const text={};for(const[k,v]of Object.entries(s.text))if(v!=null)text[k]=lines(v);
    return{name:s.name,text,controls:s.controls,storageChanged:changed};
  });
  return{steps,notes:result.notes,errors:result.errors};
}
const flat=v=>Array.isArray(v)?v.join(' '):v;
function compare(name,want,got){
  const out=[];
  if(!want){out.push(`${name}: 基準檔裡沒有這個劇本`);return out}
  if(JSON.stringify(want.notes)!==JSON.stringify(got.notes))out.push(`${name}: 匯出檔內容不同`);
  if(JSON.stringify(want.errors)!==JSON.stringify(got.errors))out.push(`${name}: 頁面錯誤不同\n  基準 ${JSON.stringify(want.errors)}\n  實際 ${JSON.stringify(got.errors)}`);
  if(want.steps.length!==got.steps.length)out.push(`${name}: 步驟數不同（基準 ${want.steps.length}，實際 ${got.steps.length}）`);
  for(let i=0;i<Math.min(want.steps.length,got.steps.length);i++){
    const a=want.steps[i],b=got.steps[i],at=`${name}/${a.name}`;
    for(const root of new Set([...Object.keys(a.text),...Object.keys(b.text)])){
      const x=flat(a.text[root])??null,y=flat(b.text[root])??null;
      if(x!==y)out.push(`${at}: ${root} 的文字不同${diffHint(x,y)}`);
    }
    for(const root of new Set([...Object.keys(a.controls),...Object.keys(b.controls)])){
      const x=a.controls[root]||[],y=b.controls[root]||[];
      if(JSON.stringify(x)!==JSON.stringify(y))out.push(`${at}: ${root} 的控制項不同\n  少了 ${JSON.stringify(x.filter(v=>!y.includes(v)))}\n  多了 ${JSON.stringify(y.filter(v=>!x.includes(v)))}`);
    }
    for(const k of new Set([...Object.keys(a.storageChanged),...Object.keys(b.storageChanged)])){
      if(a.storageChanged[k]!==b.storageChanged[k])out.push(`${at}: localStorage「${k}」不同${diffHint(a.storageChanged[k],b.storageChanged[k])}`);
    }
  }
  return out;
}
function diffHint(x,y){
  if(x==null||y==null)return`\n  基準 ${x==null?'（沒有）':JSON.stringify(String(x).slice(0,160))}\n  實際 ${y==null?'（沒有）':JSON.stringify(String(y).slice(0,160))}`;
  x=String(x);y=String(y);let i=0;while(i<x.length&&i<y.length&&x[i]===y[i])i++;
  const from=Math.max(0,i-60);
  return`（第 ${i} 個字開始）\n  基準 …${JSON.stringify(x.slice(from,i+120))}\n  實際 …${JSON.stringify(y.slice(from,i+120))}`;
}

(async()=>{
  const root=path.resolve(arg('root')||path.join(__dirname,'..')),only=arg('only'),dump=arg('dump'),update=arg('update');
  const list=scenarios.filter(s=>!only||s.name.includes(only));
  const{server,base}=await H.serve(root),browser=await H.launch();
  let results;
  try{
    // 一次跑幾個劇本；每個劇本有自己的瀏覽器環境，互不影響。
    const queue=list.slice(),running=[];results=[];
    const worker=async()=>{for(;;){const sc=queue.shift();if(!sc)return;const started=Date.now();const r=await runScenario(browser,base,sc);results.push(r);console.log(`  ${sc.name}: ${r.steps.length} 步，${((Date.now()-started)/1000).toFixed(0)} 秒`)}};
    for(let i=0;i<Math.min(Number(arg('jobs'))||3,list.length);i++)running.push(worker());
    await Promise.all(running);
    results.sort((a,b)=>list.findIndex(s=>s.name===a.name)-list.findIndex(s=>s.name===b.name));
  }finally{await browser.close();server.close()}
  for(const r of results)if(r.unknown.length)console.warn(`  ${r.name}: 假世界沒有回應的網址：${[...new Set(r.unknown)].join(', ')}`);
  if(dump){fs.writeFileSync(dump,JSON.stringify(results));console.log('完整快照已寫到 '+dump)}
  const projected=Object.fromEntries(results.map(r=>[r.name,project(r)]));
  if(update){
    const merged=only&&fs.existsSync(GOLDEN)?{...JSON.parse(fs.readFileSync(GOLDEN,'utf8')),...projected}:projected;
    fs.writeFileSync(GOLDEN,JSON.stringify(merged,null,1)+'\n');console.log('基準檔已更新：'+path.relative(process.cwd(),GOLDEN));return;
  }
  if(dump&&!fs.existsSync(GOLDEN))return;
  const golden=JSON.parse(fs.readFileSync(GOLDEN,'utf8')),problems=[];
  for(const[name,got]of Object.entries(projected))problems.push(...compare(name,golden[name],JSON.parse(JSON.stringify(got))));
  if(problems.length){console.error(`釣魚頁跟基準不一樣（${problems.length} 處）：\n`+problems.slice(0,40).join('\n')+(problems.length>40?`\n…另外還有 ${problems.length-40} 處`:'')+'\n\n如果這是故意的改動，執行 node tests/fishing-golden-playwright.cjs --update 後檢查 diff。');process.exit(1)}
  console.log(`fishing golden ok（${results.length} 個劇本，${results.reduce((n,r)=>n+r.steps.length,0)} 步）`);
})().catch(e=>{console.error(String(e&&e.message||e).split('\n').slice(0,4).join('\n'));if(process.env.FISH_DEBUG_DIR)console.error(e);process.exit(1)});
