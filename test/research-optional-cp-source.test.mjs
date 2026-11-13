// Regression fixture: official in-person event research can publish encounter
// alternatives without confirmed CP values. Never fabricate those CP numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const details = JSON.parse(readFileSync(new URL('../public/event-details.json', import.meta.url), 'utf8')).events;
const mexico = details['leekduck:pokemon-go-wild-area-2026-mexico-city'];
const normalize = s => s.normalize('NFKC').replace(/[‐‑‒–—]/g, '-');
const byTask = name => mexico.researchTasks.find(task => normalize(task.task) === name);

test('Mexico City Field Research retains twelve separate sourced task boundaries', () => {
  assert.ok(mexico?.sources?.some(s => s.url === 'https://leekduck.com/events/pokemon-go-wild-area-2026-mexico-city/'));
  assert.equal(mexico.researchTasks.length, 12);
  assert.ok(mexico.researchTasks.every(t => t.category === 'field' && t.rewards.length > 0));
  assert.equal(new Set(mexico.researchTasks.map(t => normalize(t.task))).size, 12);
  assert.equal(mexico.researchTasks.reduce((sum, task) => sum + task.rewards.length, 0), 28);
  const dragon = byTask('Catch 10 Dragon-type Pokémon');
  assert.deepEqual(dragon.rewards.map(r => [r.type, r.name, r.quantity]),
    [['encounter', 'Trapinch', 1], ['item', 'Stardust', 2000], ['item', 'Silver Pinap Berry', 1]],
    'multiple reward alternatives must not be folded into one encounter or drop the item rewards');
});

test('unpublished costume encounter CP remains absent instead of fabricated', () => {
  const occurrences = mexico.researchTasks.flatMap(t => t.rewards.filter(r => r.name === 'Machamp (modern jacket)'));
  assert.equal(occurrences.length, 4, 'the form appears under four different published research tasks');
  for (const reward of occurrences) {
    assert.equal(reward.type, 'encounter');
    assert.equal(reward.quantity, 1);
    assert.equal(reward.cpMin, undefined, 'CP minimum was not published for this costume');
    assert.equal(reward.cpMax, undefined, 'CP maximum was not published for this costume');
  }
  const documented = byTask('Win 2 raids').rewards.find(r => r.name === 'Azumarill');
  assert.deepEqual([documented.cpMin, documented.cpMax], [637, 680],
    'known CP bounds must still be preserved alongside unknown costume bounds');
});

test('reward CP pairs and encounter/item identities are valid without demanding CP for every encounter', () => {
  for (const task of mexico.researchTasks) {
    for (const reward of task.rewards) {
      assert.ok(['encounter', 'item'].includes(reward.type), task.task);
      assert.ok(typeof reward.name === 'string' && reward.name.length > 0, task.task);
      assert.ok(Number.isInteger(reward.quantity) && reward.quantity > 0, reward.name);
      const minKnown = reward.cpMin !== undefined;
      const maxKnown = reward.cpMax !== undefined;
      assert.equal(minKnown, maxKnown, 'never publish a one-sided CP range: ' + reward.name);
      if (minKnown) {
        assert.equal(reward.type, 'encounter', 'item rewards must not acquire encounter CP');
        assert.ok(Number.isInteger(reward.cpMin) && Number.isInteger(reward.cpMax) &&
          reward.cpMin > 0 && reward.cpMin <= reward.cpMax, reward.name);
      }
    }
  }
});
