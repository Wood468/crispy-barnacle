import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fromPage } from "../scripts/importer/world.mjs";

const require = createRequire(import.meta.url);
const LIB = require("../public/lib.js");
const ART = require("../public/event-art.js");
const A = require("../public/event-adapter.js");

const att = r => LIB.attendanceOf(r);

test("global timed research (Gigantamax Machamp) is Global even though it is filed as a regional record with no place", () => {
  const rec = { id: "w-go-wild-area-gigantamax-machamp-power-up-timed-res", name: "GO Wild Area Gigantamax Machamp Power Up Timed Research", place: "", area: "Worldwide", scope: "regional" };
  assert.equal(att(rec), "global");
  assert.equal(LIB.isInPersonWorldEvent(rec), false);
});

test("Wild Area: Global is Global while Wild Area: Mexico City stays in person", () => {
  assert.equal(att({ t: "GO Wild Area: Global", where: "Play from anywhere", region: "Global" }), "global");
  assert.equal(att({ name: "GO Wild Area: Global", place: "Play from anywhere", scope: "regional" }), "global");
  assert.equal(att({ name: "GO Wild Area: Mexico City", place: "Mexico City, Mexico", area: "Americas", scope: "regional" }), "in-person");
  assert.equal(att({ t: "GO Wild Area: Mexico City", where: "Mexico City, Mexico" }), "in-person");
});

test("Night Out, Go Fest city, Community Day and region-locked in-game events", () => {
  assert.equal(att({ name: "Pokémon GO Night Out", attendance: "in-person", location: "Osaka, Japan", timeZone: "Asia/Tokyo" }), "in-person");
  assert.equal(att({ name: "Pokémon GO Fest 2026: Osaka", location: "Osaka, Japan" }), "in-person");
  assert.equal(att({ name: "Community Day", scope: "worldwide_local" }), "global");
  assert.equal(att({ name: "Regional Day", scope: "regional", mode: "in-game", area: "Asia" }), "regional-in-game");
});

test("future overseas in-person events remain venue-bound despite Global wording", () => {
  const futureEvent = {
    name: "Pokémon GO Fest 2027: Global Special Edition in Kyoto",
    location: "Kyoto, Japan",
    timeZone: "Asia/Tokyo",
    scope: "regional"
  };
  assert.equal(att(futureEvent), "in-person");
  const adapted = A.adapt(futureEvent, null, {});
  assert.equal(adapted.attendance, "in-person");
  
  const worldwideLocalCommunityDay = { name: "Community Day", scope: "worldwide_local" };
  assert.equal(att(worldwideLocalCommunityDay), "global");

  const regionLockedInGame = { name: "Regional In-Game Challenge", scope: "regional", mode: "in-game", area: "Asia" };
  assert.equal(att(regionLockedInGame), "regional-in-game");
});

test("classification ignores titles: a future record decides by structured data only", () => {
  // Title is full of in-person words but the record is global with no location data.
  assert.equal(att({ name: "Safari Zone Night Out Go Fest Wild Area In-Person Tour", scope: "global" }), "global");
  assert.equal(att({ name: "Safari Zone Night Out Go Fest Wild Area In-Person Tour" }), "global");
  // Title says nothing, but the record is bound to a venue.
  assert.equal(att({ name: "Zorblax Summit", location: "Lisbon, Portugal" }), "in-person");
  assert.equal(att({ name: "Zorblax Summit", coordinates: { lat: 38.7, lng: -9.1 } }), "in-person");
  assert.equal(att({ name: "Zorblax Summit", place: "", area: "Worldwide", scope: "regional" }), "global");
});

test("catalogue adapter and themed card category follow the classifier, not the title", () => {
  const global = A.adapt({ id: "x1", name: "GO Wild Area: Gigantamax Machamp Timed Research", scope: "regional", area: "Worldwide", place: "", kind: "event", s: "2026-11-06T10:00", e: "2026-11-15T18:00" }, null, {});
  assert.equal(global.attendance, "");
  const venue = A.adapt({ id: "x2", name: "Zorblax Summit", location: "Lisbon, Portugal", s: "2026-11-06T10:00", e: "2026-11-06T18:00", timeZone: "Europe/Lisbon" }, null, {});
  assert.equal(venue.attendance, "in-person");
  const themeOf = ev => ART.resolve(ev, []).theme.key;
  assert.notEqual(themeOf({ name: "GO Wild Area: Global", kind: "event" }), "person");
  assert.notEqual(themeOf({ name: "Go Fest Global", kind: "event" }), "person");
  assert.equal(themeOf({ name: "Zorblax Summit", kind: "person" }), "person");
});

test("importer: a dated in-person-looking write-up with no venue is Global; one with a venue stays regional", () => {
  const lines = t => t.map(text => ({ text }));
  const g = fromPage({ title: "GO Wild Area: Gigantamax Machamp Power Up! Timed Research", url: "https://example.test/a", lines: lines(["Event dates: Friday, November 6 to Sunday, November 15, 2026", "Wild Area timed research for everyone."]) }, "2026-11-09");
  if (g) assert.equal(g.scope, "global");
  const r = fromPage({ title: "GO Wild Area: Mexico City", url: "https://example.test/b", lines: lines(["Event dates: November 6 to 8, 2026", "Mexico City, Mexico in-person event"]) }, "2026-11-09");
  if (r) assert.equal(LIB.attendanceOf(r), "in-person");
});
