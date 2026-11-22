import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { makeDB } from "./helpers.mjs";
import { withEvidence } from "./store-evidence-fixture.mjs";
import { validateAuIngest } from "../src/store-validate.js";
import * as watch from "../scripts/store-watch.mjs";
import { readFileSync } from "node:fs";

const KEY = "k".repeat(40);
// The Worker never creates tables on a request: the test DB gets the explicit schema file (plus the existing throttle table) up front.
const SCHEMA = readFileSync(new URL("../migrations/0004_store_ingest.sql", import.meta.url), "utf8");
const THROTTLE = "CREATE TABLE IF NOT EXISTS pin_fails_ip (ip_hash TEXT NOT NULL, at INTEGER NOT NULL)";
const mkDB = ({ schema = true } = {}) => { const db = makeDB(); db.raw.exec(THROTTLE); if (schema) db.raw.exec(SCHEMA); return db; };
const mkEnv = (over = {}) => ({ DB: mkDB(), STORE_INGEST_KEY: KEY, ASSETS: { fetch: async () => new Response("{}") }, ...over });
// Fake D1 recorder: remembers every statement, and throws on any DDL (CREATE/ALTER/DROP).
const recorded = (db) => { const log = [], prepare = db.prepare; return { log, raw: db.raw, batch: async () => { throw new Error("batch (ensure) must not be called"); }, prepare(sql) { if (/^\s*(CREATE|ALTER|DROP)\b/i.test(sql)) throw new Error("DDL at request time: " + sql.slice(0, 40)); log.push(sql.trim()); return prepare(sql); } }; };
const writes = log => log.filter(q => !/^SELECT\b/i.test(q));
const ctx = { waitUntil() {} };
let ipN = 0;
const call = (env, { method = "POST", key = KEY, body, headers = {}, path = "/api/store-ingest", ip } = {}) => worker.fetch(new Request("https://x.test" + path, {
  method, headers: { "content-type": "application/json", "cf-connecting-ip": ip || "10.1.0." + (++ipN % 250), ...(key ? { "x-ingest-key": key } : {}), ...headers },
  body: method === "GET" ? undefined : (typeof body === "string" ? body : JSON.stringify(body))
}), env, ctx);
const items = (price = i => "A$" + (i + 1) + ".99") => ["a", "b", "c", "d"].map((n, i) => ({ name: "Item " + n, section: "box", href: "/purchase/" + n, price: price(i), imgs: ["https://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/" + n + "/w256.webp"] }));
const snap = (now, over = {}, its = items()) => ({ ...withEvidence(its), fetched: new Date(now).toISOString(), items: its, ...over });
const REASONS = ["json", "shape", "too_many_items", "string_len", "href", "img_host", "sku", "duplicate_sku", "items_min", "priced_min", "currency", "evidence", "load_unstable", "cards_mismatch", "section_mismatch", "completeness", "fetched_format", "fetched_window"];
const row = env => { try { return env.DB.raw.prepare("SELECT * FROM store_ingest").get(); } catch { return undefined; } };

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

test("valid A$ snapshot: 200, row stored, keyed GET returns it with private no-store", async () => {
  const env = mkEnv(), now = Date.now();
  assert.equal((await call(env, { method: "GET" })).status, 404); // authenticated, nothing stored yet
  const r = await call(env, { body: snap(now) });
  assert.equal(r.status, 200);
  const stored = row(env);
  assert.equal(stored.id, 1); assert.ok(stored.received >= now); assert.equal(stored.fetched, new Date(now).toISOString());
  const g = await call(env, { method: "GET" });
  assert.equal(g.status, 200); assert.equal(g.headers.get("cache-control"), "private, no-store");
  assert.equal(g.headers.get("x-store-received"), new Date(stored.received).toISOString());
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
    httpImg: snap(now, {}, items().map(i => ({ ...i, imgs: ["http://assets.pgo.webstore.nianticlabs.com/a.webp"] }))),
    otherHostImg: snap(now, {}, items().map(i => ({ ...i, imgs: ["https://example.com/a.png"] }))),
    lookalikeImg: snap(now, {}, items().map(i => ({ ...i, imgs: ["https://assets.pgo.webstore.nianticlabs.com.evil.test/a.webp"] }))),
    credImg: snap(now, {}, items().map(i => ({ ...i, imgs: ["https://u:p@assets.pgo.webstore.nianticlabs.com/a.webp"] }))),
    hrefAt: snap(now, {}, items().map(i => ({ ...i, href: "@evil.test/purchase/x" }))),
    hrefProtoRel: snap(now, {}, items().map(i => ({ ...i, href: "//evil.test/purchase/x" }))),
    hrefJs: snap(now, {}, items().map(i => ({ ...i, href: "javascript:alert(1)" }))),
    hrefAbs: snap(now, {}, items().map(i => ({ ...i, href: "https://evil.test/purchase/x" }))),
    hrefOtherPath: snap(now, {}, items().map(i => ({ ...i, href: "/account/x" }))),
    longName: snap(now, {}, items().map((i, n) => (n ? i : { ...i, name: "n".repeat(201) }))),
    notObject: [1, 2, 3],
    tooMany: snap(now, {}, Array.from({ length: 401 }, (_, i) => ({ name: "I" + i, section: "box", href: "/p/" + i, price: "A$1.00" })))
  };
  for (const [name, b] of Object.entries(bad)) { const r = await call(env, { body: b }); assert.equal(r.status, 400, name); const j = await r.json(); assert.equal(j.error, "Bad request.", name); assert.deepEqual(Object.keys(j), ["error", "reason"], name); assert.ok(REASONS.includes(j.reason), name); }
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
  const g = await call(env, { method: "GET" }); assert.equal(g.status, 200); assert.ok(!(await g.text()).includes(KEY));
});

