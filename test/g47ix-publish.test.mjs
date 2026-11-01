import test from "node:test";
import assert from "node:assert/strict";
import { decide, addToEventInfo, distinctiveTokens, detailsAsEvents } from "../scripts/g47ix-publish.mjs";

const events = [{ id: "kyogre-oct", t: "Kyogre in 5-star Raid Battles" }, { id: "zorua-cd", t: "Zorua Community Day" }];
test("confident only when the image text names the event", () => {
  const a = decide({ title: "Kyogre in 5-star Raid Battles" }, "KYOGRE RAID GUIDE counters weakness", events);
  assert.equal(a.confident, true); assert.equal(a.event.id, "kyogre-oct");
  const b = decide({ title: "Kyogre in 5-star Raid Battles" }, "", events);
  assert.equal(b.confident, false);
});
test("unrelated text finds no match", () => {
  const r = decide({ title: "Weekend vibes" }, "hello world", events);
  assert.equal(r.confident, false); assert.equal(r.match, null);
});
test("adds to an existing entry by name, or makes one, never duplicates", () => {
  const info = { events: { x: { names: ["Zorua Community Day"], infographics: [] } } };
  const g = { url: "/infographics/g47ix/a.png", sourceUrl: "https://example.test/p", observed: "2026-10-11", alt: "a" };
  assert.equal(addToEventInfo(info, events[1], g), true);
  assert.equal(addToEventInfo(info, events[1], g), false);
  assert.equal(info.events.x.infographics[0].source, "G47IX");
  addToEventInfo(info, events[0], { ...g, url: "/infographics/g47ix/b.png" });
  assert.deepEqual(info.events["kyogre-oct"].tickets, []);
});
test("distinctive tokens drop filler words", () => assert.deepEqual(distinctiveTokens("Kyogre in 5-star Raid Battles"), ["kyogre", "star"]));

import { discordCandidate } from "../scripts/g47ix-publish.mjs";
test("discord image becomes a candidate; creator stays blank unless named", () => {
  const d = { message_id: "1", channel_id: "2", title: "Hatch_event.png", text: "", image_url: "https://cdn.discordapp.com/a.png", timestamp: "2026-10-11T11:05:09Z" };
  const c = discordCandidate(d, "");
  assert.equal(c.id, "discord:1"); assert.equal(c.title, "Hatch event"); assert.equal(c.creator, "");
  assert.equal(discordCandidate(d, "G47IX").creator, "G47IX");
  assert.equal(discordCandidate({}, "x"), null);
});

import { datesIn } from "../scripts/g47ix-publish.mjs";
test("dates written in a picture are read both ways round", () => {
  assert.deepEqual(datesIn("Starts 13th Oct and ends October 19"), [[9, 13], [9, 19]]);
  assert.deepEqual(datesIn("no dates here"), []);
});
test("several signals together make a confident match; a lone caption does not", () => {
  const evs = [{ id: "fm", t: "Fall Marathon: Buddy Trek", s: "2026-10-13T10:00", e: "2026-10-19T20:00", art: [{ n: "Bramblin" }] }, { id: "zc", t: "Zorua Community Day", s: "2026-10-10T14:00", e: "2026-10-10T17:00", art: [{ n: "Zorua" }] }];
  const good = decide({ title: "Fall Marathon Buddy Trek", publishedAt: "2026-10-12T00:00:00Z" }, "FALL MARATHON BUDDY TREK 13 Oct - 19 Oct Bramblin debut", evs);
  assert.equal(good.confident, true); assert.ok(good.signals.length >= 3);
  const weak = decide({ title: "Fall Marathon Buddy Trek" }, "", evs);
  assert.equal(weak.confident, false);
});

