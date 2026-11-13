/*
 * Verify a bounded, signed release manifest for a complete event-facet feed.
 * The release controller owns the trusted Ed25519 public key and compares the
 * exact CI-tested git head, environment, and current clock. This module has
 * no filesystem/network side effects and NEVER deploys or grants reviewer
 * identity; the controller must also verify its durable anti-replay ledger,
 * canonical source linking, CI and production release lock.
 */
import {createPublicKey,verify} from 'node:crypto';

const HASH=/^[a-f0-9]{64}$/;
const COMMIT=/^[a-f0-9]{40}$/;
const EVENT=/^[a-z0-9][a-z0-9:._-]{0,159}$/i;
const RELEASE=/^[a-z0-9][a-z0-9_-]{7,99}$/i;
const MAX_AGE_MS=60*60*1000;
const ORDERED=['eventId','sha256'];
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
function normalizedManifest(input){
  if(!record(input)||input.schemaVersion!==1||input.publication!=='promotion-manifest'||
     !RELEASE.test(input.releaseId||'')||!['production','staging'].includes(input.environment)||
     !COMMIT.test(input.commitSha||'')||
     !iso(input.issuedAt)||!iso(input.expiresAt)||
     !(input.expectedPreviousFeedSha256===null||HASH.test(input.expectedPreviousFeedSha256||''))||
     !Array.isArray(input.events)||input.events.length<1||input.events.length>300)
    throw new TypeError('Complete, bounded promotion manifest required');
  const keys=Object.keys(input).sort();
  if(keys.join('|')!==['commitSha','environment','events','expectedPreviousFeedSha256','expiresAt','issuedAt','publication','releaseId','schemaVersion'].join('|'))
    throw new TypeError('Unexpected promotion manifest metadata');
  const ids=new Set();
  const events=input.events.map(item=>{
    if(!record(item)||Object.keys(item).sort().join('|')!==ORDERED.join('|')||
       !EVENT.test(item.eventId||'')||!HASH.test(item.sha256||'')||
       ids.has(item.eventId))
      throw new TypeError('Unique canonical event release hashes required');
    ids.add(item.eventId);
    return {eventId:item.eventId,sha256:item.sha256};
  }).sort((a,b)=>a.eventId.localeCompare(b.eventId));
  const issued=Date.parse(input.issuedAt),expires=Date.parse(input.expiresAt);
  if(expires<=issued||expires-issued>MAX_AGE_MS)
    throw new TypeError('Bounded promotion manifest lifetime required');
  return {schemaVersion:1,publication:'promotion-manifest',releaseId:input.releaseId,
    environment:input.environment,commitSha:input.commitSha,
    issuedAt:input.issuedAt,expiresAt:input.expiresAt,
    expectedPreviousFeedSha256:input.expectedPreviousFeedSha256,
    events};
}
/** The domain-separated exact bytes that the release authority signs. */
export function facetPromotionManifestMessage(input){
  const m=normalizedManifest(input);
  return Buffer.from('go-field-notes:facet-promotion:v1\n'+JSON.stringify(m),'utf8');
}
/**
 * Verify against a release-controller PINNED public key. Do not take the key
 * from the signed manifest, an event source, or an end-user review decision.
 * trustedCommitSha must come from the completed CI/release pipeline.
 */
export function verifyFacetPromotionManifest(input,signature,{
  trustedReleasePublicKey,environment,trustedCommitSha,now
}={}){
  const m=normalizedManifest(input);
  if(!['production','staging'].includes(environment)||m.environment!==environment||
     !COMMIT.test(trustedCommitSha||'')||m.commitSha!==trustedCommitSha)
    throw new TypeError('Exact trusted environment and release commit required');
  if(!iso(now))throw new TypeError('Trusted current ISO time required');
  const current=Date.parse(now);
  if(current<Date.parse(m.issuedAt)||current>=Date.parse(m.expiresAt))
    throw new TypeError('Promotion manifest outside validity window');
  if(typeof trustedReleasePublicKey!=='string'||!trustedReleasePublicKey.trim())
    throw new TypeError('Pinned release public key required');
  const pub=createPublicKey(trustedReleasePublicKey);
  if(pub.asymmetricKeyType!=='ed25519')throw new TypeError('Pinned key must be Ed25519');
  if(typeof signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(signature))
    throw new TypeError('Exact Ed25519 release signature required');
  const bytes=Buffer.from(signature,'base64');
  if(bytes.length!==64||!verify(null,facetPromotionManifestMessage(m),pub,bytes))
    throw new TypeError('Invalid signed promotion manifest');
  // The caller must still reject reused releaseIds using its durable ledger
  // and must cross-check these hashes against signed private writer receipts.
  return {schemaVersion:1,publication:'audit-only',releaseId:m.releaseId,
    environment:m.environment,commitSha:m.commitSha,expiresAt:m.expiresAt,
    expectedPreviousFeedSha256:m.expectedPreviousFeedSha256,
    expectedSha256ByEvent:Object.fromEntries(m.events.map(e=>[e.eventId,e.sha256])),
    requiresDurableReplayCheck:true,requiresPrivateReceiptVerification:true,
    requiresCanonicalSourceLinkCheck:true};
}