test("a wrong ingest key fills the shared bucket but the correct x-pin still works; wording is 'key' for ingest and unchanged for PINs", async () => {
  const env = mkEnv({ SYNC_PIN: "1234" });
  let last;
  for (let n = 0; n < 10; n++) { last = await call(env, { key: "wrong", body: snap(Date.now()), ip: "7.7.7.7" }); assert.equal(last.status, 401); assert.deepEqual(await last.json(), { error: "Wrong key." }); }
  const t = await call(env, { key: "wrong", body: snap(Date.now()), ip: "7.7.7.7" });
  assert.equal(t.status, 429); assert.equal((await t.json()).error, "Too many wrong keys from this address. Try again in 10 minutes.");
  const pin = (p) => worker.fetch(new Request("https://x.test/api/dex", { headers: { "x-pin": p, "cf-connecting-ip": "7.7.7.7" } }), env, ctx);
  assert.equal((await pin("1234")).status, 200);
  const env2 = mkEnv({ SYNC_PIN: "1234" });
  const pin2 = (p) => worker.fetch(new Request("https://x.test/api/dex", { headers: { "x-pin": p, "cf-connecting-ip": "8.8.8.8" } }), env2, ctx);
  const w = await pin2("0000"); assert.equal(w.status, 401); assert.deepEqual(await w.json(), { error: "Wrong PIN." });
  for (let n = 0; n < 9; n++) await pin2("0000");
  const l = await pin2("0000"); assert.equal(l.status, 429); assert.deepEqual(await l.json(), { error: "Too many wrong PINs from this address. Try again in 10 minutes." });
});

test("two concurrent identical POSTs yield exactly one 200", async () => {
  const env = mkEnv(), b = snap(Date.now());
  const rs = await Promise.all([call(env, { body: b }), call(env, { body: b })]);
  assert.deepEqual(rs.map(r => r.status).filter(c => c === 200), [200]);
  assert.ok(rs.every(r => [200, 409, 429].includes(r.status)));
});

test("table missing: authenticated GET and POST are 503 with a fixed reason and nothing is created", async () => {
  const env = mkEnv({ DB: mkDB({ schema: false }) });
  for (const r of [await call(env, { method: "GET" }), await call(env, { body: snap(Date.now()) })]) { assert.equal(r.status, 503); assert.deepEqual(await r.json(), { error: "Unavailable.", reason: "schema" }); }
  assert.equal(env.DB.raw.prepare("SELECT name FROM sqlite_master WHERE name = 'store_ingest'").get(), undefined);
});

