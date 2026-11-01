import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const GOLIB = createRequire(import.meta.url)("../public/lib.js");
const src = readFileSync(new URL("../public/whatsnew.js", import.meta.url), "utf8");
const KEY = "gofn-seen-events";

/* A tiny browser: in-memory localStorage, a manual timer queue, a document that records listeners, and a controllable GODASH. */
function boot({ seen, state = "pending", events = [] } = {}) {
  const store = new Map();
  if (seen) store.set(KEY, JSON.stringify({ ids: seen, at: 1 }));
  const listeners = {}, timers = [], dash = { state, events };
  const doc = { addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); }, getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {}, querySelector: () => null, addEventListener() {} }) };
  const win = { GOLIB, GODASH: { events: () => dash.events, eventsState: () => dash.state } };
  const ctx = {
    window: win, document: doc, Date, JSON, Math, Array, Object, String, Promise, encodeURIComponent, console,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); } },
    setTimeout: (f) => { timers.push(f); return timers.length; },
    fetch: (u) => Promise.resolve({ ok: false, json: async () => null }),
  };
  runInNewContext(src, ctx);
  return {
    dash,
    seen: () => { const j = JSON.parse(store.get(KEY) || "null"); return j && j.ids; },
    tick: async (n = 1) => { for (let i = 0; i < n; i++) { const t = timers.splice(0); t.forEach((f) => f()); await Promise.resolve(); await Promise.resolve(); } },
    flush: () => new Promise((r) => setImmediate(r)),
    fire: () => (listeners["gofn-events-state"] || []).forEach((f) => f()),
  };
}
const list = (n) => Array.from({ length: n }, (_, i) => ({ id: "leekduck:e" + i, name: "Event " + i, end: "2999-01-01T00:00:00Z" }));
const ids = (n) => list(n).map((e) => e.id);

test("a stalled event list for 20 s never wipes the stored seen list", async () => {
  const w = boot({ seen: ids(12) });
  await w.flush();
  await w.tick(45); // the old code gave up after 40 half-second tries and saved an empty list
  await w.flush();
  assert.deepEqual(w.seen(), ids(12));
});

test("a first visit with a stalled list stores nothing; the list is recorded once it is real", async () => {
  const w = boot();
  await w.flush(); await w.tick(45); await w.flush();
  assert.equal(w.seen(), null, "nothing stored from an unready list");
  w.dash.state = "live"; w.dash.events = list(12); w.fire(); await w.flush();
  assert.deepEqual(w.seen(), ids(12));
});

test("a degraded fallback (feed failed or stalled) is a partial list: it is not saved or compared", async () => {
  const w = boot({ seen: ids(12) });
  w.dash.state = "degraded"; w.dash.events = list(10); w.fire(); await w.flush(); await w.tick(45); await w.flush();
  assert.deepEqual(w.seen(), ids(12));
});

test("the intentionally curated list (feed off) and a live list are both accepted", async () => {
  for (const state of ["curated", "live"]) {
    const w = boot();
    w.dash.state = state; w.dash.events = list(11); w.fire(); await w.flush();
    assert.equal(w.seen().length, 11, state);
  }
});

test("a live list arriving after a stalled one still compares against the old seen list", async () => {
  const w = boot({ seen: ids(12) });
  await w.flush(); await w.tick(45);
  w.dash.state = "degraded"; w.dash.events = list(10); w.fire(); await w.flush();
  assert.deepEqual(w.seen(), ids(12), "still the previous list after a stalled session");
  w.dash.state = "live"; w.dash.events = ids(12).map((id) => ({ id, end: "2999-01-01T00:00:00Z" })); w.fire(); await w.flush();
  assert.deepEqual(w.seen(), ids(12), "an unchanged live list with nothing new is simply re-recorded, never emptied");
});

test("the Got it button has no aria-label that hides its visible words", () => {
  assert.match(src, /<button type="button" class="wn-ok">Got it<\/button>/);
  assert.doesNotMatch(src, /aria-label="Mark updates as seen"/);
});
