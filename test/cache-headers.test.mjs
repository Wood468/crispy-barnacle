import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../public/_headers", import.meta.url), "utf8");

function parseRules(text) {
  const rules = new Map();
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      current = line.trim();
      assert.ok(current.startsWith("/"), `unexpected header pattern: ${current}`);
      assert.ok(!rules.has(current), `duplicate header pattern: ${current}`);
      rules.set(current, []);
      continue;
    }
    assert.ok(current, "header value must follow a pattern");
    rules.get(current).push(line.trim());
  }
  return rules;
}

const rules = parseRules(source);
const expected = new Map([
  ["/art/*.webp", "Cache-Control: public, max-age=86400"],
  ["/dex/*.webp", "Cache-Control: public, max-age=86400"],
  ["/ico/*.webp", "Cache-Control: public, max-age=86400"]
]);

function matches(pattern, pathname) {
  const star = pattern.indexOf("*");
  if (star < 0) return pattern === pathname;
  assert.equal(pattern.indexOf("*", star + 1), -1, "the audited patterns use one splat");
  return pathname.startsWith(pattern.slice(0, star)) && pathname.endsWith(pattern.slice(star + 1));
}

function cacheControl(pathname) {
  for (const [pattern, values] of rules) {
    if (matches(pattern, pathname)) {
      const line = values.find(value => /^cache-control:/i.test(value));
      return line ? line.slice(line.indexOf(":") + 1).trim() : null;
    }
  }
  return null;
}

test("only stable WebP artwork receives a one-day browser cache", () => {
  assert.deepEqual([...rules.keys()].filter(pattern => rules.get(pattern).some(value => /^cache-control:/i.test(value))).sort(), [...expected.keys()].sort());
  for (const [pattern, value] of expected) {
    assert.deepEqual(rules.get(pattern), [value], pattern);
  }
  for (const values of rules.values()) {
    for (const header of values.filter(value => /^cache-control:/i.test(value))) {
      assert.doesNotMatch(header, /\bimmutable\b/i, "numeric artwork paths are not content-addressed");
    }
  }
  assert.equal(cacheControl("/art/25.webp"), "public, max-age=86400");
  assert.equal(cacheControl("/dex/25.webp"), "public, max-age=86400");
  assert.equal(cacheControl("/ico/g/raid.webp"), "public, max-age=86400");
});

test("mutable entry, code, styles, manifests and public JSON keep default revalidation", () => {
  for (const pathname of [
    "/",
    "/index.html",
    "/app.js",
    "/app.js?v=20261101f",
    "/dash.css?v=20261031t",
    "/sw.js",
    "/manifest.webmanifest",
    "/world-events.json",
    "/data.json",
    "/prices.json",
    "/art/index.json",
    "/api/events"
  ]) {
    assert.equal(cacheControl(pathname), null, pathname);
  }
});


test("static HTML receives narrow security headers without changing asset cache rules", () => {
  const homepage = rules.get("/");
  assert.ok(homepage, "homepage security rule required");
  assert.deepEqual(rules.get("/index.html"), homepage, "HTML aliases must share the same policy");
  const headers = new Map(homepage.map(line => {
    const separator = line.indexOf(":");
    assert.ok(separator > 0, "valid header syntax");
    return [line.slice(0, separator).toLowerCase(), line.slice(separator + 1).trim()];
  }));
  const csp = headers.get("content-security-policy");
  assert.ok(csp, "static homepage must receive CSP");
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /connect-src 'self' https:\/\/open\.er-api\.com\/v6\/latest\/AUD/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'|https:\/\/\*/);
  for (const name of ["x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy", "strict-transport-security"]) {
    assert.ok(headers.has(name), name);
  }
  assert.equal(headers.has("cache-control"), false, "HTML must retain default revalidation");
  for (const path of ["/app.js", "/dash.css", "/world-events.json", "/api/events"]) {
    assert.equal([...rules.keys()].filter(pattern => matches(pattern, path)).length, 0, path);
  }
});
