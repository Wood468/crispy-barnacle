// Batch 8: first-load work. Shared JSON loader, service worker precache and response path, preload.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (p) => fs.readFileSync(new URL("../public/" + p, import.meta.url), "utf8");
const LIB_SRC = read("lib.js");
const sw = read("sw.js");
const html = read("index.html");
const jsFiles = fs.readdirSync(new URL("../public/", import.meta.url)).filter((f) => f.endsWith(".js"));

function freshLib(fetchImpl) {
  const root = {};
  vm.runInNewContext(LIB_SRC, { self: root, fetch: fetchImpl, Date, JSON, Promise, setTimeout });
  return root.GOLIB;
}
const ok = (body) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) });

test("GOLIB.getJson: callers asking for the same URL share one request but get their own parsed copy", async () => {
  let calls = 0;
  const lib = freshLib(() => { calls++; return ok({ a: [1, 2] }); });
  calls = 0; // lib.js asks for /prices.json itself on load
  const [x, y] = await Promise.all([lib.getJson("/x.json"), lib.getJson("/x.json")]);
  assert.equal(calls, 1);
  assert.deepEqual(x, { a: [1, 2] });
  x.a.push(3);
  assert.deepEqual(y, { a: [1, 2] }, "one caller's edits never reach another");
  assert.deepEqual(await lib.getJson("/x.json"), { a: [1, 2] });
  assert.equal(calls, 1, "a later caller inside maxAge reuses it too");
});

test("GOLIB.getJson: failures are not cached, fresh bypasses the shared copy, maxAge expires it", async () => {
  let calls = 0, mode = "500";
  const lib = freshLib((u) => { calls++; return mode === "500" ? Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve("{}") }) : mode === "bad" ? Promise.resolve({ ok: true, text: () => Promise.resolve("{nope") }) : ok({ v: calls }); });
  calls = 0;
  await assert.rejects(lib.getJson("/f.json"));
  assert.equal(await lib.jsonOrNull("/f.json"), null);
  assert.equal(calls, 2, "a failed request is retried by the next caller");
  mode = "bad";
  await assert.rejects(lib.getJson("/f.json"));
  mode = "good"; calls = 0;
  const first = await lib.getJson("/f.json");
  const again = await lib.getJson("/f.json");
  assert.equal(calls, 1); assert.deepEqual(again, first);
  const forced = await lib.getJson("/f.json", { fresh: true });
  assert.equal(calls, 2); assert.notDeepEqual(forced, first);
  assert.deepEqual(await lib.getJson("/f.json"), forced, "the forced answer replaces the shared copy");
  await new Promise((r) => setTimeout(r, 5));
  await lib.getJson("/f.json", { maxAge: 1 });
  assert.equal(calls, 3, "an older copy than maxAge is asked for again");
});

test("no script fetches a shared JSON URL on its own: they all go through GOLIB.getJson", () => {
  const shared = ["prices.json", "release-status.json", "api/datamine", "api/unreleased", "datamine-news.json", "event-moves.json", "dex.json", "api/pvp", "pvp.json", "event-info.json", "api/sources", "api/ig-decisions", "infographic-queue.json", "event-details.json"];
  const offenders = [];
  for (const f of jsFiles) {
    if (f === "sw.js" || f === "sources.js" || f === "review.js" || f === "extra.js") continue;
    const src = read(f);
    for (const u of shared) if (new RegExp("fetch\\(\\s*'/" + u.replace(".", "\\.") + "['?]").test(src)) offenders.push(f + " " + u);
  }
  assert.deepEqual(offenders, []);
});

test("service worker precache lists each file once, and every versioned URL the page requests", () => {
  const list = sw.slice(sw.indexOf("const SHELL_URLS = ["), sw.indexOf("];", sw.indexOf("const SHELL_URLS = [")));
  const urls = [...list.matchAll(/'(\/[^']*)'/g)].map((m) => m[1]);
  assert.ok(urls.length > 40);
  assert.equal(new Set(urls).size, urls.length, "no URL listed twice");
  const byPath = {};
  for (const u of urls) (byPath[u.split("?")[0]] = byPath[u.split("?")[0]] || []).push(u);
  const doubled = Object.entries(byPath).filter(([, v]) => v.length > 1).map(([k]) => k);
  assert.deepEqual(doubled, [], "a file is listed versioned or unversioned, never both");
  // every ?v= script/stylesheet URL named by index.html or created by another script must be in the list
  const requested = new Set();
  for (const m of html.matchAll(/(?:src|href)="(\/[^"]+\?v=[^"]+)"/g)) requested.add(m[1]);
  for (const f of jsFiles) for (const m of read(f).matchAll(/\.src\s*=\s*'(\/[\w.-]+\.js\?v=[\w]+)'/g)) requested.add(m[1]);
  assert.ok(requested.size > 20);
  for (const u of requested) assert.ok(urls.includes(u), "offline shell is missing " + u);
  assert.ok([...requested].some((u) => u.startsWith("/fresh.js?v=")), "fresh.js is requested with its version and is precached with it");
});

