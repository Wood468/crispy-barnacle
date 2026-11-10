import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { artCandidates } from '../src/worker.js';

const require = createRequire(import.meta.url);
const Adapter = require('../public/event-adapter.js');
const Contract = require('../public/event-contract.js');
const UI = require('../public/event-components.js');
Adapter.configureSpecies(JSON.parse(readFileSync(new URL('../public/dex.json', import.meta.url), 'utf8')));
const details = JSON.parse(readFileSync(new URL('../public/event-details.json', import.meta.url), 'utf8')).events;
const data = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'));
const event = id => data.events.find(e => e.id === id);
const base = (fields = {}) => Contract.normalize({
  schemaVersion: 1, eventId: 'synthetic-form-and-eggs',
  title: 'Synthetic Future Wild Weekend',
  schedule: {timeBasis:'player-local',start:'2027-05-01T10:00',end:'2027-05-02T18:00'},
  pokemon: [{speciesId:'999',name:'Gimmighoul'}],
  encounters: [{identityKey:'999:base:none',method:'wild',activityId:'main'}],
  internalValidation: {fields},
});

test('official Into the Wild Coin Bag becomes Roaming Form and never a wild Chest Form', () => {
  const input = base();
  const correct = Adapter.coinBagRoaming(input, details.into);
  assert.ok(correct.pokemon.some(p => p.speciesId === '999' && p.formId === 'roaming' && p.collectionName === 'Gimmighoul (Roaming Form)'));
  assert.ok(!correct.pokemon.some(p => p.speciesId === '999' && !p.formId));
  assert.ok(correct.encounters.some(e => e.identityKey === '999:roaming:none' && e.access === 'Coin Bag' && e.method === 'other'));
  assert.ok(!correct.encounters.some(e => e.identityKey === '999:base:none' && e.method === 'wild'));
  assert.equal(Adapter.collectionName(correct.pokemon.find(p => p.speciesId === '999')), 'Gimmighoul (Roaming Form)');
  assert.equal(input.encounters[0].identityKey, '999:base:none', 'source data and Collection keys remain untouched');
});

test('unverified prose, a plain species, and an unrelated Chest Form retain their identities', () => {
  const original = base();
  assert.equal(Adapter.coinBagRoaming(original, {fields:{bonuses:[{text:'Gimmighoul may appear in the wild',status:'official'}]}}), original);
  assert.equal(Adapter.coinBagRoaming(original, {fields:{bonuses:[{text:'Coin Bag attracts Gimmighoul',status:'unknown'}]}}), original);
  const withRaid = Contract.normalize({
    schemaVersion:1,eventId:'future-sourced-coinbag',title:'Synthetic Raid Day',
    pokemon:[{speciesId:'999',name:'Gimmighoul'}],
    encounters:[{identityKey:'999:base:none',method:'raid'}],
  });
  const enriched = Adapter.coinBagRoaming(withRaid,details.into);
  assert.ok(enriched.encounters.some(e => e.identityKey === '999:base:none' && e.method === 'raid'),
    'an independently sourced Chest Form raid must not be relabeled as a Coin Bag encounter');
  assert.ok(enriched.encounters.some(e => e.identityKey === '999:roaming:none' && e.access === 'Coin Bag'));
});

test('one 10 km event Egg source makes a color-matched icon appear on all four hatch tiles', () => {
  const src = details['leekduck:pokemon-go-wild-area-2026-global'];
  const eggKeys = new Set(src.encounters.filter(e=>e.method==='egg').map(e=>e.identityKey));
  assert.equal(eggKeys.size,4);
  const roster = src.pokemon.filter(p=>eggKeys.has(p.key));
  const model = Contract.normalize({
    schemaVersion:1,eventId:'future-hatch-test',title:'Future event',
    pokemon:roster,
    encounters:src.encounters.filter(e=>e.method==='egg'),
    internalValidation:{fields:{eggs:src.fields.eggs}},
  });
  const html=UI.gallery(model,{nameFor:p=>p.name,artFor:p=>'<img alt="'+p.name+'">'});
  assert.equal((html.match(/class="ue-egg-corner ue-egg-10"/g)||[]).length,4);
  assert.equal((html.match(/\/ico\/g\/egg-10km\.webp/g)||[]).length,4);
  for(const mon of ['Honedge','Klefki','Drampa','Duraludon'])assert.ok(html.includes(mon),mon);
});

test('mixed unknown egg distances are not guessed on per-Pokémon tiles', () => {
  const mon={speciesId:'25',name:'Pikachu'};
  const event=Contract.normalize({
    schemaVersion:1,eventId:'future-mixed-eggs',title:'Mixed event',
    pokemon:[mon],encounters:[{identityKey:'25:base:none',method:'egg'}],
    internalValidation:{fields:{eggs:[{text:'2 km Eggs: Pikachu'},{text:'10 km Eggs: other species'}]}},
  });
  const html=UI.gallery(event,{artFor:p=>'<img alt="'+p.name+'">'});
  assert.ok(html.includes('Pikachu'));
  assert.ok(!html.includes('ue-egg-corner'), 'do not infer an egg distance from a mixed pool');
  const known = {...event,activities:[{id:'egg-seven',title:'7 km Eggs'}],
    groups:{egg:[{identityKey:'25:base:none',method:'egg',activityId:'egg-seven',access:'unknown'}]}};
  assert.equal(UI.eggKm(known,mon,known.groups.egg[0],known.activities[0]),'7',
    'a per-activity distance overrides an ambiguous general egg pool');
});

test('every sourced daily raid lineup remains a distinct day in all future event details', () => {
  const row=event('wag');
  assert.deepEqual(row.detailIds,['leekduck:pokemon-go-wild-area-2026-global']);
  const html=UI.raidDayRosters(row.raidDays,{art:({n})=>'<img alt="'+n+'">'});
  assert.ok(html.includes('Saturday') && html.includes('Sunday'));
  const saturday=html.match(/<article class="ue-raid-day" data-raid-date="2026-11-14">([\s\S]*?)<\/article>/)?.[1]||'';
  const sunday=html.match(/<article class="ue-raid-day" data-raid-date="2026-11-15">([\s\S]*?)<\/article>/)?.[1]||'';
  for(const name of ['Zekrom','White Kyurem','Gigantamax Duraludon','Dynamax Dialga'])assert.ok(saturday.includes(name),name+' Saturday');
  for(const name of ['Reshiram','Black Kyurem','Gigantamax Duraludon','Dynamax Palkia'])assert.ok(sunday.includes(name),name+' Sunday');
  assert.ok(!saturday.includes('Reshiram') && !saturday.includes('Dynamax Palkia'));
  assert.ok(!sunday.includes('White Kyurem') && !sunday.includes('Dynamax Dialga'));
  assert.equal(UI.raidDayRosters([],{}),'');
});

test('both Kyurem fusions have form-specific art and unavailable-state labels', () => {
  for(const [name,slug] of [['White Kyurem','kyurem-white'],['Black Kyurem','kyurem-black']]){
    const candidate=artCandidates(name);
    assert.equal(candidate.exact,true,name);
    assert.deepEqual(candidate.list,[slug],name);
    assert.equal(candidate.base,'kyurem');
  }
});
