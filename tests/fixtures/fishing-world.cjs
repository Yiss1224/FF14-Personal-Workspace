// 釣魚頁測試用的假世界：把釣魚頁會向外部要的每一份資料都用一小組固定資料回應。
// 檔案格式照真實來源（XIVAPI v2、ffxiv-datamining 英文／台服 CSV、魚糕 tracker、Lodinn、Garland）的樣子做，
// 內容是手寫的小資料：3 張陸地地圖 + 出海垂釣 + 刺魚，約 25 種魚，涵蓋多釣點、魚王、限時、天氣、直感前置。
'use strict';

// 測試把頁面時間固定在這一刻（台灣時間 2026-11-14 20:00）。
const T0=Date.UTC(2026,10,14,12,0,0);
const ET_HOUR_MS=175000;
const H0=Math.floor((T0/ET_HOUR_MS)%24);   // 這一刻的艾歐澤亞整點
const hour=n=>((H0+n)%24+24)%24;

const name=n=>({fields:{Name:n}});
// territory: 地圖名(zone)、上層區域(group)、大區(region)
const TERRITORY={
  134:{zone:'Middle La Noscea',group:'La Noscea',region:'La Noscea',map:'s1f1/00',size:100},
  135:{zone:'Lower La Noscea',group:'La Noscea',region:'La Noscea',map:'s1f2/00',size:100},
  137:{zone:'Eastern La Noscea',group:'La Noscea',region:'La Noscea',map:'s1f3/00',size:100},
  148:{zone:'Central Shroud',group:'The Black Shroud',region:'The Black Shroud',map:'',size:100},   // 故意沒有地圖素材 → 走座標示意圖
  900:{zone:'The High Seas',group:'The High Seas',region:'The High Seas',map:'',size:100}
};
const territoryRel=id=>{const t=TERRITORY[id];return{row_id:id,fields:{PlaceName:name(t.zone),PlaceNameZone:name(t.group),PlaceNameRegion:name(t.region)}}};

const SPOTS={
  1:{name:'Zephyr Drift',territory:134,x:600,z:700},
  2:{name:'Summerford',territory:134,x:1100,z:900},
  3:{name:'Rogue River',territory:134,x:1400,z:1300},
  4:{name:'Moraby Bay',territory:135,x:800,z:1200},
  5:{name:'North Moraby Bay',territory:135,x:1300,z:600},
  6:{name:'The Vein',territory:148,x:900,z:800},
  7:{name:'The Mirror',territory:148,x:1200,z:1100},
  8:{name:'Galadion Bay',territory:900,x:0,z:0},
  9:{name:'Costa del Sol',territory:137,x:1500,z:1500}
};
const spotRel=id=>{const s=SPOTS[id];return{row_id:id,fields:{PlaceName:name(s.name),PlaceNameMain:name(''),PlaceNameSub:name(''),TerritoryType:territoryRel(s.territory),X:s.x,Z:s.z}}};

