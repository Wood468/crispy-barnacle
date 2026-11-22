import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const require=createRequire(import.meta.url);
const R=require('../public/regional-prices.js');
const source=readFileSync(new URL('../public/store.js',import.meta.url),'utf8');
const real=JSON.parse(readFileSync(new URL('../public/store-current-snapshot.json',import.meta.url),'utf8'));

async function render(items){
  const el={innerHTML:'',addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}};
  const host={parentNode:{insertBefore(){}}};
  const prices=items.map((it,i)=>({product:'store-ends-'+i,label:it.name,group:'Items',region:'AU',currency:'AUD',amount:2.99,verified:true,observed:'2026-11-13'}));
  const snapshot={version:1,updated:new Date().toISOString(),items:items.map(it=>({name:it.name,href:'/x',image:null,lastSeen:new Date().toISOString(),endsAt:it.endsAt,goneAt:null})),gone:[]};
  const doc={readyState:'complete',getElementById:id=>id==='evsource'?host:null,createElement:()=>el,addEventListener(){}};
  const win={document:doc,GORegionalPrices:R,console,setTimeout,clearTimeout,Date,Intl,fetch:()=>Promise.resolve({ok:true,json:()=>Promise.resolve(snapshot)}),
    GOLIB:{esc:v=>String(v),loadPrices:()=>Promise.resolve({owner:true,prices,regional:[]}),priceView:()=>({main:'',sub:'',save:''})}};
  win.window=win;
  vm.runInNewContext(source,win)
  await new Promise(r=>setTimeout(r,40));
  return [...el.innerHTML.matchAll(/<article class="sp-product"[\s\S]*?<\/article>/g)].map(m=>m[0]);
}

test('a Store card shows its known end time in Melbourne time; others show nothing',async()=>{
  const cards=await render([{name:'Max Potion',endsAt:'2099-11-25T11:00:00.000Z'},{name:'Max Revive',endsAt:null}]);
  assert.equal(cards.length,2);
  assert.match(cards[0],/data-sp-ends[^>]*>Ends \w{3} 25 Nov, 10:00 pm</);
  assert.doesNotMatch(cards[1],/sp-ends/);
});

test('an end time already past reads "Ended"',async()=>{
  const cards=await render([{name:'Max Potion',endsAt:'2020-11-25T11:00:00.000Z'}]);
  assert.match(cards.join(''),/Ended \w{3} 25 Nov, 10:00 pm/);
});

test('the committed snapshot carries endsAt only for a minority of items',()=>{
  const n=real.items.filter(i=>i.endsAt).length;
  assert.ok(real.items.every(i=>i.endsAt==null||!isNaN(Date.parse(i.endsAt))));
  assert.ok(n<real.items.length);
});
