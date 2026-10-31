import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const GOLIB = require("../public/lib.js");
const read = (name) => fs.readFileSync(new URL("../public/" + name, import.meta.url), "utf8");

test("the shared esc helper safely encodes HTML text and quoted attributes", () => {
  assert.equal(GOLIB.esc("&<>\"'"), "&amp;&lt;&gt;&quot;&#39;");
  assert.equal(GOLIB.esc(null), "");
  assert.equal(GOLIB.esc(undefined), "");
  assert.equal(GOLIB.esc(0), "0");
  assert.equal(
    GOLIB.esc("\"><img src=x onerror='alert(1)'>"),
    "&quot;&gt;&lt;img src=x onerror=&#39;alert(1)&#39;&gt;"
  );
});

test("browser renderers consume the one shared esc implementation", () => {
  const renderers = [
    "app.js", "account.js", "buy.js", "move.js", "nudge.js",
    "review.js", "season.js", "store.js", "weekly.js", "whatsnew.js"
  ];
  for (const name of renderers) {
    const source = read(name);
    assert.match(source, /var esc = window\.GOLIB\.esc;/, name + " uses shared GOLIB.esc");
    assert.doesNotMatch(source, /function\s+esc\s*\(/, name + " has no private esc function");
    assert.doesNotMatch(source, /var\s+esc\s*=\s*function/, name + " has no private esc function expression");
  }
  const app = read("app.js");
  const lib = fs.readFileSync(new URL("../public/lib.js", import.meta.url), "utf8");
  assert.match(lib, /function esc\(value\)/);
  assert.match(lib, /esc: esc/);
  assert.match(app, /esc:esc/);
});
