import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { htmlToLines, pageTitle } from "../scripts/importer/text.mjs";
import { extractFields } from "../scripts/importer/extract.mjs";
import { mergeSources, similar, disagree } from "../scripts/importer/compare.mjs";
import { linksFrom, feedItems, discover } from "../scripts/importer/discover.mjs";
import { pickEvent, normaliseLegacyStatuses, preserveUnfetchedResearchTasks } from "../scripts/importer/run.mjs";

const leek = `<html><head><meta property="og:title" content="Zorua Community Day | Leek Duck"></head><body><nav>menu</nav><main>
<h1>Zorua Community Day</h1><h2>Bonuses</h2><ul><li>3&times; Catch XP</li><li>1/4 Hatch Distance</li></ul>
<h2>Featured Pok&eacute;mon</h2><ul><li>Zorua will appear more frequently in the wild</li></ul>
<h2>Shiny</h2><p>Shiny Zorua will be available.</p><h2>Tickets</h2><p>Special Research ticket: US$2.00</p></main><footer>x</footer></body></html>`;
const hub = `<main><h1>Zorua Community Day</h1><h2>Event bonuses</h2><ul><li>2× Catch XP</li><li>Quarter hatch distance</li><li>Lure modules last 3 hours</li></ul>
<h2>Wild encounters</h2><ul><li>Zorua will appear more frequently in the wild</li></ul></main>`;

test("html becomes headings and bullets, entities decoded, chrome removed", () => {
  const l = htmlToLines(leek);
  assert.equal(l[0].text, "Zorua Community Day"); assert.ok(l.some(x => x.t === "li" && x.text === "3× Catch XP"));
  assert.ok(!l.some(x => /menu/.test(x.text)));
  assert.equal(pageTitle(leek), "Zorua Community Day");
});
test("fields are pulled by what the heading says", () => {
  const f = extractFields(leek);
  assert.ok(f.bonuses.includes("3× Catch XP")); assert.ok(f.shiny.some(s => /Shiny Zorua/.test(s))); assert.ok(f.tickets.some(s => /US\$2/.test(s)));
  assert.ok(f.featured.some(s => /more frequently/.test(s)));
});
test("similar wording agrees; a different multiplier disagrees", () => {
  assert.equal(similar("Zorua will appear more frequently in the wild", "Zorua will appear more frequently in the wild."), true);
  assert.equal(disagree("3× Catch XP", "2× Catch XP"), true); assert.equal(disagree("3× Catch XP", "3× Catch XP"), false);
});
test("merging marks agreement, single-source details, conflicts and gaps", () => {
  const S = (id, trust) => ({ id, name: id, trust, url: "https://x.test/" + id });
  const m = mergeSources([{ source: S("leekduck", "community"), fields: extractFields(leek) }, { source: S("hub", "community"), fields: extractFields(hub) }]);
  const feat = m.fields.featured.find(x => /more frequently/.test(x.text));
  assert.equal(feat.status, "corroborated"); assert.deepEqual(feat.sources.sort(), ["hub", "leekduck"]);
  assert.equal(m.fields.bonuses.find(x => /Lure modules/.test(x.text)).status, "single");
  assert.equal(m.conflicts.length, 1); assert.match(m.conflicts[0].a.text + m.conflicts[0].b.text, /3×.*2×|2×.*3×/);
  assert.ok(m.gaps.some(g => g.field === "shiny" && g.missingFrom.includes("hub")));
});
test("legacy multi-source labels preserve official evidence and normalize community agreement", () => {
  const old = {
    status: "confirmed",
    sources: [{ id: "official", trust: "official" }, { id: "hub", trust: "community" }, { id: "leekduck", trust: "community" }],
    fields: { bonuses: [
      { text: "Official and community sources agree.", sources: ["official", "hub"], status: "confirmed" },
      { text: "Community sources agree.", sources: ["hub", "leekduck"], status: "confirmed" }
    ] },
    note: "This detail has not been confirmed by the game."
  };
  assert.deepEqual(normaliseLegacyStatuses(old), {
    status: "official",
    sources: [{ id: "official", trust: "official" }, { id: "hub", trust: "community" }, { id: "leekduck", trust: "community" }],
    fields: { bonuses: [
      { text: "Official and community sources agree.", sources: ["official", "hub"], status: "official" },
      { text: "Community sources agree.", sources: ["hub", "leekduck"], status: "corroborated" }
    ] },
    note: "This detail has not been confirmed by the game."
  });
  assert.equal(normaliseLegacyStatuses({ status: "confirmed", sources: [{ id: "hub" }, { id: "leekduck" }] }).status, "corroborated");
});

