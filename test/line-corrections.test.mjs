import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyLineCorrections } from '../scripts/importer/corrections.mjs';

const corrections = JSON.parse(readFileSync(new URL('../data/line-corrections.json', import.meta.url), 'utf8')).lines;
const details = JSON.parse(readFileSync(new URL('../public/event-details.json', import.meta.url), 'utf8')).events;

test('source line corrections remain strict exact matches and preserve source provenance', () => {
  // Synthetic evidence dispute, not a claim about a published Pokémon or event.
  const review = [{
    match: 'Example secondary source says an encounter is guaranteed.',
    text: 'Example secondary source reports the encounter; official confirmation is unavailable.',
  }];
  const events = { a: { fields: { raids: [
    { text: review[0].match, sources: ['leekduck'], status: 'single' },
    { text: 'Example secondary source says an encounter is likely.', sources: ['official'] },
  ] } } };
  assert.equal(applyLineCorrections(events, review), 1);
  assert.equal(events.a.fields.raids[0].text, review[0].text);
  assert.deepEqual(events.a.fields.raids[0].sources, ['leekduck']);
  assert.equal(events.a.fields.raids[1].text, 'Example secondary source says an encounter is likely.');
  assert.deepEqual(events.a.fields.raids[1].sources, ['official']);
});

test('official-confirmed Shiny Modern Jacket Machamp is never overwritten with an obsolete denial', () => {
  // https://pokemongo.com/gowildarea/global marks the costumed Machamp with a
  // Shiny-eligible asterisk for Saturday/Sunday; Leek Duck and GO Hub concur.
  // Shiny eligibility is not a species-specific boosted Shiny rate.
  const eligible = [
    'Machamp wearing a modern jacket appears in three-star raids during event hours and may be Shiny.',
    'Machamp wearing a modern jacket appears in three-star raids on both event days and may be Shiny.',
  ];
  const records = { source: { fields: { shiny: eligible.map(text => ({ text, sources: ['leekduck'] })) } } };
  assert.equal(applyLineCorrections(records, corrections), 0,
    'a removed contradiction must not return through another configured correction');
  assert.deepEqual(records.source.fields.shiny.map(row => row.text), eligible);
  assert.ok(!corrections.some(row => /Machamp wearing a modern jacket/i.test(row.match || '')
    && /official event page does not confirm/i.test(row.text || '')),
  'do not reintroduce the out-of-date claim that official sources lack Shiny confirmation');

  // A current published event must not state the obsolete denial. Historical
  // events may be archived later, so this is not a requirement to retain 'wag' forever.
  const lines = Object.values(details.wag?.fields || {}).flat().map(row => row?.text || '');
  assert.ok(!lines.some(text => /Machamp wearing a modern jacket.*official event page does not confirm/i.test(text)));
  assert.ok(!lines.some(text => /Machamp wearing a modern jacket.*(?:boosted Shiny odds|increased Shiny rate)/i.test(text)),
    'Shiny-eligible does not prove a special shiny boost for this costume');
});