test("no DDL and no store_ingest write on any rejected request (recorder throws on CREATE/ALTER/DROP or ensure)", async () => {
  const now = Date.now(), cases = [];
  const rec = over => { const db = recorded(mkDB()); return { db, env: mkEnv({ DB: db, ...over }) }; };
  for (const [name, args] of Object.entries({
    getNoKey: { method: "GET", key: null }, getWrongKey: { method: "GET", key: "wrong" }, getKeyInQuery: { method: "GET", key: null, path: "/api/store-ingest?key=" + KEY },
    postNoKey: { key: null, body: snap(now) }, postWrongKey: { key: "wrong", body: snap(now) },
    put: { method: "PUT", body: "{}" }, del: { method: "DELETE" }, head: { method: "HEAD" }
  })) { const { db, env } = rec(); const r = await call(env, args); cases.push(name);
    assert.ok([401, 405].includes(r.status), name);
    assert.deepEqual(writes(db.log).filter(q => !/^(INSERT INTO|DELETE FROM) pin_fails_ip\b/.test(q)), [], name); // only the shared failure throttle may write
    if (r.status === 405) assert.deepEqual(db.log, [], name);
    assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM store_ingest").get().n, 0, name); }
  for (const over of [{ STORE_INGEST_KEY: undefined }, { STORE_INGEST_KEY: "short" }]) { const { db, env } = rec(over); assert.equal((await call(env, { method: "GET" })).status, 404); assert.equal((await call(env, { body: snap(now) })).status, 404); assert.deepEqual(db.log, []); }
  { const db = recorded(mkDB()); const r = await call(mkEnv({ DB: undefined }), { method: "GET" }); assert.equal(r.status, 404); assert.deepEqual(db.log, []); }
  // throttle table absent as well: still 401, still no DDL
  { const db = recorded(mkDB()); db.raw.exec("DROP TABLE pin_fails_ip"); const r = await call(mkEnv({ DB: db }), { method: "GET", key: "wrong" }); assert.equal(r.status, 401); assert.deepEqual(db.log.filter(q => !/^INSERT INTO pin_fails_ip\b/.test(q)), []); }
  assert.equal(cases.length, 8);
});

test("a wrong-key GET is throttled like a wrong-key POST (11th from one address is 429)", async () => {
  const env = mkEnv();
  for (let n = 0; n < 10; n++) assert.equal((await call(env, { method: "GET", key: "wrong", ip: "6.6.6.6" })).status, 401);
  assert.equal((await call(env, { method: "GET", key: "wrong", ip: "6.6.6.6" })).status, 429);
  assert.equal((await call(env, { method: "GET", key: KEY, ip: "6.6.6.6" })).status, 404); // the right key is never throttled (nothing stored yet)
});

test("a stored snapshot with standalone/private-only SKUs is never returned without the right key", async () => {
  const env = mkEnv(), now = Date.now(), MARK = "PRIVATE-ONLY-SKU-9F3A";
  const its = [...items(), { name: MARK, section: "box", href: "/purchase/" + MARK.toLowerCase(), price: "A$9.99", imgs: ["https://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/priv/w256.webp"] }];
  assert.equal((await call(env, { body: snap(now, {}, its) })).status, 200);
  assert.ok(JSON.parse(row(env).body).items.some(i => i.name === MARK));
  for (const args of [{ method: "GET", key: null }, { method: "GET", key: "wrong" }, { method: "GET", key: null, path: "/api/store-ingest?key=" + KEY },
    { method: "GET", key: null, headers: { authorization: "Bearer " + KEY, "x-pin": KEY, "x-ingest-key": "" } }, { method: "HEAD", key: null }, { method: "OPTIONS", key: null }]) {
    const r = await call(env, args), t = await r.text();
    assert.ok([401, 405].includes(r.status), args.method); assert.ok(!t.includes(MARK) && !t.includes("purchase") && !t.includes(KEY));
    assert.ok(!r.headers.get("x-store-received") && !/public|max-age/.test(r.headers.get("cache-control") || ""));
  }
  assert.ok((await (await call(env, { method: "GET" })).text()).includes(MARK)); // the keyed read still has it
});

test("every 400 carries a fixed-vocabulary reason code and never echoes the input", async () => {
  const now = Date.now(), SECRET = "ZZ-secret-marker-ZZ";
  const withIt = (f) => items().map(f);
  const ev = over => ({ ...snap(now), completeness: { ...snap(now).completeness, ...over } });
  const cases = {
    json: ["{not json", "json"],
    notObject: [[1], "shape"], noItems: [{ fetched: new Date(now).toISOString() }, "shape"],
    itemNotObject: [snap(now, {}, [...items(), 5]), "shape"],
    nameType: [snap(now, {}, withIt((i, n) => (n ? i : { ...i, name: 7 }))), "shape"],
    imgsNotArray: [snap(now, {}, withIt(i => ({ ...i, imgs: "x" }))), "shape"],
    tooMany: [snap(now, {}, Array.from({ length: 401 }, (_, i) => ({ name: "I" + i, section: "box", href: "/purchase/" + i, price: "A$1.00" }))), "too_many_items"],
    nameLen: [snap(now, {}, withIt((i, n) => (n ? i : { ...i, name: SECRET + "n".repeat(201) }))), "string_len"],
    hrefLen: [snap(now, {}, withIt((i, n) => (n ? i : { ...i, href: "/purchase/" + "a".repeat(300) }))), "string_len"],
    href: [snap(now, {}, withIt((i, n) => (n ? i : { ...i, href: "/purchase/" + SECRET + "+x" }))), "href"],
    hrefAbs: [snap(now, {}, withIt(i => ({ ...i, href: "https://evil.test/purchase/x" }))), "href"],
    imgHttp: [snap(now, {}, withIt(i => ({ ...i, imgs: ["http://assets.pgo.webstore.nianticlabs.com/a.webp"] }))), "img_host"],
    imgOther: [snap(now, {}, withIt(i => ({ ...i, imgs: ["https://" + SECRET + ".example/a.png"] }))), "img_host"],
    imgData: [snap(now, {}, withIt(i => ({ ...i, imgs: ["data:image/gif;base64,R0lGOD"] }))), "img_host"],
    sku: [snap(now, {}, withIt(i => ({ ...i, section: "" }))), "sku"],
    dup: [snap(now, {}, withIt(i => ({ ...i, href: "/purchase/same" }))), "duplicate_sku"],
    itemsMin: [snap(now, {}, items().slice(0, 2)), "items_min"],
    pricedMin: [snap(now, {}, items(i => (i === 0 ? "A$1.99" : ""))), "priced_min"],
    usd: [snap(now, {}, items(i => "US$" + (i + 1) + ".99")), "currency"],
    mixed: [snap(now, {}, items(i => (i === 0 ? "US$1.99" : "A$2.99"))), "currency"],
    noEvidence: [{ ...snap(now), completeness: undefined }, "evidence"],
    otherProducer: [ev({ producer: "other.py" }), "evidence"],
    evidenceNotObject: [{ ...snap(now), completeness: "yes" }, "completeness"],
    unstable: [ev({ stablePasses: 1 }), "load_unstable"],
    cards: [ev({ cards: 5 }), "cards_mismatch"],
    sections: [ev({ sections: [{ name: "box", count: 3 }] }), "section_mismatch"],
    garbled: [ev({ sections: [{ name: "", count: 4 }] }), "completeness"],
    fetchedFormat: [snap(now, { fetched: "yesterday" }), "fetched_format"],
    fetchedType: [snap(now, { fetched: 12345 }), "shape"],
    fetchedOld: [snap(now, { fetched: new Date(now - 16 * 60000).toISOString() }), "fetched_window"],
    fetchedFuture: [snap(now, { fetched: new Date(now + 6 * 60000).toISOString() }), "fetched_window"]
  };
  for (const [name, [body, reason]] of Object.entries(cases)) {
    const env = mkEnv(), r = await call(env, { body });
    assert.equal(r.status, 400, name);
    const text = await r.text();
    assert.deepEqual(JSON.parse(text), { error: "Bad request.", reason }, name);
    assert.ok(!text.includes("secret-marker"), name);
    assert.equal(row(env), undefined, name);
  }
  // every code in the vocabulary is exercised above
  assert.deepEqual([...new Set(Object.values(cases).map(c => c[1]))].sort(), [...REASONS].sort());
});

test("an empty evidence section (0 cards, 0 items) is tolerated; real section mismatches still fail", () => {
  const now = Date.now();
  const mk = (counts, name = n => n) => { // counts: {SECTION: n}
    const its = []; let k = 0;
    for (const [sec, n] of Object.entries(counts)) for (let j = 0; j < n; j++, k++) its.push({ name: "Item " + k, section: sec, href: "/purchase/item/i" + k, price: "A$" + (k + 1) + ".99", imgs: ["https://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/i" + k + "/w256.webp"] });
    return its;
  };
  const ev = (its, sections, over = {}) => ({ items: its, fetched: new Date(now).toISOString(), completeness: { ...withEvidence(its).completeness, sections, ...over } });
  const its = mk({ POKECOINS: 9, ITEMS: 18, BUNDLE: 1, LIMITED_TIME: 5 });
  const sec = [["POKECOINS", 9], ["ITEMS", 18], ["BUNDLE", 1], ["LIMITED_TIME", 5], ["ML_BUNDLE", 0]].map(([name, count]) => ({ name, count }));
  const owner = ev(its, sec);
  assert.equal(owner.items.length, 33); assert.equal(owner.completeness.cards, 33); assert.equal(owner.completeness.sections.length, 5);
  assert.equal(validateAuIngest(owner, now), null);
  assert.equal(watch.deriveCompleteness(owner).complete, true);
  assert.equal(watch.deriveCompleteness(ev(its, sec.slice(0, 4))).complete, true); // unchanged: no empty section at all
  const bad = s => watch.deriveCompleteness(s).reason;
  assert.equal(bad(ev(its, sec.filter(s => s.name !== "BUNDLE"))), "section-count-mismatch"); // item section missing from evidence
  assert.equal(bad(ev(its, sec.map(s => (s.name === "ITEMS" ? { ...s, count: 17 } : s)))), "section-count-mismatch"); // count differs
  assert.equal(bad(ev(its, sec.map(s => (s.name === "BUNDLE" ? { ...s, count: 0 } : s)))), "section-count-mismatch"); // items in a zero-count section
  assert.equal(bad(ev(its, [...sec.slice(0, 4), { name: "ML_BUNDLE", count: 2 }])), "section-count-mismatch"); // count>0 with no items
  assert.equal(bad(ev(its, [...sec, { name: "ML_BUNDLE", count: 0 }])), "garbled-sections"); // duplicate id
  assert.equal(bad(ev(its, [...sec, { name: "", count: 0 }])), "garbled-sections");
});
