import test from "node:test";
import assert from "node:assert/strict";
import { scheduleStatus, runWatchdog, runHourly } from "../src/jobs.js";

// A tiny stand-in for D1 (just the statements jobs.js uses).
function fakeEnv(extra = {}) {
  const rows = new Map();
  const db = { prepare: sql => ({ _a: [], bind(...a) { this._a = a; return this; },
    async run() { if (/^INSERT/.test(sql)) rows.set(this._a[0], this._a[1]); return {}; },
    async first() { return /^SELECT/.test(sql) && rows.has(this._a[0]) ? { value: rows.get(this._a[0]) } : null; } }) };
  return { DB: db, TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "c", rows, ...extra };
}
const NOW = new Date("2026-10-20T06:00:00Z");
const ago = h => new Date(NOW.getTime() - h * 36e5).toISOString();
function fetcher(runs, status = 200) {
  const sent = [];
  const f = async (url, init = {}) => {
    if (/api\.github\.com/.test(url)) return new Response(JSON.stringify({ workflow_runs: runs }), { status });
    sent.push(JSON.parse(init.body)); return new Response("{}", { status: 200 });
  };
  f.sent = sent; return f;
}

test("scheduleStatus: no runs or an old newest run is stale, a recent one is not", () => {
  assert.equal(scheduleStatus([], NOW.getTime()).stale, true);
  assert.equal(scheduleStatus(undefined, NOW.getTime()).last, null);
  assert.equal(scheduleStatus([{ created_at: ago(5) }, { created_at: ago(1) }], NOW.getTime()).stale, false);
  assert.equal(scheduleStatus([{ created_at: ago(4) }], NOW.getTime()).stale, true);
  assert.equal(scheduleStatus([{ created_at: "nonsense" }], NOW.getTime()).stale, true);
});

test("watchdog: warns once when scheduled runs stop, then says when they are back", async () => {
  const env = fakeEnv();
  const down = fetcher([{ created_at: ago(9) }]);
  assert.equal((await runWatchdog(env, { now: NOW, fetch: down })).alerted, true);
  assert.equal(down.sent.length, 1);
  assert.match(down.sent[0].text, /scheduled jobs have stopped/);
  assert.equal((await runWatchdog(env, { now: NOW, fetch: down })).stale, true);
  assert.equal(down.sent.length, 1, "no repeat while it stays down");
  const up = fetcher([{ created_at: ago(0.2) }]);
  assert.equal((await runWatchdog(env, { now: NOW, fetch: up })).recovered, true);
  assert.match(up.sent[0].text, /running again/);
  assert.equal((await runWatchdog(env, { now: NOW, fetch: up })).stale, false);
  assert.equal(up.sent.length, 1, "recovery is announced once");
});

test("watchdog: never-run repo counts as stale; a failed GitHub call or missing Telegram says nothing", async () => {
  const env = fakeEnv(), none = fetcher([]);
  assert.equal((await runWatchdog(env, { now: NOW, fetch: none })).alerted, true);
  assert.match(none.sent[0].text, /None has started yet/);
  const env2 = fakeEnv(), limited = fetcher([], 403);
  assert.match((await runWatchdog(env2, { now: NOW, fetch: limited })).note, /HTTP 403/);
  assert.equal(limited.sent.length, 0);
  assert.match((await runWatchdog(fakeEnv({ TELEGRAM_BOT_TOKEN: undefined }), { now: NOW, fetch: none })).note, /not set up/);
});

test("watchdog: a failed Telegram send is retried next hour", async () => {
  const env = fakeEnv();
  const f = async url => /api\.github\.com/.test(url) ? new Response(JSON.stringify({ workflow_runs: [] })) : new Response("no", { status: 500 });
  assert.equal((await runWatchdog(env, { now: NOW, fetch: f })).alerted, false);
  const ok = fetcher([]);
  assert.equal((await runWatchdog(env, { now: NOW, fetch: ok })).alerted, true);
});

test("hourly run includes the watchdog without breaking when Telegram is not set up", async () => {
  const r = await runHourly(fakeEnv({ TELEGRAM_BOT_TOKEN: undefined }), new Date("2026-10-14T06:30:00Z"));
  assert.ok(r.watchdog && !r.watchdog.error);
});
