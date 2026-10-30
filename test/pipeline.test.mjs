import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeDB, feed, raid, cd, NOW, HOUR, DAY } from "./helpers.mjs";
import * as P from "../src/pipeline.js";
import { MIGRATIONS } from "../src/migrations.js";

const LD = { id: "leekduck", name: "Leek Duck (via ScrapedDuck)", url: "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json", kind: "community", defaultStatus: "community_reported", minItems: 10 };
async function fresh() { const db = makeDB(); await P.migrate(db, NOW); return db; }
const count = async (db, t) => (await db.prepare("SELECT COUNT(*) n FROM " + t).first()).n;

test("migration: versioned, additive, idempotent, and the .sql file matches the code", async () => {
  const db = makeDB();
  db.raw.exec("CREATE TABLE dex (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL); INSERT INTO dex VALUES ('marks','{\"a\":1}',1)");
  await P.migrate(db, NOW); await P.migrate(db, NOW + 1);
  assert.equal(await count(db, "schema_migrations"), MIGRATIONS.length);
  assert.equal((await db.prepare("SELECT data FROM dex WHERE id='marks'").first()).data, '{"a":1}', "existing marks untouched");
  const sql = fs.readFileSync(new URL("../migrations/0001_source_pipeline.sql", import.meta.url), "utf8");
  assert.equal(sql.trim(), MIGRATIONS[0].sql.trim());
  const code = sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  assert.ok(!/\b(DROP|DELETE|UPDATE|ALTER|INSERT)\b/i.test(code), "no destructive or data-changing statements");
  assert.ok(/CREATE TABLE IF NOT EXISTS/.test(code));
});

test("valid new data: events stored with times, region, featured Pokémon, bonuses and attribution", async () => {
  const db = await fresh();
  const r = await P.ingestFeed(db, LD, feed([raid(), cd()]), NOW);
  assert.equal(r.ok, true); assert.equal(r.created, 14);
  const row = await db.prepare("SELECT * FROM items WHERE id='leekduck:october-communityday2026'").first();
  assert.equal(row.status, "community_reported"); assert.equal(row.tz_mode, "local"); assert.equal(row.scope, "worldwide_local");
  assert.equal(row.link, "https://leekduck.com/events/october-communityday2026/"); assert.equal(row.first_seen, NOW);
  const f = JSON.parse(row.featured); assert.ok(f.find((x) => x.name === "Zorua" && x.role === "spawn" && x.dex === 570));
  assert.ok(f.find((x) => x.name === "Zorua" && x.role === "shiny_form" && x.shiny === true));
  assert.deepEqual(JSON.parse(row.bonuses), ["3x Catch XP", "2x Catch Candy"]);
  const mega = JSON.parse((await db.prepare("SELECT featured FROM items WHERE id='leekduck:mega-blastoise-raids'").first()).featured);
  assert.ok(mega.find((x) => x.name === "Mega Blastoise" && x.dex === 9 && x.form === "51" && x.role === "raid_boss"));
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM item_history WHERE change='created'").first()).n, 14);
});

test("time zones: Z means one instant worldwide; floating means each player's local time", () => {
  const z = P.normaliseEvent({ ...raid(), eventType: "go-battle-league", start: "2026-10-06T20:00:00.000Z", end: "2026-10-13T20:00:00.000Z" }, LD);
  assert.equal(z.tz_mode, "utc"); assert.equal(z.scope, "worldwide_simultaneous"); assert.equal(z.start_ms, Date.parse("2026-10-06T20:00:00Z")); assert.equal(z.latest_end, Date.parse("2026-10-13T20:00:00Z"));
  const l = P.normaliseEvent(cd(), LD);
  assert.equal(l.tz_mode, "local"); assert.equal(l.start_ms, null);
  assert.equal(l.earliest, Date.parse("2026-10-10T14:00:00Z") - 14 * HOUR); assert.equal(l.latest_end, Date.parse("2026-10-10T17:00:00Z") + 12 * HOUR);
  const w = P.normaliseEvent({ ...cd(), eventType: "wild-area", name: "Pokémon GO Wild Area 2026: Sendai • Tohoku", start: "2026-11-06T01:00:00.000Z", end: "2026-11-08T09:00:00.000Z" }, LD);
  assert.equal(w.scope, "regional"); assert.equal(w.region, "Sendai • Tohoku");
  const g = P.normaliseEvent({ ...cd(), eventType: "wild-area", name: "Pokémon GO Wild Area 2026: Global" }, LD);
  assert.equal(g.region, "Global"); assert.equal(g.scope, "worldwide_local");
  const t = P.normaliseEvent({ ...cd(), eventType: "pokemon-go-tour", name: "Pokémon GO Tour: Alola - Kaohsiung 2027" }, LD);
  assert.equal(t.region, "Alola - Kaohsiung");
});

