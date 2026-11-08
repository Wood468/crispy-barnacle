import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const manifest = JSON.parse(read("../public/manifest.webmanifest"));
const sw = read("../public/sw.js");
const app = read("../public/app.js");
const dash = read("../public/dash.js");
const season = read("../public/season.js");
const detail = read("../public/detail.js");
const dashCss = read("../public/dash.css");
const html = read("../public/index.html");
const icon = read("../public/icon-maskable.svg");
const offline = read("../public/offline.html");
const offlineCss = read("../public/offline.css");
const dataScripts = [
  app, dash,
  detail, read("../public/places.js"), read("../public/review.js"),
  read("../public/fresh.js"), read("../public/whatsnew.js"), read("../public/store.js"),
  season, read("../public/weekly.js"), read("../public/buy.js"),
  read("../public/extra.js"), read("../public/infographic.js")
];

test("PWA manifest has stable standalone identity and valid icon files", () => {
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((i) => i.src === "/icon.svg" && i.purpose === "any"));
  assert.ok(manifest.icons.some((i) => i.src === "/icon-maskable.svg" && i.purpose === "maskable"));
  assert.ok(manifest.icons.some((i) => i.src === "/icon-192.png" && i.sizes === "192x192"));
  assert.ok(manifest.icons.some((i) => i.src === "/icon-512.png" && i.sizes === "512x512"));
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(new URL("../public" + icon.src, import.meta.url)), "missing icon " + icon.src);
  }
});

test("standard PNG icons have the dimensions declared in the manifest", () => {
  for (const [path, expected] of [["../public/icon-192.png", 192], ["../public/icon-512.png", 512]]) {
    const png = fs.readFileSync(new URL(path, import.meta.url));
    assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), expected);
    assert.equal(png.readUInt32BE(20), expected);
  }
});

test("PWA entry page links to the manifest, iOS touch icon and service-worker registration", () => {
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="\/icon-180\.png"/);
  assert.match(html, /\/pwa\.js/);
  assert.match(read("../public/pwa.js"), /serviceWorker\.register/);
});


test("Today season cards defer posters and event details load a compact, cacheable WebP with full-size fallback", () => {
  const card = season.split("\n").find((line) => line.includes('class="ssn-card"'));
  assert.ok(card, "the Today season card remains present");
  assert.match(card, /data-open=/, "the card remains an interactive details button");
  assert.match(card, /title="Open details to view the full poster"/, "the poster remains discoverable on desktop");
  assert.doesNotMatch(card, /<img\b/i, "the large poster is not requested by the Today banner");
  assert.match(season, /thumbnail:\s*seasonThumbnailPath\(i\.id, i\.img\)/, "the event model carries a deterministic thumbnail path");
  assert.match(detail, /safeSeasonThumb\(ev\.season\.thumbnail\)/, "event details use the compact cached WebP thumbnail for season posters");
  assert.match(detail, /art\.fullSrc\s*=/, "the full-size original stays recorded as the artwork provenance image");
  assert.match(read("../public/event-redesign.css"), /\.ev-art-img\{[^}]*position:absolute/, "banners are shown in full inside a reserved box (object-fit contain)");
});

test("every versioned local script and stylesheet requested by the page and lazy loaders is precached at its exact URL", () => {
  const sources = [html, app, dash];
  const assets = [...new Set(sources.flatMap((source) =>
    [...source.matchAll(/(?:src|href)=["'](\/[^"'#]+)["']/g)].map((match) => match[1])
  ))].filter((url) => /\.(?:js|css)\?v=/.test(url));
  assert.ok(assets.length > 0);
  for (const asset of assets) assert.ok(sw.includes("'" + asset + "'"), "offline shell is missing " + asset);
});


