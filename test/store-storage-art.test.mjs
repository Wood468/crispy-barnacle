import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const store = fs.readFileSync(new URL('../public/store.js', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const prices = JSON.parse(fs.readFileSync(new URL('../public/prices.json', import.meta.url), 'utf8'));
const src = store.slice(store.indexOf('var ICO = ['), store.indexOf('/* Owner-approved (15 Nov 2026)'));
const { icon } = new Function('window', "var window_=window;" + 'var esc=window.GOLIB.esc;' + src + 'return {icon:icon};')({ GOLIB: { esc: s => String(s).replace(/"/g, '&quot;') } });
const bag = '/ico/i/item-bag.webp', pst = '/ico/i/pokemon-storage.webp';
const srcOf = h => (h.match(/src="([^"]+)"/) || [])[1] || '';

test('Item Bag and Pokémon Storage (exact, optional +N) get their picture', () => {
  for (const n of ['Item Bag +1', 'Item Bag', 'item bag +1', 'Item Bag + 1', 'Item Bag +2']) assert.equal(srcOf(icon(n)), bag, n);
  for (const n of ['Pokémon Storage +1', 'Pokémon Storage', 'Pokemon Storage +1', 'pokémon storage +10']) assert.equal(srcOf(icon(n)), pst, n);
});

test('Item Bag Upgrade and Pokémon Storage +N number variants get their picture (exact names)', () => {
  for (const n of ['Item Bag Upgrade', 'Item Bag upgrade', 'item bag upgrade', 'Item Bag Upgrade +1', 'Item Bag upgrade + 10']) assert.equal(srcOf(icon(n)), bag, n);
  for (const n of ['Pokémon Storage +50', 'Pokemon Storage +50', 'pokémon storage + 50', 'Pokémon Storage +100']) assert.equal(srcOf(icon(n)), pst, n);
});

test('no false matches: lucky bags, other bags, other storage, combos', () => {
  for (const n of ['Lucky Bag', 'Lucky Bag +1', 'Item Bag Bundle', 'Big Item Bag +1', 'Item Bag +1 Bundle', 'Item Bag +0', 'Item Bags', 'Bag', 'Bag Upgrade', 'Storage', 'Storage +1', 'Pokémon Storage Box', 'Pokémon Storage Bundle +1', 'Pokémon Storage +1 and Item Bag +1', 'Item Storage +1', 'Pokémon Bag +1', 'Starter Bag', 'Item Bag Upgrade Bundle', 'Item Bag Upgrade +0', 'Big Item Bag Upgrade', 'Upgrade', 'Item Upgrade', 'Pokémon Storage Upgrade Pack', 'Pokémon Storage +50 Bundle', 'Pokémon Storage +0', 'Indonesia · Item Bag upgrade', 'Premium Battle Pass Bundle', '']) assert.equal(icon(n), '', JSON.stringify(n));
});

test('picture is decorative (empty alt), lazy, sized, same-origin; other icons keep their alt', () => {
  const h = icon('Item Bag +1');
  assert.match(h, /alt=""/); assert.match(h, /loading="lazy"/); assert.match(h, /width="40" height="40"/); assert.doesNotMatch(h, /https?:/);
  assert.match(icon('Max Potion'), /alt="Max Potion"/);
});

test('both live store labels are covered', () => {
  const labels = prices.prices.map(p => p.label);
  assert.ok(labels.includes('Item Bag +1') && labels.includes('Pokémon Storage +1'));
});

test('store.js version token and shell cache are current', () => {
  assert.match(html, /store\.js\?v=20261124d-comparepop/);
  assert.match(sw, /store\.js\?v=20261124d-comparepop/);
  assert.match(sw, /gofn-shell-v391/);
});
