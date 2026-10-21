// Eorzea time and housing-district weather: checked against values produced by the
// community package eorzea-weather@3.2.0 (fixtures below), no network or package needed.
// Run: node tests/submarine-eorzea-weather.cjs
'use strict';
const assert=require('assert');
const E=require('../submarine-harbor-eorzea.js');
// [unix ms, mist, lavenderBeds, goblet, shirogane]
const FIXTURES=[[1777011476144,"clearSkies","fairSkies","fairSkies","fairSkies"],[1754914849969,"clouds","clouds","clearSkies","rain"],[1775581598199,"clearSkies","fairSkies","fairSkies","fairSkies"],[1798501811517,"rain","fairSkies","rain","clearSkies"],[1778544594415,"clouds","rain","clearSkies","fog"],[1778144836541,"fog","fairSkies","fog","clearSkies"],[1746582009576,"clearSkies","clouds","clearSkies","clouds"],[1791393028484,"fairSkies","clearSkies","clouds","fairSkies"],[1780298775693,"clouds","rain","clearSkies","fog"],[1787883859540,"clearSkies","fog","clearSkies","clouds"],[1782326256681,"fairSkies","clearSkies","clouds","fairSkies"],[1756991646558,"fairSkies","fairSkies","fairSkies","fairSkies"],[1785762213498,"clouds","rain","clearSkies","rain"],[1747812674054,"clearSkies","fairSkies","fairSkies","fairSkies"],[1772263259354,"fog","fairSkies","fog","clearSkies"],[1750433438493,"fog","fairSkies","fog","clearSkies"],[1748868393711,"fairSkies","clearSkies","fairSkies","fairSkies"],[1785363436824,"clearSkies","fairSkies","fairSkies","fairSkies"],[1790644638482,"clearSkies","fog","clearSkies","clouds"],[1788921577386,"fairSkies","clearSkies","clouds","fairSkies"],[1742711949151,"clearSkies","fairSkies","fairSkies","fairSkies"],[1765357879681,"clouds","clouds","clearSkies","rain"],[1781816243589,"fog","clearSkies","clouds","clearSkies"],[1758774797650,"clearSkies","fairSkies","fairSkies","fairSkies"],[1753306698209,"clouds","rain","clearSkies","fog"],[1758916210645,"fairSkies","fairSkies","fairSkies","fairSkies"],[1793635386472,"fairSkies","clearSkies","fairSkies","fairSkies"],[1790610465680,"rain","fairSkies","rain","clearSkies"],[1762133732205,"clouds","clouds","clearSkies","rain"],[1762725760022,"clearSkies","clouds","clearSkies","clouds"]];
let checked=0;
for(const [ms,...expected] of FIXTURES){
  ['mist','lavenderBeds','goblet','shirogane'].forEach((zone,i)=>{
    assert.strictEqual(E.weather(ms,zone),expected[i],zone+' @ '+new Date(ms).toISOString());checked++;
  });
}
// One Eorzean hour is 175 real seconds; one Eorzean day is 70 real minutes.
const t0=Date.UTC(2026,0,1);
assert.deepStrictEqual([E.eorzeaTime(t0).hour,E.eorzeaTime(t0).minute],[0,0]);
assert.strictEqual(E.eorzeaTime(t0+175000).hour,1);
assert.strictEqual(E.eorzeaTime(t0+4200000).hour,0);
assert.strictEqual(E.eorzeaTime(t0+175000/2).minute,30);
// Weather windows are 8 Eorzean hours (1400 s) long and aligned to the epoch.
const next=E.nextWeatherChange(t0+1);assert.strictEqual(next%1400000,0);assert.ok(next>t0);
for(const zone of Object.keys(E.ZONES))assert.ok(E.ZONES[zone].table.at(-1)[0]===100,zone+' table must end at 100');
console.log('PASS Eorzea time & weather: '+checked+' weather checks, ET and window checks');
