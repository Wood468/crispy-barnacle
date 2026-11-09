import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OBSERVATIONS } from '../src/regional-observations.js';
const find = (product, region = 'ID') => OBSERVATIONS.filter(o => o.product === product && o.region === region);
test('verified Indonesian Web Store reference prices of 9 Nov 2026 are present and exact', () => {
  const want = { 'GO Pass Deluxe: Into the Wild': 76000, 'GO Pass Deluxe: Into the Wild + 10 Ranks': 101000, 'GO Pass Deluxe: Into the Wild + 10 Ranks Ultra Box': 126000,
    'Monthly GO Pass Deluxe': 41000, 'Monthly Deluxe Ultra Box': 76000, 'Pokémon Storage +50': 10000, 'Item Bag upgrade': 10000, '3,300 total PokéCoins': 101000, '6,800 total PokéCoins': 200000 };
  for (const [product, amount] of Object.entries(want)) {
    const rows = find(product); assert.equal(rows.length, 1, product);
    assert.equal(rows[0].amount, amount, product); assert.equal(rows[0].currency, 'IDR'); assert.equal(rows[0].channel, 'web');
    assert.equal(rows[0].observed, '2026-11-09'); assert.equal(rows[0].status, 'verified'); assert.ok(rows[0].source);
  }
});
test('India stays in-app with its own source label and is not presented as verified', () => {
  const [row] = find('GO Pass Deluxe: Into the Wild', 'IN');
  assert.equal(row.channel, 'in-app'); assert.equal(row.currency, 'INR'); assert.notEqual(row.status, 'verified');
});
test('every observation is complete and ids are unique', () => {
  const ids = new Set();
  for (const o of OBSERVATIONS) { assert.ok(o.id && !ids.has(o.id), o.id); ids.add(o.id); assert.ok(o.amount > 0 && o.currency && o.region && o.channel && o.source && Date.parse(o.observed), o.id); }
});
test('Indonesian prices are served only through the owner route, never from public files', () => {
  for (const f of ['regional-prices.js', 'store.js', 'lib.js', 'prices.json']) assert.ok(!/101000|126000|76000/.test(fs.readFileSync(new URL('../public/' + f, import.meta.url), 'utf8')), f);
  const w = fs.readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
  assert.match(w, /async function pricesPrivate[\s\S]{0,300}x-pin[\s\S]{0,400}REGIONAL_OBSERVATIONS/);
});

test('standard Indonesian coin packs and one-time promotional bonus are faithfully recorded', () => {
  for (const [coins, amount] of [[110,5000],[600,25000],[1300,50000],[2700,101000],[5600,200000],[15500,505000]]) {
    const rows = OBSERVATIONS.filter(o => o.id === 'id-coins-standard-' + coins);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].coins, coins);
    assert.equal(rows[0].amount, amount);
    assert.equal(rows[0].status, 'verified');
    assert.equal(rows[0].channel, 'web');
  }
  const promo = OBSERVATIONS.find(o => o.id === 'id-coins-18500-promo');
  assert.equal(promo.coins, 18500);
  assert.equal(promo.amount, 505000);
  assert.equal(promo.oneTime, true);
  for (const coins of [3300, 6800]) {
    const offer = OBSERVATIONS.find(o => o.coins === coins && o.region === 'ID');
    assert.ok(offer, 'Missing ' + coins + '-coin promotional pack');
    assert.equal(offer.oneTime, true, coins + '-coin promotion must not be repeatable');
  }
  assert.ok(!OBSERVATIONS.some(o => o.coins === 16700 || o.coins === 15620), 'Reward Road points must not be counted as bonus PokéCoins');
});
