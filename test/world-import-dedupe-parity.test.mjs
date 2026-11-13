// Universal event-engine regression: the importer writes the pre-deduped world
// catalogue and the verified duplicate pass publishes its canonical counterpart.
// Compare facts from the same refresh only; a later independent report-only audit
// must not turn an otherwise valid source snapshot into a false failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const published = read('public/world-events.json');
const importer = read('data/importer-report.json');
const duplicates = read('data/dup-audit.json');
const publishedIds = new Set(published.events.map(event => event.id));

test('published worldwide events have unique stable IDs and grounded source records', () => {
  assert.ok(Array.isArray(published.events));
  assert.equal(publishedIds.size, published.events.length, 'duplicate canonical world IDs would render the same event twice');
  for (const event of published.events) {
    assert.ok(typeof event.id === 'string' && event.id.trim(), 'world event missing its durable ID');
    assert.ok(typeof event.name === 'string' && event.name.trim(), event.id);
    assert.ok(Array.isArray(event.sources) && event.sources.length > 0, event.id + ': published event has no recorded source');
  }
});

test('same-cycle importer world total reconciles exactly with deduplicated published events', t => {
  const times = [published.updated, importer.runAt, duplicates.updated].map(Date.parse);
  assert.ok(times.every(Number.isFinite), 'importer/publisher/audit timestamps must be parseable');
  const [worldAt, reportAt, dedupAt] = times;
  // The duplicate audit runs after importer writes raw world data. When other
  // jobs refreshed one snapshot separately, do not compare unrelated cycles.
  const sameCycle = Math.abs(worldAt - reportAt) <= 120000 &&
    dedupAt >= reportAt && dedupAt - reportAt <= 120000;
  if (!sameCycle) {
    t.diagnostic('Source report and duplicate audit are from different refresh cycles; count reconciliation deferred');
    return;
  }
  assert.ok(Number.isSafeInteger(importer.worldEvents) && importer.worldEvents >= 0);
  assert.ok(Array.isArray(duplicates.joinedThisRun));
  assert.equal(importer.worldEvents - duplicates.joinedThisRun.length, published.events.length,
    'every raw world entry must remain published or have an explicit duplicate-join record');
  const dropped = new Set();
  for (const pair of duplicates.joinedThisRun) {
    assert.ok(typeof pair.kept === 'string' && typeof pair.dropped === 'string' && pair.kept !== pair.dropped,
      'each joined pair needs distinct canonical and removed IDs');
    assert.ok(!dropped.has(pair.dropped), 'a discarded world ID was joined more than once: ' + pair.dropped);
    dropped.add(pair.dropped);
    assert.ok(publishedIds.has(pair.kept), 'the chosen canonical world event disappeared: ' + pair.kept);
    assert.ok(!publishedIds.has(pair.dropped), 'a superseded world event still appears: ' + pair.dropped);
    const retained = published.events.find(event => event.id === pair.kept);
    assert.ok(retained.sources?.length, 'merged event lost all documented sources: ' + pair.kept);
  }
});