test("an official source keeps official status when community sources agree", () => {
  const m = mergeSources([{ source: { id: "official", trust: "official" }, fields: { bonuses: ["Double Stardust"], featured: [], raids: [], eggs: [], research: [], shiny: [], moves: [], costumes: [], tickets: [], dates: [] } }, { source: { id: "hub", trust: "community" }, fields: { bonuses: ["Double Stardust"], featured: [], raids: [], eggs: [], research: [], shiny: [], moves: [], costumes: [], tickets: [], dates: [] } }]);
  assert.equal(m.fields.bonuses[0].status, "official");
});
test("discovery reads links and feeds, keeps only event write-ups, and survives a failing source", async () => {
  assert.equal(linksFrom('<a href="/events/zorua-cd/">Zorua CD</a><a href="/about/">About</a>', "https://leekduck.com/events/").length, 2);
  assert.equal(feedItems("<rss><channel><item><title><![CDATA[Zorua Community Day]]></title><link>https://pokemongohub.net/post/event/zorua-community-day/</link></item></channel></rss>")[0].title, "Zorua Community Day");
  const fetcher = async u => { if (/leekduck/.test(u)) return '<a href="https://leekduck.com/events/zorua-community-day/">Zorua Community Day</a>'; throw new Error("HTTP 403"); };
  const r = await discover(fetcher);
  assert.equal(r.found.length, 1); assert.equal(r.found[0].source, "leekduck"); assert.match(r.status.official.error, /403/);
});
test("a page is tied to an event by its own link first, then a strong title match", () => {
  const evs = [
    { id: "a", t: "Zorua Community Day", link: "https://leekduck.com/events/zorua-community-day/", start: "2026-11-20T14:00", end: "2026-11-22T17:00" },
    { id: "b", t: "Sandile Hatch Day", link: "" }
  ];
  assert.equal(pickEvent({ url: "https://leekduck.com/events/zorua-community-day/", title: "x" }, evs).how, "linked");
  assert.equal(pickEvent({ url: "https://z.test/p/", title: "Sandile Hatch Day" }, evs).event.id, "b");
  assert.equal(pickEvent({ url: "https://z.test/p/", title: "Weekend vibes" }, evs), null);
});

test("Leek Duck detail IDs and part numbers keep companion event pages separate", () => {
  const events = [
    { id: "halloween1", t: "Pokémon GO Halloween 2026 Part One", link: "https://leekduck.com/events/halloween-2026-part-2/", start: "2026-10-27T10:00", end: "2026-11-01T10:00", detailIds: ["leekduck:halloween-2026-part-1"] },
    { id: "halloween2", t: "Pokémon GO Halloween 2026 Part Two", link: "https://leekduck.com/events/halloween-2026-part-2/", start: "2026-11-01T10:00", end: "2026-11-05T20:00", detailIds: ["leekduck:halloween-2026-part-2"] }
  ];
  const partOne = {
    source: "leekduck", url: "https://leekduck.com/events/halloween-2026-part-1/",
    title: "Pokémon GO Halloween 2026 Part I",
    fields: { dates: ["October 27, 2026 to November 1, 2026"] }
  };
  assert.equal(pickEvent(partOne, events).event.id, "halloween1", "the exact source detail ID wins over an ambiguous link");
  const hubPartTwo = {
    source: "hub", url: "https://pokemongohub.net/post/event/pokemon-go-halloween-2026-part-two/",
    title: "Pokémon GO Halloween 2026: Part Two",
    fields: { dates: ["November 1, 2026 to November 5, 2026", "October 27, 2026 to November 1, 2026"] }
  };
  assert.equal(pickEvent(hubPartTwo, events).event.id, "halloween2", "the part number disambiguates an article that mentions both event windows");
});

test("date evidence blocks a title or source-link match to a different event window", () => {
  const event = { id: "z", t: "Zorua Community Day", link: "https://leekduck.com/events/zorua-community-day/", start: "2026-11-21T14:00", end: "2026-11-21T17:00" };
  const events = [event];
  const matching = { url: "https://z.test/p/", title: "Zorua Community Day", fields: { dates: ["Saturday, November 21, 2026"] } };
  assert.equal(pickEvent(matching, events).event.id, "z", "same-day source evidence is accepted");

  const mismatch = { ...matching, fields: { dates: ["October 24, 2026"] } };
  assert.equal(pickEvent(mismatch, events), null, "a high-confidence title is not enough when known dates do not overlap");

  const multipleDates = { ...matching, fields: { dates: ["October 24, 2026", "November 21, 2026"] } };
  assert.equal(pickEvent(multipleDates, events).event.id, "z", "any extracted event-date range may establish overlap");

  const linkedMismatch = { ...mismatch, url: event.link };
  assert.equal(pickEvent(linkedMismatch, events), null, "an explicit URL does not override contradictory known dates");

  const lineMismatch = { ...matching, fields: { dates: [] }, lines: [{ text: "Event date: October 24, 2026" }] };
  assert.equal(pickEvent(lineMismatch, events), null, "calendar dates in article lines are used when no date field was extracted");

  const unknownDate = { url: "https://z.test/p/", title: "Zorua Community Day", fields: { dates: [] }, lines: [] };
  assert.equal(pickEvent(unknownDate, events).event.id, "z", "missing source dates remain unknown, not a false mismatch");

  const overlappingRange = { ...matching, fields: { dates: ["November 22, 2026"] } };
  const multiDay = { ...event, start: "2026-11-20T14:00", end: "2026-11-22T17:00" };
  assert.equal(pickEvent(overlappingRange, [multiDay]).event.id, "z", "a source date inside a multi-day event range is accepted");
});
test("fractions and 'double' are read as the same thing", () => {
  assert.equal(similar("1/4 Hatch Distance", "Quarter hatch distance"), true);
  assert.equal(disagree("Double Catch XP", "3x Catch XP"), true);
});
test("different bonuses that share filler words are not a conflict; noise lines are dropped", () => {
  assert.equal(disagree("3× XP for catching Pokémon.", "2× Candy for catching Pokémon."), false);
  assert.equal(disagree("3× Catch XP for catching Pokémon", "2× Catch XP during the event"), true);
  const f = extractFields("<h2>Bonuses</h2><ul><li>Tier 1 – Rank 10</li><li>And even more goodies!</li><li>Learn more about the event GO Pass below!</li><li>2× Candy for catching Pokémon.</li></ul>");
  assert.deepEqual(f.bonuses, ["Rank 10: 2× Candy for catching Pokémon."]);
});
test("the same bonus from different places is not a disagreement", () => {
  assert.equal(disagree("8× Max Particles from Power Spots", "2× Max Particles from exploring"), false);
});

