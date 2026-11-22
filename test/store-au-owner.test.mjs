import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {applyOwnerInput} from '../scripts/store-au-owner.mjs';
import {updatePrices} from '../scripts/store-au-prices.mjs';
const require = createRequire(import.meta.url);
const R = require('../public/regional-prices.js');
const TODAY = '2026-11-15';
const snapshot = () => ({items:[{name:'GO Pass Deluxe: November'},{name:'GO Pass Deluxe: November Ultra Box'},{name:'Brand New Box'}]});
const base = () => ({prices:[
  {product:'store-lucky-egg-x8',label:'Lucky Egg x8',group:'Items',currency:'AUD',amount:7.99,region:'AU',verified:true,observed:'2026-10-12'},
  {product:'go-pass-oct-deluxe',label:'GO Pass Deluxe: October',currency:'AUD',amount:12.99,region:'AU',verified:true,observed:'2026-10-12',url:'https://store.pokemongo.com/'}]});
const input = (items, extra = {}) => ({observed:'2026-11-14', items, ...extra});
const apply = (inp, data = base()) => applyOwnerInput(data, inp, snapshot(), {today:TODAY});

test('adds verified AU entries for current offers with the real observation date', () => {
  const r = apply(input([{label:'GO Pass Deluxe: November', price:'A$12.99'},{label:'GO Pass Deluxe: November Ultra Box', price:'A$22.99'}]));
  assert.deepEqual(r.errors, []);
  assert.equal(r.changed, 2);
  const e = r.data.prices.find(p => p.label === 'GO Pass Deluxe: November');
  assert.equal(e.product, 'store-go-pass-deluxe-november'); // same id the buy planner derives
  assert.equal(e.region, 'AU'); assert.equal(e.currency, 'AUD'); assert.equal(e.verified, true);
  assert.equal(e.amount, 12.99); assert.equal(e.observed, '2026-11-14');
  assert.match(e.source, /owner/i);
});
test('re-verifying a known product reuses its id and appends a fresher entry', () => {
  const r = apply(input([{label:'lucky egg x8', price:'A$7.99'}]));
  assert.equal(r.changed, 1);
  const last = r.data.prices.at(-1);
  assert.equal(last.product, 'store-lucky-egg-x8'); assert.equal(last.observed, '2026-11-14');
});
test('input is all-or-nothing: any bad row rejects everything', () => {
  const bad = [
    [{label:'GO Pass Deluxe: November', price:'$12.99'}],        // US dollars
    [{label:'GO Pass Deluxe: November', price:'AU$12.99'}],      // not the explicit A$ form
    [{label:'GO Pass Deluxe: November', price:'Rp 150.000'}],
    [{label:'GO Pass Deluxe: November', price:'A$0'}],
    [{label:'GO Pass Deluxe: November', price:'A$9999.99'}],     // implausible
    [{label:'Made Up Offer', price:'A$5.00'}],                   // not in snapshot or catalogue
    [{label:'GO Pass Deluxe: November', price:'A$12.99'},{label:'go pass deluxe: november', price:'A$13.99'}], // duplicate
  ];
  for (const items of bad) {
    const data = base();
    const r = apply(input(items), data);
    assert.ok(r.errors.length, JSON.stringify(items));
    assert.equal(r.changed, 0); assert.equal(r.data, data);
  }
  const mixed = apply(input([{label:'GO Pass Deluxe: November', price:'A$12.99'},{label:'Brand New Box', price:'$3.00'}]));
  assert.ok(mixed.errors.length); assert.equal(mixed.changed, 0);
});
test('bad dates are rejected: missing, impossible, future, stale, older than the recorded price', () => {
  const items = [{label:'Lucky Egg x8', price:'A$7.99'}];
  for (const observed of [undefined, '2026-13-01', '2026-02-30', '2026-11-16', '2026-10-01', '15/11/2026'])
    assert.ok(apply({observed, items}).errors.length, String(observed));
  const data = base(); data.prices.push({...data.prices[0], observed:'2026-11-14', amount:7.99});
  assert.ok(apply(input(items, {observed:'2026-11-13'}), data).errors.length);
});
test('more than 3x change vs the last verified price needs an explicit per-item confirm:true', () => {
  const big = [{label:'Lucky Egg x8', price:'A$29.99'}];
  assert.ok(apply(input(big)).errors.some(e => /confirm/.test(e)));
  assert.ok(apply(input([{label:'Lucky Egg x8', price:'A$1.99'}])).errors.some(e => /confirm/.test(e)));
  const ok = apply(input([{label:'Lucky Egg x8', price:'A$29.99', confirm:true}]));
  assert.deepEqual(ok.errors, []); assert.equal(ok.changed, 1);
  assert.equal(ok.data.prices.at(-1).confirm, undefined, 'confirm is not stored');
});
test('an identical same-day entry is a no-op, a conflicting same-day price is rejected', () => {
  const once = apply(input([{label:'Lucky Egg x8', price:'A$8.49'}]));
  const same = applyOwnerInput(once.data, input([{label:'Lucky Egg x8', price:'A$8.49'}]), snapshot(), {today:TODAY});
  assert.equal(same.changed, 0); assert.deepEqual(same.errors, []);
  const clash = applyOwnerInput(once.data, input([{label:'Lucky Egg x8', price:'A$8.99'}]), snapshot(), {today:TODAY});
  assert.ok(clash.errors.length);
});
test('ambiguous known labels and empty input are rejected', () => {
  const data = base(); data.prices.push({...data.prices[0], product:'store-lucky-egg-x8-b'});
  assert.ok(apply(input([{label:'Lucky Egg x8', price:'A$7.99'}]), data).errors.length);
  assert.ok(apply(input([])).errors.length);
  assert.ok(apply(null).errors.length);
});
test('only the supplied AU entries are added: no other region or product is touched or inferred', () => {
  const data = base(); data.prices.push({product:'x',currency:'IDR',amount:1,region:'ID'});
  const before = JSON.stringify(data.prices);
  const r = apply(input([{label:'GO Pass Deluxe: November', price:'A$12.99'}]), data);
  assert.equal(JSON.stringify(r.data.prices.slice(0, data.prices.length)), before);
  assert.equal(r.data.prices.length, data.prices.length + 1);
});
test('the US-runner importer cannot overwrite or contaminate owner-supplied AU prices', () => {
  const owned = apply(input([{label:'Lucky Egg x8', price:'A$8.49'}])).data;
  const us = updatePrices(owned, {fetched:'2026-11-15T10:00:00Z', items:[{name:'Lucky Egg x8', price:'$5.99'},{name:'a', price:'$1.99'},{name:'b', price:'$2.99'}]});
  assert.equal(us.changed, 0);
  const olderAud = updatePrices(owned, {fetched:'2026-11-01T10:00:00Z', items:[{name:'Lucky Egg x8', price:'A$1.00'},{name:'a', price:'A$1.99'},{name:'b', price:'A$2.99'}]});
  assert.equal(olderAud.data.prices.at(-1).amount, 8.49);
});
test('a fresh owner-supplied November price makes one priced planner card (no unpriced duplicate) with publisher contents', () => {
  const offers = require('../public/store-offer-identities.js');
  const r = apply(input([{label:'GO Pass Deluxe: November', price:'A$12.99'}]));
  const rows = R.catalogue(r.data.prices, [], Date.parse('2026-11-15T00:00:00Z'), offers);
  const nov = rows.filter(x => x.label === 'GO Pass Deluxe: November');
  assert.equal(nov.length, 1);
  assert.equal(nov[0].aud, 12.99); assert.equal(nov[0].observed, '2026-11-14');
  assert.ok(nov[0].contents.length > 0);
  assert.ok(rows.some(x => x.label === 'GO Pass Deluxe: November Ultra Box' && x.unpricedOfficial), 'unpriced offers stay honestly unpriced');
});
test('unlisted: an item the snapshot has not seen is accepted only with the explicit flag and a note', () => {
  const row = {label:'Brand Unseen Ticket', price:'A$2.99'};
  assert.match(apply(input([row])).errors[0], /not a name in the current Store snapshot/); // default rejection unchanged
  const note = 'owner-observed in AU store; not yet in snapshot';
  const ok = apply(input([{...row, unlisted:true, note}]));
  assert.deepEqual(ok.errors, []);
  const e = ok.data.prices.at(-1);
  assert.equal(e.product, 'store-brand-unseen-ticket'); assert.equal(e.amount, 2.99); assert.equal(e.note, note);
  assert.equal(e.verified, true); assert.equal(e.observed, '2026-11-14'); assert.equal(e.group, 'Tickets');
  assert.ok(!('note' in apply(input([{label:'GO Pass Deluxe: November', price:'A$12.99'}])).data.prices.at(-1)));
});
test('unlisted does not relax any other check', () => {
  const note = 'n';
  const bad = [
    [{label:'Brand Unseen Ticket', price:'A$2.99', unlisted:true}],                      // note required
    [{label:'Brand Unseen Ticket', price:'A$2.99', unlisted:true, note:'  '}],
    [{label:'Brand Unseen Ticket', price:'A$2.99', unlisted:'yes', note}],               // must be boolean true
    [{label:'Brand Unseen Ticket', price:'$2.99', unlisted:true, note}],                 // A$ format
    [{label:'Brand Unseen Ticket', price:'A$0.10', unlisted:true, note}],                // range
    [{label:'Brand Unseen Ticket', price:'A$900', unlisted:true, note}],
    [{label:'Brand Unseen Ticket', price:'A$2.99', unlisted:true, note},{label:'brand unseen ticket', price:'A$2.99', unlisted:true, note}], // duplicate
    [{label:'GO Pass Deluxe: November', price:'A$12.99', unlisted:true, note}],           // already in snapshot: use the normal path
    [{label:'Lucky Egg x8', price:'A$50', unlisted:true, note}],                          // ratio check still applies
  ];
  for (const items of bad) { const r = apply(input(items)); assert.ok(r.errors.length, JSON.stringify(items)); assert.equal(r.changed, 0); }
  assert.ok(apply({observed:'2026-10-01', items:[{label:'Brand Unseen Ticket', price:'A$2.99', unlisted:true, note}]}).errors.length, 'date window still applies');
});
test('the committed owner input file (if any) is valid against the committed data', () => {
  if (!fs.existsSync(new URL('../data/au-store-input.json', import.meta.url))) return;
  const input = JSON.parse(fs.readFileSync(new URL('../data/au-store-input.json', import.meta.url), 'utf8'));
  const data = JSON.parse(fs.readFileSync(new URL('../public/prices.json', import.meta.url), 'utf8'));
  const snap = JSON.parse(fs.readFileSync(new URL('../public/store-current-snapshot.json', import.meta.url), 'utf8'));
  const r = applyOwnerInput(data, input, snap, {today: input.observed});
  assert.deepEqual(r.errors, []);
});
test('supersedes: opt-in removal of one stale AU entry when its replacement is added; nothing else is touched', () => {
  const data = base();
  data.prices.push({product:'store-brand-new-box-guess',label:'Brand New Box Guess',group:'Boxes',currency:'AUD',amount:2.99,region:'AU',verified:true,observed:'2026-11-13'},
    {product:'store-brand-new-box-guess',label:'Brand New Box Guess',group:'Boxes',currency:'IDR',amount:30000,region:'ID',verified:true,observed:'2026-11-13'});
  const without = apply(input([{label:'Brand New Box', price:'A$2.99'}]), data);
  assert.equal(without.data.prices.length, data.prices.length + 1, 'no field: nothing removed');
  const r = apply(input([{label:'Brand New Box', price:'A$2.99', supersedes:'brand new box guess'}]), data);
  assert.deepEqual(r.errors, []);
  assert.equal(r.removed, 1);
  assert.equal(r.data.prices.some(p => p.product === 'store-brand-new-box-guess' && p.region === 'AU'), false);
  assert.equal(r.data.prices.some(p => p.product === 'store-brand-new-box-guess' && p.currency === 'IDR'), true, 'other regions of that product stay');
  assert.ok(r.data.prices.some(p => p.product === 'store-brand-new-box' && p.amount === 2.99));
  assert.equal(r.data.prices.length, data.prices.length);
  // replacement already recorded the same day (no-op add): the stale entry is still retired
  const again = apply(input([{label:'Brand New Box', price:'A$2.99', supersedes:'Brand New Box Guess'}]), r.data);
  assert.ok(again.errors.length, 'superseded entry no longer exists');
});
test('supersedes: validated, all-or-nothing', () => {
  const data = base();
  data.prices.push({product:'store-old-guess',label:'Old Guess',group:'Boxes',currency:'AUD',amount:2.99,region:'AU',verified:true,observed:'2026-11-13'});
  const bad = [
    {label:'Brand New Box', price:'A$2.99', supersedes:'Does Not Exist'},
    {label:'Brand New Box', price:'A$2.99', supersedes:''},
    {label:'Brand New Box', price:'A$2.99', supersedes:5},
    {label:'Brand New Box', price:'A$3.99', supersedes:'Old Guess'},
    {label:'Brand New Box', price:'A$3.99', supersedes:'Old Guess', supersedesNote:''},
    {label:'Lucky Egg x8', price:'A$7.99', supersedes:'Lucky Egg x8'}
  ];
  for (const row of bad) { const r = apply(input([row]), data); assert.ok(r.errors.length, JSON.stringify(row)); assert.equal(r.changed, 0); assert.equal(r.data, data); }
  const both = apply(input([{label:'Brand New Box', price:'A$2.99', supersedes:'Old Guess'}, {label:'Old Guess', price:'A$2.99'}]), data);
  assert.ok(both.errors.length, 'cannot supersede another item of the same input');
  const diff = apply(input([{label:'Brand New Box', price:'A$3.99', supersedes:'Old Guess', supersedesNote:'owner corrected the label and price'}]), data);
  assert.deepEqual(diff.errors, []);
  assert.equal(diff.removed, 1);
});