import { applyDecisions } from "../scripts/g47ix-apply.mjs";
test("an approved decision attaches the staged picture to the chosen event; rejected ones are dropped", () => {
  const reg = { candidates: [{ id: "discord:1", stagedPath: "/infographics/g47ix/discord-1.png", url: "https://x.test/p", reviewStatus: "needs_review" }, { id: "discord:2", stagedPath: "/infographics/g47ix/discord-2.png", reviewStatus: "unmatched" }] };
  const info = { events: {} };
  const r = applyDecisions(reg, info, [{ id: "discord:1", status: "approved", eventId: "fm", eventTitle: "Fall Marathon: Buddy Trek" }, { id: "discord:2", status: "rejected" }, { id: "nope", status: "approved", eventId: "x" }], "2026-10-12");
  assert.equal(r.published.length, 1); assert.equal(r.rejected.length, 1); assert.equal(r.skipped.length, 1);
  assert.equal(info.events.fm.infographics[0].url, "/infographics/g47ix/discord-1.png");
  assert.equal(reg.candidates[0].reviewStatus, "published");
  assert.equal(applyDecisions(reg, info, [{ id: "discord:1", status: "approved", eventId: "fm" }]).published.length, 0);
});

import { mergeHistory } from "../scripts/g47ix-publish.mjs";
test("history adds older pictures for review, keeps them newest first, and refreshes expired links", () => {
  const now = Date.parse("2026-10-12T00:00:00Z");
  const rec = (id, ts, url) => ({ message_id: id, image_url: url, timestamp: ts, text: "Event " + id, channel_id: "1" });
  const reg = { candidates: [{ id: "discord:2", source: "discord", imageUrl: "https://old/2", publishedAt: "2026-09-01T00:00:00Z" }] };
  const n = mergeHistory(reg, { items: [rec("1", "2026-08-01T00:00:00Z", "https://c/1"), rec("2", "2026-09-01T00:00:00Z", "https://new/2"), rec("3", "2026-10-11T00:00:00Z", "https://c/3")] }, "G47IX", now);
  assert.equal(n, 2);
  assert.deepEqual(reg.candidates.map(c => c.id), ["discord:3", "discord:2", "discord:1"]);
  assert.equal(reg.candidates[1].imageUrl, "https://new/2");
  assert.equal(reg.candidates[2].history, true); assert.ok(!reg.candidates[0].history);
});

test("one picture can sit on several events, and later be unlinked from one or discarded everywhere", () => {
  const reg = { candidates: [{ id: "d:1", stagedPath: "/infographics/g47ix/d1.png", reviewStatus: "needs_review" }] };
  const info = { events: {} };
  applyDecisions(reg, info, [{ id: "d:1", status: "approved", eventId: "a,b", eventTitle: "Event A | Event B" }], "2026-10-12");
  assert.equal(info.events.a.infographics.length, 1); assert.equal(info.events.b.infographics.length, 1);
  const r = applyDecisions(reg, info, [{ id: "d:1", status: "approved", eventId: "b", eventTitle: "Event B" }]);
  assert.equal(r.changed.length, 1); assert.equal(info.events.a.infographics, undefined); assert.equal(info.events.b.infographics.length, 1);
  applyDecisions(reg, info, [{ id: "d:1", status: "unlinked" }]);
  assert.equal(info.events.b.infographics, undefined); assert.equal(reg.candidates[0].reviewStatus, "needs_review");
  applyDecisions(reg, info, [{ id: "d:1", status: "approved", eventId: "a", eventTitle: "Event A" }]);
  applyDecisions(reg, info, [{ id: "d:1", status: "rejected" }]);
  assert.equal(info.events.a.infographics, undefined); assert.equal(reg.candidates[0].reviewStatus, "rejected");
});

import { raidSlots } from "../scripts/g47ix-publish.mjs";
test("rotating raid bosses are linkable like events", () => {
  const s = raidSlots([{ s: "2026-10-07T10:00", e: "2026-10-14T10:00", five: "Yveltal", mega: "Mega Blastoise", shadow: "Shadow Landorus (Incarnate), to Oct 13" }], Date.parse("2026-10-12"));
  assert.deepEqual(s.map(x => x.id), ["raid:yveltal:2026-10-07", "raid:mega-blastoise:2026-10-07", "raid:shadow-landorus-incarnate:2026-10-07"]);
  assert.equal(s[0].t, "Yveltal 5-star raids");
  assert.equal(raidSlots([{ s: "2026-08-01T10:00", e: "2026-08-08T10:00", five: "X" }], Date.parse("2026-10-12")).length, 0);
});

