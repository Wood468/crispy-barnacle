import test from 'node:test';
import assert from 'node:assert/strict';
import {auditRaidCoverage} from '../scripts/audit-raid-coverage.mjs';

test('detects rotation gaps and overlapping windows without inventing bosses',()=>{
 const rows=[{s:'2026-11-09T10:00',e:'2026-11-13T20:00',five:'Zacian'},{s:'2026-11-16T06:00',e:'2026-11-24T22:00',five:'Cresselia'},{s:'2026-11-24T20:00',e:'2026-12-01T22:00',five:'Deoxys'}];
 const issues=auditRaidCoverage({rotation:rows}, {events:{}});
 assert.deepEqual(issues.filter(x=>x.type==='rotation-gap'),[{type:'rotation-gap',from:'2026-11-13T20:00',to:'2026-11-16T06:00'}]);
 assert.equal(issues.filter(x=>x.type==='rotation-overlap').length,1);
});
test('finds source-backed Raid Hours missing from curated schedule',()=>{
 const details={events:{one:{name:'Cresselia Raid Hour',sources:[{url:'https://leekduck.com/events/raidhour20261118/'}]}}};
 const issues=auditRaidCoverage({rotation:[],raidHour:[]},details);
 assert.deepEqual(issues,[{type:'source-raid-hour-not-curated',name:'Cresselia Raid Hour',date:'2026-11-18'}]);
 assert.deepEqual(auditRaidCoverage({rotation:[],raidHour:[{d:'2026-11-18',n:'Cresselia'}]},details),[]);
});
