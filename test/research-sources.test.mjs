import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const lib = createRequire(import.meta.url)('../public/lib.js');
const research = fs.readFileSync(new URL('../public/research.js', import.meta.url), 'utf8');
const NOW = Date.parse('2026-11-09T12:00:00Z');
const H = 3600000;

test('importer freshness thresholds: fresh up to 6 h, delayed up to 24 h, then stale; the curated snapshot gets days', () => {
  const at = h => new Date(NOW - h * H).toISOString();
  assert.equal(lib.freshnessOf(at(0.5), NOW, 'importer').state, 'fresh');
  assert.equal(lib.freshnessOf(at(6), NOW, 'importer').state, 'fresh');
  assert.equal(lib.freshnessOf(at(6.1), NOW, 'importer').state, 'delayed');
  assert.equal(lib.freshnessOf(at(24), NOW, 'importer').state, 'delayed');
  assert.equal(lib.freshnessOf(at(24.1), NOW, 'importer').state, 'stale');
  assert.equal(lib.freshnessOf(at(60), NOW, 'curated').state, 'fresh');
  assert.equal(lib.freshnessOf(at(100), NOW, 'curated').state, 'delayed');
  assert.equal(lib.freshnessOf(at(200), NOW, 'curated').state, 'stale');
  assert.match(lib.freshnessOf(at(30), NOW, 'importer').label, /May be out of date · last updated 30 h ago/);
});

test('missing, invalid and future update times are unknown, never fresh', () => {
  for (const bad of [null, undefined, '', 'yesterday', NaN, 0, new Date(NOW + 3 * 86400000).toISOString()]) {
    const f = lib.freshnessOf(bad, NOW, 'importer');
    assert.equal(f.state, 'unknown', String(bad));
    assert.equal(f.ageMs, null);
  }
  assert.equal(lib.freshnessOf('2026-11-09', NOW, 'importer').state, 'fresh', 'a bare date counts as that day at noon UTC');
});

test('three kinds of missing data keep three distinct labels', () => {
  assert.equal(lib.missingLabel('not-announced'), 'Not announced yet');
  assert.equal(lib.missingLabel('not-in-source'), 'Not available from source');
  assert.equal(lib.missingLabel('unverified'), 'Unverified');
  assert.equal(lib.missingLabel('anything-else'), 'Unverified');
});

function paint(tasks, extra = {}) {
  const listeners = {};
  const host = { innerHTML: '', setAttribute() {}, removeAttribute() {}, querySelectorAll() { return []; } };
  const status = { textContent: '' };
  const details = { updated: '2026-11-09T11:00:00Z', events: { f: { researchTasks: tasks.map(t => ({ eventId: 'f', eventWindow: { start: '2026-11-01', end: '2026-11-30' }, ...t })) } } };
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
  vm.runInNewContext(research, { Date: Clock, URL, setTimeout, window: { GOLIB: { ...lib, jsonOrNull: url => Promise.resolve(url.includes('event-details') ? details : { events: [{ id: 'f', t: 'Fixture event' }] }) }, ...extra }, document: { getElementById(id) { return id === 'research-list' ? host : status; }, querySelector() { return { setAttribute() {}, removeAttribute() {} }; }, addEventListener(type, cb) { listeners[type] = cb; } } });
  listeners['gofn-view']({ detail: { tab: 'events', sub: 'research' } });
  return new Promise(resolve => setImmediate(() => resolve(host.innerHTML)));
}
const reward = (name, extra) => ({ type: 'encounter', name, cpMin: 100, cpMax: 120, ...extra });

test('research is grouped by category; alternatives and cumulative rewards keep their own wording', async () => {
  const html = await paint([
    { task: 'Catch 5 Pokémon', category: 'field', rewards: [reward('A'), reward('B'), reward('C')] },
    { task: 'Win a raid', category: 'timed', rewards: [reward('D'), { type: 'item', name: 'Stardust', quantity: 1000 }] },
    { task: 'Finish the page', category: 'special', rewards: [{ type: 'item', name: 'Rare Candy', quantity: 3 }] }
  ]);
  assert.match(html, /data-research-category="field"[\s\S]*Field Research/);
  assert.match(html, /data-research-category="timed"[\s\S]*Timed Research/);
  assert.match(html, /data-research-category="special"[\s\S]*Special Research/);
  assert.match(html, /One of 3 possible rewards/);
  assert.match(html, /All 2 rewards/);
  assert.match(html, /1 reward</);
  assert.doesNotMatch(html, /One of 2 possible/, 'cumulative rewards are never called alternatives');
  assert.match(html, /Each task gives one of its listed rewards/);
  assert.match(html, /Rewards are cumulative: you receive all of them/);
});

