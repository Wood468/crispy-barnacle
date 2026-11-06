const test=require('node:test');
const assert=require('node:assert/strict');
const {normalize,identity}=require('./contract-v1.js');
const {project,families}=require('./view-v1.js');
const key=identity({speciesId:'25'});
function event(family,extra={}) {return normalize({schemaVersion:1,eventId:'synthetic-future-'+family,family,title:'Synthetic fixture',pokemon:[{speciesId:'25'}],encounters:[{identityKey:key,method:'wild'}],...extra});}
test('all known families project without event-specific rendering logic',()=>{
 for(const family of families){
  const view=project(event(family));
  assert.equal(view.eventId,'synthetic-future-'+family);
  assert.ok(view.sections.some(s=>s.key==='encounters'),family);
 }
});
test('unknown future family renders via generic template',()=>{
 const view=project(event('future-new-family',{research:[{id:'r'}]}));
 assert.equal(view.family,'other');
 assert.ok(view.sections.some(s=>s.key==='research'));
});
test('optional sections are absent when no data exists',()=>{
 const view=project(event('go-fest'));
 assert.deepEqual(view.sections.map(s=>s.key),['overview','encounters']);
});
test('family template never hides unexpected but valid event sections',()=>{
 const view=project(event('raid-hour',{tickets:[{id:'t'}],passes:[{id:'p'}],bonuses:[{id:'b'}]}));
 assert.ok(view.sections.some(s=>s.key==='tickets'));
 assert.ok(view.sections.some(s=>s.key==='passes'));
 assert.ok(view.sections.some(s=>s.key==='bonuses'));
});
test('internal source evidence does not leak into visible section list',()=>{
 const view=project(event('other',{sources:[{url:'https://example.org',confidence:0.2,checkedAt:'2027-01-01'}]}));
 assert.ok(!JSON.stringify(view).includes('confidence'));
 assert.ok(!JSON.stringify(view).includes('checkedAt'));
});
test('nested scheduled activity becomes a rotation section',()=>{
 const view=project(event('go-fest',{activities:[{id:'hour-1',parentId:'main',schedule:{start:'2027-01-01T10:00:00'}}]}));
 assert.ok(view.sections.some(s=>s.key==='rotations'));
});
