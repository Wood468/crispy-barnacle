import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {buildFacetReviewPlan} from '../scripts/importer/source-facet-review-plan.mjs';
import {facetReleaseAttestationMessage} from '../scripts/importer/source-facet-signed-release.mjs';
import {persistSignedFacetSnapshot} from '../scripts/importer/source-facet-atomic-store.mjs';

const review=generateKeyPairSync('ed25519'),release=generateKeyPairSync('ed25519');
const spki=pair=>pair.publicKey.export({type:'spki',format:'pem'});
const fingerprint=bytes=>createHash('sha256').update(bytes).digest('hex');
const trustedKeys={reviewPublicKey:spki(review),releasePublicKey:spki(release)};
const benefit={id:'a',kind:'candy',label:'Synthetic Candy',status:'source-claimed',
  access:'free',dayScope:'all-day',
  sourceRefs:[{sourceId:'official',url:'https://pokemongo.com/news/synthetic/',section:'Bonuses'}]};
const stage=benefits=>({schemaVersion:1,publication:'staging-only',
  eventId:'synthetic',benefits,featuredMoves:[],researchPrograms:[]});
const manifest=ids=>({eventId:'synthetic',approved:{benefits:ids,featuredMoves:[],researchPrograms:[]}});
const authorization=(plan,acknowledgeMassRemoval=false)=>{
  const payload={eventId:plan.eventId,candidateSha256:plan.fingerprint.candidateSha256,acknowledgeMassRemoval};
  return {
    reviewSignature:sign(null,facetReleaseAttestationMessage(payload,'review'),review.privateKey).toString('base64'),
    releaseSignature:sign(null,facetReleaseAttestationMessage(payload,'release'),release.privateKey).toString('base64'),
    acknowledgeMassRemoval,verifiedAt:'2026-11-13T03:00:00.000Z'
  };
};
async function sandbox(fn){
  const dir=await mkdtemp(join(tmpdir(),'s4-facet-store-'));
  try{await fn(dir)}finally{await rm(dir,{recursive:true,force:true})}
}
test('signed first publish creates only private verified data with checksum',async()=>sandbox(async rootDir=>{
  const plan=buildFacetReviewPlan(stage([benefit]),manifest(['a']));
  const result=await persistSignedFacetSnapshot(plan,authorization(plan),{rootDir,trustedKeys});
  assert.equal(result.publication,'verified');
  assert.equal(result.file,'data/verified-event-facets/synthetic.json');
  const file=join(rootDir,result.file),bytes=await readFile(file);
  assert.equal(result.sha256,fingerprint(bytes));
  assert.equal(JSON.parse(bytes).benefits[0].label,'Synthetic Candy');
  assert.deepEqual(await readdir(join(rootDir,'data','verified-event-facets')),['synthetic.json']);
  assert.ok(!result.file.startsWith('public/'));
}));
test('failed or stale approval leaves last-good snapshot untouched',async()=>sandbox(async rootDir=>{
  const first=buildFacetReviewPlan(stage([benefit]),manifest(['a']));
  const stored=await persistSignedFacetSnapshot(first,authorization(first),{rootDir,trustedKeys});
  const location=join(rootDir,stored.file),before=await readFile(location);
  const stale=buildFacetReviewPlan(stage([]),manifest([]));
  await assert.rejects(persistSignedFacetSnapshot(stale,authorization(stale),{
    rootDir,trustedKeys,expectedPreviousSha256:stored.sha256
  }),/stale against stored/);
  const previous=JSON.parse(before);
  const valid=buildFacetReviewPlan(stage([]),manifest([]),{previousVerified:previous});
  await assert.rejects(persistSignedFacetSnapshot(valid,authorization(valid),{
    rootDir,trustedKeys,expectedPreviousSha256:stored.sha256
  }),/mass-removal/);
  assert.deepEqual(await readFile(location),before);
  const ok=await persistSignedFacetSnapshot(valid,authorization(valid,true),{
    rootDir,trustedKeys,expectedPreviousSha256:stored.sha256
  });
  assert.equal(ok.previousSha256,stored.sha256);
  assert.deepEqual(JSON.parse(await readFile(location)).benefits,[]);
}));
test('optimistic concurrency and exclusive lock reject overlapping writers',async()=>sandbox(async rootDir=>{
  const plan=buildFacetReviewPlan(stage([benefit]),manifest(['a']));
  const stored=await persistSignedFacetSnapshot(plan,authorization(plan),{rootDir,trustedKeys});
  await assert.rejects(persistSignedFacetSnapshot(plan,authorization(plan),{rootDir,trustedKeys}),/changed since review/);
  const location=join(rootDir,'data','verified-event-facets','synthetic.json.lock');
  const lock=await import('node:fs/promises').then(fs=>fs.open(location,'wx'));
  try{await assert.rejects(persistSignedFacetSnapshot(plan,authorization(plan),{
    rootDir,trustedKeys,expectedPreviousSha256:stored.sha256
  }),/EEXIST/)}finally{await lock.close();await rm(location,{force:true})}
}));
test('invalid event IDs and invalid roots cannot escape private snapshot directory',async()=>sandbox(async rootDir=>{
  const plan=buildFacetReviewPlan(stage([benefit]),manifest(['a']));
  for(const eventId of ['../public','x/y','.hidden','..']){
    await assert.rejects(persistSignedFacetSnapshot({...plan,eventId},authorization(plan),{rootDir,trustedKeys}),/safe event ID/);
  }
  await assert.rejects(persistSignedFacetSnapshot(plan,authorization(plan),{rootDir:'',trustedKeys}),/Trusted root/);
}));

test('safe colon and dotted canonical aliases can be stored without path traversal',async()=>sandbox(async rootDir=>{
  const id='leekduck:global.wild-area-2026';
  const normalized={...stage([benefit]),eventId:id};
  const chosen={...manifest(['a']),eventId:id};
  const plan=buildFacetReviewPlan(normalized,chosen);
  const output=await persistSignedFacetSnapshot(plan,authorization(plan),{rootDir,trustedKeys});
  assert.equal(output.eventId,id);
  assert.equal(JSON.parse(await readFile(join(rootDir,output.file))).eventId,id);
  assert.ok(output.file.startsWith('data/verified-event-facets/'));
}));

test('self-signed decisions with attacker-chosen keys never bypass pinned trust configuration',async()=>sandbox(async rootDir=>{
  const plan=buildFacetReviewPlan(stage([benefit]),manifest(['a']));
  const attacker=generateKeyPairSync('ed25519');
  const request={...authorization(plan),reviewPublicKey:attacker.publicKey.export({type:'spki',format:'pem'}),
    releasePublicKey:attacker.publicKey.export({type:'spki',format:'pem'})};
  const payload={eventId:plan.eventId,candidateSha256:plan.fingerprint.candidateSha256,acknowledgeMassRemoval:false};
  request.reviewSignature=sign(null,facetReleaseAttestationMessage(payload,'review'),attacker.privateKey).toString('base64');
  request.releaseSignature=sign(null,facetReleaseAttestationMessage(payload,'release'),attacker.privateKey).toString('base64');
  await assert.rejects(persistSignedFacetSnapshot(plan,request,{rootDir,trustedKeys}),/Both independent/);
  assert.deepEqual(await readdir(join(rootDir,'data','verified-event-facets')),[]);
}));
