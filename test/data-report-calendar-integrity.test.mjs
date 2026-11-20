import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRaidUpcoming } from '../scripts/data-report.mjs';

const data=(note,rotation=[{s:'2026-04-30T10:00',e:'2026-05-02T10:00',mega:'Mega Gengar'}])=>({
 asOf:'2026-04-29',raidNow:{'Mega Gengar':note},rotation
});
test('valid same-month raid summary reconciles with published rotation',()=>{
 const r=auditRaidUpcoming(data('Apr 30 to May 1'));
 assert.deepEqual(r,{checked:1,issues:[]});
});
test('impossible April 31 cannot silently normalize to May 1',()=>{
 const r=auditRaidUpcoming(data('Apr 31 to May 1'));
 assert.equal(r.checked,1);
 assert.match(r.issues.join(' '),/dates do not match/);
});
test('February 29 is invalid in non-leap year',()=>{
 const r=auditRaidUpcoming(data('Feb 29 to Mar 1',[{s:'2026-02-28T10:00',e:'2026-03-02T10:00',mega:'Mega Gengar'}]));
 assert.match(r.issues.join(' '),/dates do not match/);
});
test('February 29 remains valid in leap year',()=>{
 const r=auditRaidUpcoming({asOf:'2028-02-28',raidNow:{'Mega Gengar':'Feb 29 to Mar 1'},rotation:[{s:'2028-02-29T10:00',e:'2028-03-02T10:00',mega:'Mega Gengar'}]});
 assert.deepEqual(r.issues,[]);
});
test('reverse same-month date range cannot reconcile',()=>{
 const r=auditRaidUpcoming(data('Apr 30 to Apr 1',[{s:'2026-04-30T10:00',e:'2026-05-02T10:00',mega:'Mega Gengar'}]));
 assert.match(r.issues.join(' '),/dates do not match/);
});
