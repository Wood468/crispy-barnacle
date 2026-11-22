import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const source = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
const frontend = createRequire(import.meta.url)('../public/today-logic.js');
const start = source.indexOf('export function artCandidates(raw) {');
const end = source.indexOf('// The main picture on an event', start);
assert.ok(start >= 0 && end > start, 'use the actual Worker candidate parser');
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const resolver = vm.runInNewContext('(function(slug){' + source.slice(start, end).replace('export function artCandidates', 'function artCandidates') + '; return artCandidates;})')(slug);

const FORMS = [
  ['Gimmighoul (Roaming Form)', 'Roaming Form Gimmighoul', 'gimmighoul-roaming', 'Roaming Form'],
  ['Gimmighoul (Chest Form)', 'Chest Form Gimmighoul', 'gimmighoul', 'Chest Form']
];

test('official and form-first source names resolve to exactly the same Gimmighoul artwork identity', () => {
  for (const [official, sourceFirst, pokemon, label] of FORMS) {
    for (const name of [official, sourceFirst]) {
      const art = resolver(name);
      assert.equal(art.exact, true, name);
      assert.equal(art.base, 'gimmighoul', name);
      assert.deepEqual(Array.from(art.list), [pokemon], name);
      const ui = frontend.classifyArt(name);
      assert.equal(ui.kind, 'form', name);
      assert.equal(ui.exact, true, name);
      assert.equal(ui.base, 'Gimmighoul', name);
      assert.equal(ui.label, label, name);
      assert.deepEqual(frontend.artFallback(ui), { show: 'base-with-label', chip: 'Form art unavailable' }, name);
    }
  }
  assert.notDeepEqual(Array.from(resolver(FORMS[0][1]).list), Array.from(resolver(FORMS[1][1]).list), 'Roaming and Chest never merge');
  assert.equal(frontend.classifyArt('Gimmighoul').exact, false, 'generic species remains generic');
});

test('Worker /api/art uses exactly the same Roaming or Chest file for either name order, normal and shiny', async () => {
  const a = source.indexOf('async function art(request, env, ctx, url) {');
  const b = source.indexOf('// ---------------------------------------------------------------- marks', a);
  assert.ok(a >= 0 && b > a, 'use the actual Worker HTTP art handler');
  const looked = [], fetched = [];
  const ART_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/';
  const handler = vm.runInNewContext('(function(){' + source.slice(a, b) + '; return art;})()', {
    artCandidates: resolver,
    caches: { default: { match: async () => null, put: async () => {} } },
    allowEdgeMiss: () => ({ allowed: true }),
    edgeMissLimited: () => { throw new Error('Unexpected rate limit'); },
    singleFlight: async (_key, fn) => fn(),
    pokeId: async path => { looked.push(path); return ({ 'pokemon/gimmighoul-roaming': 10263, 'pokemon/gimmighoul': 999 })[path] || 0; },
    fetch: async url => { fetched.push(url); return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 }); },
    ART_BASE, COSTUME_BASE: '', DAY: 86400, Request, Response
  });
  for (const [official, sourceFirst, pokemon] of FORMS) {
    const id = pokemon === 'gimmighoul-roaming' ? 10263 : 999;
    for (const shiny of [false, true]) {
      for (const name of [official, sourceFirst]) {
        const url = new URL('https://pogo.test/api/art?n=' + encodeURIComponent(name) + (shiny ? '&shiny=1' : ''));
        const response = await handler(new Request(url), {}, { waitUntil() {} }, url);
        assert.equal(response.status, 200, name);
        assert.equal(response.headers.get('content-type'), 'image/png', name);
        assert.equal(looked.at(-1), 'pokemon/' + pokemon, name);
        assert.equal(fetched.at(-1), ART_BASE + (shiny ? 'shiny/' : '') + id + '.png', name);
      }
    }
  }
  assert.equal(fetched.length, 8, 'two forms × two name orders × normal/shiny');
});

test('unrelated species and unknown labels cannot be guessed as Roaming or Chest Gimmighoul', () => {
  for (const name of ['Roaming Form Gholdengo', 'Chest Form Pikachu', 'Roaming Form Unknownmon']) {
    const result = resolver(name);
    assert.ok(!result.list.includes('gimmighoul-roaming') && !result.list.includes('gimmighoul'), name);
    assert.notEqual(frontend.classifyArt(name).base, 'Gimmighoul', name);
  }
  assert.deepEqual(Array.from(resolver('Gimmighoul').list), ['gimmighoul']);
  assert.equal(resolver('Gimmighoul').exact, false);
});
