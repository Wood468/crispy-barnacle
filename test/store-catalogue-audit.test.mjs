import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { auditOfficialStore } from '../scripts/store-catalogue-audit.mjs';

const au = (sku, amount, more = {}) => ({
  product: sku, region: 'AU', currency: 'AUD', verified: true, amount,
  observed: '2026-11-09', url: 'https://store.pokemongo.com', source: 'Official AU Store',
  ...more
});
const feed = (slug, more = {}) => ({
  slug, href: '/purchase/item/' + slug,
  name: 'GO Pass Deluxe', price: '$14.99', lastSeen: '2026-11-11T00:00:00Z',
  ...more
});

test('official Australian Web Store offers are retained regardless of legacy store- prefix', () => {
  const rows = [
    au('go-pass-fall-deluxe', 7.99),
    au('store-raid-box', 59.99, {label: 'Raid Box'}),
    au('go-pass-fall-deluxe', 8.99, {observed:'2026-11-10'}),
    au('city-safari', 10, {url:'https://pokemongohub.net/events/city-safari'}),
  ];
  const a = auditOfficialStore(rows, []);
  assert.equal(a.counts.officialAuPriceSkus, 2);
  assert.equal(a.officialAuPrices.find(p => p.sku === 'go-pass-fall-deluxe').amount, 8.99);
  assert.equal(a.officialAuPrices.find(p => p.sku === 'go-pass-fall-deluxe').label, null,
    'missing source label is not replaced by a guessed product description');
  assert.equal(a.officialAuPrices.some(p => p.sku === 'city-safari'), false);
});
test('reject external and spoofed hosts, currency mismatches and unverified observations', () => {
  const rows = [
    au('legitimate', 12),
    au('external', 12, {url:'https://example.org'}),
    au('spoofed', 12, {url:'https://store.pokemongo.com.evil.test'}),
    au('userinfo', 12, {url:'https://attacker@store.pokemongo.com'}),
    au('http', 12, {url:'http://store.pokemongo.com'}),
    au('foreign', 12, {currency:'USD'}),
    au('not-confirmed', 12, {verified:false}),
    au('bad-amount', 0),
  ];
  assert.deepEqual(auditOfficialStore(rows, []).officialAuPrices.map(x=>x.sku), ['legitimate']);
});
test('different purchase slugs do not collapse because product names match', () => {
  const a = auditOfficialStore([], [
    feed('web-go-pass-basic'),
    feed('web-go-pass-upgrade', {price:'$24.99'}),
    feed('web-go-pass-basic', {lastSeen:'2026-11-12T00:00:00Z',price:'$12.99'})
  ]);
  assert.equal(a.counts.feedPurchaseSlugs, 2);
  assert.deepEqual(a.officialFeedOffers.map(x => x.slug), ['web-go-pass-basic','web-go-pass-upgrade']);
  assert.equal(a.officialFeedOffers[0].priceLabel, '$12.99');
  assert.equal(a.officialFeedOffers[0].currency, null);
  assert.equal(a.officialFeedOffers[0].currencyStatus, 'unverified');
  assert.equal(a.counts.feedCurrencyUnverified, 2);
});
test('removed offers remain historical, missing prices never become zero, and malformed paths are rejected', () => {
  const a = auditOfficialStore([], [
    feed('web-old-offer', {goneAt:'2026-11-12T02:00:00Z',price:null}),
    feed('web-good-offer', {price:null}),
    feed('web-malicious-offer', {href:'/purchase/item/web-other-offer'}),
    feed('../../bad', {href:'/purchase/item/../../bad'}),
  ]);
  assert.equal(a.officialFeedOffers.length, 2);
  const prior=a.officialFeedOffers.find(x=>x.slug==='web-old-offer');
  assert.equal(prior.availability, 'last seen, no longer listed');
  assert.equal(prior.priceLabel,null);
  assert.equal(prior.currency,null);
});

test('the current three official November listings stay separate from regional price observations', () => {
  const official = require('../public/store-offer-identities.js');
  const result = auditOfficialStore([], [], official, '2026-11-13T00:00:00Z');
  assert.equal(result.counts.announcedUnpriced, 3);
  assert.equal(result.counts.announcedReviewDue, 0);
  assert.equal(result.counts.officialAuPriceSkus, 0);
  assert.equal(result.counts.feedPurchaseSlugs, 0);
  assert.deepEqual(result.officialUnpriced.map(x => x.label).sort(),
    ['GO Pass Deluxe: November', 'GO Pass Deluxe: November + 10 Ranks', 'GO Pass Deluxe: November Ultra Box'].sort());
  for (const row of result.officialUnpriced) {
    assert.equal(row.regionAvailability, 'unknown');
    assert.equal(row.regionalPricing, 'not observed (AU / ID / IN)');
    assert.equal(row.reviewDue, false);
    assert.match(row.sourceUrl, /^https:\/\/pokemongo\.com\/news\//);
    assert.equal(row.contents.find(x => x.item === 'Premium Battle Pass')?.quantity,
      row.label.includes('Ultra Box') ? 5 : row.label.includes('10 Ranks') ? 2 : 1);
    assert.equal('amount' in row, false, 'publisher announcements must never inject checkout prices');
    assert.equal('currency' in row, false);
    assert.equal('checkout' in row, false);
  }
  const older = auditOfficialStore([], [], official, '2027-01-01T00:00:00Z');
  assert.equal(older.counts.announcedReviewDue,3,'aged publisher descriptions need fresh review');
});
test('reject spoofed sources, malformed contents and preserve separate same-title source identities', () => {
  const offer = {id:'official:one',label:'Same published title',
    sourceUrl:'https://pokemongo.com/news/go-pass-november-2026',
    sourceCheckedAt:'2026-11-13',regionAvailability:'unknown',noPriceObservation:true,
    contents:[{item:'Premium Battle Pass',quantity:1}],amount:7.99,currency:'USD',
    secret:'do-not-copy',checkout:'private-checkout-link'};
  const data = [offer,{...offer,id:'official:two',contents:[{item:'Premium Battle Pass',quantity:2}]},
    {...offer,sourceCheckedAt:'2026-11-12'},
    {...offer,id:'official:spoofed',sourceUrl:'https://pokemongo.com.evil.test/news/x'},
    {...offer,id:'official:invalid',contents:[{item:'Bonus Ranks',quantity:-10}]},
    {...offer,id:'official:regional',regionAvailability:'AU'},
    {...offer,id:'official:priced',noPriceObservation:false}];
  const audited = auditOfficialStore([],[],data,'2026-11-13T00:00:00Z');
  assert.equal(audited.counts.announcedUnpriced,2);
  assert.deepEqual(audited.officialUnpriced.map(x=>x.id),['official:one','official:two']);
  assert.equal(audited.officialUnpriced[0].contents[0].quantity,1);
  assert.ok(audited.officialUnpriced.every(x=>!('amount' in x)&&!('currency' in x)&&!('secret' in x)&&!('checkout' in x)));
});
