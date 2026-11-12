import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Invoke the real Cloudflare Worker candidate resolver, not a duplicate mapper.
// PokeAPI pokemon.csv and PokeAPI/sprites official-artwork confirm every
// expected variety below (normal and alternate forms have distinct Pokémon IDs).
const source = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
const start = source.indexOf('export function artCandidates(raw) {');
const end = source.indexOf('// The main picture on an event', start);
assert.ok(start >= 0 && end > start, 'art resolver extraction must stay bounded');
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const code = source.slice(start, end).replace('export function artCandidates', 'function artCandidates');
const candidate = vm.runInNewContext('(function(slug) {' + code + '; return artCandidates; })')(slug);

const FORMS = [
  ['Normal Forme Deoxys', 'Deoxys (Normal Forme)', 'deoxys-normal', 'deoxys'],
  ['Attack Forme Deoxys', 'Deoxys (Attack Forme)', 'deoxys-attack', 'deoxys'],
  ['Defense Forme Deoxys', 'Deoxys (Defense Forme)', 'deoxys-defense', 'deoxys'],
  ['Speed Forme Deoxys', 'Deoxys (Speed Forme)', 'deoxys-speed', 'deoxys'],
  ['Altered Forme Giratina', 'Giratina (Altered Forme)', 'giratina-altered', 'giratina'],
  ['Origin Forme Giratina', 'Giratina (Origin Forme)', 'giratina-origin', 'giratina'],
  ['Land Forme Shaymin', 'Shaymin (Land Forme)', 'shaymin-land', 'shaymin'],
  ['Sky Forme Shaymin', 'Shaymin (Sky Forme)', 'shaymin-sky', 'shaymin'],
  ['Incarnate Forme Tornadus', 'Tornadus (Incarnate Forme)', 'tornadus-incarnate', 'tornadus'],
  ['Therian Forme Tornadus', 'Tornadus (Therian Forme)', 'tornadus-therian', 'tornadus'],
  ['Incarnate Forme Thundurus', 'Thundurus (Incarnate Forme)', 'thundurus-incarnate', 'thundurus'],
  ['Therian Forme Thundurus', 'Thundurus (Therian Forme)', 'thundurus-therian', 'thundurus'],
  ['Incarnate Forme Landorus', 'Landorus (Incarnate Forme)', 'landorus-incarnate', 'landorus'],
  ['Therian Forme Landorus', 'Landorus (Therian Forme)', 'landorus-therian', 'landorus']
];

test('future events resolve Forme-first and species-first names to the same exact form', () => {
  for (const [prefixed, parenthesised, variety, base] of FORMS) {
    for (const label of [prefixed, parenthesised]) {
      const out = candidate(label);
      assert.equal(out.base, base, label);
      assert.equal(out.exact, true, label);
      assert.deepEqual(Array.from(out.list), [variety], label);
      assert.ok(!out.list.includes(base), label + ' must not silently show normal species art');
    }
  }
});

test('unpublished or misidentified Forme-first Pokémon never falls back to plain species art', () => {
  const out = candidate('Therian Forme Imaginarymon');
  assert.equal(out.exact, true);
  assert.equal(out.base, 'imaginarymon');
  assert.deepEqual(Array.from(out.list), ['imaginarymon-therian']);
  assert.ok(!out.list.includes('imaginarymon'));
});

test('existing special forms, ordinary Dynamax and standard Pokémon are unchanged', () => {
  for (const [name, wanted, exact] of [
    ['Crowned Sword Zacian', 'zacian-crowned', true],
    ['Crowned Shield Zamazenta', 'zamazenta-crowned', true],
    ['White Kyurem', 'kyurem-white', true],
    ['Black Kyurem', 'kyurem-black', true],
    ['Gigantamax Duraludon', 'duraludon-gmax', true],
    ['Mega Charizard X', 'charizard-mega-x', true],
    ['Primal Kyogre', 'kyogre-primal', true],
    ['Dynamax Dialga', 'dialga', false],
    ['Pikachu', 'pikachu', false]
  ]) {
    const out = candidate(name);
    assert.equal(out.exact, exact, name);
    assert.deepEqual(Array.from(out.list), [wanted], name);
  }
});
