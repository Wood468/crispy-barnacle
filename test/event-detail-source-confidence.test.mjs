import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const detail = fs.readFileSync(new URL("../public/detail.js", import.meta.url), "utf8");

test("event detail trust badges never turn an unknown trust value into Community", () => {
  const match = detail.match(/function trust\(t\) \{([\s\S]*?)\n  \}/);
  assert.ok(match, "trust renderer exists");
  const renderTrust = new Function("t", match[1]);
  assert.match(renderTrust("official"), />Official</);
  assert.match(renderTrust("community"), />Community</);
  assert.match(renderTrust(""), /st-u/);
  assert.match(renderTrust(null), /Trust not labelled/);
});

test("event detail claim attribution reads trust from source metadata", () => {
  assert.match(detail, /records\.some\(function \(s\) \{ return s\.trust === 'official'; \}\)/);
  assert.match(detail, /records\.some\(function \(s\) \{ return s\.trust === 'community'; \}\)/);
  assert.match(detail, /Source trust not labelled/);
});

test("event detail does not substitute the dataset snapshot date for a source-check date", () => {
  assert.match(detail, /var sourceChecked = \(primarySource && \(primarySource\.observed \|\| primarySource\.checked\)\) \|\| ev\.seen \|\| '';/);
  assert.doesNotMatch(detail, /sourceChecked\s*=.*G\.D\.asOf/);
});
