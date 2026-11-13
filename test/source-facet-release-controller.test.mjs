import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,open,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {facetPromotionManifestMessage} from '../scripts/importer/source-facet-promotion-manifest.mjs';
import {commitFacetPromotion} from '../scripts/importer/source-facet-release-controller.mjs';

const key=generateKeyPairSync('ed25519');
const hash=b=>createHash('sha256').update(b).digest('hex');
const time='2026-11-13T04:10:00.000Z';
const eventId='synthetic:global.2026';
const claim={id:'bonus1',label:'Synthetic candy',kind:'candy',status:'source-claimed',
  access:'free',sourceRefs:[{sourceId:'official',
    url:'https://pokemongo.com/news/synthetic/',section:'Bonuses'}]};
const document=(bad=false)=>({schemaVersion:1,publication:'verified',eventId,
  verifiedAt:'2026-11-13T04:00:00.000Z',reviewFingerprint:'d'.repeat(64),
  benefits:[{...claim,sourceRefs:bad?[{sourceId:'official',
    url:'https://pokemongo.com.attacker.test/secret',section:'Fake'}]:claim.sourceRefs}],
  featuredMoves:[],researchPrograms:[]});
const baseOptions={
  trustedReleasePublicKey:key.publicKey.export({type:'spki',format:'pem'}),
  environment:'production',trustedCommitSha:'a'.repeat(40),now:time,
  trustedCanonicalEventIds:[eventId],allowLocalWrite:true
};
const manifest=(sha,releaseId='s4-20261113-first')=>({
  schemaVersion:1,publication:'promotion-manifest',releaseId,
  environment:'production',commitSha:baseOptions.trustedCommitSha,
  issuedAt:'2026-11-13T04:00:00.000Z',
  expiresAt:'2026-11-13T04:20:00.000Z',
  expectedPreviousFeedSha256:null,events:[{eventId,sha256:sha}]
});
const signed=m=>sign(null,facetPromotionManifestMessage(m),key.privateKey).toString('base64');
async function sandbox(fn){
  const base=await mkdtemp(join(tmpdir(),'s4-release-controller-'));
  const rootDir=join(base,'checkout'),durableStateDir=join(base,'trusted-ledger');
  await mkdir(rootDir,{recursive:true});
  await mkdir(durableStateDir,{recursive:true});
  try{await fn(rootDir,durableStateDir)}finally{await rm(base,{recursive:true,force:true})}
}
async function setup(rootDir,durableStateDir,bad=false){
  const doc=document(bad),bytes=Buffer.from(JSON.stringify(doc));
  const dir=join(rootDir,'data','verified-event-facets');
  await mkdir(dir,{recursive:true});
  await writeFile(join(dir,eventId+'.json'),bytes);
  return {sha:hash(bytes),opts:{...baseOptions,rootDir,durableStateDir,trustedPrivateReceipts:{
    [eventId]:{sha256:hash(bytes),reviewFingerprint:doc.reviewFingerprint}
  }}};
}
const ledgerFile=stateDir=>join(stateDir,'promotion-ledger.json');
test('explicit signed local promotion writes both verified public feed and durable release ledger',async()=>sandbox(async (rootDir,durableStateDir)=>{
  const {sha,opts}=await setup(rootDir,durableStateDir),m=manifest(sha);
  const result=await commitFacetPromotion(m,signed(m),opts);
  assert.equal(result.publication,'verified-feed');
  assert.equal(result.productionDeploymentVerified,false);
  assert.equal(result.localReleaseRecorded,true);
  const feed=JSON.parse(await readFile(join(rootDir,result.path),'utf8'));
  assert.equal(feed.events[0].eventId,eventId);
  const ledger=JSON.parse(await readFile(ledgerFile(durableStateDir),'utf8'));
  assert.equal(ledger.pending,null);
  assert.equal(ledger.releases.length,1);
  assert.equal(ledger.releases[0].releaseId,m.releaseId);
  assert.equal(ledger.releases[0].feedSha256,result.feedSha256);
  await assert.rejects(commitFacetPromotion(m,signed(m),opts),/already used/);
}));
test('untrusted authorization, missing receipt and tampered manifest write no public feed',async()=>sandbox(async (rootDir,durableStateDir)=>{
  const {sha,opts}=await setup(rootDir,durableStateDir),m=manifest(sha);
  await assert.rejects(commitFacetPromotion(m,signed(m),{
    ...opts,allowLocalWrite:false}),/Explicit trusted/);
  await assert.rejects(commitFacetPromotion(m,signed(m),{
    ...opts,durableStateDir:undefined}),/persistent state directory/);
  await assert.rejects(commitFacetPromotion(m,signed(m),{
    ...opts,durableStateDir:join(rootDir,'ephemeral-ledger')}),/outside the checkout/);
  await assert.rejects(commitFacetPromotion(m,signed(m),{
    ...opts,trustedPrivateReceipts:{}}),/private writer receipt/);
  await assert.rejects(commitFacetPromotion({...m,commitSha:'b'.repeat(40)},signed(m),opts),/trusted environment/);
  await assert.rejects(readFile(ledgerFile(durableStateDir)),/ENOENT/);
  await assert.rejects(readFile(join(rootDir,'public','verified-event-facets.json')),/ENOENT/);
}));
test('failed export preserves a pending intent and prevents retry without operator reconciliation',async()=>sandbox(async (rootDir,durableStateDir)=>{
  const {sha,opts}=await setup(rootDir,durableStateDir,true),m=manifest(sha);
  await assert.rejects(commitFacetPromotion(m,signed(m),opts),/Invalid source provenance/);
  const ledger=JSON.parse(await readFile(ledgerFile(durableStateDir),'utf8'));
  assert.equal(ledger.pending.releaseId,m.releaseId);
  assert.equal(ledger.releases.length,0);
  await assert.rejects(readFile(join(rootDir,'public','verified-event-facets.json')),/ENOENT/);
  await assert.rejects(commitFacetPromotion(m,signed(m),opts),/Unreconciled pending/);
}));
test('preexisting controller lock rejects second publisher without changes',async()=>sandbox(async (rootDir,durableStateDir)=>{
  const {sha,opts}=await setup(rootDir,durableStateDir),m=manifest(sha);
  const lockPath=join(durableStateDir,'promotion-controller.lock');
  const lock=await open(lockPath,'wx');
  try{
    await assert.rejects(commitFacetPromotion(m,signed(m),opts),/EEXIST/);
    await assert.rejects(readFile(ledgerFile(durableStateDir)),/ENOENT/);
  }finally{await lock.close();await rm(lockPath,{force:true})}
}));
test('corrupt durable replay ledger can never be overwritten by publication',async()=>sandbox(async (rootDir,durableStateDir)=>{
  const {sha,opts}=await setup(rootDir,durableStateDir),m=manifest(sha);
  const ledger=ledgerFile(durableStateDir);
  const content=Buffer.from('{"schemaVersion":1,"publication":"promotion-ledger","releases":{},"pending":null}');
  await writeFile(ledger,content);
  await assert.rejects(commitFacetPromotion(m,signed(m),opts),/invalid durable|Untrusted or invalid durable/);
  assert.deepEqual(await readFile(ledger),content);
  await assert.rejects(readFile(join(rootDir,'public','verified-event-facets.json')),/ENOENT/);
}));
