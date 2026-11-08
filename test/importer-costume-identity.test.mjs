import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractEncounters } from '../scripts/importer/encounters.mjs';
import { htmlToLines } from '../scripts/importer/text.mjs';

const html = readFileSync(new URL('./fixtures/leekduck-costume-icons.html', import.meta.url), 'utf8');
const dex = [[25, 'Pikachu'], [196, 'Espeon'], [197, 'Umbreon'], [605, 'Elgyem'], [94, 'Gengar']];
const byKey = result => Object.fromEntries(result.pokemon.map(p => [p.key, p]));

test('icon file + alt text keep exact costume identities, even when the visible name is only the species', () => {
  const got = byKey(extractEncounters(html, { dex }));
  for (const [key, label] of [['25:base:suncrown', 'sun crown'], ['25:base:mooncrown', 'moon crown'], ['196:base:sunscarf', 'sun scarf'], ['197:base:moonscarf', 'moon scarf']]) {
    assert.ok(got[key], key + ' retained');
    assert.equal(got[key].label, label);
    assert.ok(got[key].costumeId);
    assert.equal(got[key].boostedShiny, null, 'ordinary shiny availability never implies a boost');
  }
  assert.ok(got['25:base:none'], 'plain Pikachu stays a separate identity');
  assert.ok(got['605:base:none'], 'non-costume Pokémon are unaffected');
});

test('every costume is attached to its own method', () => {
  const r = extractEncounters(html, { dex });
  const method = key => r.encounters.find(e => e.identityKey === key)?.method;
  assert.equal(method('25:base:suncrown'), 'raid');
  assert.equal(method('196:base:sunscarf'), 'wild');
});

test('works for any event: a different costume needs no special case', () => {
  const page = '<main><h2>Spawns</h2><ul><li><img src="https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm94.fCOSTUME_2020_01.icon.png" alt="Gengar wearing a Spooky Festival costume"><div>Gengar</div></li></ul></main>';
  const r = extractEncounters(page, { dex });
  assert.deepEqual(r.pokemon.map(p => [p.key, p.label]), [['94:base:spookyfestival', 'Spooky Festival']]);
});

test('an icon without a costume label is not guessed', () => {
  const page = '<main><h2>Spawns</h2><ul><li><img src="https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm25.fGOFEST_2024_STIARA.icon.png" alt="Pikachu"><div>Pikachu</div></li></ul></main>';
  assert.deepEqual(extractEncounters(page, { dex }).pokemon.map(p => p.key), ['25:base:none']);
});

test('htmlToLines only adds icon refs to list items that name a costume', () => {
  const lines = htmlToLines(html).filter(l => l.t === 'li');
  assert.ok(lines.some(l => l.icons && /STIARA/.test(l.icons[0].file)));
  assert.ok(lines.filter(l => l.text === 'Elgyem').every(l => !l.icons));
});
