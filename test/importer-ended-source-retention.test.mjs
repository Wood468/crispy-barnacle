import test from "node:test";
import assert from "node:assert/strict";
import { preserveEndedSourceData } from "../scripts/importer/run.mjs";

const OFFICIAL = { id: "official", name: "Pokémon GO (official)", trust: "official", url: "https://pokemongo.com/news/x/" };
const DUCK = { id: "leekduck", name: "Leek Duck", trust: "community", url: "https://leekduck.com/events/x/" };
const row = (text, ...sources) => ({ text, sources, status: "single" });
const enc = [{ identityKey: "1:base:none", method: "incense", access: "free" }];
const oldRecord = () => ({ ev: { sources: [OFFICIAL, DUCK], pokemon: [{ key: "1:base:none" }], encounters: enc,
  fields: { eggs: [row("duck egg", "leekduck")], dates: [row("both", "official", "leekduck"), row("official only", "official")] } } });
const nowRecord = () => ({ ev: { sources: [OFFICIAL], pokemon: [], encounters: [], fields: { eggs: [], dates: [row("official only", "official")] } } });
const group = end => new Map([["ev", { event: { id: "ev", start: "2026-11-14T10:00", end }, results: [] }]]);
const NOW = "2026-11-17T12:00:00.000Z";

test("an ended event keeps what its vanished source contributed", () => {
  const out = preserveEndedSourceData(nowRecord(), oldRecord(), group("2026-11-15T18:00"), { now: NOW }).ev;
  assert.deepEqual(out.sources.map(s => s.id), ["official", "leekduck"]);
  assert.deepEqual(out.fields.eggs.map(r => r.text), ["duck egg"]);
  assert.deepEqual(out.fields.dates.map(r => r.text), ["official only", "both"]);
  assert.deepEqual(out.encounters, enc);
  assert.equal(out.pokemon.length, 1);
});

test("a live event, or one whose source is still listed, is left to the normal import", () => {
  const live = preserveEndedSourceData(nowRecord(), oldRecord(), group("2026-11-20T18:00"), { now: NOW }).ev;
  assert.deepEqual(live, nowRecord().ev);
  const listed = nowRecord(); listed.ev.sources.push(DUCK);
  assert.deepEqual(preserveEndedSourceData(listed, oldRecord(), group("2026-11-15T18:00"), { now: NOW }).ev.encounters, []);
});

test("fresh encounters from this run are never overwritten", () => {
  const fresh = nowRecord(); fresh.ev.encounters = [{ identityKey: "2:base:none", method: "egg" }];
  const out = preserveEndedSourceData(fresh, oldRecord(), group("2026-11-15T18:00"), { now: NOW }).ev;
  assert.deepEqual(out.encounters.map(e => e.identityKey), ["2:base:none"]);
});
