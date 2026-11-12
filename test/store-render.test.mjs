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
    { product: 'store-idr-legacy', label: 'GO Pass Deluxe', group: 'Tickets', currency: 'IDR', amount: 76000, region: 'ID', verified: true, observed: '2026-11-09' }
  ], regional: OBSERVATIONS, owner: true };
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
  assert.ok(el.innerHTML.includes('Advanced comparison'), 'cash/coin optimisation is disclosed only when requested');
  assert.ok(el.innerHTML.includes('Lowest verified observed options'));
  assert.ok(el.innerHTML.includes('Not a live checkout quote.'), 'price choice must be dated and qualified');
  assert.ok(!el.innerHTML.includes('cheapest:'), 'a regional comparison is not a guaranteed checkout price');
  assert.ok(!/undefined|NaN|\[object/.test(el.innerHTML));
});
