import test from 'node:test';
import assert from 'node:assert/strict';
import {auditEvents} from '../scripts/event-coverage-audit.mjs';
import {spawnSync} from 'node:child_process';

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
 assert.equal(report.counts.structuredResearch.present,0);
 assert.equal(report.counts.sourceResearch.present,1);
 assert.deepEqual(report.events[0].missing,['structuredResearch']);
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

test('structured research is counted independently from source prose',()=>{
 const report=auditEvents({events:[{id:'research',t:'Research'}]},{events:{
  research:{researchTasks:[{task:'Catch 5 Pokémon',rewards:['Stardust']}],fields:{research:[]}}
 }});
 assert.equal(report.counts.structuredResearch.present,1);
 assert.equal(report.counts.sourceResearch.present,1);
});

test('research review queue contains only source-backed research without structured tasks',()=>{
 const report=auditEvents({events:[
  {id:'prose',t:'Prose'}, {id:'structured',t:'Structured'}, {id:'none',t:'None'}
 ]},{events:{
  prose:{sources:[{url:'https://example.org/prose'}],fields:{research:[{text:'Catch Pokémon',status:'official'}]}},
  structured:{researchTasks:[{task:'Catch 5 Pokémon',rewards:[{name:'Stardust'}]}]},
  none:{fields:{research:[{text:'Rejected text',status:'rejected'}]}}
 }});
 assert.equal(report.researchReviewCount,1);
 assert.deepEqual(report.researchReview,[{id:'prose',name:'Prose',origin:'curated',sources:['https://example.org/prose']}]);
});

test('review queue also includes source-only announcements with research prose',()=>{
 const report=auditEvents({events:[]},{events:{
  'future:event':{name:'Future Event',sources:[{url:'https://example.org/future'}],
   fields:{research:[{text:'Win raids for a reward',status:'single'}]}}
 }});
 assert.equal(report.researchReviewCount,1);
 assert.deepEqual(report.researchReview[0],{
  id:'future:event',name:'Future Event',origin:'source-only',sources:['https://example.org/future']
 });
});

test('research review CLI prints parseable focused report',()=>{
 const run=spawnSync(process.execPath,['scripts/event-coverage-audit.mjs','--research-review'],{encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
 const report=JSON.parse(run.stdout);
 assert.equal(typeof report.researchReviewCount,'number');
 assert.ok(Array.isArray(report.researchReview));
 assert.equal(report.researchReview.length,report.researchReviewCount);
 assert.equal(typeof report.structuredResearch,'number');
 assert.equal(typeof report.sourceResearch,'number');
 assert.ok(!Object.hasOwn(report,'events'),'compact output should omit full event inventory');
});