// spots[0] 是 FishParameter 記的主釣點，其餘只出現在 FishingSpot.Item[]。
// tracker: 魚糕 tracker (data.js) 的窗口資料；method: fishData.yaml 的釣法；兩者都可以缺。
const FISH=[
  {id:4001,name:'Lominsan Anchovy',spots:[1,2],tracker:{},method:{path:['Lugworm'],tug:'Light',hookset:'Precision'}},
  {id:4002,name:'Merlthor Goby',spots:[1],tracker:{},method:{path:['Lugworm'],tug:'Light',hookset:'Precision'}},
  {id:4003,name:'Harbor Herring',spots:[2,4],tracker:{},method:{path:['Pill Bug'],tug:'Medium',hookset:'Powerful'}},
  {id:4004,name:'Ocean Cloud',spots:[2],tracker:{startHour:hour(-1),endHour:hour(3)},method:{path:['Lugworm','Merlthor Goby'],tug:'Heavy',hookset:'Powerful'}},
  {id:4005,name:'Tiger Cod',spots:[3],tracker:{startHour:hour(2),endHour:hour(6)},method:{path:['Pill Bug'],tug:'Medium',hookset:'Powerful'}},
  {id:4006,name:'Fullmoon Sardine',spots:[3],tracker:{weatherSet:[1]},method:{path:['Spoon Worm'],tug:'Light',hookset:'Precision',weatherSet:['Clear Skies']}},
  {id:4007,name:'Nimble Dancer',spots:[1],big:true,tracker:{startHour:hour(1),endHour:hour(5),previousWeatherSet:[1,2],weatherSet:[2,3]},method:{path:['Lugworm','Merlthor Goby'],tug:'Legendary',hookset:'Powerful',previousWeatherSet:['Clear Skies','Fair Skies'],weatherSet:['Fair Skies','Clouds']}},
  {id:4008,name:'Princess Trout',spots:[6],tracker:{},method:{path:['Moth Pupa'],tug:'Light',hookset:'Precision'}},
  {id:4009,name:'Dusk Goby',spots:[6],tracker:{startHour:hour(10),endHour:hour(14)},method:{path:['Moth Pupa'],tug:'Medium',hookset:'Powerful'}},
  {id:4010,name:'Bluebell Salmon',spots:[7],tracker:{},method:{path:['Moth Pupa'],tug:'Medium',hookset:'Powerful'}},
  {id:4011,name:'Striped Goby',spots:[6,7],tracker:{},method:{path:['Moth Pupa'],tug:'Light',hookset:'Precision'}},
  {id:4012,name:'Crimson Trout',spots:[7],tracker:{startHour:hour(-2),endHour:hour(4),predators:[[4013,2]]},method:{path:['Moth Pupa'],tug:'Heavy',hookset:'Powerful'}},
  {id:4013,name:'Shadow Catfish',spots:[7],tracker:{startHour:hour(-1),endHour:hour(2)},method:{path:['Moth Pupa'],tug:'Medium',hookset:'Powerful'}},
  {id:4014,name:'Moraby Flounder',spots:[4],tracker:{},method:{path:['Pill Bug'],tug:'Light',hookset:'Precision'}},
  {id:4015,name:'Sea Cucumber',spots:[4,5],tracker:{},method:{path:['Pill Bug'],tug:'Light',hookset:'Precision'}},
  {id:4016,name:'Coral Butterfly',spots:[5],tracker:{weatherSet:[9]},method:{path:['Spoon Worm'],tug:'Light',hookset:'Precision',weatherSet:['Thunder']}},   // 這張圖永遠不會出現天氣 9 → 找不到未來窗口
  {id:4017,name:'Ogre Barracuda',spots:[5],big:true,tracker:{},method:{path:['Spoon Worm','Sea Cucumber'],tug:'Heavy',hookset:'Powerful'}},
  {id:4018,name:'Galadion Goby',spots:[8],tracker:{},method:{path:['Krill'],tug:'Light',hookset:'Precision'}},   // 只在出海垂釣出現
  {id:4019,name:'Costa Shark',spots:[9],tracker:{},method:{path:['Spoon Worm'],tug:'Heavy',hookset:'Powerful',snagging:true,folklore:true}},
  {id:4020,name:'Mystery Minnow',spots:[1]},                                                                   // 釣法與窗口資料都沒收錄
  {id:4021,name:'Hidden Eel',spots:[3],inLog:false,tracker:{},method:{path:['Lugworm'],tug:'Light',hookset:'Precision'}}   // 不在圖鑑 → 不應出現
];
const SPEAR_NOTEBOOK={
  20:{name:'Costa del Sol Shallows',territory:137,x:22.5,y:30.1,fish:[{row:501,id:4101,name:'Rhotano Lobster'},{row:502,id:4102,name:'Sea Pickle'}]},
  21:{name:'Moraby Bay Depths',territory:135,x:25.2,y:33.7,fish:[{row:503,id:4103,name:'Bianaq Bream'},{row:502,id:4102,name:'Sea Pickle'}]}
};
const BAIT={Lugworm:2585,'Moth Pupa':2586,'Pill Bug':2587,'Spoon Worm':2596,Krill:2607};
const WEATHER={1:'Clear Skies',2:'Fair Skies',3:'Clouds',4:'Fog',7:'Rain',9:'Thunder'};
const WEATHER_RATES={134:[[3,20],[1,50],[2,70],[1,100]],135:[[1,40],[2,80],[4,100]],137:[[2,50],[7,100]],148:[[4,30],[1,100]]};