import { parseDateRange, placeOf, fromPage, mergeWorld } from "../scripts/importer/world.mjs";
import { serebiiEvents } from "../scripts/importer/run.mjs";
test("dates are read in the shapes real posts use", () => {
  assert.deepEqual(parseDateRange("Saturday, October 24 and 25, 2026", 2026), { start: "2026-10-24", end: "2026-10-25" });
  assert.deepEqual(parseDateRange("Tuesday, October 27, at 10:00 a.m. to Sunday, November 1, 2026, at 8:00 p.m. local time", 2026), { start: "2026-10-27", end: "2026-11-01" });
  assert.deepEqual(parseDateRange("Oct 6–9", 2026), { start: "2026-10-06", end: "2026-10-09" });
  assert.deepEqual(parseDateRange("6 November 2026", 2026), { start: "2026-11-06", end: "2026-11-06" });
  assert.equal(parseDateRange("no date here"), null);
});
test("places and areas come from the title first", () => {
  assert.deepEqual(placeOf("Pokémon GO City Safari: Brisbane – Know Before You GO!", ""), { place: "Brisbane, Australia", area: "Oceania" });
  assert.equal(placeOf("PokéXciting! lands at Changi Airport and Jewel", "").area, "Asia");
  assert.equal(placeOf("Harvest Festival", "nothing"), null);
});
test("regional and new events are picked out of unmatched write-ups; routine ones are skipped", () => {
  const safari = { source: "official", url: "https://p.test/a/", title: "Pokémon GO City Safari: Boston – Know Before You GO! — Pokémon GO", fields: { dates: [] }, lines: [{ t: "p", text: "Join us October 24 and 25, 2026 in Boston." }] };
  const e = fromPage(safari, "2026-10-12");
  assert.equal(e.scope, "regional"); assert.equal(e.area, "Americas"); assert.equal(e.start, "2026-10-24"); assert.equal(e.end, "2026-10-25");
  const fest = fromPage({ source: "official", url: "https://p.test/b/", title: "Enjoy a bountiful Harvest Festival event!", fields: { dates: ["Tuesday, October 20, at 10:00 a.m. to Tuesday, October 27, 2026, at 8:00 p.m. local time"] }, lines: [] }, "2026-10-12");
  assert.equal(fest.scope, "global"); assert.equal(fest.start, "2026-10-20");
  assert.equal(fromPage({ source: "official", url: "https://p.test/c/", title: "Zorua Community Day", fields: { dates: [] }, lines: [] }), null);
});
test("the same event from two sources becomes one entry with both sources", () => {
  const w = mergeWorld([{ name: "City Safari: Boston", place: "Boston, USA", area: "Americas", scope: "regional", start: "2026-10-24", end: "2026-10-25", datesKnown: true, url: "https://a/", source: "official" }, { name: "GO City Safari Boston", place: "Boston, USA", area: "Americas", scope: "regional", start: "2026-10-24", end: "2026-10-25", datesKnown: true, url: "https://b/", source: "serebii" }], { official: "Pokémon GO (official)", serebii: "Serebii" });
  assert.equal(w.length, 1); assert.equal(w[0].sources.length, 2); assert.equal(w[0].status, "official");
});
test("Serebii's table rows become events", () => {
  const html = "<table><tr><td>GO Wild Area 2026: Mexico City</td><td>Mexico City, Mexico</td><td>November 6 - 8, 2026</td></tr><tr><td>Header</td><td>Place</td><td>Dates</td></tr></table>";
  const r = serebiiEvents(html, "2026-10-12");
  assert.equal(r.length, 1); assert.equal(r[0].start, "2026-11-06"); assert.equal(r[0].area, "Americas");
});
test("a year after the day range is honoured, and news roundups are not events", () => {
  assert.deepEqual(parseDateRange("November 7th - 8th 2020", 2026), { start: "2020-11-07", end: "2020-11-08" });
  assert.equal(fromPage({ source: "official", url: "https://p.test/d/", title: "This Week in Pokémon GO: 12-18 October 2026", fields: { dates: [] }, lines: [] }, "2026-10-12"), null);
});

