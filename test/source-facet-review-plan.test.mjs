import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFacetReviewPlan} from '../scripts/importer/source-facet-review-plan.mjs';
import {validateFacetReviewFingerprint} from '../scripts/importer/source-facet-review-fingerprint.mjs';
const official='https://pokemongo.com/news/synthetic-event/';
const evidence=[{sourceId:'official',url:official,section:'Bonuses'}];
const benefit=(id,access='free')=>({
  id,kind:'candy',label:'Synthetic benefit '+id,access,
  status:'source-claimed',sourceRefs:evidence,
  dayScope:'ticketed-day',windowText:'10:00 a.m. to 6:00 p.m.'
});
const staged=(benefits)=>({
  schemaVersion:1,publication:'staging-only',eventId:'synthetic-event',
  benefits,featuredMoves:[],researchPrograms:[]
});
const manifest=(ids)=>({eventId:'synthetic-event',approved:{
  benefits:ids,featuredMoves:[],researchPrograms:[]
}});
const verified=benefits=>({
  schemaVersion:1,publication:'verified',eventId:'synthetic-event',
  verifiedAt:'2026-11-13T01:00:00Z',benefits,
  featuredMoves:[],researchPrograms:[]
});
test('review plan binds selection, verified snapshot delta, and fingerprint',()=>{
  const normalized=staged([benefit('a'),benefit('b','ticket')]);
  const old=verified([benefit('a')]);
  const plan=buildFacetReviewPlan(normalized,manifest(['b','a']),{previousVerified:old});
  assert.equal(plan.publication,'audit-only');
  assert.equal(plan.candidate.publication,'review-candidate');
  assert.equal(plan.changes.publication,'audit-only');
  assert.deepEqual(plan.changes.changes.benefits.added,['b']);
  assert.equal(plan.changes.hasChanges,true);
  assert.equal(plan.fingerprint.eventId,'synthetic-event');
  assert.equal(plan.requiresExternalReviewerAuthentication,true);
  assert.equal(plan.requiresIndependentPublicationGate,true);
  assert.ok(!Object.hasOwn(plan,'verifiedAt'));
  assert.equal(validateFacetReviewFingerprint(plan.candidate,plan.changes,{
    eventId:'synthetic-event',candidateSha256:plan.fingerprint.candidateSha256
  }).fingerprintMatches,true);
  assert.deepEqual(buildFacetReviewPlan(normalized,manifest(['a','b']),{previousVerified:old}),plan);
});
test('missing or held source claim cannot produce a review plan',()=>{
  const held=benefit('paid-held','ticket');
  held.sourceRefs=[{sourceId:'leekduck',url:'https://leekduck.com/events/synthetic-event/',section:'Bonuses'}];
  const normalized=staged([benefit('free-ok'),held]);
  assert.throws(()=>buildFacetReviewPlan(normalized,manifest(['paid-held'])),/Held claim/);
  assert.throws(()=>buildFacetReviewPlan(normalized,manifest(['not-present'])),/Unrecognized/);
});
test('total provider loss creates an audit-only mass-removal warning',()=>{
  const plan=buildFacetReviewPlan(staged([]),manifest([]),{previousVerified:verified([benefit('a')])});
  assert.equal(plan.changes.requiresRemovalReview,true);
  assert.equal(plan.fingerprint.requiresRemovalReview,true);
  assert.deepEqual(plan.changes.massRemovalTypes,['benefits']);
  assert.equal(plan.publication,'audit-only');
});
test('mismatched event and unverified previous records fail closed',()=>{
  assert.throws(()=>buildFacetReviewPlan(staged([benefit('a')]),{...manifest(['a']),eventId:'other'}),/Matching event ID/);
  assert.throws(()=>buildFacetReviewPlan(staged([benefit('a')]),manifest(['a']),{
    previousVerified:{...verified([benefit('a')]),publication:'staging-only'}
  }),/Matching previously verified/);
});
