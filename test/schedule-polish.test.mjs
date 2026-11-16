import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const LOGIC = require('../public/today-logic.js');
const read = f => fs.readFileSync(new URL('../public/' + f, import.meta.url), 'utf8');
const dash = read('dash.js'), detail = read('detail.js'), css = read('dash.css'), redesign = read('event-redesign.css');

const d = (m, day, h = 0, min = 0) => new Date(Date.UTC(2026, m - 1, day, h, min));
const ev = (id, name, kind, start, end, extra = {}) => ({ id, name, kind, start, end, region: '', featured: [], tags: [], status: 'community_reported', ...extra });
const trails = ev('trails', 'Dynamax Trails', 'event', d(11, 16, 10), d(11, 23, 20), { status: 'official_confirmed', tags: ['Max Battles', 'Dynamax', 'Max Particles', 'Power Spots'] });
const cresselia = ev('cresselia', 'Cresselia and Darkrai in 5-star Raid Battles', 'raid', d(11, 16, 6), d(11, 24, 22), { tags: ['Raids'] });
const banette = ev('banette', 'Mega Banette in Mega Raids', 'raid', d(11, 16, 6), d(11, 24, 22), { tags: ['Raids', 'Mega'] });
const minior = ev('minior', 'Minior Showers: Leonids 2026', 'event', d(11, 14, 17), d(11, 19, 23, 59));

/* A: Schedule "Happening now" */
test('Schedule live events use the shared Today order: Trails, raid rotations, then Minior Showers', () => {
  /* The Schedule list is start-ordered, which put Minior (started 14 Nov) first. */
  const byStart = [minior, cresselia, banette, trails].sort((a, b) => a.start - b.start);
  assert.equal(byStart[0].id, 'minior');
  const sorted = LOGIC.happeningNowSort(byStart).map(e => e.id);
  assert.equal(sorted[0], 'trails');
  assert.deepEqual(new Set(sorted.slice(1, 3)), new Set(['cresselia', 'banette']));
  assert.equal(sorted[3], 'minior');
});

test('dash.js reuses happeningNowSort for the Timeline and Next 24h live groups, not a copy of the rule', () => {
  assert.match(dash, /function liveBySize\(list\) \{ var L = window\.GOTODAYLOGIC; return L && L\.happeningNowSort \? L\.happeningNowSort\(list\) : list; \}/);
  assert.match(dash, /var liveShort = liveBySize\(live\.filter\(function \(e\) \{ return !e\.long; \}\)\);/);
  assert.match(dash, /lv = liveBySize\(lvEv\.map\(function \(x\) \{ return x\.ev; \}\)\)/);
  assert.equal((dash.match(/\.happeningNowSort\(/g) || []).length, 1, 'the rule lives in today-logic.js; dash.js only calls it');
  assert.doesNotMatch(dash, /happeningNowTier/);
  /* upcoming groups stay start-ordered */
  assert.match(dash, /all\.sort\(function \(a, b\) \{ return a\.start - b\.start; \}\);/);
});

/* B: reward chips with no approved picture */
test('Research rewards: Eternatus Candy and Pinap Berry get a generic inline shape, never a grey dot or a lookalike picture', () => {
  assert.match(detail, /\\bcandy\( xl\)\?\\b\/i\.test\(name\)\) return \{ kind: 'candy', svg: '<svg/);
  assert.match(detail, /\(berry\|pinap\|razz\|nanab/);
  assert.match(detail, /\(glyph\.svg \|\| glyph\.text\)/);
  /* exact-match picture list unchanged: only Silver Pinap and Golden Razz have berry art */
  assert.match(detail, /silver pinap/);
  assert.doesNotMatch(detail, /\/ico\/i\/pinap(?!-berry\.webp)/); /* the plain Pinap Berry has its own exact-name picture, see eternatus-candy-art.test.mjs */
  const svgs = [...detail.matchAll(/svg: '(<svg[^']*<\/svg>)'/g)].map(m => m[1]);
  assert.equal(svgs.length, 2);
  for (const s of svgs) assert.match(s, /focusable="false"/);
  assert.match(detail, /ue-reward-category" data-item-glyph="' \+ glyph\.kind \+ '" aria-hidden="true"/);
});

/* C: Form chip clipped in the 34px picture box */
test('Research tab: the form-art badge is hidden visually in the picture box and shown whole under the name', () => {
  assert.match(redesign, /\.rs-rewards \.ue-reward-art \.form-chip\{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect\(0 0 0 0\)/);
  assert.match(redesign, /\.rs-rewards \.research-reward:has\(\.ue-reward-art \.form-chip\)>span:last-child::after\{content:"Form art unavailable";[^}]*white-space:normal/);
});

/* D: banner crop */
test('Schedule banner: 2:1 box with the crop anchored near the top so a top-left logo is not cut off', () => {
  assert.match(css, /\.evc-banner\{[^}]*aspect-ratio:2\/1/);
  assert.match(css, /\.evc-banner img\{[^}]*object-fit:cover;object-position:50% 10%\}/);
  assert.match(dash, /width="320" height="160" decoding="async" loading="lazy" data-err="prm"/);
});