test("unchanged data: re-ingesting creates no duplicates, no history, and refreshes last_seen only", async () => {
  const db = await fresh();
  await P.ingestFeed(db, LD, feed([raid(), cd()]), NOW);
  const h0 = await count(db, "item_history");
  const r = await P.ingestFeed(db, LD, feed([raid(), cd()]), NOW + 6 * HOUR);
  assert.equal(r.created, 0); assert.equal(r.changed, 0); assert.equal(r.unchanged, 14);
  assert.equal(await count(db, "items"), 14); assert.equal(await count(db, "item_history"), h0);
  const row = await db.prepare("SELECT * FROM items WHERE id='leekduck:mega-blastoise-raids'").first();
  assert.equal(row.first_seen, NOW); assert.equal(row.last_seen, NOW + 6 * HOUR); assert.equal(row.last_changed, NOW);
  const s = await db.prepare("SELECT * FROM sources WHERE id='leekduck'").first();
  assert.equal(s.last_checked, NOW + 6 * HOUR); assert.equal(s.last_changed, NOW);
});

test("duplicate ingestion and safe retries: the same run twice, or a duplicated ID inside one feed", async () => {
  const db = await fresh();
  const data = feed([raid(), raid(), cd()]); // raid twice in the same feed
  await P.ingestFeed(db, LD, data, NOW); await P.ingestFeed(db, LD, data, NOW);
  assert.equal(await count(db, "items"), 14);
  assert.equal(await count(db, "item_history"), 14);
});

test("failing or incomplete source: rejected, existing data untouched, health reflects it", async () => {
  const db = await fresh();
  await P.ingestFeed(db, LD, feed([raid(), cd()]), NOW);
  const before = JSON.stringify(await db.prepare("SELECT * FROM items ORDER BY id").all());
  for (const bad of [null, "<html>rate limited</html>", {}, [], feed([], 3), feed([raid(), cd()]).slice(0, 5), Array.from({ length: 14 }, () => ({ nonsense: true }))]) {
    const r = await P.ingestFeed(db, LD, bad, NOW + HOUR);
    assert.equal(r.ok, false, "should reject " + JSON.stringify(bad)?.slice(0, 40)); assert.ok(r.reason);
  }
  assert.equal(JSON.stringify(await db.prepare("SELECT * FROM items ORDER BY id").all()), before);
  const s = await db.prepare("SELECT * FROM sources WHERE id='leekduck'").first();
  assert.equal(s.fail_streak, 7); assert.ok(s.last_error); assert.equal(s.last_ok, NOW);
  assert.notEqual(P.sourceHealth({ ...s, upcoming: 10 }, NOW + HOUR).state, "healthy");
  assert.equal(P.sourceHealth({ ...s, upcoming: 10 }, NOW + HOUR).state, "failing");
});

test("a fetch error is recorded as a failure, not silently ignored", async () => {
  const db = await fresh();
  await P.ingestFeed(db, LD, feed(), NOW);
  const r = await P.runSource(db, LD, async () => { throw new Error("network down"); }, NOW + HOUR);
  assert.equal(r.ok, false); assert.match(r.reason, /network down/);
  const r2 = await P.runSource(db, LD, async () => new Response("nope", { status: 503 }), NOW + 2 * HOUR);
  assert.match(r2.reason, /503/);
});

