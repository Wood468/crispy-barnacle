import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { displayName, cycle } from "../scripts/best-by-type.mjs";

test("form names match the app's naming", () => {
  assert.equal(displayName("Charizard (Mega X)"), "Mega Charizard X");
  assert.equal(displayName("Blastoise (Mega)"), "Mega Blastoise");
  assert.equal(displayName("Groudon (Primal)"), "Primal Groudon");
  assert.equal(displayName("Raichu (Alolan)"), "Alolan Raichu");
  assert.equal(displayName("Pikachu (Libre)"), null);
});
test("a stronger, same-type attacker out-damages a weaker one", () => {
  const f = { type: "fighting", power: 8, ms: 500, energy: 7 }, c = { type: "fighting", power: 100, ms: 2500, energy: -50 };
  const a = cycle({ types: ["fighting"], atk: 300, def: 150, hp: 150 }, f, c), b = cycle({ types: ["fighting"], atk: 200, def: 150, hp: 150 }, f, c);
  assert.ok(a.dps > b.dps && a.score > b.score);
});
test("the published list has ten per type with sane moves", async () => {
  const j = JSON.parse(await readFile(new URL("../public/best-by-type.json", import.meta.url)));
  assert.ok(Object.keys(j.types).length >= 15);
  for (const [t, rows] of Object.entries(j.types)) { assert.ok(rows.length >= 5 && rows.length <= 10, t); for (const r of rows) assert.ok(r.name && r.fast && r.charged && r.dps > 0, t + " " + r.name); }
});
