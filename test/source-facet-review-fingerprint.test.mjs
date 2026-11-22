import test from 'node:test';
import assert from 'node:assert/strict';
import {fingerprintFacetReview,validateFacetReviewFingerprint} from '../scripts/importer/source-facet-review-fingerprint.mjs';
const benefit={id:'a',label:'Candy',kind:'candy',access:'free'};
const candidate=(items=[benefit])=>({schemaVersion:1,publication:'review-candidate',requiresIndependentReview:true,
  eventId:'synthetic-event',benefits:items,featuredMoves:[],researchPrograms:[]});
const delta=(massRemoval=false)=>({
  schemaVersion:1,publication:'audit-only',requiresIndependentReview:true,eventId:'synthetic-event',
  hasChanges:true,requiresRemovalReview:massRemoval,massRemovalTypes:massRemoval?['benefits']:[],
  changes:{
    benefits:{added:['a'],removed:massRemoval?['b']:[],changed:[],unchanged:0},
    featuredMoves:{added:[],removed:[],changed:[],unchanged:0},
    researchPrograms:{added:[],removed:[],changed:[],unchanged:0}
  }
});
test('exact snapshot and delta produce deterministic private-free review fingerprints',()=>{
  const one=fingerprintFacetReview(candidate(),delta());
  const two=fingerprintFacetReview({...candidate(),benefits:[{access:'free',kind:'candy',label:'Candy',id:'a'}]},delta());
  assert.deepEqual(one,two);
  assert.match(one.candidateSha256,/^[a-f0-9]{64}$/);
  assert.equal(one.publication,'audit-only');
  assert.ok(!Object.hasOwn(one,'verifiedAt'));
  assert.ok(!JSON.stringify(one).includes('Candy'));
});
test('any changed claim contents or changed delta invalidates the earlier decision',()=>{
  const c=candidate(),d=delta(),fingerprint=fingerprintFacetReview(c,d);
  const decision={eventId:c.eventId,candidateSha256:fingerprint.candidateSha256};
  assert.equal(validateFacetReviewFingerprint(c,d,decision).fingerprintMatches,true);
  assert.throws(()=>validateFacetReviewFingerprint(candidate([{...benefit,label:'Changed'}]),d,decision),/stale/);
  assert.throws(()=>validateFacetReviewFingerprint(c,{...d,hasChanges:false},decision),/stale/);
  assert.throws(()=>validateFacetReviewFingerprint(c,d,{...decision,eventId:'another-event'}),/Exact event/);
});
test('mass removal needs an explicit flag in addition to the matching fingerprint',()=>{
  const c=candidate(),d=delta(true),fp=fingerprintFacetReview(c,d);
  const decision={eventId:c.eventId,candidateSha256:fp.candidateSha256};
  assert.throws(()=>validateFacetReviewFingerprint(c,d,decision),/mass-removal/);
  assert.equal(validateFacetReviewFingerprint(c,d,{...decision,acknowledgeMassRemoval:true}).requiresIndependentPublicationGate,true);
});
test('unverified or mismatched inputs fail closed',()=>{
  assert.throws(()=>fingerprintFacetReview({...candidate(),publication:'verified'},delta()),/Reviewed candidate/);
  assert.throws(()=>fingerprintFacetReview(candidate(),{...delta(),eventId:'other'}),/Matching snapshot/);
  assert.throws(()=>fingerprintFacetReview(candidate(),{...delta(),changes:{}}),/Facet arrays/);
  assert.throws(()=>validateFacetReviewFingerprint(candidate(),delta(),{eventId:'synthetic-event',candidateSha256:'invalid'}),/Exact event/);
});
