import test from "node:test";
import assert from "node:assert/strict";
import { diffStore, deriveCompleteness, stampPublication, storeLog, storeCurrentSnapshot } from "../scripts/store-watch.mjs";
import { evidenceFor, withEvidence } from "./store-evidence-fixture.mjs";

const T0 = "2026-11-14T05:00:00.000Z", T1 = "2026-11-14T06:00:00.000Z", T2 = "2026-11-14T07:00:00.000Z";
const item = n => ({ href: "/purchase/item/sku-" + n, name: "Product " + n, price: "A$1.00",
  section: n < 10 ? "POKECOINS" : n < 20 ? "ITEMS" : "LIMITED_TIME", imgs: [] });
const items = n => Array.from({ length: n }, (_, k) => item(k));
const prevState = (extra = {}) => ({ currency: "A$", watchStart: "2026-11-10T00:00:00.000Z", updated: T0,
  lastPublishedAt: "2026-11-10T00:00:00.000Z", gone: {}, ...extra,
  items: Object.fromEntries(items(35).map(i => [i.href, { name: i.name, price: i.price, section: i.section,
    firstSeen: "2026-11-10T00:00:00.000Z", lastSeen: T0, images: [] }])) });

test("evidence validation: well-formed producer evidence is complete", () => {
  assert.equal(deriveCompleteness(withEvidence(items(30))).complete, true);
});

test("evidence validation: missing, garbled, forged or inconsistent evidence is incomplete", () => {
  const good = items(30);
  const bad = {
    "no completeness": { items: good },
    "bare verified at top level": { items: good, verified: true },
    "bare completeness.verified": { items: good, completeness: { verified: true } },
    "verified plus real evidence is ignored when evidence is bad": { items: good, completeness: { ...evidenceFor(good, { loadComplete: false }), verified: true } },
    "string instead of object": { items: good, completeness: "complete" },
    "wrong schema": withEvidence(good, { schema: 2 }),
    "wrong producer": withEvidence(good, { producer: "someone-else" }),
    "load not complete": withEvidence(good, { loadComplete: false }),
    "only one stable pass": withEvidence(good, { stablePasses: 1 }),
    "section total mismatch": withEvidence(good, { sections: [{ name: "ITEMS", count: 29 }] }),
    "section names differ from items": withEvidence(good, { sections: [{ name: "OTHER", count: 30 }] }),
    "unnamed placeholder cards": withEvidence(good, { cards: 31 }),
    "non-integer count": withEvidence(good, { sections: [{ name: "ITEMS", count: "30" }] })
  };
  for (const [label, snap] of Object.entries(bad)) {
    const r = deriveCompleteness(snap);
    assert.equal(r.complete, false, label);
    assert.ok(r.reason, label);
  }
});

test("forged {verified:true} (both shapes) can never retire SKUs or shrink the catalogue", () => {
  for (const forged of [{ verified: true }, { completeness: { verified: true } }]) {
    const d = diffStore(prevState(), { items: items(34), ...forged }, T1);
    assert.equal(d.held?.reason, "incomplete-snapshot");
    assert.equal(d.gone.length, 0);
    assert.equal(Object.keys(d.state.items).length, 35);
  }
});

test("35->34 with complete evidence is held once, then retired by a second consecutive complete scrape", () => {
  const d1 = diffStore(prevState(), withEvidence(items(34)), T1);
  assert.equal(d1.held?.reason, "awaiting-corroboration");
  assert.deepEqual(Object.keys(d1.state.pendingGone), ["/purchase/item/sku-34"]);
  assert.equal(Object.keys(d1.state.items).length, 35);
  const d2 = diffStore(d1.state, withEvidence(items(34)), T2);
  assert.equal(d2.held, undefined);
  assert.deepEqual(d2.gone.map(g => g.name), ["Product 34"]);
  assert.equal(Object.keys(d2.state.items).length, 34);
  assert.equal(d2.state.pendingGone, undefined);
  assert.ok(d2.state.gone["/purchase/item/sku-34"]);
});

test("35->34 where the SKU's own end date has passed retires on one complete scrape", () => {
  const prev = prevState(); prev.items["/purchase/item/sku-34"].endsAt = "2026-11-14T00:00:00.000Z";
  const d = diffStore(prev, withEvidence(items(34)), T1);
  assert.equal(d.held, undefined);
  assert.equal(d.gone.length, 1);
});

test("an end date still in the future is not corroboration", () => {
  const prev = prevState(); prev.items["/purchase/item/sku-34"].endsAt = "2026-11-20T00:00:00.000Z";
  assert.equal(diffStore(prev, withEvidence(items(34)), T1).held?.reason, "awaiting-corroboration");
});

