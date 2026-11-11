import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../public/dash.js',import.meta.url),'utf8');
const start=src.indexOf('    function raidCatchValues(cp,boss) {');
const end=src.indexOf('    function eventLink(name) {',start);
assert.ok(start>=0&&end>start,'reusable metadata extractable');
const snippet=src.slice(start,end);
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const get=stats=>vm.runInNewContext('(function(hundoPair,esc){'+snippet+' return {raidCatchValues,raidTierCorner,raidCatchChips};})',{})(()=>stats,esc);
test('source values distinguish normal and weather perfect CP',()=>{
 const r=get({n:2000,b:2500}),v=r.raidCatchValues([2188,2735],'Crowned Sword Zacian');
 assert.deepEqual({...v},{normal:2188,boosted:2735,source:'published'});
 const html=r.raidCatchChips([2188,2735],'Crowned Sword Zacian');
 assert.match(html,/100% IV.*2,188/);assert.match(html,/Weather.*2,735/);assert.match(html,/Level 20/);assert.match(html,/Level 25/);
});
test('non-event weekly raids reuse Game Master CP instead of inventing another formula',()=>{
 const r=get({n:2040,b:2550});
 assert.deepEqual({...r.raidCatchValues(undefined,'Cresselia')},{normal:2040,boosted:2550,source:'game-master'});
 assert.match(r.raidCatchChips(undefined,'Cresselia'),/2,040/);
});
test('unknown or invalid CP shows no fabricated value',()=>{
 const r=get(null);
 for(const invalid of [null,undefined,[],[1,2],[2100,2000],[2000,'2500'],{},NaN])assert.equal(r.raidCatchChips(invalid,'Unknown'),'');
 const v=get({n:1500,b:1800});
 assert.doesNotMatch(v.raidCatchChips(1600,'Known source'),/rc-weather/);
});
test('tier badge reflects source tier, not a count of nearby raids',()=>{
 const r=get(null);
 for(const tier of ['1★','3★','5★','Mega','Shadow','Shadow 1★','Primal','Elite']){
  const html=r.raidTierCorner(tier);
  assert.match(html,/rc-tier-corner/);
  assert.ok(html.includes('>'+tier+'</span>'));
  assert.match(html,/raid tier/);
  assert.match(html,/\/ico\/g\/raid.webp/);
 }
 for(const invalid of ['2 raids','100','<script>','5★ raids now',''])assert.equal(r.raidTierCorner(invalid),'');
});
