import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const L = createRequire(import.meta.url)('../public/today-logic.js');

function memory() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), raw: m }; }

test('done key is event id plus occurrence start and is stable across Date/ISO inputs', () => {
  const a = L.doneKey('cur:raid-hour', '2026-11-11T08:00:00.000Z');
  assert.equal(a, 'cur:raid-hour@2026-11-11T08:00:00.000Z');
  assert.equal(L.doneKey('cur:raid-hour', new Date(Date.parse('2026-11-11T08:00:00Z'))), a);
  assert.equal(L.doneKey('cur:raid-hour', Date.parse('2026-11-18T08:00:00Z')), 'cur:raid-hour@2026-11-18T08:00:00.000Z');
  assert.equal(L.doneKey('', 'x'), '');
  assert.equal(L.doneKey('id', 'not a date'), '');
});

test('marking one occurrence done leaves the next occurrence visible, undo restores it, and it persists', () => {
  const s = memory(), now = Date.parse('2026-11-08T02:00:00Z');
  const start = '2026-11-11T08:00:00.000Z', next = '2026-11-18T08:00:00.000Z';
  const key = L.markDone(s, 'raid-hour', start, Date.parse(start) + 36e5, now);
  assert.ok(key);
  const reloaded = L.readDone(s);
  assert.equal(L.isDone(reloaded, 'raid-hour', start), true);
  assert.equal(L.isDone(reloaded, 'raid-hour', next), false);
  assert.equal(L.isDone(reloaded, 'other', start), false);
  assert.equal(L.undoDone(s, key), true);
  assert.equal(L.isDone(L.readDone(s), 'raid-hour', start), false);
  assert.equal(L.undoDone(s, key), false);
});

test('done storage never touches collection keys and tolerates corrupt or blocked storage', () => {
  const s = memory();
  s.setItem('gofn-dex-v1', '{"own":1}'); s.setItem('gofn-us-v1', '{"a":1}'); s.setItem('gofn-stamp', '5');
  L.markDone(s, 'e', '2026-11-08T00:00:00Z', null, 1);
  assert.equal(s.getItem('gofn-dex-v1'), '{"own":1}');
  assert.equal(s.getItem('gofn-us-v1'), '{"a":1}');
  assert.equal(s.getItem('gofn-stamp'), '5');
  s.setItem(L.DONE_KEY, '{broken');
  assert.deepEqual(L.readDone(s), {});
  const blocked = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  assert.deepEqual(L.readDone(blocked), {});
  assert.equal(L.markDone(blocked, 'e', '2026-11-08T00:00:00Z', null, 1) !== undefined, true);
});

test('old done entries are pruned a week after the occurrence ended', () => {
  const now = Date.parse('2026-11-30T00:00:00Z');
  const pruned = L.pruneDone({ 'a@x': { at: 1, end: now - 8 * 864e5 }, 'b@y': { at: 1, end: now - 864e5 }, 'c@z': { at: 1, end: null } }, now);
  assert.deepEqual(Object.keys(pruned).sort(), ['b@y', 'c@z']);
});

test('shiny boost needs an explicit boost field; ordinary availability is never a boost', () => {
  assert.equal(L.shinyKind({ shiny: true }), 'available');
  assert.equal(L.shinyKind({ canBeShiny: true, label: 'Costume' }), 'available');
  assert.equal(L.shinyKind({ type: 'boosted-shiny', label: 'BOOSTED SHINY · Electrike' }), 'boosted');
  assert.equal(L.shinyKind({ boostedShiny: true }), 'boosted');
  assert.equal(L.shinyKind({ shiny: true, label: 'Increased shiny chance' }), 'boosted');
  assert.equal(L.shinyKind({ shiny: true, label: 'Shiny available' }), 'available');
  assert.equal(L.shinyKind({ shiny: 'unknown' }), 'none');
  assert.equal(L.shinyKind({ boostedShiny: null, shiny: 'no' }), 'none');
  assert.equal(L.shinyKind({ label: 'New shiny' }), 'debut');
  assert.equal(L.shinyKind(null), 'none');
});

