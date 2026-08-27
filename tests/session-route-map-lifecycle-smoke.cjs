const fs=require('fs');
const map=fs.readFileSync('fishing-map.js','utf8');
const overlay=fs.readFileSync('fishing-session-route-map.js','utf8');
if(map.includes('observe(target,{childList:true,subtree:true})'))throw new Error('map still observes full catalog subtree');
if(!map.includes('refreshFishingSessionRouteMap'))throw new Error('map render hook missing');
if(overlay.includes('setTimeout(applyOverlay,220)')||overlay.includes('setTimeout(applyOverlay,700)'))throw new Error('overlay still uses timing retries');
console.log('route map lifecycle guards ok');
