const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

class FakeEl{
  constructor(id,value=''){this.id=id;this.value=value;this.innerHTML='';this.textContent='';this.dataset={};this.listeners={};this.checked=false;this.classList={toggle(){}}}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)}
  dispatch(type){for(const fn of this.listeners[type]??[])fn({target:this})}
  closest(sel){if(sel==='#refresh-route-plan'&&this.id==='refresh-route-plan')return this;return null}
  querySelectorAll(){return[]}
}

const els=new Map();
const el=(id,value='')=>{const x=new FakeEl(id,value);els.set(id,x);return x};
const result=el('fish-route-result');
const region=el('fish-picker-region','');
const zone=el('fish-picker-zone','');
el('fish-picker-spot','');
el('fish-hide-big').checked=true;
const routeBtn=el('refresh-route-plan');

const section={querySelector(){return null}};
result.closest=()=>section;

const domReady=[];
const docListeners={};
const document={
  head:{appendChild(){}},
  getElementById(id){return els.get(id)||null},
  createElement(){return new FakeEl('created')},
  addEventListener(type,fn){(docListeners[type]??=[]).push(fn)}
};
const localData={
  fishCatalog:JSON.stringify([
    {itemId:1,name:'Fish 1',spots:[{spotId:101,regionName:'R',zoneName:'Map A',spotName:'Spot A'}]},
    {itemId:2,name:'Fish 2',spots:[{spotId:101,regionName:'R',zoneName:'Map A',spotName:'Spot A'}]},
    {itemId:3,name:'Fish 3',spots:[{spotId:102,regionName:'R',zoneName:'Map A',spotName:'Spot B'}]},
    {itemId:4,name:'Fish 4',spots:[{spotId:102,regionName:'R',zoneName:'Map A',spotName:'Spot B'}]}
  ]),
  fishCaughtIds:'[]',fishcakeCaughtIds:'[]',fishSkippedIds:'[]'
};
const localStorage={getItem(k){return localData[k]??null},setItem(k,v){localData[k]=String(v)}};
let infoCalls=0;
const windowObj={
  addEventListener(type,fn){if(type==='DOMContentLoaded')domReady.push(fn)},
  ff14FishingWindowInfo:async()=>{infoCalls++;return{restricted:false,locationId:0,current:null,next:null}},
  ff14FishingPrerequisites:async()=>[],
  ff14TcItemText:s=>s,ff14TcPlaceText:s=>s
};

const context={window:windowObj,document,localStorage,console,setTimeout,clearTimeout,Date,Map,Set,Promise,String,Number,Math,JSON};
vm.createContext(context);
const code=fs.readFileSync('fishing-session-route.js','utf8');
vm.runInContext(code,context,{filename:'fishing-session-route.js'});

(async()=>{
  for(const fn of domReady)fn();
  await new Promise(r=>setTimeout(r,20));
  assert.strictEqual(infoCalls,0,'page load must not calculate fish windows');

  region.value='R'; region.dispatch('change');
  zone.value='Map A'; zone.dispatch('change');
  await new Promise(r=>setTimeout(r,20));
  assert.strictEqual(infoCalls,0,'selecting a map must not calculate fish windows');

  const spot=els.get('fish-picker-spot'); spot.value='Spot A'; spot.dispatch('change');
  await new Promise(r=>setTimeout(r,20));
  assert.strictEqual(infoCalls,0,'selecting a spot must not calculate fish windows');

  assert.strictEqual(typeof windowObj.renderRoutePlanner,'function');
  windowObj.renderRoutePlanner();
  await new Promise(r=>setTimeout(r,10));
  assert.strictEqual(infoCalls,0,'legacy renderRoutePlanner refresh must stay lightweight');

  const click={
    target:{closest(sel){return sel==='#refresh-route-plan'?routeBtn:null}},
    preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}
  };
  for(const fn of docListeners.click??[])fn(click);
  await new Promise(r=>setTimeout(r,100));
  assert.ok(infoCalls>0,'explicit route button must trigger window calculation');
  assert.ok(result.innerHTML.includes('Map A'),'result must remain scoped to selected map');
  console.log(`PASS infoCalls=${infoCalls}`);
})().catch(e=>{console.error(e);process.exit(1)});
