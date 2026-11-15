// 逐字比對兩份完整快照（node tests/fishing-golden-playwright.cjs --dump 產生的檔案）。
// 重構釣魚頁時用：先對改之前的程式碼錄一份，改完再錄一份，兩份的 HTML、文字、控制項、儲存內容都要一模一樣。
//   node tests/tools/fishing-dump-diff.cjs before.json after.json [--ignore styles,requests]
'use strict';
const fs=require('fs');
const[a,b]=[process.argv[2],process.argv[3]].map(f=>JSON.parse(fs.readFileSync(f,'utf8')));
const i=process.argv.indexOf('--ignore'),ignore=new Set(i>0?process.argv[i+1].split(','):[]);
const problems=[];
function hint(x,y){
  if(typeof x!=='string'||typeof y!=='string')return`\n    前 ${JSON.stringify(x)?.slice(0,300)}\n    後 ${JSON.stringify(y)?.slice(0,300)}`;
  let k=0;while(k<x.length&&k<y.length&&x[k]===y[k])k++;const from=Math.max(0,k-80);
  return`（第 ${k} 個字開始，長度 ${x.length} → ${y.length}）\n    前 …${x.slice(from,k+200)}\n    後 …${y.slice(from,k+200)}`;
}
const seen=new Set();
function same(where,x,y,once){if(JSON.stringify(x)===JSON.stringify(y))return;if(once){if(seen.has(once))return;seen.add(once)}problems.push(`${where}${hint(typeof x==='string'?x:JSON.stringify(x),typeof y==='string'?y:JSON.stringify(y))}`)}
const byName=list=>new Map(list.map(s=>[s.name,s]));
const A=byName(a),B=byName(b);
for(const name of new Set([...A.keys(),...B.keys()])){
  const x=A.get(name),y=B.get(name);
  if(!x||!y){problems.push(`${name}: 只有${x?'前':'後'}面那份有這個劇本`);continue}
  if(!ignore.has('errors'))same(`${name}: 頁面錯誤`,x.errors,y.errors);
  if(!ignore.has('requests'))for(const u of new Set([...Object.keys(x.requests),...Object.keys(y.requests)]))if(x.requests[u]!==y.requests[u])problems.push(`${name}: 外部請求次數不同 ${x.requests[u]||0} → ${y.requests[u]||0}  ${u.slice(0,150)}`);
  same(`${name}: 匯出檔`,x.notes,y.notes);
  if(x.steps.length!==y.steps.length)problems.push(`${name}: 步驟數 ${x.steps.length} → ${y.steps.length}`);
  for(let s=0;s<Math.min(x.steps.length,y.steps.length);s++){
    const p=x.steps[s],q=y.steps[s],at=`${name}/${p.name}`;
    for(const part of ['html','text','controls','storage','globals']){
      if(ignore.has(part))continue;
      for(const k of new Set([...Object.keys(p[part]||{}),...Object.keys(q[part]||{})]))same(`${at}: ${part}.${k}`,p[part]?.[k]??null,q[part]?.[k]??null,part==='storage'?`${name}|${k}|${p.storage?.[k]}|${q.storage?.[k]}`:null);
    }
    if(!ignore.has('styles'))same(`${at}: 注入的樣式`,p.styles,q.styles);
  }
}
if(problems.length){console.log(`不一樣的地方 ${problems.length} 處：\n`+problems.slice(0,Number(process.env.MAX)||25).join('\n'));process.exit(1)}
console.log('兩份快照完全相同');
