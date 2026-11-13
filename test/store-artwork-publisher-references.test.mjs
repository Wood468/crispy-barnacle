import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const data=JSON.parse(readFileSync(new URL('../data/store-artwork-publisher-references.json',import.meta.url),'utf8'));
const CDN='assets.pgo.webstore.nianticlabs.com';
const prefix='/pgo/image_variants/v1/sku_assets/';

test('official item image observations are strict publisher references, never approval or prices',()=>{
  assert.equal(data.schemaVersion,1);
  assert.match(data.observedDate,/^20\\d{2}-\\d{2}-\\d{2}$/);
  assert.equal(data.sourcePage,'https://store.pokemongo.com/?hl=en_us');
  assert.equal(data.runtimeUseAuthorized,false);
  assert.equal(data.approvedImages,0);
  assert.match(data.rightsNotice,/permission is NOT established/);
  assert.equal(data.entries.length,11);
  const ids=new Set(),urls=new Set();
  for(const item of data.entries){
    assert.match(item.id,/^[a-z0-9-]+$/);
    assert.ok(!ids.has(item.id),'duplicate item id: '+item.id);
    ids.add(item.id);
    assert.equal(typeof item.item,'string');
    assert.equal(item.publisherImageAlt,item.item,'official alt must name exactly one item');
    assert.equal(item.listingEvidence,data.sourcePage);
    const url=new URL(item.publisherImageUrl);
    assert.equal(url.protocol,'https:');
    assert.equal(url.hostname,CDN);
    assert.equal(url.username,'');
    assert.equal(url.password,'');
    assert.equal(url.port,'');
    assert.equal(url.search,'');
    assert.equal(url.hash,'');
    assert.ok(url.pathname.startsWith(prefix),'unexpected publisher image path');
    assert.match(url.pathname,/\\/w128\\.webp$/);
    assert.ok(!urls.has(item.publisherImageUrl),'duplicate source icon URL');
    urls.add(item.publisherImageUrl);
    assert.equal(item.visualStatus,'publisher-listing-observed');
    assert.equal(item.rightsStatus,'not-cleared');
    assert.equal(item.deliveryStatus,'not-reviewed');
    assert.equal(item.approvedForRuntime,false);
    for(const forbidden of ['amount','price','currency','regionCheckout','skuJoin'])
      assert.ok(!Object.hasOwn(item,forbidden),'image evidence must not imply regional prices or SKU joins');
  }
  for(const id of ['remote-raid-pass','premium-battle-pass','egg-incubator','super-incubator',
                   'pokemon-storage','item-bag','max-mushroom','max-particle-pack'])
    assert.ok(ids.has(id),'exact distinct item source not reviewed: '+id);
  assert.ok(!ids.has('pokecoin'),'pack art cannot be represented as a universal coin icon');
});

test('publisher image references cannot silently enter the Store or browser CSP',()=>{
  const store=readFileSync(new URL('../public/store.js',import.meta.url),'utf8');
  const csp=readFileSync(new URL('../src/image-policy.js',import.meta.url),'utf8');
  for(const entry of data.entries)
    assert.ok(!store.includes(entry.publisherImageUrl),'unapproved asset used by Store: '+entry.id);
  assert.ok(!csp.includes(CDN),'source review alone must not silently broaden image CSP');
});
