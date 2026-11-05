const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={window:{addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},console};
vm.runInNewContext(fs.readFileSync('tc-terms.js','utf8')+';this.__t={setCache:c=>{ff14TcCache=c},replace:ff14TcReplaceTextNode};',context);
const t=context.__t;
// Insertion (ID) order puts the short name first, as PlaceName.csv does: 177 Bronze Lake before 987 Northeast Bronze Lake.
t.setCache({ts:1,items:{},weather:{Rain:'小雨'},itemEnglish:{},places:{'Bronze Lake':'石綠湖','Northeast Bronze Lake':'石綠湖東北岸','Bronze Lake Shallows':'石綠湖淺灘','Northwest Bronze Lake Depths':'石綠湖西北湖底',"Fool's Falls":'愚者瀑布'}});
const run=text=>{const node={nodeValue:text};t.replace(node);return node.nodeValue};
assert.equal(run('Northeast Bronze Lake'),'石綠湖東北岸');
assert.equal(run('Bronze Lake Shallows'),'石綠湖淺灘');
assert.equal(run('Northwest Bronze Lake Depths · Rain'),'石綠湖西北湖底 · 小雨');
assert.equal(run('Bronze Lake / Northeast Bronze Lake'),'石綠湖 / 石綠湖東北岸');
assert.equal(run("Fool's Falls"),'愚者瀑布');
assert.equal(run('Bronze Lakes'),'Bronze Lakes','no partial-word replacement');
// in-place mutation + ts bump must invalidate the compiled matcher
t.setCache({ts:2,items:{},weather:{},itemEnglish:{},places:{'Bronze Lake':'石綠湖'}});
assert.equal(run('Northeast Bronze Lake'),'Northeast 石綠湖');
console.log('tc terms longest-match smoke passed');
