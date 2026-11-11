import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const V = createRequire(import.meta.url)('../public/variant-art.js');
const manifest = JSON.parse(fs.readFileSync(new URL('../public/artwork-manifest.json', import.meta.url), 'utf8'));
const dexList = JSON.parse(fs.readFileSync(new URL('../public/dex.json', import.meta.url), 'utf8'));
const DEX = Object.fromEntries(dexList.map(p => [String(p[1]).toLowerCase(), p[0]]));
const opts = { dexOf: n => DEX[n] || 0, speciesSrc: (n, shiny) => '/api/art?n=' + encodeURIComponent(n) + (shiny ? '&shiny=1' : '') };
const r = (input, m = manifest, o = opts) => V.resolve(input, m, o);

test('normal and Shiny species use the ordinary route, Shiny asks for the shiny file, no badge', () => {
  const n = r({ n: 'Pikachu' }), s = r({ n: 'Pikachu', shiny: true });
  assert.deepEqual([n.status, n.src, n.badge], ['species', '/api/art?n=Pikachu', '']);
  assert.deepEqual([s.status, s.src], ['species', '/api/art?n=Pikachu&shiny=1']);
});
test('Shadow and Dynamax are labelled treatments of the species picture, never a claimed sprite', () => {
  for (const [flag, label] of [['shadow', 'Shadow'], ['dynamax', 'Dynamax']]) {
    const x = r({ n: 'Machamp', [flag]: true });
    assert.equal(x.status, 'treated'); assert.equal(x.treatment, flag); assert.equal(x.badge, label); assert.equal(x.src, '/api/art?n=Machamp');
  }
  assert.equal(r({ n: 'Shadow Machamp' }).treatment, 'shadow');
  assert.equal(r({ n: 'Dynamax Dialga' }).treatment, 'dynamax');
  assert.notEqual(r({ n: 'Machamp', shadow: true }).key, r({ n: 'Machamp', dynamax: true }).key + 'x');
});
test('Gigantamax is distinct from Dynamax and from the species', () => {
  const g = r({ n: 'Gigantamax Charizard', dynamax: true });
  assert.equal(g.kind, 'gigantamax'); assert.equal(g.status, 'exact');
  assert.match(g.key, /^6\|normal\|gigantamax\|\|regular$/);
  assert.equal(r({ n: 'Charizard', dynamax: true }).kind, 'dynamax');
});
test('Gigantamax art not in the manifest or legacy maps falls back to the labelled species picture', () => {
  const x = r({ n: 'Gigantamax Slowbro', dynamax: true }, { entries: {}, pokeminers: { gigantamax: [] } });
  assert.deepEqual([x.status, x.badge, x.src], ['fallback', 'Form art unavailable', '/api/art?n=Slowbro']);
});
test('a listed PokeMiners Gigantamax species resolves by rule, shiny keeps shiny', () => {
  const m = { entries: {}, pokeminers: { gigantamax: [6] } };
  assert.equal(r({ n: 'Gigantamax Charizard' }, m).src, '/api/art?n=Gigantamax%20Charizard&dynamax=1');
  assert.equal(r({ n: 'Gigantamax Charizard', shiny: true }, m).src, '/api/art?n=Gigantamax%20Charizard&dynamax=1&shiny=1');
  assert.equal(r({ n: 'Gigantamax Charizard' }, m).basis, 'rule');
});
test('legacy Gigantamax and costume maps still resolve', () => {
  const legacy = { gmax: { 'gigantamax duraludon': '/img/ext/884-gi-fc4c7ccd.png' }, pictures: { 'pikachu|astronaut': '/img/ext/25-pikachu-astronaut-00a1fb21.png' }, shiny: {}, gmaxShiny: {} };
  const g = r({ n: 'Gigantamax Duraludon' }, { entries: {} }, { ...opts, legacy });
  assert.deepEqual([g.status, g.basis, g.src], ['exact', 'legacy', '/img/ext/884-gi-fc4c7ccd.png']);
  const c = r({ n: 'Pikachu (astronaut)', label: 'astronaut', costume: true }, { entries: {} }, { ...opts, legacy });
  assert.equal(c.src, '/img/ext/25-pikachu-astronaut-00a1fb21.png');
});
test('the four approved Twilight Wishes costumes resolve to their own exact files, normal and shiny', () => {
  const cases = [['Pikachu', 'sun crown', 'GOFEST_2024_STIARA'], ['Pikachu', 'moon crown', 'GOFEST_2024_MTIARA'], ['Espeon', 'sun scarf', 'GOFEST_2024_SSCARF'], ['Umbreon', 'moon scarf', 'GOFEST_2024_MSCARF']];
  const seen = new Set();
  for (const [name, label, code] of cases) {
    const n = r({ n: name + ' (' + label + ')', label, costume: true }), s = r({ n: name + ' (' + label + ')', label, costume: true, shiny: true });
    assert.equal(n.status, 'exact'); assert.equal(n.basis, 'manifest');
    assert.equal(n.src, '/api/art?n=' + name + '&c=' + code); assert.equal(s.src, n.src + '&shiny=1');
    assert.match(n.provenance.sha256, /^[0-9a-f]{64}$/); assert.match(n.provenance.rights, /Rights-sensitive/);
    seen.add(n.src); seen.add(s.src);
  }
  assert.equal(seen.size, 8, 'every costume/shiny picture is distinct');
});
test('a costume without approved art never borrows another costume or the species: it falls back with a badge', () => {
  for (const [name, label] of [['Sinistea', 'Bow'], ['Pikachu', 'witch hat'], ['Pikachu', 'sun scarf']]) {
    const x = r({ n: name + ' (' + label + ')', label, costume: true });
    assert.equal(x.status, 'fallback', name + label); assert.equal(x.badge, 'Costume art unavailable'); assert.equal(x.src, '/api/art?n=' + name);
  }
  assert.equal(r({ n: 'Pikachu (sun crown)', label: 'sun crown', costume: true, shiny: true }).status, 'exact');
  const noShiny = { entries: { [V.variantKey({ dex: 25, kind: 'costume', costume: 'x' })]: { status: 'approved', url: '/api/art?n=Pikachu&c=X' } } };
  const sh = r({ n: 'Pikachu (x)', label: 'x', costume: true, shiny: true }, noShiny);
  assert.equal(sh.status, 'fallback', 'shiny costume art is never invented from the normal file');
  assert.doesNotMatch(sh.src, /shiny/);
});
test('Sinistea bow stays unresolved until a person approves a file', () => {
  const k = V.variantKey({ dex: 854, kind: 'costume', costume: 'bow' });
  assert.equal(manifest.entries[k], undefined);
});
test('trainer clothing is never a Pokémon costume', () => {
  for (const n of ['GO Wild Area 2026 Tee (Purple)', 'Tee', 'Duraludon Pants', 'Fighting-Type Jacket', 'Duraludon Helmet']) {
    const x = r({ n }); assert.equal(x.status, 'avatar', n); assert.equal(x.src, '');
  }
  assert.notEqual(r({ n: 'Espeon (sun scarf)', label: 'sun scarf', costume: true }).status, 'avatar');
  assert.equal(r({ n: 'Pikachu wearing a pose' }).status, 'species');
});
test('regional, Mega and named forms keep their own name and are not the species', () => {
  assert.equal(r({ n: 'Alolan Raichu' }).request.form, 'alolan');
  assert.equal(r({ n: 'Mega Charizard X' }).request.form, 'mega-x');
  assert.equal(r({ n: 'Origin Forme Giratina' }).src, '/api/art?n=Origin%20Forme%20Giratina');
  assert.equal(r({ n: 'Hisuian Growlithe', shiny: true }).src, '/api/art?n=Hisuian%20Growlithe&shiny=1');
});
test('unsafe or unapproved manifest entries are ignored', () => {
  const key = V.variantKey({ dex: 25, kind: 'costume', costume: 'evil' });
  for (const url of ['javascript:alert(1)', '//evil.test/a.png', 'http://evil.test/a.png', '/api/art?n=Pikachu"onerror=x', '/img/ext/../../x']) {
    const x = r({ n: 'Pikachu (evil)', label: 'evil', costume: true }, { entries: { [key]: { status: 'approved', url } } });
    assert.equal(x.status, 'fallback', url);
  }
  assert.equal(r({ n: 'Pikachu (evil)', label: 'evil', costume: true }, { entries: { [key]: { status: 'candidate', url: '/api/art?n=Pikachu' } } }).status, 'fallback');
});
test('batches de-duplicate image URLs', () => {
  const list = [r({ n: 'Pikachu' }), r({ n: 'Pikachu' }), r({ n: 'Pikachu', shiny: true }), r({ n: 'Shadow Pikachu' })];
  assert.deepEqual(V.urls(list), ['/api/art?n=Pikachu', '/api/art?n=Pikachu&shiny=1']);
});
test('future Pokémon announcement: a brand-new species and costume work with only a manifest entry (no code change)', () => {
  const futureDex = 1100, m = { entries: { [V.variantKey({ dex: futureDex, kind: 'costume', costume: 'party-hat' })]: { status: 'approved', url: '/api/art?n=Futuremon&c=PARTY_2027' } } }, o = { ...opts, dexOf: n => n === 'futuremon' ? futureDex : 0 };
  assert.equal(r({ n: 'Futuremon (party hat)', label: 'party hat', costume: true }, m, o).src, '/api/art?n=Futuremon&c=PARTY_2027');
  assert.equal(r({ n: 'Futuremon' }, m, o).src, '/api/art?n=Futuremon');
  assert.equal(r({ n: 'Gigantamax Futuremon', dynamax: true }, m, o).badge, 'Form art unavailable');
  assert.equal(r({ n: 'Futuremon (blue hat)', label: 'blue hat', costume: true }, m, o).status, 'fallback');
  assert.equal(r({ n: 'Unknownmon (party hat)', label: 'party hat', costume: true }, m, o).status, 'fallback', 'unknown dex never matches an entry');
});
test('the c-style PokeMiners prefix is requested explicitly', () => {
  assert.equal(V.costumeRoute({ base: 'Pikachu' }, { prefix: 'c', code: 'FALL_2018' }, true), '/api/art?n=Pikachu&c=FALL_2018&cp=c&shiny=1');
});