test("35->34 with incomplete evidence is held and never counts toward corroboration", () => {
  const d1 = diffStore(prevState(), { items: items(34) }, T1);
  assert.equal(d1.held?.reason, "incomplete-snapshot");
  assert.equal(d1.state.pendingGone, undefined);
  const d2 = diffStore(d1.state, withEvidence(items(34), { loadComplete: false }), T2);
  assert.equal(d2.held?.reason, "incomplete-snapshot");
  assert.equal(d2.gone.length, 0);
});

test("a pending absence is cleared when the SKU reappears", () => {
  const d1 = diffStore(prevState(), withEvidence(items(34)), T1);
  const d2 = diffStore(d1.state, withEvidence(items(35)), T2);
  assert.equal(d2.held, undefined);
  assert.equal(d2.state.pendingGone, undefined);
  const d3 = diffStore(d2.state, withEvidence(items(34)), "2026-11-14T08:00:00.000Z");
  assert.equal(d3.held?.reason, "awaiting-corroboration", "counter restarted");
});

test("heartbeat: advances on a valid complete unchanged run, only when stamped after publication", () => {
  const d = diffStore(prevState(), withEvidence(items(35)), T1);
  assert.equal(d.state.lastPublishedAt, "2026-11-10T00:00:00.000Z", "diffStore itself never advances it");
  assert.equal(d.state.lastObservation.status, "complete");
  const stamped = stampPublication(d.state, "2026-11-14T06:05:00.000Z");
  assert.equal(stamped.lastPublishedAt, T1);
});

test("heartbeat: never advances after held, invalid, incomplete-evidence or stale observations", () => {
  const cases = {
    "held awaiting": diffStore(prevState(), withEvidence(items(34)), T1),
    large: diffStore(prevState(), withEvidence(items(18)), T1),
    incomplete: diffStore(prevState(), { items: items(34) }, T1),
    invalid: diffStore(prevState(), { items: items(2) }, T1),
    unverifiedNoMissing: diffStore(prevState(), { items: items(35) }, T1)
  };
  for (const [label, d] of Object.entries(cases)) {
    assert.equal(stampPublication(d.state, "2026-11-14T06:05:00.000Z").lastPublishedAt, "2026-11-10T00:00:00.000Z", label);
  }
  const ok = diffStore(prevState(), withEvidence(items(35)), T1);
  assert.equal(stampPublication(ok.state, "2026-11-14T09:00:00.000Z").lastPublishedAt, "2026-11-10T00:00:00.000Z", "stale observation");
  assert.equal(stampPublication(prevState(), T1).lastPublishedAt, "2026-11-10T00:00:00.000Z", "no observation record");
});

test("heartbeat and pending counters never appear in public outputs", () => {
  const d = diffStore(prevState(), withEvidence(items(34)), T1);
  const stamped = stampPublication(diffStore(prevState(), withEvidence(items(35)), T1).state, "2026-11-14T06:05:00.000Z");
  for (const state of [d.state, stamped]) {
    const out = JSON.stringify([storeLog(state), storeCurrentSnapshot(state)]);
    assert.ok(!/lastPublishedAt|lastObservation|pendingGone|completeness/.test(out));
  }
});

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("--stamp-publication CLI stamps a fresh complete observation and leaves held ones alone", () => {
  const dir = mkdtempSync(join(tmpdir(), "store-stamp-")), file = join(dir, "state.json");
  const now = Date.now(), recent = new Date(now - 60000).toISOString();
  const run = state => { writeFileSync(file, JSON.stringify(state)); execFileSync("node", ["scripts/store-watch.mjs", "--stamp-publication"], { env: { ...process.env, STORE_STATE: file } }); return JSON.parse(readFileSync(file, "utf8")); };
  assert.equal(run({ items: {}, lastObservation: { at: recent, status: "complete" } }).lastPublishedAt, recent);
  assert.equal(run({ items: {}, lastPublishedAt: "2026-01-01T00:00:00.000Z", lastObservation: { at: recent, status: "held", reason: "large-drop" } }).lastPublishedAt, "2026-01-01T00:00:00.000Z");
});

test("workflow stamps the heartbeat only inside the non-dry-run publication step, before the commit", () => {
  const wf = readFileSync(new URL("../.github/workflows/store-watch.yml", import.meta.url), "utf8");
  const step = wf.slice(wf.indexOf("- name: Remember what was seen"));
  assert.match(step, /if: \$\{\{ github\.event_name != 'workflow_dispatch'/);
  assert.ok(step.indexOf("--stamp-publication") > 0 && step.indexOf("--stamp-publication") < step.indexOf("git commit"));
});

test("no public/** file carries the private heartbeat or corroboration fields", () => {
  const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  for (const f of walk("public").filter(f => /\.(json|js|html)$/.test(f))) {
    assert.ok(!/lastPublishedAt|pendingGone|lastObservation/.test(readFileSync(f, "utf8")), f);
  }
});
