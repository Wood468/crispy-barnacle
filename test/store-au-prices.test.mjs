import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAUD,updatePrices} from '../scripts/store-au-prices.mjs';
const base = () => ({prices:[{product:'store-a',label:'Example Box',group:'Boxes',currency:'AUD',region:'AU',amount:12.99,verified:true,observed:'2026-11-01'}]});
test('only explicit Australian dollar prices parse',()=>{
  assert.equal(parseAUD('A$14.99'),14.99);
  for (const s of ['$14.99','Rp 150.000','₹439','AU$14.99','A$0']) assert.equal(parseAUD(s),null);
});
test('mixed-currency snapshots never change Australian prices',()=>{
  const r=updatePrices(base(),{fetched:'2026-11-09T00:00:00Z',items:[{name:'Example Box',price:'A$9.99'},{name:'X',price:'$1.99'},{name:'Y',price:'A$2.99'}]});
  assert.equal(r.changed,0);
});
test('only exact known products update, with verified source',()=>{
  const r=updatePrices(base(),{fetched:'2026-11-09T00:00:00Z',items:[{name:'Example Box',price:'A$9.99'},{name:'Unknown',price:'A$2.99'},{name:'Other',price:'A$3.99'}]});
  assert.equal(r.changed,1);
  assert.equal(r.data.prices.at(-1).amount,9.99);
  assert.equal(r.data.prices.at(-1).verified,true);
});
