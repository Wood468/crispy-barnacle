// Sprint 4 regression: confirmed published Into the Wild research must reach
// the canonical event and reusable Event Details renderer without reparsing HTML.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildCatalogue } = require('../scripts/event-experience/build-catalogue.cjs');
const UI = require('../public/event-components.js');
const View = require('../public/event-view.js');
const load = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

test('Into the Wild 2026: seven source-backed Field Research tasks survive to Event Details', () => {
  const data = load('../public/data.json');
  const details = load('../public/event-details.json').events;
  const curated = data.events.find(event => event.id === 'into');
  const source = details.into;
  assert.ok(curated && source, 'expected the current canonical event and linked source record');
  assert.equal(source.researchTasks.length, 7, 'do not lose or fabricate published task boundaries');

  const expected = [
    ['Catch 10 Pokémon', 4],
    ['Catch a Dynamax Machop', 2],
    ['Catch a Dynamax Ralts', 2],
    ['Power up Dragon-type Pokémon 5 times', 4],
    ['Power up Steel-type Pokémon 5 times', 4],
    ['Win a Max Battle', 2],
    ['Win a raid', 3],
  ];
  const normalize = name => name.normalize('NFKC').replace(/[‐‑‒–—]/g, '-');
  assert.deepEqual(source.researchTasks.map(task => [normalize(task.task), task.rewards.length]).sort(),
    expected.sort(), 'all seven separate task/reward boundaries must match the published source');
  assert.ok(source.researchTasks.every(task => task.category === 'field'));
  const tasksByName = new Map(source.researchTasks.map(task => [normalize(task.task), task]));
  const raid = tasksByName.get('Win a raid').rewards;
  assert.equal(raid.filter(reward => reward.type === 'encounter').length, 2);
  assert.ok(raid.some(reward => reward.type === 'item' && reward.name === 'Rare Candy' && reward.quantity === 2));
  for (const [taskName, candy] of [['Catch a Dynamax Machop', 'Machop Candy'], ['Catch a Dynamax Ralts', 'Ralts Candy']]) {
    assert.deepEqual(tasksByName.get(taskName).rewards.map(reward => [reward.type, reward.name, reward.quantity]),
      [['item', candy, 25], ['item', 'Stardust', 5000]]);
  }
  const galarian = tasksByName.get('Power up Steel-type Pokémon 5 times').rewards.find(reward => reward.name === 'Galarian Meowth');
  assert.ok(galarian && galarian.type === 'encounter', 'do not substitute the standard Meowth form');

  const compiled = buildCatalogue({ dex: load('../public/dex.json'), data: { events: [curated] },
    details: { events: { into: source } } });
  const matches = compiled.events.filter(event => event.eventId === 'into');
  assert.equal(matches.length, 1, 'the event must not be duplicated');
  const event = matches[0];
  assert.equal(View.researchTaskCount(event.research), 7);
  const rows = event.research.filter(row => typeof row.task === 'string');
  assert.equal(rows.length, 7);
  for (const task of source.researchTasks) {
    const row = rows.find(x => normalize(x.task) === normalize(task.task));
    assert.ok(row, 'missing rendered event task: ' + task.task);
    assert.deepEqual(row.rewards.map(reward => [reward.type, reward.name, reward.quantity, reward.cpMin, reward.cpMax]),
      task.rewards.map(reward => [reward.type, reward.name, reward.quantity, reward.cpMin, reward.cpMax]),
      'reward alternatives, amounts and CP bounds must survive: ' + task.task);
  }

  const html = UI.render(event, {});
  assert.match(html, /data-sec="research"/);
  assert.match(html, /7 tasks/);
  assert.equal((html.match(/<article class="research-task"/g) || []).length, 7,
    'the Event Details renderer must display seven independent task cards');
  for (const row of rows) {
    assert.ok(html.includes(row.task), 'missing rendered task name: ' + row.task);
    for (const reward of row.rewards) {
      assert.ok(html.includes(reward.name), 'missing reward label: ' + reward.name);
      if (reward.type === 'encounter') {
        assert.ok(Number.isInteger(reward.cpMin) && Number.isInteger(reward.cpMax) && reward.cpMin <= reward.cpMax,
          'malformed encounter CP bounds: ' + reward.name);
        assert.ok(html.includes('CP ' + reward.cpMin + '–' + reward.cpMax),
          'rendered encounter must retain CP range: ' + reward.name);
      }
    }
  }
});
