import test from 'node:test';
import assert from 'node:assert/strict';
import { auditEvents } from '../scripts/event-coverage-audit.mjs';

test('declared exact source IDs supply source-backed coverage without a canonical detail record', () => {
  const report=auditEvents({events:[{id:'event',t:'Event',detailIds:[' source:one ','source:two']}]},{events:{
    'source:one':{sources:[{url:'https://example.org/one'}],fields:{research:[{text:'Catch five',status:'official'}],featured:[{text:'Pikachu',status:'official'}]}},
    'source:two':{image:'https://example.org/image.png',imageProvenance:{sourceUrl:'https://example.org/two'},researchTasks:[{task:'Catch five'}],fields:{dates:[{text:'Nov 20',status:'official'}]}}
  }});
  const e=report.events.find(e=>e.id==='event');
  assert.equal(e.checks.sourceMatched,true);
  assert.equal(e.checks.sourceLinked,true);
  assert.equal(e.checks.verifiedArtwork,true);
  assert.equal(e.checks.sourceResearch,true);
  assert.equal(e.checks.structuredResearch,true);
  assert.equal(e.checks.sourceEncounters,true);
  assert.equal(e.checks.sourceTimeDetails,true);
  assert.deepEqual(e.sources,['https://example.org/one']);
  assert.equal(report.researchReviewCount,1);
  assert.equal(report.researchReview[0].id,'source:one');
  assert.ok(!report.researchReview.some(item=>item.id==='event'), 'joined structured tasks must satisfy the canonical event');
  assert.equal(report.sourceJoinReviewCount,0);
});
test('missing aliases are review-only and cannot invent source coverage',()=>{
  const report=auditEvents({events:[{id:'event',t:'Event',detailIds:['missing','missing','  ']}]},{events:{}});
  const e=report.events[0];
  assert.equal(e.checks.sourceMatched,false);
  assert.equal(e.checks.sourceResearch,false);
  assert.deepEqual(report.sourceJoinReview[0].missingDetailIds,['missing','  '].filter(x=>x.trim()));
});
test('rejected source claims do not become verified research or encounters',()=>{
  const report=auditEvents({events:[{id:'event',t:'Event',detailIds:['alias']}]},{events:{
    alias:{fields:{research:[{text:'Unverified task',status:'rejected'}],featured:[{text:'Unverified encounter',status:'conflict'}]}}
  }});
  const e=report.events[0];
  assert.equal(e.checks.sourceMatched,true);
  assert.equal(e.checks.sourceResearch,false);
  assert.equal(e.checks.sourceEncounters,false);
});
test('unrelated source records never leak into explicitly joined event coverage',()=>{
  const report=auditEvents({events:[{id:'event',t:'Event',detailIds:['source:one']}]},{events:{
    'source:one':{fields:{}},'source:other':{researchTasks:[{task:'Win a raid'}]}
  }});
  assert.equal(report.events.find(e=>e.id==='event').checks.structuredResearch,false);
  assert.equal(report.events.find(e=>e.id==='source:other').origin,'source-only');
});
