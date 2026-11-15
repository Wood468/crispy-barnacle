import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { OBSERVATIONS } from '../src/regional-observations.js';

const require = createRequire(import.meta.url);
const FX = require('../public/store-fx.js');
const R = require('../public/regional-prices.js');
const NOW = Date.parse('2026-11-13T00:00:00Z');

test('AUD conversions use only fresh, validated provider rates', () => {
  const good = FX.fromApi({ result:'success', base_code:'AUD',
    time_last_update_unix: Date.parse('2026-11-12') / 1000,
    rates:{ IDR:11000, INR:60 } }, NOW);
  assert.equal(FX.display({amount:110000,currency:'IDR'},good).text,'≈ A$10.00');
  assert.equal(FX.display({amount:600,currency:'INR'},good).text,'≈ A$10.00');
  assert.equal(FX.display({min:600,max:1200,currency:'INR'},good).text,'≈ A$10.00–A$20.00');
  assert.equal(FX.fromApi({result:'success',base_code:'USD',rates:{IDR:11000,INR:60},time_last_update_unix:Date.parse('2026-11-12')/1000},NOW),null);
  assert.equal(FX.fromApi({result:'success',base_code:'AUD',rates:{IDR:11000,INR:60},time_last_update_unix:Date.parse('2026-01-01')/1000},NOW),null);
  assert.equal(FX.display({amount:100,currency:'INR'},{}),null);
});

test('FX provider outage retains only a fresh owner-sourced IDR quote', async () => {
  const fx = {from:'IDR',to:'AUD',rate:0.00009,source:'recorded',observed:'2026-11-12'};
  const fallback = await FX.retrieve(() => Promise.reject(Error('offline')),fx,NOW);
  assert.equal(FX.display({amount:100000,currency:'IDR'},fallback).text,'≈ A$9.00');
  assert.equal(FX.display({amount:600,currency:'INR'},fallback),null);
  assert.deepEqual(await FX.retrieve(null,{...fx,observed:'2026-01-01'},NOW),{});
});

test('owner Store shows one AUD placeholder before each local price without waiting for FX', async () => {
  let resolveFx;
  function fxNode(currency, amount) {
    const attrs={'data-sp-aud-currency':currency,'data-sp-aud-min':String(amount)};
    return {textContent:'',notes:[],attrs,getAttribute:key=>attrs[key]??null,
      setAttribute:(key,value)=>{attrs[key]=value;},
      appendChild(node){this.notes.push(node);}};
  }
  const idAud=fxNode('IDR',76000), inAud=fxNode('INR',439);
  const el={innerHTML:'',querySelector:()=>null,
    querySelectorAll:key=>key==='[data-sp-aud-currency]'?[idAud,inAud]:[],addEventListener(){}};
  const host = {parentNode:{insertBefore:()=>{}}};
  // An Australian-only verified item guarantees an honest unobserved ID/IN cell.
  const prices = {owner:true,prices:[{product:'store-test-au-only',label:'AU-only fixture',
    region:'AU',currency:'AUD',verified:true,amount:5,group:'Items',observed:'2026-11-12'}],regional:OBSERVATIONS};
  const win = {GOStoreFX:FX,GORegionalPrices:R,
    fetch:url=>url==='/store-current-snapshot.json' ? Promise.resolve({ok:false}) : new Promise(resolve=>{resolveFx=resolve;}),
    GOLIB:{esc:s=>String(s),loadPrices:async()=>prices},
    localStorage:{getItem:()=>null,setItem(){}},console};
  const doc={readyState:'complete',getElementById:id=>id==='evsource'?host:id==='storep-host'?el:null,
    createElement:tag=>tag==='small'?{className:'',textContent:''}:el,addEventListener(){}};
  win.window=win;win.document=doc;
  vm.runInNewContext(fs.readFileSync(new URL('../public/store.js',import.meta.url),'utf8'),win);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(typeof resolveFx,'function');
  assert.match(el.innerHTML,/Rp 76,000/);
  assert.match(el.innerHTML,/₹/);
  assert.doesNotMatch(el.innerHTML,/sp-aud-reference/);
  assert.doesNotMatch(el.innerHTML,/undefined|NaN/);
  // Some catalogue products legitimately have no Indonesian observation.
  // Assert against the specific sourced market cell, not the first product.
  const idCells = [...el.innerHTML.matchAll(/(?:<span aria-hidden="true">🇮🇩<\/span> )?Indonesia <small>Web<\/small><\/span>([\s\S]*?)<\/div>/g)]
    .map(match => match[1]);
  const pricedCell = idCells.find(cell => cell.includes('Rp 76,000'));
  assert.ok(pricedCell, 'expected an observed Indonesian market cell');
  assert.doesNotMatch(pricedCell, /<span class="sp-regional-value sp-ver" aria-label=/,
    'VoiceOver must not conceal AUD reference behind local-only parent label');
  assert.equal((pricedCell.match(/class="sp-aud-equivalent"/g)||[]).length,1);
  assert.ok(pricedCell.indexOf('class="sp-aud-equivalent"')<pricedCell.indexOf('class="sp-local-price"'),
    'AUD placeholder precedes the visible local-price element (not its aria-label)');
  assert.match(pricedCell,/A\$ rate unavailable/);
  assert.ok(idCells.some(cell => cell.includes('Not observed')),
    'unobserved regional prices remain explicitly labelled');
  const inCells=[...el.innerHTML.matchAll(/(?:<span aria-hidden="true">🇮🇳<\/span> )?India <small>in-app<\/small><\/span>([\s\S]*?)<\/div>/g)].map(x=>x[1]);
  const inPriced=inCells.find(x=>x.includes('₹'));
  assert.ok(inPriced,'expected an observed Indian local price');
  assert.doesNotMatch(inPriced,/<span class="sp-regional-value sp-ver" aria-label=/,
    'INR local-only label cannot mask AUD conversion');
  assert.ok(inPriced.indexOf('class="sp-aud-equivalent"')<inPriced.indexOf('class="sp-local-price"'),
    'India also reads its AUD reference before local INR amount');
  resolveFx({ok:true,json:async()=>({result:'success',base_code:'AUD',
    time_last_update_unix:Date.parse('2026-11-12')/1000,rates:{IDR:11000,INR:60}})});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.match(idAud.textContent,/≈ A\$6\.91/,'fresh IDR FX fills the AUD reference');
  assert.match(inAud.textContent,/≈ A\$7\.32/,'fresh INR FX fills the AUD reference');
  for (const node of [idAud,inAud]) {
    assert.equal(node.notes.length,1,'one dated FX source note per regional price');
    assert.equal(node.notes[0].textContent,'FX · 12 Nov 2026');
    assert.match(node.attrs.title,/Approximate AUD reference/);
  }
  assert.match(el.innerHTML,/Rp 76,000/,'original IDR price remains visible');
  assert.match(el.innerHTML,/₹/,'original INR price remains visible');
});