test("a request that succeeds is not 'healthy' unless the data itself is valid and current", async () => {
  const db = await fresh();
  const old = feed([], 12).map((e) => ({ ...e, start: "2026-01-01T10:00:00.000", end: "2026-01-02T10:00:00.000" })); // every event long finished
  const r = await P.ingestFeed(db, LD, old, NOW);
  assert.equal(r.ok, true);
  const s = await db.prepare("SELECT * FROM sources WHERE id='leekduck'").first();
  const up = (await db.prepare("SELECT COUNT(*) n FROM items WHERE latest_end >= ?").bind(NOW).first()).n;
  assert.equal(up, 0);
  assert.equal(P.sourceHealth({ ...s, upcoming: up }, NOW).state, "stale");
  assert.equal(P.sourceHealth({ ...s, upcoming: 5 }, NOW).state, "healthy");
  assert.equal(P.sourceHealth({ ...s, upcoming: 5 }, NOW + 40 * HOUR).state, "stale", "no good check for 40 hours");
  assert.equal(P.sourceHealth({ ...s, upcoming: 5, source_updated: NOW - 20 * DAY }, NOW).state, "stale", "upstream not updated for 20 days");
  assert.equal(P.sourceHealth({ id: "x" }, NOW).state, "never");
});

test("undated events are kept but flagged, never shown as upcoming; mostly-undated feeds are rejected", async () => {
  const db = await fresh();
  const r = await P.ingestFeed(db, LD, feed([raid({ eventID: "rh", name: "Yveltal Raid Hour", eventType: "raid-hour", start: null, end: null })]), NOW);
  assert.equal(r.ok, true); assert.equal(r.undated, 1);
  const row = await db.prepare("SELECT * FROM items WHERE id='leekduck:rh'").first();
  assert.equal(row.tz_mode, "unknown"); assert.equal(row.latest_end, null);
  const r2 = await P.ingestFeed(db, LD, feed([], 12).map((e) => ({ ...e, start: null, end: null })), NOW + HOUR);
  assert.equal(r2.ok, false);
});

test("an event changing date or region is recorded as a material change with before/after", async () => {
  const db = await fresh();
  await P.ingestFeed(db, LD, feed([cd()]), NOW);
  const r = await P.ingestFeed(db, LD, feed([cd({ start: "2026-10-11T14:00:00.000", end: "2026-10-11T17:00:00.000", name: "Zorua Community Day: Sydney" })]), NOW + 6 * HOUR);
  assert.equal(r.changed, 1);
  const row = await db.prepare("SELECT * FROM items WHERE id='leekduck:october-communityday2026'").first();
  assert.equal(row.start_raw, "2026-10-11T14:00:00.000"); assert.equal(row.first_seen, NOW); assert.equal(row.last_changed, NOW + 6 * HOUR);
  const h = (await db.prepare("SELECT * FROM item_history WHERE item_id='leekduck:october-communityday2026' AND change='changed'").all()).results;
  assert.equal(h.length, 1); const d = JSON.parse(h[0].detail);
  assert.deepEqual(d.start_raw, ["2026-10-10T14:00:00.000", "2026-10-11T14:00:00.000"]); assert.ok(d.name);
  const wa = (n) => ({ eventID: "wa1", name: "Pokémon GO Wild Area 2026: " + n, eventType: "wild-area", start: "2026-11-06T01:00:00.000Z", end: "2026-11-08T09:00:00.000Z" });
  await P.ingestFeed(db, LD, feed([cd(), raid(wa("Sendai"))]), NOW + 7 * HOUR);
  await P.ingestFeed(db, LD, feed([cd(), raid(wa("Osaka"))]), NOW + 8 * HOUR);
  const d2 = JSON.parse((await db.prepare("SELECT detail FROM item_history WHERE item_id='leekduck:wa1' AND change='changed'").first()).detail);
  assert.deepEqual(d2.region, ["Sendai", "Osaka"]);
});

