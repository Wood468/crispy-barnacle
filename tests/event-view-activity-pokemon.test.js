'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { project } = require('../public/event-view.js');

test('future activity-only event counts unique full Pokémon identities', () => {
  const event = {
    schemaVersion: 1, eventId: 'synthetic-future-activity', family: 'other',
    activities: [
      {kind: 'wild', pokemonRefs: ['pikachu:normal:none', 'eevee:normal:none']},
      {kind: 'raid', pokemonRefs: ['pikachu:normal:none', 'eevee:costume:hat']},
      {kind: 'research', pokemonRefs: [null, '', {}, 'pikachu:normal:none']}
    ]
  };
  const sections = project(event).sections;
  assert.deepEqual(sections.map(s => [s.key, s.count]), [
    ['overview', 1], ['encounters', 3]
  ]);
});

test('explicit encounter records take precedence over activity references', () => {
  const event = {
    schemaVersion: 1, eventId: 'synthetic-with-records', family: 'other',
    encounters: [{species: 'Pikachu'}],
    activities: [{pokemonRefs: ['pikachu:normal:none', 'eevee:normal:none']}]
  };
  assert.equal(project(event).sections.find(s => s.key === 'encounters').count, 1);
});
