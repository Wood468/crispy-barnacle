import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const GOLIB = createRequire(import.meta.url)('../public/lib.js');
const data = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'));
const t = s => Date.parse(s);

test('raid window state flips exactly at the start and end instants', () => {
  const s = t('2026-11-09T10:00:00Z'), e = t('2026-11-13T20:00:00Z');
  assert.deepEqual(GOLIB.raidWindowState(s, e, s - 1), { phase: 'soon', text: 'Starts in 1m' });
  assert.equal(GOLIB.raidWindowState(s, e, s).phase, 'live');
  assert.equal(GOLIB.raidWindowState(s, e, e - 1).text, 'Ends in 1m');
  assert.deepEqual(GOLIB.raidWindowState(s, e, e), { phase: 'ended', text: 'Ended' });
  assert.equal(GOLIB.raidWindowState(s, e, s + 6 * 36e5).text, 'Ends in 4d');
  assert.equal(GOLIB.raidWindowState(s, e, e - 3 * 864e5 - 2 * 36e5).text, 'Ends in 3d 2h');
  assert.equal(GOLIB.raidWindowState(NaN, e, s).phase, 'unknown');
  assert.equal(GOLIB.raidWindowState(e, s, s).phase, 'unknown');
});

test('max roster is only used for its own event and window', () => {
  const r = data.maxRosters;
  assert.ok(GOLIB.maxRosterFor(r, 'Into the Wild', t('2026-11-09T10:00'), t('2026-11-13T20:00')));
  assert.equal(GOLIB.maxRosterFor(r, 'Into the Wild', t('2027-01-01T00:00'), t('2027-01-02T00:00')), null);
  assert.equal(GOLIB.maxRosterFor(r, 'Dynamax Trails', t('2026-11-09T10:00'), t('2026-11-13T20:00')), null);
});

test('rotation data: boundaries follow the 6 am convention, event raids start with their event, no overlaps', () => {
  const rot = data.rotation.filter(r => r.s >= '2026-10-28').sort((a, b) => a.s.localeCompare(b.s));
  for (const r of rot) {
    assert.ok(r.s < r.e, r.s);
    if (r.event) assert.match(r.s, /T10:00$/, 'event-tied rotations start with the event at 10:00');
    else assert.match(r.s, /T06:00$/, 'weekly boss changes are 6 am local');
    assert.match(r.e, /T(22|20):00$/);
  }
  for (let i = 1; i < rot.length; i++) assert.ok(rot[i - 1].e <= rot[i].s, 'no overlapping windows ' + rot[i].s);
  const wild = rot.find(r => r.event === 'Into the Wild');
  assert.equal(wild.s, '2026-11-09T10:00'); assert.equal(wild.e, '2026-11-13T20:00');
  assert.deepEqual(wild.cp['Crowned Sword Zacian'], [2188, 2735]);
});

test('Max Battle roster for Into the Wild is tiered, dated inside the event and never claims shiny boosts', () => {
  const r = data.maxRosters.find(x => x.event === 'Into the Wild');
  assert.ok(r.sourceUrl.startsWith('https://leekduck.com/events/'));
  for (const tier of r.tiers) {
    assert.match(tier.tier, /^[1-5]★$/);
    if (tier.day) assert.ok(tier.day + 'T12:00' >= r.s && tier.day + 'T12:00' <= r.e, tier.day);
    for (const n of tier.names) assert.ok(tier.cp[n] > 0, n);
  }
  assert.deepEqual(r.tiers.filter(x => x.day).map(x => x.names.join('+')), ['Registeel', 'Regidrago', 'Latias+Latios']);
  assert.ok(!JSON.stringify(r).toLowerCase().includes('shiny'));
});
