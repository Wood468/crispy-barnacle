/*
 * Fail-closed, read-only source-identity coverage audit for Sprint 4.
 *
 * This consumes ONLY the importer audit report, not raw pages or tickets.
 * Identity coverage is a necessary release precondition, never proof of
 * entitlements or an authorization to publish.
 */
const COUNT=['eligiblePages','linkedPages','ambiguousPages','unlinkedPages','duplicatePages','rejectedPages'];
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const whole=x=>Number.isSafeInteger(x)&&x>=0&&x<=1000000;
export function auditSourceIdentityCoverage(input){
  const stage=plain(input)&&input.sourceFacetStaging?input.sourceFacetStaging:input;
  const links=stage?.canonicalLinks;
  if(!plain(stage)||stage.schemaVersion!==1||stage.publication!=='audit-only'||
      !plain(links)||links.publication!=='staging-only'||
      stage.sourceId!=='leekduck'||COUNT.some(k=>!whole(links[k]))||
      !whole(stage.eligiblePages)||!whole(stage.skippedLarge)||
      !Array.isArray(stage.errors)||stage.errors.length>20)
    throw new TypeError('Complete bounded importer canonical identity audit required');
  if(stage.eligiblePages!==links.eligiblePages||
     links.linkedPages+links.unlinkedPages+links.ambiguousPages!==links.eligiblePages)
    throw new TypeError('Inconsistent imported page identity totals');
  const reason=[];
  if(!links.eligiblePages)reason.push('no-eligible-source-pages');
  if(links.ambiguousPages)reason.push('ambiguous-source-ownership');
  if(links.unlinkedPages)reason.push('unlinked-source-pages');
  if(links.rejectedPages)reason.push('rejected-source-identities');
  if(links.duplicatePages)reason.push('duplicate-source-identities');
  if(stage.skippedLarge)reason.push('skipped-oversized-source-pages');
  if(stage.errors.length)reason.push('source-extraction-errors');
  return {
    schemaVersion:1,publication:'audit-only',sourceId:'leekduck',
    sourceLinkReviewRequired:reason.length>0,
    reviewBlockers:reason,
    coverage:{
      eligiblePages:links.eligiblePages,
      linkedPages:links.linkedPages,
      ambiguousPages:links.ambiguousPages,
      unlinkedPages:links.unlinkedPages,
      duplicatePages:links.duplicatePages,
      rejectedPages:links.rejectedPages
    },
    // An identity-only audit can NEVER authorize public updates, even when
    // every source page is uniquely linked and no blockers are present.
    requiresIndependentClaimReview:true,
    requiresSignedPromotion:true,
    productionPublicationAuthorized:false
  };
}
