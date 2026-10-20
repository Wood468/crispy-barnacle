import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const LIB = require("../public/lib.js");

test("user-state sync: acknowledged local write clears its dirty flag", () => {
  const sent = { "saved:event-1": { v: true, t: 100 } };
  const result = LIB.reconcileSync(sent, sent, { "saved:event-1": 1 }, sent, 200);
  assert.deepEqual(result.entries["saved:event-1"], sent["saved:event-1"]);
  assert.deepEqual(result.dirty, {});
  assert.deepEqual(result.upload, {});
});

test("user-state sync: same-millisecond conflict keeps the local edit and advances its timestamp", () => {
  const local = { "saved:event-1": { v: true, t: 100 } };
  const sent = { "saved:event-1": { v: true, t: 100 } };
  const server = { "saved:event-1": { v: false, t: 100 } };
  const result = LIB.reconcileSync(local, server, { "saved:event-1": 1 }, sent, 100);
  assert.equal(result.entries["saved:event-1"].v, true);
  assert.ok(result.entries["saved:event-1"].t > server["saved:event-1"].t);
  assert.equal(result.dirty["saved:event-1"], 1);
  assert.deepEqual(result.upload["saved:event-1"], result.entries["saved:event-1"]);
});

test("user-state sync: edit made while request is in flight wins even when the clock timestamp ties", () => {
  const sent = { "saved:event-1": { v: true, t: 100 } };
  const local = { "saved:event-1": { v: null, t: 100 } };
  const server = { "saved:event-1": { v: true, t: 100 } };
  const result = LIB.reconcileSync(local, server, { "saved:event-1": 1 }, sent, 100);
  assert.equal(result.entries["saved:event-1"].v, null);
  assert.ok(result.entries["saved:event-1"].t > server["saved:event-1"].t);
  assert.equal(result.dirty["saved:event-1"], 1);
  assert.equal(result.upload["saved:event-1"].v, null);
});

test("user-state sync: newer server value wins and clears stale dirty state", () => {
  const local = { "saved:event-1": { v: true, t: 100 } };
  const sent = { "saved:event-1": { v: true, t: 100 } };
  const server = { "saved:event-1": { v: false, t: 101 } };
  const result = LIB.reconcileSync(local, server, { "saved:event-1": 1 }, sent, 200);
  assert.deepEqual(result.entries["saved:event-1"], server["saved:event-1"]);
  assert.deepEqual(result.dirty, {});
  assert.deepEqual(result.upload, {});
});

test("user-state sync: different local and remote keys merge without replacing each other", () => {
  const local = { "saved:event-1": { v: true, t: 200 } };
  const server = { "follow:pikachu": { v: "Pikachu", t: 150 } };
  const result = LIB.reconcileSync(local, server, { "saved:event-1": 1 }, local, 300);
  assert.deepEqual(result.entries, { ...local, ...server });
  assert.deepEqual(result.upload, local);
  assert.deepEqual(result.dirty, { "saved:event-1": 1 });
});

test("user-state sync: local-only entries are uploaded even when they were not marked dirty", () => {
  const local = { "saved:legacy-event": { v: true, t: 100 } };
  const result = LIB.reconcileSync(local, {}, {}, {}, 200);
  assert.deepEqual(result.entries, local);
  assert.deepEqual(result.dirty, { "saved:legacy-event": 1 });
  assert.deepEqual(result.upload, local);
});

test("user-state sync: newer tombstone is uploaded so a deletion reaches the server", () => {
  const key = "saved:event-1";
  const local = { [key]: { v: null, t: 200 } };
  const server = { [key]: { v: true, t: 150 } };
  const result = LIB.reconcileSync(local, server, { [key]: 1 }, local, 300);
  assert.deepEqual(result.entries[key], local[key]);
  assert.deepEqual(result.upload[key], local[key]);
  assert.equal(result.dirty[key], 1);
});
