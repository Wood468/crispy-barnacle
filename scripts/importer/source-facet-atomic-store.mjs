/*
 * Atomic, private persistence for independently signed Sprint 4 event facets.
 *
 * Output is intentionally under data/verified-event-facets, NOT public/.
 * No service worker, website JSON, Cloudflare deploy, or automatic release is
 * triggered. Callers must supply an authenticated signing configuration and
 * the exact expected on-disk version under a single-event write lock.
 */
import {mkdir,open,readFile,rename,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {authorizeFacetSnapshot} from './source-facet-signed-release.mjs';
import {compareFacetSnapshotForReview} from './source-facet-snapshot-diff.mjs';
import {fingerprintFacetReview} from './source-facet-review-fingerprint.mjs';

const ID=/^[a-z0-9][a-z0-9:._-]{0,159}$/i;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>{
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(
    Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
};
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const absent=e=>e?.code==='ENOENT';
/**
 * @param {object} plan output of buildFacetReviewPlan
 * @param {object} authorization Ed25519 release and reviewer signatures, etc
 * @param {object} options rootDir is a trusted local repository root; expectedPreviousSha256
 *  must be null for creation or the last verified on-disk bytes SHA-256.
 */
export async function persistSignedFacetSnapshot(plan,authorization,{
  rootDir,expectedPreviousSha256=null,trustedKeys
}={}){
  if(!plan||!ID.test(plan.eventId)||typeof rootDir!=='string'||!rootDir.trim()||
      (expectedPreviousSha256!==null&&!/^[a-f0-9]{64}$/.test(expectedPreviousSha256)))
    throw new TypeError('Trusted root, safe event ID and expected snapshot SHA required');
  const dir=resolve(rootDir,'data','verified-event-facets');
  await mkdir(dir,{recursive:true});
  const target=join(dir,plan.eventId+'.json'),lockPath=target+'.lock';
  let lock,temporary;
  try{
    // Use a per-event exclusive file lock. A preexisting lock fails closed;
    // never time it out automatically or overwrite another live publisher.
    lock=await open(lockPath,'wx',0o600);
    await lock.writeFile(JSON.stringify({eventId:plan.eventId,pid:process.pid}));
    await lock.sync();
    let currentBytes=null,current=null;
    try{
      currentBytes=await readFile(target);
      if(currentBytes.length>1024*1024)throw new TypeError('Existing snapshot exceeds size limit');
      current=JSON.parse(currentBytes.toString('utf8'));
      if(!current||current.publication!=='verified'||current.schemaVersion!==1||
          current.eventId!==plan.eventId)
        throw new TypeError('Existing snapshot is not verified for this event');
    }catch(e){if(!absent(e))throw e}
    const actualHash=currentBytes?digest(currentBytes):null;
    if(actualHash!==expectedPreviousSha256)
      throw new TypeError('Verified snapshot changed since review');
    // The stored verified snapshot, not any caller-supplied "previous", is
    // the only basis for the deletion/semantic delta being signed.
    const currentDelta=compareFacetSnapshotForReview(current,plan.candidate);
    if(!equal(currentDelta,plan.changes))
      throw new TypeError('Review plan is stale against stored verified snapshot');
    const actualFingerprint=fingerprintFacetReview(plan.candidate,currentDelta);
    if(!equal(actualFingerprint,plan.fingerprint))
      throw new TypeError('Review fingerprint does not match stored snapshot');
    const verified=authorizeFacetSnapshot(plan,authorization,trustedKeys);
    const serialized=JSON.stringify(verified,null,2)+'\n';
    if(Buffer.byteLength(serialized)>1024*1024)
      throw new TypeError('Verified output exceeds size limit');
    temporary=join(dir,'.'+plan.eventId+'.'+randomBytes(12).toString('hex')+'.tmp');
    const file=await open(temporary,'wx',0o600);
    try{await file.writeFile(serialized,'utf8');await file.sync()}finally{await file.close()}
    await rename(temporary,target);
    temporary=null;
    return {eventId:plan.eventId,publication:'verified',
      previousSha256:actualHash,sha256:digest(Buffer.from(serialized)),
      file:'data/verified-event-facets/'+plan.eventId+'.json'};
  }finally{
    if(temporary)try{await unlink(temporary)}catch{}
    if(lock){
      try{await lock.close()}finally{try{await unlink(lockPath)}catch{}}
    }
  }
}
