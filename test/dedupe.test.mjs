import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { collapseWorld } from "../scripts/importer/world.mjs";
import { audit } from "../scripts/dup-audit.mjs";
const dd = createRequire(import.meta.url)("../public/dedupe.js");
const ev = (id, name, place, start, end) => ({ id, name, place, start, end, scope: "regional", sources: [{ id: "s", name: "S", url: "u:" + id }] });
const verdict = (a, b, gaz) => dd.same(a, b, gaz).verdict;

test("the doubles Dylan reported are joined", () => {
  assert.equal(verdict(ev("1", "City Safari - Boston", "Boston, USA", "2026-10-24", "2026-10-25"), ev("2", "Pokémon GO City Safari: Boston Update", "Boston, USA", "2026-10-24", "2026-10-25")), "same");
  assert.equal(verdict(ev("1", "Orionids Meteor Shower: Minior Debut", "", "2026-10-19T17:00", "2026-10-24T23:59"), ev("2", "Explore by starlight during meteor showers for a chance to encounter Minior!", "", "2026-10-19", "2026-10-24")), "same");
  assert.equal(verdict(ev("1", "Pokemon GO Lab...Big Adventure", "Tokyo, Japan", "2026-10-07", "2026-10-07"), ev("2", "Pokémon GO Lab: Big Adventure", "Tokyo, Japan", "2026-10-07", "2026-10-07")), "same");
  assert.equal(verdict(ev("1", "Pokémon GO partners with the European Space Agency", "Europe", "2026-10-04", "2027-04-30"), ev("2", "Pokemon GO x ESA", "London, UK", "2026-10-04", "2076-04-30")), "same");
});

test("different events are kept apart", () => {
  const gaz = { mexico: 1, sendai: 1, tohoku: 1 };
  assert.equal(verdict(ev("1", "GO Wild Area 2026 Mexico City", "Mexico City, Mexico", "2026-11-06", "2026-11-08"), ev("2", "GO Wild Area 2026 Sendai Tohoku", "Sendai and Tohoku, Japan", "2026-11-06", "2026-11-08")), "different");
  assert.equal(verdict({ name: "GO Wild Area: Sendai", start: "2026-11-06", end: "2026-11-08" }, ev("2", "GO Wild Area 2026 Mexico City", "Mexico City, Mexico", "2026-11-06", "2026-11-08"), gaz), "different");
  assert.equal(verdict({ name: "GO Wild Area: Sendai", start: "2026-11-06", end: "2026-11-08" }, ev("2", "GO Wild Area 2026 Sendai Tohoku", "Sendai and Tohoku, Japan", "2026-11-06", "2026-11-08"), gaz), "same");
  assert.equal(verdict(ev("1", "Halloween 2026, Part One", "", "2026-10-27", "2026-11-01"), ev("2", "Halloween 2026, Part Two", "", "2026-11-01", "2026-11-05")), "different"); // different days
  assert.equal(verdict(ev("1", "Minior Showers: Leonids", "", "2026-11-14", "2026-11-19"), ev("2", "Minior Showers: Geminids", "", "2026-12-11", "2026-12-16")), "different");
  assert.equal(verdict(ev("1", "Super Mega Raid Day", "", "2026-10-31", "2026-10-31"), ev("2", "Super Mega Raid Day", "", "2026-11-28", "2026-11-28")), "different");
});

test("rulings override the rule both ways", () => {
  const a = ev("a", "Harvest Festival", "", "2026-10-01", "2026-10-05"), b = ev("b", "Rescue Shadow Zekrom during Harvest Festival", "", "2026-10-02", "2026-10-05");
  assert.equal(dd.judge(a, b, { different: [["a", "b"]] }).verdict, "different");
  assert.equal(dd.judge(ev("x", "One", "", "2026-01-01", "2026-01-02"), ev("y", "Totally other", "", "2026-01-01", "2026-01-02"), { same: [["x", "y"]] }).verdict, "same");
});

test("collapseWorld joins duplicates, merges sources and fixes a typo end year", () => {
  const { events, merged } = collapseWorld([
    ev("w-pokemon-go-x-esa", "Pokemon GO x ESA", "London, UK", "2026-10-04", "2076-04-30"),
    ev("w-partners-esa", "Pokémon GO partners with the European Space Agency", "Europe", "2026-10-04", "2027-04-30"),
    ev("w-other", "Something else entirely", "Paris, France", "2026-10-04", "2026-10-05"),
  ]);
  assert.equal(events.length, 2); assert.equal(merged.length, 1);
  const esa = events.find(e => /esa|partners/.test(e.id));
  assert.equal(esa.end, "2027-04-30"); assert.equal(esa.sources.length, 2);
});

