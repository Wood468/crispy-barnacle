import test from "node:test";
import assert from "node:assert/strict";
import { htmlToLines, pageTitle } from "../scripts/importer/text.mjs";
import { extractFields } from "../scripts/importer/extract.mjs";
import { mergeSources, similar, disagree } from "../scripts/importer/compare.mjs";
import { linksFrom, feedItems, discover } from "../scripts/importer/discover.mjs";
import { pickEvent, normaliseLegacyStatuses } from "../scripts/importer/run.mjs";

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
  assert.equal(feat.status, "confirmed"); assert.deepEqual(feat.sources.sort(), ["hub", "leekduck"]);
  assert.equal(m.fields.bonuses.find(x => /Lure modules/.test(x.text)).status, "single");
  assert.equal(m.conflicts.length, 1); assert.match(m.conflicts[0].a.text + m.conflicts[0].b.text, /3×.*2×|2×.*3×/);
  assert.ok(m.gaps.some(g => g.field === "shiny" && g.missingFrom.includes("hub")));
});
test("an official source marks a lone detail as official", () => {
  const m = mergeSources([{ source: { id: "official", trust: "official" }, fields: { bonuses: ["Double Stardust"], featured: [], raids: [], eggs: [], research: [], shiny: [], moves: [], costumes: [], tickets: [], dates: [] } }, { source: { id: "hub", trust: "community" }, fields: { bonuses: [], featured: [], raids: [], eggs: [], research: [], shiny: [], moves: [], costumes: [], tickets: [], dates: [] } }]);
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
