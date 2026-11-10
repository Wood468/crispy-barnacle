import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Contract = require('../public/event-contract.js');
const Clock = require('../public/event-clock.js');
const UI = require('../public/event-components.js');

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
    assert.ok(Clock.valid(day.date + 'T00:00', false), 'raid day must exist on the calendar');
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
  assert.throws(() => validateEventRaidDays({ ...fixture, s: '2027-02-01T00:00', e: '2027-03-05T23:59', raidDays: [{ date: '2027-02-30', five: [], max: [] }] }), /exist on the calendar/);
});

test('all existing event raidDays, when present, obey the reusable event contract', () => {
  for (const event of data.events.filter(event => event.raidDays)) validateEventRaidDays(event);
});

test('synthetic future multi-day raid schedule passes the real event contract and reaches Event Details', () => {
  // This validates the supported, time-aware activity contract rather than
  // assuming a legacy raidDays list is already converted by the importer.
  const makeDay = (id, title, date) => ({
    id, title, kind: 'raid-day', presentation: 'schedule',
    schedule: { start: date + 'T10:00', end: date + 'T18:00', timeBasis: 'player-local' },
    sourceUrl: 'https://example.org/verified-future-event'
  });
  const raw = {
    schemaVersion: 1, eventId: 'synthetic-future-raid-festival',
    title: 'Synthetic Future Raid Festival', family: 'raid-day',
    schedule: { start: '2027-02-06T10:00', end: '2027-02-07T18:00', timeBasis: 'player-local' },
    activities: [
      makeDay('sat-raid', 'Saturday: Species Alpha raid', '2027-02-06'),
      makeDay('sun-max', 'Sunday: Dynamax Species Beta battle', '2027-02-07')
    ],
    sources: [{ name: 'Synthetic QA fixture', url: 'https://example.org/verified-future-event' }],
    pokemon: [], encounters: [], research: [], bonuses: []
  };
  const model = Contract.normalize(raw);
  assert.equal(model.family, 'raid-day');
  assert.deepEqual(model.activities.map(a => a.id), ['sat-raid', 'sun-max']);
  assert.ok(model.activities.every(a => a.presentation === 'schedule'));
  for (const activity of model.activities) {
    const range = Clock.range(activity.schedule, 'Australia/Melbourne');
    assert.ok(range.end > range.start);
  }
  const html = UI.render(model, { clock: Clock, viewerZone: 'Australia/Melbourne' });
  assert.match(html, /Synthetic Future Raid Festival/);
  assert.match(html, /Saturday: Species Alpha raid/);
  assert.match(html, /Sunday: Dynamax Species Beta battle/);
  assert.match(html, /data-sec="schedule"/, 'future activities appear in the universal Schedule section');
  assert.doesNotMatch(html, /No scheduled activities|More details to come/, 'published activities must not look empty');
  const invalid = {
    ...raw,
    activities: [makeDay('bad', 'Nonexistent raid date', '2027-02-30')]
  };
  assert.throws(() => Contract.normalize(invalid), /Invalid schedule datetime/);
  assert.throws(() => Contract.normalize({ ...raw, activities: [raw.activities[0], raw.activities[0]] }), /Duplicate activity id/);
});
