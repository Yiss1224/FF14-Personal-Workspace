// 釣魚頁的操作劇本：每個劇本開一個全新的瀏覽器環境，照使用者會做的事一步一步操作，每一步結束後拍一張快照。
// 重構時拿「改之前」與「改之後」的快照逐字比對；CI 則比對 tests/fixtures/fishing-golden.json 裡的文字、控制項與儲存內容。
'use strict';
const world=require('../fixtures/fishing-world.cjs'),H=require('./fishing-harness.cjs');
const DAY=86400000;
const ymd=ms=>{const d=new Date(ms+8*3600000);return d.toISOString().slice(0,10)};   // 台灣日期

const $catalog='#fish-catalog';
const openTab=t=>t.page.click('nav button[data-tab="fishing"]');
const pick=async(t,id,value)=>{await t.page.selectOption('#fish-picker-'+id,value)};
// 把目前列出的釣點全部展開（跟使用者一個一個點開一樣會觸發 toggle 事件）。
// 先等清單畫完再展開，不然會點在還沒出現的東西上。
const openSpots=async t=>{await H.settle(t.page,{quiet:700});await t.page.$$eval($catalog+' details.spot:not([open]) > summary',els=>els.forEach(e=>e.click()));await H.settle(t.page,{quiet:700})};
const clickIn=async(t,selector)=>{await t.page.waitForSelector(selector,{state:'attached',timeout:15000});await t.page.$eval(selector,el=>typeof el.click==='function'?el.click():el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})))};
const setCheck=(t,id,on)=>t.page.setChecked('#'+id,on);

const RETURNING={
  fishCaughtIds:[4002,4013,4014],fishcakeCaughtIds:[4002,4013,4014],fishSkippedIds:[4015],
  fishHistory:[{date:ymd(world.T0-4*DAY),count:290,target:1140},{date:ymd(world.T0-2*DAY),count:296,target:1140},{date:ymd(world.T0-1*DAY),count:300,target:1140}],
  fishTarget:1140,fishCurrentCount:300,fishOnboardingDismissed:'1'
};

