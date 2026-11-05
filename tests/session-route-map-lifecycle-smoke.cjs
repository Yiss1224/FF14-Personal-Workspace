const fs=require('fs');
const map=fs.readFileSync('fishing-map.js','utf8');
const overlay=fs.readFileSync('fishing-session-route-map.js','utf8');
if(map.includes('observe(target,{childList:true,subtree:true})'))throw new Error('map still observes full catalog subtree');
if(!map.includes('refreshFishingSessionRouteMap'))throw new Error('map render hook missing');
if(!overlay.includes("document.createElementNS(ns,'path')"))throw new Error('route path missing');
if(!overlay.includes("marker-mid','url(#ff14-route-arrow)'"))throw new Error('midpoint arrow missing');
{const w=Number((overlay.match(/\.ff14-route-line\{[^}]*stroke-width:([\d.]+)/)||[])[1]);if(!(w>=2.4))throw new Error('route line is not thick enough');}
if(!overlay.includes('window.__fishingSessionRouteModel'))throw new Error('overlay does not use persistent route model');
if(!overlay.includes('setInterval(()=>{if(overlayMissing())applyOverlay()},1000)'))throw new Error('overlay watchdog missing');
console.log('route map lifecycle guards ok');
