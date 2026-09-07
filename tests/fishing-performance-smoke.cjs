const fs=require('fs');

const src=fs.readFileSync('fishing-performance-fix.js','utf8');

if(!src.includes('if(scopeSyncTimer!==null)clearTimeout(scopeSyncTimer)')){
  throw new Error('scope updates are not debounced');
}
if(!src.includes('scheduleScopeSync(80)')){
  throw new Error('search input does not use the debounce window');
}
if(!src.includes("if(typeof cancelIdleCallback==='function')cancelIdleCallback(catalogRenderTask)")){
  throw new Error('stale idle catalog renders are not cancelled');
}
if(!src.includes('catalogRenderTask=requestIdleCallback(run,{timeout:120})')){
  throw new Error('idle catalog render handle is not tracked');
}
if(!src.includes('cancelCatalogRender();\n    if(mounted)')){
  throw new Error('unmount does not cancel pending catalog work');
}

console.log('fishing catalog scheduling guards ok');
