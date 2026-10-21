/* Eorzea time and housing-district weather for the harbor scene (display only).
   Eorzea time runs 3600/175 times faster than real time (one Eorzean hour = 175 s).
   Weather uses the community-documented forecast formula and each district's chance table,
   so the harbor shows the same weather as the game for the chosen housing district. */
(function(root){
  'use strict';
  const ET_RATIO=3600/175;
  const WINDOW_MS=8*175*1000; // weather changes every 8 Eorzean hours (23 min 20 s)

  function eorzeaTime(ms){
    const et=ms*ET_RATIO,totalMinutes=Math.floor(et/60000);
    return {hour:Math.floor(totalMinutes/60)%24,minute:totalMinutes%60,hours:(et/3600000)%24};
  }
  // Forecast value 0-99 for the weather window containing `ms`.
  function forecastTarget(ms){
    const unix=Math.floor(ms/1000),bell=unix/175;
    let days=unix/4200;days=days<<32>>>0;
    const base=100*days+(bell+8-bell%8)%24;
    const step1=(base<<11^base)>>>0;
    return ((step1>>>8^step1)>>>0)%100;
  }
  // Chance tables [upper bound, weather] for the housing districts with a free company workshop.
  const ZONES={
    mist:{name:'海霧村',table:[[20,'clouds'],[50,'clearSkies'],[80,'fairSkies'],[90,'fog'],[100,'rain']]},
    lavenderBeds:{name:'薰衣草苗圃',table:[[5,'clouds'],[20,'rain'],[30,'fog'],[40,'clouds'],[55,'fairSkies'],[85,'clearSkies'],[100,'fairSkies']]},
    goblet:{name:'高腳孤丘',table:[[40,'clearSkies'],[60,'fairSkies'],[85,'clouds'],[95,'fog'],[100,'rain']]},
    shirogane:{name:'白銀鄉',table:[[10,'rain'],[20,'fog'],[40,'clouds'],[80,'fairSkies'],[100,'clearSkies']]}
  };
  const WEATHER_NAMES={clearSkies:'碧空',fairSkies:'晴朗',clouds:'陰雲',fog:'薄霧',rain:'小雨'};
  function weather(ms,zone){
    const z=ZONES[zone]||ZONES.mist,v=forecastTarget(ms);
    for(const [limit,id] of z.table)if(v<limit)return id;
    return z.table[z.table.length-1][1];
  }
  function nextWeatherChange(ms){return (Math.floor(ms/WINDOW_MS)+1)*WINDOW_MS}

  const api={eorzeaTime,forecastTarget,weather,nextWeatherChange,ZONES,WEATHER_NAMES,ET_RATIO};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.HarborEorzea=api;
})(typeof window!=='undefined'?window:this);
