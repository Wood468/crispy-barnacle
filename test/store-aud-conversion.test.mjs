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
  /* Simulate the actual dated-reference node: the async provider must fill
     the A$ amount without replacing the separate, observed local price. */
  const audAttrs={'data-sp-aud-currency':'IDR','data-sp-aud-min':'76000'};
  const audNode={textContent:'',notes:[],getAttribute:key=>audAttrs[key]??null,
    setAttribute:(key,value)=>{audAttrs[key]=value;},
    appendChild(node){this.notes.push(node);}};
  const el={innerHTML:'',querySelector:()=>null,
    querySelectorAll:key=>key==='[data-sp-aud-currency]'?[audNode]:[],addEventListener(){}};
  const host = {parentNode:{insertBefore:()=>{}}};
  // An Australian-only verified item guarantees an honest unobserved ID/IN cell.
  const prices = {owner:true,prices:[{product:'store-test-au-only',label:'AU-only fixture',
    region:'AU',currency:'AUD',verified:true,amount:5,group:'Items',observed:'2026-11-12'}],regional:OBSERVATIONS};
  const win = {GOStoreFX:FX,GORegionalPrices:R,
    fetch:()=>new Promise(resolve=>{resolveFx=resolve;}),
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
  /* A parent aria-label containing only the local Rp amount masks the
     child AUD reference in VoiceOver, despite correct visual ordering. */
  assert.doesNotMatch(pricedCell, /<span class="sp-regional-value sp-ver" aria-label=/,
    'regional values must expose both the AUD reference and the local checkout price to a screen reader');
  assert.match(pricedCell, /title="Australian dollar reference conversion not available"/,
    'unknown FX remains an explicit status, not a guessed checkout rate');
  assert.match(pricedCell, /<small>Verified ·/,'source state and observation date remain readable');
  assert.equal((pricedCell.match(/class="sp-aud-equivalent"/g)||[]).length,1);
  assert.ok(pricedCell.indexOf('class="sp-aud-equivalent"')<pricedCell.indexOf('class="sp-local-price"'),
    'AUD placeholder precedes the visible local-price element (not its aria-label)');
  assert.match(pricedCell,/A\$ rate unavailable/);
  assert.ok(idCells.some(cell => cell.includes('Not observed')),
    'unobserved regional prices remain explicitly labelled');
  resolveFx({ok:true,json:async()=>({result:'success',base_code:'AUD',
    time_last_update_unix:Date.parse('2026-11-12')/1000,rates:{IDR:11000,INR:60}})});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.match(audNode.textContent,/≈ A\$6\.91/,'verified IDR observation receives converted AUD once FX loads');
  assert.equal(audNode.notes.length,1,'dated FX provenance is appended once');
  assert.equal(audNode.notes[0].textContent,'FX · 12 Nov 2026');
  assert.match(audAttrs.title,/Approximate AUD reference/);
  assert.match(el.innerHTML,/Rp 76,000/,'original local checkout amount is never overwritten');
});
