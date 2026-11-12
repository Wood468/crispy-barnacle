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
  const prices = { prices: [{ product: 'store-x', label: 'Lucky Egg x8', group: 'Items', currency: 'AUD', amount: 7.99, region: 'AU', verified: true, observed: '2026-10-12' }], regional: OBSERVATIONS, owner: true };
  const win = { GORegionalPrices: R, GOLIB: { esc: s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'), loadPrices: () => Promise.resolve(prices), priceView: () => ({ sub: '', save: '', main: '' }) }, GODASH: {} };
  const doc = { readyState: 'complete', getElementById: id => id === 'evsource' ? host : id === 'storep-host' ? null : null, createElement: () => el, addEventListener() {} };
  Object.assign(win, { document: doc, localStorage: { getItem: () => null, setItem() {} }, console }); win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(fs.readFileSync(new URL('../public/store.js', import.meta.url), 'utf8'), ctx);
  await new Promise(r => setTimeout(r, 20));
  for (const t of ['Rp 76,000', 'Rp 101,000', 'Rp 126,000', 'Rp 41,000', 'Rp 10,000', 'Rp 200,000', 'Verified Indonesia Web Store', 'Not observed', 'A$7.99'])
    assert.ok(el.innerHTML.includes(t), 'missing ' + t);
  assert.equal((el.innerHTML.match(/spc-catalogue/g) || []).length, 1);
  assert.ok(!el.innerHTML.includes('PokéCoins in hand'));
  assert.ok(!el.innerHTML.includes('Cheapest realistic option'));
  assert.ok(!el.innerHTML.includes('Save A
});
));
  assert.ok(!/undefined|NaN|\[object/.test(el.innerHTML));
});
