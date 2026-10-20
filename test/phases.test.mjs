import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import { webcrypto } from "node:crypto";
import { makeDB, NOW, HOUR, DAY, feed, cd } from "./helpers.mjs";
import * as P from "../src/pipeline.js";
import * as US from "../src/userstate.js";
import * as NT from "../src/notify.js";
import worker from "../src/worker.js";
import { MIGRATIONS } from "../src/migrations.js";
const L = createRequire(import.meta.url)("../public/lib.js");
const DEX = JSON.parse(fs.readFileSync(new URL("../public/dex.json", import.meta.url)));
const LD = P.LEEKDUCK;

test("every migration .sql matches the code, is additive, and re-running is harmless", async () => {
  const dir = new URL("../migrations/", import.meta.url);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  assert.equal(files.length, MIGRATIONS.length);
  files.forEach((f, i) => {
    const sql = fs.readFileSync(new URL(f, dir), "utf8");
    assert.equal(sql.trim(), MIGRATIONS[i].sql.trim(), f);
    const code = sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
    assert.ok(!/\b(DROP|DELETE|UPDATE|ALTER|INSERT|REPLACE)\b/i.test(code), f + " is additive only");
  });
  const db = makeDB(); await P.migrate(db, NOW); await P.migrate(db, NOW);
  assert.ok(await US.stateReady(db)); assert.ok(await NT.notifyReady(db));
});

test("forms catalogue: parse names, keys, and entry-wise merge never loses a newer edit", () => {
  assert.deepEqual(L.parseForm("Mega Charizard X"), { base: "Charizard", key: "mega-x", special: null });
  assert.equal(L.parseForm("Hisuian Growlithe").key, "hisui");
  assert.equal(L.parseForm("Shadow Mewtwo").key, null);
  const f = JSON.parse(fs.readFileSync(new URL("../public/forms.json", import.meta.url))).f;
  assert.ok(f.length > 150 && f.some((x) => x[0] === 37 && x[1] === "alola"));
  const phone = { "form:37:alola": { v: 1, t: 10 }, "follow:Eevee": { v: true, t: 5 } };
  const laptop = { "form:37:alola": { v: 0, t: 20 }, "saved:x": { v: true, t: 7 } };
  const m = L.merge(phone, laptop);
  assert.equal(m["form:37:alola"].v, 0); assert.ok(m["follow:Eevee"] && m["saved:x"]);
  assert.deepEqual(L.merge(phone, laptop), L.merge(laptop, phone), "order doesn't matter");
});

test("name matching: exact, close, cut-off, ambiguous is never guessed", () => {
  assert.equal(L.matchName("Pikachu", DEX).score, 1);
  assert.equal(L.matchName("Charizar", DEX).dex, 6);
  assert.equal(L.matchName("Nidoran", DEX).ambiguous, true);
  assert.equal(L.matchName("xyzzyq", DEX), null);
  assert.equal(L.matchName("Pik", DEX), null, "too short to trust");
});

test("userstate: validation, newest wins, deletions sync, caps", async () => {
  const db = makeDB(); await P.migrate(db, NOW);
  const { entries, rejected } = US.cleanEntries({ entries: { "form:25:alola": { v: 1, t: 5 }, "evil:key": { v: 1, t: 1 }, "saved:a": { v: "x".repeat(900), t: 1 }, "follow:Eevee": { v: true, t: NOW + 10 * DAY } } }, NOW);
  assert.deepEqual(Object.keys(entries).sort(), ["follow:Eevee", "form:25:alola"]); assert.equal(rejected.length, 2);
  assert.ok(entries["follow:Eevee"].t <= NOW + 60000, "future timestamps are clamped");
  await US.writeEntries(db, entries);
  const r = await US.writeEntries(db, { "form:25:alola": { v: "0", t: 3 } });
  assert.equal(r.ignored, 1, "older edit ignored");
  await US.writeEntries(db, { "form:25:alola": { v: null, t: 9 } });
  assert.equal((await US.readAll(db))["form:25:alola"].v, null, "deletion kept as a tombstone");
  assert.equal(Object.keys(await US.readAll(db, 8)).length, 2, "since= returns only newer entries");
  assert.equal(Object.keys(await US.readAll(db, 10)).length, 1);
});