test("audit reports odd dates and lists both-list matches separately", () => {
  const r = audit([ev("w1", "GO Wild Area 2026 Sendai Tohoku", "Sendai and Tohoku, Japan", "2026-11-06", "2026-11-08"), ev("w2", "Long thing", "X", "2026-10-01", "2036-10-01")], [{ id: "sendai", t: "GO Wild Area: Sendai", s: "2026-11-06T10:00", e: "2026-11-08T18:00" }], null, "2026-10-15");
  assert.equal(r.crossList.length, 1); assert.equal(r.same.length, 0); assert.equal(r.odd.length, 1);
});

test("a country-level stop and the city-level stop of the same series and dates are one event", () => {
  const w = [
    { id: "a", name: "Pokémon RUN 30", place: "Malaysia", start: "2026-11-21", end: "2026-11-22", sources: [{ url: "1" }] },
    { id: "b", name: "Pokémon RUN 30: Kuala Lumpur", place: "Kuala Lumpur, Malaysia (KLCC)", start: "2026-11-21", end: "2026-11-22", sources: [{ url: "2" }] },
    { id: "c", name: "Pokémon RUN 30: Singapore", place: "Singapore", start: "2026-11-07", end: "2026-11-08", sources: [{ url: "3" }] },
  ];
  const r = collapseWorld(w, null);
  assert.equal(r.events.length, 2);
});

test("titleKey: the same live event worded two ways gets one key, distinct events keep distinct keys", () => {
  const k = dd.titleKey;
  // Part I / Part One, leading "Pokémon GO", comma
  assert.equal(k("POKÉMON GO HALLOWEEN 2026 PART I"), k("HALLOWEEN 2026, PART ONE"));
  // word order and brackets
  assert.equal(k("GIRATINA (ORIGIN FORME) RAID HOUR"), k("ORIGIN FORME GIRATINA RAID HOUR"));
  // negatives: same slot type, different Pokémon / different part / different series
  assert.notEqual(k("Pikachu Spotlight Hour"), k("Eevee Spotlight Hour"));
  assert.notEqual(k("Halloween 2026, Part One"), k("Halloween 2026, Part Two"));
  assert.notEqual(k("Dynamax Sableye Max Monday"), k("Mega Sableye in Mega Raids"));
  assert.notEqual(k("Giratina (Altered Forme) Raid Hour"), k("Giratina (Origin Forme) Raid Hour"));
});

test("the Now tab joins live events by titleKey, not by exact title", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../public/dash.js", import.meta.url), "utf8");
  assert.match(src, /GODEDUPE\.titleKey\(s\)/);
  assert.match(src, /GODEDUPE\.titleKey\(a\) === GODEDUPE\.titleKey\(b\)/);
});

// ---- Which infographics belong to a card (GODEDUPE.findEventInfo) ----
import { readFileSync } from "node:fs";
const info = JSON.parse(readFileSync(new URL("../public/event-info.json", import.meta.url), "utf8")).events;
const pics = (card) => (dd.findEventInfo(card, info) || {}).infographics?.length || 0;

test("infographic lookup: real cards that used to show 'no infographic' now find theirs", () => {
  // Curated copy "cur:halloween1" is filed under the live id "leekduck:halloween-2026-part-1" with a differently worded title.
  assert.equal(pics({ id: "cur:halloween1", name: "Halloween 2026, Part One" }), info["leekduck:halloween-2026-part-1"].infographics.length);
  // A merged card keeps the live id but the pictures are filed under the curated id (cur:wag): both are pooled.
  const merged = { id: "leekduck:pokemon-go-wild-area-2026-global", aliasIds: ["cur:wag"], name: "Pokémon GO Wild Area 2026: Global" };
  const union = new Set([...info["cur:wag"].infographics, ...info["leekduck:pokemon-go-wild-area-2026-global"].infographics].map((g) => g.url));
  assert.equal(pics(merged), union.size);
  assert.ok(union.size > 1);
  assert.equal(pics({ id: "leekduck:pokemon-go-wild-area-2026-global", name: "Pokémon GO Wild Area 2026: Global" }), 1, "without the alias only the live entry is found");
  // Pictures filed under the bare slug, card id carries a prefix, and the reverse.
  assert.equal(pics({ id: "cur:trek", name: "x" }), 2);
  assert.equal(pics({ id: "leekduck:trek", name: "x" }), 2);
  // The article address in the card's link joins it to the live entry.
  assert.equal(pics({ id: "cur:spirits", name: "Nothing alike", link: "https://leekduck.com/events/dynamax-uxie-mesprit-azelf-max-battle-day-2026/" }), 3);
  // Case and punctuation in titles do not matter.
  assert.equal(pics({ id: "w-x", name: "YVELTAL IN 5-STAR RAID BATTLES!" }), info["yveltal-oct-2026"].infographics.length);
});

