const assert = require('node:assert/strict');
const {test} = require('node:test');
const r = require('../public/regional-prices.js');
test('only category-matched observed ratios can produce estimates', () => {
  assert.equal(r.estimate(10, 'ID', 'tickets'), null);
  assert.equal(r.estimate(10, 'IN', 'bundles'), null);
  const p = r.estimate(22.99, 'IN', 'tickets');
  assert.equal(p.amount, 439);
  assert.equal(p.basis, 'estimated');
  assert.equal(p.confidence, 'low');
});
test('Indonesian observations must be Web, not in-app', () => {
  assert.equal(r.estimate(10,'ID','items',[{region:'ID',channel:'in-app',category:'items',aud:10,local:50000}]), null);
  assert.equal(r.estimate(10,'ID','items',[{region:'ID',channel:'web',category:'items',aud:10,local:50000}]).amount, 50000);
});
test('catalogue uses latest verified Australian price, not USD or unverified entries', () => {
  const rows = r.catalogue([
    {product:'store-a',currency:'AUD',region:'AU',amount:10,verified:true,observed:'2026-11-01',label:'Example ticket',group:'Tickets'},
    {product:'store-a',currency:'AUD',region:'AU',amount:12,verified:true,observed:'2026-11-09',label:'Example ticket',group:'Tickets'},
    {product:'store-a',currency:'AUD',region:'AU',amount:3,verified:false,observed:'2026-11-10'},
    {product:'store-b',currency:'USD',region:'global',amount:1,verified:true}
  ]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].aud,12);
  assert.equal(rows[0].india.basis,'estimated');
  assert.equal(rows[0].indonesia,null);
});
test('paired confirmed observations calibrate IDR without inventing exchange rates', () => {
  const rows = [
    {product:'store-item',currency:'AUD',region:'AU',amount:5,verified:true,observed:'2026-11-08',group:'Items'},
    {product:'store-item',currency:'IDR',region:'ID',amount:40000,verified:true,channel:'web',observed:'2026-11-09'},
  ];
  assert.equal(r.estimate(10,'ID','items',r.observations(rows)).amount,80000);
});

test('unknown regional channel and invalid dates cannot calibrate local prices', () => {
  const au={product:'store-item',currency:'AUD',region:'AU',amount:5,verified:true,observed:'2026-11-08',group:'Items'};
  const local={product:'store-item',currency:'IDR',region:'ID',amount:40000,verified:true,observed:'2026-11-09'};
  assert.equal(r.estimate(10,'ID','items',r.observations([au,local])),null);
  assert.equal(r.estimate(10,'ID','items',r.observations([au,{...local,channel:'web',observed:'not-a-date'}])),null);
});
