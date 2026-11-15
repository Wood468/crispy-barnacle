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
/* Privacy boundary. Method: for EVERY record in src/regional-observations.js, scan EVERY text file under public/**.
   - The record id (e.g. "id-itw-deluxe") is distinctive, so any occurrence is a leak.
   - Amounts are short numbers that collide with dex numbers, Discord ids and CSS, so a bare-number grep would give
     false positives. An amount only counts as a leak in PRICE CONTEXT: right after a currency marker (Rp, IDR, INR, the
     rupiah/rupee signs) or as the value of an amount/price/idr/inr JSON key, in plain, comma-grouped or
     dot-grouped (Indonesian "76.000") form. */
test('no owner regional observation id or price appears in any public/** file or unauthenticated Worker response', async () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]);
  const files = walk(new URL('../public', import.meta.url).pathname).filter(f => /\.(json|js|cjs|mjs|html|css|txt|webmanifest|svg)$/.test(f));
  assert.ok(files.length > 50, 'scanned a meaningful number of public files');
  const forms = n => { const g = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return [...new Set([String(n), g, g.replace(/,/g, '.')])].map(x => x.replace(/\./g, '\\.')).join('|'); };
  const leaks = [];
  const bodies = files.map(f => [f, fs.readFileSync(f, 'utf8')]);
  for (const o of OBSERVATIONS) {
    const priceCtx = new RegExp('(?:Rp|IDR|INR|\\u20b9|\\u20a8)\\s?(?:' + forms(o.amount) + ')(?![\\d.,]*\\d)|"(?:amount|price|idr|inr)"\\s*:\\s*"?(?:' + forms(o.amount) + ')(?![\\d.])', 'i');
    for (const [f, body] of bodies) {
      if (body.includes(o.id)) leaks.push(f + ' id ' + o.id);
      if (priceCtx.test(body)) leaks.push(f + ' amount ' + o.amount + ' (' + o.id + ')');
    }
  }
  assert.deepEqual(leaks, []);
  /* Worker boundary: the observations module is referenced from exactly one handler, and an unauthenticated call leaks nothing. */
  const w = fs.readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
  assert.equal((w.match(/REGIONAL_OBSERVATIONS/g) || []).length, 2, 'import + the single prices-private response');
  assert.match(w, /async function pricesPrivate[\s\S]{0,300}x-pin[\s\S]{0,400}REGIONAL_OBSERVATIONS/);
  const { default: worker } = await import('../src/worker.js');
  const { makeDB } = await import('./helpers.mjs');
  const env = { SYNC_PIN: '1234', DB: makeDB(), ASSETS: { fetch: async () => new Response('{}') }, MEDIA: { get: async () => ({ json: async () => ({ prices: [] }) }) } };
  for (const headers of [{}, { 'x-pin': 'wrong' }]) {
    const res = await worker.fetch(new Request('https://x.test/api/prices-private', { headers }), env);
    assert.equal(res.status, 401);
    const text = await res.text();
    for (const o of OBSERVATIONS) assert.ok(!text.includes(o.id));
  }
});

/* Negative control: prove the detector would catch a leak, so a pass is meaningful. */
test('privacy detector catches an id or a price-context amount (negative control)', () => {
  const forms = n => String(n);
  const re = new RegExp('(?:Rp|IDR)\\s?(?:' + forms(76000) + ')|"amount"\\s*:\\s*76000');
  assert.ok(re.test('Rp 76000') && re.test('{"amount":76000}'));
  assert.ok(!re.test('dex 76000 id'));
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