test('multi-boss strings split into separate names without breaking parenthesised forms', () => {
  assert.deepEqual(L.splitNames('Giratina and Dialga'), ['Giratina', 'Dialga']);
  assert.deepEqual(L.splitNames('Gengar, Venusaur and Charizard'), ['Gengar', 'Venusaur', 'Charizard']);
  assert.deepEqual(L.splitNames('Pikachu (hat and capelet)'), ['Pikachu (hat and capelet)']);
  assert.deepEqual(L.splitNames('Mega Charizard X and Y'), ['Mega Charizard X', 'Mega Charizard Y']);
  assert.deepEqual(L.splitNames('Mega Venusaur & Shadow Tornadus'), ['Mega Venusaur', 'Shadow Tornadus']);
  assert.deepEqual(L.splitNames('Kyogre'), ['Kyogre']);
  assert.deepEqual(L.splitNames(''), []);
});

test('form art classifier marks special forms exact and never allows a silent base substitute', () => {
  const c = n => L.classifyArt(n);
  assert.equal(c('Mega Charizard X').kind, 'mega'); assert.equal(c('Mega Charizard X').label, 'Mega X'); assert.equal(c('Mega Charizard X').exact, true); assert.equal(c('Mega Charizard X').base, 'Charizard');
  assert.equal(c('Primal Kyogre').kind, 'primal'); assert.equal(c('Primal Kyogre').exact, true);
  assert.equal(c('Gigantamax Duraludon').kind, 'gigantamax'); assert.equal(c('Gigantamax Duraludon').exact, true);
  assert.equal(c('Alolan Ninetales').kind, 'regional'); assert.equal(c('Alolan Ninetales').label, 'Alolan');
  assert.equal(c('Shadow Tornadus').kind, 'shadow'); assert.equal(c('Dynamax Dialga').kind, 'dynamax');
  assert.equal(c('Giratina (Altered Forme)').kind, 'form'); assert.equal(c('Giratina (Altered Forme)').exact, true);
  assert.equal(c('Pikachu (hat and capelet)').exact, true);
  assert.equal(c('Eevee').exact, false);
  assert.equal(L.classifyArt({ name: 'Pikachu', costume: true, label: 'Top Hat' }).kind, 'costume');
  assert.deepEqual(L.artFallback(c('Mega Charizard X')), { show: 'base-with-label', chip: 'Form art unavailable' });
  assert.equal(L.artFallback(c('Eevee')).chip, '');
  assert.equal(L.artFallback(L.classifyArt({ name: 'Pikachu', costume: true })).chip, 'Costume art unavailable');
});

test('all 28 Unown glyphs remain exact in UI, matching the Worker art resolver', () => {
  const glyphs = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '!', '?'];
  assert.equal(glyphs.length, 28);
  for (const glyph of glyphs) {
    const form = glyph === '!' ? 'exclamation' : glyph === '?' ? 'question' : glyph.toLowerCase();
    const aliases = [
      'Unown ' + glyph,
      'Unown (' + glyph + ')',
      'Unown ' + glyph + ' (' + form + ')',
      'Unown (' + glyph + ' Form)'
    ];
    if (glyph === '!') aliases.push('Unown Exclamation', 'Unown (Exclamation Mark)');
    if (glyph === '?') aliases.push('Unown Question', 'Unown (Question Mark)');
    for (const name of aliases) {
      const art = L.classifyArt(name);
      assert.equal(art.kind, 'form', name);
      assert.equal(art.exact, true, name);
      assert.equal(art.base, 'Unown', name);
      assert.equal(art.form, glyph, name);
      assert.equal(art.label, 'Unown ' + glyph, name);
      assert.deepEqual(L.artFallback(art), { show: 'base-with-label', chip: 'Form art unavailable' }, name);
    }
  }
  assert.equal(L.classifyArt('Unown').exact, false, 'ordinary base Unown is not an invented explicit glyph');
  for (const name of ['Unown A (B)', 'Unown D (I)', 'Unown ! (?)', 'Unown ? (!)']) {
    const art = L.classifyArt(name);
    assert.equal(art.kind, 'form', name);
    assert.equal(art.exact, true, name);
    assert.equal(art.base, 'Unown', name);
    assert.equal(art.label, 'Unown form', name + ' must not claim either conflicting glyph');
    assert.equal(L.artFallback(art).chip, 'Form art unavailable', name);
  }
  assert.equal(L.classifyArt('Pikachu').exact, false, 'ordinary species remain ordinary');
});

