import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSourceFacetStaging } from '../scripts/importer/source-facets-stage.mjs';

const base = 'https://leekduck.com/events/synthetic-global/';
const html = [
  '<main><h2>Bonuses</h2><h3>Bonuses for All Trainers</h3>',
  '<img alt="Up to 3 free Raid Passes each day">',
  '<h2>Additional Ticket Holder Bonuses</h2>',
  '<img alt="GO Safari Balls instead of Premier Balls for raids***">',
  '<p>*** This substitution is not yet confirmed by the official source.</p>',
  '<h2>Moves</h2><h3>Flygon</h3><img alt="GroundEarth Power Charged Attack">',
  '<h2>Research</h2><h3>Special Research — Ticket Holders</h3>',
  '<p>Choose a Steel-type or Dragon-type path during the event.</p>',
  '</main>'
].join('\n');

test('stages only verified LeekDuck URLs and counts structured facts without publishing them', () => {
  const { byUrl, report } = collectSourceFacetStaging([
    { source: 'official', url: 'https://pokemongo.com/news/pokemon-go-global', html },
    { source: 'leekduck', url: base, title: 'Synthetic Global', html },
    { source: 'leekduck', url: base, html },
    { source: 'leekduck', url: 'https://leekduck.com.evil.test/events/synthetic/', html },
    { source: 'leekduck', url: 'http://leekduck.com/events/synthetic/', html },
    { source: 'hub', url: 'https://pokemongohub.net/post/event/example/', html }
  ]);
  assert.equal(report.publication, 'audit-only');
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.eligiblePages, 1);
  assert.equal(report.duplicates, 1);
  assert.equal(report.pagesWithFacets, 1);
  assert.equal(report.counts.benefits, 2);
  assert.equal(report.counts.featuredMoves, 1);
  assert.equal(report.counts.researchPrograms, 1);
  assert.equal(report.counts.unconfirmed, 1);
  assert.equal(report.examples.length, 1);
  assert.equal(report.examples[0].sourceUrl, base);
  assert.equal(byUrl.size, 1);
  assert.equal(byUrl.get(base).featuredMoves[0].move, 'Earth Power');
  assert.equal(byUrl.get(base).researchPrograms[0].access, 'ticket');
  assert.ok(!JSON.stringify(report).includes('Steel-type'));
  assert.ok(!JSON.stringify(report).includes('GO Safari Balls'));
  assert.deepEqual(report.errors, []);
});

test('skips absent and oversized HTML without discarding unrelated source data', () => {
  const huge = '<main>' + ' '.repeat(2_000_001) + '</main>';
  const goodUrl = 'https://www.leekduck.com/events/valid-preview/';
  const { byUrl, report } = collectSourceFacetStaging([
    { source: 'leekduck', url: base, html: '' },
    { source: 'leekduck', url: 'https://leekduck.com/events/oversized/', html: huge },
    { source: 'leekduck', url: goodUrl, html }
  ]);
  assert.equal(report.eligiblePages, 3);
  assert.equal(report.skippedLarge, 1);
  assert.equal(report.pagesWithFacets, 1);
  assert.equal(report.errors.length, 0);
  assert.ok(byUrl.has(goodUrl));
  assert.ok(!byUrl.has(base));
});

test('handles absent or unrelated pages without creating false negative availability claims', () => {
  const { byUrl, report } = collectSourceFacetStaging([
    { source: 'official', url: 'https://pokemongo.com/news/other-event', html },
    { source: 'leekduck', url: 'https://leekduck.com/blog/', html },
    { source: 'leekduck', url: 'https://leekduck.com/events/no-special-details/', html: '<main><h2>Overview</h2><p>Details to come</p></main>' }
  ]);
  assert.equal(report.pagesWithFacets, 0);
  assert.equal(report.counts.researchPrograms, 0);
  assert.equal(report.counts.featuredMoves, 0);
  assert.equal(report.counts.benefits, 0);
  assert.equal(byUrl.size, 1);
});

test('does not mutate caller pages, merge results or public source records', () => {
  const p = Object.freeze({source:'leekduck', url:base, html});
  const records = Object.freeze([p]);
  const { byUrl, report } = collectSourceFacetStaging(records);
  assert.equal(Object.keys(p).length, 3);
  assert.equal(p.fields, undefined);
  assert.equal(report.publication, 'audit-only');
  assert.deepEqual(byUrl.get(base).sourceUrl, base);
});

test('rejects malformed caller contracts instead of manufacturing event facts', () => {
  assert.throws(() => collectSourceFacetStaging(null), /array/);
  assert.throws(() => collectSourceFacetStaging({source:'leekduck'}), /array/);
});
