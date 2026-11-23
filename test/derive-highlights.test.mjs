import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveHighlights, applyDerived, mergeDerived } from '../scripts/derive-highlights.mjs';

const off = text => ({ text, sources: ['official'], status: 'official' });
const two = text => ({ text, sources: ['official', 'leekduck'], status: 'corroborated' });
const single = text => ({ text, sources: ['leekduck'], status: 'single' });
const labels = d => deriveHighlights(d).map(h => h.label);

test('Twilight Wishes style text yields one boosted-shiny chip per species', () => {
  const d = { fields: { featured: [two('Staryu and Elgyem have an increased chance of being Shiny during the event.')] } };
  assert.deepEqual(labels(d), ['BOOSTED SHINY · Staryu', 'BOOSTED SHINY · Elgyem']);
});

test('Super Mega Raid Day: shiny boost and Mega debut', () => {
  const d = { fields: {
    bonuses: [off('Increased chance of encountering Shiny Clefable from Super Mega Raids.')],
    featured: [two('Mega-Evolved Pokémon Debut'), two('Mega Clefable*')] } };
  assert.deepEqual(deriveHighlights(d), [
    { type: 'debut', label: 'DEBUT · Mega Clefable' },
    { type: 'boosted-shiny', label: 'BOOSTED SHINY · Clefable' }]);
});

test('asterisk-only and "can be Shiny" text never produces chips', () => {
  const d = { fields: { featured: [off('Espeon*, Umbreon* and Rockruff*'), off('All three can be Shiny if you are lucky!'), off('Shiny possible*')],
    shiny: [off('Increased chance of encountering Shiny Pokémon during the weekend.')] } };
  assert.deepEqual(deriveHighlights(d), []);
});

test('single-source community rows are not trusted', () => {
  assert.deepEqual(deriveHighlights({ fields: { bonuses: [single('Increased chance of encountering Shiny Pawniard.')] } }), []);
});

test('hand-written chips are kept, not duplicated or overridden', () => {
  const hand = [{ type: 'boosted-shiny', label: 'BOOSTED SHINY · Staryu (hand)' }];
  const derived = [{ type: 'boosted-shiny', label: 'BOOSTED SHINY · Staryu' }, { type: 'boosted-shiny', label: 'BOOSTED SHINY · Elgyem' }];
  assert.deepEqual(mergeDerived(hand, derived), [hand[0], derived[1]]);
  const data = { events: [{ id: 'e', t: 'E', highlights: hand }] };
  const det = { e: { fields: { bonuses: [off('Increased chance of encountering Shiny Staryu.')] } } };
  assert.deepEqual(applyDerived(data, det), []);
  assert.deepEqual(data.events[0].highlights, hand);
});