import { monGuesses } from "../scripts/g47ix-publish.mjs";
test("a stat card with only a Pokémon name suggests the events that feature it", () => {
  const now = Date.parse("2026-10-14T00:00:00Z");
  const evs = [
    { id: "a", t: "Dialga raids", kind: "raid", s: "2026-10-10T00:00:00Z", e: "2026-10-20T00:00:00Z" },
    { id: "b", t: "Some Community Day", s: "2026-10-12T00:00:00Z", e: "2099-01-01T00:00:00Z", art: [{ n: "Blastoise" }] },
    { id: "c", t: "Old Dialga event", s: "2026-01-01T00:00:00Z", e: "2026-01-05T00:00:00Z", art: [{ n: "Dialga" }] },
  ];
  const g = monGuesses("= DIALGA 53394 CP Weakness", evs, now);
  assert.equal(g.length, 1); assert.equal(g[0].eventId, "a");
  const d = decide({ title: "Weekend" }, "BLASTOISE 42017 CP", [evs[1]]);
  assert.ok(!d.confident); assert.ok(d.guess && d.guess.alternatives.length >= 1);
});

import { buildWeekly, isWeekly } from "../scripts/g47ix-publish.mjs";
test("the weekly picture goes to the home page list, newest first, and old ones drop out", () => {
  const now = Date.parse("2026-10-14T00:00:00Z");
  const reg = { candidates: [
    { id: "d:1", title: "GO Weekly Update", stagedPath: "/infographics/g47ix/a.png", publishedAt: "2026-10-11T22:00:00Z", url: "https://discord.com/x" },
    { id: "d:2", title: "tr GO Weekly TT october", stagedPath: "/infographics/g47ix/b.png", publishedAt: "2026-10-12T05:00:00Z" },
    { id: "d:3", title: "GO Weekly Update", stagedPath: "/infographics/g47ix/c.png", publishedAt: "2026-09-20T00:00:00Z" },
    { id: "d:4", title: "Dmax LAKE", stagedPath: "/infographics/g47ix/d.png", publishedAt: "2026-10-12T00:00:00Z" },
    { id: "d:5", title: "GO Weekly", publishedAt: "2026-10-12T00:00:00Z" },
  ] };
  const w = buildWeekly(reg, now);
  assert.deepEqual(w.items.map(i => i.id), ["d:2"], "one picture per button: the newest replaces the older ones");
  assert.equal(w.items[0].title, "GO Weekly TT october");
  assert.ok(isWeekly(reg.candidates[0]) && !isWeekly(reg.candidates[3]));
});
import { isMonthly } from "../scripts/g47ix-publish.mjs";
test("the monthly overview is found by its file name and kept on the home page list as 'month'", () => {
  const now = Date.parse("2026-10-14T00:00:00Z");
  const m = { id: "d:m", title: "https://cdn.discordapp.com/attachments/1/2/OCT_CONTENT_G47IX.png?ex=1", imageUrl: "https://cdn.discordapp.com/attachments/1/2/OCT_CONTENT_G47IX.png?ex=2", stagedPath: "/infographics/g47ix/m.webp", publishedAt: "2026-10-12T08:00:00Z" };
  assert.ok(isMonthly(m) && !isMonthly({ title: "TREK_.png" }) && !isMonthly({ title: "Dmax LAKE" }));
  const w = buildWeekly({ candidates: [m, { id: "d:w", title: "GO Weekly Update", stagedPath: "/infographics/g47ix/w.webp", publishedAt: "2026-10-11T00:00:00Z" }] }, now);
  assert.deepEqual(w.items.map(i => [i.kind, i.title]), [["week", "GO Weekly Update"], ["month", "Month overview: Oct"]]);
});

import { withAi } from "../scripts/g47ix-publish.mjs";
test("a match made by reading the picture goes first", () => {
  const g = withAi({ aiMatch: [{ eventId: "w-into-the-wild", eventTitle: "Into the Wild" }] }, [{ eventId: "wag", eventTitle: "GO Wild Area: Global", score: 0.8 }]);
  assert.equal(g[0].eventId, "w-into-the-wild"); assert.equal(g.length, 2);
  assert.deepEqual(withAi({}, []), []);
});

