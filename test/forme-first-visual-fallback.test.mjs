import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const L = createRequire(import.meta.url)('../public/today-logic.js');

// All fourteen source-name pairs are already recognized by the Worker exact
// PokeAPI resolver (#593). This test guards the Today visual fallback contract.
const cases = [
  ['Normal Forme Deoxys', 'Deoxys', 'Normal Forme'],
  ['Attack Forme Deoxys', 'Deoxys', 'Attack Forme'],
  ['Defense Forme Deoxys', 'Deoxys', 'Defense Forme'],
  ['Speed Forme Deoxys', 'Deoxys', 'Speed Forme'],
  ['Altered Forme Giratina', 'Giratina', 'Altered Forme'],
  ['Origin Forme Giratina', 'Giratina', 'Origin Forme'],
  ['Land Forme Shaymin', 'Shaymin', 'Land Forme'],
  ['Sky Forme Shaymin', 'Shaymin', 'Sky Forme'],
  ['Incarnate Forme Tornadus', 'Tornadus', 'Incarnate Forme'],
  ['Therian Forme Tornadus', 'Tornadus', 'Therian Forme'],
  ['Incarnate Forme Thundurus', 'Thundurus', 'Incarnate Forme'],
  ['Therian Forme Thundurus', 'Thundurus', 'Therian Forme'],
  ['Incarnate Forme Landorus', 'Landorus', 'Incarnate Forme'],
  ['Therian Forme Landorus', 'Landorus', 'Therian Forme']
];

test('Today preserves exact form visual identity for every Worker Forme-first alias', () => {
  for (const [prefixed, species, form] of cases) {
    const pref = L.classifyArt(prefixed);
    const parenthetical = L.classifyArt(species + ' (' + form + ')');
    for (const classified of [pref, parenthetical]) {
      assert.equal(classified.base, species, prefixed);
      assert.equal(classified.kind, 'form', prefixed);
      assert.equal(classified.exact, true, prefixed);
      assert.equal(classified.form, form, prefixed);
      assert.equal(classified.label, form, prefixed);
      assert.deepEqual(L.artFallback(classified),
        { show: 'base-with-label', chip: 'Form art unavailable' }, prefixed);
    }
  }
});

test('Forme alias matching ignores case without changing source-displayed name', () => {
  const c = L.classifyArt('therian forme landorus');
  assert.equal(c.name, 'therian forme landorus');
  assert.equal(c.base, 'landorus');
  assert.equal(c.kind, 'form');
  assert.equal(c.label, 'Therian Forme');
  assert.equal(c.exact, true);
});

test('ordinary, Mega, Primal, Gigantamax, Shadow, Dynamax and costume fallbacks are unchanged', () => {
  const examples = [
    ['Pikachu', 'base', false, ''],
    ['Mega Charizard X', 'mega', true, 'Form art unavailable'],
    ['Primal Kyogre', 'primal', true, 'Form art unavailable'],
    ['Gigantamax Duraludon', 'gigantamax', true, 'Form art unavailable'],
    ['Shadow Mewtwo', 'shadow', false, ''],
    ['Dynamax Dialga', 'dynamax', false, ''],
    ['Galarian Zapdos', 'regional', true, 'Form art unavailable'],
    ['Crowned Sword Zacian', 'form', true, 'Form art unavailable']
  ];
  for (const [name, kind, exact, chip] of examples) {
    const c = L.classifyArt(name);
    assert.equal(c.kind, kind, name);
    assert.equal(c.exact, exact, name);
    assert.equal(L.artFallback(c).chip, chip, name);
  }
  assert.equal(L.artFallback(L.classifyArt({ name: 'Pikachu', costume: true })).chip,
    'Costume art unavailable');
  assert.equal(L.classifyArt('Therian Forme Imaginarymon').exact, true,
    'unpublished named variety must not silently fall back to ordinary artwork');
});
