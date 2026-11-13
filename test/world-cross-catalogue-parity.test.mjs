// Regional presentation must not outlive the official source-backed catalogue.
// Extend the cross-surface cases as more long-running regional events are curated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = name => JSON.parse(readFileSync(new URL('../public/' + name, import.meta.url), 'utf8'));
const curated = load('data.json').worldEvents || [];
const sourced = load('world-events.json').events || [];
const officialCases = [{
  id: 'w-pokemon-go-x-esa-london',
  title: 'Pokémon GO x ESA',
  url: 'https://pokemongo.com/news/european-space-agency-event/',
}];

test('ongoing regional event summaries retain the exact official end window across catalogues', () => {
  for (const { id, title, url } of officialCases) {
    const world = sourced.find(entry => entry.id === id);
    const row = curated.find(entry => entry.t === title);
    assert.ok(world && row, 'event missing from one of the public Schedule catalogues: ' + title);
    assert.ok(world.sources?.some(source => source.id === 'official' && source.url === url),
      'must validate the authoritative source rather than extrapolate a date');
    assert.equal(row.s, world.start, title + ': start date drift');
    assert.equal(row.e, world.end, title + ': end date drift or invented open-ended claim');
    assert.equal(row.link, url, title + ': visible legacy row must retain authoritative source link');
    assert.match(row.where, /London/, title + ': location label missing');
  }
});
