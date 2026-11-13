import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { storeCurrentSnapshot } from '../scripts/store-watch.mjs';
import { IMAGE_CSP_HOSTS } from '../src/image-policy.js';
const require = createRequire(import.meta.url);
const R = require('../public/regional-prices.js');
const snapshot = JSON.parse(readFileSync(new URL('../public/store-current-snapshot.json', import.meta.url)));
const state = JSON.parse(readFileSync(new URL('../data/store-state.json', import.meta.url)));
const NOW = Date.parse('2026-11-14T00:00:00+11:00');

test('snapshot is derived from official watcher and contains no checkout prices or owner records', () => {
  assert.deepEqual(snapshot, storeCurrentSnapshot(state));
  assert.equal(snapshot.items.length, 35);
  assert.ok(snapshot.gone.length >= 10);
  for (const item of snapshot.items.concat(snapshot.gone)) {
    assert.equal(item.image === null || R.sourceArt(item.image), true);
    assert.ok(item.href === null || /^\/purchase\/item\/[a-z0-9_.-]+$/i.test(item.href));
    assert.equal('price' in item, false);
    assert.equal('amount' in item, false);
    assert.equal('currency' in item, false);
    assert.equal('owner' in item, false);
  }
});

test('retired October and Fall Marathon offers are historical, not current listings', () => {
  for (const name of ['GO Pass Deluxe: October', 'GO Pass Deluxe: October + 10 Ranks',
    'GO Pass Deluxe: October Ultra Box', 'GO Pass Deluxe: Fall Marathon',
    'GO Pass Deluxe: Fall Marathon + 6 Ranks']) {
    assert.equal(R.sourceOffer(name, snapshot, NOW).status, 'archived', name);
  }
});

test('November, Into the Wild and standard coin pack are recently observed, never guaranteed buyable', () => {
  for (const name of ['GO Pass Deluxe: November', 'GO Pass Deluxe: November Ultra Box',
    'GO Pass Deluxe: Into the Wild', 'GO Pass Deluxe: Into the Wild + 10 Ranks Ultra Box',
    '110 PokéCoins']) {
    const result = R.sourceOffer(name, snapshot, NOW);
    assert.equal(result.status, 'listed', name);
    assert.match(result.note, /Seen in|latest Store snapshot/i);
    assert.ok(R.sourceArt(result.image), name);
  }
});

test('matching an item-family icon never conflates distinct store variants for availability', () => {
  const storage = R.sourceOffer('Pokémon Storage +1', snapshot, NOW);
  assert.equal(storage.status, 'unconfirmed');
  assert.ok(R.sourceArt(storage.image), 'exact storage item art may decorate an unconfirmed pack');
  const lucky = R.sourceOffer('Lucky Egg x8', snapshot, NOW);
  assert.equal(lucky.status, 'unconfirmed', 'item-family art does not prove the package SKU');
  assert.ok(R.sourceArt(lucky.image));
  const unknown = R.sourceOffer('Entirely New Mystery Ultra Box', snapshot, NOW);
  assert.equal(unknown.status, 'unconfirmed');
  assert.equal(unknown.image, null);
});

test('expired purchase end and stale source never claim current listing', () => {
  const old = R.sourceOffer('GO Pass Deluxe: November', snapshot, Date.parse('2026-12-03T00:00:00Z'));
  assert.equal(old.status, 'unconfirmed');
  const ended = { ...snapshot, updated:'2026-11-14T00:00:00Z',
    items:[{ name:'Timed GO Pass', image:snapshot.items[0].image, lastSeen:'2026-11-14T00:00:00Z',
      endsAt:'2026-11-13T00:00:00Z', goneAt:null }], gone:[] };
  assert.equal(R.sourceOffer('Timed GO Pass', ended, Date.parse('2026-11-14T12:00:00Z')).status,'archived');
  assert.equal(R.sourceOffer('Timed GO Pass', null, NOW).status,'unconfirmed');
});

test('safe art requires the exact official asset URL host; no tracking or injected URLs', () => {
  assert.equal(R.sourceArt('https://evil.example/pgo/image_variants/v1/sku_assets/foo/w256.webp'),false);
  assert.equal(R.sourceArt('javascript:alert(1)'),false);
  assert.equal(R.sourceArt('https://assets.pgo.webstore.nianticlabs.com.evil.com/a/w256.webp'),false);
});

test('owner baseline supports only labelled same-tier pass models for newly announced offers', async () => {
  const { OBSERVATIONS } = await import('../src/regional-observations.js');
  const offers = require('../public/store-offer-identities.js');
  const rows = R.catalogue([], OBSERVATIONS, NOW, offers);
  const november = rows.find(x => x.label === 'GO Pass Deluxe: November');
  assert.ok(november && november.unpricedOfficial);
  assert.equal(november.indonesia?.basis,'estimate');
  assert.equal(november.indonesia?.currency,'IDR');
  assert.equal(november.indonesia?.confidence,'low');
  assert.ok(november.indonesia.min > 0 && november.indonesia.max > november.indonesia.min);
  assert.equal(november.india,null,'a different in-app event-pass tier must not price the monthly tier');
  const ranks = rows.find(x => x.label === 'GO Pass Deluxe: November + 10 Ranks');
  assert.equal(ranks.indonesia,null,'no matching monthly rank-tier observation exists');
});

test('India in-app coin packs are recorded separately from AU Web packs and never invented as matching SKU', async () => {
  const { OBSERVATIONS } = await import('../src/regional-observations.js');
  const indian = OBSERVATIONS.filter(x => x.region === 'IN' && x.kind === 'coins');
  assert.deepEqual(indian.map(x => x.amount),[29,149,289,589,1169,2899]);
  assert.ok(indian.every(x => x.channel === 'in-app' && x.status === 'recorded'));
  assert.ok(indian.every(x => /\+ \d+ in-app bonus/.test(x.product)));
  assert.equal(OBSERVATIONS.find(x => x.id === 'in-itw-ticket')?.amount,349);
  assert.equal(OBSERVATIONS.find(x => x.id === 'in-itw-deluxe')?.amount,439);
});

test('exact official artwork CDN is image-only allowlisted, without wildcard hosts', () => {
  assert.ok(IMAGE_CSP_HOSTS.includes('https://assets.pgo.webstore.nianticlabs.com'));
  assert.ok(!IMAGE_CSP_HOSTS.some(host => host.includes('*')));
});
