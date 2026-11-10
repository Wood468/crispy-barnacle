import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'));
const byId = id => data.events.find(event => event.id === id);
const localDate = value => String(value || '').slice(0, 10);

test('historical fixture: global, in-person and research-rich events retain identity and provenance', () => {
  for (const [id, title] of [
    ['wag', 'GO Wild Area: Global'],
    ['sendai', 'GO Wild Area: Sendai'],
    ['into', 'Into the Wild'],
    ['minior', 'Orionids Meteor Shower: Minior Debut'],
  ]) {
    const event = byId(id);
    assert.ok(event, `missing curated event ${id}`);
    assert.equal(event.t, title);
    assert.ok(event.s < event.e, `invalid event dates: ${id}`);
    assert.match(event.sourceUrl, /^https:\/\//, `missing source: ${id}`);
    assert.ok(event.art, `missing curated artwork: ${id}`);
  }
  assert.ok(byId('sendai').tags.includes('In person'), 'in-person status must survive import');
  assert.ok(byId('wag').tags.includes('Raids'), 'global event raid classification must survive import');
});

function validateEventRaidDays(event) {
  assert.ok(event.s < event.e, 'event interval must be valid');
  const seen = new Set();
  for (const day of event.raidDays || []) {
    assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/, 'date must be a local calendar day');
    assert.ok(!seen.has(day.date), 'duplicate local raid day');
    seen.add(day.date);
    assert.ok(day.date >= localDate(event.s) && day.date <= localDate(event.e), 'raid day outside event');
    for (const key of ['five', 'max']) {
      assert.ok(Array.isArray(day[key]), `${key} must be an array`);
      assert.equal(new Set(day[key]).size, day[key].length, `duplicate ${key} boss`);
      for (const name of day[key]) assert.ok(typeof name === 'string' && name.trim(), 'empty boss name');
    }
  }
}

test('synthetic future event: multiple local raid days can be represented without event IDs or hardcoded species', () => {
  const fixture = {
    id: 'future-fixture-not-a-real-event',
    t: 'Synthetic Future Raid Festival',
    s: '2027-02-06T10:00',
    e: '2027-02-07T18:00',
    raidDays: [
      { date: '2027-02-06', five: ['Species Alpha'], max: ['Dynamax Species Beta'] },
      { date: '2027-02-07', five: ['Species Gamma'], max: ['Gigantamax Species Delta'] },
    ],
  };
  validateEventRaidDays(fixture);
  assert.notDeepEqual(fixture.raidDays[0].five, fixture.raidDays[1].five);
  assert.throws(() => validateEventRaidDays({ ...fixture, raidDays: [{ date: '2027-02-08', five: [], max: [] }] }), /outside event/);
  assert.throws(() => validateEventRaidDays({ ...fixture, raidDays: [fixture.raidDays[0], fixture.raidDays[0]] }), /duplicate local raid day/);
});

test('all existing event raidDays, when present, obey the reusable event contract', () => {
  for (const event of data.events.filter(event => event.raidDays)) validateEventRaidDays(event);
});
