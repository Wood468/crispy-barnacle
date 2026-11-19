import test from 'node:test';
import assert from 'node:assert/strict';
import { officialSkuImage, imageUrls, diffStore, buildMessages, storeLog, storeCurrentSnapshot } from '../scripts/store-watch.mjs';

const BASE = 'https://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/';
const IMAGE = BASE + 'bundle3.sprite.a-da6f21e79d79/w256.webp';
const FRESH = '2026-11-17T00:00:00.000Z';
const offer = (id, imgs) => ({
  href: '/purchase/item/' + id, name: 'GO Pass Deluxe ' + id, section: 'LIMITED_TIME',
  price: '$9.99', imgs
});
const cards = (imgs) => [offer('real-pass', imgs),
  {href:'/purchase/item/pad-a', name:'Pad A', section:'ITEMS', price:'$1.00'},
  {href:'/purchase/item/pad-b', name:'Pad B', section:'ITEMS', price:'$1.00'}];

test('only official SKU asset paths survive URL parsing (not a whole-host/image suffix guess)', () => {
  for (const size of ['64', '128', '256', '512']) {
    const valid = BASE + 'item_incubator_basic-12b107ebf517/w' + size + '.webp';
    assert.equal(officialSkuImage(valid), valid);
  }
  for (const bad of [
    '', null, 10, {}, 'https://example.com/photo.webp',
    'https://assets.pgo.webstore.nianticlabs.com.evil.example/pgo/image_variants/v1/sku_assets/x/w256.webp',
    'https://user:password@assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/x/w256.webp',
    'http://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/x/w256.webp',
    BASE + 'item/w256.webp?user=private',
    BASE + 'item/w256.webp#tracking-fragment',
    BASE + 'item/w1024.webp', BASE + 'item/w256.png',
    'https://assets.pgo.webstore.nianticlabs.com/pgo/account/avatar.webp',
    'https://cdn.discordapp.com/attachments/private/token.webp',
    'https://assets.pgo.webstore.nianticlabs.com@evil.example/pgo/image_variants/v1/sku_assets/x/w256.webp',
    'javascript:alert(1)', '/pgo/image_variants/v1/sku_assets/x/w256.webp'
  ]) assert.equal(officialSkuImage(bad), null, String(bad));
});

test('mixed or malformed image lists keep exactly the sanctioned assets', () => {
  const imgs = ['https://tracker.example/record.webp', IMAGE,
    BASE + 'item_incubator_basic/w128.webp', IMAGE + '?token=private'];
  assert.deepEqual(imageUrls({ imgs }), [IMAGE, BASE + 'item_incubator_basic/w128.webp']);
  assert.deepEqual(imageUrls({imgs:'not-an-array'}), []);
  assert.deepEqual(imageUrls(null), []);
});

test('Telegram new-offer notifications cannot upload remote tracker or private media URLs', () => {
  const untrusted = offer('untrusted', ['https://cdn.discordapp.com/private/secret.webp']);
  const valid = offer('valid', ['https://tracking.example/a.webp', IMAGE]);
  const messages = buildMessages({first:false,added:[untrusted, valid],changed:[]});
  assert.equal(messages.length, 2);
  assert.equal(messages[0].photo, '');
  assert.equal(messages[1].photo, IMAGE);
  assert.equal(messages[0].url, 'https://store.pokemongo.com/purchase/item/untrusted');
});

test('public current snapshot and historical Store log revalidate legacy images', () => {
  // Prior private state may be from a looser collector. Do not leak its source
  // images into a public JSON response or historical archived product record.
  const state = {
    updated:FRESH, watchStart:FRESH,
    items:{'/purchase/item/current-pass':{
      name:'GO Pass Deluxe Current', images:['https://tracker.example/a.webp', IMAGE],
      price:'$9.99', section:'LIMITED_TIME', lastSeen:FRESH
    }},
    gone:{'/purchase/item/retired-pass':{
      name:'GO Pass Deluxe Retired', images:['https://cdn.discordapp.com/private/secret.webp'],
      price:'$8.99', section:'LIMITED_TIME', lastSeen:FRESH, goneAt:FRESH
    }}
  };
  const snap = storeCurrentSnapshot(state), log = storeLog(state);
  assert.equal(snap.items[0].image, IMAGE);
  assert.equal(snap.gone[0].image, null);
  assert.equal(log.items[0].image, IMAGE);
  assert.equal(log.items[0].imageStatus, 'unverified-remote', 'exact URL is not evidence it currently decodes');
  assert.equal(log.items[1].image, null);
  assert.equal(log.items[1].imageStatus, 'missing');
  assert.equal(log.items[1].goneAt, FRESH, 'retirement evidence is unchanged');
  assert.ok(!JSON.stringify([snap, log]).includes('tracker.example'));
  assert.ok(!JSON.stringify([snap, log]).includes('cdn.discordapp.com'));
  assert.equal(state.items['/purchase/item/current-pass'].images[0], 'https://tracker.example/a.webp',
    'read-only public output must not mutate original state');
});

test('malicious image does not suppress a valid Store price or invent a product image', () => {
  const observed = diffStore(null, {items:cards(['https://tracker.example/collect?token=private'])}, FRESH);
  assert.equal(observed.held, undefined);
  assert.equal(observed.added.length, 3);
  const item = observed.state.items['/purchase/item/real-pass'];
  assert.equal(item.price, '$9.99');
  assert.deepEqual(item.images, []);
  const published = storeLog(observed.state).items[0];
  assert.equal(published.image, null);
  assert.equal(published.price, '$9.99');
  assert.equal(published.imageStatus, 'missing');
  assert.equal(observed.state.updated, FRESH);
});

test('official product artwork is retained unchanged through ingest and both public exports', () => {
  const observed = diffStore(null, {items:cards([IMAGE])}, FRESH);
  const published = storeLog(observed.state).items[0];
  const snapshot = storeCurrentSnapshot(observed.state).items[0];
  assert.equal(published.image, IMAGE);
  assert.equal(snapshot.image, IMAGE);
  assert.equal(published.imageStatus, 'unverified-remote');
  assert.equal(snapshot.name, published.name);
  assert.equal('price' in snapshot, false, 'public source snapshot must never expose a regional price');
});
