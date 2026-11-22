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
const seen = '2026-11-13T08:00:30.934Z';
const image = 'https://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/bundle3.sprite.a-da6f21e79d79/w256.webp';
const row = (name, extras={}) => ({name, image, lastSeen:seen, endsAt:null, goneAt:null, ...extras});
const fixture = {version:1,updated:seen,
  items:['GO Pass Deluxe: November','GO Pass Deluxe: November Ultra Box',
    'GO Pass Deluxe: Into the Wild','GO Pass Deluxe: Into the Wild + 10 Ranks Ultra Box',
    '110 PokéCoins','Pokémon Storage','Lucky Egg'].map(name=>row(name)),
  gone:['GO Pass Deluxe: October','GO Pass Deluxe: October + 10 Ranks',
    'GO Pass Deluxe: October Ultra Box','GO Pass Deluxe: Fall Marathon',
    'GO Pass Deluxe: Fall Marathon + 6 Ranks'].map(name=>row(name,{goneAt:'2026-11-01T00:00:00Z'}))
};

test('snapshot is derived from official watcher and contains no checkout prices or owner records', () => {
  /* The Store watcher commits timestamp-only refreshes to main during a PR.
     Actions checks out the virtual PR merge, so current watched timestamps can
     be newer than the initial seeded snapshot while SKU truth is unchanged.
     Keep exact product/retirement/provenance parity; allow only fresh watcher
     metadata to advance without making every such refresh break PR CI. */
  const nonvolatile = value => ({
    ...value,
    updated: undefined,
    items: value.items.map(({ lastSeen, ...item }) => item),
    gone: value.gone.map(({ lastSeen, ...item }) => item)
  });
  assert.deepEqual(nonvolatile(snapshot), nonvolatile(storeCurrentSnapshot(state)));
  const lag = Date.parse(state.updated) - Date.parse(snapshot.updated);
  assert.ok(Number.isFinite(lag) && lag >= 0 && lag <= 7 * 86400000,
    'Source snapshot must have valid recent provenance; watcher may advance timestamps only');
  assert.ok(snapshot.items.length >= 1, 'source watcher must keep at least one observed item');
  assert.ok(Array.isArray(snapshot.gone));
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
    assert.equal(R.sourceOffer(name, fixture, NOW).status, 'archived', name);
  }
});

test('November, Into the Wild and standard coin pack are recently observed, never guaranteed buyable', () => {
  for (const name of ['GO Pass Deluxe: November', 'GO Pass Deluxe: November Ultra Box',
    'GO Pass Deluxe: Into the Wild', 'GO Pass Deluxe: Into the Wild + 10 Ranks Ultra Box',
    '110 PokéCoins']) {
    const result = R.sourceOffer(name, fixture, NOW);
    assert.equal(result.status, 'listed', name);
    assert.match(result.note, /Seen in|latest Store snapshot/i);
    assert.ok(result.image === null || R.sourceArt(result.image), 'only a strictly validated exact-offer Niantic image (owner-approved 15 Nov 2026) or none');
  }
});

test('matching an item-family icon never conflates distinct store variants for availability', () => {
  const storage = R.sourceOffer('Pokémon Storage +1', fixture, NOW);
  assert.equal(storage.status, 'unconfirmed');
  assert.equal(storage.image, null, 'item-family publisher art cannot be approved by name similarity');
  const lucky = R.sourceOffer('Lucky Egg x8', fixture, NOW);
  assert.equal(lucky.status, 'unconfirmed', 'item-family art does not prove the package SKU');
  assert.equal(lucky.image, null);
  const unknown = R.sourceOffer('Entirely New Mystery Ultra Box', fixture, NOW);
  assert.equal(unknown.status, 'unconfirmed');
  assert.equal(unknown.image, null);
});

test('expired purchase end and stale source never claim current listing', () => {
  const old = R.sourceOffer('GO Pass Deluxe: November', fixture, Date.parse('2026-12-03T00:00:00Z'));
  assert.equal(old.status, 'unconfirmed');
  const ended = { ...fixture, updated:'2026-11-14T00:00:00Z',
    items:[{ name:'Timed GO Pass', image:fixture.items[0].image, lastSeen:'2026-11-14T00:00:00Z',
      endsAt:'2026-11-13T00:00:00Z', goneAt:null }], gone:[] };
  assert.equal(R.sourceOffer('Timed GO Pass', ended, Date.parse('2026-11-14T12:00:00Z')).status,'archived');
  assert.equal(R.sourceOffer('Timed GO Pass', null, NOW).status,'unconfirmed');
});

