const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const R = require('../public/regional-prices.js');
const NOW = Date.parse('2026-11-12T00:00:00Z');
const id = (product, kind, amount, extra) => Object.assign({id: product, region:'ID', channel:'web', currency:'IDR', observed:'2026-11-09', source:'fixture', status:'verified', product, kind, amount}, extra);
const OBS = [
  id('GO Pass Deluxe: Into the Wild', 'event-pass', 76000),
  id('GO Pass Deluxe: Into the Wild + 10 Ranks Ultra Box', 'event-pass-ranks-ultra', 126000),
  id('Monthly GO Pass Deluxe', 'monthly-pass', 41000, {pairAud:{amount:12.99}}),
  id('Monthly Deluxe Ultra Box', 'monthly-pass-ultra', 76000, {pairAud:{amount:22.99}}),
  id('3,300 total PokéCoins', 'coins', 101000, {coins:3300}),
  id('6,800 total PokéCoins', 'coins', 200000, {coins:6800}),
  {id:'in1', region:'IN', channel:'in-app', currency:'INR', observed:'2026-11-09', source:'fixture', status:'recorded', product:'GO Pass Deluxe: Into the Wild', kind:'event-pass', amount:439}
];
test('product kinds never mix a pass, its rank upgrade and its Ultra Box', () => {
  assert.equal(R.kindOf('GO Pass Deluxe: Into the Wild'), 'event-pass');
  assert.equal(R.kindOf('GO Pass Deluxe: Into the Wild + 10 Ranks'), 'event-pass-ranks');
  assert.equal(R.kindOf('GO Pass Deluxe: Into the Wild + 10 Ranks Ultra Box'), 'event-pass-ranks-ultra');
  assert.equal(R.kindOf('Monthly GO Pass Deluxe'), 'monthly-pass');
  assert.equal(R.kindOf('Monthly Deluxe Ultra Box'), 'monthly-pass-ultra');
  assert.equal(R.kindOf('6,800 total PokéCoins'), 'coins');
  assert.equal(R.kindOf('Pokémon Storage +50'), 'storage');
  assert.equal(R.kindOf('Raid Commander Box'), 'bundle');
  assert.equal(R.kindOf('Special Research Ticket'), 'research-ticket');
});
test('a verified price is returned exactly, with its channel, date and source', () => {
  const p = R.reference({region:'ID', channel:'web', product:'GO Pass Deluxe: Into the Wild'}, OBS, NOW);
  assert.equal(p.amount, 76000); assert.equal(p.basis, 'verified'); assert.equal(p.observed, '2026-11-09'); assert.equal(p.source, 'fixture');
});
test('a future product is an estimate: labelled, ranged, with confidence and basis', () => {
  const p = R.reference({region:'ID', channel:'web', product:'GO Pass Deluxe: Future Event', kind:'event-pass'}, OBS, NOW);
  assert.equal(p.basis, 'estimate'); assert.equal(p.label, 'Estimate');
  assert.ok(p.min < 76000 && p.max > 76000, 'single comparable still gets a band');
  assert.equal(p.confidence, 'low'); assert.match(p.basisText, /comparable event-pass/);
});
test('AU price times observed ratio estimates a monthly pass; Ultra Box uses only Ultra Box ratios', () => {
  const pass = R.estimate({region:'ID', channel:'web', product:'Monthly GO Pass Deluxe: December', aud:12.99}, OBS, NOW);
  assert.equal(pass.amount, 41000);
  const ultra = R.estimate({region:'ID', channel:'web', product:'Monthly Deluxe Ultra Box: December', aud:22.99}, OBS, NOW);
  assert.equal(ultra.amount, 76000);
  assert.notEqual(ultra.amount, pass.amount);
});
test('coin packs, storage and items are never estimated from other sizes', () => {
  assert.equal(R.reference({region:'ID', channel:'web', product:'110 PokéCoins'}, OBS, NOW), null);
  assert.equal(R.reference({region:'ID', channel:'web', product:'Pokémon Storage +1', kind:'storage'}, OBS, NOW), null);
});
test('no comparable means no price: never FX-only, never another kind or channel', () => {
  assert.equal(R.reference({region:'ID', channel:'web', product:'Special Research Ticket'}, OBS, NOW), null);
  assert.equal(R.reference({region:'IN', channel:'in-app', product:'Monthly GO Pass Deluxe'}, OBS, NOW), null);
  assert.equal(R.reference({region:'ID', channel:'in-app', product:'GO Pass Deluxe: Into the Wild'}, OBS, NOW), null);
});
test('stale observations lose confidence', () => {
  const old = OBS.map(o => Object.assign({}, o, {observed:'2026-05-01'}));
  assert.equal(R.estimate({region:'ID', channel:'web', product:'GO Pass Deluxe: X', kind:'event-pass'}, old, NOW).confidence, 'very low');
});
test('cheapest option: web only where the region has an observed Web channel', () => {
  const r = R.cheapest({region:'ID', product:'GO Pass Deluxe: Into the Wild + 10 Ranks Ultra Box'}, OBS, {}, NOW);
  assert.equal(r.best.channel, 'web'); assert.equal(r.best.cash, 126000); assert.equal(r.best.isEstimate, false);
  const india = R.cheapest({region:'IN', product:'GO Pass Deluxe: Into the Wild'}, OBS, {}, NOW);
  assert.deepEqual(india.options.map(o => o.channel), ['in-app']);
  assert.equal(R.cheapest({region:'AU', product:'GO Pass Deluxe: Into the Wild'}, OBS, {}, NOW).best, null);
});
test('cheapest option marks estimates and adds upfront costs', () => {
  const r = R.cheapest({region:'ID', product:'GO Pass Deluxe: Future', kind:'event-pass'}, OBS, {upfront:[{label:'Pokémon Storage +50', amount:10000}]}, NOW);
  assert.equal(r.best.isEstimate, true); assert.equal(r.best.cash, 86000); assert.equal(r.best.upfront, 10000);
});
test('in-app coin purchase uses the balance, buys the cheapest packs for the shortfall and reports unused coins', () => {
  const obs = OBS.concat([{id:'a', region:'ID', channel:'in-app', currency:'IDR', observed:'2026-11-09', source:'fixture', status:'verified', product:'Test Bundle', kind:'bundle', amount:999999, coins:4000}]);
  const packs = [{coins:3300, amount:101000, currency:'IDR'}, {coins:6800, amount:200000, currency:'IDR'}];
  const full = R.cheapest({region:'ID', product:'Test Bundle'}, obs, {coinBalance:4500, packs}, NOW).options.find(o => o.channel === 'in-app');
  assert.equal(full.cash, 0); assert.equal(full.leftoverCoins, 500);
  const short = R.cheapest({region:'ID', product:'Test Bundle'}, obs, {coinBalance:1000, packs}, NOW).options.find(o => o.channel === 'in-app');
  assert.equal(short.coinsBought, 3300); assert.equal(short.cash, 101000); assert.equal(short.leftoverCoins, 300);
  const none = R.cheapest({region:'ID', product:'Test Bundle'}, obs, {coinBalance:0, packs}, NOW).options.find(o => o.channel === 'in-app');
  assert.equal(none.coinsBought, 6800); // 3300 alone is short of 4000; 6800 at 200000 beats 2x3300 = 202000
  assert.equal(none.cash, 200000);
});
test('one-time promotional coin packs are never counted as a repeatable purchase', () => {
  const obs = OBS.concat([{id:'a', region:'ID', channel:'in-app', currency:'IDR', observed:'2026-11-09', source:'fixture', status:'verified', product:'Test Bundle', kind:'bundle', amount:999999, coins:4000}]);
  const packs = [{coins:3300, amount:101000, currency:'IDR'}, {coins:18500, amount:50000, currency:'IDR', oneTime:true}];
  const r = R.cheapest({region:'ID', product:'Test Bundle'}, obs, {coinBalance:0, packs}, NOW).options.find(o => o.channel === 'in-app');
  assert.equal(r.cash, 202000); assert.ok(r.packs.every(p => !p.oneTime));
});
test('monthly review flags stale, due and unverified observations without screenshots', () => {
  const r = R.review(OBS.concat([id('Old', 'item', 1, {id:'old', observed:'2026-08-01'})]), NOW);
  assert.equal(r.ok, false);
  assert.ok(r.flags.some(f => f.level === 'stale' && f.id === 'old'));
  assert.ok(r.flags.some(f => f.level === 'unverified' && f.id === 'in1'));
  assert.equal(R.review(OBS.filter(o => o.status === 'verified'), NOW).ok, true);
  assert.equal(R.review([{id:'bad', amount:0}], NOW).ok, false);
});
test('catalogue rows pair every Australian item with a verified or estimated regional price', () => {
  const rows = R.catalogue([
    {product:'store-a', currency:'AUD', region:'AU', amount:12, verified:true, observed:'2026-11-09', label:'Monthly GO Pass Deluxe', group:'Tickets'},
    {product:'store-a', currency:'AUD', region:'AU', amount:3, verified:false, observed:'2026-11-10'},
    {product:'store-b', currency:'USD', region:'global', amount:1, verified:true}
  ], OBS, NOW);
  assert.equal(rows.length, 1); assert.equal(rows[0].aud, 12); assert.equal(rows[0].indonesia.basis, 'verified'); assert.equal(rows[0].india, null);
});
test('Store script and regional module parse in a browser-like context', () => {
  for (const f of ['store.js', 'regional-prices.js']) assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(__dirname, '../public', f), 'utf8')));
  const src = fs.readFileSync(path.join(__dirname, '../public/store.js'), 'utf8');
  assert.equal((src.match(/^\(function \(\) \{/gm) || []).length, 1, 'store.js must hold exactly one IIFE');
});

test('catalogue retains regional-only products without inventing Australian prices', () => {
  const rows = R.catalogue([], OBS, NOW);
  const idOnly = rows.find(r => r.label === '3,300 total PokéCoins');
  assert.ok(idOnly, 'Indonesian-only coin pack must be visible');
  assert.equal(idOnly.aud, null);
  assert.equal(idOnly.indonesia.amount, 101000);
  assert.equal(idOnly.india, null);
  assert.ok(rows.some(r => r.label === 'GO Pass Deluxe: Into the Wild'));
});
