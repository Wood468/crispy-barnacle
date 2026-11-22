import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeInfographicTargets as normalize,
  targetsFromInfographicDecision as migrate,
  infographicMatchesRaidBoss as matches} from '../scripts/infographic-target-contract.mjs';

const boss=(pokemonId,battleMode,formId=null)=>({type:'raid-boss',pokemonId,formId,battleMode});
test('persistent raid bosses need no event or active rotation',()=>{
  const targets=normalize([boss('006','normal'),boss('006','shadow'),
    boss('006','dynamax'),boss('006','gigantamax')]);
  assert.equal(targets.length,4);
  assert.equal(targets.every(t=>t.type==='raid-boss'),true);
  assert.equal(matches(targets,{pokemonId:'006',battleMode:'gigantamax'}),true);
  assert.equal(matches(targets,{pokemonId:'006',battleMode:'mega'}),false);
});
test('form and battle-mode matching never silently cross-assigns a guide',()=>{
  const target=[boss('006','mega','x')];
  assert.equal(matches(target,{pokemonId:'006',battleMode:'mega',formId:'x'}),true);
  assert.equal(matches(target,{pokemonId:'006',battleMode:'mega',formId:'y'}),false);
  assert.equal(matches(target,{pokemonId:'006',battleMode:'normal',formId:'x'}),false);
  assert.equal(matches(target,{pokemonId:'006',battleMode:'shadow',formId:'x'}),false);
});
test('event and boss targets can coexist without duplicates',()=>{
  const items=normalize([
    {type:'event',eventId:'wild-area.global-2026'},
    boss('025','gigantamax'),boss('025','gigantamax'),
    {type:'event',eventId:'wild-area.global-2026'}
  ]);
  assert.equal(items.length,2);
  assert.deepEqual(normalize(items.slice().reverse()),items);
});
test('legacy event approvals remain event targets, including raid slot IDs',()=>{
  const x=migrate({eventId:'wild-area.global-2026, raid:lugia:2026-11-14'});
  assert.deepEqual(x,normalize([
    {type:'event',eventId:'wild-area.global-2026'},
    {type:'event',eventId:'raid:lugia:2026-11-14'}
  ]));
  assert.equal(x.some(t=>t.type==='raid-boss'),false);
});
test('new reviewed target selections may coexist with old eventId field',()=>{
  const x=migrate({eventId:'wild-area.global-2026',
    targets:[boss('150','shadow'),{type:'event',eventId:'wild-area.global-2026'}]});
  assert.equal(x.length,2);
});
test('missing form or invalid types fail closed and cannot infer forms from caption',()=>{
  for(const x of [
    {type:'raid-boss',pokemonId:'006',battleMode:'Gmax'},
    {type:'raid-boss',pokemonId:'006',battleMode:'shadow',eventId:'bonus'},
    {type:'raid-boss',pokemonId:'../secret',battleMode:'shadow'},
    {type:'raid-boss',pokemonId:'006',battleMode:'shadow',formId:'../../a'},
    {type:'event',eventId:'../secret'},
    {type:'something',pokemonId:'006'}])
    assert.throws(()=>normalize([x]),/required|Unknown/);
  assert.throws(()=>normalize(null),/Bounded/);
  assert.throws(()=>migrate(null),/decision required/);
  assert.equal(matches([], {pokemonId:'006',battleMode:'Gigantamax'}),false);
});