const TC_ITEM={4001:'羅敏薩鯷魚',4002:'梅爾托爾蝦虎',4003:'海港鯡',4004:'海雲水母',4005:'虎紋鱈',4006:'滿月沙丁魚',4007:'舞動的精靈',4008:'公主鱒',4009:'暮色蝦虎',4010:'藍鈴鮭',4011:'條紋蝦虎',4012:'緋紅鱒',4013:'暗影鯰',4014:'莫拉比比目魚',4015:'海參',4016:'珊瑚蝶魚',4017:'食人魔梭魚',4018:'加拉迪翁蝦虎',/* 4019、4020 故意缺：台服還沒有的魚 */4101:'羅塔諾龍蝦',4102:'海醃菜',4103:'比亞納克鯛',2585:'沙蠶',2586:'蛾蛹',2587:'潮蟲',2596:'匙蟲',2607:'磷蝦'};
const PLACE={1:['La Noscea','拉諾西亞'],2:['The Black Shroud','黑衣森林'],3:['Middle La Noscea','中拉諾西亞'],4:['Lower La Noscea','拉諾西亞低地'],5:['Eastern La Noscea','東拉諾西亞'],6:['Central Shroud','黑衣森林中央林區'],7:['Zephyr Drift','微風漂流地'],8:['Summerford','盛夏灘'],9:['Rogue River','盜賊河'],10:['Moraby Bay','莫拉比灣'],11:['North Moraby Bay','莫拉比灣北岸'],12:['The Vein','翠脈'],13:['The Mirror','明鏡湖'],14:['Galadion Bay','加拉迪翁灣'],15:['Costa del Sol','太陽海岸'],16:['Costa del Sol Shallows','太陽海岸淺灘'],17:['Moraby Bay Depths','莫拉比灣深處'],18:['The High Seas','遠洋'],19:['Summerford Farms','盛夏農莊']};
const TC_WEATHER={1:'碧空',2:'晴朗',3:'陰雲',4:'薄霧',7:'小雨',9:'打雷'};
const NPC_TC={1001:['雜貨商人','雜貨店'],1002:['獨立釣具商','']};

const itemRel=(id,n)=>({row_id:id,fields:{Name:n}});
function sheet(which){
  if(which==='FishParameter')return FISH.map((f,i)=>({row_id:100+i,fields:{IsInLog:f.inLog!==false,IsHidden:false,AchievementCredit:f.big?1:0,Item:itemRel(f.id,f.name),FishingSpot:spotRel(f.spots[0])}}));
  if(which==='FishingSpot')return Object.keys(SPOTS).map(Number).map(id=>({...spotRel(id),fields:{...spotRel(id).fields,Item:FISH.filter(f=>f.spots.includes(id)).map(f=>itemRel(f.id,f.name))}}));
  // 真實的 SpearfishingItem 沒有可用的釣點關聯，圖鑑裡的刺魚靠 SpearfishingNotebook 補。這裡給一筆沒有位置的，確認會被取代。
  if(which==='SpearfishingItem')return[{row_id:501,fields:{IsInLog:true,IsHidden:false,Item:itemRel(4101,'Rhotano Lobster'),SpearfishingNotebook:{row_id:0,fields:{}}}}];
  if(which==='SpearfishingNotebook')return Object.entries(SPEAR_NOTEBOOK).map(([id,n])=>({row_id:Number(id),fields:{PlaceName:name(n.name),TerritoryType:territoryRel(n.territory),X:n.x,Y:n.y,GatheringPointBase:{row_id:Number(id),fields:{Item:n.fish.map(x=>({row_id:x.row,fields:{Item:itemRel(x.id,x.name)}}))}}}}));
  if(which==='Map')return Object.entries(TERRITORY).filter(([,t])=>t.map).map(([id,t])=>({row_id:Number(id),fields:{Id:t.map,SizeFactor:t.size,PlaceName:name(t.zone),PlaceNameRegion:name(t.region),PlaceNameSub:name('')}}));
  return[];
}

