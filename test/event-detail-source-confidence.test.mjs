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

const detailCss = fs.readFileSync(new URL("../public/dash.css", import.meta.url), "utf8");

test("event detail duplicate claims merge attribution before category HTML is rendered", () => {
  const match = detail.match(/function dedupeSourceGroups\(fields\) \{([\s\S]*?)\n  \}/);
  assert.ok(match, "cross-category claim grouping helper exists");
  const dedupe = new Function("fields", "CATS", "tidy", match[1]);
  const groups = dedupe({
    bonuses: [
      { text: "2× Catch XP. Incense lasts twice as long.", sources: ["leekduck", "leekduck"], status: "community" }
    ],
    raids: [
      { text: "2× Catch XP.", sources: ["niantic", "leekduck"], status: "official" }
    ],
    shiny: [
      { text: "Shiny chance boosted for event spawns.", sources: ["community"], status: "community" }
    ]
  }, [["bonuses", "Bonuses"], ["raids", "Raids"], ["shiny", "Shiny"]],
  (t) => String(t).replace(/\s+([.,;:!?])/g, "$1").replace(/\s+/g, " ").trim());

  assert.equal(groups.bonuses.length, 2, "separate sentences remain visible");
  assert.deepEqual(groups.bonuses[0].sources, ["leekduck", "niantic"], "duplicate source IDs are collapsed and later sources are retained");
  assert.equal(groups.bonuses[0].status, "official", "official claim evidence is not lost when the duplicate appears in a later category");
  assert.equal(groups.raids.length, 0, "the duplicate sentence is still displayed only once");
  assert.equal(groups.shiny.length, 1, "unrelated claims remain in their original category");
});

test("event detail uses explicit mixed-trust attribution instead of implying every source is official", () => {
  assert.match(detail, /official && community \? 'Official \+ community'/);
  assert.match(detail, /var grouped = dedupeSourceGroups\(d\.fields\);/);
});

test("event detail categories use a consistent accessible line-icon treatment", () => {
  const map = detail.match(/var CATICON = (\{[\s\S]*?\});\n  function categoryIcon/);
  const fn = detail.match(/function categoryIcon\(key\) \{([\s\S]*?)\n  \}/);
  assert.ok(map, "category icon path map exists");
  assert.ok(fn, "category icon renderer exists");
  const icons = new Function("return (" + map[1] + ");")();
  const render = new Function("key", "CATICON", fn[1]);
  const categories = ["tickets", "bonuses", "featured", "raids", "eggs", "research", "shiny", "moves", "costumes", "dates"];
  for (const category of categories) {
    assert.ok(icons[category], "missing icon path for " + category);
    assert.match(render(category, icons), /<span class="evd-icon" aria-hidden="true">/);
    assert.match(render(category, icons), /<svg class="ci"/);
  }
  assert.match(detailCss, /\.evd-icon\{[^}]*width:28px/);
  assert.match(detailCss, /\.evd-grp \.ci,[^}]*width:15px/);
});
