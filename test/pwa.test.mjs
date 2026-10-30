import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const manifest = JSON.parse(read("../public/manifest.webmanifest"));
const sw = read("../public/sw.js");
const app = read("../public/app.js");
const dash = read("../public/dash.js");
const html = read("../public/index.html");
const icon = read("../public/icon-maskable.svg");
const offline = read("../public/offline.html");
const offlineCss = read("../public/offline.css");

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
  assert.match(html, /dash\.css\?v=20261030d/);
  assert.match(html, /app\.js\?v=20261030g/);
  assert.match(html, /\/pwa\.js/);
  assert.match(app, /dash\.js\?v=20261030m/);
  assert.match(dash, /detail\.js\?v=20261030g/);
});

test("service worker versions the cache, pre-caches offline fallback, and never handles API responses", () => {
  assert.match(sw, /gofn-shell-v126/);
  assert.match(sw, /'\/event-moves\.json'/, "event-only move data is available to offline event details");
  assert.match(sw, /'\/dash\.css\?v=20261030d'/, "the current dashboard stylesheet is available to the offline shell");
  assert.match(sw, /'\/app\.js\?v=20261030g'/, "the current app bootstrap is available to the offline shell");
  assert.match(sw, /'\/dash\.js\?v=20261030m'/, "the current dashboard script is available to the offline shell");
  assert.match(sw, /'\/detail\.js\?v=20261030g'/, "the current event detail script is available to the offline shell");
  assert.match(sw, /'\/places\.js\?v=20261029a'/, "the current sourced venue script is available to the offline shell");
  assert.match(sw, /'\/offline\.html'/);
  assert.match(sw, /cache\.match\('\/offline\.html'\)/);
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw, /name\.startsWith\('gofn-shell-'\)/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(sw, /self\.clients\.claim\(\)/);
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