function trackerData(){
  const fish={},spots={},rates={},types={};
  for(const f of FISH){if(!f.tracker)continue;const t=f.tracker;fish[f.id]={_id:f.id,previousWeatherSet:t.previousWeatherSet||[],weatherSet:t.weatherSet||[],startHour:t.startHour??0,endHour:t.endHour??24,location:f.spots[0],bestCatchPath:[],predators:t.predators||[],bigFish:!!f.big}}
  for(const[id,s]of Object.entries(SPOTS))spots[id]={_id:Number(id),name_en:s.name,territory_id:s.territory};
  for(const[id,r]of Object.entries(WEATHER_RATES))rates[id]={map_id:Number(id),weather_rates:r};
  for(const[id,n]of Object.entries(WEATHER))types[id]={name_en:n};
  const body=`const DATA = {\n  FISH: ${JSON.stringify(fish)},\n  FISHING_SPOTS: ${JSON.stringify(spots)},\n  WEATHER_RATES: ${JSON.stringify(rates)},\n  WEATHER_TYPES: ${JSON.stringify(types)}\n}`;
  // 頁面會拒絕太短的檔案（真實檔案約 890KB），補空白到門檻以上。
  return body+'\n'+' '.repeat(Math.max(0,100200-body.length))+'\n';
}
function methodYaml(){
  const rows=[];
  const list=v=>v&&v.length?'\n'+v.map(x=>`  - ${x}`).join('\n'):' []';
  for(const f of FISH){if(!f.method)continue;const m=f.method,t=f.tracker||{};
    rows.push(`- name: ${f.name}\n  location: ${SPOTS[f.spots[0]].name}\n  startHour: ${t.startHour??0}\n  endHour: ${t.endHour??24}\n  previousWeatherSet:${list(m.previousWeatherSet)}\n  weatherSet:${list(m.weatherSet)}\n  predators: {}\n  bestCatchPath:${list(m.path)}\n  tug: ${m.tug}\n  hookset: ${m.hookset}\n  snagging: ${m.snagging?'true':''}\n  gig:\n  folklore: ${m.folklore?'true':'false'}\n  fishEyes: false\n  patch: 2`)}
  // 頁面要求至少 100 筆才視為有效資料。
  for(let i=0;i<110;i++)rows.push(`- name: Filler Fish ${i}\n  location: Nowhere\n  startHour: 0\n  endHour: 24\n  previousWeatherSet: []\n  weatherSet: []\n  predators: {}\n  bestCatchPath:\n  - Lugworm\n  tug: Light\n  hookset: Precision\n  snagging:\n  gig:\n  folklore: false\n  fishEyes: false\n  patch: 2`);
  return '# test fixture\n'+rows.join('\n')+'\n';
}
const q=s=>`"${String(s).replace(/"/g,'""')}"`;
// 台服 CSV：BOM + 三行表頭（key / 欄名 / 型別），資料從第 4 行開始。
function tcCsv(heads,rows){return '﻿'+['key,'+heads.map((_,i)=>i).join(','),'#,'+heads.join(','),'int32,'+heads.map(()=>'str').join(','),...rows.map(r=>r.map((v,i)=>i?q(v):v).join(','))].join('\r\n')+'\r\n'}
// 英文 CSV（xivapi/ffxiv-datamining）：只有一行表頭，資料從第 2 行開始。
function enCsv(heads,rows){return ['#,'+heads.join(','),...rows.map(r=>r.map((v,i)=>i&&/[",]/.test(String(v))?q(v):v).join(','))].join('\n')+'\n'}
const allItems=()=>[...FISH.map(f=>[f.id,f.name]),...Object.values(SPEAR_NOTEBOOK).flatMap(n=>n.fish.map(x=>[x.id,x.name])),...Object.entries(BAIT).map(([n,id])=>[id,n])].sort((a,b)=>a[0]-b[0]).filter((x,i,a)=>!i||a[i-1][0]!==x[0]);

function csv(repo,file){
  const tc=repo==='tc';
  if(file==='Item.csv')return tc
    ?tcCsv(['Singular','Adjective','Plural','Description','Name'],[[0,'','0','','',''],...allItems().filter(([id])=>TC_ITEM[id]).map(([id])=>[id,TC_ITEM[id],'0','','',TC_ITEM[id]])])
    :enCsv(['Singular','Plural','Description','Name'],[[0,'','','',''],...allItems().map(([id,n])=>[id,n.toLowerCase(),'','',n])]);
  if(file==='PlaceName.csv'){// 真實檔案最前面幾列（0、1、2…）是空名稱；地名從 20 號開始編。
    const rows=Object.entries(PLACE).map(([id,p])=>[Number(id)+19,p[tc?1:0]]);return tc?tcCsv(['Name','','Name{NoArticle}'],[[0,'','0',''],[1,'','0',''],...rows.map(r=>[...r,'0',''])]):enCsv(['Name','NameNoArticle'],[[0,'',''],[1,'',''],...rows.map(r=>[...r,''])])}
  if(file==='Weather.csv'){const ids=Object.keys(WEATHER).map(Number);return tc?tcCsv(['Icon','Name','Description'],[[0,'0','',''],...ids.map(id=>[id,String(60200+id),TC_WEATHER[id],''])]):enCsv(['Name','Description','Icon'],[[0,'','',0],...ids.map(id=>[id,WEATHER[id],'',60200+id])])}
  if(file==='ENpcResident.csv'&&tc)return tcCsv(['Singular','Adjective','Plural','Title'],[[1000000,'','0','',''],...Object.entries(NPC_TC).map(([id,n])=>[Number(id),n[0],'0','',n[1]])]);
  return null;
}

const LODINN={
  1:{bait:{2585:{name:'Lugworm'}},rates:{'7.0':{2585:{4001:{catches:120,bayesian_misses:4,bitetime_low:4.2,bitetime_high:9.8},4002:{catches:60,bayesian_misses:2,bitetime_low:11.1,bitetime_high:16.4}}},'7.1':{2585:{4001:{catches:80,bayesian_misses:1,bitetime_low:4.6,bitetime_high:10.2}}}}},
  2:{bait:{2585:{name:'Lugworm'},2587:{name:'Pill Bug'}},rates:{'7.0':{2587:{4003:{catches:40,bayesian_misses:3,bitetime_low:7,bitetime_high:13}},2585:{4001:{catches:30,bayesian_misses:0,bitetime_low:5,bitetime_high:9},4003:{catches:90,bayesian_misses:5,bitetime_low:8,bitetime_high:14}}}}},
  6:{bait:{2586:{name:'Moth Pupa'}},rates:{'7.0':{2586:{4008:{catches:25,bayesian_misses:1,bitetime_low:3,bitetime_high:6}}}}}
  // 其他釣點：404
};
const GARLAND_CORE={locationIndex:{52:{id:52,name:'Middle La Noscea'},53:{id:53,name:'Lower La Noscea'},300:{id:300,name:'Summerford Farms'}}};
const GARLAND_ITEM={
  2585:{item:{id:2585,name:'Lugworm',price:3,vendors:[1001,1002]},partials:[{type:'npc',id:'1001',obj:{i:1001,n:'Merchant & Mender',t:'General Goods',l:52,a:300,c:[25.6,17.2]}},{type:'npc',id:'1002',obj:{i:1002,n:'Independent Fishmonger',l:53,c:[24.1,35.9]}}]},
  2587:{item:{id:2587,name:'Pill Bug',price:5,vendors:[1001],tradeShops:[{shop:'Scrip Exchange',npcs:[1002],listings:[{}]}],craft:[{}],nodes:[{},{}]},partials:[{type:'npc',id:'1001',obj:{i:1001,n:'Merchant & Mender',t:'General Goods',l:52,a:300,c:[25.6,17.2]}},{type:'npc',id:'1002',obj:{i:1002,n:'Independent Fishmonger',l:53,c:[24.1,35.9]}}]},
  2596:{item:{id:2596,name:'Spoon Worm',price:0},partials:[]}
  // 2586 Moth Pupa：404
};
// 1x1 PNG，當作地圖底圖。
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');

const json=(body,status=200)=>({status,contentType:'application/json',body:JSON.stringify(body)});
const text=body=>({status:200,contentType:'text/plain; charset=utf-8',body});
const NOT_FOUND={status:404,contentType:'text/plain',body:'not found'};

// 回傳 {status,contentType,body}；null 代表「這份資料連不上」（測試會中斷這個請求）。
function respond(rawUrl){
  const u=new URL(rawUrl),p=u.pathname;
  if(u.host==='v2.xivapi.com'){
    let m=p.match(/^\/api\/sheet\/(\w+)$/);
    if(m)return json({rows:u.searchParams.get('after')?[]:sheet(m[1])});
    if(p==='/api/search'){
      const query=u.searchParams.get('query')||'',exact=query.match(/^Name="(.*)"$/),fuzzy=query.match(/^Name~"(.*)"$/),want=(exact||fuzzy)?.[1]?.replace(/\\"/g,'"').replace(/\\\\/g,'\\')||'';
      // 真實的 Item 表什麼物品都查得到（以小釣大的中繼魚也是物品），所以魚和餌都要能查。
      const hits=allItems().filter(([,n])=>exact?n===want:n.toLowerCase().includes(want.toLowerCase())).map(([id,n])=>itemRel(id,n));
      return json({results:hits});
    }
    if(/^\/api\/asset\/map\//.test(p))return{status:200,contentType:'image/png',body:PNG};
    return NOT_FOUND;
  }
  if(u.host==='raw.githubusercontent.com'){
    if(p.endsWith('/private/fishData.yaml'))return text(methodYaml());
    if(p.endsWith('/js/app/data.js'))return text(trackerData());
    const m=p.match(/^\/(thewakingsands\/ffxiv-datamining-tc\/main|xivapi\/ffxiv-datamining\/master\/csv\/en)\/([\w.]+)$/);
    if(m){
      if(m[2]==='ContentFinderCondition.csv')return null;   // 練等分頁的副本資料，不在釣魚測試範圍
      const body=csv(m[1].startsWith('thewakingsands')?'tc':'en',m[2]);return body==null?NOT_FOUND:text(body);
    }
    return NOT_FOUND;
  }
  if(u.host==='lodinn.github.io'){const m=p.match(/^\/assets\/spot_data\/(\d+)\.json$/);return m&&LODINN[m[1]]?json(LODINN[m[1]]):NOT_FOUND}
  if(u.host==='www.garlandtools.org'){
    if(p.endsWith('/core/en/3/data.json'))return json(GARLAND_CORE);
    const m=p.match(/\/item\/en\/3\/(\d+)\.json$/);return m&&GARLAND_ITEM[m[1]]?json(GARLAND_ITEM[m[1]]):NOT_FOUND;
  }
  return null;
}

module.exports={T0,H0,FISH,SPOTS,TERRITORY,SPEAR_NOTEBOOK,BAIT,respond};
