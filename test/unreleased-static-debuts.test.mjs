import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { debutedSpecies } from "../src/worker.js";

const require = createRequire(import.meta.url);
const GOLIB = require("../public/lib.js");
const data = JSON.parse(readFileSync(new URL("../public/data.json", import.meta.url), "utf8"));
const at = (iso) => Date.parse(iso);

test("client debutedSpecies agrees with the Worker's on the real events", () => {
  for (const iso of ["2026-10-01T00:00:00Z", "2026-10-14T00:00:00Z", "2026-10-23T12:00:00Z", "2026-11-20T00:00:00Z", "2027-01-01T00:00:00Z"]) {
    assert.deepEqual(Object.keys(GOLIB.debutedSpecies(data.events, at(iso))).sort(), [...debutedSpecies(data.events, at(iso)).keys()].sort(), iso);
  }
});

test("Bramblin, Brambleghast and Minior leave the curated Unreleased list once their debut event has started", () => {
  const rel = GOLIB.releasedByDebut(data.upcoming.dd, data.events, at("2026-10-23T12:00:00Z"));
  for (const n of ["Bramblin", "Brambleghast", "Minior"]) assert.equal(rel["unreleased|" + n].status, "Released", n);
  assert.match(rel["unreleased|Bramblin"].srcLabel, /^Debuted in Fall Marathon/);
  const before = GOLIB.releasedByDebut(data.upcoming.dd, data.events, at("2026-10-01T00:00:00Z"));
  assert.deepEqual(Object.keys(before), [], "nothing is promoted before a debut starts");
});

test("a debut never promotes a Mega, a Gigantamax form, a placeholder or an undebuted species", () => {
  const dd = [{ id: "unreleased", groups: [{ status: "Announced", items: [{ n: "Mega Clefable" }, { n: "Gigantamax Eevee" }, { n: "Clefable", art: [] }, { n: "Pecharunt" }, { n: "Clefable" }] }] }];
  const events = [{ t: "Debut Day", s: "2026-11-01T10:00", tags: ["Debut"], art: ["Clefable", "Mega Clefable"] }, { t: "Later", s: "2026-12-01T10:00", tags: ["Debut"], art: ["Pecharunt"] }];
  assert.deepEqual(Object.keys(GOLIB.releasedByDebut(dd, events, at("2026-11-20T00:00:00Z"))), ["unreleased|Clefable"]);
  const other = [{ id: "dynamax", groups: [{ status: "Announced", items: [{ n: "Clefable" }] }] }];
  assert.deepEqual(GOLIB.releasedByDebut(other, events, at("2026-11-20T00:00:00Z")), {}, "only the Unreleased section is promoted");
});

test("the Pokédex 'Not in GO yet' set is built from items that are not Released, not from the whole curated list", () => {
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /function notGoRebuild\(\)/);
  assert.match(app, /var OVER=window\.GOLIB\.releasedByDebut\(U\.dd,D\.events,Date\.now\(\)\)/);
  assert.match(app, /o&&o\.status==='Released'/);
  assert.doesNotMatch(app, /DUN\.indexOf\(/, "the old rule marked every curated name Not in GO yet, Released or not");
});