test('stale removal evidence is unconfirmed, but a fresh watcher may retain an older confirmed removal', () => {
  const stale = { ...fixture, updated:'2026-10-20T00:00:00Z', items:[],
    gone:[row('GO Pass Deluxe: October', {goneAt:'2026-10-21T00:00:00Z'})] };
  assert.equal(R.sourceOffer('GO Pass Deluxe: October', stale, NOW).status, 'unconfirmed');
  assert.equal(R.sourceOffer('GO Pass Deluxe: October', fixture, NOW).status, 'archived');
  const missingRemovalDate = { ...fixture, items:[], gone:[row('GO Pass Deluxe: October')] };
  assert.equal(R.sourceOffer('GO Pass Deluxe: October', missingRemovalDate, NOW).status, 'unconfirmed');
});

test('duplicate product names cannot authorize ambiguous source SKUs', () => {
  const normal = R.sourceOffer('GO Pass Deluxe: November', fixture, NOW);
  assert.equal(normal.status,'listed');
  const ambiguous = R.sourceOffer('GO Pass Deluxe: November', fixture, NOW, {ambiguousSku:true});
  assert.equal(ambiguous.status,'unconfirmed');
  assert.match(ambiguous.note,/SKU\/contents are ambiguous/);
  assert.equal(ambiguous.image,null);
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

test('Niantic Store image host is allowed exactly once (owner-approved 15 Nov 2026) and only for the exact offer', () => {
  assert.equal(IMAGE_CSP_HOSTS.filter(origin => origin === 'https://assets.pgo.webstore.nianticlabs.com').length,1);
  assert.equal(R.sourceOffer('GO Pass Deluxe: November', fixture, NOW).image,image);
  assert.equal(R.sourceOffer('GO Pass Deluxe: November', fixture, NOW, {ambiguousSku:true}).image,null);
});

/* Staleness boundaries use a fixed injected clock (the third argument), never Date.now(). */
const CLOCK = Date.parse('2026-11-20T00:00:00Z');
const DAYMS = 86400000;
const snapAt = (updatedAgeMs, seenAgeMs) => ({version:1, updated:new Date(CLOCK-updatedAgeMs).toISOString(),
  items:[row('Timed Pass', {lastSeen:new Date(CLOCK-seenAgeMs).toISOString()})], gone:[]});

test('snapshot.updated freshness: day 6 and exactly 7 days are listed, just over 7 days is unconfirmed', () => {
  assert.equal(R.sourceOffer('Timed Pass', snapAt(6*DAYMS, 0), CLOCK).status, 'listed');
  assert.equal(R.sourceOffer('Timed Pass', snapAt(7*DAYMS, 0), CLOCK).status, 'listed');
  const over = R.sourceOffer('Timed Pass', snapAt(7*DAYMS+1, 0), CLOCK);
  assert.equal(over.status, 'unconfirmed');
  assert.match(over.note, /needs refreshing/);
});

test('lastSeen freshness: day 6 and exactly 7 days are listed, just over 7 days is unconfirmed', () => {
  assert.equal(R.sourceOffer('Timed Pass', snapAt(0, 6*DAYMS), CLOCK).status, 'listed');
  assert.equal(R.sourceOffer('Timed Pass', snapAt(0, 7*DAYMS), CLOCK).status, 'listed');
  const over = R.sourceOffer('Timed Pass', snapAt(0, 7*DAYMS+1), CLOCK);
  assert.equal(over.status, 'unconfirmed');
  assert.match(over.note, /stale/);
});

test('a snapshot or observation dated in the future never confirms a listing', () => {
  assert.equal(R.sourceOffer('Timed Pass', snapAt(-1, 0), CLOCK).status, 'unconfirmed');
  assert.equal(R.sourceOffer('Timed Pass', snapAt(0, -1), CLOCK).status, 'unconfirmed');
});

test('generic unmatched future offer stays visible, unpriced and unconfirmed (not November-specific)', () => {
  const future = {id:'official:test-future-box', label:'Future Event Mystery Box', group:'Passes & tickets',
    contents:[{item:'Mystery Item', quantity:1}], sourceUrl:'https://pokemongo.com/news/future-event-mystery-box',
    sourceCheckedAt:'2026-11-19', regionAvailability:'unknown', noPriceObservation:true};
  const rows = R.catalogue([], [], CLOCK, [future]);
  const found = rows.find(x => x.label === 'Future Event Mystery Box');
  assert.ok(found, 'unmatched offer is not dropped');
  assert.equal(found.unpricedOfficial, true);
  assert.ok(!found.aud, 'no invented AU price');
  assert.ok(!found.indonesia && !found.india, 'no regional price or estimate without a matching comparable');
  assert.equal(R.sourceOffer('Future Event Mystery Box', fixture, CLOCK).status, 'unconfirmed');
});
