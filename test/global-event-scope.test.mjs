import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/dash.js', import.meta.url), 'utf8');
const match = source.match(/  function scopedKind\(kind, name, scope, region\) \{[\s\S]*?\n  \}/);
assert.ok(match, 'scope classification helper must exist in dashboard');
const scopedKind = vm.runInNewContext('(' + match[0].trim() + ')');

test('globally eligible Wild Area and GO Fest events are Global', () => {
  assert.equal(scopedKind('person', 'GO Wild Area: Global', '', ''), 'global');
  assert.equal(scopedKind('person', 'GO Fest', 'worldwide_local', ''), 'global');
  assert.equal(scopedKind('person', 'Global Timed Research', 'global', ''), 'global');
});

test('city-specific events remain In person', () => {
  assert.equal(scopedKind('person', 'GO Wild Area: Sendai', '', 'Sendai'), 'person');
  assert.equal(scopedKind('person', 'GO Fest Global meetup', '', 'Stockholm'), 'person');
  assert.equal(scopedKind('person', 'City Safari', 'in_person', 'Melbourne'), 'person');
});

test('unrelated kinds are not changed by global scope', () => {
  assert.equal(scopedKind('raid', 'Global Raid Day', 'global', ''), 'raid');
  assert.equal(scopedKind('event', 'Timed Research', 'worldwide', ''), 'event');
});
