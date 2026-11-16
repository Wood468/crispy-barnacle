import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {facetPromotionManifestMessage,verifyFacetPromotionManifest} from '../scripts/importer/source-facet-promotion-manifest.mjs';
const authority=generateKeyPairSync('ed25519');
const attacker=generateKeyPairSync('ed25519');
const pub=key=>key.publicKey.export({type:'spki',format:'pem'});
const sha='a'.repeat(64),other='b'.repeat(64);
const commit='c'.repeat(40);
const manifest=()=>({
  schemaVersion:1,publication:'promotion-manifest',releaseId:'s4-20261113-verified',
  environment:'production',commitSha:commit,issuedAt:'2026-11-13T04:00:00.000Z',
  expiresAt:'2026-11-13T04:20:00.000Z',expectedPreviousFeedSha256:null,
  events:[{eventId:'wild-area:global.2026',sha256:sha},
    {eventId:'other-event',sha256:other}]
});
const signature=(m,key=authority)=>sign(null,facetPromotionManifestMessage(m),key.privateKey).toString('base64');
const options={trustedReleasePublicKey:pub(authority),environment:'production',
  trustedCommitSha:commit,now:'2026-11-13T04:10:00.000Z'};
test('signed complete manifest returns only bounded hash pins with external gates',()=>{
  const m=manifest(),out=verifyFacetPromotionManifest(m,signature(m),options);
  assert.equal(out.publication,'audit-only');
  assert.equal(out.requiresDurableReplayCheck,true);
  assert.equal(out.requiresPrivateReceiptVerification,true);
  assert.equal(out.requiresCanonicalSourceLinkCheck,true);
  assert.deepEqual(out.expectedSha256ByEvent,{
    'other-event':other,'wild-area:global.2026':sha});
  assert.ok(!Object.hasOwn(out,'trustedReleasePublicKey'));
});
test('signature is deterministic for reordered event entries and rejects modifications',()=>{
  const m=manifest(),reordered={...m,events:[...m.events].reverse()};
  assert.deepEqual(facetPromotionManifestMessage(m),facetPromotionManifestMessage(reordered));
  const signed=signature(m);
  assert.equal(verifyFacetPromotionManifest(reordered,signed,options).releaseId,m.releaseId);
  assert.throws(()=>verifyFacetPromotionManifest({...m,events:[{...m.events[0],sha256:other},m.events[1]]},signed,options),/Invalid signed/);
  assert.throws(()=>verifyFacetPromotionManifest({...m,expectedPreviousFeedSha256:sha},signed,options),/Invalid signed/);
});
test('attacker key, untrusted environment, changed git commit and expiration fail closed',()=>{
  const m=manifest(),signed=signature(m);
  assert.throws(()=>verifyFacetPromotionManifest(m,signed,{...options,trustedReleasePublicKey:pub(attacker)}),/Invalid signed/);
  assert.throws(()=>verifyFacetPromotionManifest(m,signature(m,attacker),options),/Invalid signed/);
  assert.throws(()=>verifyFacetPromotionManifest(m,signed,{...options,environment:'staging'}),/Exact trusted/);
  assert.throws(()=>verifyFacetPromotionManifest(m,signed,{...options,trustedCommitSha:'d'.repeat(40)}),/Exact trusted/);
  assert.throws(()=>verifyFacetPromotionManifest(m,signed,{...options,now:m.expiresAt}),/outside validity/);
  assert.throws(()=>verifyFacetPromotionManifest(m,signed,{...options,now:'2026-11-13T03:59:59.000Z'}),/outside validity/);
  assert.throws(()=>verifyFacetPromotionManifest(m,signed,{...options,trustedReleasePublicKey:undefined}),/Pinned release/);
});
test('missing events, duplicate aliases, invalid IDs and long-lived approvals fail closed',()=>{
  const m=manifest();
  for(const edit of [
    {...m,events:[]},
    {...m,events:[m.events[0],m.events[0]]},
    {...m,events:[{eventId:'../secret',sha256:sha}]},
    {...m,expiresAt:'2026-11-14T04:20:00.000Z'},
    {...m,publicKey:'attacker'},
    {...m,events:[{...m.events[0],secret:'key'}]},
    {...m,events:[{eventId:'foo',sha256:'bad'}]}
  ])assert.throws(()=>facetPromotionManifestMessage(edit),/required|metadata|hashes/);
});