test("infographic lookup: genuinely missing stays missing", () => {
  assert.equal(dd.findEventInfo({ id: "cur:space", name: "World Space Week" }, info), null);
  assert.equal(pics({ id: "cur:zorua", name: "Zorua Community Day" }), 0);
  assert.equal(dd.findEventInfo({}, {}), null);
  assert.equal(dd.findEventInfo(null, null), null);
});

test("infographic lookup: a later instance of a recurring event does not inherit the earlier one's pictures", () => {
  const oct = { id: "cur:smr1", name: "Super Mega Raid Day", start: new Date("2026-10-31T14:00"), end: new Date("2026-10-31T17:00") };
  const nov = { id: "cur:smr2", name: "Super Mega Raid Day", start: new Date("2026-11-28T14:00"), end: new Date("2026-11-28T17:00"), link: "https://leekduck.com/events/super-mega-raid-day-november-2026/" };
  const others = [oct, nov];
  assert.ok(info.smr1.infographics.length >= 2);
  assert.equal(pics(oct), info.smr1.infographics.length, "October matches smr1 by id");
  // Known limitation: with no date information at all (no event list, no month in the entry's id) the title fallback cannot tell instances apart.
  // Once the October card has dropped off the lists, the November card inherits October's pictures until entries carry a date field.
  assert.equal(dd.findEventInfo(nov, info, [nov]).infographics.length, info.smr1.infographics.length, "documented limitation: earlier instance gone from the lists");
  assert.equal(dd.findEventInfo(nov, info, others), null, "November is owned-elsewhere: smr1 belongs to the October card");
  assert.equal(dd.findEventInfo(oct, info, others).infographics.length, info.smr1.infographics.length);
  // Even when the October card is no longer listed, a month/year in the entry's own id says it is another instance.
  const yv = { id: "w-next", name: "Yveltal in 5-Star Raid Battles", start: new Date("2026-12-10T10:00"), end: new Date("2026-12-10T11:00") };
  assert.equal(dd.findEventInfo(yv, info, []), null, "yveltal-oct-2026 is two months before this card");
  assert.equal(dd.findEventInfo({ ...yv, start: new Date("2026-10-08T10:00") }, info, []).infographics.length, info["yveltal-oct-2026"].infographics.length, "same month still matches");
  // A repeat Community Day: the earlier card (id "zorua") owns the entry by id.
  const zOld = { id: "cur:zorua", name: "Zorua Community Day", start: new Date("2026-10-11T14:00"), end: new Date("2026-10-11T17:00") };
  const zNew = { id: "cur:zorua2", name: "Zorua Community Day", start: new Date("2027-02-14T14:00"), end: new Date("2027-02-14T17:00") };
  const fake = { zorua: { names: ["Zorua Community Day"], infographics: [{ url: "/img/ext/z.webp" }] } };
  assert.equal(dd.findEventInfo(zNew, fake, [zOld, zNew]), null);
  assert.equal(dd.findEventInfo(zOld, fake, [zOld, zNew]).infographics.length, 1);
});

test("infographic lookup: genuine title matches still work with the event list given", () => {
  const h1 = { id: "cur:halloween1", name: "Halloween 2026, Part One", start: new Date("2026-10-27T10:00"), end: new Date("2026-11-01T10:00") };
  const h2 = { id: "cur:halloween2", name: "Halloween 2026, Part Two", start: new Date("2026-11-01T10:00"), end: new Date("2026-11-05T10:00") };
  assert.equal(dd.findEventInfo(h1, info, [h1, h2]).infographics.length, info["leekduck:halloween-2026-part-1"].infographics.length);
  assert.equal(dd.findEventInfo(h2, info, [h1, h2]).infographics.length, info["leekduck:halloween-2026-part-2"].infographics.length);
  // The live "leekduck:" copy is a separate card with the same dates: it does not block the curated card.
  const live = { id: "leekduck:halloween-2026-part-1", name: "Pokémon GO Halloween 2026 Part I", start: h1.start, end: h1.end };
  assert.equal(dd.findEventInfo(h1, info, [h1, live]).infographics.length, info["leekduck:halloween-2026-part-1"].infographics.length);
  // Wild Area Global pools its four pictures through the alias; no list needed.
  const wag = { id: "leekduck:pokemon-go-wild-area-2026-global", aliasIds: ["cur:wag"], name: "Pokémon GO Wild Area 2026: Global", start: new Date("2026-11-20"), end: new Date("2026-11-22") };
  assert.equal(dd.findEventInfo(wag, info, [wag]).infographics.length, 4);
});

