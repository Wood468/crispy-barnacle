import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditSourceIdentityCoverage as audit} from '../scripts/importer/source-facet-identity-coverage.mjs';
const fixture=({eligible=3,linked=3,ambiguous=0,unlinked=0,rejected=0,duplicate=0,skipped=0,errors=[]}={})=>({
  schemaVersion:1,publication:'audit-only',sourceId:'leekduck',
  eligiblePages:eligible,skippedLarge:skipped,errors,
  canonicalLinks:{publication:'staging-only',
    eligiblePages:eligible,linkedPages:linked,ambiguousPages:ambiguous,
    unlinkedPages:unlinked,rejectedPages:rejected,duplicatePages:duplicate}
});
test('fully linked canonical pages remain audit-only, not automatically publishable',()=>{
  const a=audit(fixture());
  assert.equal(a.sourceLinkReviewRequired,false);
  assert.equal(a.productionPublicationAuthorized,false);
  assert.equal(a.requiresIndependentClaimReview,true);
  assert.equal(a.requiresSignedPromotion,true);
});
test('ambiguous ownership and missing source IDs block independent promotion review',()=>{
  const a=audit(fixture({eligible:3,linked:1,ambiguous:1,unlinked:1}));
  assert.deepEqual(a.reviewBlockers,['ambiguous-source-ownership','unlinked-source-pages']);
  assert.equal(a.coverage.linkedPages,1);
  assert.equal(a.productionPublicationAuthorized,false);
});
test('source outage, rejected links, duplicates and extraction errors are separately visible',()=>{
  const a=audit(fixture({eligible:0,linked:0,rejected:2,duplicate:1,
    skipped:3,errors:[{sourceUrl:'https://leekduck.com/events/?secret=omitted',reason:'TypeError'}]}));
  assert.equal(a.sourceLinkReviewRequired,true);
  assert.ok(a.reviewBlockers.includes('no-eligible-source-pages'));
  assert.ok(a.reviewBlockers.includes('rejected-source-identities'));
  assert.ok(a.reviewBlockers.includes('source-extraction-errors'));
  assert.ok(!JSON.stringify(a).includes('secret=omitted'));
});
test('a fake green report with inconsistent or incomplete counts fails closed',()=>{
  assert.throws(()=>audit(fixture({eligible:5,linked:3})),/Inconsistent/);
  assert.throws(()=>audit({...fixture(),publication:'verified'}),/Complete bounded/);
  assert.throws(()=>audit({...fixture(),canonicalLinks:{}}),/Complete bounded/);
  assert.throws(()=>audit({...fixture(),errors:'hidden'}),/Complete bounded/);
});
test('current importer report produces a truthful blocked or ready audit without leaking claim text',async()=>{
  const report=JSON.parse(await readFile(new URL('../data/importer-report.json',import.meta.url),'utf8'));
  const a=audit(report);
  const l=report.sourceFacetStaging.canonicalLinks;
  assert.equal(a.coverage.eligiblePages,l.eligiblePages);
  assert.equal(a.coverage.linkedPages,l.linkedPages);
  assert.equal(a.sourceLinkReviewRequired,a.reviewBlockers.length>0);
  assert.equal(a.productionPublicationAuthorized,false);
  assert.ok(!Object.hasOwn(a,'linkedExamples'));
  assert.ok(!Object.hasOwn(a,'benefitText'));
});
