// Source-backed regional-event presentation guard, independent of the Into the Wild parser.
// Official references: pokemongo.com/en/gowildarea/mexico-city/
// and pokemongo.com/news/pokemon-night-out-irl-details2026/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = filename => JSON.parse(readFileSync(new URL('../public/' + filename, import.meta.url), 'utf8'));
const world = read('world-events.json').events;
const details = read('event-details.json').events;
const byId = id => world.find(event => event.id === id);
const hasOfficial = (event, url) => event.sources?.some(s => s.id === 'official' && s.url === url);

test('Mexico City in-person Wild Area preserves official venue, event dates and source identity', () => {
  const event = byId('w-mexico-city-go-wild-area-2026');
  assert.ok(event, 'do not drop past overseas in-person events from the world catalogue');
  assert.equal(event.place, 'Mexico City, Mexico');
  assert.equal(event.scope, 'regional');
  assert.equal(event.start, '2026-11-06');
  assert.equal(event.end, '2026-11-08');
  assert.ok(hasOfficial(event, 'https://pokemongo.com/en/gowildarea/mexico-city/'));
  const detail = details['leekduck:pokemon-go-wild-area-2026-mexico-city'];
  assert.ok(detail?.sources?.some(s => s.url === 'https://leekduck.com/events/pokemon-go-wild-area-2026-mexico-city/'));
  assert.ok((detail.researchTasks || []).length > 0, 'preserve separate published research tasks when sourced');
});

test('Mexico City ongoing Stamp Rally must not acquire a fabricated closing date', () => {
  const rally = byId('w-pok-mon-go-stamp-rally-mexico-city');
  assert.ok(rally);
  assert.equal(rally.place, 'Mexico City, Mexico');
  assert.equal(rally.scope, 'regional');
  assert.equal(rally.start, '2026-11-02T16:00:00-08:00');
  assert.equal(rally.ongoing, true);
  assert.equal(rally.end, '', 'no official published end: avoid inferring from Wild Area event dates');
  assert.ok(hasOfficial(rally, 'https://pokemongo.com/en/news/forever-stamp-rally-go-wild-area-2026/'));
});

test('London Night Out remains venue-specific with no guessed Field Research task steps', () => {
  const night = byId('w-celebrate-the-pok-mon-night-out-events-in-pok-mon--2026-11-10');
  assert.ok(night);
  assert.equal(night.place, 'London, UK');
  assert.equal(night.scope, 'regional');
  assert.equal(night.start, '2026-11-10');
  assert.equal(night.end, '2026-11-10');
  assert.ok(hasOfficial(night, 'https://pokemongo.com/news/pokemon-night-out-irl-details2026/'));
  const detail = details['leekduck:pokemon-night-out-london-2026'];
  assert.ok(detail?.sources?.some(s => s.url === 'https://leekduck.com/events/pokemon-night-out-london-2026/'));
  assert.deepEqual(detail.researchTasks || [], [], 'reward announcements are not individual task steps');
  const research = (detail.fields?.research || []).map(row => row.text || '').join(' ');
  assert.match(research, /Toxtricity \(Low Key Form\)/);
  assert.match(research, /Toxtricity \(Amped Form\)/);
});

test('London ESA multi-location activity stays distinct from the one-night O2 event', () => {
  const esa = byId('w-pokemon-go-x-esa-london');
  assert.ok(esa);
  assert.match(esa.place, /London/);
  assert.notEqual(esa.id, 'w-celebrate-the-pok-mon-night-out-events-in-pok-mon--2026-11-10');
  assert.ok(hasOfficial(esa, 'https://pokemongo.com/news/european-space-agency-event/'));
});