test("regional infographic data stays linked to its source event", () => {
  const world = JSON.parse(readFileSync(new URL("../public/world-events.json", import.meta.url), "utf8"));
  const mexico = world.events.find((e) => e.id === "w-pok-mon-go-dia-de-muertos-2026-mexico-exclusive-ev");
  assert.ok(mexico, "Mexico event remains in the regional event feed");
  assert.ok((mexico.sources || []).some((s) => /^https:\/\//.test(s.url || "")), "regional event retains a source link");
  assert.ok(Date.parse(mexico.start) <= Date.parse(mexico.end), "regional event date range remains valid");
  const entry = info[mexico.id];
  assert.ok(entry, "regional event keeps its infographic metadata");
  assert.ok(entry.infographics?.some((g) => g.source === "G47IX" && /^\/infographics\//.test(g.url)), "approved infographic remains attached to the exact regional event ID");
});

test("infographic card button wiring: thumbnail, Check infographic, merged-card aliases", () => {
  const read = (f) => readFileSync(new URL("../public/" + f, import.meta.url), "utf8");
  const ig = read("infographic.js"), dash = read("dash.js"), css = read("dash.css");
  assert.match(dash, /data-igcard="' \+ esc\(ev\.id\)/);
  assert.match(dash, /var ig = isReg \? '<button type="button" class="agx agig" data-igcard=/, "regional agenda rows must be wired to the shared infographic resolver");
  assert.match(dash, /regionalEvents: function \(\)/, "the infographic resolver must be able to find regional event IDs");
  assert.match(dash, /liveEvent\.aliasIds = \(liveEvent\.aliasIds \|\| \[\]\)\.concat\(\[c\.id\]\)/);
  assert.match(dash, /hit\.aliasIds = /);
  assert.match(ig, /setAttribute\('loading', 'lazy'\)/);
  assert.match(ig, /width', '44'/);
  assert.match(ig, /Check infographic/);
  assert.match(ig, /No infographic found yet/);
  assert.match(ig, /loadInfo\(true\)/);
  assert.match(ig, /cache: fresh \? 'reload'/);
  assert.match(css, /button\.igthumb\{width:44px;height:44px;min-height:44px/);
});

test("infographic lookup: month hints match whole words only, and the card's month is read as shown", () => {
  const entry = (id) => ({ [id]: { names: ["Spotlight Hour"], infographics: [{ url: "/img/ext/s.webp" }] } });
  const oct = { id: "w-x", name: "Spotlight Hour", start: new Date(2026, 9, 14, 10), end: new Date(2026, 9, 14, 11) };
  // "marvel-2026" is not March 2026 (which would wrongly reject an October card); "october-2026" really is October.
  assert.equal(dd.findEventInfo(oct, entry("marvel-2026"), []).infographics.length, 1);
  assert.equal(dd.findEventInfo(oct, entry("decorations-2026"), []).infographics.length, 1);
  assert.equal(dd.findEventInfo(oct, entry("october-2026"), []).infographics.length, 1);
  assert.equal(dd.findEventInfo(oct, entry("oct-2026"), []).infographics.length, 1);
  assert.equal(dd.findEventInfo(oct, entry("march-2026"), []), null);
  assert.equal(dd.findEventInfo(oct, entry("mar-2026"), []), null);
  assert.equal(dd.findEventInfo(oct, entry("spotlight-2026-03-10"), []), null, "a full date in the id still counts");
  assert.equal(dd.findEventInfo(oct, entry("spotlight-12026-03-100"), []).infographics.length, 1, "digits glued to a date are not a date");
  // Dec 1 at local midnight is December, not November (Date read in local time, as the card displays it).
  const dec = (start) => ({ id: "w-d", name: "Spotlight Hour", start, end: start });
  assert.equal(dd.findEventInfo(dec(new Date(2026, 11, 1, 0, 0)), entry("october-2026"), []), null, "December is two months after October");
  assert.equal(dd.findEventInfo(dec(new Date(2026, 11, 1, 0, 0)), entry("november-2026"), []).infographics.length, 1, "December is next to November");
  assert.equal(dd.findEventInfo(dec(new Date(2026, 10, 30, 23, 59)), entry("december-2026"), []).infographics.length, 1);
  // Date-only strings are read from the text.
  assert.equal(dd.findEventInfo(dec("2026-12-01"), entry("october-2026"), []), null);
  assert.equal(dd.findEventInfo(dec("2026-12-01"), entry("november-2026"), []).infographics.length, 1);
});
