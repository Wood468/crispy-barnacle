import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import worker, { SECURITY_HEADERS } from "../src/worker.js";
import { makeDB } from "./helpers.mjs";

// Parse public/_headers into pattern -> Map(lowercase name -> value).
const rules = new Map();
let current = null;
for (const line of fs.readFileSync(new URL("../public/_headers", import.meta.url), "utf8").split(/\r?\n/)) {
  if (!line.trim() || line.trimStart().startsWith("#")) continue;
  if (!/^\s/.test(line)) { current = line.trim(); rules.set(current, new Map()); continue; }
  const i = line.indexOf(":");
  rules.get(current).set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
}
const SAFE = ["x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "strict-transport-security"];

test("static assets (served outside the Worker) get the safe headers via _headers", () => {
  const all = rules.get("/*");
  assert.ok(all, "/* rule");
  for (const k of SAFE) assert.equal(all.get(k), SECURITY_HEADERS[k], k);
  assert.equal(all.has("cache-control"), false, "caching is not overridden");
  assert.equal(all.has("content-security-policy"), false, "no enforced CSP on static assets yet");
});

test("HTML pages get the Worker CSP as Report-Only, never enforced", () => {
  for (const p of ["/", "/index.html", "/sources.html", "/event-methodology.html", "/offline.html"]) {
    const r = rules.get(p);
    assert.ok(r, p);
    assert.equal(r.get("content-security-policy-report-only"), SECURITY_HEADERS["content-security-policy"], p);
    assert.equal(r.has("content-security-policy"), false, p);
    assert.equal(r.has("cache-control"), false, p);
  }
});

test("API responses from the Worker carry all security headers and keep their cache-control", async () => {
  const env = { DB: makeDB(), ASSETS: { fetch: async () => new Response("x") } };
  const res = await worker.fetch(new Request("https://x.test/api/nope"), env, { waitUntil() {} });
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(res.headers.get(k), v, k);
  assert.ok(res.headers.get("cache-control"), "cache-control still set by the handler");
});