const env = (db, extra = {}) => ({ DB: db, SYNC_PIN: "1234", ASSETS: { fetch: async (r) => new Response(String(r.url).endsWith("dex.json") ? JSON.stringify(DEX) : "{}") }, ...extra });
const call = (e, path, init = {}, pin = "1234") => worker.fetch(new Request("https://x.test" + path, { ...init, headers: { "x-pin": pin, "content-type": "application/json", ...(init.headers || {}) } }), e, { waitUntil() {} });

test("routes: PIN required, nothing created until init, then sync round-trips", async () => {
  const db = makeDB(); const e = env(db);
  assert.equal((await call(e, "/api/userstate", {}, "bad")).status, 401);
  assert.equal((await (await call(e, "/api/userstate")).json()).enabled, false);
  assert.equal((await call(e, "/api/userstate/init", { method: "POST" })).status, 200);
  await call(e, "/api/userstate", { method: "PUT", body: JSON.stringify({ entries: { "follow:Eevee": { v: true, t: NOW } } }) });
  const j = await (await call(e, "/api/userstate")).json();
  assert.equal(j.enabled, true); assert.equal(j.entries["follow:Eevee"].v, true);
  assert.equal((await call({ ...e, SYNC_PIN: undefined }, "/api/userstate")).status, 404, "off without a PIN secret");
});

test("PIN throttling is per source IP; one visitor cannot lock out another", async () => {
  const e = env(makeDB());
  const request = (pin, ip) => worker.fetch(new Request("https://x.test/api/userstate", {
    headers: { "x-pin": pin, "cf-connecting-ip": ip }
  }), e, { waitUntil() {} });
  for (let i = 0; i < 10; i++) assert.equal((await request("wrong", "192.0.2.10")).status, 401);
  assert.equal((await request("wrong", "192.0.2.10")).status, 429);
  assert.equal((await request("1234", "192.0.2.11")).status, 200);
  const indexes = e.DB.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'pin_fails_ip'").all().map((x) => x.name);
  assert.ok(indexes.includes("pin_fails_ip_lookup"), "per-IP throttling uses an indexed lookup");
  assert.ok(indexes.includes("pin_fails_ip_cleanup"), "stale failure cleanup uses an indexed timestamp");
});

// ---- notifications ----
const ev = (o) => ({ id: "leekduck:e1", name: "Test Event", type: "community-day", start: "2026-10-10T02:00:00.000", end: "2026-10-10T05:00:00.000", tzMode: "local", status: "community_reported", announced: true, missing: false, featured: [], reports: [{ firstSeen: NOW - HOUR, lastChanged: NOW - HOUR, link: "https://leekduck.com/events/e1/" }], ...o });
const prefs = NT.prefsFrom({ "pref:notify.on": { v: true }, "pref:notify.datamine": { v: true } });
const base = { now: NOW, baseline: NOW - DAY, prefs, follows: new Set(), forms: {}, ownDex: new Set(), haveMarks: false, newDatamine: [], dexByName: new Map(DEX.map((x) => [x[1].toLowerCase(), x[0]])) };
const kinds = (c) => c.map((x) => x.kind).sort();

test("localToMs handles Melbourne daylight saving", () => {
  assert.equal(new Date(NT.localToMs("2026-10-10T14:00:00.000", "Australia/Melbourne")).toISOString(), "2026-10-10T03:00:00.000Z");
  assert.equal(new Date(NT.localToMs("2026-06-10T14:00:00.000", "Australia/Melbourne")).toISOString(), "2026-06-10T04:00:00.000Z");
});

test("alerts: announced, starting soon, missing/followed; datamine is info only", () => {
  const c = NT.buildCandidates({ ...base, follows: new Set(["zorua"]), events: [ev({ featured: [{ name: "Zorua", role: "spawn" }] })], newDatamine: [{ id: "V1_X", name: "Foo", seen: NOW }] });
  assert.deepEqual(kinds(c), ["announced", "datamine", "missing", "starting"]);
  assert.equal(c.find((x) => x.kind === "datamine").level, "info");
  assert.match(c.find((x) => x.kind === "datamine").body, /NOT ANNOUNCED/);
});

test("confidence: datamined, conflicting, undated or unknown-time events never alert", () => {
  for (const bad of [{ status: "datamined", announced: false }, { status: "conflicting" }, { tzMode: "unknown" }, { missing: true }]) {
    const c = NT.buildCandidates({ ...base, follows: new Set(["zorua"]), events: [ev({ featured: [{ name: "Zorua" }], ...bad })] });
    assert.deepEqual(c, [], JSON.stringify(bad));
  }
});

