import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const lib = require('../public/lib.js');
const dedupe = require('../public/dedupe.js');
const dash = fs.readFileSync(new URL('../public/dash.js', import.meta.url), 'utf8');
const data = JSON.parse(fs.readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'));

/* The real mergeLiveAndCurated source, evaluated in isolation (no behaviour change elsewhere). */
const code = dash.slice(dash.indexOf('  function mergeLiveAndCurated('), dash.indexOf('  function announced('));
const context = { window: { GOLIB: lib, GODEDUPE: dedupe }, GODEDUPE: dedupe, LIB: lib, mergeHighlights: (a, b) => (a || []).concat(b || []) };
vm.createContext(context); vm.runInContext(code, context);
const merge = (live, curated) => context.mergeLiveAndCurated(live, curated);

const T = s => new Date(s);
function ev(id, name, s, e, extra = {}) {
  return { id, name, start: T(s), end: T(e), featured: [], bonuses: [], notes: [], tags: [], highlights: [], status: 'community_reported', source: 'Leek Duck', link: '', region: '', ...extra };
}
const mon = name => ({ name, role: 'featured' });

const CD = ['2026-11-21T14:00:00', '2026-11-21T17:00:00'];

test('live "Pawniard Community Day" and curated "November Community Day" are one card that keeps the Pawniard title', () => {
  const n = data.events.find(x => x.id === 'novcd');
  const curated = ev('cur:novcd', n.t, n.s, n.e, { kind: 'cd', status: 'official_confirmed', source: n.source, link: n.sourceUrl, featured: n.art.map(a => mon(typeof a === 'string' ? a : a.n)) });
  const live = ev('leekduck:november-communityday2026', 'Pawniard Community Day', n.s, n.e, { kind: 'cd', link: 'https://leekduck.com/events/november-communityday2026/', featured: [mon('Pawniard')] });
  const out = merge([live], [curated]);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'Pawniard Community Day');
  assert.equal(out[0].id, 'leekduck:november-communityday2026');
  assert.ok(out[0].aliasIds.includes('cur:novcd'));
  assert.equal(out[0].status, 'official_confirmed');
  assert.equal(out[0].link, n.sourceUrl);
  assert.ok(out[0].featured.some(f => f.name === 'Kingambit'));
});

test('the better title wins even when the curated card carries more featured Pokemon', () => {
  const curated = ev('cur:x', 'November Community Day', ...CD, { featured: [mon('Pawniard'), mon('Bisharp'), mon('Kingambit')] });
  const live = ev('leekduck:x', 'Pawniard Community Day', ...CD, { featured: [mon('Pawniard')] });
  assert.equal(merge([live], [curated])[0].name, 'Pawniard Community Day');
  const reverse = merge([ev('leekduck:y', 'November Community Day', ...CD, { featured: [mon('Pawniard')] })], [ev('cur:y', 'Pawniard Community Day', ...CD, { featured: [mon('Pawniard')] })]);
  assert.equal(reverse.length, 1);
  assert.equal(reverse[0].name, 'Pawniard Community Day');
});

test('month evidence alone merges a same-time, same-format pair when the month matches both start dates', () => {
  const out = merge([ev('leekduck:a', 'Community Day', ...CD)], [ev('cur:a', 'November Community Day', ...CD)]);
  assert.equal(out.length, 1);
});

test('start/end tolerance is 6 hours', () => {
  const live = ev('leekduck:t', 'Pawniard Community Day', '2026-11-21T14:00:00', '2026-11-21T17:00:00', { featured: [mon('Pawniard')] });
  const near = ev('cur:t', 'November Community Day', '2026-11-21T10:30:00', '2026-11-21T20:30:00', { featured: [mon('Pawniard')] });
  const far = ev('cur:t', 'November Community Day', '2026-11-21T07:00:00', '2026-11-21T17:00:00', { featured: [mon('Pawniard')] });
  const farEnd = ev('cur:t', 'November Community Day', '2026-11-21T14:00:00', '2026-11-21T23:30:00', { featured: [mon('Pawniard')] });
  assert.equal(merge([live], [near]).length, 1);
  assert.equal(merge([live], [far]).length, 2, 'start 7h apart');
  assert.equal(merge([live], [farEnd]).length, 2, 'end 6.5h apart');
});