test("a newer chosen picture replaces the older chosen one on each button", () => {
  const now = Date.parse("2026-10-20T00:00:00Z");
  const reg = { candidates: [
    { id: "w-old", overview: "week", title: "x", stagedPath: "/infographics/g47ix/1.webp", publishedAt: "2026-10-12T00:00:00Z" },
    { id: "w-new", overview: "week", title: "y", stagedPath: "/infographics/g47ix/2.webp", publishedAt: "2026-10-19T00:00:00Z" },
    { id: "m-old", overview: "month", title: "OCT_CONTENT", stagedPath: "/infographics/g47ix/3.webp", publishedAt: "2026-09-29T00:00:00Z" },
    { id: "m-new", overview: "month", title: "NOV_CONTENT", stagedPath: "/infographics/g47ix/4.webp", publishedAt: "2026-10-19T00:00:00Z" },
  ] };
  assert.deepEqual(buildWeekly(reg, Date.parse("2026-11-02T00:00:00Z")).items.map(i => i.id), ["w-new", "m-new"], "in November the November picture takes over");
  assert.deepEqual(buildWeekly(reg, now).items.map(i => i.id), ["w-new", "m-old"], "in October the November picture waits, even if chosen early");
});

test("world and in-person events are suggested from the picture text, never auto-proposed", async () => {
  const { worldAsEvents, worldGuess } = await import("../scripts/g47ix-publish.mjs");
  const world = { events: [{ id: "w-aeon", name: "AEON MALL Halloween", place: "Participating AEON Malls, Japan", start: "2026-10-19", end: "2026-11-01" }, { id: "w-other", name: "Pokemon Fossil Museum 2026", start: "2026-05-22", end: "2027-04-11" }] };
  const list = worldAsEvents(world);
  assert.equal(list.length, 2); assert.equal(list[0].t, "AEON MALL Halloween");
  const g = worldGuess({ title: "Infographic", ocrText: "AEON MALL Halloween Pokémon GO 19 Oct to 1 Nov" }, list);
  assert.equal(g && g.eventId, "w-aeon");
  assert.equal(worldGuess({ title: "x", ocrText: "Raid Hour Thursday Max Battles" }, list), null);
});

test("a Discord message that is only a link is titled by its file name, not the link", () => {
  const url = "https://cdn.discordapp.com/attachments/1/2/Dmax_LAKE.png?ex=1&hm=2";
  assert.equal(discordCandidate({ image_url: url, message_id: "9", text: url, title: "" }).title, "Dmax LAKE");
  assert.equal(discordCandidate({ image_url: url, message_id: "9", text: "", title: "Twitch_2.png" }).title, "Twitch 2");
  assert.equal(discordCandidate({ image_url: url, message_id: "9", text: "Lake Trio Max Battle Day " + url }).title, "Lake Trio Max Battle Day");
});

test("new Leek Duck detail-only events are available to the infographic matcher", () => {
  const events = detailsAsEvents({ events: { "leekduck:dynamax-trails-2026": {
    name: "Dynamax Trails", sources: [{ id: "leekduck" }],
    fields: { dates: [{ text: "The Dynamax Trails event will take place from November 16, 2026 to November 23, 2026. Stay tuned for more details." }] }
  } } });
  assert.equal(events.length, 1);
  assert.equal(events[0].id, "leekduck:dynamax-trails-2026");
  assert.equal(events[0].s, "2026-11-16T00:00");
  assert.equal(events[0].e, "2026-11-23T23:59");
  const result = decide({ title: "Dynamax Trails", publishedAt: "2026-10-28T01:54:37.109Z" }, "DYNAMAX TRAILS NOVEMBER 16 2026 TO NOVEMBER 23 2026", events);
  assert.equal(result.match.eventId, "leekduck:dynamax-trails-2026");
  assert.equal(result.confident, true);
});

// ---- Dates on event-info.json entries ----
import { eventDates, datedEvents } from "../scripts/g47ix-publish.mjs";
import { backfill } from "../scripts/event-info-dates.mjs";

