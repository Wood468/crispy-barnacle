// Regression tests for artwork provenance. These fixtures intentionally use synthetic URLs;
// no network request is made and no image is claimed to exist.
const test = require('node:test');
const assert = require('node:assert/strict');
const art = require('../public/event-art.js');

const event = {
  name: 'GO Wild Area: Sendai',
  start: '2026-11-06T00:00:00Z',
  end: '2026-11-08T09:00:00Z',
  region: 'Sendai, Japan',
  kind: 'person'
};
const url = 'https://cdn.leekduck.com/assets/img/events/article-images/2026/go-wild-area-sendai-banner.jpg';

test('accepts event-specific dated art with matching event and location', () => {
  const result = art.resolve(event, [url]);
  assert.equal(result.kind, 'official');
  assert.equal(result.src, url);
  assert.match(result.provenance.verifiedFor, /Sendai/);
});

test('rejects a previous-year banner even when the event name matches', () => {
  const result = art.resolve(event, [url.replace('/2026/', '/2025/')]);
  assert.equal(result.kind, 'themed');
});

test('rejects artwork for another venue', () => {
  assert.equal(art.resolve(event, [url.replace('sendai-banner', 'london-banner')]).kind, 'themed');
});

test('rejects generic default artwork', () => {
  assert.equal(art.resolve(event, ['https://cdn.leekduck.com/assets/img/events/article-images/2026/default-event.jpg']).kind, 'themed');
});

test('new events use the same resolver without manual configuration', () => {
  const future = { name: 'Community Day: Pawniard', start: '2027-02-20T14:00:00Z', kind: 'cd' };
  const candidate = 'https://cdn.leekduck.com/assets/img/events/article-images/2027/community-day-pawniard.jpg';
  assert.equal(art.resolve(future, [candidate]).kind, 'official');
});

test('missing or unverifiable art returns a category illustration', () => {
  const result = art.resolve({ name: 'Max Monday: to be announced', start: '2026-11-16T06:00:00Z', kind: 'max' }, []);
  assert.equal(result.kind, 'themed');
  assert.equal(result.theme.key, 'max');
  assert.equal(result.provenance, null);
});

test('fallback markup is visibly distinguished from official art', () => {
  const result = art.resolve(event, []);
  const markup = art.banner(result, { ev: event });
  assert.match(markup, /Illustration/);
  assert.match(markup, /data-art-kind="themed"/);
});
