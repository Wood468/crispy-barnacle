import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const UI = require('../public/event-components.js');
const { buildCatalogue } = require('../scripts/event-experience/build-catalogue.cjs');
const { announcementFromPage } = await import('../scripts/importer/announcements.mjs');
const { extractEncounters } = await import('../scripts/importer/encounters.mjs');

const dex = [[25, 'Pikachu', 1], [379, 'Registeel', 1], [888, 'Zacian', 1], [889, 'Zamazenta', 1]];
const costumes = [{ name: 'Pikachu', label: 'winter hat' }];
const html = '<h2>Raids</h2><h3>Five-Star Raids</h3><ul><li>Zacian (Crowned Sword) 100% IV CP Level 20 2188 Counters</li></ul>' +
  '<h2>Max Battles</h2><h3>Five-Star Max Battles: Wednesday, March 3</h3><ul><li>Registeel 100% IV CP Level 20 1398 Counters</li></ul>' +
  '<h2>Wild encounters</h2><ul><li>Pikachu wearing a winter hat</li></ul>';
const page = { source: 'leekduck', url: 'https://leekduck.com/events/future-winter-showcase-2027/', title: 'Future Winter Showcase', html, fields: { bonuses: ['2× Catch Candy'] } };

test('importer to catalogue to view: a future announcement with a costume, a Crowned form and a Max roster', () => {
  const announcement = announcementFromPage(page, { dex, costumes });
  assert.equal(announcement.eventId, 'leekduck:future-winter-showcase-2027');
  assert.equal(announcement.schedule, null, 'no dates invented for an announcement without dates');
  const keys = announcement.pokemon.map(p => p.key);
  assert.ok(keys.includes('888:crownedsword:none'));
  assert.ok(keys.includes('379:dynamax:none'));
  assert.ok(keys.some(key => /^25:base:.+/.test(key) && !key.endsWith(':none')), 'costume identity retained: ' + keys);
  assert.ok(!keys.includes('888:base:none') && !keys.includes('25:base:none'), 'no base-species substitutes');
  const run = () => buildCatalogue({ dex, costumeRows: costumes, details: { events: { [announcement.eventId]: { name: announcement.title, normalizedEvent: announcement } } } });
  const first = run(), second = run();
  assert.equal(first.events.length, 1);
  assert.deepEqual(first.events.map(e => e.eventId), second.events.map(e => e.eventId), 'republishing keeps stable IDs');
  const model = first.events[0];
  assert.ok(model.groups.max.length >= 1 && model.groups.raid.length >= 1);
  assert.match(UI.render(model, {}), /Future Winter Showcase/);
});

test('a dated curated card and its importer record collapse into one catalogue event, keeping its verified dates', () => {
  const importerId = 'leekduck:future-winter-showcase-2027';
  const announcement = announcementFromPage(page, { dex, costumes });
  const curated = { id: 'winter', t: 'Future Winter Showcase', s: '2027-03-01T10:00', e: '2027-03-05T20:00', art: ['Zacian'] };
  const result = buildCatalogue({
    dex, costumeRows: costumes,
    data: { events: [curated] },
    details: { events: { [importerId]: { name: announcement.title, normalizedEvent: announcement } } },
    aliases: { same: [['winter', importerId]] },
    corrections: { schemaVersion: 1, events: { winter: { aliases: [importerId], schedule: { start: '2027-03-01T10:00', end: '2027-03-05T20:00', timeBasis: 'player-local' } } } }
  });
  const matches = result.events.filter(e => /Future Winter Showcase/.test(e.title));
  assert.equal(matches.length, 1, 'one record per event');
  assert.equal(matches[0].eventId, 'winter');
  assert.equal(matches[0].schedule.start, '2027-03-01T10:00');
  assert.ok(matches[0].groups.max.length >= 1, 'importer roster reaches the canonical record');
});

test('stale or empty importer input never erases the last published roster', () => {
  const announcement = announcementFromPage(page, { dex, costumes });
  const good = buildCatalogue({ dex, costumeRows: costumes, details: { events: { [announcement.eventId]: { name: announcement.title, normalizedEvent: announcement } } } });
  assert.equal(extractEncounters('<h2>Raids</h2><p>Nothing listed yet.</p>', { dex }).pokemon.length, 0);
  const outage = buildCatalogue({ dex, costumeRows: costumes, previous: good, details: { events: {} } });
  assert.ok(outage.events.some(e => e.eventId === announcement.eventId && e.groups.max.length >= 1), 'last good record retained through a source outage');
});
