import test from "node:test";
import { readPrivate } from "./_private.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import { withSecurityHeaders, SECURITY_HEADERS } from "../src/worker.js";

test("every response gets the browser security headers, including framing and cross-site calls", async () => {
  const r = withSecurityHeaders(new Response("hi", { status: 200, headers: { "content-type": "text/html" } }));
  for (const k of Object.keys(SECURITY_HEADERS)) assert.ok(r.headers.get(k), k);
  assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.match(r.headers.get("content-security-policy"), /connect-src 'self'/);
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.equal(r.headers.get("content-type"), "text/html");
  assert.equal(await r.text(), "hi");
});

test("hotspot places are not in the public site files and need the PIN or a session", () => {
  const pub = JSON.parse(fs.readFileSync(new URL("../public/places.json", import.meta.url), "utf8"));
  assert.ok(!pub.places.some(p => /hotspot/i.test(p.type)), "no hotspot in public/places.json");
  const priv = readPrivate("places.json","places-private.json");
  assert.ok(priv.places.length > 0 && priv.places.every(p => /hotspot/i.test(p.type)));
  const w = fs.readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.match(w, /async function placesPrivate[\s\S]*?whoIs\(request, env\)/);
});

import { readFileSync, readdirSync } from "node:fs";
test("no inline scripts or handlers, so script-src can forbid them", async () => {
  const { SECURITY_HEADERS } = await import("../src/worker.js");
  assert.doesNotMatch(SECURITY_HEADERS["content-security-policy"], /script-src[^;]*unsafe-inline/);
  for (const f of readdirSync("public").filter(n => /\.(html|js)$/.test(n) && n !== "sw.js")) {
    const s = readFileSync("public/" + f, "utf8");
    assert.doesNotMatch(s, /<[a-z][^>]*\son(error|load|click|submit|toggle|change|input)\s*=\s*["']/i, f + " has an inline handler");
    if (f.endsWith(".html")) assert.doesNotMatch(s, /<script(?![^>]*\ssrc=)[^>]*>/i, f + " has an inline script");
  }
});
