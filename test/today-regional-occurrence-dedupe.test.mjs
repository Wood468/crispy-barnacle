import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';

const source = readFileSync(new URL('../public/dash.js', import.meta.url), 'utf8');
const DEDUPE = createRequire(import.meta.url)('../public/dedupe.js');
const start = source.indexOf('function t1Overseas(');
const end = source.indexOf('  var t1Signature', start);
assert.ok(start >= 0 && end > start, 'Today region normalizers and actual t1Ctx must exist');
const todayContextSource = source.slice(start, end);
const NOW = new Date('2026-11-14T12:00:00Z');
const START = new Date('2026-11-14T11:00:00Z');
const END = new Date('2026-11-14T16:00:00Z');

function card({ id = 'event', name = 'Pokémon Night Out', region = 'London, UK',
    start = START, end = END, kind = 'event', announced = true } = {}) {
  return { id, name, region, start, end, kind, announced };
}
function regional({ id = 'regional', name = 'Pokémon Night Out', place = 'London, UK',
    start = START, end = END, area = 'Europe' } = {}) {
  return { id, name, place, area, scope: 'regional', start, end,
    src: {url: 'https://pokemongo.com/news/fixture-only'} };
}

function actualToday(events, regionalEvents, {hiddenIds = [], doneIds = []} = {}) {
  const hidden = new Set(hiddenIds), done = new Set(doneIds);
  const scope = {
    EV: events, NOW, Date, window: { GODEDUPE: DEDUPE, GOEventRegistry: null, GOSEASON: null },
    GODEDUPE: DEDUPE, REGGAZ: {},
    phase: (e, t) => +e.end <= +t ? 'ended' : +e.start <= +t ? 'live' : 'soon',
    announced: e => e.announced !== false,
    isHidden: id => hidden.has(id),
    kindHidden: kind => kind === 'filtered',
    t1Done: () => ({}), t1Hidden: () => ({}),
    t1IsDone: (_map, id) => done.has(id), t1IsHidden: () => false,
    TL: {doneKey: (id, start) => id + '@' + new Date(start).toISOString()},
    regList: () => regionalEvents,
    regInPerson: () => true,
    LIB: {isGlobalEvent: e => e.scope === 'global'},
    fmtD: d => String(d), kindOf: () => ['Event', '#27a4b0'],
    monArt: () => '', placeholderArt: () => '',
    t1BoostRecords: () => ({live: [], upcoming: []}),
    GOSEASON: undefined
  };
  runInNewContext(todayContextSource + '\n;this.RESULT=t1Ctx(NOW);', scope);
  return scope.RESULT;
}
const ids = rows => Array.from(rows, item => item.id);

test('same title in London and Los Angeles remains two separate visible occurrences', () => {
  const ctx = actualToday(
    [card({id:'ev-la',region:'Los Angeles, USA'})],
    [regional({id:'reg-london',place:'London, UK'})]);
  assert.deepEqual(ids(ctx.live), ['ev-la']);
  assert.deepEqual(ids(ctx.regLive), ['reg-london']);
  assert.equal(ctx.regLive[0].overseas, true);
  assert.equal(ctx.regLive[0].place, 'London, UK');
});

test('different titles on the same Tokyo date and location are not deduplicated', () => {
  const ctx = actualToday(
    [card({id:'ev-tokyo',name:'Pokémon Night Out',region:'Tokyo, Japan'})],
    [regional({id:'reg-tokyo',name:'Pokémon Stamp Rally',place:'Tokyo, Japan'})]);
  assert.deepEqual(ids(ctx.live), ['ev-tokyo']);
  assert.deepEqual(ids(ctx.regLive), ['reg-tokyo']);
});

test('one identical source occurrence in EV and the regional listing displays only one Today card', () => {
  const ctx = actualToday(
    [card({id:'cur:london-night',region:'London, UK'})],
    [regional({id:'world:london-night',place:'London, UK'})]);
  assert.deepEqual(ids(ctx.live), ['cur:london-night']);
  assert.deepEqual(ids(ctx.regLive), []);
});

