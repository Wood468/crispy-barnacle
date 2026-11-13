'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const R = require('../public/regional-prices.js');
const now = Date.parse('2026-11-13T12:00:00Z');
test('past monthly passes are retired but current and future months remain', () => {
  assert.equal(R.retiredPass({label:'GO Pass Deluxe: October 2026'}, now), true);
  assert.equal(R.retiredPass({label:'GO Pass Deluxe: November 2026'}, now), false);
  assert.equal(R.retiredPass({label:'GO Pass Deluxe: December 2026'}, now), false);
  assert.equal(R.retiredPass({label:'PokéCoins 600'}, now), false);
});
test('explicit end date retires ticket but undated ticket is not guessed expired', () => {
  assert.equal(R.retiredPass({label:'Event Ticket',endDate:'2026-11-01'},now),true);
  assert.equal(R.retiredPass({label:'Event Ticket',endDate:'2026-11-20'},now),false);
  assert.equal(R.retiredPass({label:'Event Ticket'},now),false);
});
test('active catalogue omits past dated passes without deleting observations', () => {
  const prices = ['October','November'].map(month => ({
    product:'store-go-pass-'+month.toLowerCase(), label:'GO Pass Deluxe: '+month+' 2026',
    currency:'AUD',region:'AU',verified:true,amount:12.99,observed:'2026-11-12'
  }));
  const before = JSON.stringify(prices);
  const cards = R.catalogue(prices,[],now,[]);
  assert.equal(cards.length,1);
  assert.match(cards[0].label,/November/);
  assert.equal(JSON.stringify(prices),before);
});
