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
test('estimated prices retain their upfront costs but can never win a cheapest-price claim', () => {
  const r = R.cheapest({region:'ID', product:'GO Pass Deluxe: Future', kind:'event-pass'}, OBS, {upfront:[{label:'Pokémon Storage +50', amount:10000}]}, NOW);
  assert.equal(r.best, null, 'a modelled estimate is not a checkout price');
  assert.equal(r.options[0].isEstimate, true); assert.equal(r.options[0].cash, 86000); assert.equal(r.options[0].upfront, 10000);
});
test('only verified observations qualify for lowest option, even if recorded offers seem cheaper', () => {
  const obs = [
    id('Example Item', 'item', 90000),
    id('Example Item', 'item', 40000, {id:'recorded-app', channel:'in-app', status:'recorded'}),
  ];
  const result = R.cheapest({region:'ID', product:'Example Item'}, obs, {}, NOW);
  assert.equal(result.options.length, 2, 'recorded offers remain visible for context');
  assert.equal(result.best.channel, 'web'); assert.equal(result.best.cash, 90000);
  assert.equal(result.best.basis, 'verified');
  const onlyRecorded = R.cheapest({region:'ID', product:'Example Item'}, obs.slice(1), {}, NOW);
  assert.equal(onlyRecorded.best, null, 'a recorded-only price cannot establish a lowest verified offer');
});
test('different currencies in the same comparison cannot establish a lowest observed option', () => {
  const obs = [
    id('Example Item', 'item', 90000),
    id('Example Item', 'item', 200, {id:'other-currency', channel:'in-app', currency:'INR'}),
  ];
  const result = R.cheapest({region:'ID', product:'Example Item'}, obs, {}, NOW);
  assert.equal(result.options.length, 2, 'do not silently drop prices just because currencies differ');
  assert.deepEqual(result.options.map(p => p.currency).sort(), ['IDR','INR']);
  assert.equal(result.best, null, 'without a dated FX rate nominal amounts cannot be ranked');
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
  const matched = rows.find(r => r.product === 'store-a');
  assert.ok(matched, 'Australian catalogue item is preserved');
  assert.equal(matched.aud, 12); assert.equal(matched.indonesia.basis, 'verified'); assert.equal(matched.india, null);
  assert.ok(rows.length > 1, 'Regional-only products are also retained');
});

test('catalogue includes non-store-prefixed verified official AU Web Store offers without guessing labels', () => {
  const offers = [
    { product:'go-pass-oct-deluxe', currency:'AUD', region:'AU', amount:12.99, verified:true,
      observed:'2026-10-11', source:'Official Web Store', url:'https://store.pokemongo.com/' },
    { product:'go-pass-oct-deluxe', currency:'AUD', region:'AU', amount:13.99, verified:true,
      observed:'2026-10-12', source:'Official Web Store, later verified observation', url:'https://store.pokemongo.com/' },
    { product:'wild-area-2026-global-ultra-box', currency:'AUD', region:'AU', amount:17.99, verified:true,
      observed:'2026-10-12', source:'Official Web Store', url:'https://store.pokemongo.com' },
    { product:'safari-brisbane-2day', currency:'AUD', region:'AU', amount:17, verified:true,
      observed:'2026-10-12', source:'Third-party event listing', url:'https://pokemongohub.net/post/event/example' },
  ];
  const result = R.catalogue(offers, [], NOW);
  assert.equal(result.length, 2, 'both official SKU identities retained, external event offer excluded');
  const latest = result.find(p => p.product === 'go-pass-oct-deluxe');
  assert.equal(latest.aud, 13.99);
  assert.equal(latest.observed, '2026-10-12');
  assert.equal(latest.displayNameVerified, false, 'unknown human-readable product names must not be invented');
  assert.ok(latest.label.includes('go-pass-oct-deluxe'), 'keep exact offer ID visible until a verified label is available');
  assert.equal(latest.auSource, 'Official Web Store, later verified observation');
  assert.equal(result.some(p => p.product === 'safari-brisbane-2day'), false);
});

test('the official AU offer gate rejects spoofed domains and unverified currency or prices', () => {
  const base = { product:'go-pass-authentic',currency:'AUD',region:'AU',amount:12.99,
    verified:true,observed:'2026-10-12',url:'https://store.pokemongo.com/' };
  const rows = [
    base,
    { ...base,product:'spoof-host',url:'https://store.pokemongo.com.evil.test/' },
    { ...base,product:'userinfo',url:'https://attacker@store.pokemongo.com/' },
    { ...base,product:'insecure',url:'http://store.pokemongo.com/' },
    { ...base,product:'missing-url',url:undefined },
    { ...base,product:'wrong-currency',currency:'USD' },
    { ...base,product:'unverified',verified:false },
    { ...base,product:'free',amount:0 },
  ];
  assert.deepEqual(R.catalogue(rows, [], NOW).map(p=>p.product), ['go-pass-authentic']);
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
