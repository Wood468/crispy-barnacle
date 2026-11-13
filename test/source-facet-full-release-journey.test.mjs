import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {buildFacetReviewPlan} from '../scripts/importer/source-facet-review-plan.mjs';
import {facetReleaseAttestationMessage} from '../scripts/importer/source-facet-signed-release.mjs';
import {persistSignedFacetSnapshot} from '../scripts/importer/source-facet-atomic-store.mjs';
import {facetPromotionManifestMessage} from '../scripts/importer/source-facet-promotion-manifest.mjs';
import {commitFacetPromotion} from '../scripts/importer/source-facet-release-controller.mjs';

const reviewer=generateKeyPairSync('ed25519');
const releaser=generateKeyPairSync('ed25519');
const pub=pair=>pair.publicKey.export({type:'spki',format:'pem'});
const eventId='wild-area:global.2026';
const rawUrl='https://pokemongo.com/news/synthetic-wild-area/?access_token=LEAK';
const officialRefs=[{sourceId:'official',url:rawUrl,section:'Ticket bonuses'}];
const duckRefs=[{sourceId:'leekduck',url:'https://leekduck.com/events/synthetic/',section:'Bonuses'}];
const bonus=(id,access='free',sourceRefs=officialRefs)=>({
  id,label:'Synthetic '+id,kind:'candy',access,status:'source-claimed',
  dayScope:'ticketed-day',windowText:'10:00 a.m. to 6:00 p.m.',
  sourceRefs,internalCredential:'DO_NOT_PUBLISH'
});
const stage=benefits=>({schemaVersion:1,publication:'staging-only',
  eventId,benefits,featuredMoves:[],researchPrograms:[]});
const chosen=ids=>({eventId,approved:{
  benefits:ids,featuredMoves:[],researchPrograms:[]}});
const authorization=(plan,acknowledgeMassRemoval=false)=>{
  const payload={eventId,candidateSha256:plan.fingerprint.candidateSha256,
    acknowledgeMassRemoval};
  return {reviewSignature:sign(null,facetReleaseAttestationMessage(payload,'review'),
      reviewer.privateKey).toString('base64'),
    releaseSignature:sign(null,facetReleaseAttestationMessage(payload,'release'),
      releaser.privateKey).toString('base64'),
    acknowledgeMassRemoval,verifiedAt:'2026-11-13T04:00:00.000Z'};
};
const keys={reviewPublicKey:pub(reviewer),releasePublicKey:pub(releaser)};
const publicationManifest=(snapshotSha,priorPublicSha=null)=>({
  schemaVersion:1,publication:'promotion-manifest',releaseId:'wildarea-20261113-first',
  environment:'production',commitSha:'a'.repeat(40),
  issuedAt:'2026-11-13T04:05:00.000Z',
  expiresAt:'2026-11-13T04:25:00.000Z',
  expectedPreviousFeedSha256:priorPublicSha,
  events:[{eventId,sha256:snapshotSha}]
});
const releaseSignature=m=>sign(null,facetPromotionManifestMessage(m),
  releaser.privateKey).toString('base64');