test('venue zones: explicit tz wins, single-zone places resolve, multi-zone and worldwide do not', () => {
  assert.equal(L.venueZone({ tz: 'Asia/Tokyo', place: 'x' }), 'Asia/Tokyo');
  assert.equal(L.venueZone({ place: 'Sendai and Tohoku, Japan' }), 'Asia/Tokyo');
  assert.equal(L.venueZone({ place: 'Mexico City, Mexico' }), 'America/Mexico_City');
  assert.equal(L.venueZone({ place: 'London, Toulouse, Nuremberg, Valencia' }), '');
  assert.equal(L.venueZone({ place: 'Play from anywhere' }), '');
  assert.equal(L.venueZone({ tz: 'Not/AZone', place: 'Boston, USA' }), 'America/New_York');
});

test('dual time: Sendai (JST) alongside Melbourne (AEDT) with labels', () => {
  const range = { start: Date.parse('2026-11-06T10:00:00+09:00'), end: Date.parse('2026-11-06T18:00:00+09:00') };
  const t = L.dualTime(range, 'Asia/Tokyo', 'Australia/Melbourne');
  assert.match(t.viewer, /Fri 6 Nov, 12:00 pm – 8:00 pm AEDT/);
  assert.match(t.venue, /Fri 6 Nov, 10:00 am – 6:00 pm JST/);
  assert.equal(t.sameZone, false);
});

test('dual time is DST-safe: Melbourne offset to Tokyo is 2h in summer and 1h in winter', () => {
  const summer = L.dualTime({ start: Date.parse('2026-11-06T10:00:00+09:00'), end: Date.parse('2026-11-06T11:00:00+09:00') }, 'Asia/Tokyo', 'Australia/Melbourne');
  const winter = L.dualTime({ start: Date.parse('2026-07-06T10:00:00+09:00'), end: Date.parse('2026-07-06T11:00:00+09:00') }, 'Asia/Tokyo', 'Australia/Melbourne');
  assert.match(summer.viewer, /12:00 pm – 1:00 pm AEDT/);
  assert.match(winter.viewer, /11:00 am – 12:00 pm AEST/);
});

test('dual time across the Melbourne DST start and Mexico City (no DST since 2022)', () => {
  // Melbourne DST began 2026-10-04 02:00 local. Mexico City stays UTC-6 all year.
  const before = L.dualTime({ start: Date.parse('2026-10-03T08:00:00-06:00'), end: Date.parse('2026-10-03T09:00:00-06:00') }, 'America/Mexico_City', 'Australia/Melbourne');
  const after = L.dualTime({ start: Date.parse('2026-10-05T10:00:00-06:00'), end: Date.parse('2026-10-05T12:00:00-06:00') }, 'America/Mexico_City', 'Australia/Melbourne');
  const across = L.dualTime({ start: Date.parse('2026-10-03T09:00:00-06:00'), end: Date.parse('2026-10-03T10:00:00-06:00') }, 'America/Mexico_City', 'Australia/Melbourne');
  assert.match(before.viewer, /Sun 4 Oct, 12:00 am – 1:00 am AEST/);
  assert.match(after.viewer, /Tue 6 Oct, 3:00 am – 5:00 am AEDT/);
  assert.match(across.viewer, /Sun 4 Oct, 1:00 am AEST – 3:00 am AEDT/);
  assert.match(after.venue, /Mon 5 Oct, 10:00 am – 12:00 pm CST/);
});

test('same zone yields no separate venue line', () => {
  const t = L.dualTime({ start: 0, end: 36e5 }, 'Australia/Melbourne', 'Australia/Melbourne');
  assert.equal(t.venue, ''); assert.equal(t.sameZone, true);
});

