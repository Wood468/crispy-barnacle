import test from "node:test";
import assert from "node:assert/strict";
import { makeDB, feed, raid, cd, NOW, HOUR, DAY } from "./helpers.mjs";
import * as P from "../src/pipeline.js";

const LD = { id: "leekduck", name: "Leek Duck (via ScrapedDuck)", url: "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json", kind: "community", defaultStatus: "community_reported", minItems: 10 };
const OFF = { id: "official", name: "Official source", url: "https://example.com/x", kind: "official", defaultStatus: "official_confirmed", minItems: 1 };
const CUR = { id: "curated", name: "Hand-curated", url: "x", kind: "curated", defaultStatus: "community_reported", minItems: 1 };
async function fresh() { const db = makeDB(); await P.migrate(db, NOW); return db; }
const src = (o) => ({ id: "s", kind: "community", state: "healthy", failStreak: 0, lastChecked: NOW - HOUR, lastOk: NOW - HOUR, ...o });

test("feed freshness: last successful refresh is distinct from last attempt", () => {
  // checked 10 minutes ago and failed; last good refresh was 5 hours ago
  const f = P.feedFreshness([src({ lastChecked: NOW - 10 * 60000, lastOk: NOW - 5 * HOUR, failStreak: 1, state: "degraded" })], NOW);
  assert.equal(f.lastSuccess, NOW - 5 * HOUR);
  assert.equal(f.lastAttempt, NOW - 10 * 60000);
  assert.notEqual(f.lastSuccess, f.lastAttempt);
  assert.equal(f.state, "failed");
});

test("feed freshness: fresh, degraded, stale, failed, never, none", () => {
  assert.equal(P.feedFreshness([src()], NOW).state, "fresh");
  assert.equal(P.feedFreshness([src({ id: "a" }), src({ id: "b", failStreak: 2, state: "failing" })], NOW).state, "degraded");
  assert.equal(P.feedFreshness([src({ lastOk: NOW - 40 * HOUR, lastChecked: NOW - HOUR })], NOW).state, "stale");
  assert.equal(P.feedFreshness([src({ failStreak: 3, state: "failing" })], NOW).state, "failed");
  assert.equal(P.feedFreshness([src({ lastOk: null, lastChecked: NOW - HOUR })], NOW).state, "never");
  assert.equal(P.feedFreshness([src({ lastOk: null, lastChecked: null })], NOW).state, "never");
  assert.equal(P.feedFreshness([], NOW).state, "none");
});

test("feed freshness: the curated snapshot and datamine are not an event-feed refresh", () => {
  const f = P.feedFreshness([src({ id: "curated", kind: "curated", lastOk: NOW, lastChecked: NOW }), src({ id: "dm", kind: "datamine", lastOk: NOW, lastChecked: NOW })], NOW);
  assert.equal(f.state, "none"); assert.equal(f.lastSuccess, null);
});

test("missing, invalid and future timestamps are never called fresh", () => {
  for (const bad of [null, undefined, "garbage", NaN]) {
    const f = P.feedFreshness([src({ lastOk: bad, lastChecked: bad })], NOW);
    assert.ok(["never", "unknown"].includes(f.state), String(bad) + " -> " + f.state); assert.equal(f.lastSuccess, null);
  }
  const future = P.feedFreshness([src({ lastOk: NOW + 3 * DAY, lastChecked: NOW + 3 * DAY })], NOW);
  assert.equal(future.state, "unknown"); assert.equal(future.lastSuccess, null, "a future time is not shown as a refresh time");
  assert.equal(P.sourceHealth({ last_checked: NOW + DAY, last_ok: NOW + DAY, fail_streak: 0, upcoming: 5 }, NOW).state, "unknown");
  assert.equal(P.sourceHealth({ last_checked: NOW, last_ok: "x", fail_streak: 0, upcoming: 5 }, NOW).state, "unknown");
  assert.equal(P.sourceHealth(null, NOW).state, "never");
});

test("feed freshness carries only times and counts: no trust or status field", () => {
  const f = P.feedFreshness([src()], NOW);
  assert.deepEqual(Object.keys(f).sort(), ["failing", "lastAttempt", "lastSuccess", "note", "state"]);
  assert.ok(!/official|community|datamin/i.test(JSON.stringify(f)));
});

test("real pipeline: a rejected refresh keeps the last good time and says failed, not fresh", async () => {
  const db = await fresh();
  await P.ingestFeed(db, LD, feed([raid(), cd()]), NOW);
  await P.ingestFeed(db, LD, "<html>rate limited</html>", NOW + 2 * HOUR);
  const list = await P.listSources(db, NOW + 2 * HOUR);
  const s = list[0], f = P.feedFreshness(list, NOW + 2 * HOUR);
  assert.equal(s.lastOk, NOW); assert.equal(s.lastChecked, NOW + 2 * HOUR); assert.ok(s.lastError);
  assert.equal(f.state, "failed"); assert.equal(f.lastSuccess, NOW); assert.equal(f.lastAttempt, NOW + 2 * HOUR);
});

test("real pipeline: a stale source is labelled stale and its last good time is unchanged", async () => {
  const db = await fresh();
  await P.ingestFeed(db, LD, feed([raid(), cd()]), NOW);
  const later = NOW + 50 * HOUR;
  const list = await P.listSources(db, later);
  assert.equal(list[0].state, "stale"); assert.equal(P.feedFreshness(list, later).state, "stale");
  assert.equal(P.feedFreshness(list, later).lastSuccess, NOW, "stale never rewrites the refresh time");
});

test("TRUST is independent of freshness: stale or failing sources keep every event's status", async () => {
  const db = await fresh();
  const DM = { id: "datamine", name: "Datamine", url: "x", kind: "datamine", defaultStatus: "datamined", minItems: 1 };
  await P.ingestFeed(db, LD, feed([raid(), cd()]), NOW);
  await P.ingestFeed(db, OFF, [{ eventID: "off1", name: "Official Spotlight Night", eventType: "event", link: "https://example.com/o", start: "2026-10-20T10:00", end: "2026-10-20T12:00", extraData: {} }], NOW, { official: true });
  await P.ingestFeed(db, DM, [{ eventID: "dm1", name: "Gigantamax Rillaboom Max Battles", eventType: "max-battles", link: "https://pokemongohub.net/p", start: "2026-12-01T10:00", end: "2026-12-02T10:00", extraData: {} }], NOW);
  const statuses = async (t) => Object.fromEntries((await P.listEvents(db, t, {})).events.map((e) => [e.name, e.status + "|" + e.announced]));
  const before = await statuses(NOW);
  // everything goes stale, then a refresh fails
  await P.ingestFeed(db, LD, "<html>nope</html>", NOW + 60 * HOUR);
  const after = await statuses(NOW + 60 * HOUR);
  const must = ["Mega Blastoise in Mega Raids", "Official Spotlight Night", "Gigantamax Rillaboom Max Battles"];   // filler events simply finish, so only these are compared
  for (const name of must) { assert.ok(before[name] && after[name], name + " present"); assert.equal(after[name], before[name], name + " kept its trust level"); }
  const list = await P.listSources(db, NOW + 60 * HOUR);
  assert.ok(list.some((s) => s.state === "failing" || s.state === "stale"), "sources really are stale or failing");
  assert.match(after["Gigantamax Rillaboom Max Battles"], /^datamined\|false/, "a datamine stays datamined and unannounced");
  assert.match(after["Mega Blastoise in Mega Raids"], /^community_reported/, "a community report stays community");
});
