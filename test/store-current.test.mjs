import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {buildCurrentSnapshot,safeStoreImage} from '../scripts/store-current-snapshot.mjs';
const require=createRequire(import.meta.url);
const R=require('../public/regional-prices.js');
const day=86400000;
const now=Date.parse('2026-11-14T00:00:00Z');
const live={version:1,updated:'2026-11-13T08:00:30Z',items:[
 {name:'GO Pass Deluxe: November',slug:'web-event-pass-base-november-26',seenAt:'2026-11-13T08:00:30Z',image:null},
 {name:'Pokémon Storage',slug:'web-pokemon-storage-bundle',seenAt:'2026-11-13T08:00:30Z',
  image:'https://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/pokemon-storage/w256.webp'},
 {name:'Lucky Egg',slug:'web-luckyegg-bundle-8',seenAt:'2026-11-13T08:00:30Z',image:null}
]};
const rows=[
 {label:'GO Pass Deluxe: October',aud:12.99},
 {label:'GO Pass Deluxe: November',unpricedOfficial:true},
 {label:'Pokémon Storage +1',aud:2.99},
 {label:'Lucky Egg x8',aud:7.99},
 {label:'GO Pass Deluxe: Fall Marathon',aud:7.99}
];
test('only current exact official listings enter default Store catalogue',()=>{
 const r=R.currentCatalogue(rows,live,now);
 assert.deepEqual(r.current.map(x=>x.label),['GO Pass Deluxe: November','Pokémon Storage +1','Lucky Egg x8']);
 assert.deepEqual(r.historical.map(x=>x.label),['GO Pass Deluxe: October','GO Pass Deluxe: Fall Marathon']);
 assert.equal(r.current[1].storeArt,live.items[1].image);
});
test('storefront staleness, malformed and future dates fail closed',()=>{
 for(const source of [null,{}, {...live,updated:'2026-11-10T00:00:00Z'},
   {...live,updated:'2026-11-15T00:00:00Z'},{...live,version:0}]){
   const r=R.currentCatalogue(rows,source,now);
   assert.equal(r.current.length,0);
   assert.equal(r.historical.length,rows.length);
   assert.equal(r.stale,true);
 }
 const spoof={...live,items:[{...live.items[1],image:'https://fake.example/x.webp'}]};
 assert.equal(R.currentCatalogue(rows,spoof,now).current.find(x=>x.label==='Pokémon Storage +1').storeArt,null);
});
test('ambiguous same-name source observations cannot prove an exact SKU',()=>{
 const source={...live,items:[...live.items,{...live.items[0],slug:'different-offer'}]};
 assert.equal(R.currentCatalogue(rows,source,now).current.some(x=>x.label==='GO Pass Deluxe: November'),false);
});
test('snapshot exporter strips prices and rejects reused art',()=>{
 const a='https://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/genericbox/w256.webp';
 const state={items:{
   '/purchase/item/pass-one':{name:'Pass One',lastSeen:live.updated,price:'$9.99',images:[a]},
   '/purchase/item/pass-two':{name:'Pass Two',lastSeen:live.updated,price:'$24.99',images:[a]},
   '/purchase/item/storage':{name:'Pokémon Storage',lastSeen:live.updated,images:[live.items[1].image]},
   '/purchase/item/old':{name:'Old',lastSeen:'2026-10-01T00:00:00Z',price:'$2'}
 }};
 const out=buildCurrentSnapshot(state);
 assert.equal(out.items.length,3);
 assert.equal(out.items.find(x=>x.name==='Pass One').image,null);
 assert.equal(out.items.find(x=>x.name==='Pass Two').image,null);
 assert.equal(out.items.find(x=>x.name==='Pokémon Storage').image,live.items[1].image);
 assert.equal(JSON.stringify(out).includes('$24.99'),false);
 assert.equal(safeStoreImage('https://evil.example/pgo/image_variants/v1/sku_assets/a/w256.webp'),null);
});
test('source-only official November product receives only labelled comparable estimate',()=>{
 const obs=[{region:'ID',channel:'web',currency:'IDR',product:'Monthly GO Pass Deluxe',
  kind:'monthly-pass',amount:41000,status:'verified',observed:'2026-11-09'}];
 const offers=[{id:'official:november',label:'GO Pass Deluxe: November',sourceUrl:'https://pokemongo.com/news/go-pass-november-2026',contents:[],noPriceObservation:true}];
 const announced=R.catalogue([],obs,now,offers).find(x=>x.unpricedOfficial);
 assert.ok(announced);
 assert.equal(announced.indonesia,null,'announcement alone cannot supply even a modelled price');
 const row=R.currentCatalogue([announced],live,now,obs).current.find(x=>x.unpricedOfficial);
 assert.ok(row);
 assert.equal(row.indonesia?.basis,'estimate');
 assert.ok(row.indonesia.min<row.indonesia.max);
 assert.equal(row.india,null);
});
