import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertFreshSnapshot, staleReason, shouldSendStaleAlert, rebaselinePrev, diffStore, buildMessages } from "../scripts/store-watch.mjs";
import { judgeStoreSnapshot } from "../scripts/health.mjs";
import { storeSnapshotProblem } from "../scripts/uptime.mjs";
import { withEvidence } from "./store-evidence-fixture.mjs";
import { readFileSync as read } from "node:fs";

const mk = (names, price = i => "A$" + (i + 1) + ".99") => names.map((n, i) => ({ name: n, section: "box", href: "/purchase/item/" + n.toLowerCase().replace(/\W+/g, "-"), price: price(i), imgs: ["https://example.com/x.png"] }));
const snapOf = (items, fetched) => ({ ...withEvidence(items), fetched, items });
const run = (dir, snap, env = {}, args = []) => {
  writeFileSync(join(dir, "snap.json"), JSON.stringify(snap));
  return spawnSync(process.execPath, ["scripts/store-watch.mjs", join(dir, "snap.json"), ...args], { encoding: "utf8", env: { PATH: process.env.PATH, STORE_STATE: join(dir, "state.json"), STORE_LOG: join(dir, "log.json"), STORE_CURRENT_SNAPSHOT: join(dir, "cur.json"), ...env } });
};

test("a snapshot older than 6 hours (or with no time) is refused as stale", () => {
  const now = Date.now();
  assert.doesNotThrow(() => assertFreshSnapshot({ fetched: new Date(now - 5 * 36e5).toISOString() }, now));
  for (const f of [new Date(now - 7 * 36e5).toISOString(), undefined, "junk"]) assert.throws(() => assertFreshSnapshot({ fetched: f }, now), /^Error: stale snapshot$/);
  const dir = mkdtempSync(join(tmpdir(), "sw-"));
  const r = run(dir, snapOf(mk(["A one", "B two", "C three"]), new Date(now - 7 * 36e5).toISOString()));
  assert.notEqual(r.status, 0); assert.match(r.stderr, /stale snapshot/); assert.equal(existsSync(join(dir, "state.json")), false);
});

test("rebaseline: replaces a US$ baseline with the A$ snapshot, first:true, no messages, history kept", () => {
  const t = "2026-11-17T00:00:00.000Z";
  const usd = diffStore(null, snapOf(mk(["Ticket A", "Ticket B", "Box C"], i => "US$" + (i + 1) + ".99"), t), t);
  const prev = { ...usd.state, gone: { "/purchase/item/old": { name: "Old", goneAt: t } } };
  const d = diffStore(rebaselinePrev(prev), snapOf(mk(["Ticket A", "Ticket B", "Box C"]), t), "2026-11-17T01:00:00.000Z");
  assert.equal(d.first, true); assert.equal(d.held, undefined); assert.equal(d.reset, null);
  assert.equal(d.state.currency, "A$"); assert.equal(d.state.watchStart, prev.watchStart); assert.ok(d.state.gone["/purchase/item/old"]);
  // without rebaseline the same flip is held, not adopted
  assert.ok(diffStore(prev, snapOf(mk(["Ticket A", "Ticket B", "Box C"]), t), "2026-11-17T01:00:00.000Z").held);
});

test("STORE_REBASELINE=1 end to end: state rebuilt, nothing sent; without it the currency flip is held", () => {
  const dir = mkdtempSync(join(tmpdir(), "sw-")), now = new Date().toISOString();
  const old = diffStore(null, snapOf(mk(["Ticket A", "Ticket B", "Box C"], i => "US$" + (i + 1) + ".99"), now), now).state;
  writeFileSync(join(dir, "state.json"), JSON.stringify(old));
  const env = { TELEGRAM_BOT_TOKEN: "x", TELEGRAM_CHAT_ID: "1", DRY_RUN: "false", STORE_REBASELINE: "1" };
  const s = snapOf(mk(["Ticket A", "Ticket B", "Box C"]), new Date().toISOString());
  const r = run(dir, s, { ...env, HTTPS_PROXY: "http://127.0.0.1:9" });
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Rebaseline/); assert.doesNotMatch(r.stdout, /Sent \d/);
  const st = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
  assert.equal(st.currency, "A$"); assert.equal(st.lastObservation.status, "complete");
  assert.equal(Object.values(st.items)[0].price.startsWith("A$"), true);
});