const scenarios=[
{name:'first-visit',async run(t){
  await t.step('home',{min:1500});
  await openTab(t);await t.step('opened',{min:9500});
  await pick(t,'region','La Noscea');await t.step('region');
  await pick(t,'zone','Middle La Noscea');await t.step('zone');
  await openSpots(t);await t.step('zone-spots-open');
  await pick(t,'spot','Summerford');await t.step('spot');
  await openSpots(t);await t.step('spot-open');
  await clickIn(t,$catalog+' [data-caught="4003"]');await t.step('caught-4003');
  await setCheck(t,'fish-only-missing',false);await t.step('show-caught');
  await openSpots(t);await clickIn(t,$catalog+' [data-caught="4003"]');await t.step('uncaught-4003');
  await clickIn(t,$catalog+' [data-caught="4001"]');await t.step('caught-4001-shown');
  await clickIn(t,$catalog+' [data-skip="4004"]');await t.step('skipped-4004');
  await setCheck(t,'fish-hide-skipped',false);await t.step('show-skipped');
  await openSpots(t);await clickIn(t,$catalog+' [data-skip="4004"]');await t.step('unskipped-4004');
  await pick(t,'spot','');await setCheck(t,'fish-hide-big',false);await t.step('zone-with-big');
  await pick(t,'zone','Lower La Noscea');await t.step('zone-lower');
  await setCheck(t,'fish-include-spear',false);await t.step('zone-lower-no-spear');
  await t.page.fill('#fish-search','goby');await t.step('search-goby');
  await t.page.click('#fish-picker-reset');await t.step('reset');
  await t.page.fill('#fish-search','g');await t.step('search-too-short');
  await t.page.fill('#fish-search','Rogue River');await t.step('search-spot-name');
  await openSpots(t);await t.step('search-spot-open');
  await t.page.fill('#fish-search','');await pick(t,'region','The Black Shroud');await pick(t,'zone','Central Shroud');await t.step('fallback-map');
  await clickIn(t,'#fish-zone-map-body .fish-map-point[data-map-spot="The Mirror"]');await t.step('fallback-map-pick');
  await pick(t,'region','The High Seas');await t.step('region-ocean');
  await pick(t,'zone','The High Seas');await t.step('zone-ocean');
}},
{name:'today-and-route',options:{url:'/index.html#fishing',storage:RETURNING},async run(t){
  await t.step('opened',{min:9500});
  await t.page.click('#fish-today-map-refresh');await t.step('today-map');
  await t.page.click('#fish-today-refresh');await t.step('today-spot');
  await setCheck(t,'fish-today-big',true);await t.page.selectOption('#fish-today-session','120');
  await t.page.click('#fish-today-map-refresh');await t.page.click('#fish-today-refresh');await t.step('today-big-120');
  await t.page.selectOption('#fish-today-session','60');await setCheck(t,'fish-today-big',false);
  await t.page.click('#fish-today-map-refresh');await t.page.click('#fish-today-refresh');await t.step('today-60');
  await t.page.click('#fish-more-tools > summary');await t.step('whitefish');
  await clickIn(t,'#fish-today-result .today-spot-tag');await t.step('jump-to-spot');
  await clickIn(t,'#fish-today-map-result [data-map-zone]');await t.step('jump-to-map');
  await pick(t,'region','The Black Shroud');await pick(t,'zone','Central Shroud');await t.step('shroud');
  await t.page.click('#refresh-route-plan');await t.step('route-shroud');
  await pick(t,'region','La Noscea');await pick(t,'zone','Middle La Noscea');await t.step('middle');
  await t.page.selectOption('#fish-route-session','120');await t.page.click('#refresh-route-plan');await t.step('route-middle-120');
  await clickIn(t,'#fish-route-result .session-route-stop:nth-of-type(1) [data-session-route-spot]');await t.step('route-goto-stop');
  await openSpots(t);await clickIn(t,$catalog+' [data-caught]');await t.step('route-after-caught');
  await pick(t,'spot','');await setCheck(t,'fish-hide-big',false);await t.step('route-stale-by-big');
  await t.page.click('#refresh-route-plan');await t.step('route-with-big');
  await t.page.selectOption('#fish-today-session','90');await t.step('route-stale-by-session');
  await t.page.click('#refresh-route-plan');await t.step('route-90');
  await t.page.evaluate(()=>window.scrollTo(0,document.getElementById('fish-catalog').getBoundingClientRect().top+window.scrollY));await t.step('dock-floating');
  await t.page.click('#fish-floating-planner-dock .fish-floating-planner-toggle');await t.step('dock-collapsed');
  await t.page.click('#fish-floating-planner-dock .fish-floating-planner-toggle');await t.step('dock-expanded');
  await clickIn(t,'#fish-floating-planner-dock .ff14-map-marker[data-map-spot="Rogue River"]');await t.step('dock-pick-spot');
  await t.page.evaluate(()=>window.scrollTo(0,0));await t.step('dock-restored');
  await t.page.click('nav button[data-tab="dashboard"]');await t.step('home');
  await clickIn(t,'#dashboard article:nth-of-type(4) button');await t.step('home-today-button',{min:600});
}},
{name:'guide-and-shopping',options:{url:'/index.html#fishing',storage:RETURNING},async run(t){
  await t.step('opened',{min:9500});
  await pick(t,'region','La Noscea');await pick(t,'zone','Middle La Noscea');await openSpots(t);await t.step('zone-open');
  await t.page.selectOption($catalog+' [data-fg-universal="4001"]','no');await t.step('universal-no-4001');
  await openSpots(t);await t.page.selectOption($catalog+' [data-fg-universal="4003"]','no');await t.step('universal-no-4003');
  await openSpots(t);await t.page.selectOption($catalog+' [data-fg-universal="4005"]','yes');await t.step('universal-yes-4005');
  await t.page.click('#fish-shopping-toggle');await t.step('shopping-open');
  await setCheck(t,'fish-bait-only-required',false);await t.step('shopping-all');
  await clickIn(t,'#fish-bait-list [data-fg-source="Lugworm"]');await t.step('source-lugworm');
  await t.page.click('#resolve-bait-sources');await t.step('sources-resolved',{min:1500});
  await clickIn(t,'#fish-bait-list .npc-map-link');await t.step('npc-map');
  await clickIn(t,'#ff14-npc-map-dialog [data-npc-map-close]');await t.step('npc-map-closed');
  await t.page.check('#fish-bait-list [data-fg-owned="Lugworm"]');await t.step('owned-lugworm');
  await t.page.fill('#fish-bait-list [data-fg-note="Pill Bug"]','在利姆薩買');await t.page.dispatchEvent('#fish-bait-list [data-fg-note="Pill Bug"]','change');await t.step('note');
  await setCheck(t,'fish-bait-only-required',true);await t.step('shopping-required');
  await t.page.click('#fish-shopping-toggle');await t.step('shopping-closed');
  await openSpots(t);
  t.page.once('dialog',d=>d.accept('8–12s'));await clickIn(t,$catalog+' [data-fg-bite-edit="4004"]');await t.step('manual-bite');
  await openSpots(t);await t.page.click('#load-visible-bite-times');await t.step('visible-bites',{min:1500});
  await t.page.click('#refresh-fish-methods');await t.step('methods-refreshed');
  await t.page.click('#refresh-tc-terms');await t.step('tc-refreshed');
  await t.page.click('#refresh-fish-data');await t.step('catalog-refreshed',{min:2500});
  await t.page.reload();await t.step('reloaded-with-cache',{min:9500});
  await pick(t,'region','La Noscea');await pick(t,'zone','Middle La Noscea');await pick(t,'spot','Zephyr Drift');await openSpots(t);await t.step('reloaded-spot');
}},
{name:'progress',async run(t){
  await openTab(t);await t.step('opened',{min:9500});
  await t.page.click('#fish-onboard-close');await t.step('onboard-closed');
  await t.page.click('#fish-onboard-open');await t.step('onboard-reopened');
  await t.page.fill('#fish-count','300');await t.page.click('#save-fish');await t.step('saved-300');
  await t.page.setInputFiles('#fishcake-file',{name:'fishcake.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({completed:[4001,4002,{id:4003},99999]}))});await t.step('imported');
  await t.page.setInputFiles('#fishcake-file',{name:'again.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([4002,4008]))});await t.step('imported-array');
  await t.page.setInputFiles('#fishcake-file',{name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"foo":1}')});await t.step('import-failed');
  const[download]=await Promise.all([t.page.waitForEvent('download'),t.page.click('#export-fishcake')]);
  t.note('export-file',{name:download.suggestedFilename(),body:require('fs').readFileSync(await download.path(),'utf8')});await t.step('exported');
  await pick(t,'region','La Noscea');await pick(t,'zone','Middle La Noscea');await openSpots(t);await t.step('zone-after-import');
  t.page.once('dialog',d=>d.accept());
  await t.page.setInputFiles('#workspace-backup-file',{name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'ff14-personal-workspace',schema:1,scope:'workspace',exportedAt:new Date(world.T0).toISOString(),data:{fishCaughtIds:[4010,4011],fishcakeCaughtIds:[4010,4011],fishSkippedIds:[4001],fishHistory:[{date:ymd(world.T0-3*DAY),count:500,target:1000},{date:ymd(world.T0),count:520,target:1000}],fishTarget:1000,fishCurrentCount:520,fishUniversalLureOverrides:{4002:'no'},fishBaitOwned:{Lugworm:true}}}))});
  await t.step('backup-restored');
  await openSpots(t);await t.step('backup-restored-open');
}},
{name:'failures',options:{url:'/index.html#fishing',fail:/v2\.xivapi\.com/},async run(t){
  await t.step('catalog-failed',{min:9500});
  await t.page.click('#fish-today-map-refresh');await t.step('recommend-blocked');
  t.state.fail=null;
  await clickIn(t,'[data-fish-retry]');await t.step('retried',{min:3000});
  await t.page.click('#fish-today-refresh');await t.step('today-after-retry');
}},
{name:'slow-first-click',options:{url:'/index.html#fishing',delay:1800},async run(t){
  await t.page.click('#fish-today-refresh');await t.step('waiting',{quiet:300,max:1500,loose:true});
  await t.step('auto-ran',{min:9500});
}},
{name:'tracker-down',options:{url:'/index.html#fishing',storage:RETURNING,fail:/js\/app\/data\.js|fishData\.yaml|spot_data/},async run(t){
  await t.step('opened',{min:9500});
  await t.page.click('#fish-today-map-refresh');await t.page.click('#fish-today-refresh');await t.step('today-no-windows');
  await pick(t,'region','La Noscea');await pick(t,'zone','Middle La Noscea');await openSpots(t);await t.step('zone-no-methods');
  await t.page.click('#refresh-route-plan');await t.step('route-no-windows');
}},
{name:'legacy-cache',options:{url:'/index.html#fishing',storage:{
  fishCatalog:[{rowId:1,itemId:4001,type:'fishing',name:'Lominsan Anchovy',bigFish:false,hidden:false,spotId:1,spotName:'35',zoneName:'La Noscea',regionName:'La Noscea',x:600,y:700,spots:[{spotId:1,spotName:'35',zoneName:'La Noscea',regionName:'La Noscea',x:600,y:700}]}],
  fishCatalogUpdatedAt:world.T0-DAY,fishCatalogSchema:3,fishCaughtIds:[4001],fishcakeCaughtIds:[4001]}},async run(t){
  await t.step('repaired',{min:9500});
  await pick(t,'region','La Noscea');await pick(t,'zone','Middle La Noscea');await t.step('zone');
}},
{name:'phone',options:{url:'/index.html#fishing',storage:RETURNING,viewport:{width:390,height:800}},async run(t){
  await t.step('opened',{min:9500});
  await t.page.click('#fish-today-map-refresh');await t.step('today-map');
  await clickIn(t,'#fish-today-map-result [data-map-zone]');await t.step('jump-to-map');
  await t.page.click('#refresh-route-plan');await t.step('route');
  await t.page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await t.step('scrolled');
}}
];
module.exports={scenarios};
