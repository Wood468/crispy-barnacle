import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyLineCorrections } from '../scripts/importer/corrections.mjs';

const corrections = JSON.parse(readFileSync(new URL('../data/line-corrections.json', import.meta.url), 'utf8')).lines;
const details = JSON.parse(readFileSync(new URL('../public/event-details.json', import.meta.url), 'utf8')).events;

test('a secondary-source line a stronger source does not confirm is rewritten, others untouched', () => {
  const events = { a: { fields: { raids: [{ text: corrections[0].match, sources: ['leekduck'], status: 'single' }, { text: 'Other line', sources: [] }] } } };
  assert.equal(applyLineCorrections(events, corrections), 1);
  assert.match(events.a.fields.raids[0].text, /official event page does not confirm/);
  assert.equal(events.a.fields.raids[1].text, 'Other line');
  assert.equal(events.a.fields.raids[0].sources[0], 'leekduck');
});

test('published event details contain no unconfirmed Machamp Shiny claim', () => {
  for (const [id, record] of Object.entries(details))
    for (const lines of Object.values(record.fields || {}))
      for (const line of lines) assert.ok(!(line && /Machamp wearing a modern jacket[^.]*may be Shiny\./.test(line.text || '')), id);
});
