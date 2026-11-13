import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReviewedFacetCandidate as build} from '../scripts/importer/source-facet-review-candidate.mjs';

const official='https://pokemongo.com/news/synthetic-event/';
const duck='https://leekduck.com/events/synthetic-event/';
const ref=(sourceId,url)=>({sourceId,url,section:'Synthetic section'});
const benefit=(id,access,sourceRefs)=>({
  id,label:'Synthetic benefit',kind:'candy',access,sourceRefs,status:'source-claimed',
  dayScope:'ticketed-day',windowText:'10 a.m. to 6 p.m.',
  internalPlayerToken:'SHOULD NEVER LEAK'
});
const stage=(benefits)=>({
  eventId:'synthetic-event',schemaVersion:1,publication:'staging-only',
  benefits,featuredMoves:[],researchPrograms:[]
});
const approve=(ids)=>({eventId:'synthetic-event',approved:{
  benefits:ids,featuredMoves:[],researchPrograms:[]
}});

test('review candidate contains only explicit eligible IDs with an allowlisted projection',()=>{
  const data=stage([
    benefit('free-safe','free',[ref('official',official)]),
    benefit('ticket-safe','ticket',[ref('official',official)]),
    benefit('ticket-held','ticket',[ref('leekduck',duck)])
  ]);
  const candidate=build(data,approve(['ticket-safe','free-safe']));
  assert.equal(candidate.publication,'review-candidate');
  assert.equal(candidate.requiresIndependentReview,true);
  assert.deepEqual(candidate.benefits.map(x=>x.id),['free-safe','ticket-safe']);
  assert.ok(!JSON.stringify(candidate).includes('SHOULD NEVER LEAK'));
  assert.ok(!JSON.stringify(candidate).includes('ticket-held'));
  assert.equal(candidate.benefits[1].sourceRefs[0].url,official);
  assert.equal(data.benefits[0].internalPlayerToken,'SHOULD NEVER LEAK');
});

test('held, spoofed, duplicated and unknown approvals fail closed',()=>{
  const input=stage([
    benefit('held','ticket',[ref('leekduck',duck)]),
    benefit('eligible','free',[ref('official',official)]),
    benefit('spoof','ticket',[ref('official','https://pokemongo.com.attacker.example/fake')])
  ]);
  for(const id of ['held','spoof','missing'])
    assert.throws(()=>build(input,approve([id])),/(Held claim|Unrecognized eligible)/);
  assert.throws(()=>build(input,approve(['eligible','eligible'])),/Unique approved/);
  assert.throws(()=>build(input,{...approve([]),eventId:'other-event'}),/Matching event ID/);
  assert.throws(()=>build(input,{...approve([]),approved:{...approve([]).approved,privatePrices:[]}}),/Unknown facet category/);
  assert.throws(()=>build({...input,publication:'verified'},approve([])),/Normalized staging/);
});

test('manual choice order is stable and empty selection stays non-publishable',()=>{
  const input=stage([
    benefit('z','free',[ref('official',official)]),
    benefit('a','free',[ref('official',official)])
  ]);
  assert.deepEqual(build(input,approve(['z','a'])),build(input,approve(['a','z'])));
  const empty=build(input,approve([]));
  assert.deepEqual(empty.benefits,[]);
  assert.equal(empty.publication,'review-candidate');
  assert.ok(!Object.hasOwn(empty,'verifiedAt'));
});
