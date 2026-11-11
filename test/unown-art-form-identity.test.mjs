import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the real Cloudflare Worker resolver without importing its runtime.
const source = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
const start = source.indexOf('export function artCandidates(raw) {');
const end = source.indexOf('// The main picture on an event', start);
assert.ok(start >= 0 && end > start, 'artwork resolver extraction must remain bounded');
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const code = source.slice(start, end).replace('export function artCandidates', 'function artCandidates');
const resolve = vm.runInNewContext('(function(slug) {' + code + '; return artCandidates; })')(slug);

test('all four source-backed GO Wild Incense Unown letters retain exact form art', () => {
  for (const letter of ['D', 'I', 'L', 'W']) {
    for (const name of [
      'Unown ' + letter,
      'Unown (' + letter + ')',
      'Unown ' + letter + ' (' + letter.toLowerCase() + ')',
      'Unown (' + letter + ' Form)'
    ]) {
      const out = resolve(name);
      assert.equal(out.base, 'unown', name);
      assert.equal(out.exact, true, name);
      assert.deepEqual(Array.from(out.list), ['unown-' + letter.toLowerCase()], name);
      assert.equal(out.officialArtworkFile, '201-' + letter.toLowerCase() + '.png', name);
      assert.ok(!out.list.includes('unown'), name + ' must not fall back to base artwork');
    }
  }
});

test('base Unown remains ordinary and unexpected or mismatched letter labels cannot claim another form', () => {
  const base = resolve('Unown');
  assert.equal(base.exact, false);
  assert.deepEqual(Array.from(base.list), ['unown']);
  const a = resolve('Unown A');
  assert.equal(a.exact, true);
  assert.deepEqual(Array.from(a.list), ['unown-a']);
  const mismatched = resolve('Unown D (I)');
  assert.equal(mismatched.exact, true);
  assert.ok(!mismatched.list.includes('unown-d'));
  assert.ok(!mismatched.list.includes('unown-i'));
});

test('existing exact Crowned/Gimmighoul/Gigantamax and ordinary Dynamax routes are unchanged', () => {
  for (const [name, expected] of [
    ['Crowned Sword Zacian', 'zacian-crowned'],
    ['Crowned Shield Zamazenta', 'zamazenta-crowned'],
    ['Gimmighoul (Roaming Form)', 'gimmighoul-roaming'],
    ['Gigantamax Duraludon', 'duraludon-gmax']
  ]) {
    const out = resolve(name);
    assert.equal(out.exact, true, name);
    assert.deepEqual(Array.from(out.list), [expected]);
  }
  const max = resolve('Dynamax Dialga');
  assert.equal(max.exact, false);
  assert.deepEqual(Array.from(max.list), ['dialga']);
});


test('live Worker artwork handler fetches exact official Unown letter PNGs, including shiny, without a base fallback', async () => {
  const artStart = source.indexOf('async function art(request, env, ctx, url) {');
  const artEnd = source.indexOf('// ---------------------------------------------------------------- marks', artStart);
  assert.ok(artStart >= 0 && artEnd > artStart, 'Worker artwork handler must remain extractable');
  const upstream = [];
  const checks = [];
  const base = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/';
  const handler = vm.runInNewContext('(function(){' + source.slice(artStart, artEnd) + '; return art;})()', {
    artCandidates: resolve,
    caches: { default: { match: async () => null, put: async () => {} } },
    allowEdgeMiss: () => ({ allowed: true }),
    edgeMissLimited: () => { throw new Error('Unexpected miss limit'); },
    singleFlight: async (_key, fn) => fn(),
    pokeId: async (path) => { checks.push(path); throw new Error('Unown letter must not query /pokemon: ' + path); },
    fetch: async (url) => { upstream.push(url); return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 }); },
    ART_BASE: base, COSTUME_BASE: '', DAY: 86400,
    Request, Response
  });
  for (const letter of ['D', 'I', 'L', 'W']) {
    for (const shiny of [false, true]) {
      const name = 'Unown ' + letter + ' (' + letter.toLowerCase() + ')';
      const url = new URL('https://pogo.test/api/art?n=' + encodeURIComponent(name) + (shiny ? '&shiny=1' : ''));
      const out = await handler(new Request(url), {}, { waitUntil() {} }, url);
      assert.equal(out.status, 200, name);
      assert.equal(out.headers.get('content-type'), 'image/png');
      assert.equal(upstream.at(-1), base + (shiny ? 'shiny/' : '') + '201-' + letter.toLowerCase() + '.png', name);
    }
  }
  assert.equal(upstream.length, 8, 'each request resolves exactly one verified form-specific image');
  assert.deepEqual(checks, [], 'no unrelated Pokemon species or variety lookups are made');
});