test("milestone bonuses keep the rank that unlocks them", async () => {
  const { extractFields } = await import("../scripts/importer/extract.mjs");
  const html = `<main><h2>Milestone Bonuses</h2><h3>Tier 1 – Rank 1</h3><ul><li>One additional Candy for trading Pokémon.</li></ul><h3>Tier 2 – Rank 25</h3><ul><li>Open up to 40 Gifts per day.</li></ul><h2>Rank rewards</h2><table><tr><td>97</td><td>Kyogre Candy</td></tr></table></main>`;
  const f = extractFields(html);
  assert.ok(f.bonuses.includes("Rank 1: One additional Candy for trading Pokémon."), JSON.stringify(f.bonuses));
  assert.ok(f.bonuses.includes("Rank 25: Open up to 40 Gifts per day."));
  assert.ok(f.tickets.some(x => /^Rank 97: Kyogre Candy/.test(x)), JSON.stringify(f.tickets));
});

test("rank headings pick up bonuses held in plain blocks", () => {
  const lines = htmlToLines(`<main><h3>Tier 2 – Rank 25</h3><div class="b"><div>Open up to 40 Gifts per day.</div><div>Hold 10 more Gifts in your Item Bag.</div></div><h3>Lucky Trinket</h3></main>`);
  const f = extractFields(lines);
  assert.ok(f.bonuses.includes("Rank 25: Open up to 40 Gifts per day."), JSON.stringify(f.bonuses));
  assert.ok(f.bonuses.includes("Rank 25: Hold 10 more Gifts in your Item Bag."));
});

test("official, Leek Duck and Hub rank layouts all keep their rank", () => {
  const off = extractFields(htmlToLines(`<main><h2>Major Milestone Bonuses</h2><p>Tier 2 Bonus Starting at Rank 25</p><ul><li>Open up to 40 Gifts per day.</li></ul><p>Upgrade to the GO Pass Deluxe to strengthen the following bonus.</p><p>Tier 2 Bonus Starting at Rank 25</p><ul><li>Open up to 50 Gifts per day.</li></ul></main>`));
  assert.ok(off.bonuses.includes("Rank 25: Open up to 40 Gifts per day."), JSON.stringify(off.bonuses));
  assert.ok(off.bonuses.includes("Rank 25 Deluxe: Open up to 50 Gifts per day."));
  const hub = extractFields(htmlToLines(`<main><h2>Milestones</h2><p>Tier 3 (Rank 50) | 2× Daily Adventure Incense duration</p><h2>GO Pass Tasks and Rewards</h2><table><tr><td>3</td><td>Dynamax Bounsweet</td><td>5 × Bounsweet Candy</td></tr></table></main>`));
  assert.ok(hub.bonuses.includes("Rank 50: 2× Daily Adventure Incense duration"), JSON.stringify(hub.bonuses));
  assert.ok(hub.tickets.some(x => /^Rank 3: Free: Dynamax Bounsweet \| Deluxe: 5 × Bounsweet Candy$/.test(x)), JSON.stringify(hub.tickets));
});

test("Leek Duck GO Pass rank table rows with a separate RANK cell become track-specific rewards", () => {
  const html = '<main><h2>GO Pass: November</h2><table>' +
    '<tr><th>RANK</th><th>BASIC</th><th>DELUXE</th></tr>' +
    '<tr><td>RANK</td><td>1</td><td>Tier 1 GO Pass Bonus: One additional Candy for trading Pokémon</td><td>Tier 1 GO Pass Bonus: Guaranteed Candy XL when trading</td></tr>' +
    '<tr><td>RANK</td><td>2</td><td>XP ×10000</td><td>Stardust ×10000</td></tr>' +
    '<tr><td>RANK</td><td>100</td><td>Groudon (Level 20)</td><td>PokéCoin ×200</td></tr>' +
    '<tr><td>RANK</td><td>101</td><td>Stardust ×50</td><td>Stardust ×100</td></tr>' +
    '<tr><td>RANK</td><td>200</td><td>Stardust ×50</td><td>Stardust ×100</td></tr>' +
    '</table></main>';
  const lines = htmlToLines(html);
  assert.ok(lines.some(x => x.text === "RANK | 2 | XP ×10000 | Stardust ×10000"), JSON.stringify(lines));
  const f = extractFields(lines);
  assert.ok(f.tickets.includes("Rank 2: Free: XP ×10000 | Deluxe: Stardust ×10000"), JSON.stringify(f.tickets));
  assert.ok(f.tickets.includes("Rank 100: Free: Groudon (Level 20) | Deluxe: PokéCoin ×200"), JSON.stringify(f.tickets));
  assert.ok(f.tickets.includes("Rank 101: Free: Stardust ×50 | Deluxe: Stardust ×100"), JSON.stringify(f.tickets));
  assert.ok(f.tickets.includes("Rank 200: Free: Stardust ×50 | Deluxe: Stardust ×100"), JSON.stringify(f.tickets));
  assert.ok(!f.tickets.some(x => /^Rank 1:/.test(x)), "milestone rank 1 is not duplicated in the rank reward table");
  assert.ok(!f.tickets.includes("RANK | BASIC | DELUXE"), "table headers are not shown as reward details");
});

