/*
 * Pure Sprint 4 review-plan composition. The output is for independent
 * human review; it is NOT a verified or publishable event snapshot.
 * This function neither authenticates a reviewer nor writes any files.
 */
import {buildReviewedFacetCandidate} from './source-facet-review-candidate.mjs';
import {compareFacetSnapshotForReview} from './source-facet-snapshot-diff.mjs';
import {fingerprintFacetReview} from './source-facet-review-fingerprint.mjs';

export function buildFacetReviewPlan(normalized,reviewManifest,{previousVerified=null}={}){
  const candidate=buildReviewedFacetCandidate(normalized,reviewManifest);
  const changes=compareFacetSnapshotForReview(previousVerified,candidate);
  const fingerprint=fingerprintFacetReview(candidate,changes);
  return {
    schemaVersion:1,
    publication:'audit-only',
    eventId:candidate.eventId,
    requiresIndependentReview:true,
    requiresExternalReviewerAuthentication:true,
    requiresIndependentPublicationGate:true,
    candidate,
    changes,
    fingerprint
  };
}