test("an event that disappears is marked missing (not deleted) and restored if it returns", async () => {
  const db = await fresh();
  await P.ingestFeed(db, LD, feed([cd()]), NOW);
  const r = await P.ingestFeed(db, LD, feed(), NOW + 6 * HOUR);
  assert.equal(r.missing, 1);
  assert.equal((await db.prepare("SELECT missing_since FROM items WHERE id='leekduck:october-communityday2026'").first()).missing_since, NOW + 6 * HOUR);
  await P.ingestFeed(db, LD, feed(), NOW + 12 * HOUR);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM item_history WHERE change='missing'").first()).n, 1, "missing is logged once");
  await P.ingestFeed(db, LD, feed([cd()]), NOW + 18 * HOUR);
  assert.equal((await db.prepare("SELECT missing_since FROM items WHERE id='leekduck:october-communityday2026'").first()).missing_since, null);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM item_history WHERE change='reappeared'").first()).n, 1);
});

test("expired events leave the upcoming list but stay in history; finished events are not 'missing'", async () => {
  const db = await fresh();
  const old = cd({ eventID: "old1", name: "Old Spotlight", start: "2026-09-01T18:00:00.000", end: "2026-09-01T19:00:00.000" });
  await P.ingestFeed(db, LD, feed([old]), NOW);
  const r = await P.ingestFeed(db, LD, feed(), NOW + HOUR);
  assert.equal(r.missing, 0, "already finished, so leaving the feed is normal");
  assert.equal(P.isExpired({ latest_end: Date.parse("2026-09-01T19:00:00Z") + 12 * HOUR }, NOW), true);
  const { events } = await P.listEvents(db, NOW, {});
  assert.ok(!events.find((e) => e.name === "Old Spotlight"));
  assert.ok((await P.listEvents(db, NOW, { includePast: true })).events.find((e) => e.name === "Old Spotlight"));
  // a local-time event that ends "today" must not be hidden while it may still be running somewhere
  assert.equal(P.isExpired({ latest_end: Date.parse("2026-10-09T10:00:00Z") + 12 * HOUR }, NOW), false);
});

test("trust: community and datamined reports cannot become official without official evidence", () => {
  assert.equal(P.resolveStatus("community_reported", null), "community_reported");
  assert.equal(P.resolveStatus("community_reported", { kind: "official", url: "https://leekduck.com/news" }), "community_reported", "wrong host");
  assert.equal(P.resolveStatus("community_reported", { kind: "official", url: "http://pokemongolive.com/post/x" }), "community_reported", "not https");
  assert.equal(P.resolveStatus("community_reported", { kind: "community", url: "https://pokemongolive.com/post/x" }), "community_reported", "not marked official");
  assert.equal(P.resolveStatus("datamined", { kind: "official", url: "https://evil.example/pokemongolive.com/" }), "datamined");
  assert.equal(P.resolveStatus("datamined", null), "datamined");
  assert.equal(P.resolveStatus("community_reported", { kind: "official", url: "https://pokemongolive.com/post/x" }), "official_confirmed");
  assert.equal(P.resolveStatus("community_reported", { kind: "official", url: "https://pokemongo.com/news/example" }), "official_confirmed", "official Pokémon GO news host");
  assert.equal(P.resolveStatus("community_reported", { kind: "official", url: "https://www.pokemongo.com/news/example" }), "official_confirmed", "www official Pokémon GO news host");
  assert.equal(P.resolveStatus("community_reported", { kind: "official", url: "https://pokemongo.com.evil.example/news" }), "community_reported", "lookalike host");
  assert.equal(P.resolveStatus("datamined", { kind: "official", url: "https://pokemongolive.com/post/x" }), "official_confirmed");
  assert.equal(P.isAnnounced("datamined"), false); assert.equal(P.isAnnounced("community_reported"), true); assert.equal(P.isAnnounced("official_confirmed"), true);
});

test("status change from evidence is recorded; losing the evidence drops it back", async () => {
  const db = await fresh();
  const src = { ...LD, evidenceFor: (e) => (e.eventID === "wa1" ? { kind: "official", url: "https://pokemongolive.com/post/wa" } : null) };
  await P.ingestFeed(db, LD, feed([raid({ eventID: "wa1" })]), NOW);
  assert.equal((await db.prepare("SELECT status FROM items WHERE id='leekduck:wa1'").first()).status, "community_reported");
  await P.ingestFeed(db, src, feed([raid({ eventID: "wa1" })]), NOW + HOUR);
  assert.equal((await db.prepare("SELECT status FROM items WHERE id='leekduck:wa1'").first()).status, "official_confirmed");
  const h = JSON.parse((await db.prepare("SELECT detail FROM item_history WHERE item_id='leekduck:wa1' AND change='changed'").first()).detail);
  assert.deepEqual(h.status, ["community_reported", "official_confirmed"]);
  await P.ingestFeed(db, LD, feed([raid({ eventID: "wa1" })]), NOW + 2 * HOUR);
  assert.equal((await db.prepare("SELECT status FROM items WHERE id='leekduck:wa1'").first()).status, "community_reported");
});

