import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { OBSERVATIONS } from '../src/regional-observations.js';
// Runs the real public/store.js against a stub DOM: the owner view must render, including products with no Australian price.
test('owner Store view renders verified Indonesian prices and regional-only rows without throwing', async () => {
  const R = createRequire(import.meta.url)('../public/regional-prices.js');
  const el = { innerHTML: '', id: '', querySelector: () => null };
  const host = { parentNode: { insertBefore: (n) => { Object.assign(el, n); } } };
  const prices = { prices: [
    { product: 'store-x', label: 'Lucky Egg x8', group: 'Items', currency: 'AUD', amount: 7.99, region: 'AU', verified: true, observed: '2026-10-12' },
    { product: 'store-box-test', label: 'Ultra Training Box', group: 'Boxes', currency: 'AUD', amount: 46.99, region: 'AU', verified: true, observed: '2026-10-12' },
    { product: 'store-idr-legacy', label: 'GO Pass Deluxe', group: 'Tickets', currency: 'IDR', amount: 76000, region: 'ID', verified: true, observed: '2026-11-09' },
    { product: 'go-pass-oct-deluxe', currency: 'AUD', region: 'AU', amount: 12.99,
      verified: true, observed: '2026-10-12', url: 'https://store.pokemongo.com/' },
    { product: 'store-raid-day-a', label: 'Raid Day Box', group: 'Boxes', currency: 'AUD',
      region: 'AU', amount: 9.99, verified: true, observed: '2026-11-09' },
    { product: 'store-raid-day-b', label: 'Raid Day Box', group: 'Boxes', currency: 'AUD',
      region: 'AU', amount: 14.99, verified: true, observed: '2026-11-09' }
  ], regional: OBSERVATIONS.concat([{
    id: 'id-raid-day-test', product: 'Raid Day Box', kind: 'bundle', region: 'ID', channel: 'web',
    currency: 'IDR', amount: 50000, observed: '2026-11-09', source: 'fixture', status: 'verified'
  }]), owner: true };
  const win = { GORegionalPrices: R, GOLIB: { esc: s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'), loadPrices: () => Promise.resolve(prices), priceView: () => ({ sub: '', save: '', main: '' }) }, GODASH: {} };
  const doc = { readyState: 'complete', getElementById: id => id === 'evsource' ? host : id === 'storep-host' ? null : null, createElement: () => el, addEventListener() {} };
  Object.assign(win, { document: doc, localStorage: { getItem: () => null, setItem() {} }, console }); win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(fs.readFileSync(new URL('../public/store.js', import.meta.url), 'utf8'), ctx);
  await new Promise(r => setTimeout(r, 20));
  for (const t of ['Rp 76,000', 'Rp 101,000', 'Rp 126,000', 'Rp 41,000', 'Rp 10,000', 'Rp 200,000', 'Not observed', 'A$7.99', 'Indonesia', 'India'])
    assert.ok(el.innerHTML.includes(t), 'missing ' + t);
  assert.equal((el.innerHTML.match(/<summary>Regional Store prices/g) || []).length, 1,
    'one comprehensive regional comparison should be shown');
  assert.ok(!el.innerHTML.includes('Indonesia vs Australia'),
    'old legacy IDR summary must not repeat the regional price observations');
  assert.ok(el.innerHTML.includes('Not observed'), 'missing source prices should not look like zero or a calibration failure');
  assert.ok(el.innerHTML.includes('data-sp-search'), 'search appears ahead of the product cards');
  assert.ok(el.innerHTML.includes('sp-market-grid'), 'regional prices share one compact grid');
  assert.ok(el.innerHTML.includes('sp-market-au'), 'Australia price is visually grouped with the other regions');
  assert.ok(el.innerHTML.includes('data-sp-product'), 'each item renders once in the browseable catalogue');
  assert.ok(el.innerHTML.includes('go-pass-oct-deluxe'), 'verified official AU pass offer is not silently filtered out');
  assert.ok(el.innerHTML.includes('exact SKU; item name not recorded'),
    'unlabelled source offer cannot masquerade as a verified product name');
  assert.ok(el.innerHTML.includes('Distinct official SKU: store-raid-day-a'));
  assert.ok(el.innerHTML.includes('Distinct official SKU: store-raid-day-b'));
  assert.ok(el.innerHTML.includes('no exact AU SKU pairing established'),
    'the same-name Indonesian offer must not be attributed to either AU box');
  assert.equal((el.innerHTML.match(/Distinct official SKU: store-raid-day-/g)||[]).length,2);
  assert.equal((el.innerHTML.match(/Rp 50,000/g)||[]).length,1,
    'one regional observation cannot become two independently verified SKU prices');
  assert.doesNotMatch(el.innerHTML, /class="sp-product-group"/,
    'internal event-pass/sku classifier strings must not be exposed as product labels');
  assert.doesNotMatch(el.innerHTML, />event-pass-ranks-ultra</,
    'machine-readable product kind must not be visible in Store cards');
  const storeCss = fs.readFileSync(new URL('../public/dash.css', import.meta.url), 'utf8');
  const mobileCss = storeCss.slice(storeCss.lastIndexOf('/* Mobile Store QA: three tall'));
  assert.match(mobileCss, /@media\(max-width:659px\)/,
    'compact Store rows must apply at phone widths');
  assert.match(mobileCss, /\.storep-regional \.sp-market-grid\{display:grid;grid-template-columns:minmax\(0,1fr\);gap:0\}/,
    'phone catalogue must use stacked independent country rows, not equal-height three-column tiles');
  assert.match(mobileCss, /\.sp-market\+\.sp-market\{border-top:/,
    'country rows must have a visible separator without losing source-backed missing prices');

  assert.ok(el.innerHTML.includes('Advanced comparison'), 'cash/coin optimisation is disclosed only when requested');
  assert.ok(el.innerHTML.includes('Lowest verified observed options'));
  assert.ok(el.innerHTML.includes('Not a live checkout quote.'), 'price choice must be dated and qualified');
  assert.ok(!el.innerHTML.includes('cheapest:'), 'a regional comparison is not a guaranteed checkout price');
  assert.ok(!/undefined|NaN|\[object/.test(el.innerHTML));
  const positions = ['passes', 'storage', 'coins', 'boxes', 'items'].map(group => el.innerHTML.indexOf('data-sp-group="' + group + '"'));
  assert.ok(positions.every(pos => pos >= 0), 'Store must expose all five browsing categories');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions,
    'passes/tickets come first, followed by storage, coins, boxes and items');
  for (const group of ['passes', 'storage', 'coins'])
    assert.match(el.innerHTML, new RegExp('data-sp-group="' + group + '" data-sp-default-open="yes" open'),
      group + ' must be visible by default');
  for (const group of ['boxes', 'items'])
    assert.match(el.innerHTML, new RegExp('data-sp-group="' + group + '" data-sp-default-open="no"'),
      group + ' must remain browsable without a huge first scroll');
  assert.ok(el.innerHTML.includes('no sourced price for that region') && el.innerHTML.includes('Not observed'),
    'explain unobserved prices rather than presenting missing data as zero');
  assert.doesNotMatch(el.innerHTML, /src="\/ico\/(?:xp|egg|dust)\.webp"/,
    'XP, egg and Stardust images must not masquerade as Coins, Incubators or Star Pieces');
  assert.doesNotMatch(el.innerHTML, /src="\/ico\/g\/event\.webp"/,
    'generic event artwork must not masquerade as a particular Store box');
  assert.match(el.innerHTML, /class="sp-i-token"[^>]*>◎<\/span>/,
    'PokéCoin rows use a distinct neutral coin token rather than XP artwork');

});