test('date-only venue events keep the venue calendar days and convert known daily hours', () => {
  const v = L.venueDays('2026-11-06', '2026-11-08', 'Asia/Tokyo', 'Australia/Melbourne', { from: '10:00', to: '18:00' });
  assert.equal(v.days, 'Fri 6 Nov – Sun 8 Nov');
  assert.equal(v.venueHours, '10:00 am – 6:00 pm JST');
  assert.match(v.viewerLine, /12:00 pm – 8:00 pm AEDT/);
  const none = L.venueDays('2026-11-06', '2026-11-08', 'America/Mexico_City', 'Australia/Melbourne');
  assert.equal(none.viewerLine, ''); assert.equal(none.venueLabel, 'CST');
});

test('countdown text', () => {
  const now = Date.parse('2026-11-08T00:00:00Z');
  assert.equal(L.countdownText(now + 2 * 36e5 + 5 * 6e4, now, false), 'Starts in 2h 5m');
  assert.equal(L.countdownText(now + 26 * 36e5, now, false), 'Starts in 1d 2h');
  assert.equal(L.countdownText(now + 8 * 36e5 + 12 * 6e4, now, true), 'Ends in 8h 12m');
  assert.equal(L.countdownText(now - 1, now, true), 'Ended');
});

test('card types: majors, raids and minor rows', () => {
  const t = (kind, name, span = 36e5, featuredCount = 0) => L.cardType({ kind, name, span, featuredCount });
  assert.equal(t('cd', 'Pawniard Community Day', 3 * 36e5), 'major');
  assert.equal(t('person', 'GO Wild Area: Sendai', 2 * 864e5), 'major');
  assert.equal(t('global', 'GO Wild Area: Global', 2 * 864e5, 1), 'major');
  assert.equal(t('global', 'GO Tour: Global', 2 * 864e5, 0), 'major');
  assert.equal(t('event', 'Into the Wild', 4 * 864e5, 3), 'major');
  assert.equal(t('event', 'Two-feature celebration', 2 * 36e5, 2), 'major');
  assert.equal(t('event', 'Minior Showers: Leonids', 5 * 864e5, 1), 'minor');
  assert.equal(t('event', 'Long-running single reward', 8 * 864e5, 0), 'minor');
  assert.equal(t('debut', 'One-Pokémon debut', 4 * 864e5, 1), 'minor');
  assert.equal(t('raid', 'Giratina (Altered Forme) in 5-star Raid Battles', 4 * 864e5), 'raid');
  assert.equal(t('raid', 'Cresselia Raid Hour'), 'raid');
  assert.equal(t('max', 'Max Monday: Pokémon to be announced', 15 * 36e5), 'raid');
  assert.equal(t('spot', 'Grookey Spotlight Hour'), 'minor');
  assert.equal(t('event', 'Short bonus', 3 * 36e5), 'minor');
});

test('venue bonus times attach only to the event they belong to (real-shaped Night Out London record)', () => {
  const london = { name: 'Pokémon Night Out 2026 - London', date: '2026-11-11', zone: 'GMT', timeZone: 'Etc/UTC', note: 'expected, Pokémon GO hours not confirmed yet' };
  const items = [london];
  // Sendai, Mexico City and the Global Wild Area share no name with it.
  for (const name of ['Pokémon GO Wild Area 2026: Sendai • Tohoku', 'Pokémon GO Wild Area 2026: Mexico City', 'GO Wild Area: Global'])
    assert.deepEqual(L.matchVenueTimes(items, { name, start: '2026-11-06', end: '2026-11-08' }), []);
  assert.equal(L.matchVenueTimes(items, { name: 'Pokémon Night Out 2026 - London', start: '2026-11-11', end: '2026-11-11' }).length, 1);
  // Same three-word prefix but a different city or an unrelated date never matches.
  assert.deepEqual(L.matchVenueTimes(items, { name: 'Pokémon Night Out 2026 - Los Angeles', start: '2026-11-11', end: '2026-11-11' }), []);
  assert.deepEqual(L.matchVenueTimes(items, { name: 'Pokémon Night Out 2026 - London', start: '2026-12-20', end: '2026-12-20' }), []);
  assert.equal(L.venueTimeUnconfirmed(london), true);
  assert.equal(L.venueTimeUnconfirmed({ note: '' }), false);
});

