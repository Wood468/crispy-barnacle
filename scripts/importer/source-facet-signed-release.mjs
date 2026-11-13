/*
 * Sprint 4 release gate: two independent Ed25519 attestations for the exact
 * canonical event-facet review plan. Nothing in the extracted source HTML or
 * caller-supplied "approved" flags can authenticate a release.
 *
 * This module produces a verified snapshot IN MEMORY. It performs no file
 * writes or deployments. Public keys must be pinned by the trusted release
 * controller, never fetched from the review plan or source documents.
 */
import {createPublicKey,createHash,verify} from 'node:crypto';
import {fingerprintFacetReview} from './source-facet-review-fingerprint.mjs';

const CATEGORIES=['benefits','featuredMoves','researchPrograms'];
const safeId=id=>typeof id==='string'&&/^[a-z0-9][a-z0-9:._-]{0,159}$/i.test(id);
const canonical=value=>{
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(
    Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
};
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const strictSignature=value=>typeof value==='string'&&
  /^[A-Za-z0-9+/]{86}==$/.test(value)?Buffer.from(value,'base64'):null;
const keyFor=(pem,label)=>{
  if(typeof pem!=='string'||!pem.trim())throw new TypeError(label+' public key required');
  const key=createPublicKey(pem);
  if(key.asymmetricKeyType!=='ed25519')throw new TypeError(label+' must be Ed25519');
  return key;
};
/**
 * The exact text signed by an independently authenticated review principal
 * and separately by the release authority. Both sign the same event, review
 * fingerprint and explicit mass-removal acknowledgment.
 */
export function facetReleaseAttestationMessage({eventId,candidateSha256,acknowledgeMassRemoval=false},role){
  if(!['review','release'].includes(role)||!safeId(eventId)||
    typeof candidateSha256!=='string'||!/^[a-f0-9]{64}$/.test(candidateSha256)||
    typeof acknowledgeMassRemoval!=='boolean')
    throw new TypeError('Exact release attestation details required');
  return Buffer.from('go-field-notes:faf:v1:'+role+':'+eventId+':'+candidateSha256+
    ':removal='+String(acknowledgeMassRemoval),'utf8');
}

/**
 * A caller may use this only after it has independently authenticated the
 * two public keys and confirmed latest-head CI, exact canonical linking, and
 * a release lock. This function verifies cryptographic signatures only.
 * Trusted public keys must be a separate controller-owned parameter, not part
 * of the review decision submitted by an untrusted party.
 */
export function authorizeFacetSnapshot(reviewPlan,{
  reviewSignature,releaseSignature,acknowledgeMassRemoval=false,verifiedAt
}={},trustedKeys={}){
  // Public keys are trusted release-controller configuration, NEVER supplied
  // as part of an untrusted review decision or external source document.
  const {reviewPublicKey,releasePublicKey}=trustedKeys;
  if(!reviewPlan||reviewPlan.schemaVersion!==1||
    reviewPlan.publication!=='audit-only'||reviewPlan.requiresIndependentReview!==true||
    reviewPlan.requiresExternalReviewerAuthentication!==true||
    reviewPlan.requiresIndependentPublicationGate!==true||
    !reviewPlan.candidate||!reviewPlan.changes||!reviewPlan.fingerprint)
    throw new TypeError('Complete review plan required');
  const {candidate,changes,fingerprint}=reviewPlan;
  if(!safeId(reviewPlan.eventId)||candidate.eventId!==reviewPlan.eventId||
      changes.eventId!==reviewPlan.eventId||fingerprint.eventId!==reviewPlan.eventId)
    throw new TypeError('Mismatched canonical event');
  const actual=fingerprintFacetReview(candidate,changes);
  if(actual.candidateSha256!==fingerprint.candidateSha256||
     actual.requiresRemovalReview!==fingerprint.requiresRemovalReview)
    throw new TypeError('Stale or altered review fingerprint');
  if(changes.requiresRemovalReview&&!acknowledgeMassRemoval)
    throw new TypeError('Explicit signed mass-removal acknowledgment required');
  const time=Date.parse(verifiedAt);
  if(typeof verifiedAt!=='string'||!Number.isFinite(time)||
    new Date(time).toISOString()!==verifiedAt)
    throw new TypeError('Explicit ISO verifiedAt required');
  const reviewKey=keyFor(reviewPublicKey,'Reviewer');
  const releaseKey=keyFor(releasePublicKey,'Release');
  const pub=(key)=>key.export({type:'spki',format:'der'});
  if(pub(reviewKey).equals(pub(releaseKey)))
    throw new TypeError('Independent review and release keys required');
  const claims={eventId:reviewPlan.eventId,candidateSha256:actual.candidateSha256,
    acknowledgeMassRemoval};
  const reviewSig=strictSignature(reviewSignature);
  const releaseSig=strictSignature(releaseSignature);
  if(!reviewSig||!releaseSig||reviewSig.length!==64||releaseSig.length!==64||
    !verify(null,facetReleaseAttestationMessage(claims,'review'),reviewKey,reviewSig)||
    !verify(null,facetReleaseAttestationMessage(claims,'release'),releaseKey,releaseSig))
    throw new TypeError('Both independent valid signatures required');
  const output={schemaVersion:1,publication:'verified',eventId:reviewPlan.eventId,
    verifiedAt,reviewFingerprint:actual.candidateSha256,
    benefits:candidate.benefits,featuredMoves:candidate.featuredMoves,
    researchPrograms:candidate.researchPrograms};
  for(const type of CATEGORIES)if(!Array.isArray(output[type]))
    throw new TypeError('Complete facet arrays required');
  // The candidate fields were already allowlisted by the review plan builder.
  // Serialize into an independent object to avoid post-authorization mutation.
  return JSON.parse(JSON.stringify(output));
}

