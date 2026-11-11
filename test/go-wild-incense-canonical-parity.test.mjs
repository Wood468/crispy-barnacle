import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rotator = require("../public/event-encounter-rotations.js");
const components = require("../public/event-components.js");
const read = path => JSON.parse(readFileSync(new URL("../public/" + path, import.meta.url), "utf8"));

/* Do not collapse distinct wild and Incense methods merely because the
   Pokémon species also appears in a verified Mighty day-group roster. */
test("GO Wild's 16 published Incense encounters remain visible as 14 exact flat Incense and 2 matching shared ticket Incense", () => {
  const source = read("event-details.json").events.wag;
  const catalogue = read("events-v1.json");
  const model = catalogue.events.find(event => event.eventId === "wag" || (event.aliases || []).includes("wag"));
  const entry = read("event-encounter-rotations.json").entries.find(event => (event.eventIds || []).includes("wag"));
  assert.ok(model && entry, "the current sourced event and shared rotations must exist");
  const sourceNames = new Map(source.pokemon.map(p => [p.key,p.name]));
  const sourceIncense = source.encounters.filter(e => e.method === "incense");
  assert.equal(sourceIncense.length, 16, "ten Free Mighty, four ticket Unown letters, two ticket Lati@s");
  assert.equal(sourceIncense.filter(e => e.access === "free").length,10);
  assert.equal(sourceIncense.filter(e => e.access === "paid").length,6);
  assert.deepEqual(sourceIncense.filter(e => e.identityKey.startsWith("201:")).map(e => e.identityKey).sort(),
    ["201:d:none","201:i:none","201:l:none","201:w:none"]);

  // Every imported identity/method/access must exist in the published
  // canonical model; a source-only fixture is not enough to prove display.
  const canonical = new Set(model.encounters.map(e => [e.identityKey,e.method,e.access,e.activityId].join("|")));
  for (const e of sourceIncense) {
    assert.ok(sourceNames.has(e.identityKey), "no unbound source species: " + e.identityKey);
    assert.ok(canonical.has([e.identityKey,e.method,e.access,e.activityId].join("|")),
      "canonical model dropped imported Incense method " + e.identityKey);
  }

  const projected = rotator.withoutDuplicateFlatEncounters(model, entry);
  const flat=projected.encounters.filter(e => e.method==="incense");
  const flatKeys=new Set(flat.map(e => [e.identityKey,e.access].join("|")));
  const group=entry.mightyShared.find(x=>x.id==="ticket-incense");
  assert.ok(group && group.method==="incense" && group.access==="ticket");
  assert.deepEqual(group.pokemon.slice().sort(),["Latias","Latios"]);

  for (const e of sourceIncense) {
    const name=sourceNames.get(e.identityKey);
    const representedInSameMethod=(e.access==="paid" && group.pokemon.includes(name));
    assert.equal(flatKeys.has([e.identityKey,e.access].join("|")), !representedInSameMethod,
      name+": independently sourced Free Incense must not disappear into a wild Mighty group");
  }
  assert.equal(flat.length,14,"ten distinct Free Incense plus four ticket-only Unown remain in Incense gallery");
  assert.deepEqual(flat.filter(e=>e.access==="paid").map(e=>e.identityKey).sort(),
    ["201:d:none","201:i:none","201:l:none","201:w:none"]);

  const html=components.gallery(projected, {artFor:p=>'<span class="art" aria-label="'+p.name+'"></span>'});
  assert.match(html,/data-method="incense"/);
  for(const e of flat)assert.ok(html.includes('data-identity="'+e.identityKey+'"'),"missing visible Incense identity "+e.identityKey);
  assert.equal((html.match(/ue-incense-corner/g)||[]).length,14,"each distinct flat Incense method retains its own top-right icon");
  assert.doesNotMatch(html,/data-follow|data-track|ue-mon-controls/);

  // Grouped Mighty sections from #553 represent *wild* day encounters and
  // only two independently sourced *ticket Incense* legends. No re-labelling
  // wild as Incense just to avoid visual repetition of the same species.
  const grouped=rotator.render(entry,{art:()=>'<img class="art" alt="">'});
  assert.equal((grouped.match(/class="uer-mighty-corner"/g)||[]).length,20);
  assert.equal((grouped.match(/class="uer-incense-corner"/g)||[]).length,2);
  assert.match(grouped,/aria-label="Mighty Latias, Incense encounter, Ticket-only"/);
  assert.match(grouped,/aria-label="Mighty Alolan Exeggutor, Wild encounter, All trainers"/);
  assert.doesNotMatch(grouped,/aria-label="Mighty Alolan Exeggutor[^"]*Incense/);
});

test("future same-species wild/Incense methods stay independent, and suppress only a same-method, same-access, main-activity shared edge", () => {
  const entry={
    habitats:[{id:"city",pokemon:["Sample A"]}],
    mightyDays:[{date:"2026-11-14",method:"wild",access:"all",pokemon:["Sample A"]}],
    mightyShared:[{id:"ticket",method:"incense",access:"ticket",pokemon:["Sample B"]}]
  };
  const pokemon=[
    {key:"1:base:none",name:"Sample A",speciesId:"1"},
    {key:"2:base:none",name:"Sample B",speciesId:"2"}
  ];
  const encounters=[
    {identityKey:"1:base:none",method:"wild",activityId:"main",access:"all"},
    {identityKey:"1:base:none",method:"incense",activityId:"main",access:"free"},
    {identityKey:"2:base:none",method:"incense",activityId:"main",access:"paid"},
    {identityKey:"2:base:none",method:"incense",activityId:"separate-hour",access:"paid"},
    {identityKey:"2:base:none",method:"incense",activityId:"main",access:"unknown"},
    {identityKey:"2:base:none",method:"wild",activityId:"main",access:"paid"}
  ];
  const projected=rotator.withoutDuplicateFlatEncounters({pokemon,encounters},entry);
  assert.ok(!projected.encounters.some(e=>e.identityKey==="1:base:none"&&e.method==="wild"),"same sourced wild occurrence is grouped");
  assert.ok(projected.encounters.some(e=>e.identityKey==="1:base:none"&&e.method==="incense"&&e.access==="free"),"same Pokémon's separate Incense method survives");
  assert.ok(!projected.encounters.some(e=>e.identityKey==="2:base:none"&&e.method==="incense"&&e.activityId==="main"&&e.access==="paid"),"equivalent paid shared Incense is represented once");
  assert.ok(projected.encounters.some(e=>e.identityKey==="2:base:none"&&e.method==="incense"&&e.activityId==="separate-hour"),"different activity must survive");
  assert.ok(projected.encounters.some(e=>e.identityKey==="2:base:none"&&e.method==="incense"&&e.access==="unknown"),"unverified access must not be guessed from group");
  assert.ok(projected.encounters.some(e=>e.identityKey==="2:base:none"&&e.method==="wild"&&e.access==="paid"),"other wild entitlement cannot inherit an Incense group");
});
