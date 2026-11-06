import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { filterOpportunities, esc } = createRequire(import.meta.url)('../public/lib.js');
const rows = [
  { name: 'Flabébé', o: { base: 'Flabébé', state: 'missing' }, evs: [{ name: 'Garden Festival' }] },
  { name: 'Mega Gengar', o: { base: 'Gengar', state: 'have' }, evs: [{ name: 'Mega Raid Weekend' }] },
  { name: 'Costume Pikachu', o: { base: 'Pikachu', state: 'unknown' }, evs: [{ name: 'Garden Festival' }] },
  { name: 'Dynamax Pikachu', o: { base: 'Pikachu', state: 'form' }, evs: [{ name: 'Max Monday' }] }
];
const followed = name => name.includes('Pikachu');

test('opportunity search matches accents, base names and event names without changing order or data', () => {
  const before = JSON.stringify(rows);
  assert.deepEqual(filterOpportunities(rows, '  FLABEBE ', 'all', followed), [rows[0]]);
  assert.deepEqual(filterOpportunities(rows, 'garden festival', 'all', followed), [rows[0], rows[2]]);
  assert.deepEqual(filterOpportunities(rows, 'Pikachu', 'all', followed), [rows[2], rows[3]]);
  assert.equal(JSON.stringify(rows), before);
});
test('Need filter excludes untracked forms and owned Pokémon; Following respects the existing follow lookup', () => {
  assert.deepEqual(filterOpportunities(rows, '', 'need', followed), [rows[0]]);
  assert.deepEqual(filterOpportunities(rows, '', 'following', followed), [rows[2], rows[3]]);
  assert.deepEqual(filterOpportunities(rows, 'garden', 'following', followed), [rows[2]]);
  assert.deepEqual(filterOpportunities(rows, 'Pikachu', 'need', followed), []);
});
test('empty search and no matches remain honest and do not add inferred opportunities', () => {
  assert.deepEqual(filterOpportunities(rows, '', 'all', followed), rows);
  assert.deepEqual(filterOpportunities([], '', 'need', followed), []);
  assert.deepEqual(filterOpportunities(rows, 'not a scheduled Pokémon', 'all', followed), []);
});
test('opportunity event actions retain event identity, source clock wording and escaped labels', () => {
  const dash = fs.readFileSync(new URL('../public/dash.js', import.meta.url), 'utf8');
  const body = dash.match(/function opportunityEventRow\(e\) \{([\s\S]*?)\n  \}/)[1];
  const render = new Function('e', 'esc', 'timeMeta', 'countdown', body);
  const html = render({ id: 'cur:a" onclick="bad', name: 'Festival <ScRiPt>' }, esc, () => 'UTC: 10:00 · Local time in each region', () => 'Tomorrow');
  assert.match(html, /data-open="cur:a&quot; onclick=&quot;bad"/);
  assert.match(html, /Festival &lt;script&gt;/i);
  assert.match(html, /UTC: 10:00 · Local time in each region/);
  assert.doesNotMatch(html, /<script>| onclick="bad/i);
});
