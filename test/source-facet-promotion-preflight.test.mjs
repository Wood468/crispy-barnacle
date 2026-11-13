import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {facetPromotionManifestMessage} from '../scripts/importer/source-facet-promotion-manifest.mjs';
import {preflightFacetPromotion} from '../scripts/importer/source-facet-promotion-preflight.mjs';

const pair=generateKeyPairSync('ed25519');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=()=>({schemaVersion:1,publication:'verified',eventId:'wild:global.2026',
  verifiedAt:'2026-11-13T04:00:00.000Z',reviewFingerprint:'e'.repeat(64),
  benefits:[],featuredMoves:[],researchPrograms:[]});
const fixed={trustedReleasePublicKey:pair.publicKey.export({type:'spki',format:'pem'}),
  environment:'production',trustedCommitSha:'a'.repeat(40),now:'2026-11-13T04:05:00.000Z',
  trustedCanonicalEventIds:['wild:global.2026'],usedReleaseIds:[]};
const manifest=(sha,old=null)=>({schemaVersion:1,publication:'promotion-manifest',
  releaseId:'s4-verified-20261113',environment:'production',commitSha:fixed.trustedCommitSha,
  issuedAt:'2026-11-13T04:00:00.000Z',expiresAt:'2026-11-13T04:20:00.000Z',
  expectedPreviousFeedSha256:old,events:[{eventId:'wild:global.2026',sha256:sha}]});
const signIt=m=>sign(null,facetPromotionManifestMessage(m),pair.privateKey).toString('base64');
async function sandbox(fn){
  const rootDir=await mkdtemp(join(tmpdir(),'s4-promotion-'));
  try{await fn(rootDir)}finally{await rm(rootDir,{recursive:true,force:true})}
}
async function setup(rootDir){
  const doc=source(),raw=Buffer.from(JSON.stringify(doc));
  const folder=join(rootDir,'data','verified-event-facets');
  await mkdir(folder,{recursive:true});
  await writeFile(join(folder,doc.eventId+'.json'),raw);
  const sha=hash(raw);
  const opts={...fixed,rootDir,trustedPrivateReceipts:{
    [doc.eventId]:{sha256:sha,reviewFingerprint:doc.reviewFingerprint}
  }};
  return {sha,opts,doc};
}
test('signed release and pinned receipt with exact private bytes passes read-only preflight',async()=>sandbox(async rootDir=>{
  const {sha,opts}=await setup(rootDir),m=manifest(sha);
  const result=await preflightFacetPromotion(m,signIt(m),opts);
  assert.equal(result.publication,'audit-only');
  assert.equal(result.preflightPassed,true);
  assert.equal(result.eventCount,1);
  assert.equal(result.requiresDeploymentLock,true);
  assert.equal(result.requiresDurableReplayCommit,true);
  assert.equal(result.expectedSha256ByEvent['wild:global.2026'],sha);
  await assert.rejects(readFile(join(rootDir,'public','verified-event-facets.json')),/ENOENT/);
}));
test('mismatched, missing and forged private approval receipts cannot pass',async()=>sandbox(async rootDir=>{
  const {sha,opts,doc}=await setup(rootDir),m=manifest(sha),sig=signIt(m);
  await assert.rejects(preflightFacetPromotion(m,sig,{
    ...opts,trustedPrivateReceipts:{}}),/private writer receipt/);
  await assert.rejects(preflightFacetPromotion(m,sig,{
    ...opts,trustedPrivateReceipts:{[doc.eventId]:{sha256:sha,reviewFingerprint:'f'.repeat(64)}}}),
    /not bound/);
  await assert.rejects(preflightFacetPromotion(m,sig,{
    ...opts,trustedCanonicalEventIds:['other-event']}),/unknown canonical/);
  await assert.rejects(preflightFacetPromotion(m,sig,{
    ...opts,usedReleaseIds:[m.releaseId]}),/already used/);
  await writeFile(join(rootDir,'data','verified-event-facets',doc.eventId+'.json'),
    JSON.stringify({...doc,benefits:[{id:'injected'}]}));
  await assert.rejects(preflightFacetPromotion(m,sig,opts),/changed after signed/);
}));
test('existing public feed requires prior exact hash and complete event list',async()=>sandbox(async rootDir=>{
  const {sha,opts}=await setup(rootDir);
  const folder=join(rootDir,'public');await mkdir(folder,{recursive:true});
  const old=Buffer.from(JSON.stringify({schemaVersion:1,publication:'verified-feed',
    events:[{eventId:'wild:global.2026'},{eventId:'other-event'}]}));
  await writeFile(join(folder,'verified-event-facets.json'),old);
  const m=manifest(sha,hash(old)),sig=signIt(m);
  await assert.rejects(preflightFacetPromotion(m,sig,opts),/Partial release/);
  const stale=manifest(sha);
  await assert.rejects(preflightFacetPromotion(stale,signIt(stale),opts),/Public feed changed/);
  const corrected=Buffer.from(JSON.stringify({schemaVersion:1,publication:'verified-feed',
    events:[{eventId:'wild:global.2026'}]}));
  await writeFile(join(folder,'verified-event-facets.json'),corrected);
  const ok=manifest(sha,hash(corrected));
  assert.equal((await preflightFacetPromotion(ok,signIt(ok),opts)).eventCount,1);
}));
test('signed release cannot be reused across environment, commit, or expired window',async()=>sandbox(async rootDir=>{
  const {sha,opts}=await setup(rootDir),m=manifest(sha),sig=signIt(m);
  await assert.rejects(preflightFacetPromotion(m,sig,{...opts,environment:'staging'}),/trusted environment/);
  await assert.rejects(preflightFacetPromotion(m,sig,{...opts,trustedCommitSha:'b'.repeat(40)}),/trusted environment/);
  await assert.rejects(preflightFacetPromotion(m,sig,{...opts,now:m.expiresAt}),/validity window/);
}));
