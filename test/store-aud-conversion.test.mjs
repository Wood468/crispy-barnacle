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
  const el = {innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
  const host = {parentNode:{insertBefore:()=>{}}};
  const prices = {owner:true,prices:[],regional:OBSERVATIONS};
  const win = {GOStoreFX:FX,GORegionalPrices:R,
    fetch:()=>new Promise(resolve=>{resolveFx=resolve;}),
    GOLIB:{esc:s=>String(s),loadPrices:async()=>prices},
    localStorage:{getItem:()=>null,setItem(){}},console};
  const doc={readyState:'complete',getElementById:id=>id==='evsource'?host:id==='storep-host'?el:null,
    createElement:()=>el,addEventListener(){}};
  win.window=win;win.document=doc;
  vm.runInNewContext(fs.readFileSync(new URL('../public/store.js',import.meta.url),'utf8'),win);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(typeof resolveFx,'function');
  assert.match(el.innerHTML,/Rp 76,000/);
  assert.match(el.innerHTML,/₹/);
  assert.doesNotMatch(el.innerHTML,/sp-aud-reference/);
  assert.doesNotMatch(el.innerHTML,/undefined|NaN/);
  // An unobserved first product is valid; inspect the cell with this sourced Rp price.
  const idCells = [...el.innerHTML.matchAll(/Indonesia <small>Web<\\/small><\\/span>([\\s\\S]*?)<\\/div>/g)]
    .map(match => match[1]);
  const pricedCell = idCells.find(cell => cell.includes('Rp 76,000'));
  assert.ok(pricedCell, 'expected the observed Indonesian market cell');
  assert.equal((pricedCell.match(/class="sp-aud-equivalent"/g)||[]).length,1);
  assert.ok(pricedCell.indexOf('sp-aud-equivalent')<pricedCell.indexOf('Rp 76,000'));
  assert.match(pricedCell,/A\\$ rate unavailable/);
  assert.ok(idCells.some(cell => cell.includes('Not observed')),
    'unobserved prices remain explicitly labelled');
  resolveFx({ok:true,json:async()=>({result:'success',base_code:'AUD',
    time_last_update_unix:Date.parse('2026-11-12')/1000,rates:{IDR:11000,INR:60}})});
});
