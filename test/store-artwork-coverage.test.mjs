import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {auditStoreArtwork,remoteAsset,iconPaths,validateIcon}
  from '../scripts/store-artwork-coverage.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const store=readFileSync(resolve(root,'public/store.js'),'utf8');
const log=JSON.parse(readFileSync(resolve(root,'public/store-log.json'),'utf8'));

test('only exact existing WebP icons are accepted, not misleading item substitutions',()=>{
  const paths=iconPaths(store);
  assert.equal(paths.length,8,'new mappings require an independently validated exact icon');
  for(const path of paths){
    const r=validateIcon(path);
    assert.equal(r.valid,true,path+' must be nonempty and contain real WebP bytes');
  }
  assert.deepEqual(validateIcon('/ico/egg.webp').valid,true);
  const modified=store.replace("'/ico/g/raidpass.webp'","'/ico/g/event.webp'");
  const unreviewed=auditStoreArtwork({source:modified,items:[]});
  assert.equal(unreviewed.counts.invalidLocalIcons,1,
    'generic event artwork cannot silently replace ordinary Raid Pass artwork');
  assert.equal(unreviewed.localIcons.find(x=>!x.valid).reason,
    'new exact-item artwork requires independent source/visual review');
  assert.equal(validateIcon('/ico/../../private.json').valid,false);
  assert.equal(validateIcon('/ico/i/definitely-missing-item.webp').valid,false);
  const missing=validateIcon('/ico/i/max-potion.webp',()=>false);
  assert.equal(missing.reason,'missing local file');
});

test('Store publisher URLs are treated as unapproved evidence, never verified product artwork',()=>{
  const valid='https://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/bundle3.sprite.a-da6f21e79d79/w256.webp';
  assert.equal(remoteAsset(valid),true);
  for(const wrong of [
    'http://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/x/w256.webp',
    'https://assets.pgo.webstore.nianticlabs.com.evil.example/pgo/image_variants/v1/sku_assets/x/w256.webp',
    'https://user@assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/x/w256.webp',
    'https://assets.pgo.webstore.nianticlabs.com/other/w256.webp',
    'https://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/x/w256.webp?token=abc'
  ])assert.equal(remoteAsset(wrong),false,wrong);
});

test('current Store snapshot reports uncaptured and reused SKU art without falsely approving it',()=>{
  const audit=auditStoreArtwork({source:store,items:log.items});
  assert.equal(audit.counts.listings,log.items.length);
  assert.equal(audit.counts.localExactIcons,8);
  assert.equal(audit.counts.invalidLocalIcons,0);
  assert.ok(audit.counts.remoteCandidates>0);
  assert.ok(audit.counts.missingOrRejected>0);
  assert.equal(audit.remoteListings.every(p=>p.status!=='verified'),true);
  const reused=audit.duplicateImages.find(p=>
    p.offers.filter(x=>x.name.includes('Into the Wild')).length>=3);
  assert.ok(reused,'a single safari box image is reused across distinct Into the Wild SKUs');
  assert.ok(new Set(reused.offers.map(x=>x.href)).size>=3);
  assert.ok(audit.remoteListings.some(x=>x.name==='GO Pass Deluxe: November'&&x.image));
});

test('spoofed or disconnected remote images are excluded from the review ledger',()=>{
  const url='https://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/example/w256.webp';
  const audit=auditStoreArtwork({source:store,items:[
    {name:'Trusted candidate',href:'/purchase/item/product-one',image:url},
    {name:'Unknown purchase slug',href:'/not-a-sale',image:url},
    {name:'Spoofed CDN',href:'/purchase/item/product-two',image:'https://assets.pgo.webstore.nianticlabs.com.evil.test/x'},
    {name:'No capture',href:'/purchase/item/product-three',image:null}
  ]});
  assert.equal(audit.counts.remoteCandidates,1);
  assert.equal(audit.counts.missingOrRejected,3);
  assert.equal(audit.counts.duplicateImageGroups,0);
  assert.equal(audit.invalid.length,2);
  assert.equal(audit.remoteListings[1].image,null);
});
