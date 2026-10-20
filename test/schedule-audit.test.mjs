import test from "node:test";
import assert from "node:assert/strict";
import { parseList, audit } from "../scripts/schedule-audit.mjs";
const html = '<span class="event-header-item-wrapper" data-event-type="event" data-event-local-time="true" data-event-end-date="2026-10-24T23:59:00" data-event-start-date-check="2026-10-19T17:00:00"><a class="x" href="/events/minior-showers-orionids-2026/">x</a></span>'
  + '<span class="event-header-item-wrapper" data-event-type="raid-day" data-event-local-time="true" data-event-end-date="2026-10-31T17:00:00" data-event-start-date-check="2026-10-31T14:00:00"><a href="/events/super-mega-raid-day-october-2026/">y</a></span>'
  + '<span class="event-header-item-wrapper" data-event-type="go-battle-league" data-event-local-time="false" data-event-end-date="2026-10-13T20:00:00+00:00" data-event-start-date-check="2026-10-06T20:00:00+00:00"><a href="/events/gbl-x/">z</a></span>';
test("Leek Duck list is read with start, end and local-time flag", () => {
  const l = parseList(html);
  assert.equal(l.length, 3); assert.equal(l[0].start, "2026-10-19T17:00:00"); assert.equal(l[0].local, true); assert.equal(l[2].local, false);
});
test("audit reports a wrong time and an event we do not list, and ignores raids and league seasons", () => {
  const ours = [{ id: "minior", t: "Orionids Meteor Shower: Minior Debut", s: "2026-10-19T00:00", e: "2026-10-24T23:59", sourceUrl: "https://leekduck.com/events/minior-showers-orionids-2026/" }];
  const r = audit(ours, parseList(html));
  assert.deepEqual(r.problems.map(p => p.field), ["start"]);
  assert.deepEqual(r.missing.map(m => m.slug), ["super-mega-raid-day-october-2026"]);
});

test("two events with the same name are matched by date", () => {
  const l = parseList(html.replace("2026-10-31T14:00:00", "2026-10-31T14:00:00") + html.replace(/october-2026/, "november-2026").replace(/2026-10-31T(\d\d)/g, "2026-11-28T$1"));
  const r = audit([{ id: "a", t: "Super Mega Raid Day", s: "2026-11-28T14:00", e: "2026-11-28T17:00" }], l);
  assert.equal(r.problems.length, 0);
});

import { auditWorld, newAlerts } from "../scripts/schedule-audit.mjs";
test("world event dates are corrected from Leek Duck, and alerts are sent once", () => {
  const theirs = [{ slug: "into-the-wild-2026", type: "event", start: "2026-11-09T10:00:00", end: "2026-11-13T20:00:00", local: true }];
  const world = [{ id: "w-x", name: "Into the Wild", start: "2026-11-09", end: "2026-11-15", sources: [{ url: "https://leekduck.com/events/into-the-wild-2026/" }] }];
  const fixes = auditWorld(world, theirs);
  assert.deepEqual(fixes[0].to, ["2026-11-09", "2026-11-13"]);
  const res = { problems: [], worldFixes: fixes, missing: [{ slug: "far", start: "2030-01-01T00:00:00", end: "2030-01-02T00:00:00" }] };
  const a = newAlerts(res, [], new Date("2026-10-15"));
  assert.equal(a.length, 1);
  assert.equal(newAlerts(res, a.map(x => x.key), new Date("2026-10-15")).length, 0);
});

import { fuzzy } from "../scripts/schedule-audit.mjs";
test("same event under another name matches; a different event on a different date does not", () => {
  const T = (slug, start, end) => ({ slug, start, end });
  assert.ok(fuzzy("GO Wild Area 2026 Mexico City", "2026-11-06", "2026-11-08", T("pokemon-go-wild-area-2026-mexico-city", "2026-11-06T16:00:00+00:00", "2026-11-09T00:00:00+00:00")));
  assert.ok(fuzzy("Halloween 2026, Part One", "2026-10-27T10:00", "2026-11-01T10:00", T("halloween-2026-part-1", "2026-10-27T10:00:00", "2026-11-01T10:00:00")));
  assert.ok(fuzzy("Dynamax Uxie, Mesprit and Azelf", "2026-10-24", "2026-10-24", T("dynamax-uxie-mesprit-azelf-max-battle-day-2026", "2026-10-24T14:00:00", "2026-10-24T17:00:00")));
  assert.ok(fuzzy("Pokémon GO City Safari: Boston Update", "2026-10-24", "2026-10-25", T("pokemon-go-city-safari-boston-2026-rescheduled", "2026-10-24T10:00:00", "2026-10-25T18:00:00")));
  assert.ok(!fuzzy("Minior Showers: Leonids", "2026-11-14", "2026-11-19", T("minior-showers-geminids-2026", "2026-12-11T17:00:00", "2026-12-16T23:59:00")));
});

import { addMissing, prettyName } from "../scripts/schedule-audit.mjs";
test("an event missing from the app is added from Leek Duck's dates, once", () => {
  const world = [], now = new Date("2026-10-15T00:00:00Z");
  const miss = [{ slug: "minior-showers-geminids-2026", start: "2026-12-11T17:00:00", end: "2026-12-16T23:59:00" }, { slug: "far-away-2028", start: "2028-01-01T00:00:00", end: "2028-01-02T00:00:00" }, { slug: "utc-thing", start: "2026-11-01T00:00:00+00:00", end: "2026-11-02T00:00:00+00:00" }];
  const a = addMissing(world, miss, now);
  assert.equal(a.length, 1); assert.equal(a[0].name, "Minior Showers Geminids"); assert.equal(a[0].end, "2026-12-16"); assert.equal(a[0].sources[0].auto, true);
  assert.equal(addMissing(world, miss, now).length, 0);
  assert.equal(prettyName("pokemon-go-city-safari-boston-2026-rescheduled"), "Pokémon GO City Safari Boston");
});