test("addToEventInfo dates the entry from the event and keeps recurring instances apart", () => {
  const info = { events: {} }, g = (u) => ({ url: u, sourceUrl: "https://x/" + u, observed: "2026-10-14" });
  addToEventInfo(info, { id: "smr1", t: "Super Mega Raid Day", s: "2026-10-31T00:00", e: "2026-10-31T23:59", src: "data.json" }, g("/a.webp"));
  assert.deepEqual([info.events.smr1.start, info.events.smr1.end, info.events.smr1.dateSource], ["2026-10-31", "2026-10-31", "data.json"]);
  // Same title, a month later: gets its own entry instead of joining smr1.
  addToEventInfo(info, { id: "smr2", t: "Super Mega Raid Day", s: "2026-11-28T00:00", e: "2026-11-28T23:59" }, g("/b.webp"));
  assert.equal(info.events.smr1.infographics.length, 1);
  assert.equal(info.events.smr2.infographics.length, 1);
  assert.equal(info.events.smr2.dateSource, "event");
  // Same title, same window under another id: still joins.
  addToEventInfo(info, { id: "w-smr", t: "Super Mega Raid Day", s: "2026-10-31T00:00", e: "2026-10-31T23:59" }, g("/c.webp"));
  assert.equal(info.events.smr1.infographics.length, 2);
  // No event date: nothing is written, and an existing entry keeps the date it has.
  addToEventInfo(info, { id: "none", t: "Undated" }, g("/d.webp"));
  assert.equal("start" in info.events.none, false);
  addToEventInfo(info, { id: "smr1", t: "Super Mega Raid Day" }, g("/e.webp"));
  assert.equal(info.events.smr1.start, "2026-10-31");
  assert.equal(eventDates({ s: "bad" }), null);
});

test("applyDecisions dates approved pictures when the event is known", () => {
  const reg = { candidates: [{ id: "c1", stagedPath: "/infographics/g47ix/c1.webp", url: "https://d/1", reviewStatus: "needs_review" }] };
  const info = { events: {} };
  applyDecisions(reg, info, [{ id: "c1", status: "approved", eventId: "smr2", eventTitle: "Super Mega Raid Day" }], "2026-11-01", (id) => id === "smr2" ? { s: "2026-11-28T00:00", e: "2026-11-28T23:59", src: "data.json" } : null);
  assert.equal(info.events.smr2.start, "2026-11-28");
  const r2 = { candidates: [{ id: "c2", stagedPath: "/infographics/g47ix/c2.webp", url: "https://d/2", reviewStatus: "needs_review" }] }, i2 = { events: {} };
  applyDecisions(r2, i2, [{ id: "c2", status: "approved", eventId: "zz", eventTitle: "Zz" }], "2026-11-01");
  assert.equal("start" in i2.events.zz, false, "no event lookup: undated, as before");
});

test("backfill dates only entries whose id matches one event, never guesses", () => {
  const info = { events: { "cur:smr1": { names: ["Super Mega Raid Day"] }, "leekduck:unknown-thing": { names: ["Unknown"] }, both: { names: ["B"] }, done: { start: "2020-01-01", end: "2020-01-01", dateSource: "x" } } };
  const src = { data: { events: [{ id: "smr1", t: "Super Mega Raid Day", s: "2026-10-31T00:00", e: "2026-10-31T23:59" }, { id: "both", t: "B", s: "2026-10-01T00:00", e: "2026-10-02T00:00" }] }, world: { events: [{ id: "both", name: "B", start: "2026-12-01", end: "2026-12-02" }] }, details: {} };
  const r = backfill(info, src);
  assert.equal(info.events["cur:smr1"].start, "2026-10-31");
  assert.equal("start" in info.events["leekduck:unknown-thing"], false);
  assert.equal("start" in info.events.both, false, "two sources disagree");
  assert.equal(info.events.done.start, "2020-01-01");
  assert.equal(r.dated.length, 1);
});

