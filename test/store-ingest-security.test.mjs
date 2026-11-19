import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { withEvidence } from "./store-evidence-fixture.mjs";

const KEY = "k".repeat(40);
const ctx = { waitUntil() {} };
const items = ["a", "b", "c", "d"].map((n, i) => ({
  name: "Item " + n, section: "box", href: "/purchase/" + n,
  price: "A$" + (i + 1) + ".99", imgs: []
}));
const raw = { ...withEvidence(items), fetched: new Date().toISOString(),
  items: items.map(i => ({ ...i, privateRegionPrice: "IDR 100", internalId: "secret" })),
  internalMetadata: "secret" };
const request = (method, key, body) => new Request("https://test.invalid/api/store-ingest", {
  method, headers: { ...(key ? { "x-ingest-key": key } : {}), "content-type": "application/json" },
  ...(method === "POST" ? { body: JSON.stringify(body || raw) } : {})
});
const envFor = (row, approval) => {
  const queries = [];
  const DB = { prepare(sql) {
    queries.push(sql);
    if (!/^SELECT\s/i.test(sql)) throw Error("UNAUTHORIZED D1 WRITE: " + sql);
    return { async first() {
      if (!row) throw Error("no such table: store_ingest");
      return row;
    } };
  } };
  return { DB, queries, STORE_INGEST_KEY: KEY, STORE_PUBLIC_APPROVED_HREFS: approval,
    ASSETS: { fetch: async () => new Response("{}") } };
};

test("unauthenticated and invalid-key requests never perform D1 DDL or writes", async () => {
  const env = envFor(null, null);
  for (const [method, key] of [["GET", null], ["POST", null], ["POST", "wrong"], ["DELETE", null]]) {
    const res = await worker.fetch(request(method, key), env, ctx);
    assert.ok([401, 405, 503].includes(res.status), method + ": " + res.status);
  }
  assert.ok(env.queries.every(q => /^SELECT\s/i.test(q)));
});

test("missing approval fails closed and never leaks raw evidence", async () => {
  const env = envFor({ received: Date.now(), body: JSON.stringify(raw) }, null);
  const res = await worker.fetch(request("GET", null), env, ctx);
  assert.equal(res.status, 503);
  assert.ok(!(await res.text()).includes("secret"));
});

test("authenticated raw readback is private and public projection excludes hidden fields", async () => {
  const env = envFor({ received: Date.now(), body: JSON.stringify(raw) },
    JSON.stringify(items.map(i => i.href)));
  const publicRes = await worker.fetch(request("GET", null), env, ctx);
  assert.equal(publicRes.status, 200);
  assert.equal(publicRes.headers.get("cache-control"), "public, max-age=60");
  const pub = await publicRes.json();
  assert.equal(pub.items.length, 4);
  assert.ok(!JSON.stringify(pub).includes("secret"));
  assert.ok(!JSON.stringify(pub).includes("IDR"));
  const privateRes = await worker.fetch(request("GET", KEY), env, ctx);
  assert.equal(privateRes.status, 200);
  assert.equal(privateRes.headers.get("cache-control"), "private, no-store");
  assert.ok((await privateRes.text()).includes("secret"));
  assert.ok(env.queries.every(q => /^SELECT\s/i.test(q)));
});

test("standalone unapproved SKU fails closed without false completeness", async () => {
  const standalone = { ...items[3], href: "/purchase/private-ticket", name: "Standalone ticket" };
  const snapshot = { ...raw, items: [...items.slice(0, 3), standalone] };
  snapshot.completeness = withEvidence(snapshot.items).completeness;
  const env = envFor({ received: Date.now(), body: JSON.stringify(snapshot) },
    JSON.stringify(items.map(i => i.href)));
  assert.equal((await worker.fetch(request("GET", null), env, ctx)).status, 503);
  env.STORE_PUBLIC_APPROVED_HREFS = JSON.stringify([...items.slice(0, 3).map(i => i.href), standalone.href]);
  assert.equal((await worker.fetch(request("GET", null), env, ctx)).status, 200);
});

test("explicit SQL schema provisions twice on disposable in-memory SQLite", async () => {
  const { makeDB } = await import("./helpers.mjs");
  const { readFileSync } = await import("node:fs");
  const db = makeDB();
  const sql = readFileSync(new URL("../schema/store-ingest.sql", import.meta.url), "utf8");
  await db.exec(sql);
  await db.exec(sql);
  const columns = db.raw.prepare("PRAGMA table_info(store_ingest)").all();
  assert.deepEqual(columns.map(c => c.name), ["id", "received", "fetched", "body"]);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM store_ingest").get().n, 0);
});

test("wrong-key GET returns 401 without reading or changing D1", async () => {
  const env = envFor({ received: Date.now(), body: JSON.stringify(raw) },
    JSON.stringify(items.map(i => i.href)));
  const res = await worker.fetch(request("GET", "invalid-secret"), env, ctx);
  assert.equal(res.status, 401);
  assert.equal(env.queries.length, 0);
  assert.ok(!(await res.text()).includes("secret"));
});

test("public projection retains received heartbeat and producer evidence", async () => {
  const received = Date.now();
  const env = envFor({ received, body: JSON.stringify(raw) },
    JSON.stringify(items.map(i => i.href)));
  const res = await worker.fetch(request("GET", null), env, ctx);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-store-received"), new Date(received).toISOString());
  const projected = await res.json();
  assert.deepEqual(projected.completeness, raw.completeness);
  assert.equal(projected.fetched, raw.fetched);
  assert.equal(projected.items.length, raw.items.length);
});

test("invalid, empty and self-referential approval cannot authorize raw publication", async () => {
  const approval = [null, "", "{}", "[]", "not-json", JSON.stringify(raw.items)];
  for (const value of approval) {
    const env = envFor({ received: Date.now(), body: JSON.stringify(raw) }, value);
    const res = await worker.fetch(request("GET", null), env, ctx);
    assert.equal(res.status, 503, String(value));
    assert.ok(!(await res.text()).includes("secret"));
  }
});
