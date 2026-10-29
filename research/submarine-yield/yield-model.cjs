// Prototype: expected loot value per voyage for every build on one route.
// Usage: node research/submarine-yield/yield-model.cjs [rank=85] [route=O,J] [--modified]
// Not wired into the site; see README.md for which parts of the model are community-derived.
'use strict';
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..','..');
const yd=JSON.parse(fs.readFileSync(path.join(__dirname,'yield-data.json'),'utf8'));
const route=JSON.parse(fs.readFileSync(path.join(root,'submarine-route-data.json'),'utf8'));
const args=process.argv.slice(2),flags=new Set(args.filter(a=>a.startsWith('--')));
const pos=args.filter(a=>!a.startsWith('--'));
const rank=Number(pos[0]||85),letters=(pos[1]||'O,J').split(','),map=1;
const classes=flags.has('--modified')?[1,2,3,4,5,6,7,8,9,10]:[1,2,3,4,5];

// Same NPC prices as submarine-prices.js, keyed by itemId.
const npc={22500:8000,22501:9000,22502:10000,22503:13000,22504:27000,22505:28500,22506:30000,22507:34500};
const price=id=>npc[id]??null;

// Speed/range must agree with submarine-calculator.js partStats for classes 1–5.
const calcSrc=fs.readFileSync(path.join(root,'submarine-calculator.js'),'utf8');
const partStats=Function('return '+calcSrc.match(/const partStats=(\{[\s\S]*?\n\});?\n/)[1])();
for(let c=1;c<=5;c++)for(let s=0;s<4;s++){
 const a=partStats[c][s],b=yd.parts[c][s];
 if(a[0]!==b[0]||a[1]!==b[1]||a[2]!==b[4]||a[3]!==b[5])throw new Error('part mismatch '+c+':'+s);
}

const rec=route.ranks.filter(x=>x.rank<=rank).at(-1);
const sectors=letters.map(l=>route.sectors.find(x=>x.map===map&&x.letter===l));
const home=0;
const travel=(d,v)=>Math.floor(d*3990/(v*100)*60),survey=(p,v)=>Math.floor(p.sd*7000/(v*100)*60);

function stats(key){
 const rows=key.map((c,i)=>yd.parts[c][i]),sum=n=>rows.reduce((a,x)=>a+x[n],0);
 return {min:Math.max(...rows.map(x=>x[0])),cost:sum(1),s:sum(2)+rec.s,r:sum(3)+rec.r,v:sum(4)+rec.v,d:sum(5)+rec.d,f:sum(6)+rec.f};
}
function metrics(st){
 let prev=home,range=0,time=43200;
 for(const p of sectors){const e=p.to[String(prev)];range+=e[0]+p.sr;time+=travel(e[1],st.v)+survey(p,st.v);prev=p.id}
 return {range,time};
}
// One sector visit. Tier odds are conditioned on the surveillance class seen in the community data,
// item odds within a tier are the pool's overall shares, quantity is the midpoint of the retrieval range.
function sectorValue(id,st,ddRate){
 const sec=yd.sectors[id],[t2,t3,normal,optimal,favor]=sec.breakpoints;
 const sc=st.s>=t3?2:st.s>=t2?1:0,rc=st.r>=optimal?2:st.r>=normal?1:0,fav=st.f>=favor;
 const pools=Object.values(sec.pools),classTotal=pools.reduce((a,p)=>a+p.surv[sc],0);
 let gil=0,unpriced=0;
 for(const p of pools){
  const pt=classTotal?p.surv[sc]/classTotal:0;
  for(const [itemId,amount,...ranges] of p.items){
   const pi=pt*amount/p.records,q=(ranges[rc][0]+ranges[rc][1])/2,v=price(itemId);
   if(v===null)unpriced+=pi;else gil+=pi*q*v;
  }
 }
 const items=1+(fav?ddRate:0);
 return {gil:gil*items,unpriced,items,sc,rc,fav,thin:classTotal<1000};
}
// Share of favor-capable visits that gave a second item. The source counts items, not visits, so
// the exact rate is unverified: website formula (doubleDips/favor) vs. treating each double dip as two items.
function ddRates(id){
 const pools=Object.values(yd.sectors[id].pools),F=pools.reduce((a,p)=>a+p.favor,0),D=pools.reduce((a,p)=>a+p.doubleDips,0);
 return {high:D/F,low:(D/2)/(F-D/2)};
}

const out=[];
const keys=[];
for(const a of classes)for(const b of classes)for(const c of classes)for(const d of classes)keys.push([a,b,c,d]);
for(const key of keys){
 const st=stats(key);if(rank<st.min||st.cost>rec.cap)continue;
 const m=metrics(st);if(m.range>st.d)continue;
 let lo=0,hi=0,unp=0,desc=[];
 for(const p of sectors){
  const r=ddRates(p.id),a=sectorValue(p.id,st,r.low),b=sectorValue(p.id,st,r.high);
  lo+=a.gil;hi+=b.gil;unp+=a.unpriced;
  desc.push(p.letter+':'+['T1','T2','T3'][a.sc]+'/'+['差','普','優'][a.rc]+(a.fav?'/恩':'')+(a.thin?'?':''));
 }
 out.push({build:key.map(c=>c>5?(c-5)+'改':c).join(''),...st,hours:m.time/3600,gilLo:lo,gilHi:hi,unpriced:unp,desc:desc.join(' ')});
}
out.sort((a,b)=>b.gilLo-a.gilLo||a.hours-b.hours);
const pick=new Set((process.env.SHOW||'3124,3114,3122,4124').split(','));
const fmt=x=>[x.build.padEnd(10),'探'+x.s,'收'+x.r,'恩'+x.f,'速'+x.v,x.hours.toFixed(2)+'h',
 Math.round(x.gilLo).toLocaleString()+'–'+Math.round(x.gilHi).toLocaleString()+' Gil','未計價機率 '+x.unpriced.toFixed(2),x.desc].join('  ');
console.log('Rank',rank,'route',letters.join('→'),'可行配置',out.length);
console.log('— 前 15 名 —');out.slice(0,15).forEach(x=>console.log(fmt(x)));
console.log('— 指定配置 —');out.filter(x=>pick.has(x.build)).forEach(x=>console.log('#'+(out.indexOf(x)+1),fmt(x)));
