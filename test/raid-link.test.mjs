import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const L = createRequire(import.meta.url)("../public/lib.js");
test("a raid boss on the Raids tab finds its own event page", () => {
  const d = (a, b) => new Date(a).getTime(), ev = (id, name, s, e) => ({ id, name, start: new Date(s), end: new Date(e) });
  const E = [ev("leekduck:dialga-in-5-star-raid-battles-october-2026", "Dialga in 5-star Raid Battles", "2026-10-14T10:00", "2026-10-21T10:00"),
    ev("leekduck:mega-dragonite-in-mega-raids-october-2026", "Mega Dragonite in Mega Raids", "2026-10-14T10:00", "2026-10-21T10:00"),
    ev("leekduck:shadow-landorus-incarnate-forme-in-shadow-raids-october-2026", "Shadow Landorus (Incarnate Forme) in Shadow Raids", "2026-10-07T10:00", "2026-11-04T10:00"),
    ev("leekduck:mega-charizard-x-mega-charizard-y-in-mega-raids-october-2026", "Mega Charizard X & Mega Charizard Y in Mega Raids", "2026-10-21T10:00", "2026-10-28T10:00"),
    ev("leekduck:yveltal-in-5-star-raid-battles-october-2026", "Yveltal in 5-star Raid Battles", "2026-10-07T10:00", "2026-10-14T10:00")];
  const s = d("2026-10-14T10:00"), e = d("2026-10-21T10:00");
  assert.equal(L.raidEventFor(E, "Dialga", "5★", s, e).id, "leekduck:dialga-in-5-star-raid-battles-october-2026");
  assert.equal(L.raidEventFor(E, "Mega Dragonite", "Mega", s, e).id, "leekduck:mega-dragonite-in-mega-raids-october-2026");
  assert.equal(L.raidEventFor(E, "Shadow Landorus (Incarnate)", "Shadow", s, e).id, "leekduck:shadow-landorus-incarnate-forme-in-shadow-raids-october-2026");
  assert.equal(L.raidEventFor(E, "Yveltal", "5★", s, e), null, "last week's boss is not this week's");
  assert.equal(L.raidEventFor(E, "Mega Charizard Y", "Mega", d("2026-10-21T10:00"), d("2026-10-28T10:00")).id, "leekduck:mega-charizard-x-mega-charizard-y-in-mega-raids-october-2026");
  assert.equal(L.raidEventFor(E, "Dialga", "Mega", s, e), null);
});


const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const dash = readFileSync(new URL("../public/dash.js", import.meta.url), "utf8");
const dashCss = readFileSync(new URL("../public/dash.css", import.meta.url), "utf8");

test("best-attacker filters support every known weakness type for a raid boss", () => {
  const match = app.match(/function matchesBestType\(groupType, selected\) \{([\s\S]*?)\n  \}/);
  assert.ok(match, "multi-type best-attacker matcher exists");
  const matches = new Function("groupType", "selected", match[1]);
  assert.equal(matches("Fire", "All"), true);
  assert.equal(matches("Fire", "Fire"), true);
  assert.equal(matches("Fighting", ["Fire", "Fighting"]), true);
  assert.equal(matches("Water", ["Fire", "Fighting"]), false);
  assert.match(app, /window\.GOBEST = \{ showTypes:function\(types\)/);
  assert.match(app, /typeSel = valid\.length \? valid : 'All';/);
});

test("raid rows offer in-app Best attackers only from published weakness metadata", () => {
  assert.match(dash, /data-boss=/);
  assert.match(dash, /facts && Array\.isArray\(facts\.weak\)/);
  assert.match(dash, /data-best-types/);
  assert.match(dash, /GO\.showTab\('collect', 'guides', 'best'\)/);
  assert.match(dash, /GOBEST\.showTypes\(types\)/);
});

test("raid week selector is a compact segmented control with phone-width scrolling and 44px actions", () => {
  assert.match(dashCss, /\.rw-tabs\{display:grid;grid-template-columns:repeat\(4/);
  assert.match(dashCss, /\.rw-tabs button\[aria-selected="true"\]/);
  assert.match(dashCss, /@media\(max-width:520px\)[\s\S]*\.rw-tabs\{display:flex;overflow-x:auto/);
  assert.match(dashCss, /\.rc-info\{[^}]*min-height:44px/);
});
