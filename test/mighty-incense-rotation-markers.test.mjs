import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const rotations = require('../public/event-encounter-rotations.js');
const doc = JSON.parse(readFileSync(new URL('../public/event-encounter-rotations.json', import.meta.url), 'utf8'));
const entry = doc.entries.find(x => x.id === 'gowa-2026-global');
const css = readFileSync(new URL('../public/event-encounter-rotations.css', import.meta.url), 'utf8');
const art = ({ n }) => '<img class="art" alt="' + n + '">';
const render = e => rotations.render(e, { art, now: new Date('2026-11-13T23:10:00Z'), viewerZone: 'Australia/Melbourne' });
const deepCopy = x => JSON.parse(JSON.stringify(x));

test('GO Wild source-backed Mighty day and ticket-only Incense tiles have separate corners', () => {
  assert.ok(entry, 'verified GO Wild rotation source exists');
  assert.deepEqual(rotations.validate(entry), []);
  const html = render(entry);
  assert.equal((html.match(/class="uer-pokemon-tile"/g) || []).length, 64);
  assert.equal((html.match(/class="uer-mighty-corner"/g) || []).length, 20, '18 dated wild Mighty plus 2 ticket Incense');
  assert.equal((html.match(/class="uer-incense-corner"/g) || []).length, 2, 'only verified Incense group');
  const saturday = html.match(/<article class="uer-mighty-day" data-mighty-date="2026-11-14"[\s\S]*?<\/article>/)?.[0] || '';
  assert.match(saturday, /data-pokemon="Metagross" data-method="wild" data-mighty="true"/);
  assert.match(saturday, /class="uer-mighty-corner"/);
  assert.doesNotMatch(saturday, /uer-incense-corner/, 'wild Mighty is not an Incense claim');
  const shared = html.match(/<article class="uer-mighty-shared" data-shared-id="ticket-incense"[\s\S]*?<\/article>/)?.[0] || '';
  for (const name of ['Latias', 'Latios']) {
    assert.match(shared, new RegExp('data-pokemon="' + name + '" data-method="incense" data-mighty="true" aria-label="Mighty ' + name + ', Incense encounter, Ticket-only"'));
  }
  assert.equal((shared.match(/class="uer-mighty-corner"/g) || []).length, 2);
  assert.equal((shared.match(/class="uer-incense-corner"/g) || []).length, 2);
  assert.equal((shared.match(/src="\/ico\/incense\.webp"/g) || []).length, 2);
  assert.doesNotMatch(shared, /data-track|data-follow|Follow Pokémon/);
});

test('future events mark Mighty per encounter, not every occurrence of the same species', () => {
  const future = deepCopy(entry);
  future.id = 'future-source-backed-festival';
  future.eventIds = ['future-festival'];
  future.habitats[0].pokemon[0] = 'Latias'; // ordinary habitat Latias alongside ticket Mighty Latias
  assert.deepEqual(rotations.validate(future), []);
  const html = render(future);
  const steel = html.match(/<article class="uer-habitat uer-habitat-steel"[\s\S]*?<\/article>/)?.[0] || '';
  const normal = steel.match(/<div class="uer-pokemon-tile" role="group" data-pokemon="Latias"[\s\S]*?<\/div>/)?.[0] || '';
  assert.match(normal, /data-method="wild"/);
  assert.doesNotMatch(normal, /data-mighty|uer-mighty-corner|uer-incense-corner/);
  assert.match(html, /data-pokemon="Latias" data-method="incense" data-mighty="true"/);
  assert.match(html, /aria-label="Mighty Latias, Incense encounter, Ticket-only"/);
});

test('future Mighty route encounters show !!! but never claim Incense', () => {
  const future = deepCopy(entry);
  future.mightyShared[0].method = 'route';
  assert.deepEqual(rotations.validate(future), []);
  const html = render(future);
  const shared = html.match(/<article class="uer-mighty-shared"[\s\S]*?<\/article>/)?.[0] || '';
  assert.equal((shared.match(/class="uer-mighty-corner"/g) || []).length, 2);
  assert.doesNotMatch(shared, /uer-incense-corner/);
  assert.match(shared, /aria-label="Mighty Latias, Route encounter, Ticket-only"/);
});

test('the two indicators occupy opposite 20px corners without overpainting the Pokémon', () => {
  assert.match(css, /\.uer-pokemon-art\{position:relative;/);
  assert.match(css, /\.uer-mighty-corner\{position:absolute;inset-block-start:0;inset-inline-start:0;/);
  assert.match(css, /\.uer-incense-corner\{position:absolute;inset-block-start:0;inset-inline-end:0;/);
  assert.match(css, /\.uer-incense-corner img\{display:block;width:20px;height:20px;/);
  assert.match(css, /\.uer-mighty-corner\{[^}]*pointer-events:none/);
  assert.match(css, /\.uer-incense-corner\{[^}]*pointer-events:none/);
});