/*
 * Read-only preflight for the trusted, opt-in Sprint 4 release controller.
 *
 * The caller supplies an out-of-band pinned signer key, independently
 * authenticated private writer receipts, canonical event IDs, and a durable
 * used-release-ID ledger. None may be derived from untrusted event pages or
 * user-submitted manifest metadata. This function NEVER writes to public/.
 */
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyFacetPromotionManifest} from './source-facet-promotion-manifest.mjs';

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const HASH=/^[a-f0-9]{64}$/;
const ID=/^[a-z0-9][a-z0-9:._-]{0,159}$/i;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
/**
 * Purely verifies the release evidence and disk state in a single read-only
 * pass. Does NOT lock the files: the release controller must acquire the
 * exclusive deployment lock and recheck the same preflight immediately before
 * export. Public exporter separately performs final SHA/CAS checks.
 */
export async function preflightFacetPromotion(manifest,signature,{
  rootDir,trustedReleasePublicKey,environment,trustedCommitSha,now,
  trustedCanonicalEventIds,trustedPrivateReceipts,usedReleaseIds
}={}){
  const approval=verifyFacetPromotionManifest(manifest,signature,{
    trustedReleasePublicKey,environment,trustedCommitSha,now
  });
  if(typeof rootDir!=='string'||!rootDir.trim()||
     !Array.isArray(trustedCanonicalEventIds)||
     trustedCanonicalEventIds.some(id=>!ID.test(id))||
     new Set(trustedCanonicalEventIds).size!==trustedCanonicalEventIds.length||
     !plain(trustedPrivateReceipts)||
     !Array.isArray(usedReleaseIds)||usedReleaseIds.some(x=>typeof x!=='string'))
    throw new TypeError('Trusted canonical catalogue, private receipts and durable replay state required');
  if(usedReleaseIds.includes(approval.releaseId))
    throw new TypeError('Promotion release ID already used');
  const trustedIds=new Set(trustedCanonicalEventIds);
  const eventHashes=approval.expectedSha256ByEvent;
  const eventIds=Object.keys(eventHashes);
  if(eventIds.some(id=>!trustedIds.has(id)))
    throw new TypeError('Promotion contains unknown canonical event ID');
  const root=resolve(rootDir);
  for(const id of eventIds){
    const receipt=trustedPrivateReceipts[id];
    if(!plain(receipt)||!HASH.test(receipt.sha256||'')||
       !HASH.test(receipt.reviewFingerprint||'')||
       receipt.sha256!==eventHashes[id])
      throw new TypeError('Missing independently authenticated private writer receipt');
    const bytes=await readFile(join(root,'data','verified-event-facets',id+'.json'));
    if(bytes.length>1024*1024||sha256(bytes)!==receipt.sha256)
      throw new TypeError('Private snapshot changed after signed writer receipt');
    const doc=JSON.parse(bytes.toString('utf8'));
    if(!plain(doc)||doc.schemaVersion!==1||doc.publication!=='verified'||
       doc.eventId!==id||doc.reviewFingerprint!==receipt.reviewFingerprint||
       !Array.isArray(doc.benefits)||!Array.isArray(doc.featuredMoves)||
       !Array.isArray(doc.researchPrograms))
      throw new TypeError('Private snapshot not bound to independently reviewed event');
  }
  const publicPath=join(root,'public','verified-event-facets.json');
  let oldBytes=null;
  try{oldBytes=await readFile(publicPath)}
  catch(e){if(e?.code!=='ENOENT')throw e}
  const actual=oldBytes?sha256(oldBytes):null;
  if(actual!==approval.expectedPreviousFeedSha256)
    throw new TypeError('Public feed changed since signed promotion review');
  if(oldBytes){
    if(oldBytes.length>8*1024*1024)throw new TypeError('Existing public feed too large');
    const previous=JSON.parse(oldBytes.toString('utf8'));
    if(!plain(previous)||previous.schemaVersion!==1||
       previous.publication!=='verified-feed'||!Array.isArray(previous.events))
      throw new TypeError('Invalid existing public feed state');
    const previousIds=previous.events.map(x=>x?.eventId);
    if(previousIds.some(id=>!ID.test(id))||new Set(previousIds).size!==previousIds.length)
      throw new TypeError('Invalid prior public canonical event IDs');
    if(previousIds.some(id=>!Object.hasOwn(eventHashes,id)))
      throw new TypeError('Partial release would remove verified public events');
  }
  return {schemaVersion:1,publication:'audit-only',preflightPassed:true,
    releaseId:approval.releaseId,environment:approval.environment,
    commitSha:approval.commitSha,
    expectedSha256ByEvent:{...eventHashes},
    expectedPreviousFeedSha256:actual,
    eventCount:eventIds.length,
    requiresDeploymentLock:true,requiresDurableReplayCommit:true,
    requiresFinalExporterShaCheck:true};
}