test('hidden, Done, filtered or unannounced EV cannot suppress an eligible regional occurrence', () => {
  const cases = [
    {event:card({id:'hidden-one'}), opts:{hiddenIds:['hidden-one']}},
    {event:card({id:'done-one'}), opts:{doneIds:['done-one']}},
    {event:card({id:'filtered-one',kind:'filtered'}), opts:{}},
    {event:card({id:'unannounced-one',announced:false}), opts:{}}
  ];
  for (const {event,opts} of cases) {
    const ctx=actualToday([event],[regional({id:'regional-keep'})],opts);
    assert.deepEqual(ids(ctx.regLive), ['regional-keep'], event.id);
    assert.deepEqual(ids(ctx.live), [], event.id);
  }
});

test('same city and title on a different date remains a distinct occurrence', () => {
  const ctx=actualToday(
    [card({start:new Date('2026-11-16T09:00:00Z'),end:new Date('2026-11-16T12:00:00Z')})],
    [regional({id:'london-today'})]);
  assert.deepEqual(ids(ctx.regLive), ['london-today']);
  assert.deepEqual(ids(ctx.week), ['event']);
});

test('the same city name in different countries is not enough to suppress a regional event', () => {
  const ctx=actualToday(
    [card({region:'London, Canada'})],
    [regional({id:'london-uk',place:'London, UK'})]);
  assert.deepEqual(ids(ctx.regLive), ['london-uk']);
});

test('invalid EV dates and unknown EV region do not suppress a valid overseas event', () => {
  const cases = [
    card({start:new Date(NaN),end:new Date(NaN)}),
    card({region:''})
  ];
  for (const event of cases) {
    const ctx=actualToday([event],[regional({id:'legitimate-overseas'})]);
    assert.deepEqual(ids(ctx.regLive),['legitimate-overseas']);
  }
});

test('same sourced London Night Out under aliased titles deduplicates despite missing EV region and a timezone gap', () => {
  const ctx = actualToday(
    [card({id:'leekduck:night-out-london', name:'Pokémon Night Out 2026 - London',
      region:'', start:new Date('2026-11-14T18:00:00Z'),
      end:new Date('2026-11-15T00:30:00Z')})],
    [regional({id:'world:night-out-london', name:'Pokémon Night Out events in Pokémon GO!: London',
      place:'London, UK', start:new Date('2026-11-14T11:00:00Z'),
      end:new Date('2026-11-14T16:00:00Z')})]);
  assert.deepEqual(ids(ctx.soon),['leekduck:night-out-london']);
  assert.deepEqual(ids(ctx.regLive), [], 'two source copies of one London event render once');
});

test('London event aliases without a region never hide Los Angeles or a second calendar date', () => {
  const fixture = card({id:'leekduck:night-out-london', name:'Pokémon Night Out 2026 - London',
    region:'',start:new Date('2026-11-14T18:00:00Z'),
    end:new Date('2026-11-15T00:30:00Z')});
  const elsewhere = actualToday([fixture],[regional({
    id:'regional-la',name:'Pokémon Night Out events in Pokémon GO!: Los Angeles',
    place:'Los Angeles, USA'
  })]);
  assert.deepEqual(ids(elsewhere.regLive), ['regional-la']);
  const later = actualToday([fixture],[regional({
    id:'regional-london-later',name:'Pokémon Night Out events in Pokémon GO!: London',
    place:'London, UK',start:new Date('2026-11-15T12:00:00Z'),
    end:new Date('2026-11-15T16:00:00Z')
  })]);
  assert.deepEqual(ids(later.regSoon), ['regional-london-later'],
    'distant same-title sessions are not silently deduplicated');
});

test('Today regional dedupe only considers displayed EV cards, never all source records', () => {
  assert.match(todayContextSource, /live\.concat\(soon,\s*week\)/);
  assert.doesNotMatch(todayContextSource, /evNames\[normT\(r\.name\)\]/);
  assert.doesNotMatch(todayContextSource, /evPlaces\.some/);
});