test('negative: Community Days on different dates stay separate even with the same Pokemon', () => {
  const live = ev('leekduck:nov', 'Pawniard Community Day', ...CD, { featured: [mon('Pawniard')] });
  const dec = ev('cur:dec', 'Pawniard Community Day Encore', '2026-12-20T14:00:00', '2026-12-20T17:00:00', { featured: [mon('Pawniard')] });
  const dec2 = ev('cur:dec2', 'December Community Day', '2026-12-20T14:00:00', '2026-12-20T17:00:00', { featured: [mon('Pawniard')] });
  assert.equal(merge([live], [dec]).length, 2);
  assert.equal(merge([live], [dec2]).length, 2);
});

test('negative: format words alone, or a month that does not match, never merge', () => {
  const live = ev('leekduck:a', 'Pawniard Community Day', ...CD, { featured: [mon('Pawniard')] });
  assert.equal(merge([live], [ev('cur:b', 'Community Day', ...CD, { featured: [mon('Deino')] })]).length, 2, 'different species, no month');
  assert.equal(merge([live], [ev('cur:c', 'December Community Day', ...CD, { featured: [mon('Deino')] })]).length, 2, 'wrong month for the start date');
  assert.equal(merge([ev('leekduck:d', 'Festival Community Day', ...CD)], [ev('cur:d', 'Special Community Day', ...CD)]).length, 2, 'no distinctive token at all');
});

test('negative: different formats at the same time stay separate', () => {
  const live = ev('leekduck:cd', 'Pawniard Community Day', ...CD, { featured: [mon('Pawniard')] });
  for (const [name, extra] of [
    ['Pawniard Spotlight Hour', {}],
    ['Pawniard Raid Hour', {}],
    ['Pawniard Hatch Day', {}],
    ['Pawniard Classic Community Day Classic', {}],
    ['Pawniard Raid Day', {}]
  ]) assert.equal(merge([live], [ev('cur:z', name, ...CD, { featured: [mon('Pawniard')], ...extra })]).length, 2, name);
});

test('negative: two same-day Spotlight Hours with different species stay separate', () => {
  const a = ev('leekduck:s1', 'Pikachu Spotlight Hour', '2026-11-17T18:00:00', '2026-11-17T19:00:00', { featured: [mon('Pikachu')] });
  const b = ev('cur:s2', 'Eevee Spotlight Hour', '2026-11-17T18:00:00', '2026-11-17T19:00:00', { featured: [mon('Eevee')] });
  assert.equal(merge([a], [b]).length, 2);
});

test('negative: regional variants in different places, and in-person records, stay distinct (#817)', () => {
  const live = ev('leekduck:sydney', 'Pawniard Community Day', ...CD, { featured: [mon('Pawniard')], region: 'Sydney' });
  assert.equal(merge([live], [ev('cur:tokyo', 'November Community Day', ...CD, { featured: [mon('Pawniard')], region: 'Tokyo' })]).length, 2, 'different cities');
  assert.equal(merge([live], [ev('cur:global', 'November Community Day', ...CD, { featured: [mon('Pawniard')], region: '' })]).length, 2, 'regional vs global');
  const person = ev('leekduck:p', 'Pawniard Community Day', ...CD, { featured: [mon('Pawniard')], kind: 'person' });
  assert.equal(merge([person], [ev('cur:p', 'November Community Day', ...CD, { featured: [mon('Pawniard')], kind: 'person' })]).length, 2, 'in person');
  assert.equal(merge([ev('leekduck:k', 'Pawniard Community Day', ...CD, { featured: [mon('Pawniard')], kind: 'cd' })], [ev('cur:k', 'November Community Day', ...CD, { featured: [mon('Pawniard')], kind: 'raid' })]).length, 2, 'conflicting kinds');
});

test('a curated card merges into one live card only (a second live card is not swallowed)', () => {
  const a = ev('leekduck:1', 'Pawniard Community Day', ...CD, { featured: [mon('Pawniard')] });
  const b = ev('leekduck:2', 'Pawniard Community Day Bonus', ...CD, { featured: [mon('Pawniard')] });
  assert.equal(merge([a, b], [ev('cur:1', 'November Community Day', ...CD, { featured: [mon('Pawniard')] })]).length, 2);
});

test('existing rules still win first: title/article/window matches behave as before', () => {
  const live = ev('leekduck:minior-showers-orionids-2026', 'Minior Showers: Orionids', '2026-10-20T10:00:00', '2026-10-27T20:00:00');
  const cur = ev('cur:orionids', 'Orionid Meteor Shower', '2026-10-20T10:00:00', '2026-10-27T20:00:00', { link: 'https://leekduck.com/events/minior-showers-orionids-2026/' });
  assert.equal(merge([live], [cur]).length, 1);
  assert.equal(merge([ev('leekduck:q', 'Totally Different', ...CD)], [ev('cur:q', 'Other Thing', ...CD)]).length, 2);
});