test('long category lists collapse to eight tasks with a Show all control', async () => {
  const many = Array.from({ length: 14 }, (_, i) => ({ task: 'Catch ' + (i + 1) + ' Rookidee', category: 'field', rewards: [reward('Rookidee')] }));
  const html = await paint(many);
  assert.equal((html.match(/class="research-task"/g) || []).length, 8);
  assert.match(html, /Show all 14 tasks/);
  const short = await paint(many.slice(0, 10));
  assert.equal((short.match(/class="research-task"/g) || []).length, 10, 'a list that is only slightly over the limit is not collapsed');
});

test('reward cells come from the shared exact-art renderer; the Shiny tag only appears when the source says so', async () => {
  const calls = [];
  const detailApi = { researchReward: item => { calls.push(item); return '<div class="research-reward">' + item.name + (item.shiny === true ? ' SHINY' : '') + '</div>'; } };
  const html = await paint([{ task: 'Catch 3 Pokémon', category: 'field', rewards: [reward('Machamp', { costumeId: 'modernjacket' }), reward('Rookidee', { shiny: true }), { type: 'item', name: 'Stardust', quantity: 2000 }] }], { GODETAIL: detailApi });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].costumeId, 'modernjacket', 'variant identifiers reach the renderer untouched');
  assert.match(html, /Rookidee SHINY/);
  assert.doesNotMatch(html, /Machamp SHINY|Stardust SHINY/);
  const detail = fs.readFileSync(new URL('../public/detail.js', import.meta.url), 'utf8');
  assert.match(detail, /item\.shiny === true/, 'shiny is read from the source field, never inferred');
  assert.doesNotMatch(detail.match(/function researchReward[\s\S]*?\n  \}/)[0], /boost|bonus/i);
});

test('events that mention research but have no task list are named as not available from source', async () => {
  const listeners = {};
  const host = { innerHTML: '', setAttribute() {}, removeAttribute() {}, querySelectorAll() { return []; } };
  const details = { updated: '2026-11-09T11:00:00Z', events: { g: { name: 'Mention only', fields: { research: [{ text: 'Special Research available', sources: ['x'], status: 'single' }] }, researchTasks: [] } } };
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
  vm.runInNewContext(research, { Date: Clock, URL, setTimeout, window: { GOLIB: { ...lib, jsonOrNull: url => Promise.resolve(url.includes('event-details') ? details : { events: [{ id: 'g', t: 'Mention only', s: '2026-11-09T10:00', e: '2026-11-20T10:00' }] }) } }, document: { getElementById(id) { return id === 'research-list' ? host : { textContent: '' }; }, querySelector() { return { setAttribute() {}, removeAttribute() {} }; }, addEventListener(type, cb) { listeners[type] = cb; } } });
  listeners['gofn-view']({ detail: { tab: 'events', sub: 'research' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(host.innerHTML, /Not announced yet/);
  assert.match(host.innerHTML, /Not available from source/);
  assert.match(host.innerHTML, /Mention only/);
});

test('Sources view lists attribution, licensing, cadence and importer freshness', () => {
  const fresh = fs.readFileSync(new URL('../public/fresh.js', import.meta.url), 'utf8');
  for (const needle of ['Pokémon GO news (official)', 'Leek Duck', 'Pokémon GO Hub', 'PokeMiners', 'Niantic', 'The Pokémon Company', 'not affiliated with or endorsed', 're-read every hour', 'Event write-ups and research', "freshnessOf(ED && ED.updated, null, 'importer')"]) assert.ok(fresh.includes(needle), needle);
});

test('a write-up filed under its source id joins the curated event of the same name and gets its Event details link', async () => {
  const listeners = {};
  const host = { innerHTML: '', setAttribute() {}, removeAttribute() {}, querySelectorAll() { return []; } };
  const details = { updated: '2026-11-09T11:00:00Z', events: { 'leekduck:into-the-wild-2026': { name: 'Into the Wild 2026', researchTasks: [{ eventId: 'leekduck:into-the-wild-2026', eventName: 'Into the Wild 2026', task: 'Catch 10 Pokémon', category: 'field', eventWindow: { start: '2026-11-09T10:00', end: '2026-11-13T20:00' }, rewards: [reward('Horsea')] }] } } };
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
  vm.runInNewContext(research, { Date: Clock, URL, setTimeout, window: { GOLIB: { ...lib, jsonOrNull: url => Promise.resolve(url.includes('event-details') ? details : { events: [{ id: 'into', t: 'Into the Wild', s: '2026-11-09T10:00', e: '2026-11-13T20:00' }] }) } }, document: { getElementById(id) { return id === 'research-list' ? host : { textContent: '' }; }, querySelector() { return { setAttribute() {}, removeAttribute() {} }; }, addEventListener(type, cb) { listeners[type] = cb; } } });
  listeners['gofn-view']({ detail: { tab: 'events', sub: 'research' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(host.innerHTML, /data-open="cur:into"/);
  assert.match(host.innerHTML, /data-research-group="cur:into"/);
});
