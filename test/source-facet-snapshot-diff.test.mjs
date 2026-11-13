import test from 'node:test';
import assert from 'node:assert/strict';
import {compareFacetSnapshotForReview as compare} from '../scripts/importer/source-facet-snapshot-diff.mjs';
const mk=(publication,benefits=[],other={})=>({
  schemaVersion:1,publication,eventId:'synthetic-event',
  ...(publication==='review-candidate'?{requiresIndependentReview:true}:{}),
  benefits,featuredMoves:[],researchPrograms:[],...other
});
const claim=(id,label)=>({id,kind:'candy',access:'ticket',label,
  status:'source-claimed',sourceRefs:[{sourceId:'official',url:'https://pokemongo.com/news/synthetic-event/'}]});

test('deterministic audit detects added, removed and changed claims without revealing content',()=>{
  const old=mk('verified',[claim('a','Old private claim'),claim('b','Removed private claim')]);
  const next=mk('review-candidate',[claim('c','Added private claim'),claim('a','Changed private claim')]);
  const result=compare(old,next);
  assert.equal(result.publication,'audit-only');
  assert.deepEqual(result.changes.benefits,{added:['c'],removed:['b'],changed:['a'],unchanged:0});
  assert.equal(result.hasChanges,true);
  assert.ok(!JSON.stringify(result).includes('private claim'));
  assert.ok(!JSON.stringify(result).includes('https://'));
  assert.deepEqual(compare({...old,benefits:old.benefits.slice().reverse()},
    {...next,benefits:next.benefits.slice().reverse()}),result);
});

test('same claim id with changed entitlement or source is material, object key order is not',()=>{
  const base=claim('a','Synthetic benefit');
  const old=mk('verified',[base]);
  const noChange=mk('review-candidate',[{
    sourceRefs:base.sourceRefs,status:base.status,label:base.label,
    access:base.access,kind:base.kind,id:base.id,internalIgnored:'not published'
  }]);
  assert.equal(compare(old,noChange).hasChanges,false);
  assert.equal(compare(old,mk('review-candidate',[{...base,access:'free'}])).changes.benefits.changed[0],'a');
  assert.equal(compare(old,mk('review-candidate',[{...base,sourceRefs:[{
    sourceId:'leekduck',url:'https://leekduck.com/events/synthetic-event/'
  }]}])).changes.benefits.changed[0],'a');
});

test('first review is still audit-only and has no verified timestamp',()=>{
  const d=compare(null,mk('review-candidate',[claim('a','Synthetic benefit')]));
  assert.deepEqual(d.changes.benefits.added,['a']);
  assert.equal(d.hasChanges,true);
  assert.ok(!Object.hasOwn(d,'verifiedAt'));
});

test('bad snapshots and duplicate IDs cannot become apparently safe changes',()=>{
  const previous=mk('verified',[claim('a','Synthetic benefit')]);
  const next=mk('review-candidate',[claim('a','Synthetic benefit')]);
  assert.throws(()=>compare({...previous,eventId:'another-event'},next),/Matching previously verified/);
  assert.throws(()=>compare({...previous,publication:'staging-only'},next),/Matching previously verified/);
  assert.throws(()=>compare(previous,{...next,publication:'verified'}),/Explicit canonical review/);
  assert.throws(()=>compare(previous,{...next,benefits:[claim('a','1'),claim('a','2')]}),/Unique valid/);
  assert.throws(()=>compare(previous,{...next,featuredMoves:null}),/Facet arrays/);
});
