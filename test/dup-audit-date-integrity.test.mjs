import test from 'node:test';
import assert from 'node:assert/strict';
import { audit } from '../scripts/dup-audit.mjs';

const check=(world=[],curated=[],today='2026-11-17')=>audit(world,curated,null,today);
test('invalid Gregorian dates are surfaced even when filtering would discard them',()=>{
 const r=check([{id:'w1',name:'Invalid leap day',start:'2026-02-29',end:'2026-03-01'},
  {id:'w2',name:'Impossible month',start:'2026-13-01',end:'2026-13-02'},
  {id:'w3',name:'Invalid end',start:'2026-11-18',end:'2026-11-31'}]);
 assert.deepEqual(r.odd.map(x=>x.id),['w1','w2','w3']);
 assert.ok(r.odd.every(x=>x.why==='invalid calendar date'));
});
test('inverted windows and overly long events remain review-only findings',()=>{
 const r=check([{id:'back',name:'Backward',start:'2026-11-20',end:'2026-11-19'},
  {id:'long',name:'Long',start:'2026-11-20',end:'2030-11-20'}]);
 assert.deepEqual(r.odd.map(x=>x.why),['ends before it starts','runs longer than 3 years (typo year?)']);
});
test('valid leap day and normal same-day windows are not flagged',()=>{
 const r=check([{id:'leap',name:'Leap',start:'2028-02-29',end:'2028-02-29'},
  {id:'normal',name:'Normal',start:'2026-11-18',end:'2026-11-18'}]);
 assert.deepEqual(r.odd,[]);
});
test('curated invalid dates are surfaced without changing source data',()=>{
 const rows=[{id:'bad',t:'Curated invalid',s:'2026-00-00',e:'2026-11-20'},
  {id:'good',t:'Valid',s:'2026-11-18',e:'2026-11-18'}];
 const before=structuredClone(rows);const r=check([],rows);
 assert.deepEqual(r.odd.map(x=>x.id),['bad']);
 assert.deepEqual(rows,before);
});
test('malformed suffixes and invalid century leap days cannot bypass validation',()=>{
 const r=check([{id:'suffix',name:'Suffix',start:'2026-11-18junk',end:'2026-11-20'},
  {id:'century',name:'Century',start:'2100-02-29',end:'2100-03-01'}]);
 assert.deepEqual(r.odd.map(x=>x.id),['suffix','century']);
});

test('curated ISO local timestamps remain valid and preserve cross-list matching',()=>{
 const r=check([{id:'world',name:'GO Wild Area Sendai',start:'2026-11-18',end:'2026-11-19'}],
  [{id:'curated',t:'GO Wild Area Sendai',s:'2026-11-18T10:00',e:'2026-11-19T18:00'}]);
 assert.deepEqual(r.odd,[]);
});
test('invalid curated timestamp clock and suffix are reviewable',()=>{
 const r=check([], [{id:'clock',t:'Invalid hour',s:'2026-11-18T29:00',e:'2026-11-19T18:00'},
  {id:'suffix',t:'Invalid suffix',s:'2026-11-18T10:00oops',e:'2026-11-19T18:00'}]);
 assert.deepEqual(r.odd.map(x=>x.id),['clock','suffix']);
});

test('valid fractional seconds and timezone offsets do not trigger false date warnings',()=>{
 const r=check([], [{id:'fraction',t:'Fractional',s:'2026-11-18T10:00:00.123+11:00',e:'2026-11-18T12:30:15.999+11:00'},
  {id:'utc',t:'UTC',s:'2026-11-18T10:00:00Z',e:'2026-11-18T12:00:00Z'}]);
 assert.deepEqual(r.odd,[]);
});
test('invalid timezone offset and fractional suffix remain review-only findings',()=>{
 const r=check([], [{id:'offset',t:'Bad offset',s:'2026-11-18T10:00+25:00',e:'2026-11-18T12:00Z'},
  {id:'fraction',t:'Bad fractional',s:'2026-11-18T10:00:00.1234Z',e:'2026-11-18T12:00Z'}]);
 assert.deepEqual(r.odd.map(x=>x.id),['offset','fraction']);
});

test('same-day inverted curated clock windows are flagged without penalizing valid windows',()=>{
 const r=check([], [{id:'reverse',t:'Reverse',s:'2026-11-18T18:00',e:'2026-11-18T10:00'},
  {id:'forward',t:'Forward',s:'2026-11-18T10:00',e:'2026-11-18T18:00'}]);
 assert.deepEqual(r.odd.map(x=>x.id),['reverse']);
 assert.equal(r.odd[0].why,'ends before it starts');
});
