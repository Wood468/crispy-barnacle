import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveHighlights, applyDerived, applyDerivedImported, mergeDerived } from '../scripts/derive-highlights.mjs';

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

const imp = d => deriveHighlights(d, { explicitSingle: true }).map(h => h.label);

test('imported-only: single-source explicit "increased chance" rows chip (Pawniard, Electrike, Growlithe)', () => {
  const d = { fields: { shiny: [
    single('Trainers will have an increased chance of encountering Shiny Pawniard during Community Day. Shiny Pawniard can be evolved into Shiny Bisharp and Shiny Kingambit.'),
    single('Pawniard attracted to regular Lure Modules will still have an increased chance to be Shiny and may have a Special Background.'),
    single('You will have an increased chance of encountering Shiny Electrike throughout the event.'),
    single('The increased chance of encountering Shiny Hisuian Growlithe applies to Incense encounters from October 16.')] } };
  assert.deepEqual(imp(d), ['BOOSTED SHINY · Pawniard', 'BOOSTED SHINY · Electrike', 'BOOSTED SHINY · Hisuian Growlithe']);
  assert.deepEqual(labels(d), []); // curated/default path keeps the strict trust gate
});

test('hatching boost (Sandile Hatch Day) chips', () => {
  const d = { fields: { bonuses: [off('Increased chance of hatching Shiny Sandile')] } };
  assert.deepEqual(labels(d), ['BOOSTED SHINY · Sandile']);
});

test('imported-only: availability, luck and "not available" text never chips', () => {
  const d = { fields: { featured: [single("For the first time in Pokémon GO, you'll be able to encounter Shiny Greavard—if you're lucky!")],
    shiny: [single('Shiny Minior is not available during the Orionids Minior Shower. Its Shiny debut has not been announced.'),
      single('Dynamax Dialga and Dynamax Palkia make their debuts. Both can be Shiny!'),
      single('Gigantamax Machamp from this research has a 5% (1 in 20) chance of being Shiny .')] } };
  assert.deepEqual(imp(d), []);
});

test('applyDerivedImported is idempotent, deduped and leaves curated events alone', () => {
  const data = { events: [{ id: 'sandile' }] };
  const row = single('You will have an increased chance of encountering Shiny Electrike throughout the event.');
  const det = { sandile: { fields: { shiny: [row] } }, 'leekduck:x': { fields: { shiny: [row, row] } }, other: { fields: { shiny: [row] } } };
  const first = applyDerivedImported(data, det);
  assert.deepEqual(first.map(c => c.id), ['leekduck:x']);
  assert.deepEqual(det['leekduck:x'].highlights, [{ type: 'boosted-shiny', label: 'BOOSTED SHINY · Electrike' }]);
  assert.equal(det.sandile.highlights, undefined);
  assert.equal(det.other.highlights, undefined);
  assert.deepEqual(applyDerivedImported(data, det), []);
});
