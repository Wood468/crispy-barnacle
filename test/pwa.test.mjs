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

test("PWA entry page links to the manifest and iOS touch icon and registers the service worker", () => {
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="\/icon-180\.png"/);
  assert.match(html, /dash\.css\?v=20261102c/);
  assert.match(html, /styles\.css\?v=20261101k/);
  assert.match(html, /app\.js\?v=20261101f/);
  assert.match(html, /local-state\.js\?v=20261030a/);
  assert.match(html, /pin\.js\?v=20261101b/);
  assert.match(html, /account\.js\?v=20261101b/);
  assert.match(html, /lib\.js\?v=20261101a/);
  assert.match(html, /season\.js\?v=20261101a/);
  assert.match(html, /\/pwa\.js/);
  assert.match(app, /dash\.js\?v=20261101e/);
  assert.match(dash, /detail\.js\?v=20261031a/);
  assert.match(dash, /places\.js\?v=20261031b/, "the updated Places provenance UI is versioned");
  assert.match(dash, /infographic\.js\?v=20261101e/, "the deferred infographic loader is versioned");
  assert.match(dash, /nudge\.js\?v=20261101a/, "the shared-escape nudge renderer is versioned");
  assert.match(dash, /review\.js\?v=20261101b/, "the shared-escape review renderer is versioned");
  assert.match(dash, /buy\.js\?v=20261101a/, "the shared-escape purchase renderer is versioned");
});


test("Today season banners defer full posters until the user opens event details", () => {
  const card = season.split("\n").find((line) => line.includes('class="ssn-card"'));
  assert.ok(card, "the Today season card remains present");
  assert.match(card, /data-open=/, "the card remains an interactive details button");
  assert.match(card, /title="Open details to view the full poster"/, "the poster remains discoverable on desktop");
  assert.doesNotMatch(card, /<img\b/i, "the large poster is not requested by the Today banner");
  assert.match(season, /img:\s*i\.img,\s*season:\s*i/, "the original poster URL remains on the event model");
  assert.match(detail, /if \(ev\.img\) h \+= '<img class="evd-banner"/, "event details still render the full poster on demand");
});

test("every local script and stylesheet referenced by the entry page is precached at its exact URL", () => {
  const assets = [...html.matchAll(/(?:src|href)=["'](\/[^"'#]+)["']/g)]
    .map((match) => match[1])
    .filter((url) => /\.(?:js|css)(?:\?|$)/.test(url));
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

test("service worker versions the cache, pre-caches offline fallback, and never handles API responses", () => {
  assert.match(sw, /gofn-shell-v185/);
  assert.ok(sw.includes("'/lib.js?v=20261101a'"), 'the refreshed dashboard helper is available to the offline shell');
  assert.ok(sw.includes("'/local-state.js?v=20261030a'"), 'account-local state migration is available offline');
  assert.ok(sw.includes("'/account.js?v=20261101b'"), 'the refreshed account transition code is available offline');
  assert.ok(sw.includes("'/season.js?v=20261101a'"), 'the current season banner script is available to the offline shell');
  assert.ok(sw.includes("'/app.js?v=20261101f'"), "the current app bootstrap is available offline");
  assert.ok(sw.includes("'/pin.js?v=20261101b'"), "the central sync settings are available offline");
  assert.ok(sw.includes("'/dash.js?v=20261101e'"), "the current dashboard loader is available offline");
  assert.ok(sw.includes("'/nudge.js?v=20261101a'"), "the shared-escape nudge renderer is available offline");
  assert.ok(sw.includes("'/review.js?v=20261101b'"), "the shared-escape review renderer is available offline");
  assert.ok(sw.includes("'/buy.js?v=20261101a'"), "the shared-escape purchase renderer is available offline");
  assert.match(sw, /'\/event-moves\.json'/, "event-only move data is available to offline event details");
  assert.match(sw, /'\/dash\.css\?v=20261102c'/, "the current dashboard stylesheet is available to the offline shell");
  assert.match(sw, /'\/app\.js\?v=20261101f'/, "the current app bootstrap is available to the offline shell");
  assert.match(sw, /'\/styles\.css\?v=20261101k'/, "the current recovery panel stylesheet is available to the offline shell");
  assert.match(sw, /'\/dash\.js\?v=20261101e'/, "the current dashboard script is available to the offline shell");
  assert.match(sw, /'\/detail\.js\?v=20261031a'/, "the current event detail script is available to the offline shell");
  assert.match(sw, /'\/places\.js\?v=20261031b'/, "the current sourced venue script is available to the offline shell");
  assert.match(sw, /'\/infographic\.js\?v=20261101e'/, "the current infographic loader is available to the offline shell");
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
    keys: async () => ["gofn-shell-v185"],
    delete: async () => true
  };
  vm.runInNewContext(sw, { self, caches, fetch: networkFetch, URL, Request, Response, TextEncoder, crypto: { subtle: { digest: async () => new ArrayBuffer(0) } } });

  entries.set(new URL("/", origin).href, new Response("shell"));
  for (let i = 0; i < 120; i++) entries.set(new URL("/runtime/" + i, origin).href, new Response("cached"));

  let pending;
  listeners.fetch({ request: new Request(origin + "/runtime/new"), respondWith(promise) { pending = promise; } });
  const online = await pending;
  assert.equal(online.status, 200);
  assert.equal(await online.text(), "network");
  const keys = await cache.keys();
  const runtime = keys.filter((key) => key.url !== new URL("/", origin).href);
  assert.equal(runtime.length, 120, "runtime entries stay within the configured cap");
  assert.ok(entries.has(new URL("/", origin).href), "the precached app shell is never evicted");
  assert.ok(!entries.has(new URL("/runtime/0", origin).href), "the oldest runtime entry is evicted first");
  assert.ok(entries.has(new URL("/runtime/new", origin).href), "the newest runtime entry is retained");

  failCacheWrites = true;
  pending = null;
  listeners.fetch({ request: new Request(origin + "/runtime/quota-failure"), respondWith(promise) { pending = promise; } });
  const quotaResponse = await pending;
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