test("long events don't get 'starting' pings; date-only starts don't either; shinies aren't 'missing'", () => {
  const long = NT.buildCandidates({ ...base, events: [ev({ end: "2026-10-20T20:00:00.000" })] });
  assert.ok(!kinds(long).includes("starting"));
  const dateOnly = NT.buildCandidates({ ...base, events: [ev({ start: "2026-10-10T00:00:00.000", end: "2026-10-10T23:59:00.000" })] });
  assert.ok(!kinds(dateOnly).includes("starting"));
  const shiny = NT.buildCandidates({ ...base, follows: new Set(["zorua"]), events: [ev({ featured: [{ name: "Zorua", role: "shiny_form" }] })] });
  assert.ok(!kinds(shiny).includes("missing"));
});

test("missing: Need needs a confirmed generation; Not tracked never alerts", () => {
  const e = [ev({ featured: [{ name: "Zorua" }] })];       // Zorua = #570, Gen 5
  const alerts = (o) => kinds(NT.buildCandidates({ ...base, events: e, ...o }));
  assert.ok(!alerts({}).includes("missing"), "no marks -> Not tracked -> no alert");
  assert.ok(!alerts({ haveMarks: true, ownDex: new Set([25]) }).includes("missing"), "marks alone do not make Zorua a Need");
  assert.ok(!alerts({ haveMarks: true, ownDex: new Set([25]), confirmedGens: new Set([1]) }).includes("missing"), "a different confirmed generation does not make Gen 5 a Need");
  assert.ok(alerts({ haveMarks: true, ownDex: new Set([25]), confirmedGens: new Set([5]) }).includes("missing"), "Gen 5 confirmed complete + not owned -> Need");
  assert.ok(!alerts({ haveMarks: true, ownDex: new Set([570]), confirmedGens: new Set([5]) }).includes("missing"), "owned -> Have, no alert");
  assert.ok(!alerts({ haveMarks: true, ownDex: new Set([]), confirmedGens: new Set() }).includes("missing"), "nothing confirmed -> no alert");
});

test("missing: forms and regional variants are not implied by the base species", () => {
  // Alolan Vulpix: base 37 is owned and Gen 1 confirmed, but the alert still must not treat the form as the base species
  const e = [ev({ featured: [{ name: "Alolan Vulpix" }] })];
  const c = NT.buildCandidates({ ...base, events: e, haveMarks: true, ownDex: new Set([1]), confirmedGens: new Set([1]) });
  assert.ok(!kinds(c).includes("missing"), "a form is never reported as missing from base-species marks");
});

test("missing: the follow reason is independent of ownership", () => {
  const e = [ev({ featured: [{ name: "Zorua" }] })];
  const c = NT.buildCandidates({ ...base, events: e, follows: new Set(["zorua"]) });
  assert.ok(kinds(c).includes("missing"));
  assert.ok(!c.find((x) => x.kind === "missing").body.includes("not owned"), "follow alert makes no ownership claim");
});

async function notifyDb(extraState = {}) {
  const db = makeDB(); await P.migrate(db, NOW);
  await P.ingestFeed(db, LD, feed([cd({ eventID: "soon", name: "Soon Community Day", start: "2026-10-09T18:00:00.000", end: "2026-10-09T21:00:00.000" })]), NOW - 2 * DAY);
  const st = { "pref:notify.on": { v: true, t: 1 }, ...extraState };
  await US.writeEntries(db, US.cleanEntries({ entries: st }, NOW).entries);
  return db;
}
const deps = { listEvents: P.listEvents, dexList: DEX };
const tgOk = (log) => async (u, o) => { log.push({ u, o }); return new Response("{}", { status: 200 }); };