async function sandbox(fn){
  const base=await mkdtemp(join(tmpdir(),'s4-full-journey-'));
  const rootDir=join(base,'checkout'),durableStateDir=join(base,'trusted-ledger');
  await (await import('node:fs/promises')).mkdir(rootDir,{recursive:true});
  await (await import('node:fs/promises')).mkdir(durableStateDir,{recursive:true});
  await (await import('node:fs/promises')).writeFile(join(durableStateDir,'promotion-ledger.json'),
    JSON.stringify({schemaVersion:1,publication:'promotion-ledger',releases:[],pending:null}));
  const importerReport={runAt:'2026-11-13T04:00:00.000Z',
    sourceFacetStaging:{schemaVersion:1,publication:'audit-only',
      sourceId:'leekduck',eligiblePages:1,skippedLarge:0,errors:[],
      canonicalLinks:{publication:'staging-only',eligiblePages:1,
        linkedPages:1,ambiguousPages:0,unlinkedPages:0,
        duplicatePages:0,rejectedPages:0}}};
  await (await import('node:fs/promises')).mkdir(join(rootDir,'data'),{recursive:true});
  const auditBytes=Buffer.from(JSON.stringify(importerReport));
  await (await import('node:fs/promises')).writeFile(join(rootDir,'data','importer-report.json'),auditBytes);
  const trustedAuditSha=createHash('sha256').update(auditBytes).digest('hex');
  try{await fn(rootDir,durableStateDir,trustedAuditSha)}
  finally{await rm(base,{recursive:true,force:true})}
}
test('source-backed review through two signatures and replay-safe public feed works as one journey',async()=>sandbox(async (rootDir,durableStateDir,trustedAuditSha)=>{
  const raw=stage([
    bonus('free','free'),
    bonus('ticket','ticket'),
    bonus('held-ticket','ticket',duckRefs)
  ]);
  assert.throws(()=>buildFacetReviewPlan(raw,chosen(['held-ticket'])),/Held claim/);
  const plan=buildFacetReviewPlan(raw,chosen(['ticket','free']));
  const stored=await persistSignedFacetSnapshot(plan,authorization(plan),{
    rootDir,trustedKeys:keys
  });
  assert.equal(stored.publication,'verified');
  const promoted=publicationManifest(stored.sha256);
  const completed=await commitFacetPromotion(promoted,releaseSignature(promoted),{
    rootDir,durableStateDir,allowLocalWrite:true,expectedImporterReportSha256:trustedAuditSha,
    trustedReleasePublicKey:pub(releaser),
    environment:'production',trustedCommitSha:'a'.repeat(40),
    now:'2026-11-13T04:10:00.000Z',
    trustedCanonicalEventIds:[eventId],
    trustedPrivateReceipts:{[eventId]:{
      sha256:stored.sha256,reviewFingerprint:plan.fingerprint.candidateSha256
    }}
  });
  assert.equal(completed.localReleaseRecorded,true);
  assert.equal(completed.productionDeploymentVerified,false);
  const publicJson=await readFile(join(rootDir,completed.path),'utf8');
  const output=JSON.parse(publicJson);
  assert.equal(output.events[0].benefits.length,2);
  assert.deepEqual(output.events[0].benefits.map(b=>b.id),['free','ticket']);
  assert.equal(output.events[0].benefits[0].sourceRefs[0].url,
    'https://pokemongo.com/news/synthetic-wild-area/');
  assert.equal(publicJson.includes('LEAK'),false);
  assert.equal(publicJson.includes('DO_NOT_PUBLISH'),false);
  assert.equal(publicJson.includes('held-ticket'),false);
}));
test('source dropout cannot remove last-good ticket detail without a new signed acknowledgement',async()=>sandbox(async (rootDir,durableStateDir)=>{
  const initial=buildFacetReviewPlan(stage([bonus('free'),bonus('ticket','ticket')]),
    chosen(['free','ticket']));
  const stored=await persistSignedFacetSnapshot(initial,authorization(initial),{
    rootDir,trustedKeys:keys
  });
  const prior=JSON.parse(await readFile(join(rootDir,stored.file),'utf8'));
  const reduced=buildFacetReviewPlan(stage([bonus('free')]),chosen(['free']),{
    previousVerified:prior
  });
  assert.equal(reduced.changes.requiresRemovalReview,true);
  await assert.rejects(persistSignedFacetSnapshot(reduced,authorization(reduced),{
    rootDir,trustedKeys:keys,expectedPreviousSha256:stored.sha256
  }),/mass-removal/);
  const stillStored=JSON.parse(await readFile(join(rootDir,stored.file),'utf8'));
  assert.deepEqual(stillStored.benefits.map(b=>b.id),['free','ticket']);
}));