test("rank reward rows never count as source disagreements", () => {
  const mk = t => ({ source: { id: t, name: t, trust: "community" }, fields: { tickets: ["Rank 3: Free: 5 × Candy | Deluxe: 3 × Candy XL", "Rank 4: Free: 10 × Candy | Deluxe: 2 × Candy XL"], bonuses: [] } });
  assert.equal(mergeSources([mk("a"), mk("b")]).conflicts.length, 0);
});

import { stopsFromPage, entriesFromPage, IN_PERSON } from "../scripts/importer/world.mjs";
import { SOURCES, EVENT_WORDS } from "../scripts/importer/sources.mjs";
const runPage = { source: "official", url: "https://pokemongo.com/news/pokemon-run-30-2026/", title: "Pokémon RUN 30", fields: { dates: [] }, lines: [
  { text: "Join Pokémon RUN 30, an in-person event at venues across Asia." },
  { text: "Philippines: October 3–4, 2026, SM Mall of Asia" },
  { text: "Taiwan: October 17–18, 2026, Taichung Central Park" },
  { text: "Taiwan: October 31 – November 1, 2026, Dream Mall, Kaohsiung" },
  { text: "Taiwan: November 14–15, 2026, New Taipei Metropolitan Park" },
  { text: "Singapore: November 7–8, 2026, The Kallang" },
  { text: "Hong Kong: January 23–24, 2027, Science Park" },
] };
test("a multi-stop series becomes one entry per stop, each with its own city and dates", () => {
  const stops = stopsFromPage(runPage, "2026-10-17");
  assert.deepEqual(stops.map(s => s.name), ["Pokémon RUN 30: Philippines", "Pokémon RUN 30: Taichung", "Pokémon RUN 30: Kaohsiung", "Pokémon RUN 30: New Taipei", "Pokémon RUN 30: Singapore", "Pokémon RUN 30: Hong Kong"]);
  const t = stops.find(s => /Taichung/.test(s.name));
  assert.equal(t.start, "2026-10-17"); assert.equal(t.end, "2026-10-18"); assert.equal(t.area, "Asia"); assert.equal(t.scope, "regional");
  assert.equal(entriesFromPage(runPage, "2026-10-17").length, 6);
});
test("a page with one date range is not split, and news round-ups never are", () => {
  assert.deepEqual(stopsFromPage({ source: "official", url: "https://p.test/x/", title: "Go Tour", lines: [{ text: "Taipei: October 10–11, 2026, Expo hall" }] }, "2026-10-12"), []);
  assert.deepEqual(stopsFromPage({ ...runPage, title: "This Week in Pokémon GO" }, "2026-10-17"), []);
});
test("the same city twice in one series gets its dates in the name so ids stay unique", () => {
  const p = { source: "official", url: "https://p.test/s/", title: "Pokémon RUN Test", lines: [{ text: "Taipei: November 1–2, 2026, Park A" }, { text: "Taipei: December 6–7, 2026, Park B" }, { text: "Tokyo: January 9–10, 2027, Park C" }] };
  assert.deepEqual(stopsFromPage(p, "2026-10-17").map(s => s.name), ["Pokémon RUN Test: Taipei (2026-11-01)", "Pokémon RUN Test: Taipei (2026-12-06)", "Pokémon RUN Test: Tokyo"]);
});
test("the official Pokémon RUN 30 article passes discovery and counts as in person", () => {
  const off = SOURCES.find(s => s.id === "official");
  assert.ok(off.pattern.test("https://pokemongo.com/news/pokemon-run-30-2026/"));
  assert.ok(EVENT_WORDS.test("Pokémon RUN 30 https://pokemongo.com/news/pokemon-run-30-2026/"));
  assert.ok(IN_PERSON.test("Pokémon RUN 30"));
});

import { seriesName, mergeWorld as mergeW } from "../scripts/importer/world.mjs";
test("a long headline is shortened to the series name", () => {
  assert.equal(seriesName("Ready, set, GO! Join the Pokémon RUN 30 event near you!"), "Pokémon RUN 30");
  assert.equal(seriesName("Pokémon RUN 30"), "Pokémon RUN 30");
  assert.equal(seriesName("GO Wild Area: Sendai"), "GO Wild Area: Sendai");
});
test("two entries whose names slug the same still get different ids", () => {
  const e = (place, start) => ({ name: "A very long event name that is the same for every stop of the tour here", place, start, end: start, source: "x", url: "u" + place });
  const out = mergeW([e("Manila", "2026-10-03"), e("Taipei", "2026-10-17")], { x: "X" });
  assert.equal(new Set(out.map(o => o.id)).size, out.length);
});


