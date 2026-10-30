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

// An unset SYNC_PIN (e.g. a preview deploy, which gets no secrets but binds the real R2 bucket)
// must never let "undefined" or an empty x-pin through.
import { makeDB } from "./helpers.mjs";
import worker from "../src/worker.js";
const SECRET = "PRIVATE-R2-SENTINEL";
const pinEnv = (pin) => { const env = { DB: makeDB(), ASSETS: { fetch: async () => new Response("{}") }, MEDIA: { get: async () => ({ json: async () => ({ secret: SECRET, places: [], prices: [] }) }) } }; if (pin !== undefined) env.SYNC_PIN = pin; return env; };
let ipN = 0;
const hit = (env, method, path, pin) => worker.fetch(new Request("https://x.test" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": "10.0.0." + (++ipN % 250), "x-pin": pin }, body: method === "GET" ? undefined : "{}" }), env, { waitUntil() {} });
const PIN_ROUTES = [["GET", "/api/prices-private"], ["GET", "/api/places-private"], ["POST", "/api/jobs/run?job=nope&dry=1"], ["GET", "/api/dex"], ["GET", "/api/userstate"], ["POST", "/api/userstate/init"], ["POST", "/api/datamine/run"], ["POST", "/api/pipeline/run"], ["POST", "/api/ig-decisions"], ["GET", "/api/notify/status"], ["POST", "/api/notify/test"], ["POST", "/api/notify/test-reminder"], ["POST", "/api/notify/run"], ["GET", "/api/notify/push-key"], ["POST", "/api/notify/subscribe"], ["POST", "/api/auth/invite"], ["POST", "/api/auth/users"], ["POST", "/api/auth/create"], ["POST", "/api/auth/remove"]];

for (const [label, pin] of [["unset", undefined], ["empty", ""]]) {
  test(`SYNC_PIN ${label}: every PIN-gated route rejects x-pin "undefined" and "" and never serves private R2 data`, async () => {
    const env = pinEnv(pin);
    for (const given of ["undefined", ""]) {
      for (const [method, path] of PIN_ROUTES) {
        const r = await hit(env, method, path, given), body = await r.text();
        assert.ok(r.status === 401 || r.status === 404, `${method} ${path} x-pin=${JSON.stringify(given)} -> ${r.status}`);
        assert.ok(!body.includes(SECRET), `${method} ${path} leaked private data`);
      }
      const me = await (await hit(env, "GET", "/api/auth/me", given)).json();
      assert.notEqual(me.owner, true, "auth/me must not report the owner");
    }
  });
}

test("SYNC_PIN set: the right PIN still opens the private routes, a wrong one (or \"undefined\") gets 401", async () => {
  const env = pinEnv("1234");
  for (const path of ["/api/prices-private", "/api/places-private"]) {
    const ok = await hit(env, "GET", path, "1234");
    assert.equal(ok.status, 200, path); assert.ok((await ok.text()).includes(SECRET));
    for (const bad of ["9999", "undefined"]) assert.equal((await hit(env, "GET", path, bad)).status, 401, path + " " + bad);
  }
  assert.equal((await hit(env, "POST", "/api/jobs/run?job=nope&dry=1", "1234")).status, 400, "past the gate to job validation");
  assert.equal((await hit(env, "POST", "/api/jobs/run?job=nope&dry=1", "9999")).status, 401);
});