test("index.html preloads the dash.js URL that app.js injects, so it is found at the top of the page", () => {
  const injected = /ds\.src='(\/dash\.js\?v=\w+)'/.exec(read("app.js"));
  assert.ok(injected, "app.js still injects dash.js");
  assert.ok(html.includes('<link rel="preload" href="' + injected[1] + '" as="script">'), "preload names the same versioned URL");
  assert.ok(html.indexOf("rel=\"preload\"") < html.indexOf("<script"), "the preload is in the head");
  assert.equal((html.match(/rel="preload"/g) || []).length, 1, "only preloads that are used");
});

function makeSw(onFetch, entries = new Map()) {
  const listeners = {}, origin = "https://app.test";
  const keyUrl = (k) => typeof k === "string" ? new URL(k, origin).href : (k.url || k);
  let putGate = null, puts = 0;
  const cache = {
    async put(k, r) { puts++; if (putGate) await putGate; entries.set(keyUrl(k), r); },
    async keys() { return [...entries.keys()].map((url) => ({ url })); },
    async delete(k) { return entries.delete(keyUrl(k)); },
    async match(k, o) {
      const want = keyUrl(k);
      if (entries.has(want)) return entries.get(want).clone();
      if (o && o.ignoreSearch) { const p = want.split("?")[0]; for (const [u, r] of entries) if (u.split("?")[0] === p) return r.clone(); }
      return null;
    }
  };
  const self = { location: { origin }, addEventListener(n, h) { listeners[n] = h; }, skipWaiting: async () => {}, clients: { claim: async () => {}, openWindow: async () => {} }, registration: {} };
  vm.runInNewContext(sw, { self, caches: { open: async () => cache, keys: async () => [], delete: async () => true }, fetch: onFetch, URL, Request, Response, TextEncoder, Date, crypto: { subtle: { digest: async () => new ArrayBuffer(0) } } });
  const waits = [];
  const dispatch = (path, init) => { let p = null; listeners.fetch({ request: new Request(origin + path, init), respondWith(x) { p = x; }, waitUntil(x) { waits.push(x); } }); return p; };
  return { dispatch, waits, entries, origin, gate: (g) => { putGate = g; }, puts: () => puts };
}
const basic = (body, headers) => { const r = new Response(body, { status: 200, headers }); Object.defineProperty(r, "type", { value: "basic" }); return r; };

test("service worker hands the network response back before the cache write finishes", async () => {
  const t = makeSw(async () => basic("net"));
  let release; t.gate(new Promise((r) => { release = r; }));
  const response = await Promise.race([t.dispatch("/dash.js?v=1"), new Promise((r) => setTimeout(() => r("slow"), 500))]);
  assert.notEqual(response, "slow", "the response must not wait for cache.put");
  assert.equal(await response.text(), "net");
  assert.equal(t.waits.length, 1, "the write is registered with event.waitUntil");
  release(); await Promise.all(t.waits);
  assert.ok(t.entries.has(t.origin + "/dash.js?v=1"));
});

test("service worker answers pictures from the cache first and refreshes ones older than a day", async () => {
  let net = 0;
  const t = makeSw(async () => { net++; return basic("new-pic"); });
  t.entries.set("https://app.test/dex/25.webp", Object.assign(basic("cached-pic", { date: new Date().toUTCString() })));
  t.entries.set("https://app.test/infographic-thumbs/g47ix/a.jpg.webp", Object.assign(basic("cached-thumb", { date: new Date().toUTCString() })));
  const thumb = await t.dispatch("/infographic-thumbs/g47ix/a.jpg.webp");
  assert.equal(await thumb.text(), "cached-thumb"); assert.equal(net, 0, "a visited infographic WebP is served cache-first");
  const fresh = await t.dispatch("/dex/25.webp");
  assert.equal(await fresh.text(), "cached-pic"); assert.equal(net, 0, "a cached picture needs no network");
  t.entries.set("https://app.test/art/abc.webp", basic("old-pic", { date: new Date(Date.now() - 3 * 86400000).toUTCString() }));
  const old = await t.dispatch("/art/abc.webp");
  assert.equal(await old.text(), "old-pic", "still answered at once");
  await Promise.all(t.waits);
  assert.equal(net, 1, "and refreshed in the background");
  assert.equal(await t.entries.get("https://app.test/art/abc.webp").text(), "new-pic");
  const miss = await t.dispatch("/ico/g/raid.webp");
  assert.equal(await miss.text(), "new-pic"); await Promise.all(t.waits);
  assert.ok(t.entries.has("https://app.test/ico/g/raid.webp"), "a picture seen once is kept");
  // code is still network-first
  net = 0; t.entries.set("https://app.test/app.js?v=9", basic("stale-code"));
  const code = await t.dispatch("/app.js?v=9");
  assert.equal(await code.text(), "new-pic"); assert.equal(net, 1);
});

