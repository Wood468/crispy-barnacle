import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const LIB = require('../public/lib.js');
const source = readFileSync(new URL('../public/dash.js', import.meta.url), 'utf8');
const match = source.match(/  function scopedKind\(kind, name, scope, region, declared\) \{[\s\S]*?\n  \}/);
assert.ok(match, 'scope classification helper must exist in dashboard');
const scopedKind = vm.runInNewContext('(' + match[0].trim() + ')', { LIB });

test('explicitly global eligibility makes a Wild Area or GO Fest format Global', () => {
  assert.equal(scopedKind('person', 'anything', 'worldwide_local', '', true), 'global');
  assert.equal(scopedKind('person', 'anything', 'global', '', false), 'global');
  assert.equal(scopedKind('person', 'anything', '', 'Play from anywhere', true), 'global');
});

test('a format default with no venue, scope or declared attendance is Global, whatever the title says', () => {
  assert.equal(scopedKind('person', 'GO Wild Area: Global', '', '', false), 'global');
  assert.equal(scopedKind('person', 'Safari Zone In-Person Night Out', '', '', false), 'global');
});

test('venue-bound events remain In person, whatever the title says', () => {
  assert.equal(scopedKind('person', 'GO Wild Area: Sendai', '', 'Sendai', false), 'person');
  assert.equal(scopedKind('person', 'GO Fest Global meetup', '', 'Stockholm', false), 'person');
  assert.equal(scopedKind('person', 'City Safari', 'in_person', 'Melbourne', true), 'person');
  assert.equal(scopedKind('person', 'Zorblax Summit', '', '', true), 'person');
});

test('unrelated kinds are not changed by global scope', () => {
  assert.equal(scopedKind('raid', 'Global Raid Day', 'global', '', false), 'raid');
  assert.equal(scopedKind('event', 'Timed Research', 'worldwide', '', false), 'event');
});
