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

test('month-only evidence never merges: the same month with different Pokemon stays two cards', () => {
  assert.equal(merge([ev('leekduck:a', 'Community Day', ...CD)], [ev('cur:a', 'November Community Day', ...CD)]).length, 2, 'no Pokemon on either side');
  assert.equal(merge([ev('leekduck:b', 'Pawniard Community Day', ...CD, { featured: [mon('Pawniard')] })], [ev('cur:b', 'November Community Day', ...CD, { featured: [mon('Deino')] })]).length, 2, 'Pawniard vs Deino');
  assert.equal(merge([ev('leekduck:c', 'Pikachu Spotlight Hour', '2026-11-17T18:00:00', '2026-11-17T19:00:00', { featured: [mon('Pikachu')] })],
    [ev('cur:c', 'November Spotlight Hour', '2026-11-17T18:00:00', '2026-11-17T19:00:00', { featured: [mon('Eevee')] })]).length, 2, 'Pikachu vs Eevee spotlight');
});

test('the real curated novcd record features Pawniard, so the shared Pokemon alone merges the real pair (live roster empty)', () => {
  const n = data.events.find(x => x.id === 'novcd');
  assert.ok(n.art.includes('Pawniard'));
  const curated = ev('cur:novcd', n.t, n.s, n.e, { kind: 'cd', status: 'official_confirmed', link: n.sourceUrl, featured: n.art.map(a => mon(typeof a === 'string' ? a : a.n)) });
  const out = merge([ev('leekduck:november-communityday2026', 'Pawniard Community Day', n.s, n.e, { kind: 'cd' })], [curated]);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'Pawniard Community Day');
});

test('only a live card pairs with a curated card: curated-with-curated and live-with-live never collapse', () => {
  const c1 = ev('cur:one', 'November Community Day', ...CD, { featured: [mon('Pawniard')] });
  const c2 = ev('cur:two', 'Pawniard Community Day', ...CD, { featured: [mon('Pawniard')] });
  assert.equal(merge([], [c1, c2]).length, 2, 'two curated, no live');
  assert.equal(merge([ev('leekduck:other', 'Eevee Spotlight Hour', ...CD)], [ev('cur:three', 'Alpha Community Day', ...CD, { featured: [mon('Pawniard')] }), ev('cur:four', 'Bravo Community Day', ...CD, { featured: [mon('Pawniard')] })]).length, 3, 'unmatched curated cards do not absorb each other');
  const l1 = ev('leekduck:l1', 'Pawniard Community Day', ...CD, { featured: [mon('Pawniard')] });
  const l2 = ev('hub:l2', 'Pawniard CD', ...CD, { featured: [mon('Pawniard')] });
  assert.equal(merge([l1, l2], []).length, 2, 'live with live is not this function\'s job');
  assert.equal(merge([l1], [ev('cur:x', 'November Community Day', ...CD, { featured: [mon('Pawniard')] }), ev('cur:y', 'Other Community Day', ...CD, { featured: [mon('Pawniard')] })]).length, 2, 'one live card consumed once');
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
  assert.equal(merge([live], [ev('cur:c', 'December Community Day', ...CD, { featured: [mon('Deino')] })]).length, 2, 'wrong month and wrong Pokemon');
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

/* ---- saved Hidden / Done state follows the merged card's aliases ---- */
const todayLogic = require('../public/today-logic.js');
const tl = (name) => dash.slice(dash.indexOf(name), dash.indexOf('\n', dash.indexOf(name)));
function between(a, b) { const i = dash.indexOf(a); return dash.slice(i, dash.indexOf(b, i)); }
function memStorage() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; }
function stateRig(EV, user = {}) {
  const c = { EV, TL: todayLogic, renderAll() {}, usGet: k => user[k], usSet: (k, v) => { if (v == null) delete user[k]; else user[k] = v; }, usKeys: p => Object.keys(user).filter(k => k.startsWith(p)) };
  vm.createContext(c);
  vm.runInContext(between('  function idsOf(id)', '  function savedList') + '\n' + between('  function t1IsDone(map', '  function t1IsHidden') + between('  function t1IsHidden(map', '  /* Explicit boosts only').split('\n')[0] + '\n' + between('  /* Saved Done/Hidden keys', '  function t1Ctx('), c);
  return c;
}
function mergedPair() {
  const n = data.events.find(x => x.id === 'novcd');
  const curated = ev('cur:novcd', n.t, n.s, '2026-11-21T17:00:00', { featured: [mon('Pawniard')], status: 'official_confirmed', link: n.sourceUrl });
  const live = ev('leekduck:november-communityday2026', 'Pawniard Community Day', '2026-11-21T15:00:00', '2026-11-21T17:30:00', { featured: [mon('Pawniard')] });
  const [merged] = merge([live], [curated]);
  return { merged, curated };
}

test('merged card records the absorbed ids and their start times', () => {
  const { merged, curated } = mergedPair();
  assert.deepEqual(JSON.parse(JSON.stringify(merged.aliasIds)), ['cur:novcd']);
  assert.equal(+merged.aliasStarts[0].start, +curated.start);
});

test('a curated card the user hid stays hidden after the live id wins, and Show again clears it', () => {
  const { merged } = mergedPair();
  const user = { 'hide:cur:novcd': true };
  const rig = stateRig([merged], user);
  assert.equal(rig.isHidden(merged.id), true);
  assert.deepEqual(JSON.parse(JSON.stringify(rig.hiddenList())), ['cur:novcd']);
  rig.toggleHide(merged.id);
  assert.equal(rig.isHidden(merged.id), false);
  assert.equal(Object.keys(user).length, 0);
  const fresh = stateRig([merged], {});
  fresh.toggleHide(merged.id);
  assert.equal(fresh.isHidden(merged.id), true);
});

test('Today Hidden-by-you and Done keys resolve through id + aliasIds + the absorbed start time, and Restore removes them', () => {
  const { merged, curated } = mergedPair();
  const store = memStorage();
  const rig = stateRig([merged]);
  assert.equal(todayLogic.tryHideToday(store, curated.id, curated.start, curated.end, Date.parse('2026-11-20')).ok, true);
  const hide = todayLogic.readHidden(store);
  const key = rig.t1StateKey(hide, merged, rig.t1IsHidden);
  assert.equal(key, todayLogic.doneKey('cur:novcd', curated.start), 'finds the stored curated key even though start times differ');
  assert.equal(todayLogic.tryRestoreHidden(store, key).ok, true);
  assert.equal(rig.t1StateKey(todayLogic.readHidden(store), merged, rig.t1IsHidden), '');
  assert.equal(todayLogic.tryMarkDone(store, curated.id, curated.start, curated.end, Date.parse('2026-11-20')).ok, true);
  const dkey = rig.t1StateKey(todayLogic.readDone(store), merged, rig.t1IsDone);
  assert.equal(dkey, todayLogic.doneKey('cur:novcd', curated.start));
  assert.equal(todayLogic.tryUndoDone(store, dkey).ok, true);
  assert.equal(rig.t1StateKey(todayLogic.readDone(store), merged, rig.t1IsDone), '');
});

test('state of an unrelated event never matches', () => {
  const { merged } = mergedPair();
  const store = memStorage();
  todayLogic.tryMarkDone(store, 'cur:other', merged.start, merged.end, Date.parse('2026-11-20'));
  const rig = stateRig([merged]);
  assert.equal(rig.t1StateKey(todayLogic.readDone(store), merged, rig.t1IsDone), '');
  assert.equal(rig.isHidden(merged.id), false);
});
