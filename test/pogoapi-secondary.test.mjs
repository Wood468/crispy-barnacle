import test from "node:test";
import assert from "node:assert/strict";
import { computeStatuses, isPlainSpeciesName } from "../src/worker.js";

const NOW = Date.parse("2026-11-08T12:00:00Z");
const item = (n, base = "Not announced", s = "unreleased") => ({ s, g: "", n, base });

test("PoGoAPI is positive-only: absence from its list never changes an unreleased item", () => {
  const r = computeStatuses([item("Cufant", "Datamined"), item("Wishiwashi", "Announced")], [], [], [], new Set(["pikachu"]), NOW);
  assert.deepEqual(r.map(x => x.status), ["Datamined", "Announced"]);
});

test("a plain species listed by PoGoAPI is promoted to Released and shows the list date", () => {
  const r = computeStatuses([item("Pikachu", "Announced")], [], [], [], new Set(["pikachu"]), NOW, new Map(), "2026-01-31");
  assert.equal(r[0].status, "Released");
  assert.match(r[0].srcLabel, /PoGoAPI \(list dated 2026-01-31\)/);
});

test("PoGoAPI lists base species only, so it never releases a regional, special or named form", () => {
  const released = new Set(["goodra", "sliggoo", "minior", "kyogre", "calyrex"]);
  const names = ["Hisuian Goodra", "Hisuian Sliggoo", "Minior (Meteor Form)", "Primal Kyogre", "Shadow Calyrex", "Mega Minior", "Gigantamax Duraludon"];
  const r = computeStatuses(names.map(n => item(n, "Announced")), [], [], [], released, NOW);
  assert.ok(r.every(x => x.status === "Announced"), JSON.stringify(r.map(x => [x.n, x.status])));
  assert.equal(isPlainSpeciesName("Goodra"), true);
  assert.equal(isPlainSpeciesName("Alolan Raichu"), false);
});

test("an upcoming official event keeps Announced precedence over nothing, and PoGoAPI never blocks event evidence for non-plain items", () => {
  const live = [{ name: "Dynamax Dialga raids", start: "2026-11-06T10:00", link: "https://x" }];
  const r = computeStatuses([item("Dynamax Dialga", "Not announced", "dynamax")], live, [], [], new Set(["dialga"]), NOW);
  assert.equal(r[0].status, "Announced");
});
