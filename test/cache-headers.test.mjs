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
  assert.deepEqual([...rules.keys()].sort(), [...expected.keys()].sort());
  for (const [pattern, value] of expected) {
    assert.deepEqual(rules.get(pattern), [value], pattern);
  }
  assert.doesNotMatch(source, /\bimmutable\b/i, "numeric artwork paths are not content-addressed");
  assert.equal(cacheControl("/art/25.webp"), "public, max-age=86400");
  assert.equal(cacheControl("/dex/25.webp"), "public, max-age=86400");
  assert.equal(cacheControl("/ico/g/raid.webp"), "public, max-age=86400");
});

test("mutable entry, code, styles, manifests and public JSON keep default revalidation", () => {
  for (const pathname of [
    "/",
    "/index.html",
    "/app.js",
    "/app.js?v=20261101b",
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
