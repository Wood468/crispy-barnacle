import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("../public/index.html");
const app = read("../public/app.js");
const css = read("../public/styles.css");

test("primary event-data failure has a visible accessible recovery panel", () => {
  assert.match(html, /<section class="load-error" id="load-error" role="alert"[^>]*hidden>/);
  assert.match(html, /id="load-error-title"/);
  assert.match(html, /id="load-retry"/);
  assert.match(app, /getElementById\('load-error'\)/);
  assert.match(app, /if\(panel\)panel\.hidden=false/);
  assert.match(app, /getElementById\('load-retry'\)/);
  assert.match(app, /window\.location\.reload\(\)/);
  assert.doesNotMatch(app, /getElementById\('prio'\);if\(m\)m\.innerHTML=.*Could not load the event data/);
});

test("load recovery panel is hidden on success and has a thumb-sized retry action", () => {
  assert.match(html, /class="load-error"[^>]*hidden/);
  assert.match(css, /\.load-error\[hidden\]\{display:none\}/);
  assert.match(css, /\.load-error #load-retry\{min-height:44px\}/);
});