test('Crowned dogs and Roaming Gimmighoul keep distinct artwork requests', () => {
  for (const [variant, base] of [
    ['Crowned Sword Zacian', 'Zacian'],
    ['Crowned Shield Zamazenta', 'Zamazenta'],
  ]) {
    const crowned = r({ n: variant }), ordinary = r({ n: base });
    assert.equal(crowned.request.name, variant);
    assert.equal(crowned.src, '/api/art?n=' + encodeURIComponent(variant));
    assert.notEqual(crowned.src, ordinary.src, 'never silently substitute ordinary form');
    assert.notEqual(crowned.src, '', 'form-specific route remains present');
  }
  const roaming = r({ n: 'Gimmighoul (Roaming Form)' });
  const chest = r({ n: 'Gimmighoul (Chest Form)' });
  const ordinary = r({ n: 'Gimmighoul' });
  assert.equal(roaming.src, '/api/art?n=' + encodeURIComponent('Gimmighoul (Roaming Form)'));
  assert.equal(chest.src, '/api/art?n=' + encodeURIComponent('Gimmighoul (Chest Form)'));
  assert.equal(roaming.request.form, 'roaming-form');
  assert.equal(chest.request.form, 'chest-form');
  assert.notEqual(roaming.src, chest.src);
  assert.notEqual(roaming.src, ordinary.src);
  assert.notEqual(chest.src, ordinary.src);
});
