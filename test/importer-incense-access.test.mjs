import test from "node:test";
import assert from "node:assert/strict";
import { extractEncounters, mergeEncounters, methodForHeading } from "../scripts/importer/encounters.mjs";

const dex = [[201, "Unown"], [212, "Scizor"], [380, "Latias"], [381, "Latios"], [635, "Hydreigon"]];
const extract = html => extractEncounters(html, { dex });

test("generic Incense headings keep explicit free and paid access and exact Unown letter identity", () => {
  assert.equal(methodForHeading("Ticket Holder Incense Encounters"), "incense");
  assert.equal(methodForHeading("Mighty Incense Encounters"), "incense");
  const html = [
    "<h2>Incense Encounters</h2>",
    "<p>All Trainers can attract these mighty Pokémon with Incense during both event days.</p>",
    "<ul><li>Scizor</li><li>Hydreigon</li></ul>",
    "<h3>Ticket Holder Incense Encounters</h3>",
    "<p>For ticket holders, the following Pokémon will also be attracted to Incense, excluding Daily Adventure Incense.</p>",
    "<ul><li>Unown D</li><li>Unown I</li><li>Unown L</li><li>Unown W</li></ul>",
    "<h3>Mighty Latias and Latios Ticket</h3>",
    "<p>Ticket holders may also attract mighty Latias and Latios using Incense.</p>",
    "<ul><li>Latias</li><li>Latios</li></ul>",
    "<h2>Eggs</h2><ul><li>Scizor</li></ul>"
  ].join("");
  const data = extract(html);
  const byKey = new Map(data.pokemon.map(p => [p.key,p]));
  const incense = data.encounters.filter(e => e.method === "incense");
  assert.equal(incense.length,8);
  const free = incense.filter(e => e.access === "free").map(e => byKey.get(e.identityKey)?.name).sort();
  const paid = incense.filter(e => e.access === "paid").map(e => byKey.get(e.identityKey)?.name).sort();
  assert.deepEqual(free, ["Hydreigon", "Scizor"]);
  assert.deepEqual(paid, ["Latias","Latios","Unown D","Unown I","Unown L","Unown W"]);
  for (const letter of ["d","i","l","w"]) {
    const row = data.pokemon.find(p => p.speciesId==="201" && p.formId===letter);
    assert.ok(row, "Unown " + letter.toUpperCase() + " must be a distinct, published form");
    assert.ok(incense.some(e => e.identityKey===row.key && e.access==="paid"));
  }
  assert.equal(new Set(incense.map(e => e.identityKey)).size,8);
  assert.ok(data.encounters.some(e => e.method==="egg" && e.access==="unknown"),
    "ticket-only Incense access must not leak into separate egg encounters");
});

test("unknown entitlement remains unknown unless a source explicitly declares access", () => {
  const data=extract("<h2>Incense Encounters</h2><ul><li>Scizor</li></ul>");
  assert.equal(data.encounters.length,1);
  assert.equal(data.encounters[0].access,"unknown");
  const paid=extract("<h2>Incense Encounters</h2><p>Ticket holders can attract Scizor with Incense.</p><ul><li>Scizor</li></ul>");
  assert.equal(paid.encounters[0].access,"paid");
  const free=extract("<h2>All Trainers Incense Encounters</h2><ul><li>Scizor</li></ul>");
  assert.equal(free.encounters[0].access,"free");
});

test("an explicit source access supersedes an unknown duplicate, but free and paid remain distinct", () => {
  const pokemon=extract("<h2>Incense Encounters</h2><ul><li>Scizor</li></ul>").pokemon;
  const identityKey=pokemon[0].key;
  const pack=access=>({fields:{eventEncounters:{pokemon,encounters:[{identityKey,method:"incense",activityId:"main",access}]}}});
  const merged=mergeEncounters([pack("unknown"),pack("paid")]);
  assert.deepEqual(merged.encounters.map(e=>e.access),["paid"]);
  const conflict=mergeEncounters([pack("unknown"),pack("free"),pack("paid")]);
  assert.equal(conflict.encounters.length,2,"explicit but different source entitlements are not silently merged");
  assert.deepEqual(conflict.encounters.map(e=>e.access).sort(),["free","paid"]);
});
