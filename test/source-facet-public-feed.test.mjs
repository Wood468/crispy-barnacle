import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {publishApprovedFacetFeed} from '../scripts/importer/source-facet-public-feed.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const source={sourceId:'official',url:'https://pokemongo.com/news/synthetic/?session_secret=discard',
  section:'Synthetic benefits',privateValue:'DO NOT COPY'};
const benefit={id:'a',status:'source-claimed',access:'free',
  kind:'candy',label:'Synthetic bonus',sourceRefs:[source],
  internalCredential:'NEVER PUBLISH'};
const verified=()=>({schemaVersion:1,publication:'verified',
  eventId:'synthetic:global.2026',verifiedAt:'2026-11-13T04:00:00.000Z',
  reviewFingerprint:'f'.repeat(64),benefits:[benefit],
  featuredMoves:[],researchPrograms:[],privateReviewerEmail:'DO NOT COPY'});
async function sandbox(fn){
  const rootDir=await mkdtemp(join(tmpdir(),'s4-public-feed-'));
  try{await fn(rootDir)}finally{await rm(rootDir,{recursive:true,force:true})}
}
async function seed(rootDir,value=verified()){
  const dir=join(rootDir,'data','verified-event-facets');await mkdir(dir,{recursive:true});
  const bytes=Buffer.from(JSON.stringify(value));
  await writeFile(join(dir,value.eventId+'.json'),bytes);
  return digest(bytes);
}
test('explicitly pinned snapshot is published to a separate deterministic public feed',async()=>sandbox(async rootDir=>{
  const sha=await seed(rootDir);
  const result=await publishApprovedFacetFeed({rootDir,expectedSha256ByEvent:{'synthetic:global.2026':sha}});
  assert.equal(result.eventCount,1);
  assert.equal(result.path,'public/verified-event-facets.json');
  const bytes=await readFile(join(rootDir,result.path));
  assert.equal(result.sha256,digest(bytes));
  const out=JSON.parse(bytes);
  assert.equal(out.publication,'verified-feed');
  assert.equal(out.events[0].benefits[0].sourceRefs[0].url,'https://pokemongo.com/news/synthetic/');
  assert.ok(!bytes.toString().includes('session_secret'));
  assert.ok(!bytes.toString().includes('privateReviewerEmail'));
  assert.ok(!bytes.toString().includes('internalCredential'));
  assert.deepEqual(await readdir(join(rootDir,'public')),['verified-event-facets.json']);
}));
test('changed private file or untrusted hash leaves previous public last-good untouched',async()=>sandbox(async rootDir=>{
  const hash=await seed(rootDir);
  const accepted={'synthetic:global.2026':hash};
  await publishApprovedFacetFeed({rootDir,expectedSha256ByEvent:accepted});
  const target=join(rootDir,'public','verified-event-facets.json'),before=await readFile(target);
  await seed(rootDir,{...verified(),benefits:[]});
  await assert.rejects(publishApprovedFacetFeed({rootDir,expectedSha256ByEvent:accepted}),/SHA mismatch/);
  assert.deepEqual(await readFile(target),before);
}));
test('unverified snapshots, absent pins and malformed source records cannot publish',async()=>sandbox(async rootDir=>{
  const hash=await seed(rootDir,{...verified(),publication:'review-candidate'});
  await assert.rejects(publishApprovedFacetFeed({rootDir,expectedSha256ByEvent:{'synthetic:global.2026':hash}}),/Unverified/);
  await assert.rejects(publishApprovedFacetFeed({rootDir,expectedSha256ByEvent:{}}),/Nonempty/);
  await assert.rejects(publishApprovedFacetFeed({rootDir,expectedSha256ByEvent:{'../public':'f'.repeat(64)}}),/Nonempty/);
  await assert.rejects(publishApprovedFacetFeed({rootDir,expectedSha256ByEvent:{'synthetic:global.2026':'wrong'}}),/Nonempty/);
  const bad={...verified(),benefits:[{...benefit,sourceRefs:[{
    sourceId:'official',url:'https://pokemongo.com.attacker.example/token',section:'Fake'
  }]}]};
  const badHash=await seed(rootDir,bad);
  await assert.rejects(publishApprovedFacetFeed({rootDir,expectedSha256ByEvent:{'synthetic:global.2026':badHash}}),/Invalid source provenance/);
  await assert.rejects(readFile(join(rootDir,'public','verified-event-facets.json')),/ENOENT/);
}));
test('unreviewed research rewards must not appear in the public projection',async()=>sandbox(async rootDir=>{
  const v=verified();
  v.researchPrograms=[{id:'ticket-story',status:'source-claimed',access:'ticket',
    kind:'special',title:'Synthetic Ticket Story',sourceRefs:[source],
    steps:[{step:1,outOf:6,title:'Stage 1',taskRewardEvidence:'unverified-reward'}]}];
  const hash=await seed(rootDir,v);
  await assert.rejects(publishApprovedFacetFeed({rootDir,expectedSha256ByEvent:{'synthetic:global.2026':hash}}),/Unreviewed research reward/);
}));