test('venue zones for single-zone European and Asian places; multi-zone stays unknown', () => {
  assert.equal(L.venueZone({ place: 'London, UK' }), 'Europe/London');
  assert.equal(L.venueZone({ place: 'Karlsruhe, Germany (Ettlinger Tor)' }), 'Europe/Berlin');
  assert.equal(L.venueZone({ place: 'Philippines (SM East Ortigas)' }), 'Asia/Manila');
  assert.equal(L.venueZone({ place: 'Europe' }), '');
  assert.equal(L.venueZone({ place: 'Indonesia' }), '');
  assert.equal(L.venueZone({ place: '' }), '');
});

test('boost evidence: real-shaped data.json highlight records classify; availability-only records do not', async () => {
  const fs = await import('node:fs');
  const data = JSON.parse(fs.readFileSync(new URL('../public/data.json', import.meta.url)));
  const hl = data.events.flatMap(e => e.highlights || []);
  const boosted = hl.filter(h => h.type === 'boosted-shiny');
  assert.ok(boosted.length >= 2, 'fixture has real boosted-shiny highlights');
  boosted.forEach(h => assert.equal(L.shinyKind(h), 'boosted'));
  hl.filter(h => h.type !== 'boosted-shiny' && !/shiny/i.test(h.label)).forEach(h => assert.notEqual(L.shinyKind(h), 'boosted'));
  // The catalogue records "increased shiny chance" event text without per-Pokémon attribution: no tile may be inferred from it.
  assert.equal(L.shinyKind({ shiny: 'yes', boostedShiny: null, name: 'Palkia' }), 'available');
  assert.equal(L.shinyKind({ shiny: 'unknown', boostedShiny: null }), 'none');
});

test('Done boundaries: one occurrence only, across midnight and multi-day events, recurring next occurrence reappears', () => {
  const s = memory();
  const wed = '2026-11-11T08:00:00.000Z', nextWed = '2026-11-18T08:00:00.000Z';
  L.markDone(s, 'raid-hour', wed, Date.parse(wed) + 36e5, Date.parse('2026-11-11T07:00:00Z'));
  // A Melbourne day change (UTC+11 midnight) does not alter the key or its state.
  const afterMidnight = L.readDone(s);
  assert.equal(L.isDone(afterMidnight, 'raid-hour', wed), true);
  assert.equal(L.isDone(afterMidnight, 'raid-hour', nextWed), false);
  // A three-day event keeps one key for its whole run, however many days it is viewed on.
  const start = '2026-11-06T01:00:00.000Z', end = Date.parse('2026-11-08T09:00:00Z');
  L.markDone(s, 'wild-area', start, end, Date.parse('2026-11-06T02:00:00Z'));
  for (const day of ['2026-11-06', '2026-11-07', '2026-11-08']) assert.equal(L.isDone(L.readDone(s), 'wild-area', start), true, day);
  // Another event with the same start is unaffected; the entry survives for a week after it ends, then is pruned.
  assert.equal(L.isDone(L.readDone(s), 'other', start), false);
  const later = L.pruneDone(L.readDone(s), end + 8 * 864e5);
  assert.equal(L.isDone(later, 'wild-area', start), false);
  assert.equal(L.isDone(L.pruneDone(L.readDone(s), end + 864e5), 'wild-area', start), true);
});

test('research reward wording: field rewards are alternatives, timed and special rewards are all given', () => {
  assert.equal(L.researchRewardLabel('field', 3), 'One of 3 possible rewards');
  assert.equal(L.researchRewardLabel('field', 1), '1 possible reward');
  assert.equal(L.researchRewardLabel('timed', 3), '3 rewards');
  assert.equal(L.researchRewardLabel('special', 1), '1 reward');
});

