import test from "node:test";
import assert from "node:assert/strict";
import { venueStopsFromPage, entriesFromPage, mergeWorld, keepOldWorld, sameWriteupRulings, normUrl } from "../scripts/importer/world.mjs";

const L = (t, text) => ({ t, text });
const URL = "https://pokemongo.com/news/apac-mall-exploration-2026/";
const mall = {
  title: "Pokémon GO joins Pokémon 30th Anniversary Mall Exploration!", url: URL, source: "official",
  lines: [
    L("p", "Get ready! Celebrate with Pokémon GO at the Pokémon 30th Anniversary Mall Explorations event! Visit the venue locations during the event."),
    L("h", "Event Dates & Mall Locations"),
    L("p", "[Malaysia]"), L("li", "Ombak KLCC: October 1 – December 31, 2026"),
    L("p", "[Philippines]"), L("li", "SM Mall of Asia: October 1, 2026 – January 31, 2027"), L("li", "SM East Ortigas: October 23 – November 8, 2026"),
    L("p", "[Singapore]"), L("li", "Changi Airport: November 7, 2026 – February 28, 2027"), L("li", "Jewel: November 7, 2026 – January 31, 2027"),
    L("p", "[Hong Kong]"), L("li", "FESTIVAL WALK: November 9, 2026 – January 3, 2027"),
    L("p", "In-game Pokémon GO gameplay begins on November 9, ahead of the official opening on November 11."),
    L("p", "[Thailand]"), L("p", "Stay tuned for more updates!")
  ]
};

test("a venue list with a date range per venue gives one entry per venue, under its country", () => {
  const s = venueStopsFromPage(mall, "2026-10-27");
  assert.deepEqual(s.map(x => [x.name, x.place, x.start, x.end]), [
    ["Pokémon 30th Anniversary Mall Exploration: Ombak KLCC", "Malaysia (Ombak KLCC)", "2026-10-01", "2026-12-31"],
    ["Pokémon 30th Anniversary Mall Exploration: SM Mall of Asia", "Philippines (SM Mall of Asia)", "2026-10-01", "2027-01-31"],
    ["Pokémon 30th Anniversary Mall Exploration: SM East Ortigas", "Philippines (SM East Ortigas)", "2026-10-23", "2026-11-08"],
    ["Pokémon 30th Anniversary Mall Exploration: Changi Airport", "Singapore (Changi Airport)", "2026-11-07", "2027-02-28"],
    ["Pokémon 30th Anniversary Mall Exploration: Jewel", "Singapore (Jewel)", "2026-11-07", "2027-01-31"],
    ["Pokémon 30th Anniversary Mall Exploration: Festival Walk", "Hong Kong (Festival Walk)", "2026-11-09", "2027-01-03"]
  ]);
  assert.equal(s[5].area, "Asia");
  assert.deepEqual(entriesFromPage(mall, "2026-10-27").map(x => x.name), s.map(x => x.name));
});

test("a single venue line, or a list without a place heading, is not a venue list", () => {
  assert.deepEqual(venueStopsFromPage({ ...mall, lines: mall.lines.slice(0, 4) }, "2026-10-27"), []);
  assert.deepEqual(venueStopsFromPage({ ...mall, lines: [mall.lines[0], L("li", "Jewel: November 7, 2026 – January 31, 2027"), L("li", "Changi Airport: November 7, 2026 – February 28, 2027")] }, "2026-10-27"), []);
  assert.deepEqual(venueStopsFromPage({ ...mall, title: "This Week in Pokémon GO" }, "2026-10-27"), []);
});

test("separate stops of one write-up are never joined, but the same event from two pages still is", () => {
  const w = mergeWorld(venueStopsFromPage(mall, "2026-10-27"), { official: "Pokémon GO (official)" });
  assert.equal(w.length, 6);
  const two = mergeWorld([
    { name: "Dia de Muertos 2026", place: "Mexico", area: "Americas", scope: "regional", start: "2026-10-20", end: "2026-11-16", datesKnown: true, url: "https://a.test/x/", source: "official" },
    { name: "Dia de Muertos 2026", place: "Mexico", area: "Americas", scope: "regional", start: "2026-10-20", end: "2026-11-16", datesKnown: true, url: "https://b.test/x/", source: "serebii" }
  ], {});
  assert.equal(two.length, 1);
  assert.equal(two[0].sources.length, 2);
  const ids = sameWriteupRulings(w);
  assert.equal(ids.length, 15);
  assert.deepEqual(sameWriteupRulings(two), []);
});

test("an old entry on the watch list stays until its end date, other old entries lapse after 30 days", () => {
  const watchUrls = new Set([normUrl("https://pokemongo.com/news/save-the-date-go-tour-2027")]);
  const o = { id: "w-tour-la", name: "Tour: Los Angeles", start: "2027-02-19", end: "2027-02-21", seen: "2026-08-01", sources: [{ id: "official", name: "Pokémon GO (official)", url: "https://pokemongo.com/news/save-the-date-go-tour-2027/" }] };
  const ctx = { cutoff: "2026-10-13", today: "2026-10-27", now: Date.parse("2026-10-27"), watchUrls };
  assert.equal(keepOldWorld(o, ctx), true);
  assert.equal(keepOldWorld(o, { ...ctx, watchUrls: new Set() }), false, "not on the watch list: lapses");
  assert.equal(keepOldWorld({ ...o, end: "2026-10-20", start: "2026-10-18" }, ctx), false, "event already over");
  assert.equal(keepOldWorld({ ...o, start: "", end: "" }, ctx), false, "no known dates: no extension");
  assert.equal(keepOldWorld({ ...o, sources: [{ id: "serebii", name: "Serebii", url: "https://pokemongo.com/news/save-the-date-go-tour-2027/" }] }, ctx), false, "watch list needs an official source");
  assert.equal(keepOldWorld({ ...o, seen: "2026-10-20", sources: [{ id: "serebii", name: "Serebii", url: "x" }] }, ctx), false, "only official or auto sources are kept");
  assert.equal(keepOldWorld({ ...o, seen: "2026-10-20" }, { ...ctx, watchUrls: new Set() }), true, "seen within 30 days");
  assert.equal(keepOldWorld({ ...o, seen: "2026-10-20" }, { ...ctx, splitUrls: new Set([normUrl(o.sources[0].url)]) }), false, "its page now gives separate entries");
});
