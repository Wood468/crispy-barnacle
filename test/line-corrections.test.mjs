import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyLineCorrections } from '../scripts/importer/corrections.mjs';

const corrections = JSON.parse(readFileSync(new URL('../data/line-corrections.json', import.meta.url), 'utf8')).lines;
const details = JSON.parse(readFileSync(new URL('../public/event-details.json', import.meta.url), 'utf8')).events;

test('a secondary-source line a stronger source does not confirm is rewritten, others untouched', () => {
  const events = { a: { fields: { raids: [{ text: corrections[0].match, sources: ['leekduck'], status: 'single' }, { text: 'Other line', sources: [] }] } } };
  assert.equal(applyLineCorrections(events, corrections), 1);
  assert.match(events.a.fields.raids[0].text, /both event days and may be Shiny/);
  assert.equal(events.a.fields.raids[1].text, 'Other line');
  assert.equal(events.a.fields.raids[0].sources[0], 'leekduck');
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
});
