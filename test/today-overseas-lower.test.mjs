import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';

/* Owner decision (20 Nov 2026): overseas in-person events stay visible on Today but sit below
   Australian and global events in Happening now / Starting soon / Next 7 days. Order only. */
const source = readFileSync(new URL('../public/dash.js', import.meta.url), 'utf8');
const DEDUPE = createRequire(import.meta.url)('../public/dedupe.js');
const start = source.indexOf('function t1Overseas(');
const end = source.indexOf('  var t1Signature', start);
assert.ok(start >= 0 && end > start, 'actual t1Ctx must exist');
const code = source.slice(start, end);
const NOW = new Date('2026-11-14T12:00:00Z');
const H = 36e5;
const at = h => new Date(+NOW + h * H);

function reg(id, place, startH, endH, extra = {}) {
  return { id, name: 'Event ' + id, place, area: 'x', scope: 'regional', start: at(startH), end: at(endH),
    src: { url: 'https://pokemongo.com/news/fixture-only' }, ...extra };
}
function ctxFor(regionalEvents) {
  const scope = {
    EV: [], NOW, Date, window: { GODEDUPE: DEDUPE, GOEventRegistry: null, GOSEASON: null },
    GODEDUPE: DEDUPE, REGGAZ: {},
    phase: () => 'ended', announced: () => true, isHidden: () => false, kindHidden: () => false,
    t1Done: () => ({}), t1Hidden: () => ({}), t1IsDone: () => false, t1IsHidden: () => false,
    TL: { doneKey: (id, s) => id + '@' + new Date(s).toISOString() },
    regList: () => regionalEvents, regInPerson: e => e.scope !== 'global',
    LIB: { isGlobalEvent: e => e.scope === 'global' },
    fmtD: d => String(d), kindOf: () => ['Event', '#27a4b0'],
    monArt: () => '', specialArt: () => '', placeholderArt: () => '', t1BoostRecords: () => ({ live: [], upcoming: [] })
  };
  runInNewContext(code + '\n;this.RESULT=t1Ctx(NOW);', scope);
  return scope.RESULT;
}
const ids = rows => Array.from(rows, r => r.id);

test('overseas rows go after Australian and global rows in each of live, soon and week; nothing dropped', () => {
  const input = [
    reg('l-jp', 'Tokyo, Japan', -2, 5), reg('l-vic', 'Melbourne, Victoria', -2, 5), reg('l-glob', 'Singapore', -2, 5, { scope: 'global', mode: 'in-game' }),
    reg('s-uk', 'London, UK', 3, 9), reg('s-syd', 'Sydney, Australia', 4, 9),
    reg('w-us', 'Los Angeles, USA', 48, 60), reg('w-bne', 'Brisbane', 50, 60), reg('w-de', 'Berlin, Germany', 52, 60)
  ];
  const c = ctxFor(input);
  assert.deepEqual(ids(c.regLive), ['l-vic', 'l-glob', 'l-jp']);
  assert.deepEqual(ids(c.regSoon), ['s-syd', 's-uk']);
  assert.deepEqual(ids(c.regWeek), ['w-bne', 'w-us', 'w-de']);
  assert.equal(c.regLive.length + c.regSoon.length + c.regWeek.length, input.length, 'counts unchanged');
});

test('relative order is preserved inside the local group and inside the overseas group', () => {
  const c = ctxFor([
    reg('a-jp', 'Osaka, Japan', -5, 5), reg('b-vic', 'Melbourne', -4, 5), reg('c-uk', 'Leeds, UK', -3, 5),
    reg('d-perth', 'Perth, Australia', -2, 5), reg('e-us', 'Chicago, USA', -1, 5), reg('f-adl', 'Adelaide', -1, 5)
  ]);
  assert.deepEqual(ids(c.regLive), ['b-vic', 'd-perth', 'f-adl', 'a-jp', 'c-uk', 'e-us']);
});

test('an all-overseas list keeps its original order and every row still says overseas', () => {
  const c = ctxFor([reg('x1', 'Paris, France', -3, 5), reg('x2', 'Seoul, Korea', -2, 5), reg('x3', 'Rome, Italy', -1, 5)]);
  assert.deepEqual(ids(c.regLive), ['x1', 'x2', 'x3']);
  assert.ok(c.regLive.every(r => r.overseas === true), 'chip flag unchanged');
});

test('overseas events are demoted, not hidden: flags, place and in-person marker are untouched', () => {
  const c = ctxFor([reg('jp', 'Kyoto, Japan', -1, 9), reg('mel', 'Melbourne', -1, 9)]);
  assert.deepEqual(ids(c.regLive), ['mel', 'jp']);
  const jp = c.regLive[1];
  assert.equal(jp.overseas, true); assert.equal(jp.inPerson, true); assert.equal(jp.place, 'Kyoto, Japan');
  assert.equal(c.regLive[0].overseas, false);
});

test('the rule lives in one helper reusing t1Overseas and is applied to all three lists', () => {
  assert.match(source, /function t1OverseasLast\(items\)/);
  assert.match(source, /regLive = t1OverseasLast\(regLive\); regSoon = t1OverseasLast\(regSoon\); regWeek = t1OverseasLast\(regWeek\);/);
  assert.equal((source.match(/overseas: t1Overseas\(r\.place\)/g) || []).length, 1, 'no second overseas heuristic');
});
