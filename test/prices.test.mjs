import test from 'node:test';
import { readPrivate, hasPrivate } from "./_private.mjs";
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const LIB = require('../public/lib.js');
const pub = JSON.parse(fs.readFileSync(new URL('../public/prices.json', import.meta.url)));
const priv = readPrivate('prices.json','private-prices.json');
const real = { ...pub, fx: priv.fx, prices: [...pub.prices, ...priv.prices] };
test('the public prices file carries no Indonesian price and no Rp rate', () => { assert.ok(!pub.fx); assert.ok(pub.prices.every(p => p.currency !== 'IDR')); assert.ok(!/Rp\\s?\\d/.test(JSON.stringify(pub))); });
const fx = { from: 'IDR', to: 'AUD', rate: 0.0001, source: 'test rate', observed: '2026-10-10' };
const usd = { product: 'p', currency: 'USD', amount: 4, region: 'global', source: 's', observed: '2026-10-09' };

test('no Rp price: says not found and shows no US price, no A$ estimate and no saving', () => {
  const v = LIB.priceView({ prices: [usd], fx }, 'p', '2026-10-10');
  assert.equal(v.kind, 'notfound'); assert.equal(v.main, 'A$ price not confirmed');
  assert.equal(v.sub, ''); assert.equal(v.save, '');
  assert.ok(!/US\$|reference/.test(v.main + v.sub + v.save + v.note));
});
test('Rp price converts at the Rp to A$ rate and never shows the Rp amount; no A$ comparison without a verified A$ price', () => {
  const v = LIB.priceView({ prices: [usd, { product: 'p', currency: 'IDR', region: 'ID', amount: 100000, source: 'store', observed: '2026-10-10' }], fx }, 'p', '2026-10-10');
  assert.equal(v.kind, 'converted'); assert.equal(v.main, '≈ A$10.00'); assert.equal(v.sub, ''); assert.equal(v.save, ''); assert.ok(!/Rp\s?\d|100,000/.test(v.main + v.sub + v.save + v.note));
});
test('no saving without a verified A$ price for the same product', () => {
  const idr = { product: 'p', currency: 'IDR', region: 'ID', amount: 100000, source: 'store', observed: '2026-10-10' };
  const unverified = { product: 'p', currency: 'AUD', region: 'AU', amount: 20, source: 'x', observed: '2026-10-10' };
  const other = { product: 'q', currency: 'AUD', region: 'AU', verified: true, amount: 20, source: 'x', observed: '2026-10-10' };
  assert.equal(LIB.priceView({ prices: [idr, unverified, other], fx }, 'p').save, '');
});
test('saving appears only with a verified A$ price, same product, close in time', () => {
  const idr = { product: 'p', currency: 'IDR', region: 'ID', amount: 100000, source: 'store', observed: '2026-10-10' };
  const au = { product: 'p', currency: 'AUD', region: 'AU', verified: true, amount: 16, source: 'au store', observed: '2026-10-09' };
  const v = LIB.priceView({ prices: [idr, au], fx }, 'p');
  assert.equal(v.main, '≈ A$10.00'); assert.equal(v.sub, 'Originally A$16.00 in Australia'); assert.equal(v.save, 'Save A$6.00 (38%)');
  const old = LIB.priceView({ prices: [idr, { ...au, observed: '2026-09-01' }], fx }, 'p');
  assert.equal(old.sub, ''); assert.equal(old.save, '');           // too far apart in time: not comparable
  const cheaper = LIB.priceView({ prices: [idr, { ...au, amount: 9 }], fx }, 'p');
  assert.equal(cheaper.sub, 'Originally A$9.00 in Australia'); assert.equal(cheaper.save, '');   // comparable, but no saving to claim
});
test('native A$ price is shown as published, not converted', () => {
  const v = LIB.priceView({ prices: [{ product: 'p', currency: 'AUD', region: 'AU', verified: true, amount: 17, source: 'hub', observed: '2026-10-09' }], fx }, 'p');
  assert.equal(v.kind, 'native'); assert.equal(v.main, 'A$17.00');
});
test('unknown product says price not published', () => assert.equal(LIB.priceView({ prices: [], fx }, 'zzz').kind, 'none'));
test('stale rate is flagged', () => {
  const idr = { product: 'p', currency: 'IDR', region: 'ID', amount: 100000, source: 'store', observed: '2026-10-10' };
  assert.match(LIB.priceView({ prices: [idr], fx }, 'p', '2026-10-20').note, /more than 3 days old/);
});
test('shipped prices.json: no invented Rp price and a sourced, dated rate', { skip: !hasPrivate('prices.json') && 'needs the real private prices (kept in R2)' }, () => {
  assert.ok(real.prices.every(p => p.source && p.url && /^\d{4}-\d\d-\d\d$/.test(p.observed)));
  assert.ok(real.prices.filter(p => p.currency === 'IDR').every(p => p.region === 'ID' && p.amount > 0 && p.source && p.url));
  assert.ok(real.fx.rate > 0 && real.fx.url && real.fx.observed);
  assert.equal(LIB.priceView(real, 'zorua-cd-research', '2026-10-10').kind, 'notfound');
  const gp = LIB.priceView(real, 'go-pass-oct-deluxe', '2026-10-11');
  assert.equal(gp.kind, 'converted'); assert.equal(gp.sub, 'Originally A$12.99 in Australia');
});
test('shipped event-info.json: every ticket exists and unpublished items are labelled', () => {
  const info = JSON.parse(fs.readFileSync(new URL('../public/event-info.json', import.meta.url)));
  for (const e of Object.values(info.events)) for (const id of [...e.tickets, ...(e.alsoRunning || [])]) assert.ok(info.passes[id], id);
  for (const e of Object.values(info.events)) assert.ok(e.info.every(i => ['published', 'not-published', 'partial'].includes(i.status)) && (e.source.url || e.info.length === 0)); // an entry that only carries an approved infographic has no written source to link
});
test('every store- item has an Rp and a verified A$ price and converts', { skip: !hasPrivate('prices.json') && 'needs the real private prices (kept in R2)' }, () => {
  const ids = [...new Set(real.prices.filter(p => /^store-/.test(p.product)).map(p => p.product))];
  assert.ok(ids.length >= 27);
  for (const id of ids) {
    assert.ok(real.prices.some(p => p.product === id && p.currency === 'IDR' && p.label && p.group), id);
    const v = LIB.priceView(real, id, '2026-10-12'); assert.equal(v.kind, 'converted', id); assert.match(v.sub, /^Originally A\$/, id);
  }
});

import { createRequire as _cr } from 'node:module';
test('US$ in event text is shown as the Australian tier price, never as US dollars', () => {
  const LIB = _cr(import.meta.url)('../public/lib.js');
  const t = JSON.parse(fs.readFileSync(new URL('../public/prices.json', import.meta.url), 'utf8')).tiers_au;
  LIB.setTiers(t);
  assert.equal(LIB.audify('For US$7.99*, Trainers can upgrade'), 'For A$12.99, Trainers can upgrade');
  assert.equal(LIB.audify('For US$4.99 (or the equivalent pricing tier in your local currency), you'), 'For A$7.99, you');
  assert.equal(LIB.audify('US$1.99 ticket'), '≈ A$2.99 ticket');
  assert.equal(LIB.audify('Optional US$11.99 ticket'), 'Optional A$ price not confirmed ticket');
  assert.ok(!/US\$/.test(LIB.audify('US$9.99 and US$6.99')));
  const v = LIB.priceView({ prices: [{ product: 'z', currency: 'USD', amount: 7.99, source: 's', observed: '2026-10-10' }] }, 'z');
  assert.equal(v.kind, 'tier'); assert.equal(v.main, 'A$12.99');
  LIB.setTiers(null);
});
