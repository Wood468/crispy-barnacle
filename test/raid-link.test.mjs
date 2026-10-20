import test from "node:test";
import assert from "node:assert/strict";
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
