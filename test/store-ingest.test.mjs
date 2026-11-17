import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { makeDB } from "./helpers.mjs";
import { withEvidence } from "./store-evidence-fixture.mjs";
import { validateAuIngest } from "../src/store-validate.js";
import * as watch from "../scripts/store-watch.mjs";

const KEY = "k".repeat(40);
const mkEnv = (over = {}) => ({ DB: makeDB(), STORE_INGEST_KEY: KEY, ASSETS: { fetch: async () => new Response("{}") }, ...over });
const ctx = { waitUntil() {} };
let ipN = 0;
const call = (env, { method = "POST", key = KEY, body, headers = {}, path = "/api/store-ingest", ip } = {}) => worker.fetch(new Request("https://x.test" + path, {
  method, headers: { "content-type": "application/json", "cf-connecting-ip": ip || "10.1.0." + (++ipN % 250), ...(key ? { "x-ingest-key": key } : {}), ...headers },
  body: method === "GET" ? undefined : (typeof body === "string" ? body : JSON.stringify(body))
}), env, ctx);
const items = (price = i => "A$" + (i + 1) + ".99") => ["a", "b", "c", "d"].map((n, i) => ({ name: "Item " + n, section: "box", href: "/purchase/" + n, price: price(i), imgs: ["https://example.com/" + n + ".png"] }));
const snap = (now, over = {}, its = items()) => ({ ...withEvidence(its), fetched: new Date(now).toISOString(), items: its, ...over });
const row = env => env.DB.raw.prepare("SELECT * FROM store_ingest").get();

test("unset or short key: route is inert (404), even with a matching header", async () => {
  for (const k of [undefined, "", "short"]) {
    const env = mkEnv({ STORE_INGEST_KEY: k });
    assert.equal((await call(env, { key: k || "x", body: snap(Date.now()) })).status, 404);
    assert.equal((await call(env, { method: "GET", key: null })).status, 404);
  }
  assert.equal((await call(mkEnv({ DB: undefined }), { body: snap(Date.now()) })).status, 404);
});

test("wrong or missing key is 401, and the 11th failure from one address is 429", async () => {
  const env = mkEnv();
  assert.equal((await call(env, { key: null, body: snap(Date.now()), ip: "9.9.9.9" })).status, 401);
  for (let n = 1; n < 10; n++) assert.equal((await call(env, { key: "wrong", body: snap(Date.now()), ip: "9.9.9.9" })).status, 401);
  assert.equal((await call(env, { key: "wrong", body: snap(Date.now()), ip: "9.9.9.9" })).status, 429);
  assert.equal(row(env), undefined);
});

test("valid A$ snapshot: 200, row stored, GET returns it with no-store", async () => {
  const env = mkEnv(), now = Date.now();
  assert.equal((await call(env, { method: "GET", key: null })).status, 404);
  const r = await call(env, { body: snap(now) });
  assert.equal(r.status, 200);
  const stored = row(env);
  assert.equal(stored.id, 1); assert.ok(stored.received >= now); assert.equal(stored.fetched, new Date(now).toISOString());
  const g = await call(env, { method: "GET", key: null });
  assert.equal(g.status, 200); assert.equal(g.headers.get("cache-control"), "no-store");
  const body = await g.json();
  assert.equal(body.items.length, 4); assert.equal(body.items[0].price, "A$1.99");
  assert.ok(!JSON.stringify(body).includes(KEY));
});

test("the stored snapshot is accepted by the existing watcher validators", async () => {
  const env = mkEnv(); await call(env, { body: snap(Date.now()) });
  const s = JSON.parse(row(env).body);
  assert.equal(watch.validateStoreObservation(s), null); assert.equal(watch.deriveCompleteness(s).complete, true);
});

test("rate limit: a second accepted write within 5 minutes is 429 and leaves the row", async () => {
  const env = mkEnv(), now = Date.now();
  assert.equal((await call(env, { body: snap(now - 60000) })).status, 200);
  const before = row(env);
  assert.equal((await call(env, { body: snap(now) })).status, 429);
  assert.deepEqual(row(env), before);
});

test("replay and older snapshots are 409 once the rate window has passed", async () => {
  const env = mkEnv(), now = Date.now();
  assert.equal((await call(env, { body: snap(now - 60000) })).status, 200);
  env.DB.raw.prepare("UPDATE store_ingest SET received = received - 600000").run();
  const before = row(env);
  assert.equal((await call(env, { body: snap(now - 60000) })).status, 409); // same fetched
  assert.equal((await call(env, { body: snap(now - 120000) })).status, 409); // older
  assert.deepEqual(row(env), before);
  assert.equal((await call(env, { body: snap(now) })).status, 200); // newer is fine
});

