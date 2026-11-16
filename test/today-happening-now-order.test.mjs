import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.GOEVENTART = require('../public/event-art.js');
const LOGIC = require('../public/today-logic.js');
const TODAY = require('../public/today.js');

/* "Happening now" order: tier 1 whole-game (official 3+ day multi-feature event, Community Day, Spotlight Hour),
   tier 2 raid / Max Battle rotations, tier 3 everything smaller; inside a tier the event that ends soonest is first. */
const now = Date.UTC(2026, 10, 16, 12);
const d = (m, day, h = 0, min = 0) => new Date(Date.UTC(2026, m - 1, day, h, min));
function ev(id, name, kind, start, end, extra = {}) {
  return { id, name, kind, start, end, region: '', featured: [], tags: [], status: 'community_reported', ...extra };
}

/* This week's live events, shaped like the Today feed (ids, kinds, tags and statuses as the merged feed produces them). */
const trails = ev('leekduck:dynamax-trails-2026', 'Dynamax Trails', 'event', d(11, 16, 10), d(11, 23, 20),
  { status: 'official_confirmed', tags: ['Max Battles', 'Dynamax', 'Max Particles', 'Power Spots'] });
const cresselia = ev('leekduck:cresselia-darkrai-in-5-star-raid-battles-november-2026', 'Cresselia and Darkrai in 5-star Raid Battles', 'raid', d(11, 16, 6), d(11, 24, 22),
  { tags: ['Raids', 'Shadow'], featured: [{ name: 'Cresselia', role: 'raid_boss' }, { name: 'Darkrai', role: 'raid_boss' }] });
const banette = ev('leekduck:mega-banette-in-mega-raids-november-2026', 'Mega Banette in Mega Raids', 'raid', d(11, 16, 6), d(11, 24, 22),
  { tags: ['Raids', 'Mega'], featured: [{ name: 'Mega Banette', role: 'raid_boss' }] });
const minior = ev('leekduck:minior-showers-leonids-2026', 'Minior Showers: Leonids 2026', 'event', d(11, 14, 17), d(11, 19, 23, 59));
const stamp = ev('w-pok-mon-go-stamp-rally-sendai-and-tohoku', 'Pokémon GO Stamp Rally: Sendai and Tohoku', 'person', d(11, 6, 1), d(11, 30, 14),
  { region: 'Sendai and Tohoku, Japan', status: 'official_confirmed', tags: ['In person'] });
const ids = list => list.map(e => e.id);

const ctx = live => ({ now, live, soon: [], week: [], regLive: [], regSoon: [], regWeek: [], boosts: { live: [], upcoming: [] }, seasons: [], done: [], hidden: [], ending: [],
  kindOf: () => ['Event', '#7c5cff'], overseas: () => false, dayLabel: () => 'Mon', fallbackArt: () => '', monArt: () => '' });
function renderedOrder(live) {
  const html = TODAY.render(ctx(live));
  const sec = html.slice(html.indexOf('id="t1-live"'));
  return [...sec.matchAll(/<article class="t1-card[^>]*data-id="([^"]+)"/g)].map(m => m[1]);
}

test("this week's order: Dynamax Trails, the raid rotations, then Minior Showers and the Stamp Rally", () => {
  const week = [minior, banette, stamp, cresselia, trails]; /* deliberately scrambled */
  const sorted = ids(LOGIC.happeningNowSort(week));
  assert.equal(sorted[0], trails.id);
  assert.deepEqual(new Set(sorted.slice(1, 3)), new Set([cresselia.id, banette.id]));
  assert.deepEqual(sorted.slice(3), [minior.id, stamp.id]);
  assert.deepEqual(renderedOrder(week), sorted, 'the Today markup follows the same order');
});

test('tiers for this week: Trails 1, raid rotations 2, Minior Showers and Stamp Rally 3', () => {
  assert.deepEqual([trails, cresselia, banette, minior, stamp].map(LOGIC.happeningNowTier), [1, 2, 2, 3, 3]);
});

test('a live Community Day (or Spotlight Hour) outranks a raid rotation, even one that ends sooner', () => {
  const raid = ev('r', 'Cresselia and Darkrai in 5-star Raid Battles', 'raid', d(11, 16, 6), d(11, 16, 14));
  const cd = ev('cd', 'Pawniard Community Day', 'cd', d(11, 16, 9), d(11, 16, 17), { status: 'official_confirmed' });
  const spot = ev('sp', 'Sobble Spotlight Hour', 'spot', d(11, 16, 11), d(11, 16, 13, 30));
  assert.equal(LOGIC.happeningNowTier(cd), 1);
  assert.equal(LOGIC.happeningNowTier(spot), 1);
  assert.deepEqual(ids(LOGIC.happeningNowSort([raid, cd])), ['cd', 'r']);
  assert.deepEqual(renderedOrder([raid, cd]), ['cd', 'r']);
  assert.deepEqual(ids(LOGIC.happeningNowSort([raid, spot])), ['sp', 'r']);
});

test('within a tier the event that ends soonest is first, whatever the input order', () => {
  const a = ev('a', 'Mega Banette in Mega Raids', 'raid', d(11, 16, 6), d(11, 24, 22));
  const b = ev('b', 'Shadow Raid Day', 'raid', d(11, 16, 6), d(11, 20, 22));
  const c = ev('c', 'Minior Showers: Leonids 2026', 'event', d(11, 14, 17), d(11, 19, 23, 59));
  const e = ev('e', 'Some Debut', 'event', d(11, 14, 17), d(11, 18, 10));
  assert.deepEqual(ids(LOGIC.happeningNowSort([a, b])), ['b', 'a']);
  assert.deepEqual(ids(LOGIC.happeningNowSort([b, a])), ['b', 'a']);
  assert.deepEqual(ids(LOGIC.happeningNowSort([c, e])), ['e', 'c']);
  assert.deepEqual(renderedOrder([a, b]), ['b', 'a']);
});

test('the tier rule needs every part: official, 3+ days, several feature tags, not a raid, not in person', () => {
  const T = extra => LOGIC.happeningNowTier({ ...trails, ...extra });
  assert.equal(T({}), 1);
  assert.equal(T({ status: 'community_reported' }), 3, 'not official');
  assert.equal(T({ end: d(11, 18, 10) }), 3, 'under 3 days');
  assert.equal(T({ tags: ['Max Battles'] }), 3, 'one feature tag');
  assert.equal(T({ tags: ['Event', 'Max Battles'] }), 3, 'the generic Event tag does not count');
  assert.equal(T({ region: 'Sendai, Japan' }), 3, 'regional');
  assert.equal(T({ kind: 'person' }), 3, 'in person');
  assert.equal(T({ kind: 'raid', name: 'Cresselia and Darkrai in 5-star Raid Battles' }), 2, 'an official, multi-day, multi-tag raid rotation stays a raid rotation');
  assert.equal(T({ kind: 'max', name: 'Dynamax Espurr during Max Monday', end: d(11, 17, 10) }), 2, 'Max Monday');
});
