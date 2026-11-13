/*
 * Opt-in durable local release controller for Sprint 4 verified event facets.
 *
 * This NEVER deploys or runs from importer cron. Caller-owned credentials
 * (pinned Ed25519 key, canonical event IDs, independently authenticated
 * private writer receipts and exact CI-tested commit) must come from a trusted
 * release workflow. The filesystem lock is local; a distributed deployment
 * lock and production smoke/rollback verification remain the caller's job.
 *
 * Interrupted / failed promotion leaves a durable PENDING intent and fails
 * closed on subsequent calls until a human/operator reconciles the disk and
 * replay ledger. NEVER automatically clear an uncertain release.
 */
import {mkdir,open,readFile,rename,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {facetPromotionManifestMessage} from './source-facet-promotion-manifest.mjs';
import {preflightFacetPromotion} from './source-facet-promotion-preflight.mjs';
import {publishApprovedFacetFeed} from './source-facet-public-feed.mjs';

const HASH=/^[a-f0-9]{64}$/;
const RELEASE=/^[a-z0-9][a-z0-9_-]{7,99}$/i;
const sha256=value=>createHash('sha256').update(value).digest('hex');
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const validIso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&
  new Date(value).toISOString()===value;
const freshLedger=()=>({schemaVersion:1,publication:'promotion-ledger',
  releases:[],pending:null});
function validateLedger(ledger){
  if(!plain(ledger)||ledger.schemaVersion!==1||
     ledger.publication!=='promotion-ledger'||!Array.isArray(ledger.releases)||
     ledger.releases.length>10000||
     !(ledger.pending===null||plain(ledger.pending)))
    throw new TypeError('Untrusted or invalid durable promotion ledger');
  const ids=new Set();
  for(const item of ledger.releases){
    if(!plain(item)||!RELEASE.test(item.releaseId||'')||
       !/^[a-f0-9]{40}$/.test(item.commitSha||'')||
       !HASH.test(item.feedSha256||'')||!validIso(item.promotedAt)||
       ids.has(item.releaseId))
      throw new TypeError('Invalid or duplicate completed release record');
    ids.add(item.releaseId);
  }
  if(ledger.pending!==null){
    const p=ledger.pending;
    if(!RELEASE.test(p.releaseId||'')||
       !HASH.test(p.manifestSha256||'')||
       !(p.previousFeedSha256===null||HASH.test(p.previousFeedSha256||''))||
       !validIso(p.startedAt)||ids.has(p.releaseId))
      throw new TypeError('Invalid pending promotion state');
  }
  return ledger;
}
async function readLedger(path){
  try{
    const bytes=await readFile(path);
    if(bytes.length>2*1024*1024)throw new TypeError('Promotion ledger exceeds size limit');
    return validateLedger(JSON.parse(bytes.toString('utf8')));
  }catch(e){
    if(e?.code==='ENOENT')return freshLedger();
    throw e;
  }
}
async function writeLedger(path,ledger){
  validateLedger(ledger);
  const bytes=JSON.stringify(ledger,null,2)+'\n';
  if(Buffer.byteLength(bytes)>2*1024*1024)
    throw new TypeError('Promotion ledger exceeds size limit');
  const temp=path+'.'+randomBytes(12).toString('hex')+'.tmp';
  let done=false;
  try{
    const f=await open(temp,'wx',0o600);
    try{await f.writeFile(bytes,'utf8');await f.sync()}
    finally{await f.close()}
    await rename(temp,path);
    done=true;
  }finally{
    if(!done)try{await unlink(temp)}catch{}
  }
}
/**
 * Caller explicitly opts into a local public-feed write with allowLocalWrite.
 * This option is a safety switch, not an authentication credential.
 *
 * All auth rests on the out-of-band trusted key, canonical catalogue and
 * signed writer receipts checked by preflight. Returned success means local
 * public JSON + replay ledger were written, NOT that a site was deployed.
 */
export async function commitFacetPromotion(manifest,signature,{
  rootDir,allowLocalWrite=false,trustedReleasePublicKey,environment,
  trustedCommitSha,now,trustedCanonicalEventIds,trustedPrivateReceipts
}={}){
  if(allowLocalWrite!==true||typeof rootDir!=='string'||!rootDir.trim())
    throw new TypeError('Explicit trusted local publish authorization required');
  const root=resolve(rootDir);
  const dir=join(root,'data','verified-event-facets');
  await mkdir(dir,{recursive:true});
  const lockPath=join(dir,'promotion-controller.lock');
  const ledgerPath=join(dir,'promotion-ledger.json');
  let lock=null;
  try{
    // Concurrent local release attempts must not interleave ledger reads.
    // Never auto-remove a lock created by another process, even if stale.
    lock=await open(lockPath,'wx',0o600);
    const ledger=await readLedger(ledgerPath);
    if(ledger.pending!==null)
      throw new TypeError('Unreconciled pending promotion blocks all releases');
    const preflight=await preflightFacetPromotion(manifest,signature,{
      rootDir:root,trustedReleasePublicKey,environment,trustedCommitSha,now,
      trustedCanonicalEventIds,trustedPrivateReceipts,
      usedReleaseIds:ledger.releases.map(x=>x.releaseId)
    });
    const releaseId=preflight.releaseId;
    const intent={releaseId,
      manifestSha256:sha256(facetPromotionManifestMessage(manifest)),
      previousFeedSha256:preflight.expectedPreviousFeedSha256,
      startedAt:now};
    // Durable pending BEFORE any public writes. If exporter succeeds but the
    // completion ledger write fails, the pending marker prevents a replay.
    await writeLedger(ledgerPath,{...ledger,pending:intent});
    const output=await publishApprovedFacetFeed({
      rootDir:root,expectedSha256ByEvent:preflight.expectedSha256ByEvent,
      expectedPreviousFeedSha256:preflight.expectedPreviousFeedSha256
    });
    await writeLedger(ledgerPath,{
      ...ledger,
      releases:[...ledger.releases,{
        releaseId,commitSha:preflight.commitSha,
        feedSha256:output.sha256,promotedAt:now
      }],
      pending:null
    });
    return {schemaVersion:1,publication:'verified-feed',releaseId,
      eventCount:output.eventCount,feedSha256:output.sha256,
      path:output.path,localReleaseRecorded:true,
      productionDeploymentVerified:false};
  }finally{
    if(lock){
      try{await lock.close()}
      finally{try{await unlink(lockPath)}catch{}}
    }
  }
}