test("service worker offline: finds code and data by path when only the ?v= differs, never pages or API", async () => {
  const t = makeSw(async () => { throw new Error("offline"); });
  t.entries.set("https://app.test/fresh.js?v=20260101a", basic("fresh-code"));
  t.entries.set("https://app.test/infographic-queue.json", basic("{}"));
  t.entries.set("https://app.test/infographic-thumbs/g47ix/a.jpg.webp", basic("offline-thumb"));
  assert.equal(await (await t.dispatch("/infographic-thumbs/g47ix/a.jpg.webp")).text(), "offline-thumb", "a previously viewed infographic thumbnail remains available offline");
  assert.equal(await (await t.dispatch("/fresh.js?v=20260101a")).text(), "fresh-code");
  assert.equal(await (await t.dispatch("/fresh.js?v=other")).text(), "fresh-code", "same file, other version");
  assert.equal(await (await t.dispatch("/infographic-queue.json?t=123")).text(), "{}");
  const miss = await t.dispatch("/not-cached.js?v=1");
  assert.equal(miss.status, 503);
});

test("GOLIB.getJson: a caller's own fetch options are never dropped because someone else already asked", async () => {
  const seen = [];
  const lib = freshLib((u, init) => { seen.push([u, init]); return ok({ n: seen.length }); });
  seen.length = 0;
  await lib.getJson("/o.json");
  await lib.getJson("/o.json", { init: { cache: "no-cache" } });
  assert.equal(seen.length, 1, "the soft cache modes (default / no-cache) both revalidate, so they share one request");
  await lib.getJson("/o.json", { init: { cache: "reload" } });
  assert.equal(seen.length, 2, "a caller that forces the network never gets a copy fetched without that");
  assert.equal(seen[1][1].cache, "reload", "and its fetch options reach fetch");
  await lib.getJson("/o.json");
  await lib.getJson("/o.json", { init: { cache: "no-cache" } });
  assert.equal(seen.length, 2, "a forced copy serves later soft callers");
  await lib.getJson("/o.json", { init: { headers: { "x-test": "1" } } });
  assert.equal(seen.length, 3, "different headers mean a different request");
  assert.deepEqual(seen[2][1].headers, { "x-test": "1" });
  await lib.getJson("/o.json", { init: { headers: { "X-Test": "1" } } });
  assert.equal(seen.length, 3, "header names are compared without case");
});

test("GOLIB.getJson: a request that writes (POST, or any body) is never shared or kept", async () => {
  const seen = [];
  const lib = freshLib((u, init) => { seen.push([u, init]); return ok({ n: seen.length }); });
  seen.length = 0;
  const post = { method: "POST", body: "{\"a\":1}" };
  await Promise.all([lib.getJson("/w.json", { init: post }), lib.getJson("/w.json", { init: post })]);
  assert.equal(seen.length, 2, "two identical POSTs are two requests");
  await lib.getJson("/w.json", { init: { body: "x" } });
  await lib.getJson("/w.json", { init: { method: "post", body: "{\"a\":2}" } });
  assert.equal(seen.length, 4, "a body alone, or a lower-case method, is still a write");
  await lib.getJson("/w.json");
  await lib.getJson("/w.json");
  assert.equal(seen.length, 5, "a GET after the writes is fetched once, not served from a write");
  await lib.getJson("/w.json", { init: { method: "GET" } });
  await lib.getJson("/w.json", { init: { method: "GET" } });
  assert.equal(seen.length, 6, "an explicit GET is still shared with other explicit GETs");
});

test("GOLIB.getJson: a request that never answers does not hold later callers past maxAge or their own timeout", async () => {
  let calls = 0, hang = true;
  const lib = freshLib(() => { calls++; return hang ? new Promise(() => {}) : ok({ v: calls }); });
  calls = 0;
  lib.getJson("/h.json").catch(() => {});
  assert.equal(calls, 1);
  await new Promise((r) => setTimeout(r, 8));
  hang = false;
  assert.deepEqual(await lib.getJson("/h.json", { maxAge: 5 }), { v: 2 }, "an entry older than maxAge is dropped even though it never settled");
  hang = true; calls = 0;
  await assert.rejects(lib.getJson("/h2.json", { timeout: 15 }), /timed out/, "a caller with a timeout stops waiting");
  assert.equal(await lib.jsonOrNull("/h2.json", { timeout: 15 }), null, "jsonOrNull gives null instead of hanging");
  assert.equal(calls, 2, "the timed-out request was dropped, so the next caller starts a new one");
  hang = false;
  assert.deepEqual(await lib.getJson("/h2.json", { timeout: 50 }), { v: 3 });
});
