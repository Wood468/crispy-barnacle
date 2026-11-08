import test from 'node:test';
import assert from 'node:assert/strict';
import {variantKey,resolveVariantArtwork} from '../scripts/variant-artwork.mjs';
const normal={dex:25};
const key=variantKey(normal);
const manifest={[key]:{url:'https://example.org/pikachu.png',status:'approved',source:'verified'}};
test('normal approved artwork resolves exactly',()=>assert.equal(resolveVariantArtwork(manifest,normal).kind,'exact'));
test('shadow falls back only to labelled species artwork',()=>{
 const x=resolveVariantArtwork(manifest,{dex:25,kind:'shadow'});
 assert.equal(x.kind,'species-fallback');assert.equal(x.treatment,'shadow');
});
test('dynamax falls back only to labelled species artwork',()=>{
 const x=resolveVariantArtwork(manifest,{dex:25,kind:'dynamax'});
 assert.equal(x.treatment,'dynamax');
});
test('gigantamax never substitutes regular form',()=>assert.equal(resolveVariantArtwork(manifest,{dex:25,kind:'gigantamax'}).kind,'missing'));
test('costume never substitutes regular form',()=>assert.equal(resolveVariantArtwork(manifest,{dex:25,kind:'costume',costume:'sun-crown'}).kind,'missing'));
test('unapproved and insecure exact art are ignored',()=>{
 const k=variantKey({dex:25,kind:'gigantamax'});
 assert.equal(resolveVariantArtwork({...manifest,[k]:{url:'http://example.org/a.png',status:'approved'}},{dex:25,kind:'gigantamax'}).kind,'missing');
});
test('costume code is mandatory',()=>assert.throws(()=>variantKey({dex:25,kind:'costume'})));
