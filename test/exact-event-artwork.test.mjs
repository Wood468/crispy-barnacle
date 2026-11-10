import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import worker, { artCandidates } from '../src/worker.js';

const require = createRequire(import.meta.url);
const adapter = require('../public/event-adapter.js');
const dex = JSON.parse(readFileSync(new URL('../public/dex.json', import.meta.url), 'utf8'));
adapter.configureSpecies(dex);

const exactCases = [
  ['Crowned Sword Zacian', '888', 'crowned-sword', 'zacian-crowned', 10188],
  ['Crowned Shield Zamazenta', '889', 'crowned-shield', 'zamazenta-crowned', 10189],
  ['Gimmighoul (Roaming Form)', '999', 'roaming', 'gimmighoul-roaming', 10263],
];

test('source names and structured Pokémon identities produce the same exact artwork requests', () => {
  for (const [name, speciesId, formId, candidate] of exactCases) {
    const imported = adapter.pokemon({ name });
    assert.equal(imported.speciesId, speciesId, name);
    // Preserve the published importer key (Collection and encounter references use it).
    const sourceFormId = speciesId === '888' ? 'crownedsword' : speciesId === '889' ? 'crownedshield' : 'roaming';
    assert.equal(imported.formId, sourceFormId, name);
    assert.equal(adapter.collectionName(imported), name, name);
    const structured = adapter.pokemon({ name: name.includes('Zacian') ? 'Zacian' : name.includes('Zamazenta') ? 'Zamazenta' : 'Gimmighoul', speciesId, formId });
    assert.equal(adapter.collectionName(structured), name, name + ' structured identity');
    assert.deepEqual(artCandidates(adapter.collectionName(structured)).list, [candidate], name);
    assert.equal(artCandidates(name).exact, true);
  }
});

test('Leek Duck suffix-form names map to exact Crowned artwork without changing encounter IDs', () => {
  for (const [source, canonical, candidate, formId] of [
    ['Zacian (Crowned Sword)', 'Crowned Sword Zacian', 'zacian-crowned', 'crownedsword'],
    ['Zamazenta (Crowned Shield)', 'Crowned Shield Zamazenta', 'zamazenta-crowned', 'crownedshield'],
  ]) {
    const imported = adapter.pokemon({ name: source });
    assert.equal(imported.formId, formId);
    assert.equal(adapter.collectionName(imported), canonical);
    assert.deepEqual(artCandidates(source).list, [candidate]);
    assert.deepEqual(artCandidates(adapter.collectionName(imported)).list, [candidate]);
  }
});

test('Roaming, Chest and unknown Gimmighoul forms cannot silently substitute one another', () => {
  assert.deepEqual(artCandidates('Gimmighoul (Roaming Form)').list, ['gimmighoul-roaming']);
  assert.deepEqual(artCandidates('Gimmighoul (Chest Form)').list, ['gimmighoul']);
  assert.equal(artCandidates('Gimmighoul (Chest Form)').exact, true);
  assert.deepEqual(artCandidates('Gimmighoul (unannounced future Form)').list, ['gimmighoul-unannounced-future']);
  assert.equal(artCandidates('Gimmighoul (unannounced future Form)').exact, true);
  assert.equal(adapter.collectionName({ name: 'Gimmighoul', speciesId: '999', formId: 'roaming-form' }), 'Gimmighoul (Roaming Form)');
  assert.equal(adapter.collectionName({ name: 'Gimmighoul', speciesId: '999', formId: 'chest' }), 'Gimmighoul (Chest Form)');
  assert.equal(adapter.collectionName({ name: 'Gimmighoul', speciesId: '999', formId: 'chest-form' }), 'Gimmighoul (Chest Form)');
  assert.deepEqual(artCandidates(adapter.collectionName({ name: 'Gimmighoul', speciesId: '999', formId: 'chest' })).list, ['gimmighoul']);
  assert.equal(adapter.collectionName({ name: 'Gimmighoul', speciesId: '999', formId: 'unconfirmed' }), null);
});

test('future event and raid use canonical names without event-specific mappings', () => {
  const model = adapter.adapt({
    id: 'future-art-fixture',
    t: 'Synthetic Future Raid Festival',
    s: '2027-05-01T10:00',
    e: '2027-05-01T18:00',
    scope: 'worldwide_local',
    art: ['Crowned Sword Zacian', 'Crowned Shield Zamazenta', 'Gimmighoul (Roaming Form)'],
  });
  for (const [name, speciesId, formId, candidate] of exactCases) {
    const sourceFormId = speciesId === '888' ? 'crownedsword' : speciesId === '889' ? 'crownedshield' : 'roaming';
    const p = model.pokemon.find(row => row.speciesId === speciesId && row.formId === sourceFormId);
    assert.ok(p, name + ' not normalized in future event');
    assert.equal(adapter.collectionName(p), name);
    assert.deepEqual(artCandidates(adapter.collectionName(p)).list, [candidate]);
  }
});

test('edge artwork lookup resolves verified exact-form IDs and does not fall back on a missing future form', async (t) => {
  const oldFetch = globalThis.fetch;
  const oldCaches = globalThis.caches;
  const requested = [];
  const ids = Object.fromEntries(exactCases.map(([,, , candidate, id]) => [candidate, id]));
  ids.gimmighoul = 999;
  globalThis.caches = {
    default: { async match() { return null; }, async put() {} },
  };
  globalThis.fetch = async (resource) => {
    const url = String(resource);
    requested.push(url);
    const match = /pokeapi\.co\/api\/v2\/pokemon\/([^/]+)$/.exec(url);
    if (match) return ids[match[1]]
      ? new Response(JSON.stringify({ id: ids[match[1]] }), { status: 200 })
      : new Response('not found', { status: 404 });
    const artwork = /official-artwork\/(\d+)\.png$/.exec(url);
    if (artwork) return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 });
    return new Response('not found', { status: 404 });
  };
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldCaches === undefined) delete globalThis.caches;
    else globalThis.caches = oldCaches;
  });
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(promise); } };
  async function responseFor(name) {
    const response = await worker.fetch(new Request('https://pogo.test/api/art?n=' + encodeURIComponent(name)), {}, ctx);
    await Promise.all(pending.splice(0));
    return response;
  }
  for (const [name,,, , id] of exactCases) {
    const before = requested.length;
    assert.equal((await responseFor(name)).status, 200, name);
    const used = requested.slice(before);
    assert.ok(used.some(url => url.endsWith('/' + id + '.png')), name + ' must use the exact variant artwork ID');
  }
  const chest = await responseFor('Gimmighoul (Chest Form)');
  assert.equal(chest.status, 200);
  assert.ok(requested.some(url => url.endsWith('/999.png')));
  const beforeMissing = requested.length;
  const missing = await responseFor('Gimmighoul (unannounced future Form)');
  assert.equal(missing.status, 404);
  const failedRequests = requested.slice(beforeMissing);
  assert.ok(failedRequests.some(url => url.endsWith('/pokemon/gimmighoul-unannounced-future')));
  assert.ok(!failedRequests.some(url => url.endsWith('/pokemon/gimmighoul') || url.endsWith('/999.png')), 'missing exact form cannot use Chest Form artwork');
});
