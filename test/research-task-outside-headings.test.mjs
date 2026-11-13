import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFields} from '../scripts/importer/extract.mjs';

const options={names:['Pikachu']};
const line=(text,t='p')=>({text,t});

test('extracts explicit task and reward beneath a general event heading',()=>{
 const result=extractFields([
  line('Event details','h'),
  line('Catch 5 Pokémon REWARD ×1000 Stardust'),
 ],options);
 assert.equal(result.researchTasks.length,1);
 assert.match(result.researchTasks[0].task,/Catch 5 Pokémon/);
 assert.equal(result.researchTasks[0].rewards[0].name,'Stardust');
 assert.ok(result.research.some(x=>x.includes('Catch 5 Pokémon')));
});
test('extracts reward rows beneath a raid heading without treating raid prose as research',()=>{
 const result=extractFields([
  line('Raid Battles','h'),
  line('Win 2 raids REWARD ×2 Rare Candy'),
  line('Raid rewards are available after defeating a boss'),
 ],options);
 assert.equal(result.researchTasks.length,1);
 assert.equal(result.researchTasks[0].rewards[0].quantity,2);
});
test('does not fabricate research from ordinary reward descriptions',()=>{
 const result=extractFields([
  line('Event bonuses','h'),
  line('Complete the event to earn rewards'),
  line('Win raids to receive exciting rewards'),
  line('Catch Pokémon for a chance at a mystery reward'),
 ],options);
 assert.deepEqual(result.researchTasks,[]);
});
test('duplicate explicit task rows are deduplicated',()=>{
 const result=extractFields([
  line('Event details','h'),
  line('Catch 5 Pokémon REWARD ×1000 Stardust'),
  line('Catch 5 Pokémon REWARD ×1000 Stardust'),
 ],options);
 assert.equal(result.researchTasks.length,1);
});
