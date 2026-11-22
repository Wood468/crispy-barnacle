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
  // Freeze the clock the page code sees: store.js passes no `now` to retrieve(), so bind NOW
  // explicitly, and give the vm a frozen Date, so the fixture dates never age out.
  class FrozenDate extends Date { constructor(...args){ args.length ? super(...args) : super(NOW); } static now(){ return NOW; } }
  const clockedFx = {...FX, retrieve:(fetchImpl,ownerFx,_now,maxWaitMs,committedFx)=>FX.retrieve(fetchImpl,ownerFx,NOW,maxWaitMs,committedFx)};
  const win = {GOStoreFX:clockedFx,GORegionalPrices:R,Date:FrozenDate,
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
  // Assert against the specific sourced region cell, not the first product.
  const cells = region => [...el.innerHTML.matchAll(new RegExp('<div class="sp-price[^"]*" data-sp-region="'+region+'"[\\s\\S]*?</div>','g'))].map(m => m[0]);
  const pricedCell = cells('ID').find(cell => cell.includes('Rp 76,000'));
  assert.ok(pricedCell, 'expected an observed Indonesian price cell');
  assert.doesNotMatch(pricedCell, /aria-label=/,
    'VoiceOver must not conceal AUD reference behind a local-only parent label');
  assert.equal((pricedCell.match(/class="sp-aud-equivalent"/g)||[]).length,1);
  assert.ok(pricedCell.indexOf('class="sp-aud-equivalent"')<pricedCell.indexOf('class="sp-local-price"'),
    'AUD placeholder precedes the visible local-price element (not its aria-label)');
  assert.doesNotMatch(pricedCell,/rate unavailable/,'no sentence while the reference rate is pending; the node is just empty');
  assert.match(pricedCell,/<strong class="sp-aud-equivalent"[^>]*><\/strong>/);
  assert.ok(cells('ID').some(cell => cell.includes('class="sp-none"')),
    'unobserved regional prices are a quiet dash');
  assert.doesNotMatch(el.innerHTML,/Not observed/);
  const inPriced=cells('IN').find(x=>x.includes('₹'));
  assert.ok(inPriced,'expected an observed Indian local price');
  assert.doesNotMatch(inPriced,/aria-label=/,'INR local-only label cannot mask AUD conversion');
  assert.ok(inPriced.indexOf('class="sp-aud-equivalent"')<inPriced.indexOf('class="sp-local-price"'),
    'India also reads its AUD reference before local INR amount');
  resolveFx({ok:true,json:async()=>({result:'success',base_code:'AUD',
    time_last_update_unix:Date.parse('2026-11-12')/1000,rates:{IDR:11000,INR:60}})});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.match(idAud.textContent,/≈ A\$6\.91/,'fresh IDR FX fills the AUD reference');
  assert.match(inAud.textContent,/≈ A\$7\.32/,'fresh INR FX fills the AUD reference');
  for (const node of [idAud,inAud]) {
    assert.equal(node.notes.length,0,'no visible FX provenance line: the source and date live in the tooltip');
    assert.match(node.attrs.title,/Approximate AUD reference.*12 Nov|Approximate AUD reference/);
    assert.doesNotMatch(node.textContent,/FX ·/);
  }
  assert.match(el.innerHTML,/Rp 76,000/,'original IDR price remains visible');
  assert.match(el.innerHTML,/₹/,'original INR price remains visible');
});

test('converted A$ leads visually; local price stays prominent when no conversion is shown', () => {
  const css = fs.readFileSync(new URL('../public/dash.css', import.meta.url), 'utf8');
  const aud = css.match(/\.storep-regional \.sp-aud-equivalent\{([^}]*)\}/)[1];
  assert.match(aud, /font-weight:750/, 'A$ line is bold');
  assert.doesNotMatch(aud, /font-weight:400/);
  assert.match(css, /\.sp-aud-equivalent:empty\{display:none\}/, 'pending FX hides the empty A$ node');
  const local = css.match(/\.storep-regional \.sp-aud-equivalent:not\(:empty\)\+\.sp-local-price\{([^}]*)\}/);
  assert.ok(local, 'local price is demoted only next to a non-empty A$ line');
  assert.match(local[1], /font-weight:400/);
  const base = css.match(/\.storep-regional \.sp-local-price\{([^}]*)\}/)[1];
  assert.match(base, /font-weight:750/, 'native/estimate/no-FX local prices stay bold by default');
});

