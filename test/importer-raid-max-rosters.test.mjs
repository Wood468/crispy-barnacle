import test from 'node:test';
import assert from 'node:assert/strict';
import { extractEncounters } from '../scripts/importer/encounters.mjs';

const dex = [[66, 'Machop'], [280, 'Ralts'], [379, 'Registeel'], [380, 'Latias'], [381, 'Latios'], [621, 'Druddigon'], [888, 'Zacian'], [889, 'Zamazenta'], [895, 'Regidrago']];
const h = (level, text) => ({ t: 'h', level, text });
const li = text => ({ t: 'li', text });
// Shaped like the Leek Duck "Into the Wild" article: stat-card rows, form labels, dated sub-headings.
const lines = [
  h(2, 'Raids'),
  h(3, 'Three-Star Raids'), li('Druddigon 100% IV CP Level 20 1561 Level 25 1951 Weather boosted in Counters'),
  h(3, 'Five-Star Raids'), li('Zacian (Crowned Sword) 100% IV CP Level 20 2188 Level 25 2735 Weather boosted in Counters'), li('Zamazenta (Crowned Shield) 100% IV CP Level 20 2188 Level 25 2735 Weather boosted in Counters'),
  h(3, 'Raid Hour: Monday, November 9'), li('Zacian (Crowned Sword) 100% IV CP Level 20 2188 Level 25 2735 Weather boosted in Counters'),
  h(2, 'Max Battles'),
  h(3, 'One-Star Max Battles'), li('Ralts 100% IV CP Level 20 308 Counters'),
  h(3, 'Five-Star Max Battles: Wednesday, November 11'), li('Registeel 100% IV CP Level 20 1398 Counters'),
  h(3, 'Five-Star Max Battles: Friday, November 13'), li('Latias 100% IV CP Level 20 2006 Counters'), li('Latios 100% IV CP Level 20 2178 Counters'),
  h(2, 'Moves')
];

test('stat-card rows, Crowned forms and dated Max Battle headings keep exact identities', () => {
  const r = extractEncounters(lines, { dex });
  const keys = new Set(r.pokemon.map(p => p.key));
  assert.ok(keys.has('888:crownedsword:none') && keys.has('889:crownedshield:none'), 'Crowned forms keep their own identity');
  assert.ok(!keys.has('888:base:none') && !keys.has('889:base:none'), 'no base-species substitute for Crowned forms');
  assert.ok(keys.has('621:base:none'));
  const method = key => [...new Set(r.encounters.filter(e => e.identityKey === key).map(e => e.method))];
  assert.deepEqual(method('888:crownedsword:none'), ['raid']);
  for (const key of ['280:dynamax:none', '379:dynamax:none', '380:dynamax:none', '381:dynamax:none']) assert.deepEqual(method(key), ['max'], key);
  assert.ok(r.pokemon.every(p => p.shiny === 'unknown' && p.boostedShiny === null), 'no shiny claim inferred');
});

test('a Max Battle roster does not leak into later sections', () => {
  const r = extractEncounters([...lines, li('Machop 100% IV CP')], { dex });
  assert.ok(![...r.pokemon].some(p => p.speciesId === '66'));
});