test("fetched outside now-15min..now+5min, missing or not ISO is 400", async () => {
  const env = mkEnv(), now = Date.now();
  for (const f of [now - 16 * 60000, now + 6 * 60000]) assert.equal((await call(env, { body: snap(now, { fetched: new Date(f).toISOString() }) })).status, 400);
  for (const f of [undefined, "yesterday", "2026-11-17", 12345]) assert.equal((await call(env, { body: snap(now, { fetched: f }) })).status, 400);
  assert.equal(row(env), undefined);
});

test("oversize is 413 (declared and actual); wrong content type 415; bad JSON 400", async () => {
  const env = mkEnv(), now = Date.now();
  assert.equal((await call(env, { body: "x".repeat(300 * 1024) })).status, 413);
  assert.equal((await call(env, { body: "{}", headers: { "content-length": String(300 * 1024) } }).catch(() => ({ status: 413 }))).status, 413);
  assert.equal((await call(env, { body: JSON.stringify(snap(now)), headers: { "content-type": "text/plain" } })).status, 415);
  assert.equal((await call(env, { body: "{not json" })).status, 400);
  assert.equal(row(env), undefined);
});

test("US$, mixed, bare-number, incomplete, invalid and over-limit snapshots are 400 and leave the row unchanged", async () => {
  const env = mkEnv(), now = Date.now();
  assert.equal((await call(env, { body: snap(now - 600000) })).status, 200);
  env.DB.raw.prepare("UPDATE store_ingest SET received = received - 3600000").run();
  const before = row(env);
  const bad = {
    usd: snap(now, {}, items(i => "US$" + (i + 1) + ".99")),
    mixed: snap(now, {}, items(i => (i === 0 ? "US$1.99" : "A$2.99"))),
    otherSymbol: snap(now, {}, items(i => (i === 0 ? "€1.99" : "A$2.99"))),
    bare: snap(now, {}, items(i => String(100 * (i + 1)))),
    fewPriced: snap(now, {}, items(i => (i === 0 ? "A$1.99" : ""))),
    incomplete: { ...snap(now), completeness: undefined },
    flagOnly: { ...snap(now), completeness: { complete: true } },
    tooShort: snap(now, {}, items().slice(0, 2)),
    httpImg: snap(now, {}, items().map(i => ({ ...i, imgs: ["http://example.com/a.png"] }))),
    longName: snap(now, {}, items().map((i, n) => (n ? i : { ...i, name: "n".repeat(201) }))),
    notObject: [1, 2, 3],
    tooMany: snap(now, {}, Array.from({ length: 401 }, (_, i) => ({ name: "I" + i, section: "box", href: "/p/" + i, price: "A$1.00" })))
  };
  for (const [name, b] of Object.entries(bad)) { const r = await call(env, { body: b }); assert.equal(r.status, 400, name); assert.deepEqual(await r.json(), { error: "Bad request." }, name); }
  assert.deepEqual(row(env), before);
});

test("validateAuIngest is pure and returns reason codes", () => {
  const now = Date.now();
  assert.equal(validateAuIngest(snap(now), now), null);
  assert.equal(validateAuIngest(snap(now, {}, items(i => "US$" + i + ".99")), now), "not-aud");
  assert.equal(validateAuIngest({ items: [] }, now), "empty-or-short-snapshot");
});

test("security: the key is never read from the query string or any other header, and never appears in a response", async () => {
  const env = mkEnv(), now = Date.now();
  for (const r of [
    await call(env, { key: null, path: "/api/store-ingest?key=" + KEY + "&x-ingest-key=" + KEY, body: snap(now) }),
    await call(env, { key: null, headers: { authorization: "Bearer " + KEY, "x-pin": KEY }, body: snap(now) })
  ]) { assert.equal(r.status, 401); assert.ok(!(await r.text()).includes(KEY)); }
  assert.equal(row(env), undefined);
  const ok = await call(env, { body: snap(now), path: "/api/store-ingest?junk=1" });
  assert.equal(ok.status, 200); assert.ok(!(await ok.text()).includes(KEY));
  const g = await call(env, { method: "GET", key: KEY }); assert.ok(!(await g.text()).includes(KEY));
});
