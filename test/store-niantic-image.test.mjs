import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { IMAGE_CSP_HOSTS } from '../src/image-policy.js';
import { SECURITY_HEADERS } from '../src/worker.js';

/* Owner approval (15 Nov 2026): Store cards may load the exact item image from Niantic's Store CDN.
   This is the ONLY CSP change; every other directive and image origin stays as it was. */
const require = createRequire(import.meta.url);
const R = require('../public/regional-prices.js');
const source = fs.readFileSync(new URL('../public/store.js', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const snapshotFile = JSON.parse(fs.readFileSync(new URL('../public/store-current-snapshot.json', import.meta.url), 'utf8'));
const HOST = 'https://assets.pgo.webstore.nianticlabs.com';
const GOOD = HOST + '/pgo/image_variants/v1/sku_assets/item_max_revive-7998834abd5d/w256.webp';

const BASELINE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://play.pokemonshowdown.com https://archives.bulbagarden.net https://static.pokebattler.com https://leekduck.com https://cdn.leekduck.com https://lh3.googleusercontent.com https://storage.googleapis.com; connect-src 'self' https://open.er-api.com/v6/latest/AUD; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

test('CSP differs from the previous policy only by the one Niantic Store image host in img-src', () => {
  const csp = SECURITY_HEADERS['content-security-policy'];
  assert.equal(csp, BASELINE_CSP.replace('https://storage.googleapis.com;', 'https://storage.googleapis.com ' + HOST + ';'));
  assert.equal(csp.split(HOST).length - 1, 1, 'host appears exactly once');
  const img = csp.split(';').map(x => x.trim()).find(x => x.startsWith('img-src '));
  assert.ok(img.split(' ').includes(HOST));
  assert.equal(IMAGE_CSP_HOSTS.filter(h => h === HOST).length, 1);
  assert.ok(!/\*/.test(csp) && !/nianticlabs/.test(csp.replace(img, '')), 'no wildcard; host in no other directive');
});

test('strict URL validator accepts every real snapshot image and rejects look-alikes', () => {
  const real = snapshotFile.items.map(i => i.image).filter(Boolean);
  assert.ok(real.length > 0);
  for (const url of real) assert.equal(R.sourceArt(url), true, url);
  const bad = [
    'https://assets.pgo.webstore.nianticlabs.com.evil.com/pgo/image_variants/v1/sku_assets/a/w256.webp',
    'https://evil.assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/a/w256.webp',
    'https://other.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/a/w256.webp',
    'http://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/a/w256.webp',
    'https://user@assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/a/w256.webp',
    'https://assets.pgo.webstore.nianticlabs.com@evil.com/pgo/image_variants/v1/sku_assets/a/w256.webp',
    'https://assets.pgo.webstore.nianticlabs.com:8443/pgo/image_variants/v1/sku_assets/a/w256.webp',
    'https://assets.pgo.webstore.nianticlabs.com/other/path/w256.webp',
    'https://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/../w256.webp',
    'https://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/a/w256.webp?track=1',
    'https://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/a/w256.webp#x',
    'javascript:alert(1)', 'data:image/png;base64,AAAA', '', null, undefined, 42,
    HOST + '/pgo/image_variants/v1/sku_assets/' + 'a'.repeat(400) + '/w256.webp'
  ];
  for (const url of bad) assert.equal(R.sourceArt(url), false, String(url));
});

const NOW = Date.now();
const iso = new Date(NOW).toISOString();
const snap = items => ({ version: 1, updated: iso, items, gone: [] });
async function render({ prices, snapshot }) {
  const handlers = {};
  const el = { innerHTML: '', id: '', querySelector: () => null, querySelectorAll: () => [],
    addEventListener: (n, fn) => { handlers[n] = fn; } };
  const host = { parentNode: { insertBefore: n => { Object.assign(el, n); } } };
  const data = { owner: true, prices, regional: [], storeSnapshot: snapshot };
  const win = { GORegionalPrices: R, GOStoreOfferIdentities: require('../public/store-offer-identities.js'),
    fetch: () => Promise.reject(Error('offline')),
    GOLIB: { esc: s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'),
      loadPrices: () => Promise.resolve(data), priceView: () => ({ sub: '', save: '', main: '' }) },
    GODASH: {}, localStorage: { getItem: () => null, setItem() {} }, console };
  win.document = { readyState: 'complete', getElementById: id => id === 'evsource' ? host : null,
    createElement: () => el, addEventListener() {} };
  win.window = win;
  vm.runInNewContext(source, win);
  await new Promise(r => setTimeout(r, 40));
  const cards = [...el.innerHTML.matchAll(/<article class="sp-product"[\s\S]*?<\/article>/g)].map(m => m[0]);
  return { cards, handlers };
}
const au = (product, label) => ({ product, label, group: 'Items', currency: 'AUD', amount: 4.99, region: 'AU', verified: true, observed: '2026-11-13' });
const named = (cards, n) => cards.find(c => c.includes('>' + n + '</b>'));

test('a card shows the snapshot image only for its exact matching offer, with lazy/async/no-referrer and a fixed box', async () => {
  const { cards } = await render({
    prices: [au('store-a', 'Fixture Gizmo'), au('store-b', 'Fixture Gizmo Deluxe'), au('store-c', 'Unlisted Thing')],
    snapshot: snap([{ name: 'Fixture Gizmo', image: GOOD, lastSeen: iso }, { name: 'Other Offer', image: GOOD, lastSeen: iso }]) });
  const hit = named(cards, 'Fixture Gizmo');
  assert.match(hit, /<img class="sp-i" src="https:\/\/assets\.pgo\.webstore\.nianticlabs\.com\/pgo\/image_variants\/v1\/sku_assets\/item_max_revive-7998834abd5d\/w256\.webp" alt="Fixture Gizmo" width="40" height="40" loading="lazy" decoding="async" referrerpolicy="no-referrer">/);
  assert.doesNotMatch(named(cards, 'Fixture Gizmo Deluxe'), /<img/, 'similar name never borrows an image');
  assert.doesNotMatch(named(cards, 'Unlisted Thing'), /<img|sp-i-token|data-sp-art/, 'no image => no placeholder');
});

test('invalid snapshot image URLs and ambiguous duplicates render nothing', async () => {
  const evil = 'https://assets.pgo.webstore.nianticlabs.com.evil.com/pgo/image_variants/v1/sku_assets/a/w256.webp';
  const { cards } = await render({
    prices: [au('store-a', 'Evil Offer'), au('store-b', 'Twin Offer')],
    snapshot: snap([{ name: 'Evil Offer', image: evil, lastSeen: iso },
      { name: 'Twin Offer', image: GOOD, lastSeen: iso }, { name: 'Twin Offer', image: GOOD, lastSeen: iso }]) });
  for (const c of cards) assert.doesNotMatch(c, /<img/);
});

test('local /ico exact art keeps priority over the remote image', async () => {
  const { cards } = await render({ prices: [au('store-m', 'Max Revive')],
    snapshot: snap([{ name: 'Max Revive', image: GOOD, lastSeen: iso }]) });
  const card = named(cards, 'Max Revive');
  assert.match(card, /src="\/ico\/i\/max-revive\.webp"/);
  assert.doesNotMatch(card, /nianticlabs/);
  assert.equal((card.match(/<img/g) || []).length, 1);
});

test('a failed remote image is removed without a placeholder', async () => {
  const { handlers } = await render({ prices: [au('store-a', 'Fixture Gizmo')],
    snapshot: snap([{ name: 'Fixture Gizmo', image: GOOD, lastSeen: iso }]) });
  let removed = 0, replaced = 0;
  handlers.error({ target: { matches: s => s === 'img.sp-i', remove: () => { removed++; }, replaceWith: () => { replaced++; } } });
  assert.equal(removed, 1); assert.equal(replaced, 0);
});

test('service worker leaves the Niantic CDN to the network and browser HTTP cache', () => {
  assert.ok(!/nianticlabs/.test(sw), 'no SW rule or cache for the Niantic host');
  assert.match(sw, /if \(url\.origin !== self\.location\.origin \|\| url\.pathname\.startsWith\('\/api\/'\)\) return;/,
    'cross-origin requests other than the Leek Duck banner rule are not intercepted');
});
