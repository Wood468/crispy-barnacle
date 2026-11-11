import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rotator = require("../public/event-encounter-rotations.js");
const components = require("../public/event-components.js");
const read = name => JSON.parse(readFileSync(new URL("../public/" + name, import.meta.url), "utf8"));

test("source-backed Incense stays distinct from day-specific wild Mighty, with per-edge icons", () => {
  const source = read("event-details.json").events.wag;
  const doc = read("events-v1.json");
  const model = doc.events.find(e => e.eventId === "wag" || (e.aliases || []).includes("wag"));
  const entry = read("event-encounter-rotations.json").entries.find(e => (e.eventIds || []).includes("wag"));
  assert.ok(model && entry, "canonical event and source-backed rotations required");
  assert.deepEqual(rotator.validate(entry), []);

  const sourceIncense = source.encounters.filter(e => e.method === "incense");
  assert.equal(sourceIncense.length, 16, "10 free Mighty + 4 paid Unown + 2 paid Mighty Latias/Latios");
  const free = sourceIncense.filter(e => e.access === "free");
  assert.equal(free.length, 10);
  assert.equal(entry.mightyIncense.length, 10, "explicit sourced Mighty metadata, not inferred from wild species");
  assert.equal(sourceIncense.filter(e => e.access === "paid").length, 6);
  const marked = new Set(entry.mightyIncense.map(e => [e.identityKey,e.method,e.activityId,e.access].join("|")));
  assert.equal(marked.size, 10);
  for (const edge of free) {
    assert.ok(marked.has([edge.identityKey,edge.method,edge.activityId,edge.access].join("|")),
      "explicit Mighty source edge is required: " + edge.identityKey);
  }
  const actual = model.encounters.filter(e => e.method === "incense");
  const canonical = new Set(actual.map(e => [e.identityKey,e.method,e.access].join("|")));
  for (const e of sourceIncense) {
    assert.ok(canonical.has([e.identityKey,e.method,e.access].join("|")), "missing canonical Incense edge " + e.identityKey);
  }

  const projected = rotator.withoutDuplicateFlatEncounters(model, entry);
  const flat = projected.encounters.filter(e => e.method === "incense");
  const flatKeys = new Set(flat.map(e => e.identityKey));
  assert.equal(flat.length, 14, "different wild vs Incense methods cannot be collapsed");
  for (const edge of free) {
    assert.ok(flatKeys.has(edge.identityKey), "free Incense remains independently visible " + edge.identityKey);
    const kept=flat.find(e => e.identityKey === edge.identityKey);
    assert.equal(kept.mighty,true,"free Incense is explicitly Mighty");
  }
  const unown = ["201:d:none","201:i:none","201:l:none","201:w:none"];
  for (const key of unown) {
    const kept=flat.find(e=>e.identityKey===key);
    assert.ok(kept,"ticket letter preserved "+key);
    assert.notEqual(kept.mighty,true,"ordinary Unown must not gain Mighty !!!");
  }
  for (const key of ["380:base:none","381:base:none"]) {
    assert.ok(!flatKeys.has(key),"paid Incense legend visible in equivalent source-backed Mighty shared group");
  }

  const html = components.gallery(projected, { artFor: p => '<span class="art" aria-label="'+p.name+'"></span>' });
  assert.equal((html.match(/class="ue-incense-corner"/g)||[]).length,14);
  assert.equal((html.match(/class="ue-mighty-corner"/g)||[]).length,10);
  assert.ok(html.includes('data-identity="103:alola:none"'));
  assert.match(html,/aria-label="Mighty Alolan Exeggutor, Incense/);
  assert.doesNotMatch(html,/data-follow|data-track|ue-mon-controls/);

  const grouped = rotator.render(entry,{model,art:()=>'<img class="art" alt="">'});
  assert.equal((grouped.match(/class="uer-mighty-corner"/g)||[]).length,20);
  assert.equal((grouped.match(/class="uer-incense-corner"/g)||[]).length,2,
    "only Latias/Latios group is method=incense; wild day Mighty are wild");
  assert.match(grouped,/aria-label="Mighty Alolan Exeggutor, Wild encounter/);
  assert.doesNotMatch(grouped,/aria-label="Mighty Alolan Exeggutor[^\"]*Incense/);
  assert.match(grouped,/aria-label="Mighty Latias, Incense encounter, Ticket-only/);
});

test("future same-species wild habitat, dated Mighty wild and Mighty Incense remain separate", () => {
  const entry = structuredClone(read("event-encounter-rotations.json").entries[0]);
  entry.habitats[0].pokemon[0]="Sample A";
  entry.mightyDays[0].pokemon[0]="Sample A";
  entry.mightyIncense=[{identityKey:"a:base:none",method:"incense",activityId:"main",access:"free"}];
  assert.deepEqual(rotator.validate(entry),[]);
  const eInc={identityKey:"a:base:none",method:"incense",activityId:"main",access:"free"};
  const eWild={identityKey:"a:base:none",method:"wild",activityId:"main",access:"all"};
  const model={
    pokemon:[{key:"a:base:none",name:"Sample A",speciesId:"1"}],
    encounters:[eWild,eInc],
    groups:{wild:[eWild],incense:[eInc]},
    activities:[], internalValidation:{}
  };
  const grouped=rotator.render(entry,{model,art:()=>''});
  const habitat=grouped.match(/<article class="uer-habitat uer-habitat-steel"[\s\S]*?<\/article>/)?.[0]||"";
  const day=grouped.match(/<article class="uer-mighty-day"[\s\S]*?<\/article>/)?.[0]||"";
  assert.match(habitat,/data-pokemon="Sample A"/);
  assert.doesNotMatch(habitat,/uer-incense-corner|data-incense="true"/);
  assert.match(day,/data-pokemon="Sample A"/);
  assert.match(day,/uer-mighty-corner/);
  assert.doesNotMatch(day,/uer-incense-corner|data-incense="true"/);
  const projected=rotator.withoutDuplicateFlatEncounters(model,entry);
  const flat=projected.encounters.filter(e=>e.method==="incense");
  assert.equal(flat.length,1,"same species still keeps distinct Incense occurrence");
  assert.equal(flat[0].mighty,true);
  const html=components.gallery(projected,{artFor:()=>""});
  assert.equal((html.match(/class="ue-incense-corner"/g)||[]).length,1);
  assert.equal((html.match(/class="ue-mighty-corner"/g)||[]).length,1);
  assert.match(html,/aria-label="Mighty Sample A, Incense/);

  const unrelated={...model,encounters:[{...eInc,activityId:"different-activity"}],
    groups:{incense:[{...eInc,activityId:"different-activity"}],wild:[]}};
  const scoped=rotator.withoutDuplicateFlatEncounters(unrelated,entry);
  assert.notEqual(scoped.groups.incense[0].mighty,true,
    "a separate activity is not the marked Incense occurrence");
});

test("a shared Mighty method does not hide an independently sourced form or access",()=>{
  const entry=structuredClone(read("event-encounter-rotations.json").entries[0]);
  const same={key:"380:other:none",name:"Latias",speciesId:"380",formId:"other"};
  const a={identityKey:"380:base:none",method:"incense",access:"paid",activityId:"main"};
  const b={identityKey:"380:other:none",method:"incense",access:"paid",activityId:"main"};
  const model={pokemon:[{key:"380:base:none",name:"Latias",speciesId:"380"},same],encounters:[a,b],groups:{incense:[a,b]}};
  const projected=rotator.withoutDuplicateFlatEncounters(model,entry);
  assert.equal(projected.encounters.length,2,
    "do not suppress ambiguous form identities solely because display names match");
});