// ---- Weekly rotation slots: separate instances, and dates are written once ----
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("two weekly rotation slots with the same boss are two entries and the first keeps its dates", () => {
  const info = { events: {} }, g = u => ({ url: u, sourceUrl: "https://x/" + u, observed: "2026-10-21" });
  const wk1 = { id: "raid:dialga:2026-10-14", t: "Dialga 5-star raids", s: "2026-10-14T10:00", e: "2026-10-21T10:00", src: "rotation" };
  const wk2 = { id: "raid:dialga:2026-10-21", t: "Dialga 5-star raids", s: "2026-10-21T10:00", e: "2026-10-28T10:00", src: "rotation" };
  addToEventInfo(info, wk1, g("/a.webp"));
  addToEventInfo(info, wk2, g("/b.webp"));
  assert.deepEqual(Object.keys(info.events), [wk1.id, wk2.id], "the next week gets its own entry");
  assert.deepEqual([info.events[wk1.id].start, info.events[wk1.id].end], ["2026-10-14", "2026-10-21"], "week 1 dates untouched");
  assert.equal(info.events[wk1.id].infographics.length, 1);
  assert.deepEqual([info.events[wk2.id].start, info.events[wk2.id].end], ["2026-10-21", "2026-10-28"]);
});

test("dates already on an entry are never rewritten; an undated entry gets them once", () => {
  const info = { events: { smr1: { names: ["Super Mega Raid Day"], start: "2026-10-31", end: "2026-10-31", dateSource: "data.json", infographics: [] }, old: { names: ["Old"], infographics: [] } } };
  const g = u => ({ url: u, sourceUrl: "https://x/" + u });
  // Same id, different window (an id match skips the instance check): the stored dates stay.
  addToEventInfo(info, { id: "smr1", t: "Super Mega Raid Day", s: "2026-11-02T00:00", e: "2026-11-03T00:00", src: "x" }, g("/a.webp"));
  assert.deepEqual([info.events.smr1.start, info.events.smr1.end, info.events.smr1.dateSource], ["2026-10-31", "2026-10-31", "data.json"]);
  addToEventInfo(info, { id: "old", t: "Old", s: "2026-09-01T00:00", e: "2026-09-02T00:00", src: "data.json" }, g("/b.webp"));
  assert.deepEqual([info.events.old.start, info.events.old.end], ["2026-09-01", "2026-09-02"]);
});

test("backfill is a dry run unless --write is passed", () => {
  const dir = mkdtempSync(join(tmpdir(), "evinfo-")), file = join(dir, "event-info.json");
  const text = JSON.stringify({ events: { halloween1: { names: ["Halloween 2026, Part One"], infographics: [] } } }, null, 2) + "\n";
  writeFileSync(file, text);
  const run = (...args) => spawnSync(process.execPath, ["scripts/event-info-dates.mjs", ...args], { env: { ...process.env, EVENT_INFO_FILE: file }, encoding: "utf8" });
  const dry = run();
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /^dated\s+halloween1/m, "the dry run would date the entry");
  assert.equal(readFileSync(file, "utf8"), text, "dry run leaves the file alone");
  assert.doesNotMatch(dry.stdout, /Saved/);
  const wet = run("--write");
  assert.equal(wet.status, 0, wet.stderr);
  assert.match(readFileSync(file, "utf8"), /"dateSource"/);
});

test("validator rejects a dateSource with no start", () => {
  const dir = mkdtempSync(join(tmpdir(), "validate-"));
  mkdirSync(join(dir, "public"));
  writeFileSync(join(dir, "public", "data.json"), JSON.stringify({ events: [] }));
  const check = events => { writeFileSync(join(dir, "public", "event-info.json"), JSON.stringify({ events })); return spawnSync(process.execPath, [join(process.cwd(), "scripts/validate-public-data.mjs")], { cwd: dir, encoding: "utf8" }); };
  const bad = check({ x: { names: ["X"], dateSource: "data.json" } });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stdout + bad.stderr, /dateSource without start/);
  const good = check({ x: { names: ["X"], start: "2026-10-01", end: "2026-10-02", dateSource: "data.json" } });
  assert.equal(good.status, 0, good.stdout + good.stderr);
});
