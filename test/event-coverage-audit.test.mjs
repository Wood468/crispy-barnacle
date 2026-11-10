import test from 'node:test';
import assert from 'node:assert/strict';
import {auditEvents} from '../scripts/event-coverage-audit.mjs';

const curated={asOf:'10 Nov 2026',events:[
 {id:'complete',t:'Complete',s:'2026-11-10',e:'2026-11-11',sourceUrl:'https://example.org/event'},
 {id:'partial',t:'Partial',s:'2026-11-12',e:'2026-11-13'},
 {id:'absent',t:'Absent',s:'2026-11-14',e:'2026-11-15'}
]};
const details={updated:'2026-11-10',events:{
 complete:{image:'https://example.org/banner.png',imageProvenance:{sourceUrl:'https://example.org/event'},
  sources:[{url:'https://example.org/event'}],
  fields:{bonuses:[{text:'Double Candy',status:'official'}],
   research:[{text:'Catch five',status:'official'}],
   featured:[{text:'Pikachu',status:'official'}],
   dates:[{text:'10 a.m.',status:'official'}]}},
 partial:{fields:{bonuses:[{text:'Unverified bonus',status:'rejected'}],research:[{text:' ',status:'single'}]}}
}};

test('reports source coverage without treating absent sections as confirmed omissions',()=>{
 const report=auditEvents(curated,details);
 assert.equal(report.total,3);
 assert.equal(report.counts.sourceMatched.present,2);
 assert.equal(report.counts.verifiedArtwork.present,1);
 assert.deepEqual(report.events[0].missing,[]);
 assert.ok(report.events[1].missing.includes('sourceBonuses'));
 assert.ok(report.events[1].missing.includes('sourceResearch'));
 assert.ok(report.events[2].missing.includes('sourceMatched'));
});
test('empty inputs produce stable zero-event report',()=>{
 const report=auditEvents({events:[]},{events:{}});
 assert.equal(report.total,0);
 assert.deepEqual(report.counts,{});
});

test('source-only announcements are included instead of disappearing from the audit',()=>{
 const report=auditEvents({events:[{id:'known',t:'Known'}]},{events:{
   known:{fields:{}},
   'leekduck:future-event':{name:'Future Event',fields:{research:[{text:'Catch five',status:'single'}]}}
 }});
 assert.equal(report.total,2);
 assert.equal(report.curatedCount,1);
 assert.equal(report.sourceOnlyCount,1);
 const future=report.events.find(e=>e.id==='leekduck:future-event');
 assert.equal(future.name,'Future Event');
 assert.equal(future.origin,'source-only');
 assert.equal(future.checks.sourceResearch,true);
});
