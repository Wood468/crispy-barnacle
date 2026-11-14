import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyLineCorrections } from '../scripts/importer/corrections.mjs';

const corrections = JSON.parse(readFileSync(new URL('../data/line-corrections.json', import.meta.url), 'utf8')).lines;
const details = JSON.parse(readFileSync(new URL('../public/event-details.json', import.meta.url), 'utf8')).events;

test('exact source-line corrections preserve unrelated rows and original source provenance', () => {
  const synthetic = [{ match: 'Outdated wording', text: 'Verified replacement' }];
  const events = { a: { fields: { raids: [
    { text: synthetic[0].match, sources: ['leekduck'], status: 'single' },
    { text: 'Other line', sources: [] }
  ] } } };
  assert.equal(applyLineCorrections(events, synthetic), 1);
  assert.equal(events.a.fields.raids[0].text, synthetic[0].text);
  assert.equal(events.a.fields.raids[1].text, 'Other line');
  assert.equal(events.a.fields.raids[0].sources[0], 'leekduck');
  assert.equal(applyLineCorrections(events, synthetic), 0, 'correction is idempotent');
});

test('officially confirmed Modern Jacket Machamp Shiny eligibility survives curated and published event data', () => {
  const curated = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8')).events;
  const wag = curated.find(event => event.id === 'wag');
  assert.ok(wag, 'the source-backed global event must exist');
  assert.match(wag.sourceUrl || '', /^https:\/\/pokemongo\.com\/(?:en\/)?gowildarea\/global\/?$/);
  assert.ok(wag.p.some(line => /Machamp wearing a modern jacket[^.]*may be Shiny\./i.test(line)),
    'curated summary must not contradict the official Shiny-eligible costume');
  const staleDisclaimer = /official event page does not confirm(?: this| it can be Shiny)/i;
  for (const [id, record] of Object.entries(details))
    for (const lines of Object.values(record.fields || {}))
      for (const line of lines) assert.doesNotMatch(line?.text || '', staleDisclaimer, id);
  assert.ok(Object.values(details.wag.fields).flat().some(line =>
    /Machamp wearing a modern jacket[^.]*may be Shiny\./i.test(line?.text || '')),
  'published source-backed Global event must retain the Shiny-eligible raid costume');
  for (const id of ['sendai', 'leekduck:pokemon-go-wild-area-2026-mexico-city']) {
    const lines = Object.values(details[id].fields).flat();
    assert.ok(lines.some(line => /Machamp wearing a modern jacket[^.]*may be Shiny\./i.test(line?.text || '')),
      id + ' should retain confirmed Shiny eligibility without claiming a different day window');
  }
  assert.ok(!corrections.some(correction =>
    /Machamp wearing a modern jacket/i.test(correction.match || '') &&
    /does not confirm/i.test(correction.text || '')),
  'do not reintroduce obsolete negative official-source corrections on a future importer run');
});