test("the November GO Pass Leek Duck rank table is watched, matched exactly and parsed", () => {
  const watch = JSON.parse(readFileSync(new URL("../data/watch-pages.json", import.meta.url), "utf8"));
  const data = JSON.parse(readFileSync(new URL("../public/data.json", import.meta.url), "utf8"));
  const url = "https://leekduck.com/events/go-pass-november-2026/";
  assert.ok(watch.pages.some(p => String(p.url || "").replace(/\/?$/, "/") === url), "the rendered rank source stays on the importer watch list");

  const event = data.events.find(e => e.id === "gopassnov");
  assert.ok(event, "the November GO Pass event exists");
  assert.ok(event.detailIds.includes("leekduck:go-pass-november-2026"), "the source page is mapped by its exact Leek Duck detail ID");

  const html = '<html><head><meta property="og:title" content="GO Pass: November | Leek Duck"></head><body><main>' +
    '<h1>GO Pass: November</h1>' +
    '<p>From Tuesday, November 3, 2026, at 10:00 a.m. to Tuesday, December 1, 2026, at 10:00 a.m. local time.</p>' +
    '<h2>GO Pass: November</h2>' +
    '<table><tr><th>RANK</th><th>BASIC</th><th>DELUXE</th></tr>' +
    '<tr><td>RANK</td><td>100</td><td>Groudon (Level 20)</td><td>PokéCoin ×200</td></tr>' +
    '<tr><td>RANK</td><td>101</td><td>Stardust ×50</td><td>Stardust ×100</td></tr></table>' +
    '</main></body></html>';
  const lines = htmlToLines(html);
  const page = { source: "leekduck", url, title: pageTitle(html), fields: extractFields(lines), lines };
  const match = pickEvent(page, [{
    id: event.id, t: event.t, link: event.sourceUrl, start: event.s, end: event.e, detailIds: event.detailIds
  }]);
  assert.equal(match?.event.id, "gopassnov");
  assert.equal(match?.how, "detail-id");
  assert.ok(page.fields.tickets.includes("Rank 100: Free: Groudon (Level 20) | Deluxe: PokéCoin ×200"));
  assert.ok(page.fields.tickets.includes("Rank 101: Free: Stardust ×50 | Deluxe: Stardust ×100"));
});

test("GO Pass rank rows: Leek Duck's parsed table wins over another source's prose rank lines", () => {
  const empty = { bonuses: [], featured: [], raids: [], eggs: [], research: [], shiny: [], moves: [], costumes: [], dates: [] };
  const m = mergeSources([
    { source: { id: "leekduck", name: "Leek Duck", trust: "community" }, fields: { ...empty, tickets: ["Rank 77: Free: Gimmighoul Candy ×5 | Deluxe: Gimmighoul Candy ×20", "Rank 78: Free: Gimmighoul Candy ×5 | Deluxe: Gimmighoul Candy XL ×10"] } },
    { source: { id: "hub", name: "Pokémon GO Hub", trust: "community" }, fields: { ...empty, tickets: ["Rank 77: Free: 5 × Gimmighoul Candy | Deluxe: 520 × Gimmighoul Candy", "Rank 25: Half hatch distance for eggs incubated during the event", "Upgrade to the Deluxe pass for US$14.99"] } }
  ]);
  const ranks = m.fields.tickets.filter(x => /^Rank \d+/.test(x.text));
  assert.deepEqual(ranks.map(x => x.text), ["Rank 77: Free: Gimmighoul Candy ×5 | Deluxe: Gimmighoul Candy ×20", "Rank 78: Free: Gimmighoul Candy ×5 | Deluxe: Gimmighoul Candy XL ×10"]);
  assert.ok(m.fields.tickets.some(x => /US\$14\.99/.test(x.text)), "non-rank ticket lines from other sources are kept");
  // Without a Leek Duck table the other source's lines are still kept (nothing is invented or dropped).
  const hubOnly = mergeSources([{ source: { id: "hub", name: "Hub", trust: "community" }, fields: { ...empty, tickets: ["Rank 25: Half hatch distance"] } }]);
  assert.equal(hubOnly.fields.tickets.filter(x => /^Rank 25/.test(x.text)).length, 1);
});