test("static JSON dependencies referenced by first-party scripts are precached", () => {
  const urls = new Set();
  for (const source of dataScripts) {
    for (const match of source.matchAll(/fetch\(\s*['"]([^'"]+\.json(?:\?[^'"]*)?)['"]/g)) {
      const url = match[1];
      if (url.startsWith("/") && !url.startsWith("/api/") && !url.includes("?")) urls.add(url);
    }
  }
  assert.ok(urls.size > 0);
  for (const url of urls) assert.ok(sw.includes("'" + url + "'"), "offline shell is missing static data " + url);
});

test("service worker versions the cache, caches Season posters offline, and never handles API responses", () => {
  assert.match(sw, /gofn-shell-v\d+/);
  assert.match(sw, /season-thumbs/, "Season detail WebP thumbnails are eligible for offline runtime caching");
  assert.match(sw, /'\/event-moves\.json'/, "event-only move data is available to offline event details");
  assert.match(sw, /'\/offline\.html'/);
  assert.match(sw, /cache\.match\('\/offline\.html'\)/);
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw, /name\.startsWith\('gofn-shell-'\)/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(sw, /self\.clients\.claim\(\)/);
});
test("service worker bounds runtime cache entries without evicting the offline shell or breaking online responses", async () => {
  const listeners = {};
  const origin = "https://app.test";
  const entries = new Map();
  let failCacheWrites = false;
  const keyUrl = (key) => typeof key === "string" ? new URL(key, origin).href : key.url;
  const cache = {
    async put(key, response) {
      if (failCacheWrites) throw new Error("simulated quota failure");
      const url = keyUrl(key);
      entries.delete(url);
      entries.set(url, response);
    },
    async keys() { return [...entries.keys()].map((url) => ({ url })); },
    async delete(key) { return entries.delete(keyUrl(key)); },
    async match(key) { return entries.get(keyUrl(key)) || null; }
  };
  const self = {
    location: { origin },
    addEventListener(name, handler) { listeners[name] = handler; },
    skipWaiting: async () => {},
    clients: { claim: async () => {}, openWindow: async () => {} },
    registration: { pushManager: { getSubscription: async () => null }, showNotification: async () => {} }
  };
  const networkFetch = async () => {
    const response = new Response("network", { status: 200 });
    Object.defineProperty(response, "type", { value: "basic" });
    return response;
  };
  const caches = {
    open: async () => cache,
    keys: async () => ["gofn-shell-v217"],
    delete: async () => true
  };
  vm.runInNewContext(sw, { self, caches, fetch: networkFetch, URL, Request, Response, TextEncoder, crypto: { subtle: { digest: async () => new ArrayBuffer(0) } } });

  entries.set(new URL("/", origin).href, new Response("shell"));
  for (let i = 0; i < 120; i++) entries.set(new URL("/runtime/" + i, origin).href, new Response("cached"));

  let pending;
  const waits = [];
  const fire = (path) => { pending = null; listeners.fetch({ request: new Request(origin + path), respondWith(promise) { pending = promise; }, waitUntil(p) { waits.push(p); } }); return pending; };
  const online = await fire("/runtime/new");
  assert.equal(online.status, 200);
  assert.equal(await online.text(), "network");
  await Promise.all(waits);
  const keys = await cache.keys();
  const runtime = keys.filter((key) => key.url !== new URL("/", origin).href);
  assert.equal(runtime.length, 120, "runtime entries stay within the configured cap");
  assert.ok(entries.has(new URL("/", origin).href), "the precached app shell is never evicted");
  assert.ok(!entries.has(new URL("/runtime/0", origin).href), "the oldest runtime entry is evicted first");
  assert.ok(entries.has(new URL("/runtime/new", origin).href), "the newest runtime entry is retained");

  failCacheWrites = true;
  const quotaResponse = await fire("/runtime/quota-failure");
  await Promise.all(waits);
  assert.equal(quotaResponse.status, 200, "a cache quota failure must not fail a successful network request");
  assert.equal(await quotaResponse.text(), "network");

  let apiIntercepted = false;
  listeners.fetch({ request: new Request(origin + "/api/private"), respondWith() { apiIntercepted = true; } });
  assert.equal(apiIntercepted, false, "private API responses remain outside the service-worker cache");
});

test("maskable icon has a full-bleed background and viewBox", () => {
  assert.match(icon, /viewBox="0 0 512 512"/);
  assert.match(icon, /<rect width="512" height="512" fill="#0C0F14"\/>/);
});

test("offline page is readable, responsive, and has no inline JavaScript", () => {
  assert.match(offline, /name="viewport"/);
  assert.match(offline, /You're offline/);
  assert.match(offline, /href="\/">Try GO Field Notes again/);
  assert.match(offline, /offline\.css/);
  assert.doesNotMatch(offline, /<(script|style)\b/i);
  assert.match(read("../public/offline.css"), /place-items:center/);
});

// Keep the PWA-specific checks close to the manifest/service-worker contract.
