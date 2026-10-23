import test from "node:test";
import assert from "node:assert/strict";
import { debutedSpecies, computeStatuses, trackedItems } from "../src/worker.js";
import { readFileSync } from "node:fs";

const NOW = Date.parse("2026-10-23T12:00:00Z");
const events = [
  { id: "trek", t: "Fall Marathon: Buddy Trek", s: "2026-10-13T10:00", highlights: [{ type: "debut", label: "DEBUT · Bramblin" }, { type: "debut", label: "DEBUT · Brambleghast (evolve Bramblin: 50 candy)" }, { type: "boosted-shiny", label: "BOOSTED SHINY · Electrike" }] },
  { id: "minior", t: "Orionids Meteor Shower: Minior Debut", s: "2026-10-19T17:00", tags: ["Debut"], art: ["Minior"] },
  { id: "later", t: "Future Debut Day", s: "2026-10-31T10:00", tags: ["Debut"], art: ["Pecharunt"] },
];

test("species whose debut event has started count as debuted; future debuts do not", () => {
  const d = debutedSpecies(events, NOW);
  assert.equal(d.get("bramblin"), "Fall Marathon: Buddy Trek");
  assert.equal(d.get("brambleghast"), "Fall Marathon: Buddy Trek");
  assert.equal(d.get("minior"), "Orionids Meteor Shower: Minior Debut");
  assert.equal(d.has("pecharunt"), false);
  assert.equal(d.has("electrike"), false);
});

test("a debuted Pokémon is Released even when a later event lists it as upcoming", () => {
  const items = [{ s: "unreleased", g: "", n: "Minior", base: "Announced" }, { s: "unreleased", g: "", n: "Bramblin", base: "Announced" }, { s: "unreleased", g: "", n: "Pecharunt", base: "Not announced" }];
  const leek = [{ name: "Minior Showers: Leonids 2026", start: "2026-11-14T17:00:00.000", end: "2026-11-19T23:59:00.000", link: "https://x" }];
  const r = computeStatuses(items, leek, [], [], new Set(), NOW, debutedSpecies(events, NOW));
  assert.equal(r.find((x) => x.n === "Minior").status, "Released");
  assert.equal(r.find((x) => x.n === "Bramblin").status, "Released");
  assert.equal(r.find((x) => x.n === "Pecharunt").status, "Not announced");
});

test("Mega, Dynamax and Gigantamax items are not marked Released by a species debut", () => {
  const items = [{ s: "unreleased", g: "", n: "Mega Minior", base: "Announced" }, { s: "dynamax", g: "", n: "Dynamax Bramblin", base: "Announced" }];
  const r = computeStatuses(items, [], [], [], new Set(), NOW, debutedSpecies(events, NOW));
  assert.ok(r.every((x) => x.status === "Announced"));
});

test("with the real data.json, Minior, Bramblin and Brambleghast come out Released", () => {
  const data = JSON.parse(readFileSync("public/data.json", "utf8"));
  const r = computeStatuses(trackedItems(data), [], [], [], new Set(), NOW, debutedSpecies(data.events, NOW));
  for (const n of ["Minior", "Bramblin", "Brambleghast"]) assert.equal(r.find((x) => x.n === n).status, "Released", n);
  assert.notEqual(r.find((x) => x.n === "Spooky Mega").status, "Released");
});
