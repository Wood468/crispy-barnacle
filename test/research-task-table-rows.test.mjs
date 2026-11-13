import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFields} from '../scripts/importer/extract.mjs';

const line=(text,t='p')=>({text,t});
test('extracts Minior Showers research table tasks and quantified Stardust',()=>{
 const result=extractFields([
  line('Field Research','h'),
  line('Task | Rewards'),
  line('Claim Reward! | 1 × Star Piece'),
  line('Use a Star Piece | 7740 × Stardust')
 ]);
 assert.equal(result.researchTasks.length,2);
 assert.equal(result.researchTasks[0].task,'Claim Reward!');
 assert.deepEqual(result.researchTasks[0].rewards[0],{type:'item',name:'Star Piece',quantity:1});
 assert.equal(result.researchTasks[1].task,'Use a Star Piece');
 assert.equal(result.researchTasks[1].rewards[0].quantity,7740);
 assert.equal(result.researchTasks[1].rewards[0].name,'Stardust');
});
test('does not infer table rewards from generic descriptions or empty values',()=>{
 const result=extractFields([
  line('Event Details','h'),
  line('Complete tasks | More rewards to come'),
  line('Win raids | Mystery reward'),
  line('Task | Rewards'),
  line('Catch 5 Pokémon | -')
 ]);
 assert.deepEqual(result.researchTasks,[]);
});
