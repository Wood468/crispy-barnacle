import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rotator = require("../public/event-encounter-rotations.js");
const components = require("../public/event-components.js");
const read = path => JSON.parse(readFileSync(new URL("../public/" + path, import.meta.url), "utf8"));

/**
 * Source-to-canonical parity on the real current GO Wild Area release.
 * This verifies that the generated importer record reaches the actual
 * universal read model and reusable rotation dedupe. The UI must never invent
 * another Incense encounter or erase ticket-only forms.
 */
test("GO Wild Incense access and Unown forms survive source → canonical model → gallery without double-counting", () => {
  const source = read("event-details.json").events.wag;
  const catalogue = read("events-v1.json");
  const model = catalogue.events.find(event => event.eventId === "wag" || (event.aliases || []).includes("wag"));
  const entry = read("event-encounter-rotations.json").entries.find(event => (event.eventIds || []).includes("wag"));
  assert.ok(model, "the canonical GO Wild Area Global model must exist");
  assert.ok(entry, "the verified event rotation must link to the canonical event");
  const bySourceKey = new Map(source.pokemon.map(p => [p.key, p]));
  const sourceIncense = source.encounters.filter(e => e.method === "incense");
  assert.equal(sourceIncense.length, 16, "10 public + 4 Unown letters + 2 ticket-only Lati@s");
  assert.equal(sourceIncense.filter(e => e.access === "free").length, 10);
  assert.equal(sourceIncense.filter(e => e.access === "paid").length, 6);
  const ticketUnown = sourceIncense.filter(e => e.access === "paid" && e.identityKey.startsWith("201:"));
  assert.deepEqual(ticketUnown.map(e => e.identityKey).sort(),
    ["201:d:none", "201:i:none", "201:l:none", "201:w:none"]);
  assert.ok(sourceIncense.every(e => bySourceKey.has(e.identityKey)), "no dangling imported references");

  // A fresh importer may republish every source edge, but the event read model
  // must never drop the distinct access/form identity on the way to Event Details.
  const actual = model.encounters.filter(e => e.method === "incense");
  const sourceIds = new Set(sourceIncense.map(e => [e.identityKey, e.method, e.access].join("|")));
  const actualIds = new Set(actual.map(e => [e.identityKey, e.method, e.access].join("|")));
  for (const key of sourceIds) assert.ok(actualIds.has(key), "missing canonical Incense encounter " + key);

  const projected = rotator.withoutDuplicateFlatEncounters(model, entry);
  const byModelKey = new Map(model.pokemon.map(p => [p.key, p]));
  const flat = projected.encounters.filter(e => e.method === "incense");
  const shared = new Set((entry.mightyShared || []).flatMap(x => x.pokemon));
  const daily = new Set((entry.mightyDays || []).flatMap(x => x.pokemon));
  // Ten regular mighty Incense Pokémon are already visible by day; ticket Lati@s
  // have the dedicated shared gallery. Only Unown must remain as flat Incense.
  for (const e of sourceIncense) {
    const pokemon = byModelKey.get(e.identityKey);
    assert.ok(pokemon, "missing canonical Pokémon " + e.identityKey);
    const duplicate = shared.has(pokemon.name) || (e.access === "free" && daily.has(pokemon.name));
    const visible = flat.some(x => x.identityKey === e.identityKey && x.access === e.access);
    assert.equal(visible, !duplicate, pokemon.name + " must be " + (duplicate ? "shown in sourced Mighty group" : "visible in Incense gallery"));
  }
  assert.deepEqual(flat.map(e => e.identityKey).sort(),ticketUnown.map(e => e.identityKey).sort(),
    "the four paid Unown letters must remain without duplicating day-specific Mighty and ticket Lati@s");

  const html = components.gallery(projected, { artFor: p => '<span class="art" aria-label="' + p.name + '"></span>' });
  assert.match(html, /data-method="incense"/);
  for (const key of ["201:d:none", "201:i:none", "201:l:none", "201:w:none"]) {
    assert.ok(html.includes('data-identity="' + key + '"'), "missing exact-form Unown tile " + key);
  }
  assert.equal((html.match(/ue-incense-corner/g) || []).length, 4);
  assert.doesNotMatch(html, /data-follow|data-track|ue-mon-controls/,
    "Today/Event Details must not gain Pokémon Follow/Track controls");
});
