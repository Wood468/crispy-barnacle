import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Adapter = require('../public/event-adapter.js');
const UI = require('../public/event-components.js');
const Contract = require('../public/event-contract.js');

Adapter.configureSpecies([[808, 'Meltan'], [25, 'Pikachu'], [888, 'Zacian']]);
const source = () => ({
  schemaVersion: 1, eventId: 'future-source-pass', title: 'Source-backed future GO Pass',
  passes: [{ title: 'Published rank entries', stages: [
    { rank: 45, free: ['Dynamax Meltan'], deluxe: ['Dynamax Meltan'],
      rewards: ['Silver Bottle Cap ×1'] },
    { rank: 67, free: ['Meltan (Level 15)'], deluxe: ['XP ×1000'] },
    { rank: 100, free: ['Dynamax Meltan'], deluxe: ['Silver Bottle Cap ×1'] }
  ] }]
});

test('canonical v1 source rank strings become exact Pokémon rewards without losing track provenance', () => {
  const raw = source(), before = JSON.stringify(raw);
  const model = Adapter.adapt(raw);
  const stages = model.passes[0].stages;
  assert.equal(JSON.stringify(raw), before, 'immutable published source');
  for (const track of ['free', 'deluxe']) {
    assert.deepEqual(stages[0][track], [{type:'encounter',name:'Dynamax Meltan',quantity:1}]);
  }
  assert.deepEqual(stages[1].free, [{type:'encounter',name:'Meltan',quantity:1,level:15}]);
  assert.deepEqual(stages[0].rewards, ['Silver Bottle Cap ×1'], 'unattributed upgrades remain unattributed');
  assert.deepEqual(stages[1].deluxe, ['XP ×1000'], 'XP is not a Pokémon encounter');
  assert.equal(stages[2].rank, 100);
  assert.deepEqual(stages[2].deluxe, ['Silver Bottle Cap ×1']);
});

test('the real GO Pass rank renderer invokes species artwork for both Free and Deluxe Dynamax Meltan', () => {
  const calls = [];
  const html = UI.render(Adapter.adapt(source()), { rewardArt(item) {
    calls.push({...item});
    return '<img class="go-pass-species" src="/api/art?n='
      + encodeURIComponent(item.name) + (item.name.startsWith('Dynamax ') ? '&dynamax=1' : '')
      + '" alt="">';
  }});
  // The renderer also resolves rewards for the milestone carousel and
  // published track legend; test visible rank rows, not callback counts.
  assert.ok(calls.filter(x => x.name === 'Dynamax Meltan').length >= 3);
  const rank45 = html.match(/<li class="ue-pass-rank" data-rank="45">([\s\S]*?)<\/li>/);
  const rank100 = html.match(/<li class="ue-pass-rank" data-rank="100">([\s\S]*?)<\/li>/);
  assert.ok(rank45 && rank100, 'both milestone ranks remain browsable');
  const speciesUrl = /src="\/api\/art\?n=Dynamax%20Meltan&dynamax=1"/g;
  assert.equal((rank45[1].match(speciesUrl) || []).length, 2,
    'Rank 45 Free and Deluxe each render Meltan species art');
  assert.equal((rank100[1].match(speciesUrl) || []).length, 1,
    'Rank 100 Free shows Meltan while Deluxe contains Silver Bottle Cap');
  for (const rank of [rank45[1], rank100[1]]) {
    assert.match(rank, /class="ue-lane ue-lane-free"/);
    assert.match(rank, /class="ue-lane ue-lane-deluxe"/);
    assert.match(rank, /data-cat="Pokémon"/);
    assert.doesNotMatch(rank, /ue-reward-icon">MAX<\/span>/,
      'never replace a published species encounter with a MAX-only token');
  }
  assert.match(rank100[1], /Silver Bottle Cap/);
});

test('unknown species and malformed strings remain unchanged, and explicit reward types are never reinterpreted', () => {
  const raw = source();
  const entries = [
    'Dynamax Imaginarymon', 'Meltan Candy ×5', 'Mystery Box', '',
    {type:'item',name:'Dynamax Meltan',quantity:2},
    {type:'encounter',name:'Gimmighoul (Roaming Form)',quantity:1}
  ];
  raw.passes[0].stages[0].free = entries;
  const output = Adapter.adapt(raw).passes[0].stages[0].free;
  assert.deepEqual(output, entries, 'only exact configured species names are eligible');
});

test('legacy rank parsing remains correct and retained last-good rank strings get the same treatment', () => {
  const legacy = Adapter.adapt({id:'legacy-future',name:'Legacy future pass'}, {
    fields:{tickets:[{text:'Rank 45: Free: Dynamax Meltan | Deluxe: Silver Bottle Cap ×1'}]}
  });
  assert.deepEqual(legacy.passes[0].stages[0].free,
    [{type:'encounter',name:'Dynamax Meltan',quantity:1}]);
  const old = Contract.normalize(source());
  const updated = Contract.normalize({schemaVersion:1,eventId:old.eventId,
    title:old.title,completeness:'partial',passes:[]});
  const retained = Adapter.retain(old, updated);
  assert.deepEqual(retained.passes[0].stages[0].free,
    [{type:'encounter',name:'Dynamax Meltan',quantity:1}]);
});
