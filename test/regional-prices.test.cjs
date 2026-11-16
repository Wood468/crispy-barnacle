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

test('standard Web Store PokéCoin labels pair AU and Indonesia without hiding a real price', () => {
  const prices = [
    {product:'store-au-110', label:'110 PokéCoins', group:'PokéCoins', currency:'AUD', region:'AU', amount:1.59, verified:true, observed:'2026-11-09'},
    {product:'store-au-600', label:'600 PokéCoins', group:'PokéCoins', currency:'AUD', region:'AU', amount:7.99, verified:true, observed:'2026-11-09'}
  ];
  const observations = [
    id('110 PokéCoins (standard Web Store pack)', 'coins', 5000),
    id('600 PokéCoins (standard Web Store pack)', 'coins', 25000),
    id('110 PokéCoins + 30 one-time Web Store bonus', 'coins', 8000, {oneTime:true})
  ];
  const rows = R.catalogue(prices, observations, NOW);
  assert.equal(rows.length, 3, 'two equivalent standard packs and one distinct bonus offer');
  for (const [label, amount, au] of [['110 PokéCoins', 5000, 1.59], ['600 PokéCoins', 25000, 7.99]]) {
    const matched = rows.filter(r => r.label === label);
    assert.equal(matched.length, 1, label + ' must appear once');
    assert.equal(matched[0].aud, au);
    assert.equal(matched[0].indonesia.amount, amount);
    assert.equal(matched[0].indonesia.basis, 'verified');
  }
  const bonus = rows.find(r => r.label.includes('one-time Web Store bonus'));
  assert.ok(bonus && bonus.aud === null, 'one-time bonus pack must stay separate');
});