/* Committed fallback rate file (public/fx-rates.json). */
const FILE = JSON.parse(fs.readFileSync(new URL('../public/fx-rates.json', import.meta.url), 'utf8'));
const FRESH = Date.parse('2026-11-18T00:00:00Z');

test('committed fx-rates.json is AUD-based with dated IDR and INR rates', () => {
  assert.equal(FILE.base, 'AUD');
  assert.ok(FILE.rates.IDR > 1000 && FILE.rates.INR > 10);
  assert.match(FILE.asOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(FILE.source);
});

test('committed fallback converts IDR and INR when the live provider is unavailable', async () => {
  const quotes = await FX.retrieve(() => Promise.reject(Error('offline')), undefined, FRESH, undefined, FILE);
  assert.equal(FX.display({ amount: 76000, currency: 'IDR' }, quotes).text, '≈ A$6.18');
  assert.equal(FX.display({ amount: 439, currency: 'INR' }, quotes).text, '≈ A$6.98');
  assert.equal(quotes.INR.observed, '2026-11-17');
});

test('committed fallback accepts a promised file and ignores a failed one', async () => {
  const ok = await FX.retrieve(null, undefined, FRESH, undefined, Promise.resolve(FILE));
  assert.ok(ok.INR);
  assert.deepEqual(await FX.retrieve(null, undefined, FRESH, undefined, Promise.reject(Error('x'))), {});
  assert.deepEqual(await FX.retrieve(null, undefined, FRESH), {});
});

test('estimate ranges convert to an A$ range', () => {
  const quotes = FX.committed(FILE, FRESH);
  assert.equal(FX.display({ min: 68000, max: 84000, currency: 'IDR' }, quotes).text, '≈ A$5.53–A$6.83');
  assert.equal(FX.display({ min: 400, max: 500, currency: 'INR' }, quotes).text, '≈ A$6.36–A$7.95');
});

test('stale committed rates (over 45 days) hide the A$ line', () => {
  const day = 86400000, asOf = Date.parse(FILE.asOf);
  assert.ok(FX.committed(FILE, asOf + 45 * day).IDR);
  assert.deepEqual(FX.committed(FILE, asOf + 46 * day), {});
  assert.equal(FX.display({ amount: 1000, currency: 'IDR' }, FX.committed(FILE, asOf + 90 * day)), null);
});

test('unparseable prices or malformed files hide the A$ line', () => {
  const quotes = FX.committed(FILE, FRESH);
  assert.equal(FX.display({ amount: 'abc', currency: 'IDR' }, quotes), null);
  assert.equal(FX.display({ amount: NaN, currency: 'INR' }, quotes), null);
  assert.equal(FX.display({ amount: 0, currency: 'INR' }, quotes), null);
  assert.deepEqual(FX.committed({ base: 'USD', rates: { IDR: 1, INR: 1 }, asOf: '2026-11-17' }, FRESH), {});
  assert.deepEqual(FX.committed({ base: 'AUD', rates: { IDR: 0, INR: 'x' }, asOf: '2026-11-17' }, FRESH), {});
  assert.deepEqual(FX.committed({ base: 'AUD', rates: FILE.rates, asOf: 'nope' }, FRESH), {});
});

test('amounts round to cents', () => {
  const quotes = FX.committed(FILE, FRESH);
  assert.equal(FX.display({ amount: 12300, currency: 'IDR' }, quotes).text, '≈ A$1.00');
  assert.equal(FX.display({ amount: 63, currency: 'INR' }, quotes).text, '≈ A$1.00');
});

test('Store renders est. ranges with an A$ range placeholder and a rates-as-of footer note', () => {
  const src = fs.readFileSync(new URL('../public/store.js', import.meta.url), 'utf8');
  assert.match(src, /data-sp-aud-max/);
  assert.match(src, /A\$ equivalents are approximate \(rates as of /);
  assert.match(src, /\/fx-rates\.json/);
});