test("conflicting reports for the same event are both kept and the event is marked conflicting", async () => {
  const db = await fresh();
  const CUR = { id: "curated", name: "Hand-curated (data.json)", url: "/data.json", kind: "curated", defaultStatus: "community_reported", minItems: 1 };
  await P.ingestFeed(db, LD, feed([cd()]), NOW);
  await P.ingestFeed(db, CUR, [{ eventID: "zorua", name: "Zorua Community Day", eventType: "community-day", link: "", start: "2026-10-11T14:00", end: "2026-10-11T17:00", extraData: {} }], NOW);
  const found = await P.detectConflicts(db, NOW);
  assert.equal(found.open, 1);
  const c = (await db.prepare("SELECT * FROM conflicts").all()).results[0];
  assert.equal(c.field, "start"); assert.ok(c.a_val && c.b_val && c.a_val !== c.b_val); assert.equal(c.resolved_at, null);
  const { events } = await P.listEvents(db, NOW, {});
  const ev = events.find((e) => /Zorua/.test(e.name));
  assert.equal(ev.status, "conflicting"); assert.equal(ev.reports.length, 2); assert.equal(ev.announced, true);
  assert.deepEqual(ev.reports.map((r) => r.source).sort(), ["curated", "leekduck"]);
  // detecting again does not duplicate
  await P.detectConflicts(db, NOW + HOUR); assert.equal(await count(db, "conflicts"), 1);
  // the curated copy is corrected, so the conflict resolves but stays on record
  await P.ingestFeed(db, CUR, [{ eventID: "zorua", name: "Zorua Community Day", eventType: "community-day", link: "", start: "2026-10-10T14:00", end: "2026-10-10T17:00", extraData: {} }], NOW + 2 * HOUR);
  const after = await P.detectConflicts(db, NOW + 2 * HOUR);
  assert.equal(after.open, 0); assert.equal(await count(db, "conflicts"), 1);
  assert.ok((await db.prepare("SELECT resolved_at FROM conflicts").first()).resolved_at);
  assert.notEqual((await P.listEvents(db, NOW, {})).events.find((e) => /Zorua/.test(e.name)).status, "conflicting");
});

test("agreeing sources are not flagged, and unrelated events are not merged", async () => {
  const db = await fresh();
  const CUR = { id: "curated", name: "c", url: "/", kind: "curated", defaultStatus: "community_reported", minItems: 1 };
  await P.ingestFeed(db, LD, feed([cd(), raid()]), NOW);
  await P.ingestFeed(db, CUR, [{ eventID: "z", name: "Zorua Community Day", eventType: "community-day", start: "2026-10-10T14:00", end: "2026-10-10T17:00", extraData: {} }], NOW);
  assert.equal((await P.detectConflicts(db, NOW)).open, 0);
  const { events } = await P.listEvents(db, NOW, {});
  assert.equal(events.filter((e) => /Zorua/.test(e.name)).length, 1);
  assert.ok(events.find((e) => /Blastoise/.test(e.name)));
});

test("datamined items stay datamined and never count as announced", async () => {
  const db = await fresh();
  const DM = { id: "datamine", name: "Datamine", url: "x", kind: "datamine", defaultStatus: "datamined", minItems: 1 };
  await P.ingestFeed(db, DM, [{ eventID: "gigaX", name: "Gigantamax Rillaboom Max Battles", eventType: "max-battles", link: "https://pokemongohub.net/p", start: "2026-12-01T10:00", end: "2026-12-02T10:00", extraData: {} }], NOW);
  const ev = (await P.listEvents(db, NOW, {})).events.find((e) => /Rillaboom/.test(e.name));
  assert.equal(ev.status, "datamined"); assert.equal(ev.announced, false);
});

