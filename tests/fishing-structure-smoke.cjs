// 釣魚頁的結構守則：每個功能只有一支腳本負責，不再用後面的腳本覆寫前面的函式。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script src="([^"?]+\.js)/g)].map(m=>m[1]);
const fishing=scripts.filter(f=>f.startsWith('fishing-')||f==='tc-terms.js');

// index.html 載入的腳本都存在，而且 fishing-*.js 沒有漏掉沒載入的死檔。
for(const f of scripts)assert(fs.existsSync(f),`${f} is loaded by index.html but missing`);
for(const f of fs.readdirSync('.').filter(f=>/^fishing-.*\.js$/.test(f)))assert(fishing.includes(f),`${f} exists but index.html does not load it`);

// 共用工具最先載入；app.js（store、esc）在所有釣魚腳本之前。
assert.equal(fishing[0],'fishing-shared.js');
for(const f of fishing.slice(1))assert(scripts.indexOf('app.js')<scripts.indexOf(f),`${f} loads after app.js`);

// 這些全域函式各自只能有一個定義；以前是好幾支腳本層層覆寫。
const sources=Object.fromEntries(scripts.map(f=>[f,fs.readFileSync(f,'utf8')]));
const single=['renderFishCatalog','refreshFishCatalog','renderFish','renderRoutePlanner','renderVendorPlan','renderBaitShoppingList','locationParts','ff14TcCsvMeta','selectFishingSpot','getCaughtIds'];
for(const name of single){
  const defs=[];
  for(const[f,src]of Object.entries(sources)){
    const n=(src.match(new RegExp(`function ${name}\\(|window\\.${name}\\s*=[^=]|^\\s*${name}\\s*=[^=]`,'gm'))||[]).length;
    if(n)defs.push(`${f}×${n}`);
  }
  assert.equal(defs.length,1,`${name} must be defined in exactly one script, found: ${defs.join(', ')||'none'}`);
  assert(defs[0].endsWith('×1'),`${name} is defined more than once in ${defs[0]}`);
}
// 不可以再攔截／包裝別支腳本的函式。
for(const[f,src]of Object.entries(sources)){
  assert(!/try\{\s*(renderFishCatalog|refreshFishCatalog)\s*=/.test(src),`${f} reassigns a global function`);
}

const map=sources['fishing-map.js'];
assert(!map.includes('window.__fishMapTimer'), 'map render timer is no longer global');
assert(map.includes("window.addEventListener('pagehide'"), 'map observer/timer have teardown');
console.log('fishing structure smoke passed');