/* ---- storage that throws: no false success, nothing lost, recovery once storage works again ---- */
function flaky() {
  const data = new Map();
  const s = {
    failing: false, reads: false,
    getItem(k) { if (s.reads) throw new DOMException('denied', 'SecurityError'); return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { if (s.failing) throw new DOMException('full', 'QuotaExceededError'); data.set(k, String(v)); },
    removeItem(k) { data.delete(k); },
    data
  };
  return s;
}
const START = '2026-11-08T00:00:00Z';
test('markDone does not report success when setItem throws, keeps existing data, and recovers', () => {
  const s = flaky();
  assert.equal(L.tryMarkDone(s, 'a', START, null, 1).ok, true);
  const before = s.data.get(L.DONE_KEY);
  s.failing = true;
  const res = L.tryMarkDone(s, 'b', START, null, 2);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'storage');
  assert.equal(L.markDone(s, 'b', START, null, 2), '', 'wrapper must not return a key when nothing was saved');
  assert.equal(s.data.get(L.DONE_KEY), before, 'existing Done data must be byte-identical');
  assert.equal(L.isDone(L.readDone(s), 'b', START), false);
  s.failing = false;
  const again = L.tryMarkDone(s, 'b', START, null, 3);
  assert.equal(again.ok, true);
  assert.equal(L.isDone(L.readDone(s), 'b', START), true);
  assert.equal(L.isDone(L.readDone(s), 'a', START), true);
});
test('undoDone reports failure and keeps the entry when setItem throws', () => {
  const s = flaky();
  const key = L.markDone(s, 'a', START, null, 1);
  const before = s.data.get(L.DONE_KEY);
  s.failing = true;
  assert.deepEqual(L.tryUndoDone(s, key), { ok: false, removed: false, error: 'storage' });
  assert.equal(L.undoDone(s, key), false);
  assert.equal(s.data.get(L.DONE_KEY), before);
  s.failing = false;
  assert.equal(L.tryUndoDone(s, key).removed, true);
  assert.equal(L.isDone(L.readDone(s), 'a', START), false);
});
test('unreadable storage (SecurityError on read) is never overwritten', () => {
  const s = flaky(); s.reads = true;
  assert.equal(L.tryMarkDone(s, 'a', START, null, 1).ok, false);
  assert.equal(s.data.size, 0);
  assert.equal(L.tryUndoDone(s, 'a@x').ok, false);
});
test('a corrupt Done value is kept as a copy before it is replaced, and never replaced if the copy fails', () => {
  const s = flaky();
  s.data.set(L.DONE_KEY, '{broken');
  assert.deepEqual(L.readDone(s), {});
  assert.equal(L.readDoneState(s).corrupt, true);
  assert.equal(L.tryMarkDone(s, 'a', START, null, 1).ok, true);
  assert.equal(s.data.get(L.DONE_KEY + '-corrupt'), '{broken');
  const s2 = flaky();
  s2.data.set(L.DONE_KEY, '[1,2');
  const realSet = s2.setItem; s2.setItem = (k, v) => { if (k.includes('-corrupt')) throw new DOMException('full', 'QuotaExceededError'); return realSet(k, v); };
  assert.equal(L.tryMarkDone(s2, 'a', START, null, 1).ok, false);
  assert.equal(s2.data.get(L.DONE_KEY), '[1,2', 'corrupt value must be left untouched when no copy can be kept');
});

test('Crowned Sword and Shield are exact artwork forms, not base-species pictures', () => {
 for (const [name, base, label] of [
  ['Crowned Sword Zacian','Zacian','Crowned Sword'],
  ['Crowned Shield Zamazenta','Zamazenta','Crowned Shield']
 ]) {
  const form=L.classifyArt(name);
  assert.equal(form.exact,true);
  assert.equal(form.kind,'form');
  assert.equal(form.base,base);
  assert.equal(form.label,label);
  assert.equal(L.artFallback(form).chip,'Form art unavailable');
 }
 assert.equal(L.classifyArt('Crowned Shield Zacian').exact,false,'invalid species/form pairing must not be accepted');
});
