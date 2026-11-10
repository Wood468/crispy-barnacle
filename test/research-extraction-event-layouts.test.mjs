import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFields } from '../scripts/importer/extract.mjs';

const line = (text, t = 'p') => ({ text, t });

test('retains explicit field, timed and special research categories', () => {
  for (const [heading, expected] of [
    ['Field Research Tasks', 'field'],
    ['Timed Research', 'timed'],
    ['Special Research', 'special'],
  ]) {
    const fields = extractFields([
      line(heading, 'h'),
      line('Catch 5 Pokémon REWARD ×1000 Stardust'),
    ]);
    assert.equal(fields.researchTasks.length, 1, heading);
    assert.equal(fields.researchTasks[0].category, expected, heading);
  }
});

test('research task beneath an unrelated heading is still extracted', () => {
  const fields = extractFields([
    line('Featured Pokémon', 'h'),
    line('Catch 5 Pokémon REWARD ×1000 Stardust'),
  ]);
  assert.equal(fields.researchTasks.length, 1);
  assert.equal(fields.researchTasks[0].category, 'research');
  assert.equal(fields.researchTasks[0].rewards[0].quantity, 1000);
});

test('explicit task with several independent item rewards preserves quantities', () => {
  const fields = extractFields([
    line('Event details', 'h'),
    line('Win 2 raids REWARD ×2 Rare Candy | ×1000 Stardust'),
  ]);
  assert.equal(fields.researchTasks.length, 1);
  assert.deepEqual(fields.researchTasks[0].rewards.map(({name, quantity}) => [name, quantity]), [
    ['Rare Candy', 2], ['Stardust', 1000],
  ]);
});

test('unrelated event descriptions cannot create research tasks', () => {
  const fields = extractFields([
    line('Event details', 'h'),
    line('Complete the event for exciting rewards'),
    line('Catch more Pokémon for possible rewards'),
    line('Win raids and receive bonus Stardust'),
    line('Reward: 1000 Stardust'),
  ]);
  assert.deepEqual(fields.researchTasks, []);
});