test("rebaseline refuses an incomplete snapshot instead of wiping the saved catalogue", () => {
  const dir = mkdtempSync(join(tmpdir(), "sw-")), now = new Date().toISOString();
  const old = diffStore(null, snapOf(mk(["Ticket A", "Ticket B", "Box C"]), now), now).state;
  writeFileSync(join(dir, "state.json"), JSON.stringify(old));
  const s = { ...snapOf(mk(["Ticket A", "Ticket B", "Box C"]), now), completeness: undefined };
  const r = run(dir, s, { STORE_REBASELINE: "1", DRY_RUN: "false" });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /rebaseline refused/);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "state.json"), "utf8")), JSON.parse(JSON.stringify(old)));
});

test("stale reasons and the once-per-24h dedupe", () => {
  const now = Date.parse("2026-11-17T12:00:00Z"), h = n => now - n * 36e5;
  const fresh = { publicUpdated: new Date(h(2)).toISOString(), receivedMs: h(2) };
  assert.equal(staleReason(fresh, now), null);
  assert.match(staleReason({ ...fresh, publicUpdated: new Date(h(73)).toISOString() }, now), /3 days/);
  assert.match(staleReason({ ...fresh, receivedMs: h(7) }, now), /6 hours/);
  assert.match(staleReason({ ...fresh, receivedMs: null }, now), /6 hours/);
  assert.match(staleReason({ publicUpdated: undefined, receivedMs: h(1) }, now), /3 days/);
  assert.equal(shouldSendStaleAlert({ staleAlertAt: new Date(h(23)).toISOString() }, now), false);
  assert.equal(shouldSendStaleAlert({ staleAlertAt: new Date(h(25)).toISOString() }, now), true);
  assert.equal(shouldSendStaleAlert({}, now), true); assert.equal(shouldSendStaleAlert(null, now), true);
});

test("--stale-alert in dry run prints but saves nothing; a recent staleAlertAt suppresses it", () => {
  const dir = mkdtempSync(join(tmpdir(), "sw-")), old = new Date(Date.now() - 5 * 864e5).toISOString();
  writeFileSync(join(dir, "cur.json"), JSON.stringify({ updated: old })); writeFileSync(join(dir, "state.json"), JSON.stringify({ items: {} }));
  const env = { STORE_CURRENT_SNAPSHOT: join(dir, "cur.json"), STORE_INGEST_URL: "http://127.0.0.1:9/x", DRY_RUN: "true", TELEGRAM_BOT_TOKEN: "x", TELEGRAM_CHAT_ID: "1" };
  const go = e => spawnSync(process.execPath, ["scripts/store-watch.mjs", "--stale-alert"], { encoding: "utf8", env: { PATH: process.env.PATH, STORE_STATE: join(dir, "state.json"), ...env, ...e } });
  let r = go({}); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Stale: .*3 days/); assert.match(r.stdout, /Not sending/);
  assert.equal(JSON.parse(readFileSync(join(dir, "state.json"), "utf8")).staleAlertAt, undefined);
  writeFileSync(join(dir, "state.json"), JSON.stringify({ items: {}, staleAlertAt: new Date().toISOString() }));
  r = go({}); assert.match(r.stdout, /already alerted/);
});

test("health and uptime judge snapshot age (stale after 3 days)", () => {
  const now = Date.now();
  assert.equal(judgeStoreSnapshot(new Date(now - 36e5).toISOString(), now).state, "fresh");
  assert.equal(judgeStoreSnapshot(new Date(now - 80 * 36e5).toISOString(), now).state, "stale");
  assert.equal(judgeStoreSnapshot(undefined, now).state, "never");
  assert.equal(storeSnapshotProblem({ updated: new Date(now).toISOString() }, now), null);
  assert.ok(storeSnapshotProblem({ updated: new Date(now - 73 * 36e5).toISOString() }, now));
  assert.ok(storeSnapshotProblem({}, now));
});

test("workflow reads the Worker (no browser), has a rebaseline input, a stale alert, and keeps its permissions", () => {
  const wf = read(new URL("../.github/workflows/store-watch.yml", import.meta.url), "utf8");
  assert.match(wf, /curl --fail-with-body -sS https:\/\/pogo\.michaelpuff\.com\/api\/store-ingest -o \/tmp\/store-snapshot\.json/);
  assert.ok(!/playwright|store_snapshot\.py|setup-python/.test(wf));
  assert.match(wf, /rebaseline:\s*\n\s*description: .*\n\s*default: "false"/);
  assert.match(wf, /STORE_REBASELINE: \$\{\{ github\.event\.inputs\.rebaseline == 'true' && '1' \|\| '' \}\}/);
  assert.match(wf, /node scripts\/store-watch\.mjs --stale-alert/);
  assert.match(wf, /permissions:\n  contents: write\n/);
  assert.ok(!/STORE_INGEST_KEY/.test(wf), "the write key is never used by GitHub");
});
