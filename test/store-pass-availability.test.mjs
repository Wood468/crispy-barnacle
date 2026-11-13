import test from 'node:test';
import assert from 'node:assert/strict';
import availability from '../public/store-pass-availability.js';

const NOW = '2026-11-13T12:00:00Z';
const listing = {
  confirmed: true, sourceUrl: 'https://store.pokemongo.com/?hl=en',
  locale: 'en', channel: 'web', listed: true, checkedAt: '2026-11-13T10:00:00Z'
};
const retired = {
  confirmed: true, sourceUrl: 'https://pokemongo.com/news/offer-retirement',
  locale: 'en', channel: 'web', checkedAt: '2026-11-12T10:00:00Z'
};

test('fresh official listing confirms only the observed locale and channel listing', () => {
  const result = availability.classify({ listingEvidence: listing }, NOW);
  assert.equal(result.availability, 'confirmed-listed');
  assert.deepEqual(result.evidence, {
    sourceUrl: listing.sourceUrl, locale: 'en', channel: 'web', checkedAt: listing.checkedAt
  });
});

test('historical prices and a product name alone never imply current availability', () => {
  const result = availability.classify({
    product: 'GO Pass Deluxe: October', historicalPriceObservedAt: '2026-10-12',
    regionPrices: [{ region: 'AU', amount: 12.99 }]
  }, NOW);
  assert.equal(result.availability, 'unknown');
  assert.equal(result.evidence, null);
});

test('absence from one listing snapshot is unknown, not confirmed retired', () => {
  const result = availability.classify({
    listingEvidence: { ...listing, listed: false }
  }, NOW);
  assert.equal(result.availability, 'unknown');
});

test('stale or future listing snapshots cannot confirm current availability', () => {
  assert.equal(availability.classify({ listingEvidence: { ...listing, checkedAt: '2026-11-01T00:00:00Z' } }, NOW).availability, 'unknown');
  assert.equal(availability.classify({ listingEvidence: { ...listing, checkedAt: '2026-11-14T00:00:00Z' } }, NOW).availability, 'unknown');
});

test('explicit passed purchase end plus corroborating source confirms retirement', () => {
  const result = availability.classify({
    purchaseEndAt: '2026-11-12T23:59:00Z', retirementEvidence: retired,
    listingEvidence: { ...listing, checkedAt: '2026-11-12T22:00:00Z' }
  }, NOW);
  assert.equal(result.availability, 'confirmed-retired');
  assert.equal(result.evidence.sourceUrl, retired.sourceUrl);
});

test('an expired event window is not purchase expiry; claim window is separate', () => {
  const result = availability.classify({
    listingEvidence: listing,
    eventStartAt: '2026-11-09T10:00:00Z',
    eventEndsAt: '2026-11-15T18:00:00Z',
    claimUntil: '2026-11-17T23:59:00Z'
  }, NOW);
  assert.equal(result.availability, 'confirmed-listed');
  assert.equal(result.eventWindow, 'active');
  assert.equal(result.claimWindow, 'claimable');
  const ended = availability.classify({
    listingEvidence: listing,
    eventStartAt: '2026-11-01T10:00:00Z',
    eventEndsAt: '2026-11-10T18:00:00Z',
    claimUntil: '2026-11-17T23:59:00Z'
  }, NOW);
  assert.equal(ended.availability, 'confirmed-listed');
  assert.equal(ended.eventWindow, 'ended');
  assert.equal(ended.claimWindow, 'claimable');
});

test('malformed dates, URLs, locales and timestamps fail closed', () => {
  assert.equal(availability.classify({ listingEvidence: { ...listing, sourceUrl: 'javascript:alert(1)' } }, NOW).availability, 'unknown');
  assert.equal(availability.classify({ listingEvidence: { ...listing, checkedAt: 'yesterday' } }, NOW).availability, 'unknown');
  assert.equal(availability.classify({ purchaseEndAt: '2026-13-99', retirementEvidence: retired }, NOW).availability, 'unknown');
  assert.throws(() => availability.classify({}, 'not-a-date'), /evaluation time/);
  assert.throws(() => availability.classify({}, NOW, -1), /maxAgeDays/);
});


test('market and purchase channel must match the evidence', () => {
  assert.equal(availability.classify({ locale: 'id-ID', channel: 'web', listingEvidence: listing }, NOW).availability, 'unknown');
  assert.equal(availability.classify({ locale: 'en', channel: 'in-app', listingEvidence: listing }, NOW).availability, 'unknown');
  assert.equal(availability.classify({ locale: 'en', channel: 'web', listingEvidence: listing }, NOW).availability, 'confirmed-listed');
  assert.equal(availability.classify({ locale: 'id-ID', channel: 'web',
    purchaseEndAt: '2026-11-12T00:00:00Z', retirementEvidence: retired }, NOW).availability, 'unknown');
});

test('retirement evidence must be recent and valid, not future or malformed', () => {
  for (const checkedAt of ['2026-11-14T00:00:00Z', '2026-01-01T00:00:00Z',
    '2026-02-30', 'not-a-date']) {
    assert.equal(availability.classify({ purchaseEndAt: '2026-11-12T23:00:00Z',
      retirementEvidence: { ...retired, checkedAt } }, NOW).availability, 'unknown');
  }
});

test('calendar overflow cannot silently retire a pass', () => {
  for (const purchaseEndAt of ['2026-13-99', '2026-02-30', '2025-02-29',
    '2026-04-31', '2026-11-13T25:00:00Z']) {
    assert.equal(availability.classify({ purchaseEndAt, retirementEvidence: retired }, NOW).availability, 'unknown');
  }
  assert.equal(availability.classify({ purchaseEndAt: '2024-02-29',
    retirementEvidence: retired }, NOW).availability, 'confirmed-retired');
});

test('conflicting fresh listing observed after purchase expiry fails closed', () => {
  const offer = { locale: 'en', channel: 'web', purchaseEndAt: '2026-11-12T23:00:00Z',
    retirementEvidence: retired, listingEvidence: listing };
  assert.equal(availability.classify(offer, NOW).availability, 'unknown');
  assert.equal(availability.classify({
    ...offer, listingEvidence: { ...listing, checkedAt: '2026-11-12T22:00:00Z' }
  }, NOW).availability, 'confirmed-retired');
});
