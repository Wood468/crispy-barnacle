import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRaidCoverage } from '../scripts/audit-raid-coverage.mjs';
const audit=(data,details={events:{}})=>auditRaidCoverage(data,details);
const types=issues=>issues.map(i=>i.type);

test('rejects impossible rotation calendar dates and inverted windows',()=>{
 const r=audit({rotation:[{s:'2026-02-30',e:'2026-03-01',five:'Boss'},{s:'2026-04-01',e:'2026-03-31',five:'Boss'}]});
 assert.equal(types(r).filter(t=>t==='invalid-window').length,2);
});
test('valid leap day and adjacent rotation windows are accepted',()=>{
 assert.deepEqual(audit({rotation:[{s:'2028-02-28',e:'2028-02-29',five:'A'},{s:'2028-02-29',e:'2028-03-01',five:'B'}]}),[]);
});
test('invalid boundaries cannot produce misleading rotation gaps or overlaps',()=>{
 const r=audit({rotation:[{s:'2026-00-01',e:'2026-02-30',five:'A'},{s:'2026-03-01',e:'2026-03-08',five:'B'}]});
 assert.ok(types(r).includes('invalid-window'));
 assert.ok(!types(r).includes('rotation-gap'));
 assert.ok(!types(r).includes('rotation-overlap'));
});
test('raid hour validates Gregorian dates, not only YYYY-MM-DD shape',()=>{
 const r=audit({raidHour:[{d:'2026-02-29',n:'Boss'},{d:'2028-02-29',n:'Boss'},{d:'2026-00-01',n:'Boss'}]});
 assert.deepEqual(r.filter(i=>i.type==='invalid-raid-hour').map(i=>i.date),['2026-02-29','2026-00-01']);
});
test('invalid source-derived raid-hour date cannot become a missing curated date',()=>{
 const details={events:{x:{name:'Raid Hour',sources:[{url:'https://leekduck.com/events/raidhour20260230/'}]}}};
 assert.ok(!types(audit({raidHour:[]},details)).includes('source-raid-hour-not-curated'));
});
test('valid source-derived raid-hour date still raises missing-curation issue',()=>{
 const details={events:{x:{name:'Raid Hour',sources:[{url:'https://leekduck.com/events/raidhour20280229/'}]}}};
 assert.deepEqual(types(audit({raidHour:[]},details)),['source-raid-hour-not-curated']);
});