// Regression: the Mexico City Wild Area write-up (Nov 6-8) was merged into the global Into the Wild record (Nov 9-13),
// so Into the Wild showed Mexico City tickets, dates and "Choose one day" lines.
const wildEvents = [
  { id: "leekduck:into-the-wild-2026", t: "Into the Wild 2026", link: "https://leekduck.com/events/into-the-wild-2026/", start: "2026-11-09T10:00:00.000", end: "2026-11-13T20:00:00.000", detailIds: [] },
  { id: "leekduck:pokemon-go-wild-area-2026-global", t: "Pokémon GO Wild Area 2026: Global", link: "https://leekduck.com/events/pokemon-go-wild-area-2026-global/", start: "2026-11-14T10:00:00.000", end: "2026-11-15T18:00:00.000", detailIds: [] },
  { id: "sendai", t: "GO Wild Area: Sendai", link: "https://pokemongo.com/en/gowildarea/sendai", start: "2026-11-06T10:00", end: "2026-11-08T18:00", detailIds: ["leekduck:pokemon-go-wild-area-2026-sendai-japan"] }
];
const mexicoPage = {
  source: "leekduck", url: "https://leekduck.com/events/pokemon-go-wild-area-2026-mexico-city/", title: "Pokémon GO Wild Area 2026: Mexico City",
  fields: { dates: ["Dates: November 6, 7, or 8, 2026 Time: 10:00 a.m. – 6:00 p.m. local time (UTC−6) Location: Mexico City, Mexico", "Choose one day: November 6, 7, or 8. Mexico City ticket prices are subject to applicable taxes and fees."] },
  lines: [
    { text: "Dates: November 6, 7, or 8, 2026 Time: 10:00 a.m. – 6:00 p.m. local time (UTC−6) Location: Mexico City, Mexico" },
    { text: "This feature becomes more widely available starting with Into the Wild on November 9 ." },
    { text: "November 9, 2026, at 10:00 a.m. local time: The GO Wild Area 2026 Special Background and all previous backgrounds become available." }
  ]
};
test("a Mexico City Wild Area page never matches Into the Wild or the Global event", () => {
  assert.equal(pickEvent(mexicoPage, wildEvents), null, "no event for Mexico City: it stays its own in-person entry");
  // Even without any dates, the place in the title keeps it out of an event whose name has no such place.
  assert.equal(pickEvent({ ...mexicoPage, fields: {}, lines: [] }, wildEvents), null);
});
test("the Into the Wild page still matches Into the Wild, and Sendai keeps its own page", () => {
  const itw = { source: "leekduck", url: "https://leekduck.com/events/into-the-wild-2026/", title: "Into the Wild 2026", fields: { dates: ["Dates: November 9 to 13, 2026"] }, lines: [] };
  assert.equal(pickEvent(itw, wildEvents).event.id, "leekduck:into-the-wild-2026");
  const sendai = { source: "leekduck", url: "https://leekduck.com/events/pokemon-go-wild-area-2026-sendai-japan/", title: "Pokémon GO Wild Area 2026: Sendai • Tohoku", fields: { dates: ["Dates: November 6, 7, or 8, 2026"] }, lines: [] };
  assert.equal(pickEvent(sendai, wildEvents).event.id, "sendai");
});
test("a page's own Dates line decides the date overlap, not later events it mentions", () => {
  const ev = [{ id: "e1", t: "Wild Area Global", start: "2026-11-09T10:00", end: "2026-11-13T20:00", detailIds: [], link: "" }];
  const page = { source: "official", url: "https://example.invalid/x/", title: "Wild Area Global", fields: { dates: ["Dates: November 6, 7, or 8, 2026", "starting with Into the Wild on November 9"] }, lines: [] };
  assert.equal(pickEvent(page, ev), null);
});
test("separate ticketed days are read as one window", async () => {
  const { parseDateRange } = await import("../scripts/importer/world.mjs");
  assert.deepEqual(parseDateRange("Choose one day: November 6, 7, or 8. Mexico City tickets", 2026), { start: "2026-11-06", end: "2026-11-08" });
  assert.deepEqual(parseDateRange("October 24 and 25, 2026", 2026), { start: "2026-10-24", end: "2026-10-25" });
});

test("research rewards: an item bounded by its repeated quantity does not swallow the next encounter (Leek Duck flattened table)", () => {
  const f = extractFields('<h2>Field Research</h2><p>Win a raid POSSIBLE REWARDS Dratini Max CP 430 Min CP 397 ×2 Rare Candy ×2 Scyther Max CP 1160 Min CP 1104</p><p>Catch 3 Pawniard POSSIBLE REWARDS Pawniard Max CP 614 Min CP 574 ×5 Great Ball ×5 ×2 Ultra Ball ×2 ×2 Pinap Berry ×2 ×500 Stardust ×500</p>');
  assert.deepEqual(f.researchTasks[0].rewards.map(r => [r.type, r.name, r.quantity]), [["encounter", "Dratini", 1], ["item", "Rare Candy", 2], ["encounter", "Scyther", 1]]);
  assert.equal(f.researchTasks[0].rewards[2].cpMax, 1160);
  assert.deepEqual(f.researchTasks[1].rewards.map(r => r.name + ":" + r.quantity), ["Pawniard:1", "Great Ball:5", "Ultra Ball:2", "Pinap Berry:2", "Stardust:500"]);
});

test("a page linked from a feed-derived twin is attached to the curated record with the same name and dates", () => {
  const evs = [
    { id: "leekduck:into-the-wild-2026", t: "Into the Wild 2026", link: "https://leekduck.com/events/into-the-wild-2026/", start: "2026-11-09T10:00", end: "2026-11-13T20:00" },
    { id: "into", t: "Into the Wild", link: "https://pokemongo.com/news/into-the-wild-2026", start: "2026-11-09T10:00", end: "2026-11-13T20:00", curated: true },
  ];
  const hit = pickEvent({ url: "https://leekduck.com/events/into-the-wild-2026/", source: "leekduck", title: "Into the Wild", fields: {} }, evs);
  assert.equal(hit.event.id, "into");
});