test("run: off by default; first run only records a baseline; then sends once and dedupes", async () => {
  const db = await notifyDb(); const sent = [];
  const e = { TELEGRAM_BOT_TOKEN: "T", TELEGRAM_CHAT_ID: "9" };
  const off = makeDB(); await P.migrate(off, NOW);
  assert.match((await NT.runNotify(e, off, NOW, tgOk(sent), deps)).skipped, /switched off/);
  const first = await NT.runNotify(e, db, NOW - 3 * HOUR, tgOk(sent), deps);
  assert.ok(first.baseline); assert.equal(sent.length, 0);
  await P.ingestFeed(db, LD, feed([cd({ eventID: "fresh", name: "Fresh Raid Day", start: "2026-10-09T23:00:00.000", end: "2026-10-10T02:00:00.000" })]), NOW - 1 * HOUR);
  const r1 = await NT.runNotify(e, db, NOW, tgOk(sent), deps);
  assert.ok(r1.sent >= 1); const n = sent.length;
  assert.ok(sent.every((s) => s.u.startsWith("https://api.telegram.org/botT/sendMessage")));
  const r2 = await NT.runNotify(e, db, NOW + 60000, tgOk(sent), deps);
  assert.equal(r2.sent, 0); assert.equal(sent.length, n, "same alerts are never sent twice");
});

test("run: a failed send is retried next time, not lost and not repeated", async () => {
  const db = await notifyDb(); const e = { TELEGRAM_BOT_TOKEN: "T", TELEGRAM_CHAT_ID: "9" };
  await NT.runNotify(e, db, NOW - 3 * HOUR, tgOk([]), deps);
  await P.ingestFeed(db, LD, feed([cd({ eventID: "fresh", name: "Fresh Raid Day", start: "2026-10-09T23:00:00.000", end: "2026-10-10T02:00:00.000" })]), NOW - HOUR);
  const bad = await NT.runNotify(e, db, NOW, async () => new Response("no", { status: 500 }), deps);
  assert.ok(bad.failed >= 1 && bad.sent === 0);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM notif_sent").first()).n, 0);
  const sent = []; const ok = await NT.runNotify(e, db, NOW + 1, tgOk(sent), deps);
  assert.ok(ok.sent >= 1);
});

test("no channel configured: nothing breaks, nothing is sent", async () => {
  const db = await notifyDb(); await NT.runNotify({}, db, NOW - 3 * HOUR, tgOk([]), deps);
  const r = await NT.runNotify({}, db, NOW, tgOk([]), deps); assert.equal(r.sent, 0);
});

test("web push: VAPID signature verifies, endpoints are allow-listed, gone devices are removed", async () => {
  const db = makeDB(); await P.migrate(db, NOW);
  const keys = await NT.vapidCreate(db);
  const jwt = await NT.vapidJwt(keys, "https://web.push.apple.com", "https://pogo.michaelpuff.com", NOW);
  const [h, b, s] = jwt.split(".");
  const un = (x) => Buffer.from(x, "base64url");
  const pub = await webcrypto.subtle.importKey("raw", un(keys.pub), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.ok(await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, un(s), Buffer.from(h + "." + b)));
  assert.equal(JSON.parse(un(b)).aud, "https://web.push.apple.com");
  assert.ok(NT.okPushEndpoint("https://web.push.apple.com/abc") && NT.okPushEndpoint("https://fcm.googleapis.com/fcm/send/x"));
  assert.ok(!NT.okPushEndpoint("https://evil.test/x") && !NT.okPushEndpoint("http://web.push.apple.com/x") && !NT.okPushEndpoint("https://169.254.169.254/"));
  await db.prepare("INSERT INTO push_subs (id, endpoint, created_at) VALUES ('a','https://web.push.apple.com/gone',1)").run();
  const r = await NT.sendPush({}, db, async () => new Response("", { status: 410 }), NOW);
  assert.equal(r.status, "failed"); assert.equal((await db.prepare("SELECT COUNT(*) n FROM push_subs").first()).n, 0);
});

test("scheduled(): nightly cron keeps old behaviour; other crons only run pipeline/notify when switched on", async () => {
  const calls = []; const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => { calls.push(String(u)); return new Response("{}", { status: 500 }); };
  try {
    const db = makeDB(); const waits = []; const ctx = { waitUntil: (p) => waits.push(p) };
    await worker.scheduled({ cron: "0 */6 * * *", scheduledTime: Date.parse("2026-01-01T03:30:00Z") }, env(db), ctx); await Promise.all(waits);
    assert.equal(calls.length, 0, "six-hourly cron does nothing while PIPELINE/NOTIFY are unset");
    waits.length = 0; await worker.scheduled({ cron: "30 20 * * *" }, env(db), ctx); await Promise.all(waits);
    assert.ok(calls.some((u) => u.includes("PokeMiners")), "nightly datamine still runs");
  } finally { globalThis.fetch = realFetch; }
});
