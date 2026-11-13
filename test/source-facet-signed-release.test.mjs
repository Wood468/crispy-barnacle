import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {buildFacetReviewPlan} from '../scripts/importer/source-facet-review-plan.mjs';
import {authorizeFacetSnapshot,facetReleaseAttestationMessage} from '../scripts/importer/source-facet-signed-release.mjs';
const keypair=()=>generateKeyPairSync('ed25519');
const review=keypair(),release=keypair();
const pem=key=>key.export({type:'spki',format:'pem'});
const verifiedAt='2026-11-13T03:00:00.000Z';
const trustedKeys={reviewPublicKey:pem(review.publicKey),releasePublicKey:pem(release.publicKey)};
const benefit={id:'b1',label:'Synthetic Candy',kind:'candy',access:'free',
  dayScope:'all-day',status:'source-claimed',
  sourceRefs:[{sourceId:'official',url:'https://pokemongo.com/news/synthetic/',section:'Bonuses'}]};
const staging=(items=[benefit])=>({schemaVersion:1,publication:'staging-only',
  eventId:'synthetic',benefits:items,featuredMoves:[],researchPrograms:[]});
const manifest=(ids=['b1'])=>({eventId:'synthetic',approved:{
  benefits:ids,featuredMoves:[],researchPrograms:[]}});
const plan=()=>buildFacetReviewPlan(staging(),manifest());
const authorization=(p,acknowledgeMassRemoval=false)=>{
  const data={eventId:p.eventId,candidateSha256:p.fingerprint.candidateSha256,acknowledgeMassRemoval};
  return {reviewSignature:sign(null,facetReleaseAttestationMessage(data,'review'),review.privateKey).toString('base64'),
    releaseSignature:sign(null,facetReleaseAttestationMessage(data,'release'),release.privateKey).toString('base64'),
    acknowledgeMassRemoval,verifiedAt};
};
test('two separate signed release approvals produce only the reviewed verified snapshot',()=>{
  const p=plan(),approval=authorization(p);
  const snapshot=authorizeFacetSnapshot(p,approval,trustedKeys);
  assert.equal(snapshot.publication,'verified');
  assert.equal(snapshot.reviewFingerprint,p.fingerprint.candidateSha256);
  assert.equal(snapshot.verifiedAt,verifiedAt);
  assert.deepEqual(snapshot.benefits,[benefit]);
  assert.ok(!JSON.stringify(snapshot).includes('reviewSignature'));
  p.candidate.benefits[0].label='Tampered after authorization';
  assert.equal(snapshot.benefits[0].label,'Synthetic Candy');
});
test('self-declared approval, single signer and tampered plan cannot publish',()=>{
  const p=plan(),approval=authorization(p);
  assert.throws(()=>authorizeFacetSnapshot(p,{...approval,releaseSignature:null},trustedKeys),/Both independent/);
  assert.throws(()=>authorizeFacetSnapshot(p,approval,{...trustedKeys,releasePublicKey:trustedKeys.reviewPublicKey}),/Independent review/);
  assert.throws(()=>authorizeFacetSnapshot(p,{...approval,reviewSignature:'approved'},trustedKeys),/Both independent/);
  assert.throws(()=>authorizeFacetSnapshot({...p,eventId:'other'},approval,trustedKeys),/Mismatched canonical/);
  assert.throws(()=>authorizeFacetSnapshot({...p,candidate:{...p.candidate,benefits:[{
    ...p.candidate.benefits[0],label:'Injected'
  }]}},approval,trustedKeys),/Stale or altered/);
  assert.throws(()=>authorizeFacetSnapshot(p,{...approval,verifiedAt:'yesterday'},trustedKeys),/ISO verifiedAt/);
});
test('mass removals require acknowledgement signed by both independent authorities',()=>{
  const previous={schemaVersion:1,publication:'verified',eventId:'synthetic',verifiedAt,
    benefits:[benefit],featuredMoves:[],researchPrograms:[]};
  const p=buildFacetReviewPlan(staging([]),manifest([]),{previousVerified:previous});
  assert.equal(p.changes.requiresRemovalReview,true);
  assert.throws(()=>authorizeFacetSnapshot(p,authorization(p),trustedKeys),/mass-removal/);
  const approved=authorizeFacetSnapshot(p,authorization(p,true),trustedKeys);
  assert.deepEqual(approved.benefits,[]);
  assert.equal(approved.publication,'verified');
  assert.throws(()=>authorizeFacetSnapshot(p,{...authorization(p,true),
    acknowledgeMassRemoval:false},trustedKeys),/mass-removal/);
});

test('canonical provider aliases and release attestations preserve exact punctuation',()=>{
  const claims={eventId:'leekduck:wild-area.global-2026',candidateSha256:'f'.repeat(64)};
  const message=facetReleaseAttestationMessage(claims,'review');
  assert.match(message.toString('utf8'),/leekduck:wild-area.global-2026/);
  assert.throws(()=>facetReleaseAttestationMessage({...claims,eventId:'..\/public'},'review'),/Exact release attestation/);
});

test('attacker-supplied signing keys in review decision cannot replace pinned trust roots',()=>{
  const p=plan();
  const attacker=generateKeyPairSync('ed25519');
  const payload={eventId:p.eventId,candidateSha256:p.fingerprint.candidateSha256,
    acknowledgeMassRemoval:false};
  const forged={...authorization(p),reviewPublicKey:pem(attacker.publicKey),
    releasePublicKey:pem(attacker.publicKey),
    reviewSignature:sign(null,facetReleaseAttestationMessage(payload,'review'),attacker.privateKey).toString('base64'),
    releaseSignature:sign(null,facetReleaseAttestationMessage(payload,'release'),attacker.privateKey).toString('base64')};
  assert.throws(()=>authorizeFacetSnapshot(p,forged,trustedKeys),/Both independent/);
  assert.throws(()=>authorizeFacetSnapshot(p,authorization(p)),/public key required/);
});
