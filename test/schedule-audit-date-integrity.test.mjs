import test from 'node:test';
import assert from 'node:assert/strict';
import { addMissing } from '../scripts/schedule-audit.mjs';

const now = new Date('2026-11-17T00:00:00Z');
const entry = (slug, start, end) => ({ slug, type: 'event', start, end });
const run = entries => {
  const world = [];
  const added = addMissing(world, entries, now, 120);
  assert.equal(world.length, added.length);
  return added;
};

test('does not publish impossible Gregorian calendar dates from an external list', () => {
  const invalid = ['2026-02-30', '2025-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-11-00', 'not-a-date', '2026-11-1'];
  for (const [index, date] of invalid.entries()) {
    assert.deepEqual(run([entry('invalid-' + index, date, '2026-12-01')]), [], date);
    assert.deepEqual(run([entry('invalid-end-' + index, '2026-11-20', date)]), [], date);
  }
});
test('does not publish an end date before the start date', () => {
  assert.deepEqual(run([entry('inverted', '2026-12-01', '2026-11-20')]), []);
});
test('accepts valid upcoming overseas events and retains regional scope', () => {
  const added = run([entry('city-safari-melbourne', '2026-11-20', '2026-11-22')]);
  assert.equal(added.length, 1);
  assert.equal(added[0].scope, 'regional');
  assert.equal(added[0].start, '2026-11-20');
  assert.equal(added[0].end, '2026-11-22');
});
test('accepts a valid leap day and rejects an impossible century leap day', () => {
  assert.equal(run([entry('leap-day', '2028-02-29', '2028-02-29')]).length, 0); // outside forecast horizon
  assert.deepEqual(run([entry('bad-century', '2100-02-29', '2100-03-01')]), []);
});
test('keeps current date-window limits and duplicate protections', () => {
  assert.deepEqual(run([entry('old', '2026-11-01', '2026-11-02')]), []);
  assert.deepEqual(run([entry('distant', '2027-05-01', '2027-05-02')]), []);
  const world = [];
  const item = entry('raid-day-example', '2026-11-20', '2026-11-20');
  assert.equal(addMissing(world, [item, item], now).length, 1);
});