test("Minior Showers source research table yields explicit tasks without treating the total as a task", () => {
  // Regression for Leonid and Orionids GO Hub tables in event-details.json.
  const fields = extractFields([
    { text: "Timed Research", t: "h" },
    { text: "Task | Rewards", t: "p" },
    { text: "Claim Reward! | 1 × Star Piece", t: "p" },
    { text: "Use a Star Piece | 7740 × Stardust", t: "p" },
    { text: "Rewards | 77,400 × Stardust", t: "p" },
  ]);
  assert.deepEqual(fields.researchTasks.map(({ task, rewards }) => ({
    task,
    rewards: rewards.map(({ name, quantity }) => ({ name, quantity })),
  })), [
    { task: "Claim Reward!", rewards: [{ name: "Star Piece", quantity: 1 }] },
    { task: "Use a Star Piece", rewards: [{ name: "Stardust", quantity: 7740 }] },
  ]);
});


test("Hub event articles use an exact detail ID and do not become duplicate Minior events", () => {
  const data = JSON.parse(readFileSync("public/data.json", "utf8"));
  const curated = data.events.filter(e => ["minior", "minior2", "minior3"].includes(e.id))
    .map(e => ({id:e.id,t:e.t,start:e.s,end:e.e,link:e.sourceUrl,detailIds:e.detailIds,curated:true}));
  const cases = [
    ["https://pokemongohub.net/post/event/minior-showers-leonid-november-2026/", "Minior Showers: Leonid (November 2026)", "November 14, 2026", "minior2"],
    ["https://pokemongohub.net/post/event/minior-showers-orionids-october-2026/", "Minior Showers: Orionids (October 2026)", "October 19, 2026", "minior"]
  ];
  for (const [url,title,date,id] of cases) {
    const page = {source:"hub",url,title,fields:{dates:[date]},lines:[]};
    const matched = pickEvent(page,curated);
    assert.equal(matched?.event.id,id,url);
    assert.equal(matched?.how,"detail-id",url);
    assert.equal(pickEvent({...page,fields:{dates:["August 1, 2027"]}},curated),null,"a mismatched date must never win on source ID");
  }
  assert.equal(pickEvent({source:"hub",url:"https://evil.example/post/event/minior-showers-leonid-november-2026/",title:"Unknown event",fields:{}},curated),null,"external hosts cannot impersonate a known source ID");
});


test("canonical Minior research retains sourced tasks across optional bonus tracks", () => {
  const data = JSON.parse(readFileSync("public/data.json", "utf8"));
  const details = JSON.parse(readFileSync("public/event-details.json", "utf8")).events;
  for (const id of ["minior", "minior2"]) {
    const event = data.events.find(e => e.id === id), detail = details[id];
    assert.ok(event && detail, id);
    const tasks = detail.researchTasks || [];
    assert.ok(tasks.length >= 2, id + " must retain published research tasks");
    // GO Hub now publishes a regular track plus an optional bonus track.
    // A source refresh can legitimately add new task/reward variants, so the
    // importer must not pin the snapshot to exactly two tasks.
    for (const [task, reward, amount] of [
      ["Claim Reward!", "Star Piece", 1], ["Use a Star Piece", "Stardust", 7740]
    ]) {
      assert.ok(tasks.some(t => t.task === task && t.rewards?.some(r => r.name === reward && r.quantity === amount)),
        id + ": missing sourced task " + task + " / " + amount + " " + reward);
    }
    assert.equal(new Set(tasks.map(t => JSON.stringify([t.category, t.task, t.rewards]))).size, tasks.length,
      id + " must not duplicate identical tasks within one named research track");
    assert.ok(tasks.every(t => t.eventId === id && t.eventWindow.start === event.s && t.eventWindow.end === event.e), id);
    assert.ok(tasks.every(t => t.status === "single" && t.sourceRefs.some(s => s.id === "hub" && s.url.includes("pokemongohub.net/post/event/"))), id);
    assert.ok(!tasks.some(t => /^rewards?$/i.test(t.task)), "total reward is not a task");
  }
});

test("a research snapshot survives only when its source was not fetched and no new tasks replaced it", () => {
  const hub = {id:"hub",url:"https://pokemongohub.net/post/event/minior-showers-leonid-november-2026/"};
  const task = {task:"Use a Star Piece",category:"timed",rewards:[{name:"Stardust",quantity:7740}],sourceRefs:[hub],checkedAt:"2026-11-11"};
  const before={minior2:{name:"Minior Showers: Leonids",researchTasks:[task]}};
  const blank=()=>({minior2:{name:"Minior Showers: Leonids",researchTasks:[]}});
  const missing=new Map([["minior2",{results:[{source:{url:"https://leekduck.com/events/minior-showers-leonids-2026/"}}]}]]);
  assert.deepEqual(preserveUnfetchedResearchTasks(blank(),before,missing).minior2.researchTasks,[task]);
  const fetched=new Map([["minior2",{results:[{source:hub}]}]]);
  assert.deepEqual(preserveUnfetchedResearchTasks(blank(),before,fetched).minior2.researchTasks,[]);
  const fresh=blank();fresh.minior2.researchTasks=[{task:"Changed official task"}];
  assert.deepEqual(preserveUnfetchedResearchTasks(fresh,before,missing).minior2.researchTasks,[{task:"Changed official task"}]);
  assert.deepEqual(preserveUnfetchedResearchTasks({minior2:{name:"Unrelated Event",researchTasks:[]}},before,missing).minior2.researchTasks,[]);
});