test('catalogue includes every source-verified Australian Web Store offer regardless of legacy ID prefix', () => {
  const observed = require('../public/prices.json').prices;
  const rows = R.catalogue(observed, OBS, NOW);
  const offerIds = [
    'go-pass-oct-deluxe','go-pass-oct-deluxe-10','go-pass-oct-ultrabox',
    'go-pass-fall-deluxe','go-pass-fall-deluxe-6','go-pass-fall-ultrabox',
    'wild-area-2026-global-ultra-box'
  ];
  for (const sku of offerIds) {
    const matches = rows.filter(row => row.product === sku);
    assert.equal(matches.length, 1, sku + ' must appear once, even when the AU price was observed twice');
    assert.ok(matches[0].aud > 0);
    assert.equal(matches[0].group, 'Passes & tickets');
    assert.equal(matches[0].sourceIdOnly, false, 'officially named pass retains its product identity');
    assert.ok(Array.isArray(matches[0].contents) && matches[0].contents.length >= 3,
      'officially named pass includes independently sourced offer contents');
    assert.match(matches[0].contentsSource, /^https:\/\/(?:pokemongo\.com|store\.pokemongo\.com)\//);
    assert.equal(matches[0].indonesia, null, 'a historical pass must never borrow an unrelated regional price estimate');
  }
  assert.equal(rows.some(row => /^safari-brisbane/.test(row.product)), false,
    'GO Hub City Safari tickets are not items sold in the official Web Store');
});

test('non-store AU offers require a verified exact official HTTPS Web Store URL', () => {
  const base = { product: 'go-pass-demo-sku', label: 'Example Deluxe GO Pass',
    region: 'AU', currency: 'AUD', amount: 12.99, verified: true,
    observed: '2026-11-13', url: 'https://store.pokemongo.com/' };
  const rows = R.catalogue([base], [], NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, 'Example Deluxe GO Pass');
  assert.equal(rows[0].sourceIdOnly, false);
  const invalid = [
    'http://store.pokemongo.com/',
    'https://evil@store.pokemongo.com/',
    'https://store.pokemongo.com.evil.example/',
    'https://pokemongo.com/en/news/ticket',
    'https://store.pokemongo.com/ticket',
    'https://store.pokemongo.com/?account=token'
  ];
  for (const url of invalid) assert.equal(R.catalogue([{...base, url}], [], NOW).length, 0, url);
  assert.equal(R.catalogue([{...base, verified:false}], [], NOW).length, 0);
  assert.equal(R.catalogue([{...base, currency:'USD'}], [], NOW).length, 0);
  assert.equal(R.catalogue([{...base, amount:0}], [], NOW).length, 0);
});

test('verified Store SKU variants remain distinct and region-only records keep their own identity', () => {
  const prices = [
    {product:'go-pass-oct-deluxe', currency:'AUD', region:'AU', amount:12.99,
      url:'https://store.pokemongo.com/', observed:'2026-10-11', verified:true},
    {product:'go-pass-oct-deluxe-10', currency:'AUD', region:'AU', amount:14.99,
      url:'https://store.pokemongo.com/', observed:'2026-10-11', verified:true},
    {product:'go-pass-oct-deluxe', currency:'AUD', region:'AU', amount:13.49,
      url:'https://store.pokemongo.com/', observed:'2026-10-12', verified:true}
  ];
  const rows = R.catalogue(prices,[id('GO Pass Deluxe: Into the Wild','event-pass',76000)],NOW);
  assert.equal(rows.length,3);
  assert.equal(rows.find(r=>r.product==='go-pass-oct-deluxe').aud,13.49,'latest dated AU observation wins');
  assert.equal(rows.find(r=>r.product==='go-pass-oct-deluxe-10').aud,14.99);
  assert.equal(rows.find(r=>r.label==='GO Pass Deluxe: Into the Wild').aud,null,
    'do not claim an unrelated AU price for a regional-only event pass');
});

test('distinct verified Australian SKUs with the same label are never overwritten or falsely paired', () => {
  const prices=[
    {product:'store-raid-box-a',label:'Raid Day Box',group:'Boxes',currency:'AUD',
      region:'AU',amount:9.99,verified:true,observed:'2026-11-09'},
    {product:'store-raid-box-b',label:'Raid Day Box',group:'Boxes',currency:'AUD',
      region:'AU',amount:14.99,verified:true,observed:'2026-11-09'},
    {product:'store-raid-box-b',label:'Raid Day Box',group:'Boxes',currency:'AUD',
      region:'AU',amount:15.99,verified:true,observed:'2026-11-10'}
  ];
  const regional=[id('Raid Day Box','bundle',50000)];
  const rows=R.catalogue(prices,regional,NOW);
  assert.equal(rows.length,3,'two distinct AU offers and one unmatched regional observation');
  const a=rows.find(r=>r.product==='store-raid-box-a');
  const b=rows.find(r=>r.product==='store-raid-box-b');
  assert.ok(a&&b,'both verified SKUs must remain visible');
  assert.equal(a.aud,9.99);
  assert.equal(b.aud,15.99,'latest observation of one exact SKU wins');
  for(const row of [a,b]){
    assert.equal(row.ambiguousSku,true);
    assert.equal(row.indonesia,null,'same-name local price must not be assigned to both AU variants');
    assert.equal(row.india,null);
  }
  const unpaired=rows.find(r=>r.aud===null&&r.label==='Raid Day Box');
  assert.equal(unpaired.regionalUnmatched,true);
  assert.equal(unpaired.indonesia.amount,50000);
});

test('a unique exact label remains matchable and bonus coin packs stay separate', () => {
  const prices=[
    {product:'store-110-pokecoins',label:'110 PokéCoins',group:'PokéCoins',
      currency:'AUD',region:'AU',amount:1.59,verified:true,observed:'2026-11-09'}
  ];
  const obs=[
    id('110 PokéCoins (standard Web Store pack)','coins',5000),
    id('110 PokéCoins + 30 one-time Web Store bonus','coins',8000,{oneTime:true})
  ];
  const rows=R.catalogue(prices,obs,NOW);
  assert.equal(rows.length,2);
  const standard=rows.find(r=>r.product==='store-110-pokecoins');
  assert.equal(standard.indonesia.amount,5000);
  assert.equal(standard.ambiguousSku,false);
  const bonus=rows.find(r=>r.label.includes('one-time Web Store bonus'));
  assert.equal(bonus.aud,null);
  assert.equal(bonus.indonesia.amount,8000);
});

test('same-name Australian and Indonesian bundles require a verified common source SKU', () => {
  const au = [{product:'store-raid-commander', label:'Raid Commander Box', group:'Boxes',
    currency:'AUD',region:'AU',amount:14.99,verified:true,observed:'2026-11-09'}];
  const regional = [id('Raid Commander Box','bundle',200000,{id:'id-raid-commander'})];
  const separate = R.catalogue(au, regional, NOW);
  assert.equal(separate.length,2,'name alone cannot equate two boxes with unknown contents');
  assert.equal(R.catalogue(au,[null,{amount:0},...regional],NOW).length,2,
    'malformed regional observations must not crash the owner Store');
  assert.equal(separate.find(r=>r.aud===14.99).indonesia,null);
  const unmatched=separate.find(r=>r.aud===null);
  assert.equal(unmatched.regionalUnmatched,true);
  assert.equal(unmatched.indonesia.amount,200000);
  const opaqueAu=au.map(p=>({...p,product:'store-opaque-bundle',label:'Raid Commander'}));
  const opaqueId=regional.map(p=>({...p,product:'Raid Commander'}));
  assert.equal(R.catalogue(opaqueAu,opaqueId,NOW).length,2,
    'explicit source bundle category still requires SKU proof without a Box suffix');
  const verifiedAu=au.map(p=>({...p,sourceSku:'verified-raid-box'}));
  const verifiedId=regional.map(p=>({...p,sourceSku:'VERIFIED-RAID-BOX'}));
  const paired=R.catalogue(verifiedAu,verifiedId,NOW);
  assert.equal(paired.length,1,'an exact common source SKU permits one confirmed match');
  assert.equal(paired[0].indonesia.amount,200000);
  const different=R.catalogue(verifiedAu,regional.map(p=>({...p,sourceSku:'different-box'})),NOW);
  assert.equal(different.length,2,'explicitly different SKUs cannot be joined');
  assert.equal(different.find(r=>r.aud===14.99).indonesia,null);
});

test('same-title regional bundles and one-time promotions preserve their exact observations', () => {
  const distinct = [
    id('Mystery Event Box','bundle',50000,{id:'box-small',sourceSku:'box-small-contents'}),
    id('Mystery Event Box','bundle',150000,{id:'box-large',sourceSku:'box-large-contents'}),
    id('110 PokéCoins','coins',8000,{id:'one-time-110',oneTime:true})
  ];
  const au=[{product:'store-110-pokecoins',label:'110 PokéCoins',group:'PokéCoins',
    currency:'AUD',region:'AU',amount:1.59,verified:true,observed:'2026-11-09'}];
  const rows=R.catalogue(au,distinct,NOW);
  const boxes=rows.filter(r=>r.label==='Mystery Event Box');
  assert.equal(boxes.length,2,'distinct source-SKU boxes may share a title');
  assert.deepEqual(boxes.map(r=>r.indonesia.amount).sort((a,b)=>a-b),[50000,150000],
    'each distinct regional offer displays its own observed price, not another box price');
  const opaqueBoxes=R.catalogue([],[
    id('Raid Commander','bundle',90000,{id:'unidentified-box-a'}),
    id('Raid Commander','bundle',190000,{id:'unidentified-box-b'})
  ],NOW);
  assert.equal(opaqueBoxes.length,2,'bundle-typed same-title regional items keep both IDs');
  assert.deepEqual(opaqueBoxes.map(r=>r.indonesia.amount).sort((a,b)=>a-b),[90000,190000]);
  const skuOnly=R.catalogue([{product:'store-600-pokecoins',label:'600 PokéCoins',group:'PokéCoins',
    currency:'AUD',region:'AU',amount:7.99,verified:true,observed:'2026-11-09'}],
    [id('600 PokéCoins','coins',25000,{id:'regional-different-sku',sourceSku:'other-coin-bonus'})],NOW);
  assert.equal(skuOnly.length,2,'explicit regional SKU cannot pair with unattributed AU pack');
  assert.equal(skuOnly.find(r=>r.aud===7.99).indonesia,null);
  const standard=rows.find(r=>r.product==='store-110-pokecoins');
  assert.equal(standard.indonesia,null,'one-time promotion must not price a standard pack');
  const promo=rows.find(r=>r.label==='110 PokéCoins' && r.aud===null);
  assert.equal(promo.indonesia.amount,8000,'separate one-time offer remains visible');
});

test('owner catalogue coverage keeps missing and unverified regional prices distinct', () => {
  const rows = [
    {product:'store-legacy',label:'store-legacy',sourceIdOnly:true,aud:12.99,
      observed:'2026-10-01',indonesia:null,india:null},
    {product:'store-bundle',label:'Raid Commander Box',aud:14.99,
      observed:'2026-11-11',ambiguousSku:true,
      indonesia:{basis:'recorded',amount:200000,observed:'2026-11-09'},
      india:{basis:'estimate',min:300,max:500,observed:'2026-11-09'}},
    {product:'id-only',label:'New Indonesia Item',aud:null,regionalUnmatched:true,
      indonesia:{basis:'verified',amount:50000,observed:'2026-11-12'},india:null}
  ];
  const result = R.coverage(rows,Date.parse('2026-11-13T00:00:00Z'));
  assert.equal(result.total,3);
  assert.equal(result.auVerified,2);
  assert.equal(result.idVerified,1);
  assert.equal(result.inVerified,0);
  assert.deepEqual(result.unlabelled,['store-legacy']);
  assert.deepEqual(result.unpaired,['Raid Commander Box','New Indonesia Item']);
  assert.deepEqual(result.missingAu,['New Indonesia Item']);
  assert.deepEqual(result.missingId,['store-legacy']);
  assert.deepEqual(result.missingIn,['store-legacy','New Indonesia Item']);
  assert.deepEqual(result.unverifiedId,['Raid Commander Box']);
  assert.deepEqual(result.unverifiedIn,['Raid Commander Box']);
  assert.deepEqual(result.reviewDue,['Australia · store-legacy']);
  assert.equal(R.coverage(rows,Date.parse('2026-11-13T00:00:00Z'),60).reviewDue.length,0);
  assert.equal(R.coverage([],0).total,0);
});

test('official descriptions preserve exact historic pass variants and original AUD observations', () => {
  const records = require('../public/prices.json').prices;
  const expected = {
    'go-pass-oct-deluxe': ['GO Pass Deluxe: October',12.99,0,1],
    'go-pass-oct-deluxe-10': ['GO Pass Deluxe: October + 10 Ranks',14.99,10,2],
    'go-pass-oct-ultrabox': ['GO Pass Deluxe: October Ultra Box',22.99,10,5],
    'go-pass-fall-deluxe': ['GO Pass Deluxe: Fall Marathon',7.99,0,1],
    'go-pass-fall-deluxe-6': ['GO Pass Deluxe: Fall Marathon + 6 Ranks',10.99,6,2],
    'go-pass-fall-ultrabox': ['GO Pass Deluxe: Fall Marathon + 6 Ranks Ultra Box',13.99,6,5],
    'wild-area-2026-global-ultra-box': ['Pokémon GO Wild Area 2026: Global Ultra Ticket Box',17.99,0,3]
  };
  for (const [id,[name,aud,ranks,passes]] of Object.entries(expected)) {
    const observed=records.filter(p=>p.product===id && p.region==='AU' && p.currency==='AUD');
    assert.ok(observed.length>0,id+' remains in official AU history');
    for (const p of observed) {
      assert.equal(p.amount,aud,'original Australian observation must not be changed');
      assert.equal(p.label,name);
      assert.equal(p.disableRegionalEstimates,true);
      assert.match(p.contentsSource,/^https:\/\/(?:pokemongo\.com|store\.pokemongo\.com)\//);
      assert.ok(Array.isArray(p.contents));
      assert.equal(p.contents.find(i=>i.item==='Bonus Ranks')?.quantity||0,ranks);
      assert.equal(p.contents.find(i=>i.item==='Premium Battle Pass')?.quantity,passes);
      assert.ok(p.contents.every(i=>Number.isSafeInteger(i.quantity)&&i.quantity>0));
    }
  }
  const fall=records.find(p=>p.product==='go-pass-fall-ultrabox'&&p.region==='AU');
  assert.equal(fall.contents.find(i=>i.item==='Egg Incubator').quantity,1);
  assert.equal(fall.contents.find(i=>i.item==='Super Incubator').quantity,1);
  const ticket=records.find(p=>p.product==='wild-area-2026-global-ultra-box'&&p.region==='AU');
  assert.equal(ticket.contents.find(i=>i.item==='Max Particles').quantity,800);
  assert.equal(ticket.contents.find(i=>i.item==='Pokémon GO Wild Area 2026: Global Ticket').quantity,1);
  const rows=R.catalogue(records,OBS,NOW);
  assert.equal(rows.filter(r=>Object.hasOwn(expected,r.product)).length,7,
    'seven named historic AU offers appear once each even where price history has multiple dates');
  for (const row of rows.filter(r=>Object.hasOwn(expected,r.product)))
    assert.equal(row.indonesia,null,'named historical item must not invent any Indonesian checkout estimate');
});

test('official current November pass listings remain unpriced and preserve exact published variants', () => {
  const official = require('../public/store-offer-identities.js');
  const prices = require('../public/prices.json').prices;
  assert.equal(official.length,3,'three independently announced November product variants');
  const rows = R.catalogue(prices, OBS, NOW, official);
  const sourceOnly=rows.filter(p=>p.unpricedOfficial);
  assert.equal(sourceOnly.length,3);
  const expected = [
    ['GO Pass Deluxe: November',0,1],
    ['GO Pass Deluxe: November + 10 Ranks',10,2],
    ['GO Pass Deluxe: November Ultra Box',10,5]
  ];
  for(const [label,ranks,passes] of expected){
    const item=sourceOnly.find(p=>p.label===label);
    assert.ok(item,'missing official listing: '+label);
    assert.equal(item.aud,null,'US public product descriptions are not an AU checkout price');
    if (label === 'GO Pass Deluxe: November + 10 Ranks') {
      assert.equal(item.indonesia,null,'unobserved rank tier must stay unknown');
    } else {
      assert.equal(item.indonesia?.basis,'estimate','matching tier can show low-confidence model');
      assert.equal(item.indonesia?.confidence,'low');
      assert.ok(item.indonesia.min < item.indonesia.max);
    }
    assert.equal(item.india,null,'unrelated in-app event pass cannot price the monthly tier');
    assert.equal(item.contentsSource,'https://pokemongo.com/news/go-pass-november-2026');
    assert.equal(item.contents.find(x=>x.item==='Bonus Ranks')?.quantity||0,ranks);
    assert.equal(item.contents.find(x=>x.item==='Premium Battle Pass').quantity,passes);
  }
  const aggregate=R.coverage(rows,NOW);
  assert.equal(aggregate.sourceOnly.length,3);
  assert.ok(aggregate.missingAu.includes('GO Pass Deluxe: November Ultra Box'));
  assert.ok(aggregate.unverifiedId.includes('GO Pass Deluxe: November Ultra Box'),
    'only a labelled estimate exists, not a checkout quote');
  assert.ok(aggregate.missingIn.includes('GO Pass Deluxe: November Ultra Box'));

  const regional=[id('GO Pass Deluxe: November','monthly-pass',41000,{sourceSku:'regional-unmatched',id:'regional-november'})];
  const separate=R.catalogue([],regional,NOW,official);
  assert.equal(separate.filter(p=>p.label==='GO Pass Deluxe: November').length,2,
    'a region-only offer must stay separate from an announcement without a common SKU');
  assert.equal(separate.find(p=>p.unpricedOfficial).indonesia,null);
  assert.equal(separate.find(p=>!p.unpricedOfficial).indonesia.amount,41000);
  assert.equal(R.catalogue([],[],NOW,[]).length,0);
});
