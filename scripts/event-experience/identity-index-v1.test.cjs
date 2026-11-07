const test=require('node:test');
const assert=require('node:assert/strict');
const {reconcile}=require('./identity-index-v1.cjs');
test('legacy and source aliases resolve to one stable canonical event',()=>{
 const e={eventId:'wag',aliases:['leekduck:go-wild-area','wag']};
 const idx=reconcile([e]);
 assert.equal(idx.resolve('leekduck:go-wild-area'),e);
 assert.equal(idx.resolve('wag'),e);
 assert.equal(idx.canonicalCount,1);
});
test('same title and date do not automatically merge distinct regions',()=>{
 const a={eventId:'festival-japan',title:'Festival',aliases:[]};
 const b={eventId:'festival-mexico',title:'Festival',aliases:[]};
 const idx=reconcile([a,b]);
 assert.equal(idx.canonicalCount,2);
 assert.equal(idx.conflicts.length,0);
});
test('shared source alias fails closed and is reported',()=>{
 const a={eventId:'a',aliases:['source:shared']};
 const b={eventId:'b',aliases:['source:shared']};
 const idx=reconcile([a,b]);
 assert.equal(idx.resolve('source:shared'),null);
 assert.equal(idx.conflicts[0].type,'alias-collision');
 assert.equal(idx.resolve('a'),a);
});
test('duplicate canonical ID is reported, first record retained',()=>{
 const a={eventId:'a'}, b={eventId:'a'};
 const idx=reconcile([a,b]);
 assert.equal(idx.resolve('a'),a);
 assert.equal(idx.conflicts[0].type,'duplicate-canonical');
});
test('unknown alias is not resolved by fuzzy title matching',()=>{
 assert.equal(reconcile([{eventId:'one',title:'Community Day'}]).resolve('Community Day'),null);
});
