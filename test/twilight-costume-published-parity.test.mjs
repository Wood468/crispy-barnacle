// Cross-layer read-only regression for source-backed Twilight Wishes costume encounters.
// Internal technical artwork approvals are NOT a copyright licence or proof of live asset delivery.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const V = require('../public/variant-art.js');
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../public/artwork-manifest.json');
const details = read('../public/event-details.json').events;
const curated = read('../public/data.json').events;
const dex = Object.fromEntries(read('../public/dex.json').map(([id, name]) => [String(name).toLowerCase(), id]));
const opts = {
  dexOf: name => dex[name] || 0,
  speciesSrc: name => '/api/art?n=' + encodeURIComponent(name),
};
const variants = [
  ['Pikachu', 'sun crown', 'suncrown', 'GOFEST_2024_STIARA', '25'],
  ['Pikachu', 'moon crown', 'mooncrown', 'GOFEST_2024_MTIARA', '25'],
  ['Espeon', 'sun scarf', 'sunscarf', 'GOFEST_2024_SSCARF', '196'],
  ['Umbreon', 'moon scarf', 'moonscarf', 'GOFEST_2024_MSCARF', '197'],
];

test('published Twilight Wishes keeps four distinct sourced raid costume identities through the exact art resolver', () => {
  const source = details.twilightwishes;
  const card = curated.find(event => event.id === 'twilightwishes');
  assert.ok(source && card, 'canonical source record and curated event must exist');
  const urls = new Set();
  for (const [species, label, costumeId, asset, speciesId] of variants) {
    const identity = speciesId + ':base:' + costumeId;
    const pokemon = source.pokemon.find(row => row.key === identity);
    assert.ok(pokemon, identity + ' must survive the importer');
    assert.equal(pokemon.speciesId, speciesId);
    assert.equal(pokemon.costumeId, costumeId);
    assert.equal(pokemon.label, label);
    assert.equal(pokemon.boostedShiny, null, 'costume Shiny artwork does not imply boosted odds');
    assert.ok(source.encounters.some(edge => edge.identityKey === identity && edge.method === 'raid'),
      identity + ' must keep its exact raid encounter method');
    const display = card.art.find(row => row && typeof row === 'object'
      && row.n === species + ' (' + label + ')' && row.label === label && row.costume);
    assert.ok(display, identity + ' needs an explicit curated costume request');
    for (const shiny of [false, true]) {
      const resolved = V.resolve({ n: display.n, label: display.label, costume: display.costume, shiny }, manifest, opts);
      const expected = '/api/art?n=' + species + '&c=' + asset + (shiny ? '&shiny=1' : '');
      assert.deepEqual([resolved.status, resolved.basis, resolved.src], ['exact', 'manifest', expected], identity);
      assert.match(resolved.provenance?.rights || '', /Rights-sensitive/,
        'technical visual approval must retain the rights caveat');
      urls.add(resolved.src);
    }
  }
  assert.equal(urls.size, 8, 'normal/Shiny and sun/moon costumes cannot silently share artwork');
});

test('source-confirmed Sinistea bow cannot be promoted from source prose to unapproved exact art', () => {
  const halloween = details['leekduck:halloween-2026-part-1'];
  assert.ok(halloween?.fields?.costumes?.some(row => /Sinistea wearing a bow/i.test(row.text)),
    'source confirmation must be preserved even when artwork is unavailable');
  for (const shiny of [false, true]) {
    const request = V.resolve({ n: 'Sinistea (Bow)', label: 'Bow', costume: true, shiny }, manifest, opts);
    assert.equal(request.status, 'fallback');
    assert.equal(request.badge, 'Costume art unavailable');
    assert.equal(request.basis, '', 'neither unlicensed candidate nor another form is approved');
    assert.equal(request.src, '/api/art?n=Sinistea', 'fallback is explicitly the ordinary species illustration');
    assert.ok(!manifest.entries[V.variantKey({ dex: 854, kind: 'costume', costume: 'bow', shiny })]);
  }
});
