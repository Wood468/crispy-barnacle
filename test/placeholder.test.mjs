import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const L = createRequire(import.meta.url)("../public/lib.js");
test("placeholder lines are recognised, real notes are not", () => {
  for (const t of ["Listed on the calendar. No bosses published yet.", "Listed on the season calendar.", "Listed on the calendar. Details to come.", "On the calendar, but no bosses are announced yet.", "Featured Pokémon not announced in my sources."]) assert.ok(L.isPlaceholder(t), t);
  for (const t of ["Bramblin debuts.", "Chandelure is the Super Mega Raid boss.", "Listed bonuses apply all day."]) assert.ok(!L.isPlaceholder(t), t);
});
import { readFileSync } from "node:fs";
import { readPrivate } from "./_private.mjs";
test("Rp estimate: seen tiers are exact, unseen tiers follow the trend, all from the private file", () => {
  const pri = readPrivate("prices.json","private-prices.json");
  assert.equal(L.rpEstimate(pri, 1.99).idr, 10000);
  assert.equal(L.rpEstimate(pri, 1.99).basis, "seen");
  assert.equal(L.rpEstimate(pri, 1.99).aud, 0.8);
  const m = L.rpEstimate(pri, 11.99);
  assert.equal(m.basis, "modelled");
  assert.ok(m.idr >= 59900 && m.idr <= 61500, String(m.idr));
  assert.equal(L.rpEstimate({ fx: pri.fx }, 1.99), null, "without the private tiers there is no Rp figure");
  // The trend really holds: every seen tier is within 0% to 3% of 5,000 x the US price.
  for (const [k, v] of Object.entries(pri.tiers_idr)) { const r = v.idr / (+k * 5000); assert.ok(r >= 0.99 && r <= 1.03, k + " " + r); }
});
