import test from 'node:test';
import assert from 'node:assert/strict';
import { review, parseFeed } from '../scripts/source-watch.mjs';

const now = Date.parse('2026-11-17T08:00:00Z');
const DAY = 86400000;
const dex = [[25, 'Pikachu', 1]];
const costumes = { pictures: {}, shiny: {}, missing: [] };
function scan(date, extra = {}) {
  return review({
    items: [{ title: 'Shiny Pikachu debut', summary: 'Shiny Pikachu appears', link: 'https://example.test/news', date, ...extra }],
    dex, costumes, dataText: '[]', now,
  });
}

test('rejects far-future publisher dates rather than creating a false debut gap', () => {
  assert.deepEqual(scan(now + 2 * DAY), []);
  assert.deepEqual(scan(now + 365 * DAY), []);
});
test('accepts current and recent feed articles', () => {
  for (const date of [now, now - DAY, now - 14 * DAY]) {
    const found = scan(date);
    assert.equal(found.length, 1);
    assert.deepEqual(found[0].notInOurData, ['Pikachu']);
  }
});
test('allows only one day of future publisher clock skew', () => {
  assert.equal(scan(now + DAY).length, 1);
  assert.deepEqual(scan(now + DAY + 1), []);
});
test('rejects stale, undated, and malformed publisher timestamps', () => {
  for (const date of [now - 14 * DAY - 1, null, NaN, Infinity, -Infinity, 0]) {
    assert.deepEqual(scan(date), []);
  }
});
test('does not turn future-dated RSS entries into a verified discovery', () => {
  const xml = '<rss><channel><item><title>Shiny Pikachu debut</title><pubDate>Fri, 20 Nov 2026 08:00:00 GMT</pubDate><description>Shiny Pikachu appears</description></item></channel></rss>';
  const items = parseFeed(xml);
  assert.equal(items.length, 1);
  assert.deepEqual(review({ items, dex, costumes, dataText: '[]', now }), []);
});
test('still excludes non-GO news and preserves valid recent discovery', () => {
  assert.equal(scan(now, { title: 'Pokémon Sleep shiny Pikachu' }).length, 0);
  assert.equal(scan(now - DAY).length, 1);
});