test("listEvents groups, filters by type, returns attribution and source freshness", async () => {
  const db = await fresh();
  await P.ingestFeed(db, LD, feed([raid(), cd()]), NOW);
  const r = await P.listEvents(db, NOW, { type: "raid-battles" });
  assert.equal(r.events.length, 1); const e = r.events[0];
  assert.equal(e.reports[0].source, "leekduck"); assert.equal(e.reports[0].link, raid().link); assert.ok(e.reports[0].firstSeen); assert.ok(e.reports[0].lastChecked);
  assert.ok(e.featured.find((f) => f.name === "Mega Blastoise"));
  assert.equal(r.sources[0].id, "leekduck");
});

test("preview (dry run) validates and summarises without touching any database", async () => {
  const out = await P.preview(async () => new Response(JSON.stringify(feed([raid(), cd()])), { status: 200 }), { events: [] }, NOW);
  assert.equal(out.leekduck.ok, true); assert.equal(out.leekduck.total, 14); assert.ok(out.events.length > 0);
  const bad = await P.preview(async () => new Response("[]", { status: 200 }), { events: [] }, NOW);
  assert.equal(bad.leekduck.ok, false);
});

test("curated adapter reads data.json events so the fallback can be compared", () => {
  const items = P.curatedFeed({ events: [{ id: "space", t: "World Space Week", s: "2026-10-04T00:00", e: "2026-10-10T23:59", tags: ["Raids"], p: ["x"], art: [{ n: "Pikachu", costume: 1, label: "Astronaut" }] }] });
  assert.equal(items.length, 1); assert.equal(items[0].eventID, "space"); assert.equal(items[0].extraData.curatedFeatured[0].name, "Pikachu");
});

test("date-only placeholders (T00:00, T23:59) do not create false conflicts, but a different day still does", () => {
  const a = P.normaliseEvent({ ...cd(), start: "2026-10-31T14:00:00.000", end: "2026-10-31T17:00:00.000" }, LD);
  const mk = (s, e) => P.normaliseEvent({ eventID: "c", name: "Zorua Community Day", eventType: "community-day", start: s, end: e, extraData: {} }, { id: "curated" });
  assert.deepEqual(P.diffFields(a, mk("2026-10-31T00:00", "2026-10-31T23:59")), {});
  assert.deepEqual(Object.keys(P.diffFields(a, mk("2026-11-01T00:00", "2026-11-01T23:59"))), ["start", "end"]);
  assert.deepEqual(Object.keys(P.diffFields(a, mk("2026-10-31T16:00", "2026-10-31T17:00"))), ["start"]);
});

test("worldwide tours/Wild Areas ('Alola - Global') are worldwide, not a region", () => {
  const g = P.normaliseEvent({ ...cd(), eventType: "pokemon-go-tour", name: "Pokémon GO Tour: Alola - Global 2027" }, LD);
  assert.equal(g.scope, "worldwide_local"); assert.equal(g.region, "Global");
});

test("titles supply featured Pokémon only when the source gives none, and are labelled as title-derived", () => {
  const m = P.normaliseEvent({ ...cd(), eventType: "max-battles", name: "Dynamax Uxie, Mesprit, and Azelf Max Battle Day", extraData: {} }, LD);
  assert.deepEqual(m.featured.map((f) => f.name), ["Uxie", "Mesprit", "Azelf"]); assert.ok(m.featured.every((f) => f.role === "title" && !f.dex));
  const r = P.normaliseEvent({ ...cd(), eventType: "max-mondays", name: "Dynamax Rookidee during Max Monday", extraData: {} }, LD);
  assert.deepEqual(r.featured.map((f) => f.name), ["Rookidee"]);
  const rh = P.normaliseEvent({ ...cd(), eventType: "raid-hour", name: "Dialga Raid Hour", extraData: {} }, LD);
  assert.deepEqual(rh.featured.map((f) => f.name), ["Dialga"]);
  assert.equal(P.normaliseEvent(cd(), LD).featured.find((f) => f.role === "title"), undefined, "structured data wins");
});
