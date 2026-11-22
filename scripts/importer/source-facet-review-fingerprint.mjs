/*
 * Stable review fingerprint for an exact prospective canonical event snapshot.
 * This does not authenticate reviewers, approve changes, or publish data.
 * The caller must provide verified actor authentication and an independent
 * release gate. No filesystem, network, or public-data mutations occur here.
 */
import {createHash,timingSafeEqual} from 'node:crypto';

const TYPES=['benefits','featuredMoves','researchPrograms'];
const validId=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9:._-]{0,159}$/i.test(s);
const canonical=value=>{
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  }
  return value;
};
function validate(candidate,delta){
  if(!candidate||candidate.schemaVersion!==1||candidate.publication!=='review-candidate'||
     candidate.requiresIndependentReview!==true||!validId(candidate.eventId))
    throw new TypeError('Reviewed candidate shape required');
  if(!delta||delta.schemaVersion!==1||delta.publication!=='audit-only'||
     delta.requiresIndependentReview!==true||delta.eventId!==candidate.eventId||
     typeof delta.hasChanges!=='boolean'||typeof delta.requiresRemovalReview!=='boolean'||
     !Array.isArray(delta.massRemovalTypes)||!delta.changes)
    throw new TypeError('Matching snapshot diff required');
  for(const type of TYPES){
    if(!Array.isArray(candidate[type])||!delta.changes[type])throw new TypeError('Facet arrays and diff required');
    for(const key of ['added','removed','changed']){
      if(!Array.isArray(delta.changes[type][key])||delta.changes[type][key].some(id=>!validId(id)))
        throw new TypeError('Valid diff claim IDs required');
    }
    if(!Number.isInteger(delta.changes[type].unchanged)||delta.changes[type].unchanged<0)
      throw new TypeError('Valid unchanged count required');
  }
  if(delta.massRemovalTypes.some(t=>!TYPES.includes(t)))
    throw new TypeError('Invalid mass-removal type');
}
export function fingerprintFacetReview(candidate,delta){
  validate(candidate,delta);
  const payload={eventId:candidate.eventId,reviewCandidate:candidate,snapshotDelta:delta};
  const sha256=createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex');
  return {schemaVersion:1,publication:'audit-only',eventId:candidate.eventId,
    candidateSha256:sha256,requiresRemovalReview:delta.requiresRemovalReview};
}
/**
 * Compare an externally supplied review decision with the exact immutable
 * candidate + delta it describes. Reviewers and their identities must be
 * authenticated by a trusted calling workflow. NEVER use the return value
 * as proof of independent approval or a live publication instruction.
 */
export function validateFacetReviewFingerprint(candidate,delta,decision){
  const expected=fingerprintFacetReview(candidate,delta);
  if(!decision||decision.eventId!==expected.eventId||
     typeof decision.candidateSha256!=='string'||!/^[a-f0-9]{64}$/.test(decision.candidateSha256))
    throw new TypeError('Exact event review fingerprint required');
  const equal=timingSafeEqual(Buffer.from(decision.candidateSha256,'hex'),Buffer.from(expected.candidateSha256,'hex'));
  if(!equal)throw new TypeError('Review fingerprint is stale or mismatched');
  if(expected.requiresRemovalReview&&decision.acknowledgeMassRemoval!==true)
    throw new TypeError('Explicit mass-removal acknowledgement required');
  return {schemaVersion:1,publication:'audit-only',eventId:expected.eventId,
    fingerprintMatches:true,requiresExternalReviewerAuthentication:true,
    requiresIndependentPublicationGate:true};
}
