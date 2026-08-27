const fs=require('fs');
const src=fs.readFileSync('fishing-session-route.js','utf8');
if(!src.includes('function mergeStop(route,stop)'))throw new Error('mergeStop missing');
if(src.includes('last.kind===stop.kind'))throw new Error('same-spot merge still depends on task kind');
if(!src.includes('nextTask&&currentSpot&&nextTask.spot.key===currentSpot'))throw new Error('same-spot upcoming-window preference missing');
console.log('session route merge guards ok');
