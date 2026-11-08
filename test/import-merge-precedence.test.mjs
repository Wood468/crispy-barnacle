import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const A = require('../public/event-adapter.js');
const { buildCatalogue } = require('../scripts/event-experience/build-catalogue.cjs');

const dex = [[25, 'Pikachu'], [196, 'Espeon'], [133, 'Eevee']];
const curated = (extra = {}) => ({ id: 'tw', t: 'Twilight Wishes', s: '2026-11-24T10:00', e: '2026-11-30T20:00', scope: 'worldwide_local',
  art: [{ n: 'Pikachu (sun crown)', costume: 1, label: 'sun crown' }], sourceUrl: 'https://pokemongo.com/news/twilight-wishes-2026', ...extra });
const plain = (name, id) => ({ speciesId: String(id), name });
const build = (data, details, previous) => buildCatalogue({ dex, data: { events: [data] }, details: { events: details }, previous, costumeRows: [{ name: 'Pikachu', label: 'sun crown', costumeId: 'suncrown' }] });
const roster = cat => cat.events.find(e => e.eventId === 'tw').pokemon;

test('an import that only names the plain species never replaces a curated costume identity', () => {
  const cat = build(curated(), { tw: { name: 'Twilight Wishes', pokemon: [plain('Pikachu', 25)] } });
  const costume = roster(cat).find(p => p.costumeId === 'suncrown');
  assert.ok(costume, 'costume identity kept');
  assert.equal(costume.label, 'sun crown');
  assert.equal(costume.speciesId, '25');
});

test('a later, less specific import cannot remove a published costume identity', () => {
  const first = build(curated(), { tw: { pokemon: [plain('Pikachu', 25)] } });
  const second = build({ id: 'tw', t: 'Twilight Wishes', s: '2026-11-24T10:00', e: '2026-11-30T20:00', scope: 'worldwide_local' }, { tw: { pokemon: [plain('Pikachu', 25)] } }, first);
  assert.ok(roster(second).some(p => p.costumeId === 'suncrown'), 'costume survives a partial snapshot');
});

test('curated schedule wins over importer date prose; importer text never rewrites dates', () => {
  const cat = build(curated(), { tw: { fields: { dates: [{ text: 'November 1 at 1:00 p.m. to November 2 at 2:00 p.m. local', sources: ['leekduck'], status: 'single' }] } } });
  const ev = cat.events.find(e => e.eventId === 'tw');
  assert.match(JSON.stringify(ev.schedule || ev.internalValidation.legacyDates), /2026-11-24T10:00/);
  assert.doesNotMatch(JSON.stringify(ev.schedule || {}), /2026-11-01/);
});

test('a source that omits Shiny data cannot downgrade a published claim, and availability never becomes a boost', () => {
  const previous = A.retain(null, A.adapt({ id: 'x', t: 'X', pokemon: [{ speciesId: '133', name: 'Eevee', shiny: 'yes', boostedShiny: true }] }, {}, {}));
  A.configureSpecies(dex);
  const next = A.adapt({ id: 'x', t: 'X', pokemon: [{ speciesId: '133', name: 'Eevee', shiny: 'unknown' }] }, {}, {});
  const merged = A.retain(previous, next);
  assert.equal(merged.pokemon[0].shiny, 'yes'); assert.equal(merged.pokemon[0].boostedShiny, true);
  const plainYes = A.adapt({ id: 'y', t: 'Y', pokemon: [{ speciesId: '133', name: 'Eevee', shiny: 'yes' }] }, {}, {});
  assert.equal(plainYes.pokemon[0].boostedShiny, null, 'shiny availability alone is never a boosted shiny');
});

test('a reviewed event image and its provenance survive an import that carries no image', () => {
  const reviewed = { tw: { image: 'https://cdn.leekduck.com/assets/img/events/twilight-wishes-2026.jpg', imageProvenance: { source: 'Leek Duck', sourceUrl: 'https://leekduck.com/events/twilight-wishes-2026/' } } };
  const first = build(curated(), reviewed);
  assert.equal(first.events.find(e => e.eventId === 'tw').image, reviewed.tw.image);
  const second = build(curated(), { tw: { name: 'Twilight Wishes' } }, first);
  assert.equal(second.events.find(e => e.eventId === 'tw').image, reviewed.tw.image);
});

test('source lists and notes accumulate; a cancelled lifecycle is not undone by a stale source', () => {
  const first = build(curated({ lifecycle: 'cancelled' }), { tw: { sources: [{ id: 'leekduck', name: 'Leek Duck', url: 'https://leekduck.com/events/twilight-wishes-2026/' }] } });
  const second = build(curated(), { tw: { sources: [{ id: 'hub', name: 'Hub', url: 'https://pokemongohub.net/post/event/twilight-wishes-2026/' }] } }, first);
  const ev = second.events.find(e => e.eventId === 'tw');
  assert.equal(ev.lifecycle, 'cancelled');
  const urls = ev.sources.map(s => s.url);
  assert.ok(urls.some(u => /leekduck/.test(u)) && urls.some(u => /pokemongohub/.test(u)), urls.join());
});
